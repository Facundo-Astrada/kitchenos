import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { avanceSemanal, type FotoProgreso } from '@/lib/implantacion/reconocimiento'
import {
  puedeReconocer, textoReconocimiento, TIPO_RECONOCIMIENTO,
} from '@/lib/implantacion/avisos'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * El reconocimiento semanal de la ruta de implantación, corriendo solo.
 *
 * `lib/implantacion/avisos.ts` tenía las reglas escritas y testeadas desde el
 * 07/09 pero sin nada que las disparara: el recordatorio sale a mano desde
 * `/implantacion` (y así está bien — el disparo humano es deliberado), pero el
 * reconocimiento semanal, por definición, no puede depender de que alguien se
 * acuerde de apretar un botón cada lunes.
 *
 * ── MODO SECO ──────────────────────────────────────────────────────────────
 * Sin `AVISOS_ACTIVOS=1` en el entorno, esta ruta calcula todo y NO escribe una
 * sola notificación: devuelve exactamente lo que mandaría. Es a propósito.
 * Prender un canal que le escribe a todo el equipo de todos los restaurantes es
 * una decisión de producto, y se toma mirando una corrida seca real —  no
 * asumiendo que el diff está bien a la primera.
 *
 * Para prenderlo: `AVISOS_ACTIVOS=1` en Vercel. Para probar a mano:
 *   curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/avisos
 */

interface Resultado {
  restauranteId: string
  nombre: string
  estado: 'enviado' | 'seco' | 'sin-avance' | 'sin-fotos' | 'ya-reconocido-esta-semana'
  detalle: string
  destinatarios?: number
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const seco = process.env.AVISOS_ACTIVOS !== '1'
  const admin = createAdminClient()
  const ahora = new Date()
  const resultados: Resultado[] = []

  const { data: restaurantes, error: errRest } = await admin
    .from('restaurantes')
    .select('id, nombre')

  if (errRest) {
    return NextResponse.json({ error: errRest.message }, { status: 500 })
  }

  for (const r of restaurantes ?? []) {
    const base = { restauranteId: r.id as string, nombre: (r.nombre as string) ?? '(sin nombre)' }

    // Las fotos que dejó el cliente al abrir /implantacion o el dashboard.
    // 40 alcanza para encontrar una referencia de hace una semana incluso si
    // el equipo abre la app salteado.
    const { data: fotos } = await admin
      .from('implantacion_progreso')
      .select('fecha, insertadas, total, pct')
      .eq('restaurante_id', r.id)
      .order('fecha', { ascending: false })
      .limit(40)

    const avance = avanceSemanal((fotos ?? []) as FotoProgreso[], ahora)
    if (!avance) {
      resultados.push({ ...base, estado: 'sin-fotos', detalle: 'Todavía no hay dos fotos separadas por una semana.' })
      continue
    }

    const texto = textoReconocimiento(avance.insertadasEstaSemana, avance.pct)
    if (!texto) {
      resultados.push({
        ...base, estado: 'sin-avance',
        detalle: `Sin estaciones nuevas desde ${avance.desde.fecha}. No se inventa un elogio.`,
      })
      continue
    }

    // Cadencia: uno por semana por restaurante, chequeado contra lo ya enviado
    // en DB y no contra un flag local (DECISIONES.md § 25).
    const { data: ultimo } = await admin
      .from('notificaciones')
      .select('created_at')
      .eq('restaurante_id', r.id)
      .eq('tipo', TIPO_RECONOCIMIENTO)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!puedeReconocer(ultimo?.created_at as string | undefined, ahora)) {
      resultados.push({ ...base, estado: 'ya-reconocido-esta-semana', detalle: 'Ya salió uno en los últimos 7 días.' })
      continue
    }

    // Va al equipo entero y sin nombres — los rankings entre personas se dan
    // vuelta justo en trabajo colaborativo y obligatorio (ver avisos.ts).
    const { data: miembros } = await admin
      .from('equipo_miembros')
      .select('auth_user_id')
      .eq('restaurante_id', r.id)
      .eq('activo', true)
      .not('auth_user_id', 'is', null)

    const destinatarios = (miembros ?? []).map(m => m.auth_user_id as string)
    if (destinatarios.length === 0) {
      resultados.push({ ...base, estado: 'sin-avance', detalle: 'Nadie del equipo tiene acceso a la app todavía.' })
      continue
    }

    if (seco) {
      resultados.push({
        ...base, estado: 'seco', destinatarios: destinatarios.length,
        detalle: `MANDARÍA: "${texto.titulo}" — ${texto.cuerpo}`,
      })
      continue
    }

    const { error: errIns } = await admin.from('notificaciones').insert(
      destinatarios.map(uid => ({
        restaurante_id: r.id,
        usuario_id: uid,
        tipo: TIPO_RECONOCIMIENTO,
        titulo: texto.titulo,
        cuerpo: texto.cuerpo,
        link: texto.link,
      })),
    )

    resultados.push({
      ...base,
      estado: errIns ? 'sin-avance' : 'enviado',
      destinatarios: destinatarios.length,
      detalle: errIns ? `Falló el insert: ${errIns.message}` : `"${texto.titulo}"`,
    })
  }

  return NextResponse.json({
    ok: true,
    modo: seco ? 'seco (AVISOS_ACTIVOS no está en 1 — no se escribió nada)' : 'activo',
    corridoEn: ahora.toISOString(),
    restaurantes: resultados.length,
    resultados,
  })
}
