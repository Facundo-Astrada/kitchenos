// ── Catálogo único de prioridades de OPS ────────────────────────────────────
//
// Dos escalas conviven por historia: la de las TAREAS (`tareas.prioridad`:
// critica/alta/media/baja) y la del MISE (`checklist_items.prioridad`:
// sp/p/ref/chk). Los cocineros ven siempre las siglas, así que acá viven las dos
// juntas, con su par. Antes cada pantalla repetía su propia copia del mapa
// (siglas, colores, orden, mise↔tarea) y sumar un valor era tocar una docena de
// archivos.
//
// CARGAR y DESCONGELAR no son un nivel de urgencia sino un TIPO de trabajo:
//  · cargar      → recargar un tupper que quedó a la mitad (no se produce de cero).
//  · descongelar → dejar algo descongelándose de un día al otro en la heladera.
// Comparten la columna de prioridad porque es donde el cocinero ya los
// distingue (SP · P · REF) y no vale un campo nuevo en dos tablas; el mismo
// string vive en las dos escalas, así que no hay mapeo que mantener.
//
// Ninguna columna tiene constraint sobre `prioridad` (verificado en la base).

import type { MisePrioridad, TareaPrioridad } from '@/types'

export interface PrioMeta {
  tarea: TareaPrioridad
  mise: MisePrioridad
  /** Sigla en Producción y en el sheet de crear tarea. */
  sigla: string
  /** Sigla en el mise (ahí la última se llama OK, no Check). */
  siglaMise: string
  /** Texto largo, para el texto del pase y los tooltips. */
  nombre: string
  /** Descripción de una línea, para el selector. */
  detalle: string
  icono: string | null
  /** Se muestra solo el ícono, sin la sigla (CARGAR: las flechas en círculo bastan). */
  soloIcono: boolean
  color: string
  bg: string
  /** Menor = más arriba. */
  orden: number
  /** Siempre visible en la columna; el resto va plegado detrás de "+N". */
  principal: boolean
  /** Genera una tarea al cargarse en el mise (SP y P hoy). */
  urgente: boolean
}

export const PRIORIDADES: PrioMeta[] = [
  { tarea: 'critica', mise: 'sp', sigla: 'SP', siglaMise: 'SP', nombre: 'SP', detalle: 'Súper prioridad — urgente',
    icono: null, soloIcono: false, color: '#ef4444', bg: 'rgba(239,68,68,.13)', orden: 0, principal: true, urgente: true },
  { tarea: 'alta', mise: 'p', sigla: 'P', siglaMise: 'P', nombre: 'P', detalle: 'Prioridad',
    icono: null, soloIcono: false, color: '#f97316', bg: 'rgba(249,115,22,.13)', orden: 1, principal: true, urgente: true },
  { tarea: 'cargar', mise: 'cargar', sigla: 'CARGAR', siglaMise: 'CARGAR', nombre: 'CARGAR', detalle: 'Recargar un tupper que quedó a la mitad',
    icono: 'autorenew', soloIcono: true, color: '#0d9488', bg: 'rgba(13,148,136,.13)', orden: 2, principal: true, urgente: false },
  { tarea: 'descongelar', mise: 'descongelar', sigla: 'DESC.', siglaMise: 'DESC.', nombre: 'DESCONGELAR', detalle: 'Dejar descongelando de un día al otro',
    icono: 'ac_unit', soloIcono: false, color: '#7c3aed', bg: 'rgba(124,58,237,.13)', orden: 3, principal: true, urgente: false },
  { tarea: 'media', mise: 'ref', sigla: 'REF', siglaMise: 'REF', nombre: 'REF', detalle: 'Refuerzo — controlar',
    icono: null, soloIcono: false, color: '#3b82f6', bg: 'rgba(59,130,246,.13)', orden: 4, principal: false, urgente: false },
  { tarea: 'baja', mise: 'chk', sigla: 'Check', siglaMise: 'OK', nombre: 'CHK', detalle: 'Check — sin acción requerida',
    icono: null, soloIcono: false, color: '#64748b', bg: 'rgba(100,116,139,.1)', orden: 5, principal: false, urgente: false },
]

const POR_TAREA = new Map<string, PrioMeta>(PRIORIDADES.map(p => [p.tarea, p]))
const POR_MISE = new Map<string, PrioMeta>(PRIORIDADES.map(p => [p.mise, p]))

/** Meta de una prioridad de tarea; valores desconocidos caen en Check. */
export function metaTarea(p: string | null | undefined): PrioMeta {
  return POR_TAREA.get(p ?? 'baja') ?? POR_TAREA.get('baja')!
}

/** Meta de una prioridad del mise; valores desconocidos caen en REF (como hacía el mise). */
export function metaMise(p: string | null | undefined): PrioMeta {
  return POR_MISE.get(p ?? 'ref') ?? POR_MISE.get('ref')!
}

export function miseATarea(p: string | null | undefined): TareaPrioridad {
  return POR_MISE.get(p ?? '')?.tarea ?? 'alta'
}

export function tareaAMise(p: string | null | undefined): MisePrioridad {
  return POR_TAREA.get(p ?? '')?.mise ?? 'ref'
}

/** Para ordenar: menor primero. Desconocidos al final. */
export function ordenPrioridad(p: string | null | undefined): number {
  return POR_TAREA.get(p ?? 'baja')?.orden ?? PRIORIDADES.length
}

/** ¿Es de las que se muestran a la vista en la columna? */
export function esPrincipal(p: string | null | undefined): boolean {
  return metaTarea(p).principal
}

/** ¿Al cargarse en el mise genera una tarea de Producción? */
export function generaTarea(miseP: string): boolean {
  return POR_MISE.get(miseP)?.urgente ?? false
}
