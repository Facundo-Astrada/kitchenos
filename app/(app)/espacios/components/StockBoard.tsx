'use client'

import { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import { useStock, type ProductoConEstado } from '@/lib/hooks/useStock'
import { useStockSectores } from '@/lib/hooks/useStockSectores'
import { useStockEstantes } from '@/lib/hooks/useStockEstantes'
import { useStockGrupos } from '@/lib/hooks/useStockGrupos'
import { bloquesDeEstante } from '@/lib/stock/recorrido'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import StockBoardColumn, { StockBoardCollapsedChip, SECTOR_ICONOS, type BoardCtx } from './StockBoardColumn'
import { EmptyState } from '@/components/ui'

const SIN_SECTOR_KEY = '__sin_sector__'
const AUTOSCROLL_EDGE = 70
const AUTOSCROLL_MAX_SPEED = 16

export default function StockBoard() {
  const RESTAURANTE_ID = useRestauranteId()
  const { productos, loading: loadingStock, moverProductosBoard, eliminarProducto, refetch: refetchProductos } = useStock()
  const { sectores, loading: loadingSec, agregarSector, eliminarSector, actualizarSector } = useStockSectores()
  const { estantes, loading: loadingEst, agregarEstante, renombrarEstante, eliminarEstante, reordenarEstantes } = useStockEstantes()
  const { grupos, loading: loadingGru, agregarGrupo, renombrarGrupo, eliminarGrupo, reordenarGrupos, refetch: refetchGrupos } = useStockGrupos()

  const loading = loadingStock || loadingSec || loadingEst || loadingGru

  // ── Drag state ──
  const [draggingProducto, setDraggingProducto] = useState<ProductoConEstado | null>(null)
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null)
  const [overZoneKey, setOverZoneKey] = useState<string | null>(null)
  const dropZonesRef = useRef<Map<string, { el: HTMLElement; sectorId: string | null; estanteId: string | null; grupoId: string | null }>>(new Map())
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
  const [bulkGrupo, setBulkGrupo] = useState('')
  const [nombreGrupoNuevo, setNombreGrupoNuevo] = useState('')
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setBulkSector(''); setBulkEstante(''); setBulkGrupo(''); setNombreGrupoNuevo('')
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

  // Productos de un lugar (sector + estante + grupo) en el orden en que se ven
  // — el mismo que usa el board para dibujar y Stockear para recorrer.
  const productosDeZona = useCallback((sectorId: string | null, estanteId: string | null, grupoId: string | null, excluir?: Set<string>) => {
    const delLugar = productosOrdenados.filter(p =>
      (p.sector_id ?? null) === sectorId && (p.estante_id ?? null) === estanteId && !excluir?.has(p.id))
    const gruposAca = sectorId ? grupos.filter(g => g.sector_id === sectorId && (g.estante_id ?? null) === estanteId) : []
    const bloques = bloquesDeEstante(delLugar, gruposAca)
    const bloque = grupoId ? bloques.find(b => b.grupo?.id === grupoId) : bloques[bloques.length - 1]
    return bloque?.productos ?? []
  }, [productosOrdenados, grupos])

  const registerDropZone = useCallback((key: string, el: HTMLElement | null, sectorId: string | null, estanteId: string | null, grupoId: string | null) => {
    if (el) dropZonesRef.current.set(key, { el, sectorId, estanteId, grupoId })
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
    const { sectorId, estanteId, grupoId } = zone

    const bucketIds = productosDeZona(sectorId, estanteId, grupoId, new Set([dragged.id])).map(p => p.id)
    const insertIdx = computeInsertIndex(bucketIds, lastPointerRef.current.y)
    const newOrder = [...bucketIds.slice(0, insertIdx), dragged.id, ...bucketIds.slice(insertIdx)]

    try {
      await moverProductosBoard(newOrder.map((id, idx) => ({ id, sector_id: sectorId, estante_id: estanteId, stock_grupo_id: grupoId, orden_sector: idx })))
    } catch (e) {
      console.error('[StockBoard] error moviendo producto', e)
    }
  }, [draggingProducto, overZoneKey, productosDeZona, moverProductosBoard])

  // Agrega productos al final de un lugar, conservando el orden del resto.
  const moverAlFinal = useCallback(async (ids: string[], sectorId: string | null, estanteId: string | null, grupoId: string | null) => {
    const bucketIds = productosDeZona(sectorId, estanteId, grupoId, new Set(ids)).map(p => p.id)
    const nuevoOrden = [...bucketIds, ...ids]
    await moverProductosBoard(nuevoOrden.map((id, idx) => ({ id, sector_id: sectorId, estante_id: estanteId, stock_grupo_id: grupoId, orden_sector: idx })))
  }, [productosDeZona, moverProductosBoard])

  const onMoverA = useCallback(async (productoId: string, sectorId: string | null, estanteId: string | null, grupoId: string | null) => {
    try { await moverAlFinal([productoId], sectorId, estanteId, grupoId) } catch (e) { console.error('[StockBoard] error en Mover a…', e) }
  }, [moverAlFinal])

  // Los seleccionados, en el orden en que se ven en el board.
  const seleccionadosEnOrden = useCallback(() =>
    productosOrdenados.filter(p => selectedIds.has(p.id))
  , [productosOrdenados, selectedIds])

  const onMoverSeleccionados = useCallback(async () => {
    const ids = seleccionadosEnOrden().map(p => p.id)
    if (ids.length === 0) return
    try {
      await moverAlFinal(ids, bulkSector || null, bulkEstante || null, bulkGrupo || null)
      clearSelection()
    } catch (e) {
      console.error('[StockBoard] error moviendo seleccionados', e)
    }
  }, [seleccionadosEnOrden, bulkSector, bulkEstante, bulkGrupo, moverAlFinal, clearSelection])

  // "Agrupar": crea un grupo con nombre en el lugar del primer seleccionado
  // (su sector + estante) y mete ahí a todos los seleccionados.
  const lugarAgrupar = useMemo(() => {
    const primero = productosOrdenados.find(p => selectedIds.has(p.id))
    return primero?.sector_id ? { sectorId: primero.sector_id, estanteId: primero.estante_id ?? null } : null
  }, [productosOrdenados, selectedIds])

  const onAgruparSeleccionados = useCallback(async () => {
    if (!lugarAgrupar || !nombreGrupoNuevo.trim()) return
    const ids = seleccionadosEnOrden().map(p => p.id)
    try {
      const grupo = await agregarGrupo(lugarAgrupar.sectorId, lugarAgrupar.estanteId, nombreGrupoNuevo.trim())
      if (!grupo) return
      await moverProductosBoard(ids.map((id, idx) => ({ id, sector_id: lugarAgrupar.sectorId, estante_id: lugarAgrupar.estanteId, stock_grupo_id: grupo.id, orden_sector: idx })))
      clearSelection()
    } catch (e) {
      console.error('[StockBoard] error agrupando', e)
    }
  }, [lugarAgrupar, nombreGrupoNuevo, seleccionadosEnOrden, agregarGrupo, moverProductosBoard, clearSelection])

  // A-Z dentro de cada grupo de cada estante — no mezcla grupos ni estantes.
  // Pisa el orden manual, por eso pide confirmación.
  const onOrdenarColumna = useCallback(async (sectorId: string | null, nombre: string) => {
    if (!confirm(`¿Ordenar "${nombre}" de la A a la Z? Se pierde el orden que armaste a mano (los grupos y estantes se mantienen).`)) return
    const lugares: Array<string | null> = [null, ...(sectorId ? estantes.filter(e => e.sector_id === sectorId).map(e => e.id) : [])]
    const cambios: Array<{ id: string; sector_id: string | null; estante_id: string | null; stock_grupo_id: string | null; orden_sector: number }> = []
    for (const estanteId of lugares) {
      const gruposAca = sectorId ? grupos.filter(g => g.sector_id === sectorId && (g.estante_id ?? null) === estanteId) : []
      for (const grupoId of [null, ...gruposAca.map(g => g.id)]) {
        const alfabetico = [...productosDeZona(sectorId, estanteId, grupoId)].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        alfabetico.forEach((p, i) => cambios.push({ id: p.id, sector_id: sectorId, estante_id: estanteId, stock_grupo_id: grupoId, orden_sector: i }))
      }
    }
    if (cambios.length) {
      try { await moverProductosBoard(cambios) } catch (e) { console.error('[StockBoard] error ordenando columna', e) }
    }
  }, [estantes, grupos, productosDeZona, moverProductosBoard])

  const onReordenarGrupo = useCallback(async (id: string, dir: 1 | -1) => {
    const gr = grupos.find(g => g.id === id)
    if (!gr) return
    const hermanos = grupos
      .filter(g => g.sector_id === gr.sector_id && (g.estante_id ?? null) === (gr.estante_id ?? null))
      .sort((a, b) => a.orden - b.orden)
    const idx = hermanos.findIndex(g => g.id === id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= hermanos.length) return
    const ids = hermanos.map(g => g.id)
    ;[ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]]
    try { await reordenarGrupos(ids) } catch (e) { console.error('[StockBoard] error reordenando grupos', e) }
  }, [grupos, reordenarGrupos])

  // Borrar un grupo o un estante suelta productos por FK (SET NULL / cascada):
  // hay que volver a pedir productos (y grupos) para que el board lo refleje.
  const handleEliminarGrupo = useCallback(async (id: string) => {
    try { await eliminarGrupo(id); refetchProductos() } catch (e) { console.error('[StockBoard] error eliminando grupo', e) }
  }, [eliminarGrupo, refetchProductos])

  const handleEliminarEstante = useCallback(async (id: string) => {
    try { await eliminarEstante(id); refetchGrupos(); refetchProductos() } catch (e) { console.error('[StockBoard] error eliminando estante', e) }
  }, [eliminarEstante, refetchGrupos, refetchProductos])

  const handleAgregarGrupo = useCallback(async (sectorId: string, estanteId: string | null, nombre: string) => {
    try { await agregarGrupo(sectorId, estanteId, nombre) } catch (e) { console.error('[StockBoard] error creando grupo', e) }
  }, [agregarGrupo])

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

  async function handleEditarSector(sectorId: string, nombre: string, icono: string) {
    try { await actualizarSector(sectorId, { nombre, icono }) } catch (e) { console.error('[StockBoard] error editando sector', e) }
  }

  const ctx: BoardCtx = useMemo(() => ({
    sectores, estantes, grupos, overZoneKey, selectedIds,
    draggingId: draggingProducto?.id ?? null,
    registerDropZone, registerCardRef, onDragStart, onDragMove, onDragEnd,
    onToggleSelect: toggleSelect,
    onMoverA,
    onEliminarProducto: handleEliminarProducto,
    onAgregarEstante: agregarEstante,
    onRenombrarEstante: renombrarEstante,
    onEliminarEstante: handleEliminarEstante,
    onReordenarEstante,
    onAgregarGrupo: handleAgregarGrupo,
    onRenombrarGrupo: renombrarGrupo,
    onEliminarGrupo: handleEliminarGrupo,
    onReordenarGrupo,
  }), [sectores, estantes, grupos, overZoneKey, selectedIds, draggingProducto, registerDropZone, registerCardRef,
    onDragStart, onDragMove, onDragEnd, toggleSelect, onMoverA, handleEliminarProducto, agregarEstante, renombrarEstante,
    handleEliminarEstante, onReordenarEstante, handleAgregarGrupo, renombrarGrupo, handleEliminarGrupo, onReordenarGrupo])

  if (loading) {
    return <p style={{ color: 'var(--text-3)', fontSize: 14, padding: 24 }}>Cargando board de stock…</p>
  }

  const estantesBulk = estantes.filter(e => e.sector_id === bulkSector).sort((a, b) => a.orden - b.orden)
  const gruposBulk = bulkSector
    ? grupos.filter(g => g.sector_id === bulkSector && (g.estante_id ?? '') === bulkEstante).sort((a, b) => a.orden - b.orden)
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Buscador + ayuda */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '0 4px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', width: 360, maxWidth: '100%' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>search</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar producto para ubicarlo…"
            style={{ border: 'none', outline: 'none', background: 'none', flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
            </button>
          )}
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0, flex: 1, minWidth: 240 }}>
          {q && selectedIds.size === 0
            ? <>{productosVisibles.length} resultado{productosVisibles.length !== 1 ? 's' : ''} — con un filtro activo no se arrastra; usá el menú &quot;⋮&quot; de cada producto.</>
            : <>Arrastrá para dejar cada producto donde está en la realidad — ese orden es el recorrido de Stockear. <b style={{ fontWeight: 600 }}>Ctrl+clic</b> (⌘ en Mac) para elegir varios y agruparlos.</>}
        </p>
      </div>

      {/* Explicación — solo mientras no hay ningún sector creado todavía */}
      {sectores.length === 0 && (
        <div style={{ padding: '0 4px 14px', flexShrink: 0 }}>
          <EmptyState
            icon="shelves"
            title="Organizá el stock por sectores"
            subtitle="Un sector es un lugar físico donde guardás mercadería — ej: Materia prima seca, Cámara de frío, Freezer (producto terminado), Depósito de packaging. Adentro armás estantes y grupos (Vinagres, Aceites, Latas…) en el orden en que los recorrés."
            cta={{ label: 'Crear mi primer sector', onClick: () => setAddingSector(true) }}
          />
        </div>
      )}

      {/* Barra de selección múltiple: agrupar o mover */}
      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 12px', margin: '0 4px 14px', background: 'color-mix(in srgb, var(--accent) 8%, var(--surface))', border: '1px solid var(--accent)', borderRadius: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
            {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              value={nombreGrupoNuevo}
              onChange={e => setNombreGrupoNuevo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onAgruparSeleccionados() }}
              disabled={!lugarAgrupar}
              placeholder={lugarAgrupar ? 'Nombre del grupo (ej: Aceites)' : 'Primero ubicalos en un sector'}
              style={{ ...selectSm, width: 210, cursor: 'text' }}
            />
            <button
              onClick={onAgruparSeleccionados}
              disabled={!lugarAgrupar || !nombreGrupoNuevo.trim()}
              title="Crea el grupo en el estante del primer seleccionado y los junta ahí, en el orden en que están"
              style={{ ...btnPrimario, opacity: !lugarAgrupar || !nombreGrupoNuevo.trim() ? 0.45 : 1 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>link</span>
              Agrupar
            </button>
          </div>

          <span style={{ width: 1, height: 22, background: 'var(--border)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <select value={bulkSector} onChange={e => { setBulkSector(e.target.value); setBulkEstante(''); setBulkGrupo('') }} style={selectSm}>
              <option value="">Sin sector</option>
              {sectores.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            {bulkSector && estantesBulk.length > 0 && (
              <select value={bulkEstante} onChange={e => { setBulkEstante(e.target.value); setBulkGrupo('') }} style={selectSm}>
                <option value="">Sin estante</option>
                {estantesBulk.map(es => <option key={es.id} value={es.id}>{es.nombre}</option>)}
              </select>
            )}
            {gruposBulk.length > 0 && (
              <select value={bulkGrupo} onChange={e => setBulkGrupo(e.target.value)} style={selectSm}>
                <option value="">Sin grupo</option>
                {gruposBulk.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
            )}
            <button onClick={onMoverSeleccionados} style={{ ...btnPrimario, background: 'var(--navy)' }}>Mover</button>
          </div>

          <button
            onClick={clearSelection}
            title="Cancelar selección"
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>
      )}

      {/* Sectores plegados: fila de chips que se acomodan solos (wrap), no
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

      {/* Columnas desplegadas */}
      <div ref={boardScrollRef} style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden' }}>
        <div style={{ display: 'flex', gap: 14, height: '100%', paddingBottom: 8, alignItems: 'flex-start' }}>
          {!collapsedIds.has(SIN_SECTOR_KEY) && (
            <StockBoardColumn
              ctx={ctx}
              sectorId={null}
              nombre="Sin sector"
              estantesDelSector={[]}
              productosSinEstante={productosVisibles.filter(p => !p.sector_id)}
              productosPorEstante={new Map()}
              onOrdenarAlfabetico={() => onOrdenarColumna(null, 'Sin sector')}
              onToggleCollapse={() => toggleCollapse(SIN_SECTOR_KEY)}
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
                ctx={ctx}
                sectorId={sec.id}
                nombre={sec.nombre}
                icono={sec.icono}
                estantesDelSector={estantesDelSector}
                productosSinEstante={productosSinEstante}
                productosPorEstante={productosPorEstante}
                onOrdenarAlfabetico={() => onOrdenarColumna(sec.id, sec.nombre)}
                onEliminarSector={() => handleEliminarSector(sec.id, sec.nombre)}
                onEditarSector={(nombre, icono) => handleEditarSector(sec.id, nombre, icono)}
                ultimoConteoAt={sec.ultimo_conteo_at}
                onToggleCollapse={() => toggleCollapse(sec.id)}
              />
            )
          })}

          {/* Nuevo sector */}
          <div style={{ width: 240, flexShrink: 0 }}>
            {addingSector ? (
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  autoFocus
                  value={nuevoSectorNombre}
                  onChange={e => setNuevoSectorNombre(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAgregarSector(); if (e.key === 'Escape') setAddingSector(false) }}
                  placeholder="Ej: Cámara, Cava…"
                  style={{ fontSize: 13, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {SECTOR_ICONOS.map(ic => (
                    <button key={ic} onClick={() => setNuevoSectorIcono(ic)}
                      style={{ width: 28, height: 28, borderRadius: 7, background: nuevoSectorIcono === ic ? 'var(--accent)' : 'var(--bg)', border: `1px solid ${nuevoSectorIcono === ic ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: nuevoSectorIcono === ic ? '#fff' : 'var(--text-2)' }}>{ic}</span>
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
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'none', border: '1px dashed var(--border)', borderRadius: 12, padding: '12px', cursor: 'pointer', color: 'var(--text-3)', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}
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
          background: 'var(--surface)', border: '2px solid var(--accent)', borderRadius: 9, padding: '7px 12px',
          fontSize: 13, fontWeight: 600, color: 'var(--text-1)', boxShadow: '0 8px 24px rgba(0,0,0,.18)',
          maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 5 }}>drag_indicator</span>
          {draggingProducto.nombre}
        </div>
      )}
    </div>
  )
}

const selectSm: React.CSSProperties = {
  fontSize: 12, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text-1)', fontFamily: 'inherit', cursor: 'pointer',
}

const btnPrimario: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: 'none',
  background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
}
