// ── Clasificación de ingeniería de menú (método Kasavana-Smith) ──
// Extraído de RentabilidadView (carta/page.tsx) para poder testearlo sin
// montar el componente. Antes clasificaba con dos promedios simples de
// popularidad y margen — eso hace que la mitad de la carta "gane" el
// promedio de popularidad casi por definición, sin importar cuán sesgada
// esté la distribución de ventas. El método real usa un umbral fijo (70%
// del mix ideal) para popularidad y un promedio PONDERADO por unidades
// vendidas para rentabilidad.

import { normalizarNombrePlato, buildCartaItemLookup, type CartaItemLike } from '@/lib/reportes/consumoTeorico'

export interface EntradaIngenieria<T> {
  item: T
  pop: number
  margin: number
}

export interface ResultadoIngenieria<T> {
  conVentas: boolean
  hayDatos: boolean
  estrella: EntradaIngenieria<T>[]
  caballo: EntradaIngenieria<T>[]
  puzzle: EntradaIngenieria<T>[]
  perro: EntradaIngenieria<T>[]
}

/**
 * Sin ventas cargadas (`totalVendido === 0`) no hay con qué medir popularidad
 * real: `ph` queda en `false` para todos y la clasificación se reduce a
 * `margin` contra el promedio simple (fallback, evita dividir por cero en el
 * promedio ponderado). Así conviven Puzzle/Perro sin depender de ventas —
 * el banner de `!conVentas` en pantalla ya avisa que es "solo por rentabilidad".
 */
export function clasificarIngenieriaMenu<T>(base: EntradaIngenieria<T>[]): ResultadoIngenieria<T> {
  const conVentas = base.some(x => x.pop > 0)
  const N = base.length
  const totalVendido = base.reduce((s, x) => s + x.pop, 0)

  // Popularidad: umbral fijo, no promedio — el 70% es del método, no arbitrario
  const mixIdeal = N > 0 ? 100 / N : 0
  const indicePopularidad = mixIdeal * 0.7

  // Rentabilidad: promedio ponderado por unidades vendidas
  const gbTotal = base.reduce((s, x) => s + x.margin * x.pop, 0)
  const gbPromedio = totalVendido > 0
    ? gbTotal / totalVendido
    : (N > 0 ? base.reduce((s, x) => s + x.margin, 0) / N : 0) // fallback sin ventas

  const estrella: EntradaIngenieria<T>[] = []
  const caballo: EntradaIngenieria<T>[] = []
  const puzzle: EntradaIngenieria<T>[] = []
  const perro: EntradaIngenieria<T>[] = []
  for (const x of base) {
    const mixReal = totalVendido > 0 ? (x.pop / totalVendido) * 100 : 0
    const ph = totalVendido > 0 ? mixReal >= indicePopularidad : false
    const mh = x.margin >= gbPromedio
    if (ph && mh) estrella.push(x)
    else if (ph && !mh) caballo.push(x)
    else if (!ph && mh) puzzle.push(x)
    else perro.push(x)
  }
  return { conVentas, hayDatos: N > 0, estrella, caballo, puzzle, perro }
}

// ── Helpers para pintar el cuadrante en una lista (PLAN-SUPERFICIE S3.2) ──
// Antes solo vivían inline en RentabilidadView. El método necesita el
// conjunto completo de la carta para las medias/umbral — no se puede
// clasificar un plato aislado — así que el caller arma el mapa una vez
// (con los mismos items+ventas que ya tiene cargados) y lo consulta por id.

export type Quadrante = 'estrella' | 'caballo' | 'puzzle' | 'perro'

// Metadata de cada cuadrante — antes vivía inline en RentabilidadView, movido
// acá para que el badge de PlatoCard use el mismo color/ícono/label.
export const QUAD_META: Record<Quadrante, { label: string; color: string; icon: string; rec: string }> = {
  estrella: { label: 'Estrellas', color: '#16a34a', icon: 'star', rec: 'Populares y rentables — destacalas en la carta' },
  caballo: { label: 'Caballos', color: '#f59e0b', icon: 'trending_up', rec: 'Se venden mucho pero rinden poco — subí precio o bajá costo' },
  puzzle: { label: 'Puzzles', color: '#3b82f6', icon: 'extension', rec: 'Rentables pero poco vendidos — promocioná o reubicá' },
  perro: { label: 'Perros', color: '#ef4444', icon: 'trending_down', rec: 'Ni populares ni rentables — considerá sacarlos' },
}

interface VentaConItems {
  items?: { nombre_plato: string; cantidad: number }[] | null
}

/** carta_item.id → unidades vendidas, matching por nombre normalizado (mismo
 *  criterio que Ventas y que la detección de fuga, lib/reportes/consumoTeorico.ts). */
export function buildVentasMap(items: CartaItemLike[], ventas: VentaConItems[]): Map<string, number> {
  const lookup = buildCartaItemLookup(items)
  const m = new Map<string, number>()
  for (const v of ventas) for (const it of (v.items ?? [])) {
    const id = lookup.get(normalizarNombrePlato(it.nombre_plato))
    if (!id) continue
    m.set(id, (m.get(id) ?? 0) + (it.cantidad ?? 0))
  }
  return m
}

interface ItemConFoodCost {
  id: string
  food_cost_pct?: number | null
  margen_bruto?: number | null
}

/** item.id → cuadrante. Sin food cost o margen calculado, el plato no entra
 *  al mapa (mismo criterio de exclusión que ya usaba RentabilidadView). */
export function mapaCuadrantePorId<T extends ItemConFoodCost>(
  items: T[],
  ventasPorId: Map<string, number>,
): Map<string, Quadrante> {
  const base = items
    .filter(i => i.food_cost_pct != null && i.margen_bruto != null)
    .map(i => ({ item: i, pop: ventasPorId.get(i.id) ?? 0, margin: i.margen_bruto ?? 0 }))
  const ing = clasificarIngenieriaMenu(base)
  const map = new Map<string, Quadrante>()
  for (const x of ing.estrella) map.set(x.item.id, 'estrella')
  for (const x of ing.caballo) map.set(x.item.id, 'caballo')
  for (const x of ing.puzzle) map.set(x.item.id, 'puzzle')
  for (const x of ing.perro) map.set(x.item.id, 'perro')
  return map
}
