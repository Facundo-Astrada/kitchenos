'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { TareaPrioridad } from '@/types'

export type CrearTareaDia = 'hoy' | 'manana'

const PRIORIDADES: { id: TareaPrioridad; label: string; color: string }[] = [
  { id: 'critica', label: 'SP',    color: '#ef4444' },
  { id: 'alta',    label: 'P',     color: '#f97316' },
  { id: 'media',   label: 'REF',   color: '#3b82f6' },
  { id: 'baja',    label: 'Check', color: '#64748b' },
]

interface PlazaChip { id: string; plaza: string; instruccion: string | null }

function capPlaza(p: string) { return p.charAt(0).toUpperCase() + p.slice(1) }

export interface CrearTareaSheetConfirmData {
  cantidad: number | null
  prioridad: TareaPrioridad
  dia: CrearTareaDia
  nota: string | null
}

interface CrearTareaSheetProps {
  nombreComponente: string
  /** Si hay porciones (receta con rendimiento conocido), se ofrece multiplicador ×1/×2/×3. Si no, cantidad libre. */
  porciones?: number | null
  /** Cantidad de referencia para el input libre cuando no hay porciones (ej. cantidad estándar del ítem). */
  cantidadSugerida?: number | null
  unidad?: string
  plazas?: PlazaChip[]
  rendimientoPromedio?: number | null
  defaultPrioridad?: TareaPrioridad
  defaultDia?: CrearTareaDia
  onConfirm: (data: CrearTareaSheetConfirmData) => Promise<void>
  onDismiss: () => void
}

// Sheet único para "crear una tarea de producción vinculada a este componente"
// — usado tanto desde Mise (ProductoMiseCard, hoy por defecto) como desde OPS
// Producción (ItemOps, "pase de turno", mañana por defecto). Antes existían
// dos UIs separadas para la misma acción de fondo; se unificaron acá.
export function CrearTareaSheet({
  nombreComponente, porciones, cantidadSugerida, unidad, plazas = [], rendimientoPromedio,
  defaultPrioridad = 'alta', defaultDia = 'hoy', onConfirm, onDismiss,
}: CrearTareaSheetProps) {
  const [dia, setDia] = useState<CrearTareaDia>(defaultDia)
  const [prioridad, setPrioridad] = useState<TareaPrioridad>(defaultPrioridad)
  const hasPorciones = porciones != null && porciones > 0
  const [multiplier, setMultiplier] = useState<1 | 2 | 3>(1)
  const [freeQty, setFreeQty] = useState(cantidadSugerida != null ? String(cantidadSugerida) : '')
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)

  const startY = useRef<number>(0)
  function handleTouchStart(e: React.TouchEvent) { startY.current = e.touches[0].clientY }
  function handleTouchEnd(e: React.TouchEvent) {
    const delta = e.changedTouches[0].clientY - startY.current
    if (delta > 60) onDismiss()
  }

  async function handleConfirm() {
    if (saving) return
    setSaving(true)
    try {
      const cantidad = hasPorciones
        ? (porciones as number) * multiplier
        : freeQty.trim() === '' ? null : (() => { const v = parseFloat(freeQty.replace(',', '.')); return isNaN(v) ? null : v })()
      await onConfirm({ cantidad, prioridad, dia, nota: nota.trim() || null })
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }} onClick={onDismiss}
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)' }}
        />
        <motion.div
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 350 }}
          onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
          style={{
            position: 'relative', background: 'var(--surface)', borderRadius: '18px 18px 0 0',
            paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border)' }} />
          </div>

          <div style={{ padding: '0 16px' }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Crear tarea</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>{nombreComponente}</span>
              </div>
            </div>

            {/* Día */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>
                ¿Para cuándo?
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {([{ id: 'hoy', label: 'Hoy' }, { id: 'manana', label: 'Mañana' }] as const).map(d => {
                  const active = dia === d.id
                  return (
                    <button key={d.id} onClick={() => setDia(d.id)} style={{
                      flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800,
                      background: active ? 'var(--navy)' : 'var(--bg)',
                      color: active ? '#fff' : 'var(--text-2)',
                      outline: active ? '2px solid rgba(67,97,160,.4)' : '1px solid var(--border)',
                      transition: 'all .15s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                        {d.id === 'hoy' ? 'today' : 'event_upcoming'}
                      </span>
                      {d.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Priority pills */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>
                Prioridad
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {PRIORIDADES.map(p => {
                  const active = prioridad === p.id
                  return (
                    <button key={p.id} onClick={() => setPrioridad(p.id)} style={{
                      flex: 1, padding: '7px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 11, fontWeight: 800,
                      background: active ? p.color : 'var(--bg)',
                      color: active ? '#fff' : 'var(--text-3)',
                      outline: active ? `2px solid ${p.color}66` : '1px solid var(--border)',
                      transition: 'all .15s',
                    }}>{p.label}</button>
                  )
                })}
              </div>
            </div>

            {/* Multiplier / free qty */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>
                {hasPorciones ? 'Multiplicador' : 'Cantidad a preparar'}
              </div>
              {hasPorciones ? (
                <div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([1, 2, 3] as const).map(m => (
                      <button key={m} onClick={() => setMultiplier(m)} style={{
                        flex: 1, padding: '7px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 13, fontWeight: 800,
                        background: multiplier === m ? 'rgba(67,97,160,.15)' : 'var(--bg)',
                        color: multiplier === m ? '#4361a0' : 'var(--text-3)',
                        outline: multiplier === m ? '2px solid rgba(67,97,160,.4)' : '1px solid var(--border)',
                        transition: 'all .15s',
                      }}>×{m}</button>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 5 }}>
                    {[1, 2, 3].map(m => `×${m}=${(porciones as number) * m} pax`).join(' · ')}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    value={freeQty}
                    onChange={e => setFreeQty(e.target.value)}
                    inputMode="decimal"
                    placeholder={cantidadSugerida != null ? `Hoy: ${cantidadSugerida}` : 'Cant.'}
                    style={{
                      flex: 1, padding: '8px 10px', borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--bg)',
                      fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                      color: 'var(--text-1)', outline: 'none',
                    }}
                  />
                  {unidad && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{unidad}</span>}
                </div>
              )}
            </div>

            {/* Rendimiento promedio real */}
            {rendimientoPromedio != null && rendimientoPromedio !== 1 && (
              <div style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                  Rendimiento real promedio:{' '}
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                    ×{rendimientoPromedio.toFixed(2)}
                  </span>
                </span>
              </div>
            )}

            {/* Plazas chips — solo si hay multi-plaza configurada */}
            {plazas.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>
                  Plazas
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {plazas.map(pp => (
                    <span key={pp.id} style={{
                      padding: '4px 10px', borderRadius: 8,
                      background: 'rgba(67,97,160,.1)', border: '1px solid rgba(67,97,160,.25)',
                      fontSize: 11, fontWeight: 700, color: '#4361a0',
                    }}>
                      {capPlaza(pp.plaza)}
                      {pp.instruccion && (
                        <span style={{ fontWeight: 400, color: 'var(--text-3)', marginLeft: 4 }}>— {pp.instruccion}</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Nota opcional */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>
                Nota {dia === 'manana' ? 'para el próximo turno' : ''} (opcional)
              </div>
              <textarea
                value={nota} onChange={e => setNota(e.target.value)}
                placeholder={dia === 'manana' ? 'Ej: se vendió mucho hoy, reforzar producción' : undefined}
                rows={2}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 9, boxSizing: 'border-box',
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  fontSize: 12.5, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', resize: 'none',
                }}
              />
            </div>

            {/* CTA */}
            <button
              onClick={handleConfirm}
              disabled={saving}
              style={{
                width: '100%', padding: '11px 0', borderRadius: 10, border: 'none',
                background: saving ? 'var(--border)' : 'linear-gradient(135deg, var(--navy), #4361a0)',
                color: saving ? 'var(--text-3)' : '#fff',
                fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                cursor: saving ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all .15s', marginBottom: 8,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                {saving ? 'more_horiz' : 'add_task'}
              </span>
              {saving ? 'Creando…' : dia === 'manana' ? 'Programar para mañana' : 'Crear tarea →'}
            </button>
            <button
              onClick={onDismiss}
              style={{
                width: '100%', padding: '9px 0', borderRadius: 10, border: 'none',
                background: 'transparent', color: 'var(--text-3)',
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
