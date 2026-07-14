import type { SupabaseClient } from '@supabase/supabase-js'

// Refleja el estado de una tarea de producción en el registro del mise que la originó.
// Vínculo por FK (tareas.checklist_item_id), no por título. Reemplaza el viejo
// syncMiseCompletado que hacía ilike por nombre, marcaba siempre 'apertura' e ignoraba la plaza.
// El turno se determina por la hora local: antes de las 16h = apertura, si no cierre.
export async function syncMiseDesdeTarea(
  supabase: SupabaseClient,
  checklistItemId: string,
  fecha: string,
  completado: boolean,
): Promise<void> {
  const turno = new Date().getHours() < 16 ? 'apertura' : 'cierre'
  await supabase.from('checklist_registros').upsert(
    { checklist_item_id: checklistItemId, fecha, turno, completado },
    { onConflict: 'checklist_item_id,fecha,turno' },
  )
}
