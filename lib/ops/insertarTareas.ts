/**
 * El insert de tareas de producción, a prueba del candado.
 *
 * "Una preparación, una fila" (ver `dedupeTareas.ts`) hoy se sostiene solo con
 * guards en el cliente: cada camino mira la cache local antes de insertar. Eso
 * deja una rendija real — dos tablets despachando el mismo ítem en el mismo
 * segundo no se ven entre sí y crean la fila gemela igual. No se nota (el board
 * fusiona por identidad), pero queda en la base y con el tiempo distorsiona
 * Reportes.
 *
 * La rendija se cierra de verdad con una restricción en Postgres. El problema
 * es el orden: **Postgres tumba el lote entero si una sola fila choca**, así
 * que el día que exista el índice único, la activación de un menú de 14
 * preparaciones fallaría completa porque una ya estaba. Hay que endurecer
 * primero y crear la restricción después.
 *
 * Este helper es ese endurecimiento, y está escrito para ser un **passthrough
 * exacto mientras el índice no exista**: sin restricción no hay 23505, el
 * camino de fallback nunca corre, y el comportamiento es idéntico al de hoy.
 *
 * Ojo con lo que NO se puede usar acá: `.upsert(..., { ignoreDuplicates: true })`
 * necesita nombrar una restricción que todavía no existe — PostgREST devolvería
 * 42P10 y rompería producción HOY. El reintento fila por fila no depende de que
 * la restricción exista.
 */

/** Violación de restricción única en Postgres. */
export const PG_UNIQUE_VIOLATION = '23505'

interface ErrorPg { code?: string; message: string }

/** Lo mínimo que este helper necesita de un cliente Supabase. */
interface ClienteInsert {
  from(tabla: string): {
    insert(filas: unknown): PromiseLike<{ error: ErrorPg | null }>
  }
}

export interface ResultadoInsert {
  insertadas: number
  /** Filas que ya existían — solo puede ser > 0 con la restricción creada. */
  omitidas: number
  error: ErrorPg | null
}

export function esViolacionDeUnicidad(error: ErrorPg | null | undefined): boolean {
  return error?.code === PG_UNIQUE_VIOLATION
}

/**
 * Inserta el lote. Si choca contra el candado, reintenta fila por fila y
 * saltea solo las que ya estaban, en vez de perder las que sí eran nuevas.
 *
 * Cualquier otro error se devuelve tal cual: un fallo de permisos o de red no
 * se disfraza de duplicado.
 */
export async function insertarTareas(
  supabase: ClienteInsert,
  filas: readonly unknown[],
): Promise<ResultadoInsert> {
  if (filas.length === 0) return { insertadas: 0, omitidas: 0, error: null }

  const { error } = await supabase.from('tareas').insert(filas)
  if (!error) return { insertadas: filas.length, omitidas: 0, error: null }
  if (!esViolacionDeUnicidad(error)) return { insertadas: 0, omitidas: 0, error }

  // El lote chocó. Al menos una ya estaba; las demás pueden ser nuevas.
  let insertadas = 0, omitidas = 0
  for (const fila of filas) {
    const { error: e } = await supabase.from('tareas').insert(fila)
    if (!e) insertadas++
    else if (esViolacionDeUnicidad(e)) omitidas++
    else return { insertadas, omitidas, error: e }
  }
  return { insertadas, omitidas, error: null }
}
