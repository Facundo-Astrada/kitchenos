// Peso y costeo por gramo — fuente única, sin 'use client' (la consumen hooks
// de cliente y la lógica de costeo de Carta por igual). Antes vivía privada
// dentro de recetario/[id]/page.tsx (toGramos/calcPesoPorcion/calcPesoNetos/
// formatPeso/smartQty) — sesión 2026-09-04 (devolución "no hay gramaje en
// Carta") la saca a lib compartida para que useRecetas.ts y useCarta.ts
// puedan derivar costoPorGramo sin duplicar la conversión de unidades.

import { canonUnit } from '@/lib/unidades'

export interface IngredientePeso {
  cantidad: number
  unidad: string
  merma_pct?: number | null
}

// Convierte una cantidad+unidad a gramos. Unidades sueltas (u, docena, caja)
// no suman peso → 0 (se excluyen del peso total, no se inventa una densidad).
export function toGramos(cantidad: number, unidad: string): number {
  // canonUnit: antes "gr", "kgs", "cc" o "litros" pesaban 0.
  const u = canonUnit(unidad)
  if (u === 'kg') return cantidad * 1000
  if (u === 'g') return cantidad
  if (u === 'l') return cantidad * 1000 // 1L ≈ 1kg
  if (u === 'ml') return cantidad
  return 0
}

export function calcPesoPorcion(ingredientes: IngredientePeso[], porciones: number): number | null {
  if (!porciones || porciones <= 0) return null
  const netoG = ingredientes.reduce((s, i) => {
    const bruto = toGramos(i.cantidad, i.unidad)
    return s + bruto * (1 - (i.merma_pct ?? 0) / 100)
  }, 0)
  if (netoG <= 0) return null
  return Math.round(netoG / porciones)
}

export function calcPesoNetos(ingredientes: IngredientePeso[]): { brutoG: number; netoG: number; hasMerma: boolean } {
  let brutoG = 0
  let netoG = 0
  for (const i of ingredientes) {
    const g = toGramos(i.cantidad, i.unidad)
    brutoG += g
    netoG += g * (1 - (i.merma_pct ?? 0) / 100)
  }
  return { brutoG, netoG, hasMerma: brutoG > 0 && Math.abs(brutoG - netoG) > 0.01 }
}

export function formatPeso(gramos: number): string {
  if (gramos >= 1000) return `${(gramos / 1000).toFixed(gramos % 1000 === 0 ? 0 : 1)}kg/u`
  return `${gramos}g/u`
}

// Muestra una cantidad tal como está cargada, en SU unidad: nunca cambia
// kg↔g ni l↔ml por su cuenta (auditoría 08/10/2026 — antes smartQty pasaba
// 0,05 kg a "50 g" y 1500 g a "1,5 kg" sin que nadie lo pidiera). Coma
// decimal, hasta 3 decimales, sin ceros de cola.
export function formatCantidad(qty: number): string {
  if (!isFinite(qty)) return '0'
  const r = Math.round(qty * 1000) / 1000
  return r.toLocaleString('es-AR', { maximumFractionDigits: 3, useGrouping: false })
}

// Peso total de una receta, en gramos — preferí el dato pesado a mano, del
// más al menos preciso: peso_escurrido_g (neto, post-cocción, descontando lo
// que se evapora/derrite/se escurre — lo más parecido a lo que realmente
// termina en el plato) > peso_total_g (bruto tal como sale de la olla) >
// suma cruda de ingredientes (estimación, ni pesa la merma de cocción). null
// = ninguna de las tres fuentes alcanza.
export function pesoTotalRecetaG(receta: { peso_total_g?: number | null; peso_escurrido_g?: number | null; ingredientes?: IngredientePeso[] }): number | null {
  if (receta.peso_escurrido_g != null && receta.peso_escurrido_g > 0) return receta.peso_escurrido_g
  if (receta.peso_total_g != null && receta.peso_total_g > 0) return receta.peso_total_g
  const ings = receta.ingredientes ?? []
  if (ings.length === 0) return null
  const { netoG } = calcPesoNetos(ings)
  return netoG > 0 ? netoG : null
}

// Costo por gramo de una receta — costoTotal (el del batch completo) ÷ su
// peso total (ver pesoTotalRecetaG). Es lo que permite costear un plato por
// el gramaje real de un componente en vez de asumir "una porción entera"
// (ver plato_recetas.gramaje), y usarla como subreceta-ingrediente de OTRA
// receta con la misma precisión en vez de su costo_porcion.
export function costoPorGramoDeReceta(receta: { peso_total_g?: number | null; peso_escurrido_g?: number | null; ingredientes?: IngredientePeso[] }, costoTotal: number): number | null {
  const pesoG = pesoTotalRecetaG(receta)
  return pesoG && pesoG > 0 ? costoTotal / pesoG : null
}

// Deriva gramaje (siempre normalizado a gramos) desde un par cantidad_ops/
// unidad_ops YA cargado en unidad de peso o volumen — la convención que
// CartaBoardCard.tsx ya documentaba ("sin recipiente, cantidad_ops es el
// gramaje directo"). Con otra unidad (pax/porc/u/bandeja) no hay gramaje
// derivable: esas cantidades son demanda al mise, no peso de plato — null.
export function gramajeDesdeCantidadOps(cantidad: number | null, unidad: string | null): { gramaje: number | null; gramaje_unidad: string | null } {
  const u = (unidad ?? '').toLowerCase().trim()
  if (cantidad == null || !['g', 'kg', 'ml', 'l'].includes(u)) return { gramaje: null, gramaje_unidad: null }
  const gramaje = u === 'kg' || u === 'l' ? cantidad * 1000 : cantidad
  return { gramaje, gramaje_unidad: 'g' }
}
