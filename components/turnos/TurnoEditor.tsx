'use client'

// Editor de un turno (persona + día): tipo, horario, una nota del turno
// ("cubre a Zoe", "sale antes") y "Repetir en" para llevar el mismo turno a
// otros días de la semana sin abrir celda por celda.

import { useState } from 'react'
import { Modal, Avatar } from '@/components/ui'
import { DIAS_CORTO, fechaLarga } from '@/lib/calendario/fechas'
import { TURNO_CONFIG, TURNO_TIPOS, esTrabajo, normalizarTipo, type HorariosTurno, type TurnoTipo } from '@/lib/turnos/tipos'
import { duracionHoras, fmtHoras, hhmm, type TurnoPlanilla } from '@/lib/turnos/planilla'
import type { DatosTurno } from '@/lib/hooks/useTurnos'
import { fieldStyle, labelStyle, type PersonaPlanilla } from './shared'

export interface CeldaEditando {
  persona: PersonaPlanilla
  fecha: string
  turno: TurnoPlanilla | undefined
}

export function TurnoEditor({ celda, semana, horarios, onClose, onGuardar, onQuitar }: {
  celda: CeldaEditando | null
  semana: string[]
  horarios: HorariosTurno
  onClose: () => void
  /** `fechas` incluye siempre el día de la celda. */
  onGuardar: (datos: DatosTurno, fechas: string[]) => Promise<void>
  onQuitar: () => Promise<void>
}) {
  return (
    <Modal open={!!celda} onClose={onClose} maxWidth={420}>
      {celda && (
        <Formulario
          key={`${celda.persona.id}_${celda.fecha}`}
          celda={celda} semana={semana} horarios={horarios}
          onClose={onClose} onGuardar={onGuardar} onQuitar={onQuitar}
        />
      )}
    </Modal>
  )
}

function Formulario({ celda, semana, horarios, onClose, onGuardar, onQuitar }: {
  celda: CeldaEditando
  semana: string[]
  horarios: HorariosTurno
  onClose: () => void
  onGuardar: (datos: DatosTurno, fechas: string[]) => Promise<void>
  onQuitar: () => Promise<void>
}) {
  const inicial = normalizarTipo(celda.turno?.turno_tipo)
  const habitual = (tp: TurnoTipo | null): [string, string] =>
    tp && esTrabajo(tp) ? horarios[tp as keyof HorariosTurno] : ['', '']

  const [tipo, setTipo] = useState<TurnoTipo | null>(inicial)
  const [entrada, setEntrada] = useState(hhmm(celda.turno?.hora_entrada) || habitual(inicial)[0])
  const [salida, setSalida] = useState(hhmm(celda.turno?.hora_salida) || habitual(inicial)[1])
  const [nota, setNota] = useState(celda.turno?.notas ?? '')
  const [dias, setDias] = useState<string[]>([celda.fecha])
  const [guardando, setGuardando] = useState(false)

  const trabajo = esTrabajo(tipo)
  const cruza = trabajo && entrada && salida && salida <= entrada

  const elegirTipo = (tp: TurnoTipo) => {
    // Al cambiar de tipo el horario salta al habitual del nuevo, salvo que ya
    // se haya escrito uno a mano distinto del habitual del anterior.
    const [e0, s0] = habitual(tipo)
    const [e1, s1] = habitual(tp)
    if (!entrada || entrada === e0) setEntrada(e1)
    if (!salida || salida === s0) setSalida(s1)
    setTipo(tp)
  }

  const toggleDia = (f: string) => {
    if (f === celda.fecha) return
    setDias(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])
  }
  const atajo = (fs: string[]) => setDias([...new Set([celda.fecha, ...fs])])

  const guardar = async () => {
    if (!tipo) return
    setGuardando(true)
    try {
      await onGuardar({
        turno_tipo: tipo,
        hora_entrada: trabajo ? entrada || null : null,
        hora_salida: trabajo ? salida || null : null,
        notas: nota.trim() || null,
      }, semana.filter(f => dias.includes(f)))
    } finally { setGuardando(false) }
  }

  const quitar = async () => {
    setGuardando(true)
    try { await onQuitar() } finally { setGuardando(false) }
  }

  return (
    <div style={{ padding: '20px 18px', paddingBottom: 'max(env(safe-area-inset-bottom, 18px), 18px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={celda.persona.nombre} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{celda.persona.nombre}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{fechaLarga(celda.fecha)}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', color: 'var(--text-3)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
        </button>
      </div>

      <div role="radiogroup" aria-label="Tipo de turno" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(108px, 1fr))', gap: 6 }}>
        {TURNO_TIPOS.map(tp => {
          const on = tipo === tp
          const cfg = TURNO_CONFIG[tp]
          return (
            <button key={tp} type="button" role="radio" aria-checked={on} onClick={() => elegirTipo(tp)} className="turno-opcion" style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '11px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${on ? cfg.color : 'var(--border)'}`, borderLeft: `3px solid ${on ? cfg.color : 'var(--border)'}`,
              background: on ? cfg.color + '1f' : 'var(--surface)', color: 'var(--text-1)', fontSize: 13.5, fontWeight: on ? 700 : 600, textAlign: 'left',
            }}>
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18, color: on ? cfg.color : 'var(--text-3)' }}>{cfg.icon}</span>
              {cfg.fullLabel}
            </button>
          )
        })}
      </div>

      {trabajo && (
        <div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle} htmlFor="turno-entrada">Entrada</label>
              <input id="turno-entrada" type="time" style={fieldStyle} value={entrada} onChange={e => setEntrada(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle} htmlFor="turno-salida">Salida</label>
              <input id="turno-salida" type="time" style={fieldStyle} value={salida} onChange={e => setSalida(e.target.value)} />
            </div>
          </div>
          {entrada && salida && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-3)' }}>
              {fmtHoras(duracionHoras(entrada, salida))}{cruza ? ' · termina al día siguiente' : ''}
            </div>
          )}
        </div>
      )}

      {tipo && (
        <div>
          <label style={labelStyle} htmlFor="turno-nota">Nota del turno <span style={{ fontWeight: 500, color: 'var(--text-3)' }}>(opcional)</span></label>
          <input id="turno-nota" style={fieldStyle} value={nota} maxLength={140} placeholder="Cubre a Zoe, sale antes…"
            onChange={e => setNota(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') guardar() }} />
        </div>
      )}

      {tipo && (
        <div>
          <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
            Repetir en
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => atajo(semana.slice(0, 5))} style={atajoStyle}>Lun a vie</button>
            <button type="button" onClick={() => atajo(semana)} style={atajoStyle}>Toda la semana</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 5 }}>
            {semana.map((f, i) => {
              const on = dias.includes(f)
              const fijo = f === celda.fecha
              return (
                <button key={f} type="button" aria-pressed={on} disabled={fijo} onClick={() => toggleDia(f)} style={{
                  padding: '8px 0', borderRadius: 9, cursor: fijo ? 'default' : 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${on ? 'var(--navy)' : 'var(--border)'}`,
                  background: on ? 'var(--navy)' : 'var(--surface)', color: on ? '#fff' : 'var(--text-2)',
                  fontSize: 12, fontWeight: 700, lineHeight: 1.25,
                }}>
                  {DIAS_CORTO[i]}
                  <div style={{ fontSize: 11, fontWeight: 500, opacity: .8, fontVariantNumeric: 'tabular-nums' }}>{Number(f.slice(8))}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        {celda.turno && (
          <button type="button" onClick={quitar} disabled={guardando} style={{
            flex: 1, padding: '13px 12px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)',
            fontSize: 14, fontWeight: 600, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit',
          }}>Quitar turno</button>
        )}
        <button type="button" onClick={guardar} disabled={!tipo || guardando} style={{
          flex: 2, padding: '13px 12px', borderRadius: 12, border: 'none', background: tipo ? 'var(--navy)' : 'var(--border)',
          fontSize: 14, fontWeight: 700, color: '#fff', cursor: tipo ? 'pointer' : 'default', opacity: guardando ? 0.6 : 1, fontFamily: 'inherit',
        }}>
          {guardando ? 'Guardando…' : dias.length > 1 ? `Guardar en ${dias.length} días` : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

const atajoStyle: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 12, fontWeight: 700, color: 'var(--accent)',
}
