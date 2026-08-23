'use client'

import { useState } from 'react'
import { SheetChrome } from '@/lib/ui/chrome'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import type { Reserva, EstadoReserva, OrigenReserva } from '@/types'
import { ESTADOS_RESERVA, ESTADO_RESERVA_CONFIG, ORIGENES_RESERVA, ORIGEN_RESERVA_CONFIG } from './config'
import type { NuevaReservaInput } from '@/lib/hooks/useReservas'

interface Props {
  reserva?: Reserva | null
  fechaInicial: string
  onClose: () => void
  onCreate: (datos: NuevaReservaInput) => Promise<unknown> | void
  onUpdate: (id: string, datos: Partial<Reserva>) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
}

const fieldLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }
const fieldInput: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px',
  fontSize: 14, fontFamily: 'inherit', color: 'var(--text-1)', background: 'var(--bg)', width: '100%',
}

export default function ReservaSheet({ reserva, fechaInicial, onClose, onCreate, onUpdate, onDelete }: Props) {
  const isDesktop = useIsDesktop()
  const editando = !!reserva

  const [nombre, setNombre] = useState(reserva?.nombre ?? '')
  const [telefono, setTelefono] = useState(reserva?.telefono ?? '')
  const [fecha, setFecha] = useState(reserva?.fecha ?? fechaInicial)
  const [hora, setHora] = useState(reserva?.hora?.slice(0, 5) ?? '20:00')
  const [pax, setPax] = useState(reserva?.pax ?? 2)
  const [origen, setOrigen] = useState<OrigenReserva>(reserva?.origen ?? 'telefono')
  const [nota, setNota] = useState(reserva?.nota ?? '')
  const [estado, setEstado] = useState<EstadoReserva>(reserva?.estado ?? 'pendiente')
  const [saving, setSaving] = useState(false)

  const valido = nombre.trim().length > 0 && pax > 0 && !!fecha && !!hora

  async function submit() {
    if (!valido || saving) return
    setSaving(true)
    try {
      if (editando && reserva) {
        await onUpdate(reserva.id, {
          nombre: nombre.trim(), telefono: telefono || null, fecha, hora, pax, origen, nota: nota || null, estado,
        })
      } else {
        await onCreate({ nombre, telefono: telefono || null, fecha, hora, pax, origen, nota: nota || null })
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!reserva || saving) return
    setSaving(true)
    try {
      await onDelete(reserva.id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <SheetChrome>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column',
          justifyContent: isDesktop ? 'center' : 'flex-end', alignItems: 'center',
          padding: isDesktop ? 24 : 0,
        }}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.32)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={onClose} />
        <div
          style={{
            position: 'relative', background: 'var(--surface)',
            borderRadius: isDesktop ? 16 : '16px 16px 0 0',
            width: isDesktop ? 'min(460px, 92vw)' : '100%',
            maxHeight: isDesktop ? 'calc(100dvh - 48px)' : '88dvh',
            display: 'flex', flexDirection: 'column',
            boxShadow: isDesktop ? '0 20px 60px rgba(0,0,0,.35)' : '0 -8px 40px rgba(0,0,0,.3)',
            border: isDesktop ? '1px solid var(--border)' : 'none',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ padding: '20px 16px 0', flexShrink: 0 }}>
            {!isDesktop && <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 16px' }} />}
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 16px' }}>
              {editando ? 'Editar reserva' : 'Nueva reserva'}
            </h2>
          </div>

          <div style={{ overflowY: 'auto', flex: 1, padding: '0 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {editando && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={fieldLabel}>Estado</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ESTADOS_RESERVA.map(e => {
                      const cfg = ESTADO_RESERVA_CONFIG[e]
                      const activo = e === estado
                      return (
                        <button
                          key={e}
                          onClick={() => setEstado(e)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 99,
                            cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                            background: activo ? `${cfg.color}1f` : 'var(--bg)',
                            border: activo ? `1.5px solid ${cfg.color}` : '1px solid var(--border)',
                            color: activo ? cfg.color : 'var(--text-2)',
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{cfg.icon}</span>
                          {cfg.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={fieldLabel}>Nombre</span>
                <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="A nombre de quién" autoFocus={!editando} style={fieldInput} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={fieldLabel}>Teléfono</span>
                <input value={telefono ?? ''} onChange={e => setTelefono(e.target.value)} type="tel" placeholder="Opcional" style={fieldInput} />
              </label>

              <div style={{ display: 'flex', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 2 }}>
                  <span style={fieldLabel}>Fecha</span>
                  <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={fieldInput} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <span style={fieldLabel}>Hora</span>
                  <input type="time" value={hora} onChange={e => setHora(e.target.value)} style={fieldInput} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <span style={fieldLabel}>Pax</span>
                  <input
                    type="number" min={1} value={pax}
                    onChange={e => setPax(Math.max(1, Number(e.target.value) || 1))}
                    onFocus={e => e.currentTarget.select()}
                    style={fieldInput}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={fieldLabel}>Origen</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ORIGENES_RESERVA.map(o => {
                    const cfg = ORIGEN_RESERVA_CONFIG[o]
                    const activo = o === origen
                    return (
                      <button
                        key={o}
                        onClick={() => setOrigen(o)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 99,
                          cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                          background: activo ? 'rgba(67,97,160,.12)' : 'var(--bg)',
                          border: activo ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                          color: activo ? 'var(--accent)' : 'var(--text-2)',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{cfg.icon}</span>
                        {cfg.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={fieldLabel}>Nota</span>
                <textarea
                  value={nota ?? ''} onChange={e => setNota(e.target.value)} rows={2}
                  placeholder="Alergias, ocasión especial, mesa pedida…"
                  style={{ ...fieldInput, resize: 'none' }}
                />
              </label>
            </div>
          </div>

          <div style={{ padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={onClose}
                style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={submit}
                disabled={!valido || saving}
                style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: valido && !saving ? 'pointer' : 'default', opacity: valido && !saving ? 1 : 0.6 }}
              >
                {editando ? 'Guardar' : 'Crear'}
              </button>
            </div>
            {editando && (
              <button
                onClick={handleDelete}
                disabled={saving}
                style={{ width: '100%', marginTop: 8, padding: '9px 0', borderRadius: 10, border: 'none', background: 'transparent', color: '#ef4444', fontWeight: 700, fontSize: 12, fontFamily: 'inherit', cursor: saving ? 'default' : 'pointer' }}
              >
                Eliminar reserva
              </button>
            )}
          </div>
        </div>
      </div>
    </SheetChrome>
  )
}
