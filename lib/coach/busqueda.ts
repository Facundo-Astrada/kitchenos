/**
 * Búsqueda tolerante para las herramientas del Kitchen Coach.
 *
 * El problema que resuelve (medido contra la base, sep 2026):
 *
 *  - `ilike '%mbeju%'` NO matchea "Mbejú". Postgres ignora mayúsculas, no
 *    tildes. Había 6 recetas de mbejú y la búsqueda encontraba 2 o 4 según
 *    cómo lo escribiera el usuario, nunca las 6.
 *  - `ilike '%carne%'` sobre `productos.nombre` devolvía 3 filas ("Carne
 *    Picada Especial", "Carne molida") mientras la categoría "Carnes" tenía
 *    47 productos. El Coach contestaba "tenés 8 kg" con 47 cortes cargados.
 *
 * Por eso el filtro pasó del `ilike` de PostgREST a acá: se traen las filas
 * del restaurante (531 productos en la cuenta más grande — barato server-side)
 * y se puntúan en memoria contra nombre Y categoría, sin acentos y tolerando
 * el plural.
 */
import { normalizarBusqueda, raiz } from '@/lib/texto'

export interface Candidato {
  nombre: string
  categoria?: string | null
  /**
   * Texto extra buscable que no es el nombre ni la categoría. Se usa para los
   * platos de la carta, donde el nombre no dice de qué está hecho: el plato
   * "Mbejú" lleva gírgolas asadas, y quien pregunta por "el de gírgolas" no
   * tiene forma de llegar buscando por nombre. Puntúa como la categoría.
   */
  alias?: string | null
}

/** Puntajes por tipo de coincidencia. Más alto = mejor. */
const P_NOMBRE_EXACTO = 100
const P_NOMBRE_EMPIEZA = 70
const P_NOMBRE_PALABRA = 50
const P_NOMBRE_PARTE = 35
const P_CATEGORIA_EXACTA = 30
const P_CATEGORIA_PARTE = 20

/** Coincidencia de un token contra un campo ya normalizado. */
function puntuarCampo(campo: string, token: string, esNombre: boolean): number {
  if (!campo || !token) return 0
  const r = raiz(token)
  const exacto = esNombre ? P_NOMBRE_EXACTO : P_CATEGORIA_EXACTA
  const parte = esNombre ? P_NOMBRE_PARTE : P_CATEGORIA_PARTE

  if (campo === token || campo === r) return exacto
  if (esNombre && (campo.startsWith(token) || campo.startsWith(r))) return P_NOMBRE_EMPIEZA

  // Palabra completa dentro del campo ("lomo" en "lomo ahumado").
  const palabras = campo.split(' ')
  if (palabras.some(p => p === token || p === r || raiz(p) === r)) {
    return esNombre ? P_NOMBRE_PALABRA : exacto
  }
  if (campo.includes(token) || campo.includes(r)) return parte
  return 0
}

/**
 * Palabras que no aportan a la búsqueda. Sin esto "aceite DE oliva" puntuaba
 * alto contra "aceite DE girasol" por el "de" compartido.
 */
const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'con', 'sin', 'y', 'en', 'al', 'para'])

/** Cuánto se castiga una coincidencia parcial frente a una completa. */
const FACTOR_PARCIAL = 0.5

/**
 * Puntúa un candidato contra la consulta. 0 = no coincide.
 *
 * Con varias palabras ("aceite de oliva") el que tiene TODAS gana holgado,
 * pero el que tiene algunas igual aparece con puntaje bajo: si el restaurante
 * no cargó aceite de oliva, es más útil contestar "no hay oliva, tenés
 * girasol" que "no encontré nada".
 */
export function puntuar(c: Candidato, consulta: string): number {
  const q = normalizarBusqueda(consulta)
  if (!q) return 0
  const nombre = normalizarBusqueda(c.nombre ?? '')
  const categoria = normalizarBusqueda(c.categoria ?? '')
  const alias = normalizarBusqueda(c.alias ?? '')
  const secundario = (t: string) => Math.max(puntuarCampo(categoria, t, false), puntuarCampo(alias, t, false))

  // La consulta entera como una sola pieza: lo que mejor identifica un match fuerte.
  const entera = Math.max(puntuarCampo(nombre, q, true), secundario(q))

  const tokens = q.split(' ').filter(t => t.length > 1 && !VACIAS.has(t))
  if (tokens.length === 0) return entera
  // Un solo token útil: hay que puntuarlo A ÉL, no la frase entera. Si no,
  // "el de gírgolas" se compara literal contra el nombre del plato y da 0,
  // aunque "gírgolas" sea justo lo que lo identifica.
  if (tokens.length === 1) return Math.max(entera, puntuarCampo(nombre, tokens[0], true), secundario(tokens[0]))

  const puntajes = tokens.map(t => Math.max(puntuarCampo(nombre, t, true), secundario(t)))
  const pegaron = puntajes.filter(p => p > 0)
  if (pegaron.length === 0) return entera

  const promedio = pegaron.reduce((s, p) => s + p, 0) / pegaron.length
  if (pegaron.length === tokens.length) return Math.max(entera, Math.round(promedio))

  // Parcial: escala por la fracción que pegó y además castiga, para que nunca
  // se cuele por encima de una coincidencia completa.
  const parcial = Math.round(promedio * (pegaron.length / tokens.length) * FACTOR_PARCIAL)
  return Math.max(entera, parcial)
}

export interface ResultadoBusqueda<T> {
  item: T
  puntaje: number
}

/**
 * Filtra y ordena por relevancia. `limite` corta el resultado, no la búsqueda.
 */
export function buscar<T extends Candidato>(filas: T[], consulta: string, limite = 15): ResultadoBusqueda<T>[] {
  return filas
    .map(item => ({ item, puntaje: puntuar(item, consulta) }))
    .filter(r => r.puntaje > 0)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, limite)
}

/**
 * ¿Hay un ganador claro? Sirve para decidir entre devolver LA ficha o pedir
 * que el usuario desambigüe.
 *
 * Gana si es el único, o si le saca ventaja al segundo. Empate de puntaje con
 * nombres distintos = ambiguo de verdad (hay que preguntar). Empate con el
 * MISMO nombre normalizado = duplicados en la base, no ambigüedad para el
 * usuario: se devuelve el primero (el caso "Mbejú" x4 de Bros).
 */
export function ganadorClaro<T extends Candidato>(res: ResultadoBusqueda<T>[]): T | null {
  if (res.length === 0) return null
  if (res.length === 1) return res[0].item
  const [primero, segundo] = res
  if (primero.puntaje > segundo.puntaje) return primero.item
  const mismoNombre = normalizarBusqueda(primero.item.nombre) === normalizarBusqueda(segundo.item.nombre)
  return mismoNombre ? primero.item : null
}

/**
 * Etiqueta para desambiguar en el chat. El bug original: cuando había varias
 * coincidencias se listaban solo los nombres, y en Bros salían cuatro líneas
 * que decían "Mbejú" — imposible elegir. Se agrega lo que las distingue.
 */
export function etiquetaDesambiguacion(c: Candidato, extra?: string): string {
  const partes = [c.categoria || 'sin categoría']
  if (extra) partes.push(extra)
  return `${c.nombre} (${partes.join(', ')})`
}
