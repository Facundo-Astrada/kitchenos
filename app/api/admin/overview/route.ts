import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { esAdminKOS } from '@/lib/admin/allowlist'

/**
 * Dashboard de control del ecosistema (PENDIENTES.md). Único consumidor:
 * app/admin/page.tsx. El gate real es acá, no en la página — un Server
 * Component o un componente cliente se pueden saltear, un `if` antes de
 * `createAdminClient()` no.
 *
 * Filtro por restaurante: todo lo que puede filtrarse viaja desglosado
 * por tenant (`porTenant`); el cliente suma o recorta, no hay segundo
 * round-trip por cada cambio de filtro.
 */

interface RestauranteOverview {
  id: string
  nombre: string
  plan: string | null
  creado: string
  usuarios: number
  ultimaActividad: string | null
  iaCosto30d: number
  iaLlamadas30d: number
}

interface ActividadFuncion {
  funcion: string
  porTenant: Record<string, number>
}

interface DiaIA {
  fecha: string
  porTenant: Record<string, number>
}

interface CommitReciente {
  sha: string
  titulo: string
  cuerpo: string | null
  fecha: string
  url: string
}

// Tablas que se cuentan como "uso" de cada función — solo escrituras (no hay
// registro de lecturas/clicks en ningún lado). Es un proxy de actividad, no
// telemetría de producto: se etiqueta así en la UI para no sobre-prometer.
const TABLAS_FUNCION: { tabla: string; columnaFecha: string; funcion: string }[] = [
  { tabla: 'recetas', columnaFecha: 'created_at', funcion: 'Recetario' },
  { tabla: 'productos', columnaFecha: 'created_at', funcion: 'Stock' },
  { tabla: 'facturas', columnaFecha: 'created_at', funcion: 'Compras' },
  { tabla: 'pedidos', columnaFecha: 'created_at', funcion: 'Pedidos' },
  { tabla: 'carta_items', columnaFecha: 'created_at', funcion: 'Carta' },
  { tabla: 'checklist_registros', columnaFecha: 'fecha', funcion: 'Mise en Place' },
  { tabla: 'tareas', columnaFecha: 'created_at', funcion: 'Tareas / OPS' },
  { tabla: 'ventas', columnaFecha: 'created_at', funcion: 'Ventas' },
  { tabla: 'merma', columnaFecha: 'created_at', funcion: 'Merma' },
  { tabla: 'haccp_temperaturas', columnaFecha: 'created_at', funcion: 'HACCP · Temperaturas' },
  { tabla: 'haccp_limpieza', columnaFecha: 'created_at', funcion: 'HACCP · Limpieza' },
  { tabla: 'bitacora_entradas', columnaFecha: 'created_at', funcion: 'Bitácora' },
]

async function fetchChangelog(): Promise<CommitReciente[]> {
  try {
    // Repo público — sin token. Si algún día se pone privado, esto empieza a
    // devolver 404/401 y el catch de abajo lo degrada a lista vacía en vez de
    // tumbar el resto del dashboard.
    const res = await fetch('https://api.github.com/repos/Facundo-Astrada/kitchenos/commits?sha=main&per_page=15', {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 300 },
    })
    if (!res.ok) return []
    const commits = await res.json() as Array<{
      sha: string
      html_url: string
      commit: { message: string; author: { date: string } }
    }>
    return commits.map(c => {
      const [titulo, ...resto] = c.commit.message.split('\n\n')
      return {
        sha: c.sha.slice(0, 7),
        titulo: titulo.trim(),
        cuerpo: resto.join('\n\n').replace(/Co-Authored-By:.*$/im, '').trim() || null,
        fecha: c.commit.author.date,
        url: c.html_url,
      }
    })
  } catch {
    return []
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !esAdminKOS(user.email)) {
    // 404, no 403: no confirmarle a un usuario cualquiera que la ruta existe.
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const admin = createAdminClient()
  const desde30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const desde14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data: restaurantes, error: errRest } = await admin
    .from('restaurantes')
    .select('id, nombre, plan, created_at')
    .order('created_at', { ascending: true })
  if (errRest) return NextResponse.json({ error: errRest.message }, { status: 500 })

  const [{ data: miembros }, { data: iaUso30d }, actividadPorTabla, changelog] = await Promise.all([
    admin.from('user_restaurantes').select('restaurante_id'),
    admin.from('ia_uso')
      .select('restaurante_id, costo_usd, created_at')
      .gte('created_at', desde30d)
      .limit(20_000),
    Promise.all(TABLAS_FUNCION.map(async ({ tabla, columnaFecha, funcion }) => {
      const { data } = await admin
        .from(tabla)
        .select('restaurante_id')
        .gte(columnaFecha, desde30d)
        .limit(10_000)
      return { funcion, filas: data ?? [] }
    })),
    fetchChangelog(),
  ])

  const usuariosPorTenant = new Map<string, number>()
  for (const m of miembros ?? []) {
    const rid = m.restaurante_id as string
    usuariosPorTenant.set(rid, (usuariosPorTenant.get(rid) ?? 0) + 1)
  }

  const iaPorTenant = new Map<string, { costo: number; llamadas: number }>()
  // día -> tenant -> costo, para que el cliente filtre el sparkline sin pedir de nuevo.
  const iaPorDiaPorTenant = new Map<string, Map<string, number>>()
  for (const fila of iaUso30d ?? []) {
    const rid = (fila.restaurante_id as string | null) ?? '__sin_tenant__'
    const costo = Number(fila.costo_usd) || 0
    const acc = iaPorTenant.get(rid) ?? { costo: 0, llamadas: 0 }
    acc.costo += costo
    acc.llamadas += 1
    iaPorTenant.set(rid, acc)

    if (fila.created_at >= desde14d) {
      const dia = String(fila.created_at).slice(0, 10)
      const porDia = iaPorDiaPorTenant.get(dia) ?? new Map<string, number>()
      porDia.set(rid, (porDia.get(rid) ?? 0) + costo)
      iaPorDiaPorTenant.set(dia, porDia)
    }
  }

  const actividadPorFuncion: ActividadFuncion[] = actividadPorTabla.map(({ funcion, filas }) => {
    const porTenant: Record<string, number> = {}
    for (const fila of filas) {
      const rid = fila.restaurante_id as string | null
      if (!rid) continue
      porTenant[rid] = (porTenant[rid] ?? 0) + 1
    }
    return { funcion, porTenant }
  }).sort((a, b) => {
    const totalA = Object.values(a.porTenant).reduce((s, n) => s + n, 0)
    const totalB = Object.values(b.porTenant).reduce((s, n) => s + n, 0)
    return totalB - totalA
  })

  // Última actividad: LIMIT 1 por tabla y por tenant en vez de traer todas las
  // filas — con Bros en ~3.500 facturas y ~2.000 registros de mise, un select
  // sin límite acá sería el mismo error de fondo que resolvió fetchAllRows,
  // solo que para un dato que no lo necesita (solo importa la más reciente).
  const TABLAS_ACTIVIDAD: { tabla: string; columnaFecha: string }[] = [
    { tabla: 'facturas', columnaFecha: 'created_at' },
    { tabla: 'tareas', columnaFecha: 'created_at' },
    { tabla: 'checklist_registros', columnaFecha: 'fecha' },
    { tabla: 'ventas', columnaFecha: 'created_at' },
  ]

  const restaurantesOut: RestauranteOverview[] = await Promise.all(
    (restaurantes ?? []).map(async (r) => {
      const fechas = await Promise.all(
        TABLAS_ACTIVIDAD.map(async ({ tabla, columnaFecha }) => {
          const { data } = await admin
            .from(tabla)
            .select(columnaFecha)
            .eq('restaurante_id', r.id)
            .order(columnaFecha, { ascending: false })
            .limit(1)
            .maybeSingle()
          return (data as Record<string, string> | null)?.[columnaFecha] ?? null
        })
      )
      const ultimaActividad = fechas.filter(Boolean).sort().at(-1) ?? null
      const ia = iaPorTenant.get(r.id) ?? { costo: 0, llamadas: 0 }

      return {
        id: r.id,
        nombre: r.nombre,
        plan: r.plan as string | null,
        creado: r.created_at,
        usuarios: usuariosPorTenant.get(r.id) ?? 0,
        ultimaActividad,
        iaCosto30d: ia.costo,
        iaLlamadas30d: ia.llamadas,
      }
    })
  )

  const serieDiariaIA: DiaIA[] = Array.from(iaPorDiaPorTenant.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, porTenant]) => ({ fecha, porTenant: Object.fromEntries(porTenant) }))

  return NextResponse.json({
    restaurantes: restaurantesOut,
    serieDiariaIA,
    actividadPorFuncion,
    changelog,
  })
}
