/**
 * Mapa de la carta (PLAN-DESARROLLO-PLATOS-2026-10, Fase 3).
 *
 * La carta como grupos de platos, y lo que los platos comparten entre sí
 * sacado de sus COMPONENTES — lo mismo que la cocina ve en el mise de OPS y
 * tilda para producir (`plato_recetas`, con su plaza). En Bros, "Cilantro
 * osmosis" (plaza fríos) une pollo frito, mbejú y crema de castañas.
 *
 * A propósito NO baja a los ingredientes de cada receta (se probó el 04/10 y
 * el chef lo descartó: "en vez de ver recetas, buscá los componentes"). Lo
 * que importa para planificar es qué preparación del mise sirve a qué platos.
 * El vínculo comercial marcado a mano sigue afuera (decisión 016).
 */

// ── Componentes de cada plato ────────────────────────────────────────────

export interface Componente {
  /** `r:<receta_id>` — el mismo componente del mise en todos los platos que lo usan. */
  clave: string
  nombre: string
  plaza: string | null
}

export interface PlatoParaMapa {
  plato_recetas: {
    receta_id: string | null
    receta?: { nombre: string } | null
    plaza_efectiva?: string | null
    plaza?: string | null
  }[]
}

/** Componentes de un plato, sin repetir, en el orden en que están cargados. */
export function componentesDePlato(
  plato: PlatoParaMapa, nombreReceta: (id: string) => string | undefined = () => undefined,
): Componente[] {
  const out = new Map<string, Componente>()
  for (const pr of plato.plato_recetas) {
    if (!pr.receta_id) continue
    const clave = `r:${pr.receta_id}`
    if (out.has(clave)) continue
    out.set(clave, {
      clave,
      nombre: pr.receta?.nombre ?? nombreReceta(pr.receta_id) ?? 'Componente',
      plaza: pr.plaza_efectiva ?? pr.plaza ?? null,
    })
  }
  return [...out.values()]
}

/** Lo mismo para una idea en desarrollo: solo cuentan sus componentes ya vinculados a una receta. */
export function componentesDeFicha(
  componentes: { nombre: string; receta_id: string | null }[],
  nombreReceta: (id: string) => string | undefined = () => undefined,
): Componente[] {
  const out = new Map<string, Componente>()
  for (const c of componentes) {
    if (!c.receta_id) continue
    const clave = `r:${c.receta_id}`
    if (!out.has(clave)) out.set(clave, { clave, nombre: nombreReceta(c.receta_id) ?? c.nombre, plaza: null })
  }
  return [...out.values()]
}

// ── Índice: qué platos usan cada componente ──────────────────────────────

export interface EntradaIndice {
  componente: Componente
  platoIds: string[]
}

export interface IndiceCompartidos {
  porComponente: Map<string, EntradaIndice>
  porPlato: Map<string, Componente[]>
}

export function indiceCompartidos(platos: { id: string; componentes: Componente[] }[]): IndiceCompartidos {
  const porComponente = new Map<string, EntradaIndice>()
  const porPlato = new Map<string, Componente[]>()
  for (const p of platos) {
    porPlato.set(p.id, p.componentes)
    for (const c of p.componentes) {
      const e = porComponente.get(c.clave) ?? { componente: c, platoIds: [] }
      if (!e.platoIds.includes(p.id)) e.platoIds.push(p.id)
      porComponente.set(c.clave, e)
    }
  }
  return { porComponente, porPlato }
}

export interface Compartido {
  platoId: string
  componentes: Componente[]
}

/** Con qué platos comparte componentes `platoId` y cuáles; los que más comparten primero. */
export function compartidosCon(platoId: string, indice: IndiceCompartidos): Compartido[] {
  const res = new Map<string, Componente[]>()
  for (const c of indice.porPlato.get(platoId) ?? []) {
    for (const otro of indice.porComponente.get(c.clave)?.platoIds ?? []) {
      if (otro === platoId) continue
      const l = res.get(otro) ?? []
      l.push(c)
      res.set(otro, l)
    }
  }
  return [...res.entries()]
    .map(([id, componentes]) => ({ platoId: id, componentes: componentes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) }))
    .sort((a, b) => b.componentes.length - a.componentes.length || a.platoId.localeCompare(b.platoId))
}

/** Componentes que usan al menos `minPlatos` platos, los más compartidos primero. */
export function masCompartidos(indice: IndiceCompartidos, minPlatos = 2): EntradaIndice[] {
  return [...indice.porComponente.values()]
    .filter(e => e.platoIds.length >= minPlatos)
    .sort((a, b) => b.platoIds.length - a.platoIds.length || a.componente.nombre.localeCompare(b.componente.nombre, 'es'))
}

// ── Filtros y grupos ─────────────────────────────────────────────────────

function sinTildes(s: string): string {
  return s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** El plato tiene TODAS las etiquetas pedidas (s/tacc Y vegano, no "o"). */
export function cumpleFiltros(tags: string[] | null | undefined, filtros: string[]): boolean {
  if (filtros.length === 0) return true
  const propias = new Set((tags ?? []).map(sinTildes))
  return filtros.every(f => propias.has(sinTildes(f)))
}

export type PlanoGrupo = 'platos' | 'secundario'

/** Bebidas, vinos y cafetería van a un segundo plano: el chef viene a ver los platos. */
export function planoDeGrupo(nombre: string): PlanoGrupo {
  return /bebid|vino|trago|coctel|cóctel|cafe|café|cerveza|jugo|infusion|infusión/i.test(nombre) ? 'secundario' : 'platos'
}

export interface GrupoMapa<T> {
  nombre: string
  plano: PlanoGrupo
  platos: T[]
}

/**
 * Grupos de platos primero (Principales al frente, después el orden de
 * carta_categorias), los secundarios al final. Un plato con una categoría
 * que no está en la lista abre su propio grupo; los grupos vacíos se
 * muestran (uno recién creado tiene que verse para mover platos ahí).
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
  const grupos = [...mapa.entries()].map(([nombre, ps]) => ({ nombre, plano: planoDeGrupo(nombre), platos: ps }))
  const dePlatosOrdenados = grupos.filter(g => g.plano === 'platos')
    .sort((a, b) => Number(/principal/i.test(b.nombre)) - Number(/principal/i.test(a.nombre)))
  return [...dePlatosOrdenados, ...grupos.filter(g => g.plano === 'secundario')]
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
