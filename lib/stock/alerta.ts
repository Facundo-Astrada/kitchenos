/**
 * La única alerta de stock que el Coach y /centro le muestran al usuario:
 * "bajo mínimo".
 *
 * Antes había "crítico" (`stock_actual <= stock_critico`), pero `stock_critico`
 * está en 0 en casi todas las filas, así que "crítico" terminaba significando
 * "está en cero" — y la mayoría de los productos en cero son productos que
 * nunca se contaron. El contador decía 100 en El Rescoldo cuando el problema
 * real era 1. La pantalla Stock ya había sacado "crítico" (ago 2026).
 *
 * Regla: sin mínimo cargado no hay umbral, y sin umbral no hay alerta. Los
 * productos fuera de uso tampoco alertan (siguen valiendo capital, no se operan).
 * La misma regla vive en SQL en `productos_bajo_minimo_count` — si cambia una,
 * cambia la otra.
 */
export interface ConMinimo {
  stock_actual: number | null
  stock_minimo: number | null
  fuera_de_uso?: boolean | null
}

export function bajoMinimo(p: ConMinimo): boolean {
  if (p.fuera_de_uso) return false
  const minimo = Number(p.stock_minimo ?? 0)
  return minimo > 0 && Number(p.stock_actual ?? 0) <= minimo
}

/** Etiqueta para las tools del Coach. */
export function estadoAlerta(p: ConMinimo): 'bajo mínimo' | 'ok' | 'sin mínimo cargado' {
  if (bajoMinimo(p)) return 'bajo mínimo'
  return Number(p.stock_minimo ?? 0) > 0 ? 'ok' : 'sin mínimo cargado'
}
