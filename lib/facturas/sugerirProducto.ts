// Sugerencia de producto de stock para una línea de factura que no matcheó exacto.
//
// matchProducto() (matching.ts) solo acepta "el ítem contiene el nombre del
// producto, palabra por palabra". Se le escapan las variantes de todos los días:
// plurales ("Mandarinas" / Mandarina), ñ y grafías ("Champignon" / Champiñon,
// "Cibulette" / Ciboulette), orden distinto ("Harina Campodónico 0000" / Harina
// 0000 Campodonico) y ruido de factura ("PEPINOS EL KG.", "AJOS GRANDE").
//
// Puntaje 0..1+ :
//   - todas las palabras del producto están en el ítem → 0.75 + 0.25 × (parte del ítem cubierta)
//   - todas las del ítem están en el producto (ítem más corto) → 0.6 + 0.2 × (parte del producto cubierta)
//   - si no, coincidencia parcial baja
// "Seguro" (se vincula sin preguntar) = puntaje ≥ 0.95 y sin otro candidato cerca:
// el producto completo y casi todo el ítem coinciden. "Jugo de pomelo exprimido"
// → Pomelo queda en 0.8: se sugiere, no se aplica solo.

const RUIDO = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'x', 'c', 'u', 'un', 'una', 'y', 'en', 'por', 'p',
  'kg', 'kgs', 'k', 'g', 'gr', 'grs', 'gramos', 'l', 'lt', 'lts', 'litro', 'litros', 'ml', 'cc', 'cm', 'mm', 'm',
  'unid', 'unidad', 'unidades', 'uni', 'un.', 'cu', 'c/u',
  'paquete', 'paq', 'bandeja', 'bolsa', 'caja', 'cajon', 'pack', 'atado', 'frasco', 'botella', 'bidon', 'bidones',
  'grande', 'grandes', 'chico', 'chica', 'chicos', 'chicas', 'mediano', 'mediana', 'medianos', 'medianas',
  'dto', 'aprox', 'fresco', 'fresca', 'frescos', 'frescas',
])

export function normAlias(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function raiz(t: string): string {
  let r = t
  if (r.length > 3 && r.endsWith('s')) r = r.slice(0, -1)
  // Género (hidropónico/a) solo en palabras largas: en cortas confunde productos (mango/manga).
  if (r.length > 6 && /[aoe]$/.test(r)) r = r.slice(0, -1)
  return r
}

export function tokens(s: string): string[] {
  const out: string[] = []
  for (const t of normAlias(s).split(' ')) {
    if (!t || RUIDO.has(t)) continue
    if (/^\d/.test(t)) {
      // "000"/"0000" distinguen harinas; el resto de los números son pesos, medidas, cantidades.
      if (/^0{3,4}$/.test(t)) out.push(t)
      continue
    }
    if (t.length < 2) continue
    out.push(raiz(t))
  }
  return Array.from(new Set(out))
}

function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

function parecidos(a: string, b: string): boolean {
  if (a === b) return true
  // Errores de tipeo solo en palabras largas: en cortas una letra cambia el producto (lechuga/pechuga).
  const min = Math.min(a.length, b.length)
  if (min < 7) return false
  return distancia(a, b) <= (min >= 9 ? 2 : 1)
}

export function puntaje(nombreItem: string, nombreProducto: string): number {
  const I = tokens(nombreItem)
  const P = tokens(nombreProducto)
  // Nombres hechos solo de "ruido" ("Bolsas 45 x 60"): sin palabras que comparar,
  // vale la igualdad del nombre completo.
  if (I.length === 0 || P.length === 0) return normAlias(nombreItem) === normAlias(nombreProducto) ? 1 : 0
  const pEnI = P.filter(p => I.some(i => parecidos(i, p))).length
  const iEnP = I.filter(i => P.some(p => parecidos(i, p))).length
  if (pEnI === 0) return 0
  const bonus = 0.01 * pEnI
  if (pEnI === P.length) return 0.75 + 0.25 * (iEnP / I.length) + bonus
  if (iEnP === I.length) return 0.6 + 0.2 * (pEnI / P.length) + bonus
  return 0.5 * (pEnI / P.length) * (iEnP / I.length) + bonus
}

export interface Sugerencia<T> { producto: T; puntaje: number }

export function sugerirProductos<T extends { nombre: string }>(nombreItem: string, productos: T[], max = 5): Sugerencia<T>[] {
  return productos
    .map(p => ({ producto: p, puntaje: puntaje(nombreItem, p.nombre) }))
    .filter(s => s.puntaje >= 0.3)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, max)
}

/** El único candidato que se puede vincular sin preguntar, o null. */
export function sugerenciaSegura<T extends { nombre: string }>(nombreItem: string, productos: T[]): T | null {
  const [a, b] = sugerirProductos(nombreItem, productos, 2)
  if (!a || a.puntaje < 0.95) return null
  if (b && a.puntaje - b.puntaje < 0.05) return null
  return a.producto
}
