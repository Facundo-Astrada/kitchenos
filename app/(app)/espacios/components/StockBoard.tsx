'use client'

import { useRef, useState, useCallback, useMemo } from 'react'
import { useStock, type ProductoConEstado } from '@/lib/hooks/useStock'
import { useStockSectores } from '@/lib/hooks/useStockSectores'
import { useStockEstantes } from '@/lib/hooks/useStockEstantes'
import StockBoardColumn from './StockBoardColumn'

const SECTOR_ICONOS = ['shelves', 'ac_unit', 'kitchen', 'severe_cold', 'skillet', 'wine_bar']

export default function StockBoard() {
  const { productos, loading: loadingStock, moverProductosBoard } = useStock()
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

  // ── Búsqueda ──
  const [search, setSearch] = useState('')

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
    setDraggingProducto(p)
  }, [q])

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
        {q && (
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '6px 2px 0' }}>
            {productosVisibles.length} resultado{productosVisibles.length !== 1 ? 's' : ''} — arrastrar está desactivado con un filtro activo, usá el menú &quot;⋮&quot; de cada producto para moverlo.
          </p>
        )}
      </div>

      {/* Columnas */}
      <div style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden' }}>
        <div style={{ display: 'flex', gap: 14, height: '100%', paddingBottom: 8 }}>
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
            onAgregarEstante={agregarEstante}
            onRenombrarEstante={renombrarEstante}
            onEliminarEstante={eliminarEstante}
            onReordenarEstante={onReordenarEstante}
            onOrdenarAlfabetico={() => onOrdenarColumna(null)}
          />

          {sectores.map(sec => {
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
                onAgregarEstante={agregarEstante}
                onRenombrarEstante={renombrarEstante}
                onEliminarEstante={eliminarEstante}
                onReordenarEstante={onReordenarEstante}
                onOrdenarAlfabetico={() => onOrdenarColumna(sec.id)}
                onEliminarSector={() => handleEliminarSector(sec.id, sec.nombre)}
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
