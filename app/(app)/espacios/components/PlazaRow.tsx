'use client'

import { useMemo, useState } from 'react'
import type { ChecklistSeccionConfig, MisePlaceItem, Plaza } from '@/types'
import { PLAZA_LABELS, PLAZA_ICONS } from '@/lib/constants'
import SeccionRow from './SeccionRow'

interface Props {
  plaza: Plaza
  espacioPlazaId: string
  secciones: ChecklistSeccionConfig[]
  items: MisePlaceItem[]
  overSecId: string | null
  registerDropZone: (secId: string, el: HTMLElement | null, plaza: Plaza) => void
  draggingId: string | null
  onDragStart: (item: MisePlaceItem) => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: () => void
  onQuitarPlaza: (id: string) => void
  onAddSeccion: (plaza: Plaza) => void
  onSeedSecciones: (plaza: Plaza) => void
  onAddItem: (seccion: ChecklistSeccionConfig) => void
  onDeleteSeccion: (id: string) => void
  onDeleteItem: (id: string) => void
  onLimpieza: (scope: { type: 'plaza' | 'seccion'; plaza: Plaza; nombre: string }) => void
}

export default function PlazaRow(props: Props) {
  const { plaza, espacioPlazaId, secciones, items, overSecId, registerDropZone,
    draggingId, onDragStart, onDragMove, onDragEnd,
    onQuitarPlaza, onAddSeccion, onSeedSecciones, onAddItem, onDeleteSeccion, onDeleteItem, onLimpieza } = props
  const [open, setOpen] = useState(true)

  const seccionIds = useMemo(() => new Set(secciones.map(s => s.id)), [secciones])
  const itemsBySeccion = useMemo(() => {
    const map = new Map<string, MisePlaceItem[]>()
    const sinSeccion: MisePlaceItem[] = []
    for (const it of items) {
      if (it.seccion_id && seccionIds.has(it.seccion_id)) {
        const arr = map.get(it.seccion_id) ?? []
        arr.push(it); map.set(it.seccion_id, arr)
      } else {
        sinSeccion.push(it)
      }
    }
    return { map, sinSeccion }
  }, [items, seccionIds])

  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', flex: 1, minWidth: 0, padding: 0, fontFamily: 'inherit' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>
            {open ? 'expand_more' : 'chevron_right'}
          </span>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>
            {PLAZA_ICONS[plaza]}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{PLAZA_LABELS[plaza]}</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>· {items.length} prod.</span>
        </button>
        <button onClick={() => onLimpieza({ type: 'plaza', plaza, nombre: PLAZA_LABELS[plaza] })} title="Limpieza de la plaza" style={iconBtn}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>cleaning_services</span>
        </button>
        <button onClick={() => onAddSeccion(plaza)} title="Agregar sección" style={iconBtn}>
          <span className="material-symbols-outlined" style={{ fontSize: 17 }}>create_new_folder</span>
        </button>
        <button onClick={() => onQuitarPlaza(espacioPlazaId)} title="Quitar plaza del espacio" style={iconBtn}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>link_off</span>
        </button>
      </div>

      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, padding: '0 10px 10px' }}>
          {secciones.length === 0 && itemsBySeccion.sinSeccion.length === 0 && (
            <div style={{ padding: '4px 4px 4px' }}>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>Esta plaza no tiene secciones todavía.</p>
              <button
                onClick={() => onSeedSecciones(plaza)}
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'none', border: '1px dashed var(--accent)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Crear secciones base
              </button>
            </div>
          )}
          {secciones.map(sec => (
            <SeccionRow
              key={sec.id}
              seccion={sec}
              plaza={plaza}
              items={itemsBySeccion.map.get(sec.id) ?? []}
              isDropTarget={overSecId === sec.id}
              registerDropZone={registerDropZone}
              draggingId={draggingId}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
              onAddItem={onAddItem}
              onDeleteSeccion={onDeleteSeccion}
              onDeleteItem={onDeleteItem}
              onLimpieza={() => onLimpieza({ type: 'seccion', plaza, nombre: sec.nombre })}
            />
          ))}
          {itemsBySeccion.sinSeccion.length > 0 && (
            <SeccionRow
              seccion={null}
              plaza={plaza}
              items={itemsBySeccion.sinSeccion}
              isDropTarget={false}
              registerDropZone={registerDropZone}
              draggingId={draggingId}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
              onAddItem={() => {}}
              onDeleteSeccion={() => {}}
              onDeleteItem={onDeleteItem}
              onLimpieza={() => {}}
            />
          )}
        </div>
      )}
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-3)', display: 'flex', padding: 3, flexShrink: 0,
}
