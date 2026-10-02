/**
 * Desarrollo de platos — lógica pura (PLAN-DESARROLLO-PLATOS-2026-10).
 *
 * Todo lo que NO es la llamada a la IA vive acá, para poder probarlo sin red:
 * numerar el texto del chef, recortarlo por rangos que devuelve la IA (la IA
 * nunca reescribe lo que el chef escribió), normalizar la ficha que devuelve
 * (sanear lo que venga raro) y vincular componentes/ingredientes con las
 * recetas que el restaurante YA tiene — de forma determinística, no en el
 * prompt (Bros tiene 380 recetas; mandarlas en cada pedido no escala).
 */
import type {
  ComponenteDesarrollo, FichaDesarrollo, IngredienteDesarrollo, OrigenDato,
  PasoDesarrollo, PreguntaDesarrollo,
} from '@/types'
import { normalizeNombre } from '@/lib/recetas/iaImport'

export const MAX_CARACTERES_PEGADO = 20000
export const MAX_PLATOS_POR_PEGADO = 15

// ── Separar: numerar y recortar ──────────────────────────────────────────

function lineasDe(texto: string): string[] {
  return texto.replace(/\r\n?/g, '\n').split('\n')
}

/** "1: Pasta rellena de carne" por línea — la IA responde con rangos de estos números. */
export function numerarLineas(texto: string): string {
  return lineasDe(texto).map((l, i) => `${i + 1}: ${l}`).join('\n')
}

export interface RangoPlato {
  nombre: string
  desde: number
  hasta: number
}

export interface PlatoRecortado {
  nombre_tentativo: string
  texto: string
}

/**
 * Recorta el texto original con los rangos (1-based, inclusivos) que devolvió
 * la IA. Defensivo a propósito: rangos fuera de orden, solapados, fuera del
 * texto o que dejan afuera líneas con contenido no tienen que perder lo que el
 * chef escribió. Una línea con contenido que ningún rango cubre se pega al plato
 * anterior (o al siguiente si es la primera).
 */
export function recortarPorRangos(texto: string, rangos: RangoPlato[]): PlatoRecortado[] {
  if (!texto.trim()) return []
  const lineas = lineasDe(texto)
  const total = lineas.length

  const validos = rangos
    .map(r => ({
      nombre: typeof r.nombre === 'string' ? r.nombre.trim() : '',
      desde: Math.max(1, Math.min(total, Math.floor(Number(r.desde)) || 1)),
      hasta: Math.max(1, Math.min(total, Math.floor(Number(r.hasta)) || 1)),
    }))
    .filter(r => r.hasta >= r.desde)
    .sort((a, b) => a.desde - b.desde)

  if (validos.length === 0) return [{ nombre_tentativo: '', texto: texto.trim() }]

  // Cada línea pertenece a un solo plato: el primero que la reclama.
  const dueno: (number | null)[] = Array(total).fill(null)
  validos.forEach((r, idx) => {
    for (let n = r.desde; n <= r.hasta; n++) if (dueno[n - 1] === null) dueno[n - 1] = idx
  })

  // Líneas con contenido sin dueño → al plato anterior; si no hay, al siguiente.
  let ultimo: number | null = null
  for (let i = 0; i < total; i++) {
    if (dueno[i] !== null) { ultimo = dueno[i]; continue }
    if (lineas[i].trim()) dueno[i] = ultimo
  }
  for (let i = total - 1; i >= 0; i--) {
    if (dueno[i] !== null || !lineas[i].trim()) continue
    const sig = dueno.slice(i + 1).find(d => d !== null)
    dueno[i] = sig ?? 0
  }

  const out: PlatoRecortado[] = []
  validos.forEach((r, idx) => {
    const cuerpo = lineas.filter((_, i) => dueno[i] === idx).join('\n').trim()
    if (cuerpo) out.push({ nombre_tentativo: r.nombre, texto: cuerpo })
  })
  return out.length ? out : [{ nombre_tentativo: '', texto: texto.trim() }]
}

// ── Normalizar la ficha que devuelve la IA ───────────────────────────────

type Crudo = Record<string, unknown>

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}
function strONull(v: unknown): string | null {
  const s = str(v)
  return s ? s : null
}
function origen(v: unknown): OrigenDato {
  return v === 'ia' ? 'ia' : 'chef'
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}
function arr(v: unknown): Crudo[] {
  return Array.isArray(v) ? v.filter((x): x is Crudo => !!x && typeof x === 'object') : []
}

let contadorId = 0
/** Id local (keys de React y ancla de preguntas). No es el de la DB: la ficha es JSONB. */
export function nuevoId(prefijo: string): string {
  contadorId += 1
  const azar = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  return `${prefijo}_${azar}${contadorId}`
}

export interface PlatoOrdenado {
  nombre: string
  descripcion: string | null
  categoria: string | null
  ficha: FichaDesarrollo
}

/**
 * Convierte la respuesta cruda de la IA en un plato bien formado. Reglas que
 * esta función garantiza aunque la IA se equivoque:
 *  - una cantidad vaga ("mucho") es `aprox` y no inventa número;
 *  - sin cantidad no hay unidad ni origen de cantidad;
 *  - si el chef no le puso nombre al plato (lo propuso la IA) queda la pregunta;
 *  - cada pregunta apunta a un componente existente o a ninguno.
 */
export function normalizarFichaIA(crudo: unknown, nombreTentativo = ''): PlatoOrdenado {
  const raw: Crudo = crudo && typeof crudo === 'object' ? crudo as Crudo : {}

  const componentes: ComponenteDesarrollo[] = arr(raw.componentes).map(c => {
    const ingredientes: IngredienteDesarrollo[] = arr(c.ingredientes)
      .map(i => {
        const cantidad = num(i.cantidad)
        const texto = strONull(i.texto_cantidad)
        return {
          nombre: str(i.nombre),
          cantidad,
          unidad: cantidad !== null ? strONull(i.unidad) : null,
          cantidad_origen: cantidad !== null ? origen(i.cantidad_origen) : null,
          aprox: cantidad === null && texto !== null,
          texto_cantidad: texto,
          receta_id: null,
          producto_id: null,
        }
      })
      .filter(i => i.nombre)

    const procedimiento: PasoDesarrollo[] = arr(c.procedimiento)
      .map(p => ({ texto: str(p.texto), origen: origen(p.origen) }))
      .filter(p => p.texto)

    return {
      id: nuevoId('comp'),
      nombre: str(c.nombre) || 'Componente',
      origen: origen(c.origen),
      receta_id: null,
      gramaje: null,
      gramaje_unidad: null,
      gramaje_origen: null,
      ingredientes,
      procedimiento,
      nota_despacho: strONull(c.nota_despacho),
    }
  })

  const armadoRaw = raw.armado && typeof raw.armado === 'object' ? raw.armado as Crudo : null
  const armado: PasoDesarrollo | null = armadoRaw && str(armadoRaw.texto)
    ? { texto: str(armadoRaw.texto), origen: origen(armadoRaw.origen) }
    : null

  // Las preguntas traen el NOMBRE del componente al que se refieren; acá pasa a id.
  const preguntas: PreguntaDesarrollo[] = arr(raw.preguntas)
    .map(p => {
      const ref = normalizeNombre(str(p.componente))
      const comp = ref ? componentes.find(c => normalizeNombre(c.nombre) === ref) : undefined
      return { id: nuevoId('preg'), texto: str(p.texto), componente_id: comp?.id ?? null, resuelta: false }
    })
    .filter(p => p.texto)

  const nombre = str(raw.nombre) || nombreTentativo.trim() || 'Plato sin nombre'
  if (raw.nombre_sugerido === true || !str(raw.nombre)) {
    preguntas.unshift({ id: nuevoId('preg'), texto: '¿Cómo se llama el plato?', componente_id: null, resuelta: false })
  }

  return {
    nombre,
    descripcion: strONull(raw.descripcion),
    categoria: strONull(raw.categoria),
    ficha: { componentes, armado, preguntas },
  }
}

// ── Vincular con las recetas que ya existen ──────────────────────────────

const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'y', 'a', 'en', 'al', 'un', 'una'])

function palabras(s: string): string[] {
  return normalizeNombre(s).split(/[^a-z0-9ñ%]+/).filter(p => p && !PALABRAS_VACIAS.has(p))
}

/**
 * Busca una receta existente que sea "la misma cosa" que `nombre`. Más
 * conservador que `matchPorNombre` a propósito: ahí "contiene" vale en los dos
 * sentidos, y acá "tomate" terminaría vinculado con "Salsa de tomate".
 *
 * Reglas, en orden:
 *  1. nombre idéntico (normalizado) → esa receta;
 *  2. TODAS las palabras de la receta están en lo que escribió el chef
 *     ("fondo de verduras oscuro" ⊇ "Fondo oscuro") → la receta más específica
 *     (más palabras). Si dos empatan, no se vincula: es ambiguo.
 * Que lo escrito por el chef sea más corto que la receta NO alcanza.
 */
export function buscarRecetaExistente<T extends { id: string; nombre: string }>(
  nombre: string, recetas: T[],
): T | null {
  const buscado = normalizeNombre(nombre)
  if (!buscado) return null
  const exacta = recetas.find(r => normalizeNombre(r.nombre) === buscado)
  if (exacta) return exacta

  const dichas = new Set(palabras(nombre))
  if (dichas.size === 0) return null

  let mejor: T | null = null
  let mejorPalabras = 0
  let empate = false
  for (const r of recetas) {
    const pr = palabras(r.nombre)
    if (pr.length === 0 || !pr.every(p => dichas.has(p))) continue
    if (pr.length > mejorPalabras) { mejor = r; mejorPalabras = pr.length; empate = false }
    else if (pr.length === mejorPalabras) empate = true
  }
  return empate ? null : mejor
}

export interface ResumenVinculos {
  /** Nombres de recetas existentes que la ficha reutiliza (sin repetir). */
  basesReutilizadas: string[]
}

/**
 * Completa `receta_id` en componentes e ingredientes. No pisa un vínculo que
 * ya estuviera puesto (el chef pudo haberlo elegido a mano).
 */
export function vincularFicha<T extends { id: string; nombre: string }>(
  ficha: FichaDesarrollo, recetas: T[],
): { ficha: FichaDesarrollo; resumen: ResumenVinculos } {
  const usadas = new Map<string, string>()
  const marcar = (r: T) => usadas.set(r.id, r.nombre)

  const componentes = ficha.componentes.map(c => {
    let receta_id = c.receta_id
    if (!receta_id) {
      const r = buscarRecetaExistente(c.nombre, recetas)
      if (r) { receta_id = r.id; marcar(r) }
    } else {
      const r = recetas.find(x => x.id === receta_id)
      if (r) marcar(r)
    }
    const ingredientes = c.ingredientes.map(i => {
      if (i.receta_id) return i
      const r = buscarRecetaExistente(i.nombre, recetas)
      if (!r) return i
      marcar(r)
      return { ...i, receta_id: r.id }
    })
    return { ...c, receta_id, ingredientes }
  })

  return { ficha: { ...ficha, componentes }, resumen: { basesReutilizadas: [...usadas.values()] } }
}

// ── Resumen de una tanda ─────────────────────────────────────────────────

export function resumenTanda(
  platos: { ficha: FichaDesarrollo }[], basesReutilizadas: string[],
): { platos: number; preguntasAbiertas: number; bases: string[] } {
  const preguntasAbiertas = platos.reduce(
    (acc, p) => acc + p.ficha.preguntas.filter(q => !q.resuelta).length, 0)
  return { platos: platos.length, preguntasAbiertas, bases: [...new Set(basesReutilizadas)] }
}

// ── Ayudas para la pantalla ──────────────────────────────────────────────

export function preguntasAbiertas(ficha: FichaDesarrollo): number {
  return ficha.preguntas.filter(q => !q.resuelta).length
}

/** Cantidad de datos que sugirió la IA y el chef todavía no confirmó. */
export function datosSinConfirmar(ficha: FichaDesarrollo): number {
  let n = 0
  for (const c of ficha.componentes) {
    if (c.origen === 'ia') n++
    for (const i of c.ingredientes) if (i.cantidad_origen === 'ia') n++
    for (const p of c.procedimiento) if (p.origen === 'ia') n++
  }
  if (ficha.armado?.origen === 'ia') n++
  return n
}

export function ingredienteVacio(): IngredienteDesarrollo {
  return {
    nombre: '', cantidad: null, unidad: null, cantidad_origen: null,
    aprox: false, texto_cantidad: null, receta_id: null, producto_id: null,
  }
}

export function componenteVacio(): ComponenteDesarrollo {
  return {
    id: nuevoId('comp'), nombre: '', origen: 'chef', receta_id: null,
    gramaje: null, gramaje_unidad: null, gramaje_origen: null,
    ingredientes: [], procedimiento: [], nota_despacho: null,
  }
}

/**
 * Corre `fn` sobre cada elemento con a lo sumo `limite` en vuelo a la vez, y
 * respeta el orden de salida. Es lo que dispara las fichas del paso "ordenar":
 * 10 llamadas de Sonnet de golpe se pisan con el rate limit; de a 4 llega la
 * primera ficha en segundos y las demás van detrás.
 */
export async function correrConLimite<T, R>(
  items: T[], limite: number, fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados: R[] = new Array(items.length)
  let siguiente = 0
  async function trabajador() {
    while (true) {
      const i = siguiente++
      if (i >= items.length) return
      resultados[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limite, items.length)) }, trabajador))
  return resultados
}
