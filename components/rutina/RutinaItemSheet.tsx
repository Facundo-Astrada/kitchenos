'use client'

import { useState } from 'react'
import { SheetChrome } from '@/lib/ui/chrome'
import type { RutinaTurnoItem, RutinaTurnoFase } from '@/types'
import type { TurnoServicio } from '@/types'

const DIAS: { iso: number; label: string }[] = [
  { iso: 1, label: 'L' }, { iso: 2, label: 'M' }, { iso: 3, label: 'M' }, { iso: 4, label: 'J' },
  { iso: 5, label: 'V' }, { iso: 6, label: 'S' }, { iso: 7, label: 'D' },
]

export interface RutinaItemDraft {
  texto: string
  horas: Record<string, string>
  turnos: string[] | null
  requiere_responsable: boolean
  dias_semana: number[] | null
}

const label: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: .4, marginBottom: 6, display: 'block',
}
const input: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--bg)',
  fontSize: 14, fontFamily: 'inherit', color: 'var(--text-1)',
}

/**
 * Editor de un paso de la rutina de turno. Cada campo mapea 1:1 a algo que el
 * papel de Bros dice a mano: la hora por turno (misma línea a las 11 y a las 19),
 * los dos puntos del final ("Anafes y plancha:") que piden persona, el turno
 * único ("cenizas" solo de noche) y el día único ("campana (jueves)").
 */
export function RutinaItemSheet({ item, fase, turnos, onSave, onClose }: {
  item: RutinaTurnoItem | null
  fase: RutinaTurnoFase
  turnos: TurnoServicio[]
  onSave: (d: RutinaItemDraft) => void | Promise<void>
  onClose: () => void
}) {
  const [texto, setTexto] = useState(item?.texto ?? '')
  const [horas, setHoras] = useState<Record<string, string>>(item?.horas ?? {})
  const [soloTurnos, setSoloTurnos] = useState<string[] | null>(item?.turnos ?? null)
  const [requiereResp, setRequiereResp] = useState(item?.requiere_responsable ?? false)
  const [dias, setDias] = useState<number[] | null>(item?.dias_semana ?? null)
  const [guardando, setGuardando] = useState(false)

  function toggleTurno(id: string) {
    setSoloTurnos(prev => {
      // null = "todos". El primer tap lo materializa como la lista completa
      // menos el que se destildó, para que destildar signifique algo.
      const base = prev ?? turnos.map(t => t.id)
      const next = base.includes(id) ? base.filter(x => x !== id) : [...base, id]
      return next.length === turnos.length ? null : next
    })
  }

  function toggleDia(iso: number) {
    setDias(prev => {
      const base = prev ?? []
      const next = base.includes(iso) ? base.filter(x => x !== iso) : [...base, iso]
      return next.length === 0 ? null : next
    })
  }

  async function handleSave() {
    if (!texto.trim() || guardando) return
    setGuardando(true)
    // Las horas vacías no se guardan: un `{almuerzo:''}` haría que la fila
    // muestre un chip en blanco en vez de no mostrar chip.
    const limpias: Record<string, string> = {}
    for (const [k, v] of Object.entries(horas)) if (v) limpias[k] = v
    await onSave({
      texto: texto.trim(),
      horas: limpias,
      turnos: soloTurnos,
      requiere_responsable: requiereResp,
      dias_semana: dias,
    })
    setGuardando(false)
  }

  const enTurno = (id: string) => !soloTurnos || soloTurnos.includes(id)

  return (
    <SheetChrome>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-end' }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', background: 'var(--surface)', borderRadius: '20px 20px 0 0',
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          }}
        >
          <div style={{ padding: '18px 16px 0', flexShrink: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>
              {item ? 'Editar paso' : `Nuevo paso de ${fase === 'apertura' ? 'apertura' : 'cierre'}`}
            </div>
          </div>

          <div style={{ overflowY: 'auto', flex: 1, padding: '16px' }}>
            <div style={{ marginBottom: 16 }}>
              <label style={label}>Qué se hace</label>
              <input
                autoFocus
                value={texto}
                onChange={e => setTexto(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                placeholder="Ej: Bacha en cero, barrida y mesadas despejadas"
                style={input}
              />
            </div>

            {/* Hora por turno — el corazón del modelo: la misma línea del papel
                va a las 11 en el turno mañana y a las 19 en el tarde. */}
            <div style={{ marginBottom: 16 }}>
              <label style={label}>Hora (opcional, por turno)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {turnos.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: enTurno(t.id) ? 1 : 0.4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', width: 84, flexShrink: 0 }}>
                      {t.nombre}
                    </span>
                    <input
                      type="time"
                      disabled={!enTurno(t.id)}
                      value={horas[t.id] ?? ''}
                      onChange={e => setHoras(prev => ({ ...prev, [t.id]: e.target.value }))}
                      style={{ ...input, flex: 1, padding: '8px 10px' }}
                    />
                    {horas[t.id] && (
                      <button
                        onClick={() => setHoras(prev => { const n = { ...prev }; delete n[t.id]; return n })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, fontFamily: 'inherit' }}
                        aria-label={`Quitar la hora de ${t.nombre}`}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>close</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.4 }}>
                Sin hora, el paso va por su posición en la lista — como la mayoría del papel.
              </div>
            </div>

            {/* Turno único: "cenizas" solo cierra la noche */}
            {turnos.length > 1 && (
              <div style={{ marginBottom: 16 }}>
                <label style={label}>En qué turnos va</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {turnos.map(t => {
                    const on = enTurno(t.id)
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggleTurno(t.id)}
                        style={{
                          padding: '7px 13px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
                          fontSize: 12, fontWeight: 700,
                          border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                          background: on ? 'var(--accent)' : 'var(--surface)',
                          color: on ? '#fff' : 'var(--text-3)',
                        }}
                      >{t.nombre}</button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Día único: "campana (jueves)" */}
            <div style={{ marginBottom: 16 }}>
              <label style={label}>Días {dias ? '' : '· todos'}</label>
              <div style={{ display: 'flex', gap: 5 }}>
                {DIAS.map(d => {
                  const on = !dias || dias.includes(d.iso)
                  return (
                    <button
                      key={d.iso}
                      onClick={() => toggleDia(d.iso)}
                      style={{
                        width: 34, height: 34, borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: 12, fontWeight: 700,
                        border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                        background: on && dias ? 'var(--accent)' : 'var(--surface)',
                        color: on && dias ? '#fff' : on ? 'var(--text-2)' : 'var(--text-3)',
                      }}
                    >{d.label}</button>
                  )
                })}
              </div>
            </div>

            {/* Los dos puntos del papel */}
            <button
              onClick={() => setRequiereResp(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                padding: '11px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${requiereResp ? 'var(--accent)' : 'var(--border)'}`,
                background: requiereResp ? 'rgba(67,97,160,.07)' : 'var(--bg)',
              }}
            >
              <span className="material-symbols-outlined" style={{
                fontSize: 21, color: requiereResp ? 'var(--accent)' : 'var(--border)',
              }}>{requiereResp ? 'check_box' : 'check_box_outline_blank'}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                  Pide responsable
                </span>
                <span style={{ display: 'block', fontSize: 10, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4 }}>
                  Para las zonas del cierre — en el papel son las que terminan en dos puntos.
                </span>
              </span>
            </button>
          </div>

          <div style={{
            padding: '10px 16px', flexShrink: 0, display: 'flex', gap: 8,
            paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', borderTop: '1px solid var(--border)',
          }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                border: '1px solid var(--border)', background: 'none',
                fontSize: 13, fontWeight: 700, color: 'var(--text-2)',
              }}
            >Cancelar</button>
            <button
              onClick={handleSave}
              disabled={!texto.trim() || guardando}
              style={{
                flex: 2, padding: '12px', borderRadius: 10, border: 'none', fontFamily: 'inherit',
                cursor: texto.trim() && !guardando ? 'pointer' : 'default',
                background: texto.trim() && !guardando ? 'var(--accent)' : 'var(--border)',
                fontSize: 13, fontWeight: 700, color: '#fff',
              }}
            >{guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </div>
    </SheetChrome>
  )
}
