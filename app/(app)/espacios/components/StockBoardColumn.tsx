'use client'

import { useState } from 'react'
import type { ProductoConEstado } from '@/lib/hooks/useStock'
import type { StockSector, StockEstante } from '@/types'
import StockBoardCard from './StockBoardCard'

// Preset de íconos para sectores físicos de stock — cubre almacenamiento en
// frío/seco, producción, bebidas y zonas comunes de cocina/restaurante.
export const SECTOR_ICONOS = [
  'shelves', 'warehouse', 'inventory_2',
  'ac_unit', 'kitchen', 'severe_cold', 'icecream',
  'skillet', 'outdoor_grill', 'soup_kitchen', 'countertops',
  'wine_bar', 'liquor', 'local_bar', 'local_cafe',
  'bakery_dining', 'set_meal', 'egg',
  'cleaning_services',
]

export function zoneKey(sectorId: string | null, estanteId: string | null): string {
  return `${sectorId ?? 'none'}::${estanteId ?? 'none'}`
}

interface BucketProps {
  zoneKeyStr: string
  sectorId: string | null
  estanteId: string | null
  productos: ProductoConEstado[]
  sectoresTodos: StockSector[]
  estantesTodos: StockEstante[]
  isOver: boolean
  draggingId: string | null
  registerDropZone: (key: string, el: HTMLElement | null, sectorId: string | null, estanteId: string | null) => void
  registerCardRef: (id: string, el: HTMLElement | null) => void
  onDragStart: (p: ProductoConEstado) => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: () => void
  onMoverA: (productoId: string, sectorId: string | null, estanteId: string | null) => void
  onEliminarProducto: (id: string) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
}

function Bucket({ zoneKeyStr, sectorId, estanteId, productos, sectoresTodos, estantesTodos, isOver, draggingId, registerDropZone, registerCardRef, onDragStart, onDragMove, onDragEnd, onMoverA, onEliminarProducto, selectedIds, onToggleSelect }: BucketProps) {
  return (
    <div
      ref={el => registerDropZone(zoneKeyStr, el, sectorId, estanteId)}
      style={{
        borderRadius: 9, padding: 5, minHeight: 40,
        border: `1.5px dashed ${isOver ? 'var(--accent)' : 'transparent'}`,
        background: isOver ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
        transition: 'background .1s, border-color .1s',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {productos.map(p => (
          <StockBoardCard
            key={p.id}
            producto={p}
            isDragging={draggingId === p.id}
            selected={selectedIds.has(p.id)}
            sectores={sectoresTodos}
            estantes={estantesTodos}
            registerCardRef={registerCardRef}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onMoverA={onMoverA}
            onEliminar={onEliminarProducto}
            onToggleSelect={onToggleSelect}
          />
        ))}
        {productos.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '8px 4px', textAlign: 'center' }}>Soltá productos acá</div>
        )}
      </div>
    </div>
  )
}

interface EstanteBoxProps {
  estante: StockEstante
  productos: ProductoConEstado[]
  sectoresTodos: StockSector[]
  estantesTodos: StockEstante[]
  overZoneKey: string | null
  draggingId: string | null
  esPrimero: boolean
  esUltimo: boolean
  registerDropZone: (key: string, el: HTMLElement | null, sectorId: string | null, estanteId: string | null) => void
  registerCardRef: (id: string, el: HTMLElement | null) => void
  onDragStart: (p: ProductoConEstado) => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: () => void
  onMoverA: (productoId: string, sectorId: string | null, estanteId: string | null) => void
  onEliminarProducto: (id: string) => void
  onRenombrar: (id: string, nombre: string) => void
  onEliminar: (id: string) => void
  onReordenar: (id: string, dir: 1 | -1) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
}

function EstanteBox({ estante, productos, sectoresTodos, estantesTodos, overZoneKey, draggingId, esPrimero, esUltimo, registerDropZone, registerCardRef, onDragStart, onDragMove, onDragEnd, onMoverA, onEliminarProducto, onRenombrar, onEliminar, onReordenar, selectedIds, onToggleSelect }: EstanteBoxProps) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(estante.nombre)
  const key = zoneKey(estante.sector_id, estante.id)

  function guardar() {
    if (nombre.trim()) onRenombrar(estante.id, nombre.trim())
    setEditando(false)
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', padding: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-3)', flexShrink: 0 }}>shelves</span>
        {editando ? (
          <input
            autoFocus
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            onBlur={guardar}
            onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') setEditando(false) }}
            style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 700, border: 'none', borderBottom: '1px solid var(--accent)', background: 'transparent', color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit' }}
          />
        ) : (
          <button onClick={() => setEditando(true)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)', fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {estante.nombre}
          </button>
        )}
        <button onClick={() => onReordenar(estante.id, -1)} disabled={esPrimero} style={{ ...miniBtn, opacity: esPrimero ? 0.3 : 1 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>arrow_upward</span>
        </button>
        <button onClick={() => onReordenar(estante.id, 1)} disabled={esUltimo} style={{ ...miniBtn, opacity: esUltimo ? 0.3 : 1 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>arrow_downward</span>
        </button>
        <button
          onClick={() => { if (productos.length === 0 || confirm(`"${estante.nombre}" tiene ${productos.length} producto(s) — se quedan sin estante. ¿Eliminar igual?`)) onEliminar(estante.id) }}
          style={miniBtn}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
        </button>
      </div>
      <Bucket
        zoneKeyStr={key}
        sectorId={estante.sector_id}
        estanteId={estante.id}
        productos={productos}
        sectoresTodos={sectoresTodos}
        estantesTodos={estantesTodos}
        isOver={overZoneKey === key}
        draggingId={draggingId}
        registerDropZone={registerDropZone}
        registerCardRef={registerCardRef}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onMoverA={onMoverA}
        onEliminarProducto={onEliminarProducto}
        selectedIds={selectedIds}
        onToggleSelect={onToggleSelect}
      />
    </div>
  )
}

interface ColumnProps {
  sectorId: string | null
  nombre: string
  icono?: string
  estantesDelSector: StockEstante[]
  productosSinEstante: ProductoConEstado[]
  productosPorEstante: Map<string, ProductoConEstado[]>
  sectoresTodos: StockSector[]
  estantesTodos: StockEstante[]
  overZoneKey: string | null
  draggingId: string | null
  registerDropZone: (key: string, el: HTMLElement | null, sectorId: string | null, estanteId: string | null) => void
  registerCardRef: (id: string, el: HTMLElement | null) => void
  onDragStart: (p: ProductoConEstado) => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: () => void
  onMoverA: (productoId: string, sectorId: string | null, estanteId: string | null) => void
  onEliminarProducto: (id: string) => void
  onAgregarEstante: (sectorId: string, nombre: string) => void
  onRenombrarEstante: (id: string, nombre: string) => void
  onEliminarEstante: (id: string) => void
  onReordenarEstante: (id: string, dir: 1 | -1) => void
  onOrdenarAlfabetico: (sectorId: string | null, estanteId: string | null) => void
  onEliminarSector?: () => void
  onEditarSector?: (nombre: string, icono: string) => void
  ultimoConteoAt?: string | null
  onToggleCollapse: () => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
}

function fmtConteoRel(iso: string | null | undefined): string {
  if (!iso) return 'Nunca contado'
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (dias <= 0) return 'Contado hoy'
  if (dias === 1) return 'Contado ayer'
  if (dias < 30) return `Contado hace ${dias} días`
  return `Contado el ${new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}`
}

export default function StockBoardColumn(props: ColumnProps) {
  const {
    sectorId, nombre, icono, estantesDelSector, productosSinEstante, productosPorEstante,
    sectoresTodos, estantesTodos, overZoneKey, draggingId,
    registerDropZone, registerCardRef, onDragStart, onDragMove, onDragEnd, onMoverA, onEliminarProducto,
    onAgregarEstante, onRenombrarEstante, onEliminarEstante, onReordenarEstante, onOrdenarAlfabetico,
    onEliminarSector, onEditarSector, ultimoConteoAt, onToggleCollapse, selectedIds, onToggleSelect,
  } = props

  const [addingEstante, setAddingEstante] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [editandoSector, setEditandoSector] = useState(false)
  const [editNombre, setEditNombre] = useState(nombre)
  const [editIcono, setEditIcono] = useState(icono ?? SECTOR_ICONOS[0])

  const total = productosSinEstante.length + estantesDelSector.reduce((s, e) => s + (productosPorEstante.get(e.id)?.length ?? 0), 0)
  const raizKey = zoneKey(sectorId, null)

  function abrirEdicionSector() {
    setEditNombre(nombre)
    setEditIcono(icono ?? SECTOR_ICONOS[0])
    setEditandoSector(true)
  }

  function guardarSector() {
    if (editNombre.trim() && onEditarSector) onEditarSector(editNombre.trim(), editIcono)
    setEditandoSector(false)
  }

  function guardarEstante() {
    if (nuevoNombre.trim() && sectorId) {
      onAgregarEstante(sectorId, nuevoNombre.trim())
      setNuevoNombre('')
      setAddingEstante(false)
    }
  }

  return (
    <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', maxHeight: '100%' }}>
      <div style={{ padding: '4px 4px 8px' }}>
        {editandoSector ? (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              autoFocus
              value={editNombre}
              onChange={e => setEditNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') guardarSector(); if (e.key === 'Escape') setEditandoSector(false) }}
              style={{ fontSize: 12.5, fontWeight: 700, padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-1)', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {SECTOR_ICONOS.map(ic => (
                <button key={ic} onClick={() => setEditIcono(ic)}
                  style={{ width: 26, height: 26, borderRadius: 6, background: editIcono === ic ? 'var(--accent)' : 'var(--surface)', border: `1px solid ${editIcono === ic ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: editIcono === ic ? '#fff' : 'var(--text-2)' }}>{ic}</span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setEditandoSector(false)} style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={guardarSector} disabled={!editNombre.trim()} style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: !editNombre.trim() ? 0.5 : 1 }}>Guardar</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={onToggleCollapse} title="Colapsar" style={miniBtn}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>chevron_left</span>
              </button>
              {icono && <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>{icono}</span>}
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</span>
              <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{total}</span>
              <button onClick={() => onOrdenarAlfabetico(sectorId, null)} title="Ordenar A-Z" style={miniBtn}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>sort_by_alpha</span>
              </button>
              {sectorId && onEditarSector && (
                <button onClick={abrirEdicionSector} title="Editar sector" style={miniBtn}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>edit</span>
                </button>
              )}
              {sectorId && onEliminarSector && (
                <button onClick={onEliminarSector} title="Eliminar sector" style={miniBtn}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>delete</span>
                </button>
              )}
            </div>
            {sectorId && (
              <div style={{ fontSize: 10, fontWeight: 500, color: ultimoConteoAt ? 'var(--text-3)' : '#d97706', marginTop: 2, paddingLeft: 28 }}>
                {fmtConteoRel(ultimoConteoAt)}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8 }}>
        {sectorId && estantesDelSector.map((es, i) => (
          <EstanteBox
            key={es.id}
            estante={es}
            productos={productosPorEstante.get(es.id) ?? []}
            sectoresTodos={sectoresTodos}
            estantesTodos={estantesTodos}
            overZoneKey={overZoneKey}
            draggingId={draggingId}
            esPrimero={i === 0}
            esUltimo={i === estantesDelSector.length - 1}
            registerDropZone={registerDropZone}
            registerCardRef={registerCardRef}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onMoverA={onMoverA}
            onEliminarProducto={onEliminarProducto}
            onRenombrar={onRenombrarEstante}
            onEliminar={onEliminarEstante}
            onReordenar={onReordenarEstante}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
          />
        ))}

        {sectorId && estantesDelSector.length > 0 && (
          <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', padding: '2px 4px' }}>Sin estante</div>
        )}

        <Bucket
          zoneKeyStr={raizKey}
          sectorId={sectorId}
          estanteId={null}
          productos={productosSinEstante}
          sectoresTodos={sectoresTodos}
          estantesTodos={estantesTodos}
          isOver={overZoneKey === raizKey}
          draggingId={draggingId}
          registerDropZone={registerDropZone}
          registerCardRef={registerCardRef}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onMoverA={onMoverA}
          onEliminarProducto={onEliminarProducto}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
        />

        {sectorId && (
          addingEstante ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                autoFocus
                value={nuevoNombre}
                onChange={e => setNuevoNombre(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') guardarEstante(); if (e.key === 'Escape') setAddingEstante(false) }}
                placeholder="Ej: Estante 1"
                style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontFamily: 'inherit' }}
              />
              <button onClick={guardarEstante} style={{ ...miniBtn, background: 'var(--accent)', color: '#fff', width: 28, height: 28 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>check</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingEstante(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px dashed var(--border)', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: 'var(--text-3)', fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span>
              Estante
            </button>
          )
        )}
      </div>
    </div>
  )
}

const miniBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 3, flexShrink: 0, borderRadius: 5,
}

interface CollapsedChipProps {
  sectorId: string | null
  nombre: string
  icono?: string
  total: number
  overZoneKey: string | null
  registerDropZone: (key: string, el: HTMLElement | null, sectorId: string | null, estanteId: string | null) => void
  onExpand: () => void
}

// Fila de chips (wrap) para sectores colapsados — reemplaza las tiras
// verticales angostas, que con muchos sectores quedaban confusas y ocupaban
// toda la altura del board. Sigue siendo drop zone (va a "sin estante").
export function StockBoardCollapsedChip({ sectorId, nombre, icono, total, overZoneKey, registerDropZone, onExpand }: CollapsedChipProps) {
  const key = zoneKey(sectorId, null)
  const isOver = overZoneKey === key
  return (
    <button
      ref={el => registerDropZone(key, el, sectorId, null)}
      onClick={onExpand}
      title={`Expandir ${nombre}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px 7px 12px', borderRadius: 10,
        border: `1.5px dashed ${isOver ? 'var(--accent)' : 'var(--border)'}`,
        background: isOver ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface)',
        cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
      }}
    >
      {icono && <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--accent)' }}>{icono}</span>}
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{nombre}</span>
      <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{total}</span>
      <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>chevron_right</span>
    </button>
  )
}
