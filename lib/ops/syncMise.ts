import type { SupabaseClient } from '@supabase/supabase-js'
import type { TurnoServicio } from '@/types'
import { turnoVigente, encodeTurnoFase, horaEnTz } from './turnos'

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
  ctx?: { plaza?: string | null; entregados?: ReadonlySet<string> },
): Promise<void> {
  // horaEnTz y no getHours(): getHours() es la hora del proceso, que en el
  // server es UTC — a las 22:00 ART daría 01:00 y escribiría 'apertura'.
  const fase = horaEnTz(new Date()) < 16 ? 'apertura' : 'cierre'
  const vigente = turnoVigente({ turnos: turnosServicio, plaza: ctx?.plaza, entregados: ctx?.entregados })
  const turno = vigente ? encodeTurnoFase(vigente.turnoId, fase) : fase
  await supabase.from('checklist_registros').upsert(
    { checklist_item_id: checklistItemId, fecha, turno, completado },
    { onConflict: 'checklist_item_id,fecha,turno' },
  )
}
