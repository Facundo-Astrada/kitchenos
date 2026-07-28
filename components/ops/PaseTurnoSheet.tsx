'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { TareaPrioridad } from '@/types'

const PRIORIDADES: { id: TareaPrioridad; label: string; sublabel: string; color: string }[] = [
  { id: 'critica', label: 'SP',  sublabel: 'Super Prioridad', color: '#ef4444' },
  { id: 'alta',    label: 'P',   sublabel: 'Prioridad',       color: '#f97316' },
  { id: 'media',   label: 'REF', sublabel: 'Refuerzo',        color: '#3b82f6' },
  { id: 'baja',    label: 'Check', sublabel: 'Check',         color: '#64748b' },
]

interface PaseTurnoSheetProps {
  nombreComponente: string
  cantidadHoy: number | null
  onConfirm: (data: { cantidad: number | null; prioridad: TareaPrioridad; nota: string | null }) => Promise<void>
  onDismiss: () => void
}

// Deja una tarea programada para el turno de mañana, vinculada al mismo
// componente (receta_id/plaza/sección) — el próximo turno la ve directo en
// su Producción del día, sin depender de que alguien avise de palabra.
export function PaseTurnoSheet({ nombreComponente, cantidadHoy, onConfirm, onDismiss }: PaseTurnoSheetProps) {
  const [cantidad, setCantidad] = useState(cantidadHoy != null ? String(cantidadHoy) : '')
  const [prioridad, setPrioridad] = useState<TareaPrioridad>('alta')
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
      const cant = cantidad.trim() === '' ? null : parseFloat(cantidad.replace(',', '.'))
      await onConfirm({ cantidad: cant != null && !isNaN(cant) ? cant : null, prioridad, nota: nota.trim() || null })
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)' }}>event_upcoming</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Pase para mañana</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>{nombreComponente}</span>
                </div>
              </div>
            </div>

            {/* Cantidad */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                Cantidad a producir mañana
              </div>
              <input
                type="number" inputMode="decimal" value={cantidad}
                onChange={e => setCantidad(e.target.value)}
                placeholder={cantidadHoy != null ? `Hoy: ${cantidadHoy}` : 'Cantidad'}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 10, boxSizing: 'border-box',
                  border: '1.5px solid var(--accent)', background: 'var(--bg)',
                  fontSize: 15, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                  color: 'var(--text-1)', outline: 'none',
                }}
              />
            </div>

            {/* Prioridad */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                Prioridad para mañana
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {PRIORIDADES.map(p => {
                  const active = prioridad === p.id
                  return (
                    <button
                      key={p.id}
                      onClick={() => setPrioridad(p.id)}
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit', background: active ? p.color : 'var(--bg)',
                        outline: active ? `2px solid ${p.color}66` : '1px solid var(--border)',
                        transition: 'all .15s',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 800, color: active ? '#fff' : 'var(--text-1)' }}>{p.label}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Nota */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                Nota para el próximo turno (opcional)
              </div>
              <textarea
                value={nota} onChange={e => setNota(e.target.value)}
                placeholder="Ej: se vendió mucho hoy, reforzar producción"
                rows={2}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 10, boxSizing: 'border-box',
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', resize: 'none',
                }}
              />
            </div>

            <button
              onClick={handleConfirm}
              disabled={saving}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                background: saving ? 'var(--border)' : 'linear-gradient(135deg, var(--navy), #4361a0)',
                color: saving ? 'var(--text-3)' : '#fff',
                fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                cursor: saving ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                marginBottom: 8,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                {saving ? 'more_horiz' : 'event_upcoming'}
              </span>
              {saving ? 'Programando…' : 'Programar para mañana'}
            </button>
            <button
              onClick={onDismiss}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 12, border: 'none',
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
