/**
 * Cómo se calcula el avance de la ruta de implantación.
 *
 * La regla que hace que este número signifique algo: **solo el checkpoint de
 * inserción suma al porcentaje**. La carga habilita la estación siguiente, pero
 * no cuenta — si contara, un restaurante que cargó todo y no usa nada mostraría
 * 100% y el número sería una mentira útil para nadie.
 *
 * Y la regla que lo hace seguro (DECISIONES.md § 25): esto mide **al
 * restaurante**. En ninguna parte de este archivo entra una persona.
 */
import {
  HITOS, ESTACIONES, estacionesDeHito,
  type Estacion, type HitoId, type MetricasRuta,
} from './ruta'

export type EstadoEstacion = 'pendiente' | 'cargada' | 'insertada'

/** Confirmaciones a mano, para las estaciones que no se pueden medir solas. */
export interface ConfirmacionesManuales {
  carga: string[]       // ids de estación
  insercion: string[]
}

export const SIN_CONFIRMACIONES: ConfirmacionesManuales = { carga: [], insercion: [] }

export function estadoDeEstacion(
  e: Estacion, m: MetricasRuta, manual: ConfirmacionesManuales = SIN_CONFIRMACIONES,
): EstadoEstacion {
  const insertada = e.insercion
    ? e.insercion(m) || manual.insercion.includes(e.id)
    : manual.insercion.includes(e.id)
  if (insertada) return 'insertada'

  const cargada = e.carga
    ? e.carga(m) || manual.carga.includes(e.id)
    : manual.carga.includes(e.id)
  return cargada ? 'cargada' : 'pendiente'
}

export interface ProgresoHito {
  hito: HitoId
  n: number
  nombre: string
  pregunta: string
  diaObjetivo: number | null
  opcional: boolean
  total: number
  cargadas: number
  insertadas: number
  /** 0-100, sobre inserción. */
  pct: number
  estado: 'pendiente' | 'en-curso' | 'completo'
}

export interface ProgresoRuta {
  hitos: ProgresoHito[]
  /** Estaciones insertadas sobre el total que aplica. */
  insertadas: number
  total: number
  /** El número grande: 0-100. */
  pct: number
  /** La estación que sigue — el único CTA de la pantalla. */
  siguiente: Estacion | null
  /** Día de la implantación, si se conoce la fecha de alta. */
  dia: number | null
}

/**
 * @param incluirSalon el hito 6 no aplica a todos los negocios. Excluirlo del
 *   denominador evita que una cocina sin salón tope en 87% para siempre — un
 *   techo inalcanzable desmotiva más que no tener número.
 */
export function calcularProgreso(
  m: MetricasRuta,
  manual: ConfirmacionesManuales = SIN_CONFIRMACIONES,
  opts: { incluirSalon?: boolean; diasDesdeAlta?: number | null } = {},
): ProgresoRuta {
  const incluirSalon = opts.incluirSalon ?? false

  const hitosVisibles = HITOS.filter(h => incluirSalon || !h.opcional)

  const hitos: ProgresoHito[] = hitosVisibles.map(h => {
    const ests = estacionesDeHito(h.id)
    const estados = ests.map(e => estadoDeEstacion(e, m, manual))
    const insertadas = estados.filter(s => s === 'insertada').length
    const cargadas = estados.filter(s => s !== 'pendiente').length
    const pct = ests.length > 0 ? Math.round((insertadas / ests.length) * 100) : 0
    return {
      hito: h.id, n: h.n, nombre: h.nombre, pregunta: h.pregunta,
      diaObjetivo: h.diaObjetivo, opcional: !!h.opcional,
      total: ests.length, cargadas, insertadas, pct,
      estado: insertadas === ests.length ? 'completo' : cargadas > 0 ? 'en-curso' : 'pendiente',
    }
  })

  const aplicables = ESTACIONES.filter(e =>
    incluirSalon || HITOS.find(h => h.id === e.hito)?.opcional !== true)

  const insertadas = aplicables.filter(e => estadoDeEstacion(e, m, manual) === 'insertada').length

  // La siguiente es la primera no insertada en el orden de la ruta. El orden
  // importa: son dependencias reales, no una lista de deseos.
  const siguiente = aplicables.find(e => estadoDeEstacion(e, m, manual) !== 'insertada') ?? null

  return {
    hitos,
    insertadas,
    total: aplicables.length,
    pct: aplicables.length > 0 ? Math.round((insertadas / aplicables.length) * 100) : 0,
    siguiente,
    dia: opts.diasDesdeAlta ?? null,
  }
}

/**
 * Si la implantación va con retraso contra el reloj de 90 días.
 *
 * Se usa para informar, nunca para presionar: el tono importa porque el mismo
 * dato dicho como reproche es exactamente lo que la investigación de cocina
 * marca como predictor de que la gente se vaya.
 */
export function hitoAtrasado(h: ProgresoHito, dia: number | null): boolean {
  if (dia === null || h.diaObjetivo === null) return false
  return dia > h.diaObjetivo && h.estado !== 'completo'
}
