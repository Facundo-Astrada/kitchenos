// Drag-to-reorder del Mise (app/(app)/checklist/ClientView.tsx) — la parte
// geométrica/de cálculo, separada del componente para poder probarla sin un
// browser real y para no seguir engordando ese archivo (tiene techo de
// líneas, ver lib/ingenieria/ratchets.test.ts).
//
// La grilla de varias columnas en desktop (`.mise-items-grid`, solo con
// `pointer:fine` — ver globals.css) necesita hit-test 2D (X e Y); la columna
// única de mobile/tablet solo necesita Y. Mismo criterio en las tres
// funciones de abajo, parametrizado por `grid`.

export interface RectLike {
  left: number
  right: number
  top: number
  bottom: number
}

/** ¿En qué sección cae el punto? Última coincidencia gana, igual que recorrer
 * los refs en orden — no debería solaparse ninguna, pero por si acaso. */
export function hitTestSeccion(x: number, y: number, secciones: { id: string; rect: RectLike }[], grid: boolean): string | null {
  let found: string | null = null
  for (const { id, rect } of secciones) {
    const dentro = grid
      ? x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
      : y >= rect.top && y <= rect.bottom
    if (dentro) found = id
  }
  return found
}

export interface HitTestItemResult {
  itemId: string
  insertAfter: boolean
}

/** Ítem más cercano dentro de la sección sobrevolada — decide dónde se
 * inserta al soltar (antes o después de ese ítem). */
export function hitTestItem(x: number, y: number, items: { id: string; rect: RectLike }[], grid: boolean): HitTestItemResult | null {
  let closestDist = Infinity
  let result: HitTestItemResult | null = null
  for (const { id, rect } of items) {
    if (grid) {
      // Distancia euclídea al centro — con columnas lado a lado, la
      // distancia vertical sola no dice cuál es "el más cercano".
      const cx = (rect.left + rect.right) / 2
      const cy = (rect.top + rect.bottom) / 2
      const dist = Math.hypot(x - cx, y - cy)
      if (dist < closestDist) {
        closestDist = dist
        const mismaFila = y >= rect.top && y <= rect.bottom
        result = { itemId: id, insertAfter: mismaFila ? x > cx : y > cy }
      }
    } else {
      const mid = (rect.top + rect.bottom) / 2
      const dist = Math.abs(y - mid)
      if (dist < closestDist) { closestDist = dist; result = { itemId: id, insertAfter: y > mid } }
    }
  }
  return result
}

export interface ReordenUpdate {
  id: string
  orden: number
  seccion_id?: string
}

export interface ItemConOrden {
  id: string
  orden: number | null
  seccion_id?: string | null
}

/**
 * Qué filas cambian al soltar `dragged` en `overSecId`, en la posición de
 * `overItemId` (antes/después según `insertAfter`, al final si no hay
 * `overItemId`). Devuelve SOLO las que efectivamente cambian `orden` o
 * `seccion_id` — no reescribe toda la sección en cada drag. El `orden`
 * ACTUAL de `dragged` (el de su sección de origen, que puede ser otra)
 * importa: sin él, no hay con qué comparar para saber si de verdad cambió.
 */
export function calcularReordenSeccion(
  itemsDestino: ItemConOrden[],
  dragged: ItemConOrden,
  overSecId: string,
  overItemId: string | null,
  insertAfter: boolean,
): ReordenUpdate[] {
  const targetItems = itemsDestino.filter(i => i.id !== dragged.id)
  let insertIdx = targetItems.length
  if (overItemId) {
    const idx = targetItems.findIndex(i => i.id === overItemId)
    if (idx !== -1) insertIdx = insertAfter ? idx + 1 : idx
  }
  targetItems.splice(insertIdx, 0, dragged)
  const updates: ReordenUpdate[] = []
  targetItems.forEach((it, idx) => {
    const needsSecUpdate = it.id === dragged.id && it.seccion_id !== overSecId
    if ((it.orden ?? 0) !== idx || needsSecUpdate) {
      updates.push({ id: it.id, orden: idx, ...(needsSecUpdate ? { seccion_id: overSecId } : {}) })
    }
  })
  return updates
}
