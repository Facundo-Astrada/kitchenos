// Grupos físicos dentro de una sección del mise (Mesa de trabajo → Producción).
// `checklist_items.grupo_ubicacion`: ítems con el mismo número en la misma
// sección están juntos en el mismo lugar (bandeja, estante). El número es
// local a la sección y fija el color. Invariante que sostiene este archivo:
// los miembros de un grupo van CONTIGUOS por `orden` — el mise recorre la
// sección por `orden`, así que el orden del board es el del mise.
//
// Reglas del gesto (board de Producción):
// - Arrastrar normal = reordenar. Si el ítem cae fuera del tramo de su grupo,
//   sale del grupo. Si cae en el medio de un grupo ajeno, se corre al final
//   de ese grupo (no se mete sin querer).
// - Arrastrar con Ctrl/⌘ (o con "Agrupar" activo) sobre un ítem = sumarse a
//   su grupo, o crear uno nuevo con él si estaba suelto.
// - Un grupo que queda con un solo miembro se disuelve.
// - Todo cambio de sección por otra vía (panel de edición del board, reorden
//   del mise en checklist/ClientView.tsx) pone grupo_ubicacion en null.

export interface ItemGrupo {
  id: string
  orden: number | null
  seccion_id?: string | null
  grupo_ubicacion?: number | null
}

export interface CambioItem {
  id: string
  orden?: number
  seccion_id?: string
  grupo_ubicacion?: number | null
}

export interface MovimientoParams {
  /** Ítems de la sección destino (cualquier orden; puede incluir al arrastrado). */
  destino: ItemGrupo[]
  /** Ítems de la sección de origen — solo importa si es distinta del destino. */
  origen: ItemGrupo[]
  dragged: ItemGrupo
  overSecId: string
  overItemId: string | null
  insertAfter: boolean
  agrupar: boolean
}

// Paleta de grupos — lejos del rojo/naranja/azul/verde de los badges de
// prioridad no se puede (son 4 de los 6 tonos básicos), así que se usan
// tonos saturados que en el board van como barra lateral, no como badge.
const PALETA = ['#06b6d4', '#f97316', '#a855f7', '#84cc16', '#ec4899', '#eab308', '#14b8a6', '#6366f1']

export function colorGrupoUbicacion(n: number): string {
  return PALETA[(Math.max(1, n) - 1) % PALETA.length]
}

const porOrden = (a: ItemGrupo, b: ItemGrupo) => (a.orden ?? 0) - (b.orden ?? 0)

/** Menor número de grupo que no usa ningún ítem de la lista. */
export function siguienteGrupoLibre(items: ItemGrupo[]): number {
  const usados = new Set(items.map(i => i.grupo_ubicacion).filter((g): g is number => g != null))
  let n = 1
  while (usados.has(n)) n++
  return n
}

/** Grupos con menos de 2 miembros en la lista — se tratan como sueltos. */
function gruposSolitarios(items: { grupo_ubicacion?: number | null }[]): Set<number> {
  const cuenta = new Map<number, number>()
  for (const i of items) if (i.grupo_ubicacion != null) cuenta.set(i.grupo_ubicacion, (cuenta.get(i.grupo_ubicacion) ?? 0) + 1)
  return new Set([...cuenta].filter(([, c]) => c < 2).map(([g]) => g))
}

/** Grupo efectivo de cada ítem para mostrar: null si su grupo quedó con uno solo. */
export function grupoEfectivo<T extends ItemGrupo>(items: T[]): Map<string, number | null> {
  const solos = gruposSolitarios(items)
  return new Map(items.map(i => [i.id, i.grupo_ubicacion != null && !solos.has(i.grupo_ubicacion) ? i.grupo_ubicacion : null]))
}

export interface Tramo<T> {
  grupo: number | null
  items: T[]
}

/** Parte la lista (ya ordenada) en tramos consecutivos del mismo grupo — lo
 * que el board dibuja con una barra de color. Los sueltos van de a uno. */
export function tramosDeGrupo<T extends ItemGrupo>(items: T[]): Tramo<T>[] {
  const efectivo = grupoEfectivo(items)
  const tramos: Tramo<T>[] = []
  for (const it of items) {
    const g = efectivo.get(it.id) ?? null
    const ultimo = tramos[tramos.length - 1]
    if (g != null && ultimo && ultimo.grupo === g) ultimo.items.push(it)
    else tramos.push({ grupo: g, items: [it] })
  }
  return tramos
}

/** Qué filas cambian al soltar. Devuelve solo las que cambian algo. */
export function calcularMovimiento(p: MovimientoParams): CambioItem[] {
  const mismaSeccion = p.dragged.seccion_id === p.overSecId
  const originales = new Map<string, ItemGrupo>()
  for (const i of [...p.destino, ...p.origen, p.dragged]) originales.set(i.id, i)

  const lista = p.destino
    .filter(i => i.id !== p.dragged.id)
    .sort(porOrden)
    .map(i => ({ ...i }))
  const movido: ItemGrupo = { ...p.dragged, seccion_id: p.overSecId, grupo_ubicacion: mismaSeccion ? p.dragged.grupo_ubicacion ?? null : null }

  let idx = lista.length
  const overIdx = p.overItemId ? lista.findIndex(i => i.id === p.overItemId) : -1
  if (overIdx !== -1) idx = p.insertAfter ? overIdx + 1 : overIdx

  if (p.agrupar && overIdx !== -1) {
    const over = lista[overIdx]
    // Si el de destino ya tiene número (aunque haya quedado solo), se reusa:
    // conserva su color.
    const g = over.grupo_ubicacion ?? siguienteGrupoLibre(lista)
    over.grupo_ubicacion = g
    movido.grupo_ubicacion = g
    lista.splice(idx, 0, movido)
  } else {
    // No partir un grupo ajeno: si cae entre dos miembros del mismo grupo
    // (que no es el suyo), va al final de ese grupo.
    const prev = lista[idx - 1]
    const next = lista[idx]
    if (prev && next && prev.grupo_ubicacion != null && prev.grupo_ubicacion === next.grupo_ubicacion && prev.grupo_ubicacion !== movido.grupo_ubicacion) {
      const g = prev.grupo_ubicacion
      while (idx < lista.length && lista[idx].grupo_ubicacion === g) idx++
    }
    // Sigue en su grupo solo si queda pegado a otro miembro.
    if (movido.grupo_ubicacion != null) {
      const g = movido.grupo_ubicacion
      const pegado = lista[idx - 1]?.grupo_ubicacion === g || lista[idx]?.grupo_ubicacion === g
      if (!pegado) movido.grupo_ubicacion = null
    }
    lista.splice(idx, 0, movido)
  }

  // Grupos que quedaron con un solo miembro se disuelven.
  const solosDestino = gruposSolitarios(lista)
  for (const i of lista) if (i.grupo_ubicacion != null && solosDestino.has(i.grupo_ubicacion)) i.grupo_ubicacion = null

  const cambios: CambioItem[] = []
  lista.forEach((it, i) => {
    const orig = originales.get(it.id)!
    const c: CambioItem = { id: it.id }
    if ((orig.orden ?? 0) !== i) c.orden = i
    if ((orig.seccion_id ?? null) !== it.seccion_id) c.seccion_id = it.seccion_id!
    if ((orig.grupo_ubicacion ?? null) !== (it.grupo_ubicacion ?? null)) c.grupo_ubicacion = it.grupo_ubicacion ?? null
    if (Object.keys(c).length > 1) cambios.push(c)
  })

  // Sección de origen: el que se fue puede dejar un grupo de uno solo.
  if (!mismaSeccion) {
    const restantes = p.origen.filter(i => i.id !== p.dragged.id)
    const solosOrigen = gruposSolitarios(restantes)
    for (const i of restantes) {
      if (i.grupo_ubicacion != null && solosOrigen.has(i.grupo_ubicacion)) cambios.push({ id: i.id, grupo_ubicacion: null })
    }
  }

  return cambios
}
