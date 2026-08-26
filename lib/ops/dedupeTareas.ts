import type { Tarea } from '@/types'

// ════════════════════════════════════════════════════════════
// UNA PREPARACIÓN, UNA FILA
//
// Producción recibe el mismo trabajo por cuatro caminos que no se ven entre
// sí: el tilde del mise (deja `checklist_item_id`), el cierre que lo pasa al
// turno siguiente (`categoria='pase_turno'`), la activación de un menú por
// fecha (inserta en lote, SIN `checklist_item_id`) y el QuickAdd del board
// (texto libre). Cada uno se fijaba en lo suyo, así que la misma preparación
// terminaba dos, tres y hasta diez veces en la misma columna del mismo día
// — Bros, 26 ago 2026: "Trucha curada" ×10, el menú Cotidiano entero ×2.
//
// Acá vive la identidad de una tarea de producción: qué fila del board ocupa.
// Dos tareas con la misma clave son, para el cocinero, el mismo trabajo — se
// dibujan una debajo de la otra y no hay forma de distinguirlas.
// ════════════════════════════════════════════════════════════

/**
 * Título comparable: sin acentos, sin mayúsculas, sin espacios de más.
 * "Crema Ácida Casera" y "crema acida  casera" son el mismo tupper.
 */
export function normalizarTitulo(titulo: string): string {
  return titulo
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Lo mínimo que hace falta para ubicar una tarea en el board. */
export interface TareaIdentificable {
  titulo: string
  turno_fecha?: string | null
  modo?: string | null
  plaza?: string | null
  seccion?: string | null
  menu_id?: string | null
}

/**
 * La clave es "misma columna, mismo día, mismo nombre" — no "mismos datos".
 * A propósito NO entra la categoría: `produccion` y `pase_turno` son dos
 * formas de pedir el mismo trabajo, y con dos turnos por día caen sobre la
 * misma `turno_fecha` (la jornada próxima al cerrar el almuerzo es hoy). Ese
 * par era el duplicado que más se veía: lo que quedaba de un turno al lado de
 * lo que marcaba el que entraba.
 *
 * Tampoco entra `checklist_item_id`: la fila del lote de un menú no lo tiene
 * y la despachada desde el mise sí, y son la misma preparación.
 */
export function claveTarea(t: TareaIdentificable): string {
  const modo = t.modo ?? 'carta'
  // Carta se agrupa por plaza; menú y evento, por paso. Es el mismo eje de
  // columnas que arma ProduccionBoard — si divergen, la clave fusionaría
  // filas que el board dibuja separadas (o al revés).
  const destino = modo === 'carta' ? (t.plaza ?? '') : (t.seccion ?? '')
  return [
    t.turno_fecha ?? '',
    modo,
    destino.trim().toLowerCase(),
    t.menu_id ?? '',
    normalizarTitulo(t.titulo),
  ].join('::')
}

/**
 * ¿Esta tarea participa de la identidad "una preparación, una fila"?
 *
 * Solo la producción con jornada asignada. Quedan afuera las notas de pedido,
 * las tareas sueltas sin fecha, las subtareas y las anotaciones libres
 * (`categoria: 'general'`, lo que se escribe a mano en el Pase o el
 * Calendario): dos anotaciones con el mismo texto son dos anotaciones, y
 * juntarlas sería borrarle una al que la escribió.
 */
export function esProduccionDelDia(t: Partial<Tarea>): boolean {
  return t.parent_id == null && t.turno_fecha != null
    && (t.categoria === 'produccion' || t.categoria === 'pase_turno')
}

/**
 * Cuál de dos gemelas se muestra. Gana la que está vinculada al mise
 * (`checklist_item_id`): es la única por la que tildar en Producción vuelve
 * al mise, y perderla rompe el ida y vuelta. Entre iguales, la más reciente
 * — es la última decisión que alguien tomó sobre ese trabajo.
 */
export function mejorRepresentante(a: Tarea, b: Tarea): boolean {
  const aLink = a.checklist_item_id != null
  const bLink = b.checklist_item_id != null
  if (aLink !== bLink) return aLink
  const ca = a.created_at ?? ''
  const cb = b.created_at ?? ''
  if (ca !== cb) return ca > cb
  return a.id > b.id
}

export interface FusionTareas<T> {
  /** Una fila por preparación — lo único que se dibuja. */
  filas: T[]
  /** id de la fila visible → ids de TODAS sus gemelas (incluida ella). */
  gemelosPorId: Map<string, string[]>
  /** Ids que quedaron detrás de una fila visible. */
  ocultosIds: string[]
}

/**
 * Colapsa las tareas que ocupan la misma fila del board. Conserva el orden de
 * entrada (la fila queda donde estaba la primera gemela), así que se aplica
 * DESPUÉS de ordenar, no antes.
 *
 * Ojo: no borra nada. Los duplicados siguen en la base — lo que devuelve
 * `gemelosPorId` es justamente para que tildar la fila visible tilde también
 * a las que quedaron atrás, y ninguna reviva en el próximo fetch.
 */
export function fusionarDuplicados<T extends Tarea>(tareas: readonly T[]): FusionTareas<T> {
  const orden: string[] = []
  const grupos = new Map<string, T[]>()
  for (const t of tareas) {
    const k = claveTarea(t)
    const g = grupos.get(k)
    if (g) g.push(t)
    else { grupos.set(k, [t]); orden.push(k) }
  }

  const filas: T[] = []
  const gemelosPorId = new Map<string, string[]>()
  const ocultosIds: string[] = []
  for (const k of orden) {
    const g = grupos.get(k)!
    let ganadora = g[0]
    for (const t of g) if (t !== ganadora && mejorRepresentante(t, ganadora)) ganadora = t
    filas.push(ganadora)
    if (g.length > 1) {
      gemelosPorId.set(ganadora.id, g.map(t => t.id))
      for (const t of g) if (t.id !== ganadora.id) ocultosIds.push(t.id)
    }
  }
  return { filas, gemelosPorId, ocultosIds }
}

/**
 * ¿Ya hay una tarea que representa este despacho? Primero por vínculo con el
 * ítem del mise (mismo ítem, misma jornada, sin mirar categoría ni estado:
 * re-despachar algo ya tildado tiene que reabrir esa fila, no plantar otra) y
 * si no, por identidad visible — así el tilde del mise adopta la fila que
 * dejó la activación por fecha de un menú en vez de ponerse al lado.
 */
export function tareaExistentePara<T extends Tarea>(
  tareas: readonly T[],
  nueva: TareaIdentificable & { checklist_item_id?: string | null },
): T | null {
  const itemId = nueva.checklist_item_id ?? null
  const fecha = nueva.turno_fecha ?? null
  const clave = claveTarea(nueva)
  let porIdentidad: T | null = null
  for (const t of tareas) {
    if (t.parent_id) continue
    if (itemId && t.checklist_item_id === itemId && (t.turno_fecha ?? null) === fecha) return t
    if (claveTarea(t) === clave && (!porIdentidad || mejorRepresentante(t, porIdentidad))) porIdentidad = t
  }
  return porIdentidad
}
