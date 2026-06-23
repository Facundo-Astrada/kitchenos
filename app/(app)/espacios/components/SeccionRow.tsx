'use client'

import { useState } from 'react'
import type { ChecklistSeccionConfig, MisePlaceItem, Plaza } from '@/types'
import ProduccionRow from './ProduccionRow'

interface Props {
  seccion: ChecklistSeccionConfig | null   // null = bucket "Sin sección"
  plaza: Plaza
  items: MisePlaceItem[]
  isDropTarget: boolean
  registerDropZone: (secId: string, el: HTMLElement | null, plaza: Plaza) => void
  draggingId: string | null
  onDragStart: (item: MisePlaceItem) => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: () => void
  onAddItem: (seccion: ChecklistSeccionConfig) => void
  onDeleteSeccion: (id: string) => void
  onDeleteItem: (id: string) => void
  onEditItem: (item: MisePlaceItem) => void
  onLimpieza: () => void
}

export default function SeccionRow({
  seccion, plaza, items, isDropTarget, registerDropZone,
  draggingId, onDragStart, onDragMove, onDragEnd,
  onAddItem, onDeleteSeccion, onDeleteItem, onEditItem, onLimpieza,
}: Props) {
  const [open, setOpen] = useState(true)
  const droppable = !!seccion

  return (
    <div
      ref={(el) => { if (droppable) registerDropZone(seccion!.id, el, plaza) }}
      style={{
        borderRadius: 10,
        border: isDropTarget ? '2px solid var(--accent)' : '1px solid var(--border)',
        background: 'var(--bg)',
        padding: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', flex: 1, minWidth: 0, padding: 0, fontFamily: 'inherit' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>
            {open ? 'expand_more' : 'chevron_right'}
          </span>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-2)' }}>
            {seccion?.icono ?? 'help'}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {seccion?.nombre ?? 'Sin sección'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>· {items.length}</span>
        </button>
        {droppable && (
          <>
            <button onClick={onLimpieza} title="Limpieza" style={iconBtn}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>cleaning_services</span>
            </button>
            <button onClick={() => onAddItem(seccion!)} title="Agregar producción" style={iconBtn}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            </button>
            <button onClick={() => onDeleteSeccion(seccion!.id)} title="Eliminar sección" style={iconBtn}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>delete</span>
            </button>
          </>
        )}
      </div>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
          {items.length === 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-3)', padding: '4px 8px' }}>Sin producciones</p>
          )}
          {items.map(item => (
            <ProduccionRow
              key={item.id}
              item={item}
              isDragging={draggingId === item.id}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
              onDelete={onDeleteItem}
              onEdit={onEditItem}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-3)', display: 'flex', padding: 3, flexShrink: 0,
}
