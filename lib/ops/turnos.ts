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
 * ⚠️ Probablemente NO es la que buscás: sin callers propios desde que
 * `turnoVigente()` la reemplazó en los dos que tenía. **Para elegir qué turno
 * MOSTRAR en una pantalla, usá `turnoVigente({turnos})`**, que resuelve jornada
 * y turno acoplados (y respeta el pase si le pasás `plaza`+`entregados`).
 *
 * Esta mira hacia atrás a propósito: el último turno que arrancó sigue siendo
 * el turno hasta que arranca el siguiente, así ningún registro queda huérfano
 * en los huecos entre turnos (ej. 01:30-09:00, cocina cerrada pero alguien
 * tildando mientras cierra la caja). Eso la hace correcta para **atribuir un
 * registro** y equivocada para **elegir qué mostrar**: combinada a mano con
 * `hoyOperativo()` devuelve pares (jornada, turno) que nunca existieron —
 * entre el corte de jornada (05:00) y el primer turno (09:00) la jornada ya
 * rodó a hoy pero esta sigue devolviendo la cena de anoche. Bug real: ago 2026,
 * la rutina de turno abría en el turno tarde para el que llegaba a las 8:45.
 *
 * `hasta` no se usa acá — es solo informativo (para avisar "este turno ya
 * debería haber cerrado"), nunca determina la atribución.
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
 * El turno inmediatamente siguiente en la secuencia circular, con su jornada.
 * Espejo exacto de turnoAnterior: cerrar el último turno del día avanza la
 * jornada un día, porque el almuerzo que sigue a la cena del 5 es el del 6.
 */
export function turnoSiguiente(
  jornada: string, turnoId: string, turnos: TurnoServicio[],
): { jornada: string; turnoId: string } | null {
  const activos = turnos.filter(t => t.activo)
  if (activos.length === 0) return null
  const ordenados = ordenarPorHorario(activos)
  const idx = ordenados.findIndex(t => t.id === turnoId)
  if (idx === -1) return null
  if (idx === ordenados.length - 1) return { jornada: sumarDias(jornada, 1), turnoId: ordenados[0].id }
  return { jornada, turnoId: ordenados[idx + 1].id }
}

// ── Pase de turno explícito (Fase 4, ago 2026) ───────────────────────────
// El turno vigente ya no lo adivina el reloj: lo decide la entrega. Cuando una
// plaza termina de cargar su cierre y toca "Entregar plaza", queda una fila en
// cierres_turno y desde ese instante esa plaza está en el turno siguiente —
// sean las 01:20 o las 16:00. El horario pasa a ser la red de contención de la
// plaza que no entrega nunca, no la fuente de verdad.

/** Clave de una entrega. Misma forma acá y en useCierresTurno — no reimplementar. */
export function claveCierre(jornada: string, turnoId: string, plaza: string): string {
  return `${jornada}|${turnoId}|${plaza}`
}

/**
 * Turno que dicta el reloj, coherente con la jornada que devuelve hoyOperativo.
 *
 * turnoActivo() responde otra pregunta ("cuál arrancó último") y, cuando todavía
 * no arrancó ninguno, cae al último de la lista — el de anoche. Eso es cierto a
 * las 02:00, donde la jornada TAMBIÉN sigue siendo la de ayer, y falso a las
 * 08:00: ahí la jornada ya rodó (corte 05:00) pero el turno seguía apuntando a
 * la cena de anoche, así que el que entraba temprano a hacer el mise del
 * almuerzo se encontraba parado sobre un turno que todavía no había pasado.
 * Acá las dos respuestas hablan siempre del mismo día.
 */
function turnoPorReloj(now: Date, ordenados: TurnoServicio[], tz: string, corte: number): TurnoServicio {
  const nowMin = minutosDelDiaEnTz(now, tz)
  for (let i = ordenados.length - 1; i >= 0; i--) {
    if (minutosDeHHMM(ordenados[i].desde) <= nowMin) return ordenados[i]
  }
  // Antes del corte la jornada sigue siendo la de ayer → el turno de anoche,
  // que cruzó medianoche y todavía está cerrando. Pasado el corte la jornada ya
  // es la de hoy y el de anoche no le pertenece → el primero que viene.
  return nowMin < corte * 60 ? ordenados[ordenados.length - 1] : ordenados[0]
}

/**
 * Dónde está parada una plaza ahora mismo: (jornada, turno).
 *
 * Orden de prioridad, y es lo único que hay que entender de esta función:
 *   1. el pase — si la plaza ya entregó el turno que resolvió el reloj, avanza;
 *   2. el reloj — si no hubo entrega, el horario configurado.
 *
 * Sin `plaza`/`entregados` degrada al reloj solo, que es lo que necesitan los
 * callers que no operan sobre una plaza concreta (ver syncMise).
 */
export function turnoVigente(opts: {
  now?: Date
  turnos: TurnoServicio[]
  entregados?: ReadonlySet<string>
  plaza?: string | null
  tz?: string
  corte?: number
}): { jornada: string; turnoId: string } | null {
  const {
    now = new Date(), turnos, entregados, plaza,
    tz = TZ_DEFAULT, corte = CORTE_JORNADA_DEFAULT,
  } = opts
  const activos = turnos.filter(t => t.activo)
  if (activos.length === 0) return null
  const ordenados = ordenarPorHorario(activos)

  let jornada = hoyOperativo(now, corte, tz)
  let turnoId = turnoPorReloj(now, ordenados, tz, corte).id
  if (!plaza || !entregados || entregados.size === 0) return { jornada, turnoId }

  // Mientras esta plaza ya haya entregado el turno en el que está parada,
  // avanzar. El loop cubre dos entregas seguidas (cerró almuerzo y cena
  // temprano) y corta siempre: el tope es la cantidad de turnos activos.
  for (let i = 0; i < ordenados.length && entregados.has(claveCierre(jornada, turnoId, plaza)); i++) {
    const sig = turnoSiguiente(jornada, turnoId, ordenados)
    if (!sig) break
    jornada = sig.jornada
    turnoId = sig.turnoId
  }
  return { jornada, turnoId }
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
