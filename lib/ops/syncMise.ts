import type { SupabaseClient } from '@supabase/supabase-js'
import type { TurnoServicio } from '@/types'
import { turnoVigente, encodeTurnoFase, horaEnTz } from './turnos'
import { emitMiseRegistroPatch } from './miseBus'

/** Lo mínimo que necesita `tareasAfectadasPorTilde` — no la `Tarea` entera. */
export interface TareaSincronizable {
  id: string
  checklist_item_id?: string | null
  turno_fecha?: string | null
  estado?: string | null
}

/**
 * El camino inverso de `syncMiseDesdeTarea`: qué tareas hay que mover cuando se
 * tilda (o destilda) un ítem en el mise.
 *
 * El filtro estaba inline en `checklist/ClientView.tsx` y exigía
 * `turno_fecha === hoy`. Eso dejaba afuera justo el caso que importa: el
 * `pase_turno` que hereda el turno anterior puede tener otra `turno_fecha` (o
 * quedar viejo si nadie lo cerró), así que el cocinero tildaba el ítem, la
 * tarea seguía abierta, y el mise lo seguía mostrando en "Te dejaron en
 * producción". Caso real, Bros, 23 ago 2026: "aceite de ajo" con el registro
 * en `completado=true` y la tarea en `pendiente`.
 *
 * Asimétrico a propósito:
 *  - al TILDAR se cierra todo lo que ya vencía (sin fecha o `turno_fecha <= hoy`).
 *    No se tocan las tareas futuras: una preparación agendada para mañana no la
 *    cierra el tilde de hoy.
 *  - al DESTILDAR se reabre solo lo de hoy. Reabrir tareas viejas ya cerradas
 *    resucitaría historia que nadie pidió resucitar.
 */
export function tareasAfectadasPorTilde<T extends TareaSincronizable>(
  tareas: readonly T[],
  itemId: string,
  hoy: string,
  completado: boolean,
): T[] {
  return tareas.filter(t => {
    if (t.checklist_item_id !== itemId) return false
    if (completado) {
      if (t.estado === 'listo') return false
      return t.turno_fecha == null || t.turno_fecha <= hoy
    }
    // Destildar: solo lo de hoy que esté cerrado — el resto ya está como debe.
    return t.estado === 'listo' && t.turno_fecha === hoy
  })
}

// Refleja el estado de una tarea de producción en el registro del mise que la originó.
// Vínculo por FK (tareas.checklist_item_id), no por título. Reemplaza el viejo
// syncMiseCompletado que hacía ilike por nombre, marcaba siempre 'apertura' e ignoraba la plaza.
// La fase (apertura/cierre) se determina por la hora de pared: antes de las 16h =
// apertura, si no cierre. El turno de servicio (almuerzo/cena/...) se resuelve
// con turnoVigente() sobre los turnos configurados del restaurante — mismo
// criterio que usa el mise (checklist/ClientView.tsx) para no escribir bajo
// una key distinta a la que la UI está leyendo. Por eso `ctx`: sin la plaza y
// las entregas, esta función resolvería por reloj mientras el mise ya pasó al
// turno siguiente, y el tilde se guardaría donde nadie lo está mirando.
export async function syncMiseDesdeTarea(
  supabase: SupabaseClient,
  checklistItemId: string,
  fecha: string,
  completado: boolean,
  turnosServicio: TurnoServicio[],
  ctx?: { plaza?: string | null; entregados?: ReadonlySet<string>; usuarioId?: string | null },
): Promise<void> {
  // horaEnTz y no getHours(): getHours() es la hora del proceso, que en el
  // server es UTC — a las 22:00 ART daría 01:00 y escribiría 'apertura'.
  const fase = horaEnTz(new Date()) < 16 ? 'apertura' : 'cierre'
  const vigente = turnoVigente({ turnos: turnosServicio, plaza: ctx?.plaza, entregados: ctx?.entregados })
  const turno = vigente ? encodeTurnoFase(vigente.turnoId, fase) : fase

  // Optimista, igual que el tilde del propio mise (ver useChecklist.upsertRegistro):
  // el mise se repinta en el mismo frame del tap y la escritura viaja después.
  // Sin esto el cambio tardaba en aparecer lo que tardara el próximo fetchAll.
  const patch = { itemId: checklistItemId, fecha, turno, completado }
  emitMiseRegistroPatch(patch)

  // usuario_id: "quién hizo la última acción sobre este registro" — mismo
  // significado que el upsert manual del propio mise (ClientView.tsx
  // handleMiseUpsert), no "quién lo completó": se manda tal cual venga, tanto
  // al tildar como al destildar. Sin esto, completar una tarea desde
  // Producción dejaba el registro del mise sin autor.
  const { error } = await supabase.from('checklist_registros').upsert(
    { checklist_item_id: checklistItemId, fecha, turno, completado, usuario_id: ctx?.usuarioId ?? null },
    { onConflict: 'checklist_item_id,fecha,turno' },
  )
  if (error) {
    // Rollback aproximado: revierte el toggle. No restaura "no había registro"
    // (para eso haría falta leer el estado previo, otro round-trip en el camino
    // crítico); el próximo fetchAll trae la verdad del servidor igual.
    emitMiseRegistroPatch({ ...patch, completado: !completado })
    console.error('[syncMiseDesdeTarea] upsert Error:', error.message)
  }
}
