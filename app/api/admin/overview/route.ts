import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { esAdminKOS } from '@/lib/admin/allowlist'

/**
 * Dashboard de control del ecosistema (PENDIENTES.md). Único consumidor:
 * app/admin/page.tsx. El gate real es acá, no en la página — un Server
 * Component o un componente cliente se pueden saltear, un `if` antes de
 * `createAdminClient()` no.
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

  const [{ data: miembros }, { data: iaUso30d }] = await Promise.all([
    admin.from('user_restaurantes').select('restaurante_id'),
    admin.from('ia_uso')
      .select('restaurante_id, tag, costo_usd, created_at')
      .gte('created_at', desde30d)
      .limit(20_000),
  ])

  const usuariosPorTenant = new Map<string, number>()
  for (const m of miembros ?? []) {
    const rid = m.restaurante_id as string
    usuariosPorTenant.set(rid, (usuariosPorTenant.get(rid) ?? 0) + 1)
  }

  const iaPorTenant = new Map<string, { costo: number; llamadas: number }>()
  const iaPorDia = new Map<string, number>() // 'YYYY-MM-DD' -> costo, para el sparkline
  for (const fila of iaUso30d ?? []) {
    const rid = fila.restaurante_id as string | null
    const costo = Number(fila.costo_usd) || 0
    if (rid) {
      const acc = iaPorTenant.get(rid) ?? { costo: 0, llamadas: 0 }
      acc.costo += costo
      acc.llamadas += 1
      iaPorTenant.set(rid, acc)
    }
    const dia = String(fila.created_at).slice(0, 10)
    if (fila.created_at >= desde14d) iaPorDia.set(dia, (iaPorDia.get(dia) ?? 0) + costo)
  }

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

  const serieDiariaIA = Array.from(iaPorDia.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, costo]) => ({ fecha, costo }))

  return NextResponse.json({
    restaurantes: restaurantesOut,
    iaCostoTotal30d: restaurantesOut.reduce((acc, r) => acc + r.iaCosto30d, 0),
    serieDiariaIA,
  })
}
