'use client'

import { useState } from 'react'
import { ItemOps } from './ItemOps'
import { QuickAdd } from './QuickAdd'
import type { Tarea, OpsEstado, OpsModo } from '@/types'

interface SeccionOpsProps {
  titulo: string
  color: string
  items: Tarea[]
  subtareasByParent: Record<string, Tarea[]>
  onAddItem: (titulo: string) => Promise<void>
  onEstadoChange: (id: string, estado: OpsEstado) => void
  onAddSubtarea: (parentId: string, titulo: string) => Promise<void>
  modo?: OpsModo
  showSeccionChip?: boolean
  showPrioChip?: boolean
}

export function SeccionOps({
  titulo, color, items, subtareasByParent,
  onAddItem, onEstadoChange, onAddSubtarea, modo, showSeccionChip, showPrioChip,
}: SeccionOpsProps) {
  const [collapsed, setCollapsed] = useState(false)

  const listos = items.filter((i) => i.estado === 'listo').length
  const total = items.length
  const pct = total > 0 ? listos / total : 0

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 8,
    }}>
      {/* Section header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px',
          background: 'none', border: 'none', cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: color, flexShrink: 0,
        }} />
        <span style={{
          flex: 1, textAlign: 'left',
          fontSize: 12, fontWeight: 700,
          color: 'var(--text-1)',
          textTransform: 'uppercase', letterSpacing: '.06em',
        }}>
          {titulo}
        </span>
        <span style={{
          fontSize: 11, fontFamily: "'DM Mono', monospace",
          color: pct === 1 && total > 0 ? '#22c55e' : 'var(--text-3)',
          fontWeight: 700,
        }}>
          {listos}/{total}
        </span>
        <span className="material-symbols-outlined" style={{
          fontSize: 18, color: 'var(--text-3)',
          transform: collapsed ? 'rotate(-90deg)' : 'none',
          transition: 'transform .15s',
        }}>
          expand_more
        </span>
      </button>

      {/* Progress bar */}
      <div style={{ height: 2, background: 'var(--border)' }}>
        <div style={{
          width: `${pct * 100}%`, height: '100%',
          background: color, transition: 'width .3s',
        }} />
      </div>

      {/* Items + QuickAdd */}
      {!collapsed && (
        <div style={{ padding: '6px 10px 10px' }}>
          {items.map((item) => (
            <ItemOps
              key={item.id}
              item={item}
              subtareas={subtareasByParent[item.id] ?? []}
              onEstadoChange={onEstadoChange}
              onAddSubtarea={onAddSubtarea}
              modo={modo}
              showSeccionChip={showSeccionChip}
              showPrioChip={showPrioChip}
            />
          ))}
          {items.length === 0 && (
            <div style={{ padding: '8px 2px', fontSize: 12, color: 'var(--text-3)' }}>
              Sin preparaciones aún
            </div>
          )}
          <div style={{ marginTop: 4 }}>
            <QuickAdd onSave={onAddItem} />
          </div>
        </div>
      )}
    </div>
  )
}
