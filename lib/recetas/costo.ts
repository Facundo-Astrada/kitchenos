/**
 * Cálculo del costo de una receta. Lógica de dominio pura, sin React.
 *
 * Vivía dentro de `lib/hooks/useRecetas.ts`, que es `'use client'`. Mientras
 * solo la llamaban pantallas no molestaba, pero al usarla desde una API route
 * (`/api/coach`, ficha técnica) Next resuelve ese módulo como referencia de
 * cliente y la llamada explota en runtime — el build pasa igual, así que el
 * error aparece recién en producción. Misma mudanza que ya se le hizo a
 * `canonUnit`/`unitConversionFactor` hacia `lib/unidades.ts`.
 *
 * `useRecetas.ts` la re-exporta, así que los imports existentes siguen andando.
 */
import type { Ingrediente, FoodCostCalc } from '@/types'
import { unitConversionFactor } from '@/lib/unidades'

export function calcFoodCost(ingredientes: Ingrediente[], porciones: number, precioVenta: number): FoodCostCalc {
  // `cantidad` es la cantidad bruta (lo que se compra). El costo = bruta × precio.
  // merma_pct no se re-aplica acá porque ya está incorporado en la cantidad bruta ingresada.
  // unitConversionFactor corrige cuando unidad del ingrediente ≠ unidad del precio (ej: g vs kg).
  const costo_total = ingredientes.reduce((sum, i) => {
    const factor = unitConversionFactor(i.unidad ?? '', i.unidad_costo ?? i.unidad ?? '')
    return sum + i.cantidad * factor * (i.costo_unitario ?? 0)
  }, 0)
  const costo_porcion = porciones > 0 ? costo_total / porciones : 0
  const food_cost_pct = precioVenta > 0 ? (costo_porcion / precioVenta) * 100 : 0
  const margen_bruto = precioVenta - costo_porcion
  return { costo_total, costo_porcion, food_cost_pct, margen_bruto }
}
