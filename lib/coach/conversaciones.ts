// Memoria persistida del Kitchen Coach (tabla coach_conversaciones, RLS por
// restaurante+usuario) — reemplaza el viejo lib/coach/history.ts, que vivía
// solo en localStorage y no cruzaba de dispositivo (celular↔escritorio).
//
// Una fila = una conversación. `activa` es la que el usuario está escribiendo
// ahora (a lo sumo una por usuario+restaurante, forzado por un índice único
// parcial en la migración); el resto es historial archivado, mismo concepto
// que antes separaba kc_active_<rid> de kc_convos_<rid>.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CoachMessage } from '@/lib/hooks/useKitchenCoach'
import type { CoachLink } from '@/lib/coach/types'

interface SerMsg { id: string; role: 'user' | 'assistant'; content: string; timestamp: string; options?: string[]; links?: CoachLink[] }

export interface ConvoRow {
  id: string
  titulo: string
  updatedAt: string
  activa: boolean
  messages: SerMsg[]
}

const MAX_ARCHIVADAS = 20

function serializar(messages: CoachMessage[]): SerMsg[] {
  return messages.filter(m => m.content !== '').map(m => ({
    id: m.id, role: m.role, content: m.content, timestamp: m.timestamp.toISOString(), options: m.options, links: m.links,
  }))
}

function tituloDe(messages: CoachMessage[]): string {
  const primerUsuario = messages.find(m => m.role === 'user' && m.content.trim())
  const base = primerUsuario?.content.trim() ?? 'Conversación'
  return base.length > 60 ? base.slice(0, 60) + '…' : base
}

function filaAConvo(d: { id: string; titulo: string; mensajes: unknown; updated_at: string; activa?: boolean }): ConvoRow {
  return {
    id: d.id,
    titulo: d.titulo,
    updatedAt: d.updated_at,
    activa: d.activa ?? false,
    messages: Array.isArray(d.mensajes) ? (d.mensajes as SerMsg[]) : [],
  }
}

export function toMessages(convo: ConvoRow): CoachMessage[] {
  return convo.messages.map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: new Date(m.timestamp), options: m.options, links: m.links }))
}

/**
 * La conversación activa del usuario en este restaurante — la crea si todavía
 * no existe ninguna. Si dos pestañas/dispositivos la crean a la vez, el
 * índice único parcial rechaza la segunda inserción (23505): en vez de
 * fallar, se relee la que ganó la carrera.
 */
export async function fetchOActivaConvo(
  supabase: SupabaseClient, restauranteId: string, usuarioId: string,
): Promise<ConvoRow> {
  const { data } = await supabase.from('coach_conversaciones')
    .select('id, titulo, mensajes, updated_at')
    .eq('restaurante_id', restauranteId).eq('usuario_id', usuarioId).eq('activa', true)
    .maybeSingle()
  if (data) return filaAConvo({ ...data, activa: true })

  const { data: nueva, error } = await supabase.from('coach_conversaciones')
    .insert({ restaurante_id: restauranteId, usuario_id: usuarioId, titulo: 'Conversación', mensajes: [], activa: true })
    .select('id, titulo, mensajes, updated_at')
    .single()
  if (error) {
    if (error.code === '23505') return fetchOActivaConvo(supabase, restauranteId, usuarioId)
    throw new Error(error.message)
  }
  if (!nueva) throw new Error('No se pudo iniciar la conversación')
  return filaAConvo({ ...nueva, activa: true })
}

/** Guarda el contenido de la conversación activa — se llama al terminar cada respuesta, no en cada token. */
export async function guardarActiva(supabase: SupabaseClient, convoId: string, messages: CoachMessage[]): Promise<void> {
  await supabase.from('coach_conversaciones').update({
    mensajes: serializar(messages), titulo: tituloDe(messages), updated_at: new Date().toISOString(),
  }).eq('id', convoId)
}

export async function listArchivadas(
  supabase: SupabaseClient, restauranteId: string, usuarioId: string,
): Promise<ConvoRow[]> {
  const { data, error } = await supabase.from('coach_conversaciones')
    .select('id, titulo, mensajes, updated_at')
    .eq('restaurante_id', restauranteId).eq('usuario_id', usuarioId).eq('activa', false)
    .order('updated_at', { ascending: false })
    .limit(MAX_ARCHIVADAS)
  if (error) { console.error('[coach/conversaciones] listArchivadas:', error.message); return [] }
  return (data ?? []).map(d => filaAConvo({ ...d, activa: false }))
}

/** Archiva la conversación actual (o la borra si quedó vacía — "ignora las vacías" del historial viejo). */
async function cerrarActiva(supabase: SupabaseClient, convoId: string, messages: CoachMessage[]): Promise<void> {
  const utiles = serializar(messages)
  if (utiles.length === 0) {
    await supabase.from('coach_conversaciones').delete().eq('id', convoId)
    return
  }
  await supabase.from('coach_conversaciones').update({
    activa: false, mensajes: utiles, titulo: tituloDe(messages), updated_at: new Date().toISOString(),
  }).eq('id', convoId)
}

/** "Nueva conversación": archiva la actual y abre una en blanco. */
export async function archivarYCrearNueva(
  supabase: SupabaseClient, restauranteId: string, usuarioId: string, convoActualId: string, messagesActuales: CoachMessage[],
): Promise<ConvoRow> {
  await cerrarActiva(supabase, convoActualId, messagesActuales)
  return fetchOActivaConvo(supabase, restauranteId, usuarioId)
}

/** Abre un chat del historial: archiva el actual (no se pierde) y esa pasa a ser la activa. */
export async function archivarYAbrir(
  supabase: SupabaseClient, convoActualId: string, messagesActuales: CoachMessage[], elegidaId: string,
): Promise<void> {
  await cerrarActiva(supabase, convoActualId, messagesActuales)
  await supabase.from('coach_conversaciones').update({ activa: true }).eq('id', elegidaId)
}

export async function eliminarConversacion(supabase: SupabaseClient, id: string): Promise<void> {
  await supabase.from('coach_conversaciones').delete().eq('id', id)
}
