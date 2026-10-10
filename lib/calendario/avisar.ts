// "Avisar al equipo" de un evento del Calendario — server-side, un solo
// punto de entrada para la pantalla (vía /api/calendario/avisar) y para el
// Coach (agendar_eventos). Deja el aviso en la campana de cada destinatario
// (notificaciones) y manda push a quien tenga el celular suscripto.
//
// Reglas (PLAN-ASISTENTE §2b — cada interrupción se gana su lugar):
// - Solo si quien lo carga lo pidió (eventos.avisar no NULL).
// - Una vez por evento (avisado_at): no en cada edición ni al deshacer.
// - Nunca un privado, nunca a quien lo cargó.

import type { SupabaseClient } from '@supabase/supabase-js'
import { enviarPush } from '@/lib/push/enviar'
import { fechaLarga, describirRepeticion } from './fechas'
import { destinatarios, type DestinoAviso, type MiembroAviso } from './aviso-destino'

export type { DestinoAviso }

interface EventoAviso {
  id: string
  titulo: string
  fecha_inicio: string
  fecha_fin: string | null
  hora_inicio: string
  hora_fin: string
  recurrente: boolean
  frecuencia: string | null
  privado: boolean
  avisar: DestinoAviso | null
  avisado_at: string | null
}

/** Título y cuerpo del aviso: qué, cuándo y quién lo cargó. */
export function textoAviso(ev: Omit<EventoAviso, 'id' | 'privado' | 'avisar' | 'avisado_at'>, autor: string | null) {
  const todoElDia = ev.hora_inicio.startsWith('00:00') && ev.hora_fin.startsWith('23:59')
  const varios = !ev.recurrente && ev.fecha_fin && ev.fecha_fin > ev.fecha_inicio
  let cuando = varios
    ? `Del ${fechaLarga(ev.fecha_inicio).toLowerCase()} al ${fechaLarga(ev.fecha_fin!).toLowerCase()}`
    : fechaLarga(ev.fecha_inicio)
  if (!todoElDia && !varios) cuando += ` · ${ev.hora_inicio.slice(0, 5)}`
  if (ev.recurrente) cuando += ` · ${describirRepeticion(ev.fecha_inicio, ev.frecuencia).toLowerCase()}`
  return {
    titulo: `Nuevo en el calendario: ${ev.titulo}`,
    cuerpo: autor ? `${cuando} — lo cargó ${autor}` : cuando,
  }
}

/**
 * Avisa el evento a su destino. `sb` = cliente con la sesión del autor (lee el
 * evento con su RLS, escribe las notificaciones); `admin` = solo para el push
 * (leer suscripciones de otros). Best-effort hacia afuera: nunca tira.
 */
export async function avisarEvento(
  sb: SupabaseClient,
  admin: SupabaseClient,
  restauranteId: string,
  autorId: string,
  eventoId: string,
): Promise<{ avisados: number; push: number; motivo?: string }> {
  try {
    const { data: ev } = await sb.from('eventos')
      .select('id, titulo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, recurrente, frecuencia, privado, avisar, avisado_at')
      .eq('id', eventoId).eq('restaurante_id', restauranteId).maybeSingle()
    const e = ev as EventoAviso | null
    if (!e) return { avisados: 0, push: 0, motivo: 'evento no encontrado' }
    if (!e.avisar) return { avisados: 0, push: 0, motivo: 'sin aviso pedido' }
    if (e.privado) return { avisados: 0, push: 0, motivo: 'privado' }
    if (e.avisado_at) return { avisados: 0, push: 0, motivo: 'ya avisado' }

    const { data: miembros } = await sb.from('equipo_miembros')
      .select('auth_user_id, nombre, apellido, puesto_id, activo')
      .eq('restaurante_id', restauranteId)
      .not('auth_user_id', 'is', null)
    type Fila = { auth_user_id: string; nombre: string | null; apellido: string | null; puesto_id: string | null; activo: boolean | null }
    const equipo: MiembroAviso[] = ((miembros ?? []) as Fila[])
      .filter(m => m.activo !== false)
      .map(m => ({ auth_user_id: m.auth_user_id, nombre: [m.nombre, m.apellido].filter(Boolean).join(' '), puesto_id: m.puesto_id }))
    const autor = equipo.find(m => m.auth_user_id === autorId)?.nombre || null
    const para = destinatarios(e.avisar, equipo, autorId)

    // Se marca antes de mandar: si dos pestañas confirman a la vez, la segunda
    // ve avisado_at y no duplica.
    const { data: marcado } = await sb.from('eventos')
      .update({ avisado_at: new Date().toISOString() })
      .eq('id', e.id).is('avisado_at', null)
      .select('id')
    if (!marcado || marcado.length === 0) return { avisados: 0, push: 0, motivo: 'ya avisado' }
    if (para.length === 0) return { avisados: 0, push: 0, motivo: 'nadie en ese destino' }

    const { titulo, cuerpo } = textoAviso(e, autor)
    const link = `/calendario?fecha=${e.fecha_inicio}`
    const { error } = await sb.from('notificaciones').insert(para.map(usuario_id => ({
      restaurante_id: restauranteId, usuario_id, tipo: 'evento_calendario', titulo, cuerpo, link,
    })))
    if (error) console.error('[avisarEvento] notificaciones:', error.message)

    const res = await Promise.all(para.map(uid =>
      enviarPush(admin, restauranteId, uid, { tipo: 'evento_calendario', titulo, cuerpo, link })))
    const push = res.filter(r => r.enviados > 0).length
    return { avisados: error ? 0 : para.length, push }
  } catch (err) {
    console.error('[avisarEvento] Error (no bloqueante):', err)
    return { avisados: 0, push: 0, motivo: 'error' }
  }
}
