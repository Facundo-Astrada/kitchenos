// Puente en memoria entre Producción y el Mise, dentro de la misma pestaña.
//
// El sync tarea↔mise es bidireccional pero las dos direcciones NO eran igual de
// rápidas, y la culpa es de dónde vive cada dato:
//
// - `tareas` viven en una key SWR compartida (`tareas-<rid>`), así que tildar un
//   ítem en el mise se ve en Producción en el mismo frame: las dos pantallas
//   leen la misma cache.
// - `registros` (lo que el mise muestra) viven en un `useState` DENTRO de cada
//   instancia de useChecklist, sin cache compartida y sin realtime sobre
//   `checklist_registros` (el canal del hook solo cubre secciones/items/rutina).
//   Así, marcar una tarea como hecha en Producción escribía en la DB y el mise
//   no se enteraba hasta que algo volviera a llamar a fetchAll.
//
// Y en OPS las tabs no se desmontan (`display:none`, ver operaciones/page.tsx),
// así que volver al mise tampoco refetcheaba: el cambio aparecía recién cuando
// algún otro efecto disparaba una recarga. Eso era el "tarda varios segundos".
//
// Esto NO reemplaza a realtime: resuelve la misma pestaña, que es el caso del
// cocinero que marca en Producción y mira el mise. Otro dispositivo (la tablet
// de cocina) sigue dependiendo de su propio refetch.

export interface MiseRegistroPatch {
  itemId: string
  fecha: string
  turno: string
  completado?: boolean
  cantidad_actual?: number | null
}

type Listener = (patch: MiseRegistroPatch) => void

const listeners = new Set<Listener>()

/** Devuelve la función para desuscribirse — pensado para el cleanup de un useEffect. */
export function onMiseRegistroPatch(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function emitMiseRegistroPatch(patch: MiseRegistroPatch): void {
  for (const fn of listeners) {
    // Un listener que explota no puede dejar sin avisar a los demás: puede
    // haber varias instancias del mise montadas a la vez (OPS + /checklist).
    try { fn(patch) } catch (e) { console.error('[miseBus] listener Error:', e) }
  }
}
