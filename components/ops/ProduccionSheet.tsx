'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui'

const MULTIPLICADORES = [
  { value: 0.8,  label: '×0.8', desc: '−20%' },
  { value: 1,    label: '×1',   desc: 'exacto' },
  { value: 1.2,  label: '×1.2', desc: '+20%' },
  { value: 1.5,  label: '×1.5', desc: '+50%' },
]

interface IngBase { id: string; nombre: string; cantidad: number; unidad: string }

interface ProduccionSheetProps {
  recetaNombre: string
  cantidadPlanificada: number | null
  recetaId?: string
  onConfirm: (multiplicadorReal: number) => Promise<void>
  onDismiss: () => void
}

export function ProduccionSheet({
  recetaNombre, cantidadPlanificada, recetaId, onConfirm, onDismiss,
}: ProduccionSheetProps) {
  const [selected, setSelected] = useState<number>(1)
  const [otroMode, setOtroMode] = useState(false)
  const [otroValue, setOtroValue] = useState('')
  const [saving, setSaving] = useState(false)

  // Ingredient-based scaling
  const [scaleOpen, setScaleOpen] = useState(false)
  const [ingsBase, setIngsBase] = useState<IngBase[]>([])
  const [ingsLoaded, setIngsLoaded] = useState(false)
  const [scaleIngId, setScaleIngId] = useState('')
  const [scaleRealCant, setScaleRealCant] = useState('')

  useEffect(() => {
    if (!scaleOpen || ingsLoaded || !recetaId) return
    setIngsLoaded(true)
    import('@/lib/supabase/client').then(({ createClient }) => {
      const sb = createClient()
      sb.from('ingredientes')
        .select('id, nombre, cantidad, unidad')
        .eq('receta_id', recetaId)
        .then(({ data }) => { if (data) setIngsBase(data as IngBase[]) })
    })
  }, [scaleOpen, ingsLoaded, recetaId])

  const efectivo = otroMode
    ? parseFloat(otroValue.replace(',', '.')) || 1
    : selected

  async function handleConfirm() {
    if (saving) return
    setSaving(true)
    try {
      await onConfirm(efectivo)
    } finally {
      setSaving(false)
    }
  }

  const isExacto = efectivo === 1
  const desvPct = Math.round((efectivo - 1) * 100)
  const desvLabel = desvPct > 0 ? `+${desvPct}%` : desvPct < 0 ? `${desvPct}%` : null

  return (
    <Modal open onClose={onDismiss} maxWidth={420}>
          <div style={{ padding: '20px 16px', paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))' }}>
            {/* Header */}
            <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
                  ¿Cuánto produjiste realmente?
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>{recetaNombre}</span>
                  {cantidadPlanificada != null && cantidadPlanificada > 0 && (
                    <span> · Planificado: {cantidadPlanificada} pax</span>
                  )}
                </div>
              </div>
              <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)' }}>close</span>
              </button>
            </div>

            {/* Pills */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {MULTIPLICADORES.map(m => {
                const active = !otroMode && selected === m.value
                return (
                  <button
                    key={m.value}
                    onClick={() => { setOtroMode(false); setSelected(m.value) }}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                      cursor: 'pointer', fontFamily: 'inherit',
                      background: active ? 'var(--navy)' : 'var(--bg)',
                      transition: 'all .15s',
                      outline: active ? '2px solid rgba(67,97,160,.4)' : 'none',
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 800, color: active ? '#fff' : 'var(--text-1)' }}>
                      {m.label}
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 600, color: active ? 'rgba(255,255,255,.6)' : 'var(--text-3)', marginTop: 1 }}>
                      {m.desc}
                    </div>
                  </button>
                )
              })}
              {/* Otro */}
              <button
                onClick={() => { setOtroMode(true); setSelected(1) }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit',
                  background: otroMode ? 'var(--navy)' : 'var(--bg)',
                  transition: 'all .15s',
                  outline: otroMode ? '2px solid rgba(67,97,160,.4)' : 'none',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: otroMode ? '#fff' : 'var(--text-1)' }}>otro</div>
              </button>
            </div>

            {/* Otro input */}
            {otroMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)' }}>×</span>
                <input
                  autoFocus
                  type="number"
                  inputMode="decimal"
                  value={otroValue}
                  onChange={e => setOtroValue(e.target.value)}
                  placeholder="ej: 1.3"
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: 9,
                    border: '1.5px solid var(--accent)', background: 'var(--bg)',
                    fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                    color: 'var(--text-1)', outline: 'none',
                  }}
                />
              </div>
            )}

            {/* Deviation hint */}
            {!isExacto && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
                padding: '7px 10px', borderRadius: 9,
                background: desvPct > 0 ? 'rgba(34,197,94,.08)' : 'rgba(249,115,22,.08)',
                border: `1px solid ${desvPct > 0 ? 'rgba(34,197,94,.2)' : 'rgba(249,115,22,.2)'}`,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: desvPct > 0 ? '#22c55e' : '#f97316' }}>
                  {desvPct > 0 ? 'trending_up' : 'trending_down'}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: desvPct > 0 ? '#22c55e' : '#f97316' }}>
                  Desviación {desvLabel}
                  {cantidadPlanificada != null && cantidadPlanificada > 0 && (
                    <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>
                      {' '}— real: {Math.round(cantidadPlanificada * efectivo)} pax
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* Ingredient-based scaling */}
            {recetaId && (
              <div style={{ marginBottom: 12 }}>
                <button
                  onClick={() => setScaleOpen(v => !v)}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 10, border: 'none',
                    background: 'var(--bg)', cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-3)' }}>
                    {scaleOpen ? 'expand_less' : 'expand_more'}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>
                    Escalar por ingrediente
                  </span>
                </button>
                {scaleOpen && (
                  <div style={{ paddingTop: 8 }}>
                    {!ingsLoaded || ingsBase.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '8px 0' }}>
                        {!ingsLoaded ? 'Cargando…' : 'Sin ingredientes'}
                      </div>
                    ) : (
                      <>
                        <select
                          value={scaleIngId}
                          onChange={e => { setScaleIngId(e.target.value); setScaleRealCant('') }}
                          style={{
                            width: '100%', padding: '8px 10px', borderRadius: 9,
                            border: '1px solid var(--border)', background: 'var(--bg)',
                            fontSize: 12, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none',
                          }}
                        >
                          <option value="">Elegir ingrediente de referencia…</option>
                          {ingsBase.map(i => (
                            <option key={i.id} value={i.id}>
                              {i.nombre} — {i.cantidad} {i.unidad}
                            </option>
                          ))}
                        </select>
                        {scaleIngId && (() => {
                          const ingBase = ingsBase.find(i => i.id === scaleIngId)!
                          const realCant = parseFloat(scaleRealCant.replace(',', '.'))
                          const calcMult = realCant > 0 ? realCant / ingBase.cantidad : null
                          return (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Usé</span>
                                <input
                                  autoFocus
                                  type="number"
                                  inputMode="decimal"
                                  value={scaleRealCant}
                                  onChange={e => setScaleRealCant(e.target.value)}
                                  placeholder="0"
                                  style={{
                                    flex: 1, padding: '7px 10px', borderRadius: 8,
                                    border: '1.5px solid var(--accent)', background: 'var(--bg)',
                                    fontSize: 13, fontFamily: "'DM Mono', monospace",
                                    color: 'var(--text-1)', outline: 'none',
                                  }}
                                />
                                <span style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 28 }}>{ingBase.unidad}</span>
                              </div>
                              {calcMult !== null && (
                                <button
                                  onClick={async () => {
                                    if (saving) return
                                    setSaving(true)
                                    try { await onConfirm(calcMult) }
                                    finally { setSaving(false) }
                                  }}
                                  disabled={saving}
                                  style={{
                                    marginTop: 8, width: '100%', padding: '10px 0', borderRadius: 10,
                                    border: 'none', cursor: saving ? 'default' : 'pointer',
                                    background: saving ? 'var(--border)' : 'var(--accent)',
                                    color: saving ? 'var(--text-3)' : '#fff',
                                    fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                                  }}
                                >
                                  {saving ? 'Guardando…' : `Confirmar ×${calcMult.toFixed(2)}`}
                                </button>
                              )}
                            </>
                          )
                        })()}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* CTA */}
            <button
              onClick={handleConfirm}
              disabled={saving || (otroMode && !otroValue)}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                background: (saving || (otroMode && !otroValue)) ? 'var(--border)' : 'linear-gradient(135deg, var(--navy), #4361a0)',
                color: (saving || (otroMode && !otroValue)) ? 'var(--text-3)' : '#fff',
                fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                cursor: (saving || (otroMode && !otroValue)) ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all .15s', marginBottom: 8,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                {saving ? 'more_horiz' : isExacto ? 'check_circle' : 'trending_up'}
              </span>
              {saving ? 'Guardando…' : isExacto ? 'Confirmar (sin desviación)' : 'Registrar desviación'}
            </button>

            <button
              onClick={onDismiss}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 12, border: 'none',
                background: 'transparent', color: 'var(--text-3)',
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              Omitir
            </button>
          </div>
    </Modal>
  )
}
