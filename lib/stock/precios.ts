import { canonUnit, unitConversionFactor } from '@/lib/unidades'

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

// Factor para pasar 1 unidad `desde` a la unidad `hacia` del producto,
// usando el peso por unidad del producto cuando una de las dos es conteo
// ('u') y la otra peso/volumen. 0 = no convertible.
export function factorHaciaProducto(desde: string, hacia: string, pesoPorUnidadG?: number | null): number {
  const d = canonUnit(desde)
  const h = canonUnit(hacia)
  if (d === h) return 1
  // Unidades que no son g/kg/ml/l/u ('caja', 'docena', 'pack'): solo valen si
  // son la misma — unitConversionFactor devolvería 1 y mezclaría precios.
  const conocidas = ['g', 'kg', 'ml', 'l', 'u']
  if (!conocidas.includes(d) || !conocidas.includes(h)) return 0
  const f = unitConversionFactor(d, h)
  if (f !== 0) return f
  if (!pesoPorUnidadG || pesoPorUnidadG <= 0) return 0
  // 1 u = peso g → a la unidad del producto
  if (d === 'u') return pesoPorUnidadG * unitConversionFactor('g', h)
  // 1 g/kg/ml/l → unidades
  if (h === 'u') return unitConversionFactor(d, 'g') / pesoPorUnidadG
  return 0
}

// Lleva un ítem de factura (o de lista de precios) a la unidad en que el
// producto YA está cargado en Stock. Nunca cambia la unidad del producto
// (auditoría 08/10/2026: antes la factura la pisaba — un producto en g
// pasaba a kg y la cantidad se sumaba sin convertir: 5000 g + 2 kg = "5002
// kg"). null = la unidad de la factura no se puede llevar a la del producto
// (ej. factura en 'u' contra producto en kg sin peso por unidad): el que
// llama no toca ni stock ni precio de ese producto.
export function aUnidadDelProducto(
  item: { cantidad: number; unidad: string; precio_unitario: number; peso_kg?: number },
  producto: { unidad: string; peso_por_unidad_g?: number | null; unidad_compra?: string | null; cantidad_por_envase?: number | null },
): { cantidad: number; precio: number } | null {
  // Envase: el producto se compra por "pack de 12" y se usa por unidad. Una
  // línea de factura en pack trae 12 unidades y su precio se reparte entre
  // ellas (antes cantidad_por_envase se guardaba y nadie lo leía).
  const cpe = producto.cantidad_por_envase ?? 0
  if (cpe > 0 && producto.unidad_compra && mismoEnvase(item.unidad, producto.unidad_compra)) {
    return { cantidad: item.cantidad * cpe, precio: item.precio_unitario / cpe }
  }
  const n = normalizeForStock(item)
  const f = factorHaciaProducto(n.unidad_stock, producto.unidad, producto.peso_por_unidad_g)
  if (!f) return null
  return { cantidad: n.cantidad_stock * f, precio: n.precio_stock / f }
}

// Abreviaturas de envase que traen las facturas ("PAQ", "CJ", "Bolsas").
const SINONIMOS_ENVASE: Record<string, string> = {
  paq: 'pack', paquete: 'pack', pak: 'pack', pck: 'pack',
  cj: 'caja', cja: 'caja',
  bol: 'bolsa', bsa: 'bolsa',
  bot: 'botella', bt: 'botella',
  lt: 'lata',
  fdo: 'fardo',
  doc: 'docena', dna: 'docena',
  bid: 'bidon',
}

export function canonEnvase(u: string): string {
  let x = sinTildes(u).toLowerCase().trim().replace(/\.$/, '')
  if (x.length > 3 && x.endsWith('es')) x = x.slice(0, -2)
  else if (x.length > 3 && x.endsWith('s')) x = x.slice(0, -1)
  return SINONIMOS_ENVASE[x] ?? x
}

/** La unidad de la factura es el envase de compra del producto ("PAQ" = "pack"). */
export function mismoEnvase(unidadFactura: string, unidadCompra: string): boolean {
  const a = canonEnvase(unidadFactura)
  return !!a && a === canonEnvase(unidadCompra)
}
