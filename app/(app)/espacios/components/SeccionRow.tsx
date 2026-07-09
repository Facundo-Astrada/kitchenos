'use client'

import { useState } from 'react'
import type { ChecklistSeccionConfig, MisePlaceItem, Plaza } from '@/types'
import ProduccionRow from './ProduccionRow'
import StockearSeccionOverlay from './StockearSeccionOverlay'
import HaccpSeccionLink from './HaccpSeccionLink'

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
  const [stockeando, setStockeando] = useState(false)
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
        {droppable && seccion!.tipo === 'almacen' && (
          <button onClick={() => setStockeando(true)} title="Stockear sección" style={iconBtn}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>inventory</span>
          </button>
        )}
        {droppable && (
          <>
            <button onClick={onLimpieza} title="Limpieza" style={iconBtn}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>cleaning_services</span>
            </button>
            <button onClick={() => onAddItem(seccion!)} title="Agregar producción" style={iconBtn}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            </button>
            {(() => {
              const tieneProductosAlmacen = seccion!.tipo === 'almacen' && (seccion!.producto_ids?.length ?? 0) > 0
              const bloqueado = items.length > 0 || tieneProductosAlmacen
              return (
                <button
                  onClick={() => { if (!bloqueado) onDeleteSeccion(seccion!.id) }}
                  disabled={bloqueado}
                  title={bloqueado ? 'Vacía la sección (producciones o productos asignados) antes de borrarla' : 'Eliminar sección'}
                  style={{ ...iconBtn, opacity: bloqueado ? 0.3 : 1 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15, color: bloqueado ? 'var(--text-3)' : '#ef4444' }}>delete</span>
                </button>
              )
            })()}
          </>
        )}
      </div>

      {droppable && (seccion!.tipo === 'heladera' || seccion!.tipo === 'freezer') && (
        <HaccpSeccionLink nombreSeccion={seccion!.nombre} />
      )}

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

      {stockeando && seccion && (
        <StockearSeccionOverlay seccion={seccion} onClose={() => setStockeando(false)} />
      )}
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-3)', display: 'flex', padding: 3, flexShrink: 0,
}
