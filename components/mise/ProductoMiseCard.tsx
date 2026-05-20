'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { MisePlaceItem, MisePrioridad } from '@/types'

// ── Exported interfaces ───────────────────────────────────────
export interface PlatoPlaza {
  id: string
  plato_id: string
  plaza: string
  instruccion: string | null
  ingredientes: string[] | null
  orden: number
}

export interface CrearTareaParams {
  titulo: string
  seccion: string        // mapped ops section id (caliente, fria, pasteleria, salon, general)
  prioridad: MisePrioridad
  cantidad: number | null
  receta_id: string | null
  plaza: string          // raw plaza name → tarea.plaza field
  plazas: PlatoPlaza[]   // multi-plaza sub-tasks
}

// ── Internal config ───────────────────────────────────────────
export const PLAZA_TO_SECCION: Record<string, string> = {
  parrilla: 'caliente', calientes: 'caliente', frios: 'fria',
  pasteleria: 'pasteleria', panaderia: 'pasteleria', pase: 'salon',
}

const PRIO_CFG: Record<string, { label: string; color: string; bg: string }> = {
  sp:  { label: 'SP',  color: '#ef4444', bg: 'rgba(239,68,68,.13)' },
  p:   { label: 'P',   color: '#f97316', bg: 'rgba(249,115,22,.13)' },
  ref: { label: 'REF', color: '#3b82f6', bg: 'rgba(59,130,246,.13)' },
  chk: { label: 'REF', color: '#3b82f6', bg: 'rgba(59,130,246,.13)' },
}
const PRIO_CYCLE: MisePrioridad[] = ['sp', 'p', 'ref']

const btnReset: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'inherit',
}

function nextPrio(current: string): MisePrioridad {
  const idx = PRIO_CYCLE.indexOf(current as MisePrioridad)
  return PRIO_CYCLE[(idx + 1) % PRIO_CYCLE.length]
}

function capPlaza(p: string) { return p.charAt(0).toUpperCase() + p.slice(1) }

// ── Stock dots (5) ────────────────────────────────────────────
function StockDots({ cantActual, target }: { cantActual: number | null; target: number }) {
  if (cantActual === null || target <= 0) {
    return (
      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border)' }} />
        ))}
      </div>
    )
  }
  const ratio = Math.min(1, cantActual / target)
  const filled = Math.round(ratio * 5)
  const dotColor = ratio >= 0.6 ? '#22c55e' : ratio >= 0.3 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: i < filled ? dotColor : 'var(--border)',
        }} />
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────
interface ProductoMiseCardProps {
  item: MisePlaceItem
  reg: { completado: boolean; cantidad_actual: number | null } | undefined
  fecha: string
  turno: string
  recetaInfo?: { porciones?: number | null; pesoPorcion?: number | null }
  platoPlazo: PlatoPlaza[]
  hasTareaPendiente: boolean
  rendimientoPromedio?: number | null
  onUpsert: (id: string, fecha: string, turno: string, d: { completado?: boolean; cantidad_actual?: number | null }) => Promise<void>
  onCrearTarea: (params: CrearTareaParams) => Promise<void>
  onPrioChange: (item: MisePlaceItem, prio: MisePrioridad) => void
  onDelete: (id: string) => Promise<void>
}

export function ProductoMiseCard({
  item, reg, fecha, turno, recetaInfo, platoPlazo, hasTareaPendiente,
  rendimientoPromedio,
  onUpsert, onCrearTarea, onPrioChange, onDelete,
}: ProductoMiseCardProps) {
  const [cantInput, setCantInput] = useState(reg?.cantidad_actual?.toString() ?? '')
  const [prodOpen, setProdOpen] = useState(false)
  const [selectedPrio, setSelectedPrio] = useState<MisePrioridad>((item.prioridad as MisePrioridad) ?? 'p')
  const [multiplier, setMultiplier] = useState<1 | 2 | 3>(1)
  const [freeQty, setFreeQty] = useState(item.cantidad > 0 ? String(item.cantidad) : '')
  const [creating, setCreating] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [showDelete, setShowDelete] = useState(false)

  const checked = reg?.completado ?? false
  const cantActual = reg?.cantidad_actual ?? null
  const isBajo = cantActual !== null && item.cantidad > 0 && cantActual < item.cantidad
  const prio = PRIO_CFG[item.prioridad] ?? PRIO_CFG.ref

  const hasReceta = !!item.receta_id && (recetaInfo?.porciones ?? 0) > 0
  const porciones = recetaInfo?.porciones ?? null
  const primaryPlaza = platoPlazo.length > 0 ? platoPlazo[0].plaza : item.plaza

  async function handleCrearTarea() {
    if (creating) return
    setCreating(true)
    try {
      const cantidad = hasReceta && porciones != null
        ? porciones * multiplier
        : freeQty !== '' ? parseFloat(freeQty) : null

      await onCrearTarea({
        titulo: item.nombre,
        seccion: PLAZA_TO_SECCION[primaryPlaza] ?? 'general',
        prioridad: selectedPrio,
        cantidad,
        receta_id: item.receta_id ?? null,
        plaza: primaryPlaza,
        plazas: platoPlazo,
      })
      setProdOpen(false)
      setSuccessMsg(capPlaza(primaryPlaza) + (platoPlazo.length > 1 ? ` +${platoPlazo.length - 1}` : ''))
      setTimeout(() => setSuccessMsg(null), 2200)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{
      background: checked ? 'rgba(34,197,94,.04)' : 'var(--surface)',
      border: `1px solid ${checked ? 'rgba(34,197,94,.22)' : isBajo ? 'rgba(249,115,22,.3)' : 'var(--border)'}`,
      borderRadius: 14, overflow: 'hidden',
      opacity: checked ? 0.72 : 1,
      transition: 'all .2s',
    }}>

      {/* ── Main row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>

        {/* Checkbox */}
        <button
          onClick={() => onUpsert(item.id, fecha, turno, { completado: !checked })}
          style={{ ...btnReset, flexShrink: 0 }}
        >
          <span className="material-symbols-outlined" style={{
            fontSize: 24, color: checked ? '#22c55e' : 'var(--border)', transition: 'color .15s',
          }}>{checked ? 'check_circle' : 'radio_button_unchecked'}</span>
        </button>

        {/* Name */}
        <div
          style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
          onClick={() => setShowDelete(v => !v)}
        >
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: checked ? 'var(--text-3)' : 'var(--text-1)',
            textDecoration: checked ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
          }}>
            {item.nombre}
          </span>
          {item.receta_id && !checked && (
            <span style={{ fontSize: 9, color: '#4361a0', fontWeight: 600 }}>receta</span>
          )}
        </div>

        {/* Stock dots */}
        <StockDots cantActual={cantActual} target={item.cantidad} />

        {/* Qty input */}
        <input
          type="number"
          value={cantInput}
          onChange={e => setCantInput(e.target.value)}
          onBlur={() => {
            const v = cantInput === '' ? null : parseFloat(cantInput)
            onUpsert(item.id, fecha, turno, { cantidad_actual: isNaN(v as number) ? null : v })
          }}
          inputMode="decimal"
          placeholder="—"
          style={{
            width: 40, padding: '3px 4px', borderRadius: 7, flexShrink: 0,
            border: `1.5px solid ${isBajo ? '#f97316' : cantActual !== null ? '#22c55e' : 'var(--border)'}`,
            background: isBajo ? 'rgba(249,115,22,.07)' : cantActual !== null ? 'rgba(34,197,94,.07)' : 'var(--bg)',
            fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono', monospace",
            color: 'var(--text-1)', textAlign: 'center', outline: 'none',
          }}
        />
        <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, flexShrink: 0 }}>
          {item.unidad}
        </span>

        {/* Prio badge */}
        <button
          onClick={() => onPrioChange(item, nextPrio(item.prioridad))}
          style={{
            ...btnReset, flexShrink: 0,
            padding: '3px 7px', borderRadius: 7,
            background: prio.bg, border: `1px solid ${prio.color}40`,
            fontSize: 10, fontWeight: 800, color: prio.color, transition: 'all .15s',
          }}
        >
          {prio.label}
        </button>

        {/* Production toggle */}
        {!checked && (
          <button
            onClick={() => setProdOpen(v => !v)}
            style={{ ...btnReset, flexShrink: 0, position: 'relative', padding: 2 }}
          >
            <span className="material-symbols-outlined" style={{
              fontSize: 20,
              color: prodOpen ? '#4361a0' : hasTareaPendiente ? '#22c55e' : 'var(--text-3)',
              transition: 'color .15s',
            }}>
              {hasTareaPendiente ? 'task_alt' : 'add_task'}
            </span>
          </button>
        )}
      </div>

      {/* ── Production panel ── */}
      <AnimatePresence>
        {prodOpen && !checked && (
          <motion.div
            key="prod-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '10px 12px 12px', borderTop: '1px solid var(--border)' }}>

              {/* Priority pills */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>
                  Prioridad
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['sp', 'p', 'ref'] as MisePrioridad[]).map(pr => {
                    const cfg = PRIO_CFG[pr]
                    return (
                      <button key={pr} onClick={() => setSelectedPrio(pr)} style={{
                        flex: 1, padding: '7px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 11, fontWeight: 800,
                        background: selectedPrio === pr ? cfg.bg : 'var(--bg)',
                        color: selectedPrio === pr ? cfg.color : 'var(--text-3)',
                        outline: selectedPrio === pr ? `2px solid ${cfg.color}50` : 'none',
                        transition: 'all .15s',
                      }}>{cfg.label}</button>
                    )
                  })}
                </div>
              </div>

              {/* Multiplier / free qty */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>
                  {hasReceta ? 'Multiplicador' : 'Cantidad a preparar'}
                </div>
                {hasReceta ? (
                  <div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {([1, 2, 3] as const).map(m => (
                        <button key={m} onClick={() => setMultiplier(m)} style={{
                          flex: 1, padding: '7px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                          fontFamily: 'inherit', fontSize: 13, fontWeight: 800,
                          background: multiplier === m ? 'rgba(67,97,160,.15)' : 'var(--bg)',
                          color: multiplier === m ? '#4361a0' : 'var(--text-3)',
                          outline: multiplier === m ? '2px solid rgba(67,97,160,.4)' : 'none',
                          transition: 'all .15s',
                        }}>×{m}</button>
                      ))}
                    </div>
                    {porciones != null && (
                      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 5 }}>
                        {[1, 2, 3].map(m => `×${m}=${porciones * m} pax`).join(' · ')}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="number"
                      value={freeQty}
                      onChange={e => setFreeQty(e.target.value)}
                      inputMode="decimal"
                      placeholder="Cant."
                      style={{
                        width: 70, padding: '6px 8px', borderRadius: 8,
                        border: '1px solid var(--border)', background: 'var(--bg)',
                        fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                        color: 'var(--text-1)', outline: 'none',
                      }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{item.unidad}</span>
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

              {/* Plazas chips — only if multi-plaza configured */}
              {platoPlazo.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>
                    Plazas
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {platoPlazo.map(pp => (
                      <span key={pp.id} style={{
                        padding: '4px 10px', borderRadius: 8,
                        background: 'rgba(67,97,160,.1)', border: '1px solid rgba(67,97,160,.25)',
                        fontSize: 11, fontWeight: 700, color: '#4361a0',
                      }}>
                        {capPlaza(pp.plaza)}
                        {pp.instruccion && (
                          <span style={{ fontWeight: 400, color: 'var(--text-3)', marginLeft: 4 }}>
                            — {pp.instruccion}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* CTA */}
              <button
                onClick={handleCrearTarea}
                disabled={creating}
                style={{
                  width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
                  background: creating ? 'var(--border)' : 'linear-gradient(135deg, var(--navy), #4361a0)',
                  color: creating ? 'var(--text-3)' : '#fff',
                  fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                  cursor: creating ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  transition: 'all .15s',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {creating ? 'more_horiz' : 'add_task'}
                </span>
                {creating ? 'Creando...' : 'Crear tarea →'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Success banner ── */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            key="success-banner"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '7px 12px',
              background: 'rgba(34,197,94,.1)', borderTop: '1px solid rgba(34,197,94,.2)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#22c55e' }}>check_circle</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#22c55e' }}>
                Tarea creada en {successMsg}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete row (expand on name tap) ── */}
      <AnimatePresence>
        {showDelete && (
          <motion.div
            key="delete-row"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '6px 12px 10px', borderTop: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                Estándar: {item.cantidad} {item.unidad}
              </span>
              {recetaInfo?.pesoPorcion != null && (
                <span style={{ fontSize: 11, color: '#4361a0', fontWeight: 600 }}>
                  · Porción: {recetaInfo.pesoPorcion}g
                </span>
              )}
              {recetaInfo?.porciones != null && !recetaInfo?.pesoPorcion && (
                <span style={{ fontSize: 11, color: '#4361a0', fontWeight: 600 }}>
                  · {recetaInfo.porciones} porc.
                </span>
              )}
              {item.ubicacion && (
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>· {item.ubicacion}</span>
              )}
              <div style={{ flex: 1 }} />
              <button
                onClick={() => onDelete(item.id)}
                style={{
                  ...btnReset, padding: '4px 10px', borderRadius: 8,
                  fontSize: 11, fontWeight: 600, color: '#ef4444',
                  background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)',
                }}
              >
                Eliminar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
