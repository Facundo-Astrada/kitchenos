// Continuidad entre la lista del Recetario y la ficha de una receta.
//
// Abrir una receta y volver dejaba la lista en cero: sin la búsqueda, sin la
// categoría y arriba de todo — con 600 recetas, cada consulta costaba volver a
// buscar. Al tocar una tarjeta la lista guarda dónde estaba y en qué orden
// quedó filtrada; al volver se restaura, y la ficha usa ese orden para pasar
// a la receta anterior/siguiente sin pasar por la lista.
//
// sessionStorage (no localStorage): vale para esta pestaña y esta sesión.

const K_LISTA = 'kc_recetario_lista'
const K_RECORRIDO = 'kc_recetario_recorrido'
const K_DESDE_LISTA = 'kc_recetario_desde_lista'
// Pasado este rato ya no es "volver": es entrar de nuevo, y encontrarse con
// una búsqueda vieja aplicada confunde más de lo que ayuda.
const VIGENCIA_MS = 30 * 60_000

export interface EstadoLista {
  search: string
  cat: string
  tab: string
  /** scrollTop del panel de la pestaña activa. */
  scroll: number
  /** Cuántas tarjetas había renderizadas (la lista crece de a tandas). */
  limite: number
}

function leer<T>(clave: string): T | null {
  try {
    const v = sessionStorage.getItem(clave)
    return v ? JSON.parse(v) as T : null
  } catch { return null }
}
function escribir(clave: string, valor: unknown) {
  try { sessionStorage.setItem(clave, JSON.stringify(valor)) } catch {}
}

/** La lista lo llama al tocar una tarjeta. `ids` = la lista tal como quedó filtrada. */
export function recordarLista(estado: EstadoLista, ids: string[], abiertaId: string) {
  escribir(K_LISTA, { ...estado, ts: Date.now() })
  escribir(K_RECORRIDO, ids)
  escribir(K_DESDE_LISTA, abiertaId)
}

// Al volver, la lista se monta más de una vez (la transición de pantalla y el
// modo estricto de desarrollo crean instancias que después se descartan): si
// la primera lectura borrara el estado, lo consumiría una instancia que nunca
// se ve. Por eso la lectura lo marca y sigue valiendo unos segundos.
const GRACIA_LECTURA_MS = 4_000

/** La lista lo llama al montar. Vale para UNA vuelta: pasada la gracia, se borra. */
export function tomarEstadoLista(): EstadoLista | null {
  const guardado = leer<EstadoLista & { ts: number; leido?: number }>(K_LISTA)
  if (!guardado) return null
  const ahora = Date.now()
  const vencido = ahora - guardado.ts > VIGENCIA_MS
  const yaUsado = guardado.leido != null && ahora - guardado.leido > GRACIA_LECTURA_MS
  if (vencido || yaUsado) {
    try { sessionStorage.removeItem(K_LISTA) } catch {}
    return null
  }
  if (guardado.leido == null) escribir(K_LISTA, { ...guardado, leido: ahora })
  return guardado
}

/**
 * La ficha lo llama al montar. `desdeLista` dice si esta receta se abrió
 * desde la lista (o navegando anterior/siguiente desde ahí): solo entonces
 * "volver" es un `history.back()`; si se llegó por un link del Coach o de OPS,
 * volver atrás no lleva al Recetario.
 */
export function leerRecorrido(recetaId: string): { ids: string[]; desdeLista: boolean } {
  const ids = leer<string[]>(K_RECORRIDO)
  return {
    ids: Array.isArray(ids) ? ids : [],
    desdeLista: leer<string>(K_DESDE_LISTA) === recetaId,
  }
}

/** Antes de pasar a la receta anterior/siguiente, para que "volver" siga llevando a la lista. */
export function marcarDesdeLista(recetaId: string) {
  escribir(K_DESDE_LISTA, recetaId)
}
