import type { PaseMensaje, Tarea, TareaPrioridad } from '@/types'

// ── El pase de turno como texto ─────────────────────────────────────────────
//
// El equipo de Bros ya escribía este mensaje a mano en WhatsApp todas las
// noches, con este formato exacto:
//
//     pase parri
//     cebolla fugazza (sp)
//     queso fugazza (p)
//     coliflor (ref)
//
// La lista no hay que inventarla: es lo que el cierre en Modo Control ya deja
// en `tareas` con categoria='pase_turno' (ver ClientView.handleCrearTarea), con
// la prioridad mapeada desde el mise por MISE_PRIO_TO_TAREA. Y lo que en el
// mensaje va como "se marchó todo el pollo" son las tareas que quedaron en
// `listo` durante el turno. Esta función serializa las dos cosas + las notas
// libres, y nada más: no consulta, no formatea fechas del sistema, no toca
// React. Todo entra por parámetro para que el texto sea testeable línea a línea
// y para que la misma salida sirva al botón "Copiar pase" y a cualquier vista
// que quiera mostrar el pase en pantalla.
//
// Los códigos son los del mise, no los de la DB: el que lee el mensaje es el
// mismo cocinero que escribe "SP" en la tarjeta, y "critica" no significa nada
// para él.

export const PRIO_A_CODIGO: Record<TareaPrioridad, string> = {
  critica: 'SP',
  alta: 'P',
  media: 'REF',
  baja: 'CHK',
}

// El orden en el que se leen: primero lo que hay que marchar sin parar.
const PRIO_ORDEN: TareaPrioridad[] = ['critica', 'alta', 'media', 'baja']

function ordenDe(p: string | null | undefined): number {
  const idx = PRIO_ORDEN.indexOf((p ?? 'baja') as TareaPrioridad)
  return idx === -1 ? PRIO_ORDEN.length : idx
}

function codigoDe(p: string | null | undefined): string {
  return PRIO_A_CODIGO[(p ?? 'baja') as TareaPrioridad] ?? 'CHK'
}

export interface DatosPase {
  /** Nombre visible de la plaza — ya resuelto con plazaLabel(), incluidas las custom. */
  plazaNombre: string
  /** Nombre del turno que se entrega ("Cena"), no el que entra. */
  turnoNombre?: string | null
  /** Jornada en formato YYYY-MM-DD. */
  jornada: string
  /** Lo que queda para el turno siguiente — tareas categoria='pase_turno'. */
  pendientes: Tarea[]
  /** Lo que se resolvió en el turno — tareas en estado 'listo'. */
  hecho: Tarea[]
  /** Notas libres de la plaza (pase_mensajes), más nuevas primero. */
  notas: PaseMensaje[]
  /** Quién entrega. */
  autor?: string | null
  /** Hora de la entrega en ISO; si falta, el pie no lleva hora. */
  entregadoAt?: string | null
}

function fmtJornada(jornada: string): string {
  // T12:00:00 y no T00:00 — con la medianoche cruda, un navegador en UTC-3
  // devuelve el día anterior y el pase queda fechado un día antes.
  const d = new Date(`${jornada}T12:00:00`)
  if (Number.isNaN(d.getTime())) return jornada
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
}

function fmtHora(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

/** Título limpio: sin espacios de más y sin el punto final que a veces queda al dictar. */
function limpiar(s: string): string {
  return s.trim().replace(/\s+/g, ' ').replace(/\.$/, '')
}

/**
 * Las tareas ordenadas y deduplicadas por título. La misma preparación puede
 * tener dos filas (despachada desde el mise y desde el board — ver
 * dedupeTareas.ts, que resuelve lo mismo para el board): en el mensaje eso se
 * lee como un error de quien lo escribió, así que gana la prioridad más alta.
 */
function lineasDeTareas(tareas: Tarea[], conCodigo: boolean): string[] {
  const porTitulo = new Map<string, Tarea>()
  for (const t of tareas) {
    const titulo = limpiar(t.titulo ?? '')
    if (!titulo) continue
    const key = titulo.toLowerCase()
    const previa = porTitulo.get(key)
    if (!previa || ordenDe(t.prioridad) < ordenDe(previa.prioridad)) {
      porTitulo.set(key, { ...t, titulo })
    }
  }
  return [...porTitulo.values()]
    .sort((a, b) => {
      const d = ordenDe(a.prioridad) - ordenDe(b.prioridad)
      return d !== 0 ? d : a.titulo.localeCompare(b.titulo, 'es')
    })
    .map(t => (conCodigo ? `${t.titulo} ${codigoDe(t.prioridad)}` : `· ${t.titulo}`))
}

/**
 * El pase de UNA plaza como texto plano, listo para pegar en WhatsApp.
 * Las secciones vacías no se imprimen: un "Hecho" sin nada debajo es ruido, y
 * el mensaje tiene que poder leerse de un vistazo en un celular.
 */
export function construirTextoPase(d: DatosPase): string {
  const bloques: string[] = []

  const encabezado = d.turnoNombre
    ? `Pase ${d.plazaNombre} — ${d.turnoNombre}, ${fmtJornada(d.jornada)}`
    : `Pase ${d.plazaNombre} — ${fmtJornada(d.jornada)}`
  bloques.push(encabezado)

  const pendientes = lineasDeTareas(d.pendientes, true)
  if (pendientes.length > 0) bloques.push(pendientes.join('\n'))

  const hecho = lineasDeTareas(d.hecho, false)
  if (hecho.length > 0) bloques.push(['Hecho', ...hecho].join('\n'))

  const notas = d.notas
    .map(n => limpiar(n.texto ?? ''))
    .filter(Boolean)
    // Las notas llegan más nuevas primero (useNotasPlaza). En el mensaje se
    // leen en el orden en que pasaron las cosas, que es como se cuenta un turno.
    .reverse()
  if (notas.length > 0) bloques.push(['Ojo', ...notas.map(t => `· ${t}`)].join('\n'))

  // Sin nada más que el encabezado el mensaje no vale la pena mandarse.
  if (bloques.length === 1) bloques.push('Sin pendientes.')

  const autor = d.autor?.trim()
  const hora = d.entregadoAt ? fmtHora(d.entregadoAt) : null
  if (autor || hora) {
    bloques.push(`— ${[autor, hora].filter(Boolean).join(', ')}`)
  }

  return bloques.join('\n\n')
}

/** true si el pase tiene algo además del encabezado y la firma. */
export function paseTieneContenido(d: DatosPase): boolean {
  return (
    d.pendientes.some(t => limpiar(t.titulo ?? '')) ||
    d.hecho.some(t => limpiar(t.titulo ?? '')) ||
    d.notas.some(n => limpiar(n.texto ?? ''))
  )
}

/**
 * Recorta `tareas` a lo que le corresponde al pase de una plaza: lo que queda
 * para el turno siguiente (categoria='pase_turno' agendado a jornadaProxima) y
 * lo que se resolvió en este turno (listo, hoy). Aparte de construirTextoPase
 * para no acoplar el filtrado de `tareas` a la pantalla que lo llama.
 */
export function datosPaseDeTareas(
  tareas: Tarea[], plaza: string, fecha: string, jornadaProxima: string,
): Pick<DatosPase, 'pendientes' | 'hecho'> {
  return {
    pendientes: tareas.filter(t =>
      t.categoria === 'pase_turno' && t.turno_fecha === jornadaProxima && t.plaza === plaza && t.estado !== 'listo'),
    hecho: tareas.filter(t =>
      !t.parent_id && t.categoria !== 'pedido_nota' && t.plaza === plaza &&
      t.turno_fecha === fecha && t.estado === 'listo'),
  }
}
