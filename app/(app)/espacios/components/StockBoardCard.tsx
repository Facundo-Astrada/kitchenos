'use client'

import { useRef, useState } from 'react'
import type { ProductoConEstado } from '@/lib/hooks/useStock'
import type { StockSector, StockEstante } from '@/types'

const ESTADO_COLOR: Record<string, string> = {
  critico: '#dc2626',
  bajo: '#d97706',
  ok: 'var(--text-3)',
}

interface Props {
  producto: ProductoConEstado
  isDragging: boolean
  sectores: StockSector[]
  estantes: StockEstante[]
  registerCardRef: (id: string, el: HTMLElement | null) => void
  onDragStart: (p: ProductoConEstado) => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: () => void
  onMoverA: (productoId: string, sectorId: string | null, estanteId: string | null) => void
  onEliminar: (productoId: string) => void
}

export default function StockBoardCard({ producto, isDragging, sectores, estantes, registerCardRef, onDragStart, onDragMove, onDragEnd, onMoverA, onEliminar }: Props) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const active = useRef(false)
  const [showMenu, setShowMenu] = useState(false)
  const [moverSector, setMoverSector] = useState('')
  const [moverEstante, setMoverEstante] = useState('')

  const estantesDelSectorElegido = estantes.filter(e => e.sector_id === moverSector)

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, y: e.clientY }
    active.current = false
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    if (!active.current) {
      if (Math.hypot(dx, dy) < 6) return
      active.current = true
      onDragStart(producto)
    }
    onDragMove(e.clientX, e.clientY)
  }

  function endDrag(e: React.PointerEvent) {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    const wasDragging = active.current
    start.current = null
    active.current = false
    if (wasDragging) onDragEnd()
  }

  function abrirMenu() {
    setMoverSector(producto.sector_id ?? '')
    setMoverEstante(producto.estante_id ?? '')
    setShowMenu(true)
  }

  function confirmarMover() {
    onMoverA(producto.id, moverSector || null, moverEstante || null)
    setShowMenu(false)
  }

  function handleEliminar() {
    setShowMenu(false)
    onEliminar(producto.id)
  }

  return (
    <div
      ref={el => registerCardRef(producto.id, el)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 8px', borderRadius: 8,
        background: 'var(--surface)', border: '1px solid var(--border)',
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.35 : 1,
        touchAction: 'none', userSelect: 'none',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--text-3)', flexShrink: 0 }}>drag_indicator</span>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: ESTADO_COLOR[producto.estado], flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, color: 'var(--text-1)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {producto.nombre}
      </span>
      <button
        data-no-drag
        onClick={() => (showMenu ? setShowMenu(false) : abrirMenu())}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 2, flexShrink: 0 }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>more_vert</span>
      </button>

      {showMenu && (
        <div data-no-drag onClick={e => e.stopPropagation()} style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 40,
          width: 210, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,.25)', padding: 10, display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Mover a…</span>
          <select
            value={moverSector}
            onChange={e => { setMoverSector(e.target.value); setMoverEstante('') }}
            style={{ fontSize: 12, padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontFamily: 'inherit', cursor: 'pointer' }}
          >
            <option value="">Sin sector</option>
            {sectores.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          {moverSector && estantesDelSectorElegido.length > 0 && (
            <select
              value={moverEstante}
              onChange={e => setMoverEstante(e.target.value)}
              style={{ fontSize: 12, padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontFamily: 'inherit', cursor: 'pointer' }}
            >
              <option value="">Sin estante</option>
              {estantesDelSectorElegido.map(es => <option key={es.id} value={es.id}>{es.nombre}</option>)}
            </select>
          )}
          <button
            onClick={confirmarMover}
            style={{ marginTop: 2, padding: '7px 10px', borderRadius: 7, border: 'none', background: 'var(--navy)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Mover
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
          <button
            onClick={handleEliminar}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 4px', borderRadius: 7, border: 'none', background: 'none', color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>delete</span>
            Eliminar del stock
          </button>
        </div>
      )}
    </div>
  )
}
