'use client'

import { useState } from 'react'
import type { Espacio, EspacioPlaza, ChecklistSeccionConfig, MisePlaceItem, Plaza } from '@/types'
import { PLAZAS_FIJAS, PLAZA_LABELS } from '@/lib/constants'
import PlazaRow from './PlazaRow'

const ICONOS_ESPACIO = [
  'kitchen', 'dining', 'warehouse', 'factory', 'outdoor_grill',
  'bakery_dining', 'local_bar', 'inventory_2', 'store', 'home',
]

interface Props {
  espacio: Espacio
  plazasDelEspacio: EspacioPlaza[]
  plazasUsadas: Set<string>
  secciones: ChecklistSeccionConfig[]
  items: MisePlaceItem[]
  overSecId: string | null
  registerDropZone: (secId: string, el: HTMLElement | null, plaza: Plaza) => void
  draggingId: string | null
  onDragStart: (item: MisePlaceItem) => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: () => void
  onActualizar: (id: string, datos: { nombre?: string; icono?: string }) => void
  onEliminar: (id: string) => void
  onAsignarPlaza: (espacioId: string, plaza: Plaza) => void
  onQuitarPlaza: (id: string) => void
  onAddSeccion: (plaza: Plaza) => void
  onSeedSecciones: (plaza: Plaza) => void
  onAddItem: (seccion: ChecklistSeccionConfig) => void
  onDeleteSeccion: (id: string) => void
  onDeleteItem: (id: string) => void
  onLimpieza: (scope: { type: 'espacio' | 'plaza' | 'seccion'; plazas: Plaza[]; nombre: string }) => void
}

export default function EspacioCard(props: Props) {
  const {
    espacio, plazasDelEspacio, plazasUsadas, secciones, items,
    overSecId, registerDropZone, draggingId,
    onDragStart, onDragMove, onDragEnd,
    onActualizar, onEliminar, onAsignarPlaza, onQuitarPlaza,
    onAddSeccion, onSeedSecciones, onAddItem, onDeleteSeccion, onDeleteItem, onLimpieza,
  } = props

  const [open, setOpen] = useState(true)
  const [editando, setEditando] = useState(false)
  const [editNombre, setEditNombre] = useState(espacio.nombre)
  const [editIcono, setEditIcono] = useState(espacio.icono)
  const [showPlazaPicker, setShowPlazaPicker] = useState(false)

  const plazasLibres = PLAZAS_FIJAS.filter(p => !plazasUsadas.has(p))
  const plazasAqui = plazasDelEspacio.map(ep => ep.plaza_key)
  const todasLasPlazas: Plaza[] = plazasDelEspacio.map(ep => ep.plaza_key)

  function guardarEdit() {
    if (editNombre.trim()) {
      onActualizar(espacio.id, { nombre: editNombre.trim(), icono: editIcono })
    }
    setEditando(false)
  }

  return (
    <div style={{
      borderRadius: 16,
      border: '1px solid var(--border)',
      background: 'var(--surface)',
      boxShadow: '0 2px 8px rgba(0,0,0,.05)',
    }}>
      {/* Header del espacio */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
        {editando ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginRight: 4 }}>
              {ICONOS_ESPACIO.map(ic => (
                <button
                  key={ic}
                  onClick={() => setEditIcono(ic)}
                  title={ic}
                  style={{
                    background: editIcono === ic ? 'var(--accent)' : 'var(--bg)',
                    border: '1px solid var(--border)', borderRadius: 6,
                    cursor: 'pointer', padding: 3, display: 'flex',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: editIcono === ic ? '#fff' : 'var(--text-2)' }}>{ic}</span>
                </button>
              ))}
            </div>
            <input
              value={editNombre}
              onChange={e => setEditNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') guardarEdit(); if (e.key === 'Escape') setEditando(false) }}
              autoFocus
              style={{
                fontSize: 16, fontWeight: 700, border: 'none', background: 'transparent',
                color: 'var(--text-1)', outline: 'none', flex: 1, minWidth: 0, fontFamily: 'inherit',
                borderBottom: '2px solid var(--accent)',
              }}
            />
            <button onClick={guardarEdit} style={accentBtn}>Guardar</button>
            <button onClick={() => setEditando(false)} style={ghostBtn}>Cancelar</button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', flex: 1, minWidth: 0, padding: 0, fontFamily: 'inherit' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)' }}>
                {open ? 'expand_more' : 'chevron_right'}
              </span>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--navy)' }}>{espacio.icono}</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>{espacio.nombre}</span>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>· {plazasAqui.length} {plazasAqui.length === 1 ? 'plaza' : 'plazas'}</span>
            </button>
            <button onClick={() => onLimpieza({ type: 'espacio', plazas: todasLasPlazas, nombre: espacio.nombre })} title="Limpieza del espacio" style={iconBtn}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>cleaning_services</span>
            </button>
            <button onClick={() => { setEditNombre(espacio.nombre); setEditIcono(espacio.icono); setEditando(true) }} title="Editar espacio" style={iconBtn}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
            </button>
            <button onClick={() => setShowPlazaPicker(p => !p)} title="Asignar plaza" style={iconBtn}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add_box</span>
            </button>
            <button onClick={() => { if (confirm(`¿Eliminar el espacio "${espacio.nombre}"?`)) onEliminar(espacio.id) }} title="Eliminar espacio" style={iconBtn}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
            </button>
          </>
        )}
      </div>

      {/* Plaza picker */}
      {showPlazaPicker && (
        <div style={{ padding: '0 14px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {plazasLibres.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Todas las plazas ya están asignadas.</span>
          )}
          {plazasLibres.map(p => (
            <button
              key={p}
              onClick={() => { onAsignarPlaza(espacio.id, p); setShowPlazaPicker(false) }}
              style={{
                fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
                border: '1px solid var(--accent)', color: 'var(--accent)', background: 'none',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {PLAZA_LABELS[p]}
            </button>
          ))}
        </div>
      )}

      {/* Plazas */}
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10, padding: '0 12px 12px' }}>
          {plazasDelEspacio.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-3)', padding: '0 2px' }}>
              Sin plazas asignadas. Usá el botón <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: 'middle' }}>add_box</span> para agregar.
            </p>
          )}
          {plazasDelEspacio.map(ep => {
            const plaza = ep.plaza_key as Plaza
            const secsPlaza = secciones.filter(s => s.plaza === plaza)
            const itsPlaza = items.filter(it => it.plaza === plaza)
            return (
              <PlazaRow
                key={ep.id}
                plaza={plaza}
                espacioPlazaId={ep.id}
                secciones={secsPlaza}
                items={itsPlaza}
                overSecId={overSecId}
                registerDropZone={registerDropZone}
                draggingId={draggingId}
                onDragStart={onDragStart}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
                onQuitarPlaza={onQuitarPlaza}
                onAddSeccion={onAddSeccion}
                onSeedSecciones={onSeedSecciones}
                onAddItem={onAddItem}
                onDeleteSeccion={onDeleteSeccion}
                onDeleteItem={onDeleteItem}
                onLimpieza={(scope) => onLimpieza({ ...scope, plazas: [plaza] })}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-3)', display: 'flex', padding: 4, flexShrink: 0, borderRadius: 6,
}
const accentBtn: React.CSSProperties = {
  background: 'var(--accent)', color: '#fff', border: 'none',
  borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}
const ghostBtn: React.CSSProperties = {
  background: 'none', color: 'var(--text-2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}
