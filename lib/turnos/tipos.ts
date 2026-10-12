// Tipos de turno de la grilla de personal (tabla `turnos`). No confundir con
// los turnos de SERVICIO (almuerzo/cena, lib/ops/turnos.ts) ni con el fichaje
// (`turnos_personal`) — ver .claude/docs/glosario.md.

export type TurnoTipo = 'mañana' | 'tarde' | 'noche' | 'franco' | 'vacaciones'

export interface TurnoTipoConfig {
  label: string
  fullLabel: string
  icon: string
  color: string
  /** Fondo pastel legado. La grilla nueva tiñe con `color` + alfa (adapta a oscuro). */
  bg: string
  /** Horario al asignar el tipo — precarga, no ata (se pisa por persona/día). */
  defaultHoras?: [string, string]
}

// Colores: el día en tres luces — cielo de la mañana, naranja del atardecer,
// violeta de la noche. Ninguno es ámbar ni rojo a propósito: en DESIGN.md §3
// el ámbar es "atención" y la grilla lo necesita libre para lo que hay que
// revisar. Antes Mañana era ámbar y Tarde/Noche compartían el mismo azul.
export const TURNO_CONFIG: Record<TurnoTipo, TurnoTipoConfig> = {
  mañana:     { label: 'M', fullLabel: 'Mañana',     icon: 'wb_sunny',     color: '#0ea5e9', bg: 'var(--blue-bg)', defaultHoras: ['09:00', '17:00'] },
  tarde:      { label: 'T', fullLabel: 'Tarde',      icon: 'wb_twilight',  color: '#f97316', bg: 'var(--bg)', defaultHoras: ['13:00', '21:00'] },
  noche:      { label: 'N', fullLabel: 'Noche',      icon: 'dark_mode',    color: '#8b5cf6', bg: 'var(--blue-bg)', defaultHoras: ['20:00', '02:00'] },
  franco:     { label: 'F', fullLabel: 'Franco',     icon: 'weekend',      color: '#64748b', bg: 'var(--bg)' },
  vacaciones: { label: 'V', fullLabel: 'Vacaciones', icon: 'beach_access', color: '#10b981', bg: 'var(--green-bg)' },
}

export const TURNO_TIPOS = Object.keys(TURNO_CONFIG) as TurnoTipo[]
export const TIPOS_DE_TRABAJO: TurnoTipo[] = ['mañana', 'tarde', 'noche']

/** Horarios habituales por tipo. Clave de `restaurantes.configuracion`. */
export type HorariosTurno = Record<'mañana' | 'tarde' | 'noche', [string, string]>

export const HORARIOS_DEFAULT: HorariosTurno = {
  mañana: TURNO_CONFIG.mañana.defaultHoras!,
  tarde: TURNO_CONFIG.tarde.defaultHoras!,
  noche: TURNO_CONFIG.noche.defaultHoras!,
}

// Filas viejas (seeds e importaciones previas a la grilla) guardaron el turno
// de servicio en `turno_tipo`. Sin esto, TURNO_CONFIG['cena'] es undefined y
// la pantalla entera se cae al leer `.color`.
const ALIAS: Record<string, TurnoTipo> = { almuerzo: 'mañana', manana: 'mañana', cena: 'noche' }

/** `turno_tipo` crudo de la base → tipo conocido, o null si no se puede leer. */
export function normalizarTipo(crudo: string | null | undefined): TurnoTipo | null {
  if (!crudo) return null
  const t = crudo.trim().toLowerCase()
  if (t in TURNO_CONFIG) return t as TurnoTipo
  return ALIAS[t] ?? null
}

export const esTrabajo = (tipo: TurnoTipo | null | undefined): boolean =>
  !!tipo && tipo !== 'franco' && tipo !== 'vacaciones'
