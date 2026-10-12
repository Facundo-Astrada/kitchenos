'use client'

// Turnos en el celular: siete columnas de 46 px no se leen, así que la semana
// es una tira de días arriba (con cuánta gente trabaja y si hay algo agendado)
// y abajo la lista del equipo para el día elegido. Mismo pincel que desktop:
// con un tipo elegido, tocar a una persona le pinta ese turno.

import type { ItemCalendario } from '@/lib/hooks/useCalendario'
import { DIAS_CORTO, hoy as hoyStr, fechaLarga } from '@/lib/calendario/fechas'
import { CAPA_POR_ID } from '@/lib/calendario/capas'
import { colorItem } from '@/components/calendario/shared'
import { Avatar } from '@/components/ui'
import { claveTurno, type CoberturaDia, type IndiceTurnos, type AvisoPlanilla } from '@/lib/turnos/planilla'
import type { HorariosTurno } from '@/lib/turnos/tipos'
import { TurnoPill, type PersonaPlanilla, type Pincel } from './shared'

export function PlanillaMobile({
  semana, personas, idx, horarios, cobertura, avisos, porDia, conNota, seleccionado,
  pincel, editable, onSeleccionar, onAbrir, onPintar,
}: {
  semana: string[]
  personas: PersonaPlanilla[]
  idx: IndiceTurnos
  horarios: HorariosTurno
  cobertura: Record<string, CoberturaDia>
  avisos: AvisoPlanilla[]
  porDia: Record<string, ItemCalendario[]>
  conNota: Record<string, number>
  seleccionado: string
  pincel: Pincel
  editable: boolean
  onSeleccionar: (fecha: string) => void
  onAbrir: (persona: PersonaPlanilla, fecha: string) => void
  onPintar: (persona: PersonaPlanilla, fecha: string, gesto: number) => void
}) {
  const hoy = hoyStr()
  const f = seleccionado

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Tira de la semana */}
      <div role="tablist" aria-label="Día de la semana" style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4, boxShadow: 'var(--shadow-1)',
      }}>
        {semana.map((d, i) => {
          const sel = d === f
          const esHoy = d === hoy
          const items = porDia[d] ?? []
          const feriado = items.some(it => it.capa === 'feriados')
          const colores = [...new Set(items.map(colorItem))].slice(0, 3)
          const c = cobertura[d]
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={sel}
              aria-label={`${fechaLarga(d)}${esHoy ? ', hoy' : ''}. ${c?.personas ?? 0} trabajando`}
              onClick={() => onSeleccionar(d)}
              style={{
                border: 'none', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', padding: '6px 0 5px', minHeight: 64,
                background: sel ? 'rgba(67,97,160,0.12)' : 'transparent',
                outline: sel ? '2px solid var(--accent)' : 'none', outlineOffset: -2,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: sel || esHoy ? 'var(--accent)' : 'var(--text-3)' }}>{DIAS_CORTO[i].charAt(0)}</span>
              <span style={{
                width: 28, height: 28, lineHeight: '28px', borderRadius: 14, textAlign: 'center',
                fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                background: esHoy ? 'var(--navy)' : 'transparent',
                color: esHoy ? '#fff' : feriado ? CAPA_POR_ID.feriados.color : 'var(--text-1)',
              }}>{Number(d.slice(8))}</span>
              <span style={{ display: 'flex', gap: 3, height: 6, alignItems: 'center' }}>
                {colores.map(col => <span key={col} style={{ width: 6, height: 6, borderRadius: 3, background: col }} />)}
                {(conNota[d] ?? 0) > 0 && colores.length < 3 && <span style={{ width: 6, height: 6, borderRadius: 3, border: '1.5px solid var(--text-3)' }} />}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', fontSize: 10.5, fontWeight: 600, color: c?.personas ? 'var(--text-2)' : 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 11 }}>person</span>
                {c?.personas ?? 0}
              </span>
            </button>
          )
        })}
      </div>

      {/* Equipo del día elegido */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {personas.map(p => {
          const t = idx[claveTurno(p.id, f)]
          const aviso = avisos.filter(a => a.miembroId === p.id && a.fecha === f).map(a => a.texto).join(' · ') || undefined
          const fila = (
            <>
              <Avatar name={p.nombre} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                  {p.esYo && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'rgba(67,97,160,.12)', borderRadius: 99, padding: '1px 6px', flexShrink: 0 }}>Vos</span>}
                </div>
                {p.puesto && <div style={{ fontSize: 11.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.puesto}</div>}
              </div>
              <div style={{ width: 112, flexShrink: 0, alignSelf: 'stretch', display: 'flex' }}>
                {t
                  ? <TurnoPill turno={t} horarios={horarios} aviso={aviso} grande />
                  : editable && <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)', margin: 'auto 6px auto auto' }}>{pincel && pincel !== 'borrar' ? 'brush' : 'add'}</span>}
              </div>
            </>
          )
          const estilo: React.CSSProperties = {
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px 8px 12px', minHeight: 60, width: '100%', textAlign: 'left',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-1)', fontFamily: 'inherit',
          }
          if (!editable) return <div key={p.id} style={estilo}>{fila}</div>
          return (
            <button key={p.id} type="button" style={{ ...estilo, cursor: 'pointer' }}
              onClick={() => (pincel ? onPintar(p, f, Date.now()) : onAbrir(p, f))}>
              {fila}
            </button>
          )
        })}
      </div>
    </div>
  )
}
