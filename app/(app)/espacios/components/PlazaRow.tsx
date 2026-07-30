'use client'

import { useMemo, useState } from 'react'
import type { ChecklistSeccionConfig, MisePlaceItem, Plaza, PlazaCustom } from '@/types'
import { plazaLabel, plazaIcon, esPlazaCustom } from '@/lib/constants'
import SeccionRow from './SeccionRow'

interface Props {
  plaza: Plaza
  espacioPlazaId: string
  plazasCustom: PlazaCustom[]
  secciones: ChecklistSeccionConfig[]
  items: MisePlaceItem[]
  overSecId: string | null
  registerDropZone: (secId: string, el: HTMLElement | null, plaza: Plaza) => void
  draggingId: string | null
  onDragStart: (item: MisePlaceItem) => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: () => void
  onPlazaDragStart: () => void
  onQuitarPlaza: (id: string) => void
  onEliminarPlazaCustom: (key: string) => void
  onAddSeccion: (plaza: Plaza) => void
  onSeedSecciones: (plaza: Plaza) => void
  onAddItem: (seccion: ChecklistSeccionConfig) => void
  onDeleteSeccion: (id: string) => void
  onDeleteItem: (id: string) => void
  onEditItem: (item: MisePlaceItem) => void
  onLimpieza: (scope: { type: 'plaza' | 'seccion'; plaza: Plaza; nombre: string }) => void
}

export default function PlazaRow(props: Props) {
  const { plaza, espacioPlazaId, plazasCustom, secciones, items, overSecId, registerDropZone,
    draggingId, onDragStart, onDragMove, onDragEnd, onPlazaDragStart,
    onQuitarPlaza, onEliminarPlazaCustom, onAddSeccion, onSeedSecciones, onAddItem, onDeleteSeccion, onDeleteItem, onEditItem, onLimpieza } = props
  const [open, setOpen] = useState(true)
  const label = plazaLabel(plaza, plazasCustom)
  const isCustom = esPlazaCustom(plaza, plazasCustom)

  // `secciones` incluye raíces + sub-secciones (planas) — un item "sin sección"
  // es el que no matchea ningún id conocido a ninguna profundidad.
  const seccionIds = useMemo(() => new Set(secciones.map(s => s.id)), [secciones])
  const sinSeccion = useMemo(
    () => items.filter(it => !it.seccion_id || !seccionIds.has(it.seccion_id)),
    [items, seccionIds]
  )
  const seccionesRaiz = useMemo(() => secciones.filter(s => !s.parent_id), [secciones])

  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px' }}>
        <span
          draggable
          onDragStart={onPlazaDragStart}
          title="Arrastrar para reordenar"
          className="material-symbols-outlined"
          style={{ fontSize: 16, color: 'var(--text-3)', cursor: 'grab', flexShrink: 0 }}
        >
          drag_indicator
        </span>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', flex: 1, minWidth: 0, padding: 0, fontFamily: 'inherit' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>
            {open ? 'expand_more' : 'chevron_right'}
          </span>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>
            {plazaIcon(plaza, plazasCustom)}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{label}</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>· {items.length} prod.</span>
        </button>
        <button onClick={() => onLimpieza({ type: 'plaza', plaza, nombre: label })} title="Limpieza de la plaza" style={iconBtn}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>cleaning_services</span>
        </button>
        <button onClick={() => onAddSeccion(plaza)} title="Agregar sección" style={iconBtn}>
          <span className="material-symbols-outlined" style={{ fontSize: 17 }}>create_new_folder</span>
        </button>
        {isCustom ? (
          <button
            onClick={() => { if (confirm(`¿Eliminar la plaza "${label}"? Se borra también su mise/producción.`)) onEliminarPlazaCustom(plaza) }}
            title="Eliminar plaza"
            style={iconBtn}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
          </button>
        ) : (
          <button onClick={() => onQuitarPlaza(espacioPlazaId)} title="Quitar plaza del espacio" style={iconBtn}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>link_off</span>
          </button>
        )}
      </div>

      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, padding: '0 10px 10px' }}>
          {secciones.length === 0 && sinSeccion.length === 0 && (
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
          {seccionesRaiz.map(sec => (
            <SeccionRow
              key={sec.id}
              seccion={sec}
              plaza={plaza}
              allSecciones={secciones}
              allItems={items}
              depth={0}
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
          ))}
          {sinSeccion.length > 0 && (
            <SeccionRow
              seccion={null}
              plaza={plaza}
              allSecciones={secciones}
              allItems={sinSeccion}
              depth={0}
              overSecId={overSecId}
              registerDropZone={registerDropZone}
              draggingId={draggingId}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
              onAddItem={() => {}}
              onDeleteSeccion={() => {}}
              onDeleteItem={onDeleteItem}
              onEditItem={onEditItem}
              onLimpieza={onLimpieza}
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
