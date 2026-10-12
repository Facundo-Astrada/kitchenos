// La planilla semanal de personal — lógica pura, sin React ni Supabase, para
// poder testearla. La pantalla (/turnos) y el aviso al equipo salen de acá:
// horas, cobertura por día, avisos de descanso y el texto para compartir.

import { addDays, minutos, DIAS_CORTO, dowLunes, parse, etiquetaRango } from '@/lib/calendario/fechas'
import {
  TURNO_CONFIG, HORARIOS_DEFAULT, TIPOS_DE_TRABAJO, normalizarTipo, esTrabajo,
  type TurnoTipo, type HorariosTurno,
} from './tipos'

/** Lo que la planilla necesita de una fila de `turnos`. */
export interface TurnoPlanilla {
  miembro_id: string
  fecha: string
  turno_tipo: string
  hora_entrada: string | null
  hora_salida: string | null
  notas?: string | null
}

export type IndiceTurnos = Record<string, TurnoPlanilla>

export const claveTurno = (miembroId: string, fecha: string) => `${miembroId}_${fecha}`

export function indexarTurnos<T extends TurnoPlanilla>(turnos: T[]): Record<string, T> {
  const idx: Record<string, T> = {}
  for (const t of turnos) idx[claveTurno(t.miembro_id, t.fecha)] = t
  return idx
}

/** "09:00:00" (Postgres time) o "09:00" (input type=time) → "09:00". */
export const hhmm = (t: string | null | undefined): string => (t ? t.slice(0, 5) : '')

/** "09:00" → "9", "13:30" → "13:30". El rango "9–17" entra en una celda de 90px. */
export function horaCompacta(t: string | null | undefined): string {
  const v = hhmm(t)
  if (!v) return ''
  const [h, m] = v.split(':')
  return m === '00' ? String(Number(h)) : `${Number(h)}:${m}`
}

/** Entrada y salida efectivas de un turno de trabajo (lo cargado, si no el horario habitual del tipo). */
export function horarioDe(
  t: TurnoPlanilla | undefined | null,
  horarios: HorariosTurno = HORARIOS_DEFAULT,
): { tipo: TurnoTipo; entrada: string; salida: string } | null {
  const tipo = normalizarTipo(t?.turno_tipo)
  if (!t || !tipo || !esTrabajo(tipo)) return null
  const def = horarios[tipo as keyof HorariosTurno] ?? TURNO_CONFIG[tipo].defaultHoras
  const entrada = hhmm(t.hora_entrada) || def?.[0] || ''
  const salida = hhmm(t.hora_salida) || def?.[1] || ''
  return { tipo, entrada, salida }
}

export const rangoCompacto = (entrada: string, salida: string) =>
  entrada && salida ? `${horaCompacta(entrada)}–${horaCompacta(salida)}` : ''

/** Duración en horas entre dos 'HH:MM'. Salida <= entrada = cruza la medianoche (noche 20→02 son 6 h). */
export function duracionHoras(entrada: string, salida: string): number {
  if (!entrada || !salida) return 0
  let mins = minutos(salida) - minutos(entrada)
  if (mins <= 0) mins += 24 * 60
  return mins / 60
}

/** Horas de un turno: 0 en franco/vacaciones, 8 de respaldo si no hay horario que leer. */
export function horasDeTurno(t: TurnoPlanilla | undefined | null, horarios: HorariosTurno = HORARIOS_DEFAULT): number {
  const h = horarioDe(t, horarios)
  if (!h) return 0
  return h.entrada && h.salida ? duracionHoras(h.entrada, h.salida) : 8
}

/** "38 h" / "37,5 h" — sin decimales cuando no hacen falta. */
export function fmtHoras(h: number): string {
  const r = Math.round(h * 10) / 10
  return `${Number.isInteger(r) ? r : r.toLocaleString('es-AR')} h`
}

/* ─── Cobertura ─── */

export interface CoberturaDia {
  /** Personas con turno de trabajo. */
  personas: number
  horas: number
  porTipo: Record<TurnoTipo, number>
  /** Personas del equipo sin nada cargado ese día (ni franco). */
  sinAsignar: number
}

export function coberturaDia(
  fecha: string, miembroIds: string[], idx: IndiceTurnos, horarios: HorariosTurno = HORARIOS_DEFAULT,
): CoberturaDia {
  const porTipo: Record<TurnoTipo, number> = { mañana: 0, tarde: 0, noche: 0, franco: 0, vacaciones: 0 }
  let personas = 0, horas = 0, sinAsignar = 0
  for (const id of miembroIds) {
    const t = idx[claveTurno(id, fecha)]
    const tipo = normalizarTipo(t?.turno_tipo)
    if (!tipo) { sinAsignar++; continue }
    porTipo[tipo]++
    if (esTrabajo(tipo)) { personas++; horas += horasDeTurno(t, horarios) }
  }
  return { personas, horas, porTipo, sinAsignar }
}

export function horasPersona(
  miembroId: string, dias: string[], idx: IndiceTurnos, horarios: HorariosTurno = HORARIOS_DEFAULT,
): number {
  let total = 0
  for (const f of dias) total += horasDeTurno(idx[claveTurno(miembroId, f)], horarios)
  return total
}

/* ─── Avisos ─── */

export const DESCANSO_MIN_H = 12
export const HORAS_SEMANA_MAX = 48
export const DIAS_SEGUIDOS_MAX = 6

export type TipoAviso = 'descanso_corto' | 'sin_franco' | 'horas_semana'

export interface AvisoPlanilla {
  id: string
  tipo: TipoAviso
  miembroId: string
  nombre: string
  /** Día sobre el que cae el aviso; null = es de toda la semana. */
  fecha: string | null
  texto: string
}

/**
 * Lo que conviene mirar antes de publicar la semana. Son avisos, no bloqueos:
 * la planilla se guarda igual (a veces el cierre y la apertura seguidos son
 * lo que hay). El desvío se marca sobre el turno, nunca sobre la persona
 * (DESIGN.md §9).
 *
 * `idx` tiene que traer también la semana anterior: el descanso del lunes y
 * la racha de días seguidos se miden contra lo que pasó antes.
 */
export function avisosPlanilla(
  semana: string[],
  miembros: { id: string; nombre: string }[],
  idx: IndiceTurnos,
  horarios: HorariosTurno = HORARIOS_DEFAULT,
): AvisoPlanilla[] {
  const out: AvisoPlanilla[] = []
  const trabaja = (id: string, f: string) => horarioDe(idx[claveTurno(id, f)], horarios)

  for (const m of miembros) {
    let rachaAvisada = false
    for (const f of semana) {
      const hoy = trabaja(m.id, f)
      if (!hoy) continue

      // Descanso entre el turno de ayer y el de hoy.
      const ayer = trabaja(m.id, addDays(f, -1))
      if (ayer && ayer.entrada && ayer.salida && hoy.entrada) {
        let finAyer = minutos(ayer.salida)
        if (finAyer <= minutos(ayer.entrada)) finAyer += 24 * 60
        const descanso = (24 * 60 + minutos(hoy.entrada) - finAyer) / 60
        if (descanso < DESCANSO_MIN_H) {
          out.push({
            id: `descanso-${m.id}-${f}`, tipo: 'descanso_corto', miembroId: m.id, nombre: m.nombre, fecha: f,
            texto: `Entra ${hoy.entrada} con ${fmtHoras(Math.max(0, descanso))} de descanso (salió ${ayer.salida})`,
          })
        }
      }

      // Días seguidos de trabajo terminando hoy — se avisa una vez por semana.
      if (!rachaAvisada) {
        let racha = 1
        for (let g = addDays(f, -1); racha <= 14 && trabaja(m.id, g); g = addDays(g, -1)) racha++
        if (racha > DIAS_SEGUIDOS_MAX) {
          rachaAvisada = true
          out.push({
            id: `racha-${m.id}-${f}`, tipo: 'sin_franco', miembroId: m.id, nombre: m.nombre, fecha: f,
            texto: `${racha} días seguidos sin franco`,
          })
        }
      }
    }

    const total = horasPersona(m.id, semana, idx, horarios)
    if (total > HORAS_SEMANA_MAX) {
      out.push({
        id: `horas-${m.id}-${semana[0]}`, tipo: 'horas_semana', miembroId: m.id, nombre: m.nombre, fecha: null,
        texto: `${fmtHoras(total)} en la semana (más de ${HORAS_SEMANA_MAX})`,
      })
    }
  }
  return out
}

/* ─── Aviso al equipo y texto para compartir ─── */

/** Una línea por turno: "Lun 12 mañana 9–17". */
function lineaDia(f: string, t: TurnoPlanilla | undefined, horarios: HorariosTurno): string | null {
  const tipo = normalizarTipo(t?.turno_tipo)
  if (!tipo) return null
  const dia = `${DIAS_CORTO[dowLunes(f)]} ${parse(f).getDate()}`
  const h = horarioDe(t, horarios)
  const base = `${dia} ${TURNO_CONFIG[tipo].fullLabel.toLowerCase()}`
  return h ? `${base} ${rangoCompacto(h.entrada, h.salida)}`.trim() : base
}

/** Cuerpo del aviso de la semana para una persona. '' si no tiene nada cargado. */
export function resumenSemanaPersona(
  miembroId: string, semana: string[], idx: IndiceTurnos, horarios: HorariosTurno = HORARIOS_DEFAULT,
): string {
  return semana
    .map(f => lineaDia(f, idx[claveTurno(miembroId, f)], horarios))
    .filter(Boolean)
    .join(' · ')
}

/**
 * Huella de la semana de una persona — cambia si cambia cualquier turno.
 * Sirve para avisar solo a quien le cambió algo desde el último aviso.
 */
export function firmaSemanaPersona(
  miembroId: string, semana: string[], idx: IndiceTurnos, horarios: HorariosTurno = HORARIOS_DEFAULT,
): string {
  return semana.map(f => {
    const t = idx[claveTurno(miembroId, f)]
    const tipo = normalizarTipo(t?.turno_tipo)
    if (!tipo) return '-'
    const h = horarioDe(t, horarios)
    return h ? `${tipo}|${h.entrada}|${h.salida}` : tipo
  }).join(',')
}

/** La semana en texto plano, agrupada por día y turno — para pegar en el grupo de WhatsApp. */
export function textoPlanilla(
  semana: string[],
  miembros: { id: string; nombre: string }[],
  idx: IndiceTurnos,
  horarios: HorariosTurno = HORARIOS_DEFAULT,
): string {
  const lineas: string[] = [`*Turnos ${etiquetaRango(semana[0], semana[semana.length - 1])}*`]
  for (const f of semana) {
    const grupos: string[] = []
    for (const tipo of [...TIPOS_DE_TRABAJO, 'franco', 'vacaciones'] as TurnoTipo[]) {
      const gente = miembros.flatMap(m => {
        const t = idx[claveTurno(m.id, f)]
        if (normalizarTipo(t?.turno_tipo) !== tipo) return []
        const h = horarioDe(t, horarios)
        const def = horarios[tipo as keyof HorariosTurno]
        // El horario solo se aclara cuando se sale del habitual del tipo.
        const distinto = h && def && (h.entrada !== def[0] || h.salida !== def[1])
        return [distinto ? `${m.nombre} (${rangoCompacto(h.entrada, h.salida)})` : m.nombre]
      })
      if (gente.length === 0) continue
      const def = horarios[tipo as keyof HorariosTurno]
      const cab = def ? `${TURNO_CONFIG[tipo].fullLabel} ${rangoCompacto(def[0], def[1])}` : TURNO_CONFIG[tipo].fullLabel
      grupos.push(`  ${cab}: ${gente.join(', ')}`)
    }
    if (grupos.length === 0) continue
    lineas.push('', `*${DIAS_CORTO[dowLunes(f)]} ${parse(f).getDate()}/${parse(f).getMonth() + 1}*`, ...grupos)
  }
  return lineas.join('\n')
}

/** Los siete días (lunes a domingo) de la semana que arranca en `lunes`. */
export function semanaDe(lunes: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(lunes, i))
}
