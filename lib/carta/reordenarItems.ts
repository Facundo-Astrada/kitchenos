// Reordenar/migrar ítems de sección en el editor de composición (Carta →
// Plato/Menú/Evento) — extraído de ComposicionEditor.tsx para poder probar
// la mecánica del drag (a qué posición/sección termina un ítem) sin un
// browser real. El drag en sí (pointer events, ghost flotante, resaltado,
// auto-scroll) sigue viviendo en el componente; esto es solo el cálculo.
export interface ItemConSeccion {
  _uid: number
  _seccion: string
}

/**
 * Ubica `draggedUid` en la posición de `targetUid` — si `targetUid`
 * pertenece a otra sección, `draggedUid` migra a esa sección (arrastrar de
 * "Entradas" a "Principales", etc). No muta `items`; devuelve la MISMA
 * referencia si no hay nada que mover (uid inválido o ya está ahí).
 */
export function moverItemSobreItem<T extends ItemConSeccion>(items: T[], draggedUid: number, targetUid: number): T[] {
  if (draggedUid === targetUid) return items
  const from = items.findIndex(it => it._uid === draggedUid)
  const to = items.findIndex(it => it._uid === targetUid)
  if (from === -1 || to === -1 || from === to) return items
  const target = items[to]
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, { ...moved, _seccion: target._seccion })
  return next
}

/**
 * Manda `draggedUid` al final del array, migrado a `seccionDestino` — para
 * soltar sobre una sección vacía o su área en blanco (sin un ítem puntual
 * debajo del cursor). No muta `items`.
 */
export function moverItemASeccion<T extends ItemConSeccion>(items: T[], draggedUid: number, seccionDestino: string): T[] {
  const from = items.findIndex(it => it._uid === draggedUid)
  if (from === -1) return items
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.push({ ...moved, _seccion: seccionDestino })
  return next
}
