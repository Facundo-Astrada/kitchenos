import type { ChecklistSeccionConfig, MisePlaceItem } from '@/types'

// Devuelve true si la sección (o algún descendiente — v1 solo permite 1 nivel,
// pero está escrito recursivo por si se relaja el límite después) tiene
// producciones asignadas, o —si es tipo almacén— productos vinculados. Usado
// para bloquear el borrado: el ON DELETE CASCADE de parent_id borraría ese
// contenido silenciosamente si no se frena antes en la UI.
export function seccionTieneContenido(
  seccion: ChecklistSeccionConfig,
  todasSecciones: ChecklistSeccionConfig[],
  todosItems: MisePlaceItem[],
): boolean {
  const propios = todosItems.some(i => i.seccion_id === seccion.id)
    || (seccion.tipo === 'almacen' && (seccion.producto_ids?.length ?? 0) > 0)
  if (propios) return true
  return todasSecciones
    .filter(s => s.parent_id === seccion.id)
    .some(hijo => seccionTieneContenido(hijo, todasSecciones, todosItems))
}
