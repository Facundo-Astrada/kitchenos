// ── Clasificación de ingeniería de menú (método Kasavana-Smith) ──
// Extraído de RentabilidadView (carta/page.tsx) para poder testearlo sin
// montar el componente. Antes clasificaba con dos promedios simples de
// popularidad y margen — eso hace que la mitad de la carta "gane" el
// promedio de popularidad casi por definición, sin importar cuán sesgada
// esté la distribución de ventas. El método real usa un umbral fijo (70%
// del mix ideal) para popularidad y un promedio PONDERADO por unidades
// vendidas para rentabilidad.

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
