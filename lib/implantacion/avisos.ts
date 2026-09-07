/**
 * Los avisos de la ruta de implantación.
 *
 * Cuatro reglas, todas de `DECISIONES.md` § 25 y del research que las sostiene.
 * Están acá, en una función pura, y no repartidas por las pantallas:
 *
 * 1. **Al responsable, con nombre.** Nunca "a los admins". Nombrar un grupo en
 *    vez de una persona produce difusión de responsabilidad de forma
 *    predecible; un aviso que le llega a todos no lo atiende nadie.
 * 2. **Nombrá la consecuencia, no la tarea.** "Tu CMV se calcula sobre el 60%
 *    de la carta" mueve; "completá tus recetas" no.
 * 3. **Recordatorio como máximo 1 por día**, y muere cuando la estación se
 *    completa. Nada de recordatorios que sobreviven a su motivo.
 * 4. **Reconocimiento semanal, nunca diario, y del equipo.** Quien recibe
 *    reconocimiento a diario puntúa 12% más bajo en confianza en la dirección
 *    que quien lo recibe semanalmente. Y sin nombres: los rankings entre
 *    personas se dan vuelta justo en trabajo colaborativo, sensible a la
 *    calidad y obligatorio — una cocina es las tres cosas a la vez.
 */
import type { Estacion } from './ruta'

export const TIPO_RECORDATORIO = 'ruta_recordatorio'
export const TIPO_RECONOCIMIENTO = 'ruta_reconocimiento'

/** Milisegundos de cada cadencia. La asimetría es el punto de todo esto. */
export const CADENCIA_RECORDATORIO_MS = 24 * 60 * 60 * 1000
export const CADENCIA_RECONOCIMIENTO_MS = 7 * 24 * 60 * 60 * 1000

/**
 * La consecuencia de que cada estación no pase, en el idioma de quien la lee.
 * Lo que falta acá cae al texto genérico de `textoRecordatorio()`, que también
 * habla de consecuencia y no de tarea.
 */
const CONSECUENCIA: Record<string, string> = {
  '0.2': 'Sin las facturas cargadas, el costo de cada plato se calcula con precios viejos.',
  '0.3': 'Sin las recetas cargadas no hay food cost: los precios se fijan a ojo.',
  '1.3': 'El equipo que no entró a la app no ve su mise ni recibe el pase.',
  '1.4': 'Hay áreas activas sin nadie que responda: cuando algo falle no va a haber a quién preguntarle.',
  '1.5': 'Sin la matriz cargada no se sabe qué plaza queda sin cubrir si falta alguien.',
  '2.2': 'Los platos sin receta vinculada no entran en ningún cálculo de costo.',
  '2.3': 'Sin gramaje real, el food cost de esos platos está inventado.',
  '3.2': 'Las semanas sin facturas cargadas hacen que el CMV del mes dé más bajo de lo real.',
  '3.3': 'Los ingredientes sin producto linkeado no actualizan su costo cuando cambia el precio.',
  '4.3': 'Una plaza sin mise cargado arranca el turno sin saber qué preparar.',
  '4.6': 'Sin entregar el pase, el que entra no sabe qué quedó a medias.',
  '4.7': 'Los registros de temperatura son obligatorios: sin ellos, una inspección encuentra el hueco.',
  '5.1': 'La merma sin registrar aparece igual en el costo, pero sin saber de dónde salió.',
  '5.2': 'Sin presupuesto cargado no hay contra qué comparar el gasto del mes.',
}

export interface Aviso {
  tipo: typeof TIPO_RECORDATORIO | typeof TIPO_RECONOCIMIENTO
  /** Destinatario. `null` solo en reconocimiento, que va al equipo. */
  usuarioId: string | null
  titulo: string
  cuerpo: string
  link: string
}

export function textoRecordatorio(e: Estacion, href: string): Omit<Aviso, 'tipo' | 'usuarioId'> {
  const consecuencia = CONSECUENCIA[e.id]
    ?? `Mientras esto no esté, ${e.insercionLabel.toLowerCase()} no puede pasar.`
  return { titulo: e.titulo, cuerpo: consecuencia, link: href }
}

/**
 * ¿Se puede mandar un recordatorio a esta persona?
 *
 * @param ultimoISO cuándo se le mandó el último recordatorio, de cualquier estación.
 */
export function puedeRecordar(ultimoISO: string | null | undefined, ahora = new Date()): boolean {
  if (!ultimoISO) return true
  return ahora.getTime() - new Date(ultimoISO).getTime() >= CADENCIA_RECORDATORIO_MS
}

export function puedeReconocer(ultimoISO: string | null | undefined, ahora = new Date()): boolean {
  if (!ultimoISO) return true
  return ahora.getTime() - new Date(ultimoISO).getTime() >= CADENCIA_RECONOCIMIENTO_MS
}

/**
 * Después de tres recordatorios ignorados, la lectura correcta no es "hay que
 * insistir más": es que la estación está en la persona equivocada. Insistir una
 * cuarta vez es el camino directo a que se apaguen los avisos para siempre.
 */
export const IGNORADOS_PARA_REASIGNAR = 3

export function debeSugerirReasignar(ignorados: number): boolean {
  return ignorados >= IGNORADOS_PARA_REASIGNAR
}

/**
 * El reconocimiento semanal: del equipo, sin nombres, y sobre lo que se
 * SOSTUVO, no sobre quién hizo más.
 */
export function textoReconocimiento(
  insertadasEstaSemana: number, pct: number,
): Omit<Aviso, 'tipo' | 'usuarioId'> | null {
  if (insertadasEstaSemana <= 0) return null
  return {
    titulo: insertadasEstaSemana === 1
      ? 'Esta semana el equipo dejó una función funcionando sola'
      : `Esta semana el equipo dejó ${insertadasEstaSemana} funciones funcionando solas`,
    cuerpo: `La organización del local está en ${pct}%. Nadie tuvo que pedirlo.`,
    link: '/implantacion',
  }
}
