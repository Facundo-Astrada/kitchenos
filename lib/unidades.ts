// Conversión de unidades — fuente única, sin 'use client' (lo consume tanto
// el cliente como el servidor). Antes vivía triplicada: lib/hooks/useRecetas.ts
// (arrastraba 'use client' al bundle del servidor) + copia server en
// lib/reportes/consumoTeorico.ts. Día 10 de plan-consolidado.md §2 — la
// función se muda acá, los dos lados la importan (useRecetas la re-exporta
// para no tocar sus consumidores).

// Normaliza variantes de unidad a una forma canónica: g | kg | ml | l | u
// Datos reales traen 'gr', 'lt', 'lts', 'cc', 'L', 'unidad', etc.
export function canonUnit(unit: string): 'g' | 'kg' | 'ml' | 'l' | 'u' | string {
  const x = (unit || '').toLowerCase().trim()
  if (x === 'g' || x === 'gr' || x === 'grs' || x === 'gramo' || x === 'gramos') return 'g'
  if (x === 'kg' || x === 'kgs' || x === 'kilo' || x === 'kilos' || x === 'k') return 'kg'
  if (x === 'ml' || x === 'cc' || x === 'mililitro' || x === 'mililitros') return 'ml'
  if (x === 'l' || x === 'lt' || x === 'lts' || x === 'litro' || x === 'litros') return 'l'
  if (x === 'u' || x === 'un' || x === 'unidad' || x === 'unidades') return 'u'
  return x
}

// Factor de conversión para cuando unidad del ingrediente ≠ unidad del costo.
// Ej: cantidad en 'g', precio en 'kg' → factor = 0.001 (g a kg)
// Para masa↔volumen se asume densidad ≈ 1 (1 g ≈ 1 ml), aproximación estándar de cocina:
// permite costear ingredientes cargados en 'g' con precio por 'l' (ej: vinagre, aceite) sin
// inflar el costo ×1000. No es exacto para todos los líquidos pero evita números absurdos.
export function unitConversionFactor(fromUnit: string, toUnit: string): number {
  const u = canonUnit(fromUnit)
  const c = canonUnit(toUnit)
  if (!u || !c || u === c) return 1
  // gramos/mililitros (chico) → kilos/litros (grande): /1000
  const small = (x: string) => x === 'g' || x === 'ml'
  const big = (x: string) => x === 'kg' || x === 'l'
  if (small(u) && big(c)) return 0.001
  if (big(u) && small(c)) return 1000
  // mismo orden de magnitud, distinta dimensión (g↔ml, kg↔l): densidad ≈ 1
  if ((u === 'g' && c === 'ml') || (u === 'ml' && c === 'g')) return 1
  if ((u === 'kg' && c === 'l') || (u === 'l' && c === 'kg')) return 1
  // Incompatibles: cantidad por unidades (u) contra precio por peso/volumen — o viceversa.
  // No hay conversión posible sin el peso por unidad. Multiplicar produce números
  // absurdos (ej: 4 hojas de laurel × $18.595/kg = $74.380). Devolvemos 0 para excluir
  // la línea del costo en lugar de inflarlo. Estas filas son datos a corregir a mano.
  const isCount = (x: string) => x === 'u'
  const isMeasure = (x: string) => x === 'g' || x === 'kg' || x === 'ml' || x === 'l'
  if ((isCount(u) && isMeasure(c)) || (isMeasure(u) && isCount(c))) return 0
  return 1
}

// Lee un número tal como se tipea en Argentina. La coma es decimal ("0,5").
// El punto es decimal si está solo ("1.5", lo que manda el teclado numérico
// del celular) y separador de miles si aparece junto a una coma ("1.500,5")
// o repetido ("1.500.000"). Antes `parseFloat(s.replace(',', '.'))` leía
// "1.500,5" como 1,5. Vacío o inválido → 0.
export function parseNumero(s: string | number | null | undefined): number {
  if (s === null || s === undefined) return 0
  if (typeof s === 'number') return isNaN(s) ? 0 : s
  let x = String(s).trim().replace(/\s/g, '')
  if (!x) return 0
  const puntos = (x.match(/\./g) ?? []).length
  if (x.includes(',') || puntos > 1) x = x.replace(/\./g, '')
  x = x.replace(',', '.')
  const n = parseFloat(x)
  return isNaN(n) ? 0 : n
}

// Igual que parseNumero pero para plata: "12.500" es doce mil quinientos (un
// punto seguido de exactamente 3 dígitos se lee como miles). Una cantidad
// "1.500" en cambio sigue siendo 1,5 (parseNumero) — ahí el punto lo pone el
// teclado del celular como decimal.
export function parsePrecio(s: string | number | null | undefined): number {
  if (typeof s === 'string' && /^\s*[1-9]\d{0,2}\.\d{3}\s*$/.test(s)) return parseNumero(s.replace('.', ''))
  return parseNumero(s)
}
