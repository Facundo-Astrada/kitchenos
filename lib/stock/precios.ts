// Lógica de precios/matching compartida entre useFacturas.ts (cliente) y
// /api/stock/sync-precios-facturas (servidor) — funciones puras, sin 'use client'.

export function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// El nombre del producto aparece como secuencia de PALABRAS COMPLETAS dentro del
// ítem de factura (más descriptivo). Evita falsos positivos tipo "Lino" matcheando
// dentro de "Cacao alcalino". Pasar ambos lados ya en minúsculas (y sin tildes si
// corresponde) — esta función no normaliza, solo compara.
export function matchesWholeWord(haystackLower: string, needleLower: string): boolean {
  const re = new RegExp(`(^|\\s)${escapeRegex(needleLower)}(\\s|$)`)
  return re.test(haystackLower)
}

// Normaliza unidad+cantidad+precio de un ítem de factura a la unidad métrica base
// (kg o l) — usado tanto para sumar al stock como para comparar contra el precio
// vigente del producto. Si la unidad no es convertible (no métrica, sin peso_kg),
// devuelve cantidad/precio sin tocar y la unidad tal cual vino.
export function normalizeForStock(item: { cantidad: number; unidad: string; precio_unitario: number; peso_kg?: number }): {
  cantidad_stock: number; unidad_stock: string; precio_stock: number
} {
  const u = item.unidad.toLowerCase().trim()
  if (['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(u))
    return { cantidad_stock: item.cantidad, unidad_stock: 'kg', precio_stock: item.precio_unitario }
  if (['g', 'gr', 'gramo', 'gramos'].includes(u))
    return { cantidad_stock: item.cantidad / 1000, unidad_stock: 'kg', precio_stock: item.precio_unitario * 1000 }
  if (['mg'].includes(u))
    return { cantidad_stock: item.cantidad / 1000000, unidad_stock: 'kg', precio_stock: item.precio_unitario * 1000000 }
  if (['l', 'lt', 'lts', 'litro', 'litros'].includes(u))
    return { cantidad_stock: item.cantidad, unidad_stock: 'l', precio_stock: item.precio_unitario }
  if (['ml', 'cc', 'cm3'].includes(u))
    return { cantidad_stock: item.cantidad / 1000, unidad_stock: 'l', precio_stock: item.precio_unitario * 1000 }
  // Unidad no métrica con equivalencia en peso → siempre normaliza a kg
  if (item.peso_kg && item.peso_kg > 0)
    return { cantidad_stock: item.cantidad * item.peso_kg, unidad_stock: 'kg', precio_stock: item.precio_unitario / item.peso_kg }
  // Sin conversión disponible — se deja tal cual (el caller decide si matchea con la unidad del producto)
  return { cantidad_stock: item.cantidad, unidad_stock: item.unidad, precio_stock: item.precio_unitario }
}
