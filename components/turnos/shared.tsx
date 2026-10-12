'use client'

// Piezas compartidas por la planilla de Turnos (grilla desktop, lista mobile,
// panel del día, editor). Un turno se ve igual en todas: rail de color de su
// tipo + ícono + horario — la misma forma que una píldora del Calendario, así
// el ojo no aprende dos lenguajes para "algo que pasa un día".

import type { CSSProperties } from 'react'
import { TURNO_CONFIG, normalizarTipo, type TurnoTipo } from '@/lib/turnos/tipos'
import { horarioDe, rangoCompacto, type TurnoPlanilla } from '@/lib/turnos/planilla'
import type { HorariosTurno } from '@/lib/turnos/tipos'

export interface PersonaPlanilla {
  id: string
  nombre: string
  puesto: string | null
  authUserId: string | null
  esYo: boolean
  costoHora: number | null
}

/** Lo que pinta un clic: un tipo de turno, borrar, o nada (el clic abre el editor). */
export type Pincel = TurnoTipo | 'borrar' | null

export const fieldStyle: CSSProperties = {
  width: '100%', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text-1)', fontSize: 14, outline: 'none',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

export const labelStyle: CSSProperties = {
  fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6, display: 'block',
}

export const tituloSeccion: CSSProperties = {
  fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em',
}

const COLOR_DESCONOCIDO = '#64748b'

/** Config visual de un `turno_tipo` crudo — tolera valores que la grilla no conoce. */
export function visualDe(crudo: string | null | undefined) {
  const tipo = normalizarTipo(crudo)
  if (tipo) return { tipo, ...TURNO_CONFIG[tipo] }
  const txt = (crudo ?? '').trim()
  return {
    tipo: null, label: txt.charAt(0).toUpperCase(), fullLabel: txt ? txt.charAt(0).toUpperCase() + txt.slice(1) : 'Turno',
    icon: 'schedule', color: COLOR_DESCONOCIDO, bg: 'var(--bg)',
  }
}

/** El turno dentro de una celda / fila. `aviso` = texto del aviso que cae sobre este turno. */
export function TurnoPill({ turno, horarios, aviso, grande, compacta }: {
  turno: TurnoPlanilla
  horarios: HorariosTurno
  aviso?: string
  /** Fila de la lista mobile. */
  grande?: boolean
  /** Celda angosta (grilla con el panel al lado): "Mañana" tiene que entrar en ~75 px. */
  compacta?: boolean
}) {
  const v = visualDe(turno.turno_tipo)
  const h = horarioDe(turno, horarios)
  // Nota y aviso van en el renglón del horario: en el del nombre le comían el
  // ancho y "Mañana" quedaba en "Mañ…".
  const marcas = (turno.notas || aviso) && (
    <span style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 'auto', flexShrink: 0 }}>
      {turno.notas && <span className="material-symbols-outlined" title={turno.notas} style={{ fontSize: 13, color: 'var(--text-3)' }}>sticky_note_2</span>}
      {aviso && <span className="material-symbols-outlined" title={aviso} style={{ fontSize: 13, color: 'var(--text-2)' }}>error</span>}
    </span>
  )
  return (
    <span
      // key por tipo: al cambiar de tipo el nodo se monta de nuevo y repite la entrada.
      key={v.fullLabel}
      className="turno-pill"
      style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1, width: '100%', height: '100%', minWidth: 0,
        padding: grande ? '6px 10px' : compacta ? '4px 5px' : '4px 7px', borderRadius: 8, textAlign: 'left',
        background: v.color + '1f', border: `1px solid ${v.color}40`, borderLeft: `3px solid ${v.color}`,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: compacta ? 3 : 4, minWidth: 0 }}>
        <span className="material-symbols-outlined" style={{ fontSize: grande ? 15 : compacta ? 12 : 13, color: v.color, flexShrink: 0 }}>{v.icon}</span>
        <span style={{ fontSize: grande ? 13.5 : compacta ? 12 : 12.5, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {v.fullLabel}
        </span>
        {!h && marcas}
      </span>
      {h && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: grande ? 12 : 11, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {rangoCompacto(h.entrada, h.salida)}
          {marcas}
        </span>
      )}
    </span>
  )
}

/** Barra apilada de cobertura por tipo (divs con width %, sin librería de gráficos). */
export function BarraCobertura({ porTipo, total }: { porTipo: Record<TurnoTipo, number>; total: number }) {
  const tipos: TurnoTipo[] = ['mañana', 'tarde', 'noche']
  return (
    <span aria-hidden style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', background: 'var(--border)', width: '100%' }}>
      {total > 0 && tipos.map(tp => porTipo[tp] > 0 && (
        <span key={tp} style={{ width: `${(porTipo[tp] / total) * 100}%`, background: TURNO_CONFIG[tp].color }} />
      ))}
    </span>
  )
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      display: 'inline-block', minWidth: 18, padding: '0 5px', borderRadius: 5, border: '1px solid var(--border)',
      background: 'var(--surface)', fontSize: 10.5, fontFamily: 'inherit', fontWeight: 700, color: 'var(--text-2)', textAlign: 'center',
    }}>{children}</kbd>
  )
}
