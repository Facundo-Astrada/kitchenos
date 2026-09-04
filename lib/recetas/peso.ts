// Peso y costeo por gramo — fuente única, sin 'use client' (la consumen hooks
// de cliente y la lógica de costeo de Carta por igual). Antes vivía privada
// dentro de recetario/[id]/page.tsx (toGramos/calcPesoPorcion/calcPesoNetos/
// formatPeso/smartQty) — sesión 2026-09-04 (devolución "no hay gramaje en
// Carta") la saca a lib compartida para que useRecetas.ts y useCarta.ts
// puedan derivar costoPorGramo sin duplicar la conversión de unidades.

export interface IngredientePeso {
  cantidad: number
  unidad: string
  merma_pct?: number | null
}

// Convierte una cantidad+unidad a gramos. Unidades sueltas (u, docena, caja)
// no suman peso → 0 (se excluyen del peso total, no se inventa una densidad).
export function toGramos(cantidad: number, unidad: string): number {
  const u = (unidad || '').toLowerCase().trim()
  if (u === 'kg') return cantidad * 1000
  if (u === 'g') return cantidad
  if (u === 'l' || u === 'lt' || u === 'lts') return cantidad * 1000 // 1L ≈ 1kg
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

// Smart display: siempre muestra la unidad más legible independiente de cómo está guardado.
// 0.005 kg → 5g | 1500 g → 1.5kg | 0.05 l → 50ml | 2000 ml → 2l
export function smartQty(qty: number, unit: string): { qty: string; unit: string } {
  const u = (unit || '').toLowerCase().trim()
  if ((u === 'kg' || u === 'kgs' || u === 'kilo') && qty < 0.1 && qty > 0) {
    const g = qty * 1000
    return { qty: g % 1 === 0 ? String(g) : g.toFixed(1), unit: 'g' }
  }
  if (u === 'g' && qty >= 1000) {
    const kg = qty / 1000
    return { qty: kg % 1 === 0 ? String(kg) : kg.toFixed(2).replace(/\.?0+$/, ''), unit: 'kg' }
  }
  if ((u === 'l' || u === 'lt' || u === 'lts') && qty < 0.1 && qty > 0) {
    const ml = qty * 1000
    return { qty: ml % 1 === 0 ? String(ml) : ml.toFixed(1), unit: 'ml' }
  }
  if (u === 'ml' && qty >= 1000) {
    const l = qty / 1000
    return { qty: l % 1 === 0 ? String(l) : l.toFixed(2).replace(/\.?0+$/, ''), unit: 'l' }
  }
  // Default: format removing trailing zeros
  const fmtQty = qty % 1 === 0 ? String(qty) : qty.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  return { qty: fmtQty, unit }
}

// Peso total (bruto) de una receta, en gramos — preferí el dato cargado a
// mano (peso_total_g, el que se pesa al terminar de cocinar) porque es el
// real; sin eso, se deriva de la suma de ingredientes (lo que ya se usa para
// mostrar "Peso/porción" en el recetario). null = ninguna de las dos fuentes
// alcanza (ni peso cargado, ni ingredientes con unidad de peso/volumen).
export function pesoTotalRecetaG(receta: { peso_total_g?: number | null; ingredientes?: IngredientePeso[] }): number | null {
  if (receta.peso_total_g != null && receta.peso_total_g > 0) return receta.peso_total_g
  const ings = receta.ingredientes ?? []
  if (ings.length === 0) return null
  const { netoG } = calcPesoNetos(ings)
  return netoG > 0 ? netoG : null
}

// Costo por gramo de una receta — costoTotal (el del batch completo) ÷ su
// peso total. Es lo que permite costear un plato por el gramaje real de un
// componente en vez de asumir "una porción entera" (ver plato_recetas.gramaje).
export function costoPorGramoDeReceta(receta: { peso_total_g?: number | null; ingredientes?: IngredientePeso[] }, costoTotal: number): number | null {
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
