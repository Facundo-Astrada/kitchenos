'use client'

import { useState } from 'react'
import type { ProductoConEstado } from '@/lib/hooks/useStock'
import type { StockSector, StockEstante, StockGrupo } from '@/types'
import { bloquesDeEstante } from '@/lib/stock/recorrido'
import { colorGrupoUbicacion } from '@/lib/ops/grupoUbicacion'
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

// Color del sector derivado del ícono (frío = azul, bebidas = violeta…) — da el
// borde superior de la columna como las plazas de Producción, sin columna nueva.
export function colorSector(icono?: string | null): string {
  if (!icono) return 'var(--text-3)'
  if (['ac_unit', 'kitchen', 'severe_cold', 'icecream'].includes(icono)) return '#0ea5e9'
  if (['wine_bar', 'liquor', 'local_bar', 'local_cafe'].includes(icono)) return '#a855f7'
  if (icono === 'cleaning_services') return '#14b8a6'
  if (['skillet', 'outdoor_grill', 'soup_kitchen', 'countertops'].includes(icono)) return '#ef4444'
  return '#f97316'
}

export function zoneKey(sectorId: string | null, estanteId: string | null, grupoId: string | null = null): string {
  return `${sectorId ?? 'none'}::${estanteId ?? 'none'}::${grupoId ?? 'none'}`
}

export type RegisterDropZone = (key: string, el: HTMLElement | null, sectorId: string | null, estanteId: string | null, grupoId: string | null) => void

// Todo lo que el board le pasa hacia abajo — un solo objeto en vez de veinte
// props repetidas en columna → estante → grupo → zona.
export interface BoardCtx {
  sectores: StockSector[]
  estantes: StockEstante[]
  grupos: StockGrupo[]
  overZoneKey: string | null
  draggingId: string | null
  selectedIds: Set<string>
  registerDropZone: RegisterDropZone
  registerCardRef: (id: string, el: HTMLElement | null) => void
  onDragStart: (p: ProductoConEstado) => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: () => void
  onToggleSelect: (id: string) => void
  onMoverA: (productoId: string, sectorId: string | null, estanteId: string | null, grupoId: string | null) => void
  onEliminarProducto: (id: string) => void
  onAgregarEstante: (sectorId: string, nombre: string) => void
  onRenombrarEstante: (id: string, nombre: string) => void
  onEliminarEstante: (id: string) => void
  onReordenarEstante: (id: string, dir: 1 | -1) => void
  onAgregarGrupo: (sectorId: string, estanteId: string | null, nombre: string) => void
  onRenombrarGrupo: (id: string, nombre: string) => void
  onEliminarGrupo: (id: string) => void
  onReordenarGrupo: (id: string, dir: 1 | -1) => void
}

// ── Zona de productos: una drop zone con sus tarjetas ──
function ZonaProductos({ ctx, sectorId, estanteId, grupoId, productos, vacio }: {
  ctx: BoardCtx
  sectorId: string | null
  estanteId: string | null
  grupoId: string | null
  productos: ProductoConEstado[]
  vacio: string
}) {
  const key = zoneKey(sectorId, estanteId, grupoId)
  const isOver = ctx.overZoneKey === key
  return (
    <div
      ref={el => ctx.registerDropZone(key, el, sectorId, estanteId, grupoId)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 5, minHeight: 34, borderRadius: 8,
        outline: isOver ? '2px dashed var(--accent)' : 'none', outlineOffset: 2,
        background: isOver ? 'color-mix(in srgb, var(--accent) 7%, transparent)' : 'transparent',
        transition: 'background .1s',
      }}
    >
      {productos.map(p => (
        <StockBoardCard
          key={p.id}
          producto={p}
          isDragging={ctx.draggingId === p.id}
          selected={ctx.selectedIds.has(p.id)}
          sectores={ctx.sectores}
          estantes={ctx.estantes}
          grupos={ctx.grupos}
          registerCardRef={ctx.registerCardRef}
          onDragStart={ctx.onDragStart}
          onDragMove={ctx.onDragMove}
          onDragEnd={ctx.onDragEnd}
          onMoverA={ctx.onMoverA}
          onEliminar={ctx.onEliminarProducto}
          onToggleSelect={ctx.onToggleSelect}
        />
      ))}
      {productos.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '9px 6px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>
          {vacio}
        </div>
      )}
    </div>
  )
}

// ── Grupo: barra de color a la izquierda que abraza sus productos ──
function GrupoBox({ ctx, grupo, color, productos, esPrimero, esUltimo }: {
  ctx: BoardCtx
  grupo: StockGrupo
  color: string
  productos: ProductoConEstado[]
  esPrimero: boolean
  esUltimo: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(grupo.nombre)

  function guardar() {
    if (nombre.trim() && nombre.trim() !== grupo.nombre) ctx.onRenombrarGrupo(grupo.id, nombre.trim())
    setEditando(false)
  }

  return (
    <div style={{ borderLeft: `3px solid ${color}`, borderRadius: 4, paddingLeft: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 24, marginBottom: 4 }}>
        {editando ? (
          <input
            autoFocus
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            onBlur={guardar}
            onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') { setNombre(grupo.nombre); setEditando(false) } }}
            style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', border: 'none', borderBottom: `1px solid ${color}`, background: 'transparent', color, outline: 'none', fontFamily: 'inherit', padding: '2px 0' }}
          />
        ) : (
          <button onClick={() => { setNombre(grupo.nombre); setEditando(true) }} title="Renombrar grupo"
            style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'text', padding: 0, fontFamily: 'inherit', textAlign: 'left' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{grupo.nombre}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color, background: `color-mix(in srgb, ${color} 14%, transparent)`, padding: '1px 6px', borderRadius: 20 }}>{productos.length}</span>
          </button>
        )}
        <span style={{ display: 'flex' }}>
          <button onClick={() => ctx.onReordenarGrupo(grupo.id, -1)} disabled={esPrimero} title="Subir grupo" style={{ ...iconBtn, opacity: esPrimero ? 0.25 : 1 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_upward</span>
          </button>
          <button onClick={() => ctx.onReordenarGrupo(grupo.id, 1)} disabled={esUltimo} title="Bajar grupo" style={{ ...iconBtn, opacity: esUltimo ? 0.25 : 1 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_downward</span>
          </button>
          <button
            onClick={() => { if (productos.length === 0 || confirm(`¿Deshacer el grupo "${grupo.nombre}"? Sus ${productos.length} producto(s) quedan sueltos en el mismo lugar.`)) ctx.onEliminarGrupo(grupo.id) }}
            title="Deshacer grupo"
            style={iconBtn}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
          </button>
        </span>
      </div>
      <ZonaProductos ctx={ctx} sectorId={grupo.sector_id} estanteId={grupo.estante_id} grupoId={grupo.id} productos={productos} vacio="Arrastrá productos a este grupo" />
    </div>
  )
}

function NuevoGrupo({ onCrear }: { onCrear: (nombre: string) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  function crear() {
    if (nombre.trim()) onCrear(nombre.trim())
    setNombre(''); setAbierto(false)
  }
  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} style={ghostBtn}>
        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span>
        Grupo
      </button>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <input
        autoFocus
        value={nombre}
        onChange={e => setNombre(e.target.value)}
        onBlur={() => { if (!nombre.trim()) setAbierto(false) }}
        onKeyDown={e => { if (e.key === 'Enter') crear(); if (e.key === 'Escape') setAbierto(false) }}
        placeholder="Ej: Vinagres, Aceites, Latas…"
        style={inputSm}
      />
      <button onMouseDown={e => e.preventDefault()} onClick={crear} style={{ ...iconBtn, background: 'var(--accent)', color: '#fff', width: 30, height: 30, borderRadius: 8 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
      </button>
    </div>
  )
}

// ── Contenido de un estante (o de lo suelto del sector): grupos + sueltos ──
function ContenidoEstante({ ctx, sectorId, estanteId, productos }: {
  ctx: BoardCtx
  sectorId: string | null
  estanteId: string | null
  productos: ProductoConEstado[]
}) {
  const gruposAca = sectorId ? ctx.grupos.filter(g => g.sector_id === sectorId && (g.estante_id ?? null) === estanteId) : []
  const bloques = bloquesDeEstante(productos, gruposAca)
  const sueltos = bloques[bloques.length - 1].productos
  const conGrupos = bloques.length > 1
  // Con grupos armados, la zona de sueltos solo se muestra si tiene algo o si
  // se está arrastrando (para poder sacar un producto de su grupo).
  const mostrarSueltos = !conGrupos || sueltos.length > 0 || ctx.draggingId != null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {bloques.slice(0, -1).map((b, i) => (
        <GrupoBox
          key={b.grupo!.id}
          ctx={ctx}
          grupo={b.grupo!}
          color={colorGrupoUbicacion(i + 1)}
          productos={b.productos}
          esPrimero={i === 0}
          esUltimo={i === bloques.length - 2}
        />
      ))}
      {mostrarSueltos && (
        <div>
          {conGrupos && <div style={{ ...rotulo, marginBottom: 4 }}>Sueltos</div>}
          <ZonaProductos ctx={ctx} sectorId={sectorId} estanteId={estanteId} grupoId={null} productos={sueltos} vacio="Soltá productos acá" />
        </div>
      )}
      {sectorId && <NuevoGrupo onCrear={nombre => ctx.onAgregarGrupo(sectorId, estanteId, nombre)} />}
    </div>
  )
}

// ── Estante: sub-caja dentro de la columna, como las secciones de Producción ──
function EstanteBox({ ctx, estante, productos, esPrimero, esUltimo }: {
  ctx: BoardCtx
  estante: StockEstante
  productos: ProductoConEstado[]
  esPrimero: boolean
  esUltimo: boolean
}) {
  const [open, setOpen] = useState(true)
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(estante.nombre)

  function guardar() {
    if (nombre.trim() && nombre.trim() !== estante.nombre) ctx.onRenombrarEstante(estante.id, nombre.trim())
    setEditando(false)
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: open ? 8 : 0 }}>
        <button onClick={() => setOpen(o => !o)} title={open ? 'Plegar' : 'Desplegar'} style={iconBtn}>
          <span className="material-symbols-outlined" style={{ fontSize: 17 }}>{open ? 'expand_more' : 'chevron_right'}</span>
        </button>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-2)', flexShrink: 0 }}>shelves</span>
        {editando ? (
          <input
            autoFocus
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            onBlur={guardar}
            onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') { setNombre(estante.nombre); setEditando(false) } }}
            style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, border: 'none', borderBottom: '1px solid var(--accent)', background: 'transparent', color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit' }}
          />
        ) : (
          <button onClick={() => { setNombre(estante.nombre); setEditando(true) }} title="Renombrar estante"
            style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 5, background: 'none', border: 'none', cursor: 'text', padding: 0, fontFamily: 'inherit', textAlign: 'left' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{estante.nombre}</span>
            <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>· {productos.length}</span>
          </button>
        )}
        <span style={{ display: 'flex' }}>
          <button onClick={() => ctx.onReordenarEstante(estante.id, -1)} disabled={esPrimero} title="Subir estante" style={{ ...iconBtn, opacity: esPrimero ? 0.25 : 1 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_upward</span>
          </button>
          <button onClick={() => ctx.onReordenarEstante(estante.id, 1)} disabled={esUltimo} title="Bajar estante" style={{ ...iconBtn, opacity: esUltimo ? 0.25 : 1 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_downward</span>
          </button>
          <button
            onClick={() => { if (productos.length === 0 || confirm(`"${estante.nombre}" tiene ${productos.length} producto(s) — quedan sin estante y se deshacen sus grupos. ¿Eliminar igual?`)) ctx.onEliminarEstante(estante.id) }}
            title="Eliminar estante"
            style={iconBtn}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>delete</span>
          </button>
        </span>
      </div>
      {open && <ContenidoEstante ctx={ctx} sectorId={estante.sector_id} estanteId={estante.id} productos={productos} />}
    </div>
  )
}

interface ColumnProps {
  ctx: BoardCtx
  sectorId: string | null
  nombre: string
  icono?: string
  estantesDelSector: StockEstante[]
  productosSinEstante: ProductoConEstado[]
  productosPorEstante: Map<string, ProductoConEstado[]>
  onOrdenarAlfabetico: () => void
  onEliminarSector?: () => void
  onEditarSector?: (nombre: string, icono: string) => void
  ultimoConteoAt?: string | null
  onToggleCollapse: () => void
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
    ctx, sectorId, nombre, icono, estantesDelSector, productosSinEstante, productosPorEstante,
    onOrdenarAlfabetico, onEliminarSector, onEditarSector, ultimoConteoAt, onToggleCollapse,
  } = props

  const [addingEstante, setAddingEstante] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [editandoSector, setEditandoSector] = useState(false)
  const [editNombre, setEditNombre] = useState(nombre)
  const [editIcono, setEditIcono] = useState(icono ?? SECTOR_ICONOS[0])

  const total = productosSinEstante.length + estantesDelSector.reduce((s, e) => s + (productosPorEstante.get(e.id)?.length ?? 0), 0)
  const color = colorSector(sectorId ? icono : null)

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
      ctx.onAgregarEstante(sectorId, nuevoNombre.trim())
      setNuevoNombre('')
      setAddingEstante(false)
    }
  }

  return (
    <div style={{
      width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', maxHeight: '100%',
      background: 'var(--surface)', border: '1px solid var(--border)', borderTop: `3px solid ${color}`, borderRadius: 12, overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {editandoSector ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              autoFocus
              value={editNombre}
              onChange={e => setEditNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') guardarSector(); if (e.key === 'Escape') setEditandoSector(false) }}
              style={{ ...inputSm, fontWeight: 700 }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {SECTOR_ICONOS.map(ic => (
                <button key={ic} onClick={() => setEditIcono(ic)}
                  style={{ width: 28, height: 28, borderRadius: 7, background: editIcono === ic ? 'var(--accent)' : 'var(--bg)', border: `1px solid ${editIcono === ic ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15, color: editIcono === ic ? '#fff' : 'var(--text-2)' }}>{ic}</span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setEditandoSector(false)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={guardarSector} disabled={!editNombre.trim()} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: !editNombre.trim() ? 0.5 : 1 }}>Guardar</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={onToggleCollapse} title="Plegar sector" style={iconBtn}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_left</span>
              </button>
              {icono && <span className="material-symbols-outlined" style={{ fontSize: 18, color }}>{icono}</span>}
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color, background: `color-mix(in srgb, ${color} 13%, transparent)`, padding: '2px 7px', borderRadius: 20, flexShrink: 0 }}>{total}</span>
              <span style={{ flex: 1 }} />
              <button onClick={onOrdenarAlfabetico} title="Ordenar A-Z (reemplaza el orden manual)" style={iconBtn}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>sort_by_alpha</span>
              </button>
              {sectorId && onEditarSector && (
                <button onClick={abrirEdicionSector} title="Editar sector" style={iconBtn}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                </button>
              )}
              {sectorId && onEliminarSector && (
                <button onClick={onEliminarSector} title="Eliminar sector" style={iconBtn}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                </button>
              )}
            </div>
            {sectorId && (
              <div style={{ fontSize: 11, fontWeight: 500, color: ultimoConteoAt ? 'var(--text-3)' : '#d97706', marginTop: 2, paddingLeft: 30 }}>
                {fmtConteoRel(ultimoConteoAt)}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: 10 }}>
        {sectorId && estantesDelSector.map((es, i) => (
          <EstanteBox
            key={es.id}
            ctx={ctx}
            estante={es}
            productos={productosPorEstante.get(es.id) ?? []}
            esPrimero={i === 0}
            esUltimo={i === estantesDelSector.length - 1}
          />
        ))}

        {/* Lo que está en el sector pero en ningún estante */}
        {sectorId && estantesDelSector.length > 0 ? (
          (productosSinEstante.length > 0 || ctx.draggingId != null || ctx.grupos.some(g => g.sector_id === sectorId && !g.estante_id)) && (
            <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: 8 }}>
              <div style={{ ...rotulo, marginBottom: 8 }}>Sin estante · {productosSinEstante.length}</div>
              <ContenidoEstante ctx={ctx} sectorId={sectorId} estanteId={null} productos={productosSinEstante} />
            </div>
          )
        ) : (
          <ContenidoEstante ctx={ctx} sectorId={sectorId} estanteId={null} productos={productosSinEstante} />
        )}

        {sectorId && (
          addingEstante ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                autoFocus
                value={nuevoNombre}
                onChange={e => setNuevoNombre(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') guardarEstante(); if (e.key === 'Escape') setAddingEstante(false) }}
                placeholder="Ej: Estante 1"
                style={inputSm}
              />
              <button onClick={guardarEstante} style={{ ...iconBtn, background: 'var(--accent)', color: '#fff', width: 30, height: 30, borderRadius: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
              </button>
            </div>
          ) : (
            <button onClick={() => setAddingEstante(true)} style={{ ...ghostBtn, justifyContent: 'center', padding: '8px 10px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>shelves</span>
              Agregar estante
            </button>
          )
        )}
      </div>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 3, flexShrink: 0, borderRadius: 6,
}

const ghostBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: '1px dashed var(--border)', borderRadius: 8,
  padding: '6px 9px', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
}

const inputSm: React.CSSProperties = {
  flex: 1, minWidth: 0, fontSize: 12.5, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text-1)', fontFamily: 'inherit',
}

const rotulo: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em',
}

interface CollapsedChipProps {
  sectorId: string | null
  nombre: string
  icono?: string
  total: number
  overZoneKey: string | null
  registerDropZone: RegisterDropZone
  onExpand: () => void
}

// Fila de chips (wrap) para sectores colapsados — reemplaza las tiras
// verticales angostas, que con muchos sectores quedaban confusas y ocupaban
// toda la altura del board. Sigue siendo drop zone (va a "sin estante").
export function StockBoardCollapsedChip({ sectorId, nombre, icono, total, overZoneKey, registerDropZone, onExpand }: CollapsedChipProps) {
  const key = zoneKey(sectorId, null, null)
  const isOver = overZoneKey === key
  const color = colorSector(sectorId ? icono : null)
  return (
    <button
      ref={el => registerDropZone(key, el, sectorId, null, null)}
      onClick={onExpand}
      title={`Desplegar ${nombre}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px 7px 12px', borderRadius: 10,
        border: isOver ? '1.5px dashed var(--accent)' : '1px solid var(--border)',
        borderLeft: `3px solid ${color}`,
        background: isOver ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'var(--surface)',
        cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
      }}
    >
      {icono && <span className="material-symbols-outlined" style={{ fontSize: 16, color }}>{icono}</span>}
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{nombre}</span>
      <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{total}</span>
      <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>chevron_right</span>
    </button>
  )
}
