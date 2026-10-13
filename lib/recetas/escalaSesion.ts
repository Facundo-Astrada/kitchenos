// Conversión vigente de cada receta (escala), por pestaña del navegador.
//
// Convertir una receta a "750 g de cebolla" vivía en el estado de la ficha:
// cerrarla, pasar a OPS o a Stock y volver la mostraba otra vez en su
// cantidad base, y había que rehacer la cuenta con las manos ocupadas. Ahora
// la conversión se guarda por receta y la ficha la retoma al abrirse — desde
// donde sea que se abra.
//
// sessionStorage: dura lo que dura la pestaña (un turno), no queda pegada
// para siempre. Solo la escriben los controles de escala de la ficha, nunca
// un efecto: una ficha que se monta y se descarta no puede pisar lo guardado.

const CLAVE = 'kc_receta_escala'
const MAX_RECETAS = 30

export interface EscalaReceta {
  /** Multiplicador sobre la receta base. */
  factor: number
  /** Ingrediente de referencia, si se convirtió por doble tap en su peso. */
  ref: string | null
  /** Lo tipeado en "Escalar a N porciones". */
  porc: string
  /** Toggle KG/L ↔ G/ML. */
  gml: boolean
}

type Mapa = Record<string, EscalaReceta & { ts: number }>

function leerMapa(): Mapa {
  try {
    const v = sessionStorage.getItem(CLAVE)
    return v ? JSON.parse(v) as Mapa : {}
  } catch { return {} }
}

export function leerEscala(recetaId: string): EscalaReceta | null {
  const e = leerMapa()[recetaId]
  return e && Number.isFinite(e.factor) && e.factor > 0 ? e : null
}

/** `null` = volvió a la receta original: se borra. */
export function guardarEscala(recetaId: string, escala: EscalaReceta | null) {
  try {
    const mapa = leerMapa()
    if (escala && (escala.factor !== 1 || escala.gml)) mapa[recetaId] = { ...escala, ts: Date.now() }
    else delete mapa[recetaId]
    // Tope: se quedan las últimas tocadas.
    const ids = Object.keys(mapa)
    if (ids.length > MAX_RECETAS) {
      ids.sort((a, b) => mapa[a].ts - mapa[b].ts).slice(0, ids.length - MAX_RECETAS).forEach(id => { delete mapa[id] })
    }
    sessionStorage.setItem(CLAVE, JSON.stringify(mapa))
  } catch {}
}
