import type { SupabaseClient } from '@supabase/supabase-js'
import type { TurnoServicio } from '@/types'
import { turnoActivo, encodeTurnoFase } from './turnos'

// Refleja el estado de una tarea de producción en el registro del mise que la originó.
// Vínculo por FK (tareas.checklist_item_id), no por título. Reemplaza el viejo
// syncMiseCompletado que hacía ilike por nombre, marcaba siempre 'apertura' e ignoraba la plaza.
// La fase (apertura/cierre) se determina por la hora local: antes de las 16h =
// apertura, si no cierre. El turno de servicio (almuerzo/cena/...) se resuelve
// con turnoActivo() sobre los turnos configurados del restaurante — mismo
// criterio que usa el mise (checklist/ClientView.tsx) para no escribir bajo
// una key distinta a la que la UI está leyendo.
export async function syncMiseDesdeTarea(
  supabase: SupabaseClient,
  checklistItemId: string,
  fecha: string,
  completado: boolean,
  turnosServicio: TurnoServicio[],
): Promise<void> {
  const fase = new Date().getHours() < 16 ? 'apertura' : 'cierre'
  const activo = turnoActivo(new Date(), turnosServicio)
  const turno = activo ? encodeTurnoFase(activo.id, fase) : fase
  await supabase.from('checklist_registros').upsert(
    { checklist_item_id: checklistItemId, fecha, turno, completado },
    { onConflict: 'checklist_item_id,fecha,turno' },
  )
}
