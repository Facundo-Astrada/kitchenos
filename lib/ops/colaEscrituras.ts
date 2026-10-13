// Cola de escrituras por id: dos toques seguidos sobre la misma fila llegan a la
// base en el orden en que se hicieron, y una que falla no frena a la siguiente.
// Sin dependencias de React ni de Supabase — la usa useTareas (ver el comentario
// de "Escrituras de una misma tarea" ahí).

const colaPorId = new Map<string, Promise<unknown>>()

/** Cuántas escrituras están viajando ahora (de cualquier fila). */
export const escriturasEnVuelo = { n: 0 }

export function encolarEscritura<T>(id: string, trabajo: () => Promise<T>): Promise<T> {
  const previa = colaPorId.get(id) ?? Promise.resolve()
  escriturasEnVuelo.n++
  const corrida = previa.catch(() => {}).then(trabajo)
  const cola: Promise<unknown> = corrida.then(() => {}, () => {}).then(() => {
    escriturasEnVuelo.n--
    if (colaPorId.get(id) === cola) colaPorId.delete(id)
  })
  colaPorId.set(id, cola)
  return corrida
}
