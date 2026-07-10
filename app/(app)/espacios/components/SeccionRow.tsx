'use client'

import { useState } from 'react'
import type { ChecklistSeccionConfig, MisePlaceItem, Plaza } from '@/types'
import { seccionTieneContenido } from '@/lib/checklist/secciones'
import ProduccionRow from './ProduccionRow'
import StockearSeccionOverlay from './StockearSeccionOverlay'
import HaccpSeccionLink from './HaccpSeccionLink'

interface Props {
  seccion: ChecklistSeccionConfig | null   // null = bucket "Sin sección"
  plaza: Plaza
  allSecciones: ChecklistSeccionConfig[]   // todas las de la plaza (raíces + hijas), planas
  allItems: MisePlaceItem[]                // todos los items de la plaza (o del bucket "Sin sección")
  depth?: number                           // 0 = raíz, 1 = sub-sección. v1 no permite más de 1.
  overSecId: string | null                 // id de la sección sobre la que se está arrastrando (o null)
  registerDropZone: (secId: string, el: HTMLElement | null, plaza: Plaza) => void
  draggingId: string | null
  onDragStart: (item: MisePlaceItem) => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: () => void
  onAddItem: (seccion: ChecklistSeccionConfig) => void
  onDeleteSeccion: (id: string) => void
  onDeleteItem: (id: string) => void
  onEditItem: (item: MisePlaceItem) => void
  onLimpieza: (scope: { type: 'plaza' | 'seccion'; plaza: Plaza; nombre: string }) => void
}

export default function SeccionRow({
  seccion, plaza, allSecciones, allItems, depth = 0, overSecId, registerDropZone,
  draggingId, onDragStart, onDragMove, onDragEnd,
  onAddItem, onDeleteSeccion, onDeleteItem, onEditItem, onLimpieza,
}: Props) {
  const [open, setOpen] = useState(true)
  const [stockeando, setStockeando] = useState(false)
  const droppable = !!seccion
  const isDropTarget = !!seccion && overSecId === seccion.id

  // El bucket "Sin sección" recibe allItems ya filtrado por el padre; una
  // sección real filtra los suyos propios de la lista completa de la plaza.
  const myItems = seccion ? allItems.filter(i => i.seccion_id === seccion.id) : allItems
  // v1: solo 1 nivel de profundidad — una sub-sección (depth=1) nunca calcula
  // ni renderiza sus propios hijos.
  const children = seccion && depth === 0
    ? allSecciones.filter(s => s.parent_id === seccion.id).sort((a, b) => a.orden - b.orden)
    : []

  const bloqueado = seccion ? seccionTieneContenido(seccion, allSecciones, allItems) : false

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
          <span className="material-symbols-outlined" style={{ fontSize: depth > 0 ? 14 : 16, color: 'var(--text-3)' }}>
            {open ? 'expand_more' : 'chevron_right'}
          </span>
          <span className="material-symbols-outlined" style={{ fontSize: depth > 0 ? 14 : 16, color: 'var(--text-2)' }}>
            {seccion?.icono ?? 'help'}
          </span>
          <span style={{ fontSize: depth > 0 ? 11 : 12, fontWeight: 600, color: depth > 0 ? 'var(--text-2)' : 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {seccion?.nombre ?? 'Sin sección'}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>· {myItems.length}</span>
        </button>
        {droppable && seccion!.tipo === 'almacen' && (
          <button onClick={() => setStockeando(true)} title="Stockear sección" style={iconBtn}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>inventory</span>
          </button>
        )}
        {droppable && (
          <>
            <button onClick={() => onLimpieza({ type: 'seccion', plaza, nombre: seccion!.nombre })} title="Limpieza" style={iconBtn}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>cleaning_services</span>
            </button>
            <button onClick={() => onAddItem(seccion!)} title="Agregar producción" style={iconBtn}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            </button>
            <button
              onClick={() => { if (!bloqueado) onDeleteSeccion(seccion!.id) }}
              disabled={bloqueado}
              title={bloqueado ? 'Vacía la sección (producciones, sub-secciones o productos asignados) antes de borrarla' : 'Eliminar sección'}
              style={{ ...iconBtn, opacity: bloqueado ? 0.3 : 1 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15, color: bloqueado ? 'var(--text-3)' : '#ef4444' }}>delete</span>
            </button>
          </>
        )}
      </div>

      {droppable && (seccion!.tipo === 'heladera' || seccion!.tipo === 'freezer') && (
        <HaccpSeccionLink nombreSeccion={seccion!.nombre} />
      )}

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
          {myItems.length === 0 && children.length === 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-3)', padding: '4px 8px' }}>Sin producciones</p>
          )}
          {myItems.map(item => (
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

          {children.map(child => (
            <div key={child.id} style={{ marginLeft: 10, marginTop: 6, paddingLeft: 10, borderLeft: '2px solid var(--border)' }}>
              <SeccionRow
                seccion={child}
                plaza={plaza}
                allSecciones={allSecciones}
                allItems={allItems}
                depth={1}
                overSecId={overSecId}
                registerDropZone={registerDropZone}
                draggingId={draggingId}
                onDragStart={onDragStart}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
                onAddItem={onAddItem}
                onDeleteSeccion={onDeleteSeccion}
                onDeleteItem={onDeleteItem}
                onEditItem={onEditItem}
                onLimpieza={onLimpieza}
              />
            </div>
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
