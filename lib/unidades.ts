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
