// Jornada operativa — la fecha del restaurante no rueda a medianoche.
// new Date().toISOString().slice(0,10) devuelve la fecha de MAÑANA desde las
// 21:00 ART (UTC-3): eso corrompía silenciosamente el mise (cierre de cena
// guardado con fecha de mañana, la apertura del día siguiente nunca lo
// encontraba) y el fichaje (fichar entrada a las 20:00 y no poder cerrar
// turno a las 21:30 porque la app busca el fichaje en otra fecha).
// Fix: resolver SIEMPRE la fecha/hora de pared con Intl.DateTimeFormat en una
// TZ explícita — nunca con getFullYear()/getHours() a secas (rompen en el
// server, donde el proceso corre en UTC) ni restando horas fijas a mano
// (rompe con DST en cualquier TZ que no sea Argentina).

export const TZ_DEFAULT = 'America/Argentina/Buenos_Aires'
// La jornada operativa rueda a las 05:00, no a medianoche — un turno de
// cena que termina 01:30 sigue perteneciendo a la jornada de ayer.
export const CORTE_JORNADA_DEFAULT = 5

function partsEnTz(d: Date, tz: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = fmt.formatToParts(d)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  // Intl puede devolver hour=24 para medianoche en algunos runtimes/locales
  const hour = get('hour') % 24
  return { year: get('year'), month: get('month'), day: get('day'), hour, minute: get('minute') }
}

/** 'YYYY-MM-DD' de la fecha de pared en la TZ dada. */
export function fechaEnTz(d: Date, tz: string = TZ_DEFAULT): string {
  const { year, month, day } = partsEnTz(d, tz)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Hora de pared 0-23 en la TZ dada. */
export function horaEnTz(d: Date, tz: string = TZ_DEFAULT): number {
  return partsEnTz(d, tz).hour
}

/** Minutos desde medianoche (0-1439) de la hora de pared en la TZ dada. */
export function minutosDelDiaEnTz(d: Date, tz: string = TZ_DEFAULT): number {
  const { hour, minute } = partsEnTz(d, tz)
  return hour * 60 + minute
}

/** Minutos desde medianoche de un horario 'HH:MM'. */
function minutosDeHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Suma (o resta, con n negativo) días a una fecha 'YYYY-MM-DD' sin pasar por Date-UTC. */
export function sumarDias(fecha: string, n: number): string {
  const [y, m, day] = fecha.split('-').map(Number)
  // Mediodía UTC: evita que un +1/-1 día cruce un borde de DST/UTC y trunque al día equivocado.
  const d = new Date(Date.UTC(y, m - 1, day, 12, 0, 0))
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Fecha operativa: la jornada de cocina, no el calendario.
 * Antes del corte (default 05:00), la jornada sigue siendo la de ayer.
 */
export function hoyOperativo(now: Date = new Date(), corte: number = CORTE_JORNADA_DEFAULT, tz: string = TZ_DEFAULT): string {
  const fecha = fechaEnTz(now, tz)
  const hora = horaEnTz(now, tz)
  return hora < corte ? sumarDias(fecha, -1) : fecha
}

// ── Turnos de servicio (Fase 2) ──────────────────────────────────────────
// Un TurnoServicio (types/index.ts) es un bloque horario configurable por el
// restaurante (almuerzo 09-17, cena 17-01:30, etc). No confundir con:
// - checklist_registros.turno (fase apertura/cierre del mise — encodeTurnoFase abajo)
// - turnos (grilla de personal), turnos_personal (fichaje), cajas_turnos (caja)
import type { TurnoServicio } from '@/types'

function ordenarPorHorario(turnos: TurnoServicio[]): TurnoServicio[] {
  return [...turnos].sort((a, b) => minutosDeHHMM(a.desde) - minutosDeHHMM(b.desde))
}

/**
 * Turno de servicio vigente en este instante. Regla: el último turno que
 * arrancó sigue siendo el turno hasta que arranca el siguiente — así ningún
 * registro queda huérfano en los huecos entre turnos (ej. 01:30-09:00,
 * cocina cerrada pero alguien tildando mientras cierra la caja). `hasta` no
 * se usa acá — es solo informativo (para avisar "este turno ya debería
 * haber cerrado"), nunca determina la atribución.
 */
export function turnoActivo(now: Date, turnos: TurnoServicio[], tz: string = TZ_DEFAULT): TurnoServicio | null {
  const activos = turnos.filter(t => t.activo)
  if (activos.length === 0) return null
  const ordenados = ordenarPorHorario(activos)
  const nowMin = minutosDelDiaEnTz(now, tz)
  for (let i = ordenados.length - 1; i >= 0; i--) {
    if (minutosDeHHMM(ordenados[i].desde) <= nowMin) return ordenados[i]
  }
  // nowMin es menor que el desde del primer turno del día → todavía estamos
  // dentro del último turno de AYER (cruzó medianoche, o la cocina sigue
  // cerrando antes de que arranque el primer turno de hoy).
  return ordenados[ordenados.length - 1]
}

/**
 * El turno inmediatamente anterior en la secuencia circular, con su jornada.
 * Cruzar el primer turno del día retrocede la jornada un día.
 */
export function turnoAnterior(
  jornada: string, turnoId: string, turnos: TurnoServicio[],
): { jornada: string; turnoId: string } | null {
  const activos = turnos.filter(t => t.activo)
  if (activos.length === 0) return null
  const ordenados = ordenarPorHorario(activos)
  const idx = ordenados.findIndex(t => t.id === turnoId)
  if (idx === -1) return null
  if (idx === 0) return { jornada: sumarDias(jornada, -1), turnoId: ordenados[ordenados.length - 1].id }
  return { jornada, turnoId: ordenados[idx - 1].id }
}

/**
 * checklist_registros.turno codifica turno+fase ('cena:apertura') en la
 * misma columna TEXT que antes solo guardaba la fase ('apertura'/'cierre').
 * Se resuelve UNA VEZ al escribir, nunca se re-deriva al leer — si se
 * re-derivara de la hora en cada lectura, cambiar el horario de un turno
 * reescribiría el turno de registros históricos.
 */
export function encodeTurnoFase(turnoId: string, fase: 'apertura' | 'cierre'): string {
  return `${turnoId}:${fase}`
}

/** Compat: filas viejas (previas a turnos de servicio) tienen 'apertura'/'cierre' pelado. */
export function parseTurnoFase(v: string): { turnoId: string | null; fase: 'apertura' | 'cierre' } {
  if (v === 'apertura' || v === 'cierre') return { turnoId: null, fase: v }
  const idx = v.indexOf(':')
  if (idx === -1) return { turnoId: null, fase: 'apertura' }
  const turnoId = v.slice(0, idx)
  const fase: 'apertura' | 'cierre' = v.slice(idx + 1) === 'cierre' ? 'cierre' : 'apertura'
  return { turnoId, fase }
}

// ── Pase de turno incumplido (Fase 3) ────────────────────────────────────
// El cierre de un turno se "cierra solo": no hay flag ni fila que marque
// "no hubo pase" — se deduce de la ausencia de registros de cierre. Ningún
// storage nuevo, imposible que se desincronice.

/**
 * El turno anterior no tuvo NINGÚN registro de cierre completado — el pase
 * de turno no se cumplió en absoluto. No confundir con "quedaron algunos
 * ítems pendientes" (eso es normal y se muestra como lista aparte, ver
 * pendientesTurnoAnterior en checklist/ClientView.tsx): esto es la ausencia
 * total, la señal gruesa para el banner "recibís sin cierre".
 */
export function cierreIncompleto(registrosCierrePrevio: { completado: boolean }[]): boolean {
  return !registrosCierrePrevio.some(r => r.completado)
}
