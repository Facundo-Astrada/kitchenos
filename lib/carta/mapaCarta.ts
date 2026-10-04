/**
 * Mapa de la carta (PLAN-DESARROLLO-PLATOS-2026-10, Fase 3 — reemplaza a la
 * órbita de satélites del 02/10).
 *
 * La carta como grupos (Entradas, Principales, Guarnición 2…) de platos, y lo
 * que los platos comparten entre sí sacado de sus COMPONENTES: una receta que
 * dos platos usan ("Cilantro osmosis" en pollo frito, mbejú y crema de
 * castañas, en Bros) o un ingrediente que aparece adentro de sus componentes
 * ("cilantro" en el chimi y en la salsa tatemada). Todo derivado de
 * plato_recetas + ingredientes, sin tabla nueva. El vínculo comercial marcado
 * a mano sigue afuera (decisión 016).
 */
import { normalizeNombre } from '@/lib/recetas/iaImport'

// ── Qué tiene adentro cada plato ─────────────────────────────────────────

export type ViaCompartido = 'componente' | 'ingrediente'

export interface ItemCompartible {
  /** `r:<receta_id>` para componentes/subrecetas, `i:<nombre normalizado>` para ingredientes. */
  clave: string
  nombre: string
  via: ViaCompartido
  /** Solo ingredientes: claves (`r:…`) de las preparaciones de ESTE plato que lo traen. */
  origenes?: string[]
}

/** Lo mínimo que hace falta de una receta: su nombre y sus ingredientes. */
export interface RecetaParaMapa {
  nombre: string
  ingredientes?: { nombre: string; subreceta_id?: string | null }[]
}

export interface PlatoParaMapa {
  plato_recetas: { receta_id: string | null; receta?: RecetaParaMapa | null }[]
}

// Palabras que describen el corte o el estado, no el ingrediente:
// "cilantro ( hoja y tallo )", "Cilantro (tallos)" y "cilantro fresco" son el mismo cilantro.
const DESCRIPTORES = new Set([
  'fresco', 'fresca', 'frescos', 'frescas', 'picado', 'picada', 'picados', 'picadas',
  'hoja', 'hojas', 'tallo', 'tallos', 'entero', 'entera', 'enteros', 'enteras',
])

// Básicos que están en casi todo: compartirlos no dice nada de la carta.
const BASICOS = new Set([
  'sal', 'sal fina', 'sal gruesa', 'sal entrefina', 'sal marina', 'sal parrillera', 'sal en escamas',
  'pimienta', 'pimienta negra', 'pimienta blanca', 'aceite', 'aceite de girasol', 'aceite de oliva',
  'aceite neutro', 'agua', 'azucar', 'azucar blanca', 'manteca', 'harina', 'harina 000', 'harina 0000',
])

/** Clave de un ingrediente por su nombre: sin tildes, sin paréntesis, sin descriptores. '' = no sirve. */
export function claveIngrediente(nombre: string): string {
  const base = normalizeNombre(nombre.replace(/\([^)]*\)?/g, ' '))
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(/\s+/)
    .filter(p => p && !DESCRIPTORES.has(p))
    .join(' ')
  return base
}

export function esBasico(clave: string): boolean {
  return BASICOS.has(clave)
}

/**
 * Todo lo que un plato tiene adentro, sin repetir: cada componente (receta),
 * las subrecetas que esos componentes usan, y los ingredientes de ambos.
 * `recetaPorId` permite bajar un nivel más en las subrecetas.
 */
export function itemsDePlato(
  plato: PlatoParaMapa,
  recetaPorId: (id: string) => RecetaParaMapa | undefined = () => undefined,
): ItemCompartible[] {
  const out = new Map<string, ItemCompartible>()
  const agregarIngredientes = (receta: RecetaParaMapa | null | undefined, profundidad: number, origen: string) => {
    for (const ing of receta?.ingredientes ?? []) {
      if (ing.subreceta_id) {
        const sub = recetaPorId(ing.subreceta_id)
        const clave = `r:${ing.subreceta_id}`
        if (!out.has(clave)) out.set(clave, { clave, nombre: sub?.nombre ?? ing.nombre, via: 'componente' })
        if (profundidad < 2) agregarIngredientes(sub, profundidad + 1, clave)
        continue
      }
      const k = claveIngrediente(ing.nombre)
      if (!k || esBasico(k)) continue
      const clave = `i:${k}`
      const prev = out.get(clave)
      if (!prev) out.set(clave, { clave, nombre: k.charAt(0).toUpperCase() + k.slice(1), via: 'ingrediente', origenes: [origen] })
      else if (prev.origenes && !prev.origenes.includes(origen)) prev.origenes.push(origen)
    }
  }
  for (const pr of plato.plato_recetas) {
    if (!pr.receta_id) continue
    const receta = pr.receta ?? recetaPorId(pr.receta_id)
    const clave = `r:${pr.receta_id}`
    if (!out.has(clave)) out.set(clave, { clave, nombre: receta?.nombre ?? 'Receta', via: 'componente' })
    agregarIngredientes(receta, 1, clave)
  }
  return [...out.values()]
}

// ── Índice: qué platos usan cada cosa ────────────────────────────────────

export interface EntradaIndice {
  item: ItemCompartible
  platoIds: string[]
}

export interface IndiceCompartidos {
  porItem: Map<string, EntradaIndice>
  porPlato: Map<string, ItemCompartible[]>
  /** Ingredientes que están en tantos platos que no distinguen nada (se ignoran al vincular). */
  comunes: ItemCompartible[]
}

/**
 * Arma el índice. Un INGREDIENTE presente en más del `umbralComun` de los
 * platos con componentes (y en al menos 4) se considera "de todo" y no
 * vincula — si no, el ajo terminaría uniendo media carta. Los COMPONENTES
 * nunca se descartan: compartir una preparación siempre es información.
 */
export function indiceCompartidos(
  platos: { id: string; items: ItemCompartible[] }[], umbralComun = 0.4,
): IndiceCompartidos {
  const porItem = new Map<string, EntradaIndice>()
  const conItems = platos.filter(p => p.items.length > 0).length
  for (const p of platos) for (const it of p.items) {
    const e = porItem.get(it.clave) ?? { item: it, platoIds: [] }
    if (!e.platoIds.includes(p.id)) e.platoIds.push(p.id)
    porItem.set(it.clave, e)
  }
  const tope = Math.max(4, Math.ceil(conItems * umbralComun))
  const comunes: ItemCompartible[] = []
  for (const [clave, e] of porItem) {
    if (e.item.via === 'ingrediente' && e.platoIds.length > tope) {
      comunes.push(e.item)
      porItem.delete(clave)
    }
  }
  const porPlato = new Map<string, ItemCompartible[]>()
  for (const p of platos) porPlato.set(p.id, p.items.filter(it => porItem.has(it.clave)))
  return { porItem, porPlato, comunes: comunes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) }
}

export interface Compartido {
  platoId: string
  items: ItemCompartible[]
}

/** Con qué platos comparte algo `platoId` y qué: primero los que comparten preparaciones, después ingredientes. */
export function compartidosCon(platoId: string, indice: IndiceCompartidos): Compartido[] {
  const res = new Map<string, ItemCompartible[]>()
  for (const it of indice.porPlato.get(platoId) ?? []) {
    for (const otro of indice.porItem.get(it.clave)?.platoIds ?? []) {
      if (otro === platoId) continue
      const l = res.get(otro) ?? []
      l.push(it)
      res.set(otro, l)
    }
  }
  // Si comparten el chimichurri, el ajo y el orégano del chimichurri no son un vínculo aparte:
  // un ingrediente se muestra solo si alguna de sus fuentes en este plato NO es compartida.
  for (const [otro, items] of res) {
    const compartidasComp = new Set(items.filter(i => i.via === 'componente').map(i => i.clave))
    res.set(otro, items.filter(i => i.via === 'componente' || !i.origenes?.length || i.origenes.some(o => !compartidasComp.has(o))))
    if (res.get(otro)!.length === 0) res.delete(otro)
  }
  // Primero cuántas PREPARACIONES comparten (eso es lo que pidió el chef); a igual, cuántos ingredientes.
  const peso = (items: ItemCompartible[]) => items.reduce((a, i) => a + (i.via === 'componente' ? 1000 : 1), 0)
  return [...res.entries()]
    .map(([id, items]) => ({
      platoId: id,
      items: items.sort((a, b) => (a.via === b.via ? a.nombre.localeCompare(b.nombre, 'es') : a.via === 'componente' ? -1 : 1)),
    }))
    .sort((a, b) => peso(b.items) - peso(a.items) || a.platoId.localeCompare(b.platoId))
}

/** Lo que más platos comparten — para elegir "¿quién usa X?" de un vistazo. */
export function masCompartidos(indice: IndiceCompartidos, minPlatos = 2): EntradaIndice[] {
  return [...indice.porItem.values()]
    .filter(e => e.platoIds.length >= minPlatos)
    .sort((a, b) => b.platoIds.length - a.platoIds.length
      || (a.item.via === b.item.via ? 0 : a.item.via === 'componente' ? -1 : 1)
      || a.item.nombre.localeCompare(b.item.nombre, 'es'))
}

// ── Filtros y grupos ─────────────────────────────────────────────────────

/** El plato tiene TODAS las etiquetas pedidas (s/tacc Y vegano, no "o"). */
export function cumpleFiltros(tags: string[] | null | undefined, filtros: string[]): boolean {
  if (filtros.length === 0) return true
  const propias = new Set((tags ?? []).map(t => normalizeNombre(t)))
  return filtros.every(f => propias.has(normalizeNombre(f)))
}

export type FormaGrupo = 'franja' | 'grupo'

/** Bebidas/vinos/cafetería son listas largas de cosas chicas: van en una franja, no en un grupo. */
export function formaDeGrupo(nombre: string, cantidad: number): FormaGrupo {
  return /bebid|vino|trago|coctel|cóctel|cafeter|cerveza|jugo/i.test(nombre) || cantidad > 16 ? 'franja' : 'grupo'
}

export interface GrupoMapa<T> {
  nombre: string
  forma: FormaGrupo
  platos: T[]
}

/**
 * Grupos en el orden de carta_categorias; un plato con categoría que no está
 * en la lista abre su propio grupo al final; los grupos vacíos se muestran
 * (un grupo recién creado tiene que verse para poder mover platos ahí).
 * Las franjas van primero, como en el boceto.
 */
export function armarGrupos<T extends { categoria: string }>(
  categorias: { nombre: string; orden: number }[], platos: T[],
): GrupoMapa<T>[] {
  const orden = [...categorias].sort((a, b) => a.orden - b.orden).map(c => c.nombre)
  const mapa = new Map<string, T[]>(orden.map(n => [n, []]))
  for (const p of platos) {
    const cat = p.categoria?.trim() || 'Sin grupo'
    if (!mapa.has(cat)) mapa.set(cat, [])
    mapa.get(cat)!.push(p)
  }
  const grupos = [...mapa.entries()].map(([nombre, ps]) => ({ nombre, forma: formaDeGrupo(nombre, ps.length), platos: ps }))
  return [...grupos.filter(g => g.forma === 'franja'), ...grupos.filter(g => g.forma === 'grupo')]
}

// ── Dónde abrir la ventanita del plato ───────────────────────────────────

export interface Caja { left: number; top: number; width: number; height: number }

/**
 * Posición de la ventana de un plato, pegada al círculo: a la derecha si
 * entra, si no a la izquierda, y si tampoco, debajo. Siempre dentro del tablero.
 */
export function posicionVentana(
  circulo: Caja, tablero: { width: number; height: number }, ventana: { width: number; height: number }, margen = 10,
): { left: number; top: number; lado: 'derecha' | 'izquierda' | 'abajo' } {
  const clampTop = (t: number) => Math.max(margen, Math.min(t, tablero.height - ventana.height - margen))
  const clampLeft = (l: number) => Math.max(margen, Math.min(l, tablero.width - ventana.width - margen))
  const centroY = circulo.top + circulo.height / 2 - ventana.height / 2
  const derecha = circulo.left + circulo.width + margen
  if (derecha + ventana.width + margen <= tablero.width) return { left: derecha, top: clampTop(centroY), lado: 'derecha' }
  const izquierda = circulo.left - margen - ventana.width
  if (izquierda >= margen) return { left: izquierda, top: clampTop(centroY), lado: 'izquierda' }
  return { left: clampLeft(circulo.left + circulo.width / 2 - ventana.width / 2), top: circulo.top + circulo.height + margen, lado: 'abajo' }
}

/**
 * Lo mismo que `itemsDePlato` para una idea en desarrollo: sus componentes
 * vinculados a recetas existentes cuentan como componente; los demás aportan
 * sus ingredientes (todavía no son recetas).
 */
export function itemsDeFicha(
  componentes: { receta_id: string | null; ingredientes: { nombre: string; receta_id: string | null }[] }[],
  recetaPorId: (id: string) => RecetaParaMapa | undefined = () => undefined,
): ItemCompartible[] {
  const vinculados = componentes.filter(c => c.receta_id).map(c => ({ receta_id: c.receta_id, receta: recetaPorId(c.receta_id!) }))
  const sueltos = componentes.filter(c => !c.receta_id).flatMap(c => c.ingredientes)
  const deVinculados = itemsDePlato({ plato_recetas: vinculados }, recetaPorId)
  const out = new Map(deVinculados.map(i => [i.clave, i]))
  for (const ing of sueltos) {
    if (ing.receta_id) {
      const clave = `r:${ing.receta_id}`
      if (!out.has(clave)) out.set(clave, { clave, nombre: recetaPorId(ing.receta_id)?.nombre ?? ing.nombre, via: 'componente' })
      continue
    }
    const k = claveIngrediente(ing.nombre)
    if (!k || esBasico(k)) continue
    if (!out.has(`i:${k}`)) out.set(`i:${k}`, { clave: `i:${k}`, nombre: k.charAt(0).toUpperCase() + k.slice(1), via: 'ingrediente' })
  }
  return [...out.values()]
}
