// Traversal compartido: ventas_items (por nombre de plato) → carta_items →
// receta directa o plato_recetas (compuesto) → ingredientes → productos.
// Antes vivía duplicado con matching por nombre que podía divergir entre
// ventas/page.tsx (food cost teórico) y carta/page.tsx (RentabilidadView,
// ingeniería de menú). PLAN-4-CAPAS B5 lo extrajo acá y sumó la resolución a
// nivel de producto que usa lib/reportes/fuga.ts.
//
// Sin 'use client' a propósito: lib/reportes/fuga.ts lo importa desde una API
// route (server-only). canonUnit/unitConversionFactor viven en lib/unidades.ts
// (día 10 de plan-consolidado.md §2 — antes triplicadas acá y en useRecetas.ts).

export function normalizarNombrePlato(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

export interface VentaItemLike { nombre_plato: string; cantidad: number }
export interface CartaItemLike { id: string; nombre: string }

/**
 * Lookup nombre normalizado → carta_item id. Es el paso que vivía duplicado
 * (con normalización propia) en ventas/page.tsx y carta/page.tsx — mismo
 * criterio de matching exacto que usa lib/produccion/sugerencia.ts contra
 * recetas.
 */
export function buildCartaItemLookup(cartaItems: CartaItemLike[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const ci of cartaItems) {
    const key = normalizarNombrePlato(ci.nombre)
    if (!map.has(key)) map.set(key, ci.id)
  }
  return map
}

/** Ventas agrupadas por carta_item, sumando cantidad. */
export function matchVentasPorCartaItem(
  ventasItems: VentaItemLike[],
  cartaItems: CartaItemLike[],
): Map<string, number> {
  const lookup = buildCartaItemLookup(cartaItems)
  const out = new Map<string, number>()
  for (const it of ventasItems) {
    const id = lookup.get(normalizarNombrePlato(it.nombre_plato))
    if (!id) continue
    out.set(id, (out.get(id) ?? 0) + it.cantidad)
  }
  return out
}

export interface IngredienteLike {
  receta_id: string
  producto_id: string | null
  cantidad: number
  unidad: string
}
export interface RecetaLike { id: string; porciones: number }
export interface PlatoRecetaLike { plato_id: string; receta_id: string; porciones: number }
export interface ContribucionProducto { producto_id: string; cantidad: number; unidad: string }

/**
 * Gramaje por producto para 1 unidad vendida de un carta_item — recorre la
 * receta directa (carta_items.receta_id) o los plato_recetas (compuesto, con
 * el multiplicador `porciones` de cada sub-receta). Ingredientes tipo
 * subreceta (sin producto_id) no se resuelven — hay ficha, pero no llega a un
 * producto de stock; quedan afuera silenciosamente (`contribuciones` vacío es
 * la señal para el consumidor).
 */
export function gramajePorUnidad(
  cartaItemId: string,
  cartaItemRecetaId: string | null,
  platoRecetasDelPlato: PlatoRecetaLike[],
  recetasPorId: Map<string, RecetaLike>,
  ingredientesPorReceta: Map<string, IngredienteLike[]>,
): { contribuciones: ContribucionProducto[] } {
  const contribuciones: ContribucionProducto[] = []

  const acumular = (recetaId: string, multiplicador: number) => {
    const receta = recetasPorId.get(recetaId)
    if (!receta || !(receta.porciones > 0)) return
    const ingredientes = ingredientesPorReceta.get(recetaId) ?? []
    for (const ing of ingredientes) {
      if (!ing.producto_id) continue
      const cantidadPorUnidad = (ing.cantidad / receta.porciones) * multiplicador
      contribuciones.push({ producto_id: ing.producto_id, cantidad: cantidadPorUnidad, unidad: ing.unidad })
    }
  }

  if (platoRecetasDelPlato.length > 0) {
    for (const pr of platoRecetasDelPlato) acumular(pr.receta_id, pr.porciones)
  } else if (cartaItemRecetaId) {
    acumular(cartaItemRecetaId, 1)
  }

  return { contribuciones }
}
