/**
 * Platos "satélite" (PLAN-DESARROLLO-PLATOS-2026-10, Fase 3, versión derivada).
 *
 * Un plato gira alrededor de otro cuando comparten bases: el chimichurri del
 * bife también va en la provoleta, el fondo oscuro está en la pasta y en el
 * risotto. Todo se calcula de lo que ya está cargado (`plato_recetas`, y las
 * fichas en desarrollo) — sin tabla nueva. El vínculo comercial ("se piden
 * juntos", "se pensó para compartir") marcado a mano queda afuera: necesita
 * decisión propia (decisión 016).
 */

export interface BaseSatelite {
  id: string
  nombre: string
}

export interface PlatoSatelite {
  id: string
  nombre: string
  categoria: string
  bases: BaseSatelite[]
  /** Idea de `platos_desarrollo`, todavía no está en la carta. */
  enDesarrollo?: boolean
}

export interface Vinculo {
  plato: PlatoSatelite
  compartidas: BaseSatelite[]
}

export interface BaseCompartida {
  base: BaseSatelite
  platos: PlatoSatelite[]
}

function idsDe(p: PlatoSatelite): Set<string> {
  return new Set(p.bases.map(b => b.id))
}

/** Platos que comparten al menos una base con `centro`, los que más comparten primero. */
export function vinculosDe(centro: PlatoSatelite, todos: PlatoSatelite[]): Vinculo[] {
  const propias = idsDe(centro)
  if (propias.size === 0) return []
  const out: Vinculo[] = []
  for (const p of todos) {
    if (p.id === centro.id) continue
    const vistas = new Set<string>()
    const compartidas = p.bases.filter(b => {
      if (!propias.has(b.id) || vistas.has(b.id)) return false
      vistas.add(b.id)
      return true
    })
    if (compartidas.length > 0) out.push({ plato: p, compartidas })
  }
  return out.sort((a, b) =>
    b.compartidas.length - a.compartidas.length || a.plato.nombre.localeCompare(b.plato.nombre, 'es'))
}

/** Bases usadas por al menos `minPlatos` platos, las más compartidas primero. */
export function basesMasCompartidas(todos: PlatoSatelite[], minPlatos = 2): BaseCompartida[] {
  const mapa = new Map<string, BaseCompartida>()
  for (const p of todos) {
    for (const b of p.bases) {
      const e = mapa.get(b.id) ?? { base: b, platos: [] }
      if (!e.platos.some(x => x.id === p.id)) e.platos.push(p)
      mapa.set(b.id, e)
    }
  }
  return [...mapa.values()]
    .filter(e => e.platos.length >= minPlatos)
    .sort((a, b) => b.platos.length - a.platos.length || a.base.nombre.localeCompare(b.base.nombre, 'es'))
}

/** Cantidad de satélites de cada plato, en una sola pasada (para ordenar la lista de centros). */
export function cantidadDeSatelites(todos: PlatoSatelite[]): Map<string, number> {
  const porBase = new Map<string, Set<string>>()
  for (const p of todos) for (const b of p.bases) {
    const s = porBase.get(b.id) ?? new Set<string>()
    s.add(p.id)
    porBase.set(b.id, s)
  }
  const res = new Map<string, number>()
  for (const p of todos) {
    const vecinos = new Set<string>()
    for (const b of p.bases) for (const id of porBase.get(b.id) ?? []) if (id !== p.id) vecinos.add(id)
    res.set(p.id, vecinos.size)
  }
  return res
}

/** Platos que no comparten ninguna base con nadie: candidatos a revisar (¿aislado a propósito?). */
export function platosSueltos(todos: PlatoSatelite[], satelites: Map<string, number> = cantidadDeSatelites(todos)): PlatoSatelite[] {
  return todos.filter(p => (satelites.get(p.id) ?? 0) === 0)
}

/** El centro por defecto: el principal con más satélites; si no hay principales, el plato con más. */
export function centroSugerido(todos: PlatoSatelite[], satelites: Map<string, number> = cantidadDeSatelites(todos)): PlatoSatelite | null {
  if (todos.length === 0) return null
  const esPrincipal = (p: PlatoSatelite) => p.categoria.trim().toLowerCase() === 'principales'
  const orden = (a: PlatoSatelite, b: PlatoSatelite) =>
    (satelites.get(b.id) ?? 0) - (satelites.get(a.id) ?? 0) || a.nombre.localeCompare(b.nombre, 'es')
  const principales = todos.filter(esPrincipal).sort(orden)
  const candidato = principales[0] ?? [...todos].sort(orden)[0]
  return candidato
}

// ── Geometría de la órbita ───────────────────────────────────────────────

export interface PosicionOrbita {
  /** Centro del nodo, en % del lado del cuadrado (0-100). */
  x: number
  y: number
  /** Distancia al centro, en % del lado. Más cerca = más bases en común. */
  radio: number
  /** Grados, 0 = derecha, sentido horario (como la pantalla). */
  angulo: number
}

/**
 * Posiciones de hasta `max` satélites alrededor del centro (50, 50). Más bases
 * compartidas ⇒ más cerca del centro; con todos igual de fuertes van en un
 * mismo anillo. Con muchos, los nodos alternan entre dos radios para que los
 * rótulos no se pisen.
 */
export function posicionesOrbita(fuerzas: number[], max = 12): PosicionOrbita[] {
  const n = Math.min(fuerzas.length, max)
  if (n === 0) return []
  const usadas = fuerzas.slice(0, n)
  const fmax = Math.max(...usadas)
  const fmin = Math.min(...usadas)
  const R_CERCA = 27
  const R_LEJOS = 38
  return usadas.map((f, i) => {
    // 1 = el más fuerte. Todos igual de fuertes: anillo intermedio, así no se apelmazan contra el centro.
    const t = fmax === fmin ? 0.1 : (f - fmin) / (fmax - fmin)
    const base = R_LEJOS - (R_LEJOS - R_CERCA) * t
    const zigzag = n > 8 ? (i % 2 === 0 ? -2.5 : 2.5) : 0
    const radio = Math.max(R_CERCA - 3, Math.min(R_LEJOS + 2, base + zigzag))
    const angulo = -90 + (360 / n) * i
    const rad = (angulo * Math.PI) / 180
    return { radio, angulo, x: 50 + radio * Math.cos(rad), y: 50 + radio * Math.sin(rad) }
  })
}
