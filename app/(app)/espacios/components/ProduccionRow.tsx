'use client'

import { useRef } from 'react'
import type { MisePlaceItem } from '@/types'

const PRIO_CFG: Record<string, { label: string; color: string; bg: string }> = {
  sp:  { label: 'SP',  color: '#ef4444', bg: 'rgba(239,68,68,.13)' },
  p:   { label: 'P',   color: '#f97316', bg: 'rgba(249,115,22,.13)' },
  ref: { label: 'REF', color: '#3b82f6', bg: 'rgba(59,130,246,.13)' },
  chk: { label: 'OK',  color: '#22c55e', bg: 'rgba(34,197,94,.13)' },
}

interface Props {
  item: MisePlaceItem
  isDragging: boolean
  onDragStart: (item: MisePlaceItem) => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: () => void
  onDelete: (id: string) => void
}

export default function ProduccionRow({ item, isDragging, onDragStart, onDragMove, onDragEnd, onDelete }: Props) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const active = useRef(false)
  const prio = PRIO_CFG[item.prioridad] ?? PRIO_CFG.chk

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
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
      onDragStart(item)
    }
    onDragMove(e.clientX, e.clientY)
  }

  function endDrag(e: React.PointerEvent) {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (active.current) onDragEnd()
    start.current = null
    active.current = false
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px', borderRadius: 8,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        cursor: 'grab',
        opacity: isDragging ? 0.35 : 1,
        touchAction: 'none', userSelect: 'none',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)', flexShrink: 0 }}>drag_indicator</span>
      <span style={{
        fontSize: 10, fontWeight: 700, color: prio.color, background: prio.bg,
        padding: '1px 6px', borderRadius: 6, flexShrink: 0,
      }}>{prio.label}</span>
      <span style={{ fontSize: 13, color: 'var(--text-1)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.nombre}
      </span>
      {(item.cantidad > 0 || !!item.unidad) && (
        <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
          {item.cantidad > 0 ? item.cantidad : ''}{item.unidad ? ` ${item.unidad}` : ''}
        </span>
      )}
      <button
        data-no-drag
        onClick={() => onDelete(item.id)}
        title="Eliminar"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 2, flexShrink: 0 }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
      </button>
    </div>
  )
}
