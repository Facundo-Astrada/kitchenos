'use client'

import { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import { useStock, type ProductoConEstado } from '@/lib/hooks/useStock'
import { useStockSectores } from '@/lib/hooks/useStockSectores'
import { useStockEstantes } from '@/lib/hooks/useStockEstantes'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import StockBoardColumn, { StockBoardCollapsedChip } from './StockBoardColumn'

const SECTOR_ICONOS = ['shelves', 'ac_unit', 'kitchen', 'severe_cold', 'skillet', 'wine_bar']
const SIN_SECTOR_KEY = '__sin_sector__'
const AUTOSCROLL_EDGE = 70
const AUTOSCROLL_MAX_SPEED = 16

export default function StockBoard() {
  const RESTAURANTE_ID = useRestauranteId()
  const { productos, loading: loadingStock, moverProductosBoard, eliminarProducto } = useStock()
  const { sectores, loading: loadingSec, agregarSector, eliminarSector } = useStockSectores()
  const { estantes, loading: loadingEst, agregarEstante, renombrarEstante, eliminarEstante, reordenarEstantes } = useStockEstantes()

  const loading = loadingStock || loadingSec || loadingEst

  // ── Drag state ──
  const [draggingProducto, setDraggingProducto] = useState<ProductoConEstado | null>(null)
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null)
  const [overZoneKey, setOverZoneKey] = useState<string | null>(null)
  const dropZonesRef = useRef<Map<string, { el: HTMLElement; sectorId: string | null; estanteId: string | null }>>(new Map())
  const cardRefsRef = useRef<Map<string, HTMLElement>>(new Map())
  const lastPointerRef = useRef({ x: 0, y: 0 })

  // ── Auto-scroll horizontal al arrastrar cerca del borde ──
  const boardScrollRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const autoScrollFrameRef = useRef<number | null>(null)

  const autoScrollTick = useCallback(() => {
    if (!isDraggingRef.current) { autoScrollFrameRef.current = null; return }
    const el = boardScrollRef.current
    if (el) {
      const rect = el.getBoundingClientRect()
      const x = lastPointerRef.current.x
      if (x < rect.left + AUTOSCROLL_EDGE) {
        const intensity = Math.min(1, (rect.left + AUTOSCROLL_EDGE - x) / AUTOSCROLL_EDGE)
        el.scrollLeft -= AUTOSCROLL_MAX_SPEED * intensity
      } else if (x > rect.right - AUTOSCROLL_EDGE) {
        const intensity = Math.min(1, (x - (rect.right - AUTOSCROLL_EDGE)) / AUTOSCROLL_EDGE)
        el.scrollLeft += AUTOSCROLL_MAX_SPEED * intensity
      }
    }
    autoScrollFrameRef.current = requestAnimationFrame(autoScrollTick)
  }, [])

  // ── Columnas colapsadas (persistido por restaurante) ──
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    try {
      const raw = localStorage.getItem(`stock_board_collapsed_${RESTAURANTE_ID}`)
      setCollapsedIds(raw ? new Set(JSON.parse(raw)) : new Set())
    } catch { setCollapsedIds(new Set()) }
  }, [RESTAURANTE_ID])
  const toggleCollapse = useCallback((key: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      if (RESTAURANTE_ID) localStorage.setItem(`stock_board_collapsed_${RESTAURANTE_ID}`, JSON.stringify(Array.from(next)))
      return next
    })
  }, [RESTAURANTE_ID])

  // ── Búsqueda ──
  const [search, setSearch] = useState('')

  // ── Selección múltiple (Ctrl/Cmd+clic) para mover varios productos juntos ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkSector, setBulkSector] = useState('')
  const [bulkEstante, setBulkEstante] = useState('')
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setBulkSector(''); setBulkEstante('')
  }, [])

  // ── Nuevo sector ──
  const [addingSector, setAddingSector] = useState(false)
  const [nuevoSectorNombre, setNuevoSectorNombre] = useState('')
  const [nuevoSectorIcono, setNuevoSectorIcono] = useState(SECTOR_ICONOS[0])

  const productosOrdenados = useMemo(() =>
    [...productos]
      .filter(p => !p.fuera_de_uso)
      .sort((a, b) => (a.orden_sector ?? 0) - (b.orden_sector ?? 0) || a.nombre.localeCompare(b.nombre, 'es'))
  , [productos])

  const q = search.trim().toLowerCase()
  const productosVisibles = useMemo(() =>
    q ? productosOrdenados.filter(p => p.nombre.toLowerCase().includes(q)) : productosOrdenados
  , [productosOrdenados, q])

  const registerDropZone = useCallback((key: string, el: HTMLElement | null, sectorId: string | null, estanteId: string | null) => {
    if (el) dropZonesRef.current.set(key, { el, sectorId, estanteId })
    else dropZonesRef.current.delete(key)
  }, [])
  const registerCardRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) cardRefsRef.current.set(id, el)
    else cardRefsRef.current.delete(id)
  }, [])

  const onDragStart = useCallback((p: ProductoConEstado) => {
    if (q) return // no reordenar mientras hay un filtro activo (índices quedarían mal)
    if (selectedIds.size > 0) return // con selección múltiple activa, mover es vía la barra "Mover a…"
    setDraggingProducto(p)
    isDraggingRef.current = true
    if (autoScrollFrameRef.current == null) autoScrollFrameRef.current = requestAnimationFrame(autoScrollTick)
  }, [q, selectedIds, autoScrollTick])

  const onDragMove = useCallback((x: number, y: number) => {
    lastPointerRef.current = { x, y }
    setGhostPos({ x, y })
    let found: string | null = null
    for (const [key, { el }] of dropZonesRef.current.entries()) {
      const rect = el.getBoundingClientRect()
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) { found = key; break }
    }
    setOverZoneKey(found)
  }, [])

  function computeInsertIndex(ids: string[], pointerY: number): number {
    for (let i = 0; i < ids.length; i++) {
      const el = cardRefsRef.current.get(ids[i])
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (pointerY < rect.top + rect.height / 2) return i
    }
    return ids.length
  }

  const onDragEnd = useCallback(async () => {
    isDraggingRef.current = false
    if (autoScrollFrameRef.current != null) { cancelAnimationFrame(autoScrollFrameRef.current); autoScrollFrameRef.current = null }
    const dragged = draggingProducto
    const key = overZoneKey
    setDraggingProducto(null); setGhostPos(null); setOverZoneKey(null)
    if (!dragged || !key) return
    const zone = dropZonesRef.current.get(key)
    if (!zone) return
    const { sectorId: targetSectorId, estanteId: targetEstanteId } = zone

    const bucketIds = productosOrdenados
      .filter(p => (p.sector_id ?? null) === targetSectorId && (p.estante_id ?? null) === targetEstanteId && p.id !== dragged.id)
      .map(p => p.id)
    const insertIdx = computeInsertIndex(bucketIds, lastPointerRef.current.y)
    const newOrder = [...bucketIds.slice(0, insertIdx), dragged.id, ...bucketIds.slice(insertIdx)]

    try {
      await moverProductosBoard(newOrder.map((id, idx) => ({ id, sector_id: targetSectorId, estante_id: targetEstanteId, orden_sector: idx })))
    } catch (e) {
      console.error('[StockBoard] error moviendo producto', e)
    }
  }, [draggingProducto, overZoneKey, productosOrdenados, moverProductosBoard])

  const onMoverA = useCallback(async (productoId: string, sectorId: string | null, estanteId: string | null) => {
    const bucketIds = productosOrdenados
      .filter(p => (p.sector_id ?? null) === sectorId && (p.estante_id ?? null) === estanteId && p.id !== productoId)
      .map(p => p.id)
    const nuevoOrden = [...bucketIds, productoId]
    try {
      await moverProductosBoard(nuevoOrden.map((id, idx) => ({ id, sector_id: sectorId, estante_id: estanteId, orden_sector: idx })))
    } catch (e) {
      console.error('[StockBoard] error en Mover a…', e)
    }
  }, [productosOrdenados, moverProductosBoard])

  const onMoverSeleccionados = useCallback(async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const sectorId = bulkSector || null
    const estanteId = bulkEstante || null
    const bucketIds = productosOrdenados
      .filter(p => (p.sector_id ?? null) === sectorId && (p.estante_id ?? null) === estanteId && !selectedIds.has(p.id))
      .map(p => p.id)
    const nuevoOrden = [...bucketIds, ...ids]
    try {
      await moverProductosBoard(nuevoOrden.map((id, idx) => ({ id, sector_id: sectorId, estante_id: estanteId, orden_sector: idx })))
      clearSelection()
    } catch (e) {
      console.error('[StockBoard] error moviendo seleccionados', e)
    }
  }, [selectedIds, bulkSector, bulkEstante, productosOrdenados, moverProductosBoard, clearSelection])

  const onOrdenarColumna = useCallback(async (sectorId: string | null) => {
    const buckets = new Set<string | null>([null])
    if (sectorId) estantes.filter(e => e.sector_id === sectorId).forEach(e => buckets.add(e.id))
    const cambios: Array<{ id: string; sector_id: string | null; estante_id: string | null; orden_sector: number }> = []
    for (const estanteId of buckets) {
      const bucket = productosOrdenados.filter(p => (p.sector_id ?? null) === sectorId && (p.estante_id ?? null) === estanteId)
      const alfabetico = [...bucket].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      alfabetico.forEach((p, i) => cambios.push({ id: p.id, sector_id: sectorId, estante_id: estanteId, orden_sector: i }))
    }
    if (cambios.length) {
      try { await moverProductosBoard(cambios) } catch (e) { console.error('[StockBoard] error ordenando columna', e) }
    }
  }, [productosOrdenados, estantes, moverProductosBoard])

  const onReordenarEstante = useCallback(async (id: string, dir: 1 | -1) => {
    const est = estantes.find(e => e.id === id)
    if (!est) return
    const delSector = estantes.filter(e => e.sector_id === est.sector_id).sort((a, b) => a.orden - b.orden)
    const idx = delSector.findIndex(e => e.id === id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= delSector.length) return
    const ids = delSector.map(e => e.id)
    ;[ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]]
    try { await reordenarEstantes(ids) } catch (e) { console.error('[StockBoard] error reordenando estantes', e) }
  }, [estantes, reordenarEstantes])

  useEffect(() => {
    return () => { if (autoScrollFrameRef.current != null) cancelAnimationFrame(autoScrollFrameRef.current) }
  }, [])

  const handleEliminarProducto = useCallback(async (id: string) => {
    try { await eliminarProducto(id) } catch (e) { console.error('[StockBoard] error eliminando producto', e) }
  }, [eliminarProducto])

  async function handleAgregarSector() {
    if (!nuevoSectorNombre.trim()) return
    try {
      await agregarSector(nuevoSectorNombre.trim(), nuevoSectorIcono)
      setNuevoSectorNombre(''); setNuevoSectorIcono(SECTOR_ICONOS[0]); setAddingSector(false)
    } catch (e) { console.error('[StockBoard] error creando sector', e) }
  }

  async function handleEliminarSector(sectorId: string, nombre: string) {
    const n = productosOrdenados.filter(p => p.sector_id === sectorId).length
    const msg = n > 0
      ? `"${nombre}" tiene ${n} producto(s) — quedan sin sector. ¿Eliminar igual?`
      : `¿Eliminar el sector "${nombre}"?`
    if (!confirm(msg)) return
    try { await eliminarSector(sectorId) } catch (e) { console.error('[StockBoard] error eliminando sector', e) }
  }

  if (loading) {
    return <p style={{ color: 'var(--text-3)', fontSize: 14, padding: 24 }}>Cargando board de stock…</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Buscador */}
      <div style={{ padding: '0 4px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', maxWidth: 360 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>search</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar producto para ubicarlo…"
            style={{ border: 'none', outline: 'none', background: 'none', flex: 1, fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
            </button>
          )}
        </div>
        {q && selectedIds.size === 0 && (
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '6px 2px 0' }}>
            {productosVisibles.length} resultado{productosVisibles.length !== 1 ? 's' : ''} — arrastrar está desactivado con un filtro activo, usá el menú &quot;⋮&quot; de cada producto para moverlo.
          </p>
        )}
        {selectedIds.size === 0 && !q && (
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '6px 2px 0' }}>
            Ctrl+clic (⌘+clic en Mac) sobre varios productos para seleccionarlos y moverlos juntos.
          </p>
        )}
      </div>

      {/* Barra de selección múltiple */}
      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 12px', margin: '0 4px 14px', background: 'color-mix(in srgb, var(--accent) 8%, var(--surface))', border: '1px solid var(--accent)', borderRadius: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
            {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <select
            value={bulkSector}
            onChange={e => { setBulkSector(e.target.value); setBulkEstante('') }}
            style={{ fontSize: 12, padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontFamily: 'inherit', cursor: 'pointer' }}
          >
            <option value="">Sin sector</option>
            {sectores.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          {bulkSector && estantes.filter(e => e.sector_id === bulkSector).length > 0 && (
            <select
              value={bulkEstante}
              onChange={e => setBulkEstante(e.target.value)}
              style={{ fontSize: 12, padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontFamily: 'inherit', cursor: 'pointer' }}
            >
              <option value="">Sin estante</option>
              {estantes.filter(e => e.sector_id === bulkSector).map(es => <option key={es.id} value={es.id}>{es.nombre}</option>)}
            </select>
          )}
          <button
            onClick={onMoverSeleccionados}
            style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: 'var(--navy)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Mover
          </button>
          <button
            onClick={clearSelection}
            title="Cancelar selección"
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>
      )}

      {/* Sectores colapsados: fila de chips que se acomodan solos (wrap), no
          ocupan toda la altura del board como las tiras verticales de antes. */}
      {(collapsedIds.has(SIN_SECTOR_KEY) || sectores.some(s => collapsedIds.has(s.id))) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 4px 14px', flexShrink: 0 }}>
          {collapsedIds.has(SIN_SECTOR_KEY) && (
            <StockBoardCollapsedChip
              sectorId={null}
              nombre="Sin sector"
              total={productosVisibles.filter(p => !p.sector_id).length}
              overZoneKey={overZoneKey}
              registerDropZone={registerDropZone}
              onExpand={() => toggleCollapse(SIN_SECTOR_KEY)}
            />
          )}
          {sectores.filter(sec => collapsedIds.has(sec.id)).map(sec => (
            <StockBoardCollapsedChip
              key={sec.id}
              sectorId={sec.id}
              nombre={sec.nombre}
              icono={sec.icono}
              total={productosVisibles.filter(p => p.sector_id === sec.id).length}
              overZoneKey={overZoneKey}
              registerDropZone={registerDropZone}
              onExpand={() => toggleCollapse(sec.id)}
            />
          ))}
        </div>
      )}

      {/* Columnas expandidas */}
      <div ref={boardScrollRef} style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden' }}>
        <div style={{ display: 'flex', gap: 14, height: '100%', paddingBottom: 8 }}>
          {!collapsedIds.has(SIN_SECTOR_KEY) && (
            <StockBoardColumn
              sectorId={null}
              nombre="Sin sector"
              estantesDelSector={[]}
              productosSinEstante={productosVisibles.filter(p => !p.sector_id)}
              productosPorEstante={new Map()}
              sectoresTodos={sectores}
              estantesTodos={estantes}
              overZoneKey={overZoneKey}
              draggingId={draggingProducto?.id ?? null}
              registerDropZone={registerDropZone}
              registerCardRef={registerCardRef}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
              onMoverA={onMoverA}
              onEliminarProducto={handleEliminarProducto}
              onAgregarEstante={agregarEstante}
              onRenombrarEstante={renombrarEstante}
              onEliminarEstante={eliminarEstante}
              onReordenarEstante={onReordenarEstante}
              onOrdenarAlfabetico={() => onOrdenarColumna(null)}
              onToggleCollapse={() => toggleCollapse(SIN_SECTOR_KEY)}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
            />
          )}

          {sectores.filter(sec => !collapsedIds.has(sec.id)).map(sec => {
            const estantesDelSector = estantes.filter(e => e.sector_id === sec.id).sort((a, b) => a.orden - b.orden)
            const productosPorEstante = new Map<string, ProductoConEstado[]>()
            for (const es of estantesDelSector) {
              productosPorEstante.set(es.id, productosVisibles.filter(p => p.sector_id === sec.id && p.estante_id === es.id))
            }
            const productosSinEstante = productosVisibles.filter(p => p.sector_id === sec.id && !p.estante_id)
            return (
              <StockBoardColumn
                key={sec.id}
                sectorId={sec.id}
                nombre={sec.nombre}
                icono={sec.icono}
                estantesDelSector={estantesDelSector}
                productosSinEstante={productosSinEstante}
                productosPorEstante={productosPorEstante}
                sectoresTodos={sectores}
                estantesTodos={estantes}
                overZoneKey={overZoneKey}
                draggingId={draggingProducto?.id ?? null}
                registerDropZone={registerDropZone}
                registerCardRef={registerCardRef}
                onDragStart={onDragStart}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
                onMoverA={onMoverA}
                onEliminarProducto={handleEliminarProducto}
                onAgregarEstante={agregarEstante}
                onRenombrarEstante={renombrarEstante}
                onEliminarEstante={eliminarEstante}
                onReordenarEstante={onReordenarEstante}
                onOrdenarAlfabetico={() => onOrdenarColumna(sec.id)}
                onEliminarSector={() => handleEliminarSector(sec.id, sec.nombre)}
                ultimoConteoAt={sec.ultimo_conteo_at}
                onToggleCollapse={() => toggleCollapse(sec.id)}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            )
          })}

          {/* Nuevo sector */}
          <div style={{ width: 220, flexShrink: 0 }}>
            {addingSector ? (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  autoFocus
                  value={nuevoSectorNombre}
                  onChange={e => setNuevoSectorNombre(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAgregarSector(); if (e.key === 'Escape') setAddingSector(false) }}
                  placeholder="Ej: Cámara, Cava…"
                  style={{ fontSize: 13, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', gap: 5 }}>
                  {SECTOR_ICONOS.map(ic => (
                    <button key={ic} onClick={() => setNuevoSectorIcono(ic)}
                      style={{ width: 30, height: 30, borderRadius: 7, background: nuevoSectorIcono === ic ? 'var(--accent)' : 'var(--bg)', border: `1px solid ${nuevoSectorIcono === ic ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 15, color: nuevoSectorIcono === ic ? '#fff' : 'var(--text-2)' }}>{ic}</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setAddingSector(false)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                  <button onClick={handleAgregarSector} disabled={!nuevoSectorNombre.trim()} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', background: 'var(--navy)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: !nuevoSectorNombre.trim() ? 0.5 : 1 }}>Crear</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingSector(true)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'none', border: '1px dashed var(--border)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', color: 'var(--text-3)', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 17 }}>add</span>
                Sector
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ghost drag */}
      {draggingProducto && ghostPos && (
        <div style={{
          position: 'fixed', left: ghostPos.x + 12, top: ghostPos.y - 16, zIndex: 999, pointerEvents: 'none',
          background: 'var(--surface)', border: '2px solid var(--accent)', borderRadius: 8, padding: '5px 10px',
          fontSize: 12, fontWeight: 600, color: 'var(--text-1)', boxShadow: '0 8px 24px rgba(0,0,0,.18)',
          maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 5 }}>drag_indicator</span>
          {draggingProducto.nombre}
        </div>
      )}
    </div>
  )
}
