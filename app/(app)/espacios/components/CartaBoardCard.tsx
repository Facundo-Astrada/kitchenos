'use client'

import { useRef } from 'react'
import type { PlatoRecetaEnriquecido } from '@/lib/hooks/useCarta'
import type { PlazaCustom } from '@/types'
import { plazaLabel, plazaColor } from '@/lib/constants'

interface Props {
  pr: PlatoRecetaEnriquecido
  plazasCustom: PlazaCustom[]
  isDragging: boolean
  disabled: boolean
  onDragStart: (pr: PlatoRecetaEnriquecido) => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: () => void
}

export default function CartaBoardCard({ pr, plazasCustom, isDragging, disabled, onDragStart, onDragMove, onDragEnd }: Props) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const active = useRef(false)

  function onPointerDown(e: React.PointerEvent) {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, y: e.clientY }
    active.current = false
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    if (!active.current) {
      if (Math.hypot(dx, dy) < 6) return
      active.current = true
      onDragStart(pr)
    }
    onDragMove(e.clientX, e.clientY)
  }

  function endDrag(e: React.PointerEvent) {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    const wasDragging = active.current
    start.current = null
    active.current = false
    if (wasDragging) onDragEnd()
  }

  const color = pr.plaza ? plazaColor(pr.plaza, plazasCustom) : null

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        padding: '8px 10px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)',
        cursor: disabled ? 'default' : (isDragging ? 'grabbing' : 'grab'),
        opacity: isDragging ? 0.35 : 1, touchAction: 'none', userSelect: 'none',
        transition: 'opacity .1s',
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {pr.receta?.nombre ?? 'Preparación'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {pr.cantidad_ops != null && (
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{pr.cantidad_ops} {pr.unidad_ops ?? 'u'}</span>
        )}
        {pr.plaza ? (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: `${color}18`, color: color ?? 'var(--text-3)' }}>
            {plazaLabel(pr.plaza, plazasCustom)}
          </span>
        ) : (
          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 99, background: 'var(--border)', color: 'var(--text-3)' }}>
            Sin plaza
          </span>
        )}
      </div>
    </div>
  )
}
