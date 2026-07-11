'use client'

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { useMesas } from '@/lib/hooks/useMesas'
import { useSalonElementos } from '@/lib/hooks/useSalonElementos'
import { Sillas } from '@/components/salon/Sillas'
import { PanZoomCanvas } from '@/components/salon/PanZoomCanvas'
import { ELEMENTO_TIPOS, elementoCfg } from '@/lib/salon/elementos'
import { SegmentedTabs, AVATAR_PALETTE } from '@/components/ui'
import type { SegmentedTab } from '@/components/ui'
import type { Mesa, MesaForma, SalonElemento, ElementoTipo } from '@/types'

type Tab = 'mesas' | 'medios' | 'estaciones'
type Tamano = 'chico' | 'mediano' | 'grande'

interface MedioPago  { id: string; nombre: string; activo: boolean }
interface Estacion   { id: string; nombre: string; pantalla_asignada: string }

// Color madera por defecto de una mesa sin color propio (look Planner 5D)
const MESA_DEFAULT = '#a9744f'

const inputStyle: React.CSSProperties = {
  minHeight: 44, borderRadius: 10, background: 'var(--bg)', color: 'var(--text-1)',
  border: '1px solid var(--border)', padding: '0 12px', fontSize: 15, width: '100%',
}

// ── Editor de mesas — canvas con zoom/pan (Sesión 3 C3 · v2 jul 2026) ─────────

const FORMAS: { id: MesaForma; label: string; icon: string }[] = [
  { id: 'cuadrada', label: 'Cuadrada', icon: 'crop_square' },
  { id: 'redonda', label: 'Redonda', icon: 'circle' },
  { id: 'rectangular', label: 'Rectangular', icon: 'crop_landscape' },
]

const TAMANOS: { id: Tamano; label: string; ancho: number; alto: number }[] = [
  { id: 'chico', label: 'Chica', ancho: 6, alto: 6 },
  { id: 'mediano', label: 'Mediana', ancho: 9, alto: 9 },
  { id: 'grande', label: 'Grande', ancho: 13, alto: 13 },
]

function tamanoDesde(mesa: Pick<Mesa, 'ancho' | 'alto' | 'forma'>): Tamano {
  const base = mesa.forma === 'rectangular' ? mesa.alto : mesa.ancho
  let mejor: Tamano = 'mediano'
  let mejorDist = Infinity
  for (const t of TAMANOS) {
    const d = Math.abs(t.ancho - base)
    if (d < mejorDist) { mejorDist = d; mejor = t.id }
  }
  return mejor
}

function dimsDesde(tamano: Tamano, forma: MesaForma): { ancho: number; alto: number } {
  const t = TAMANOS.find(x => x.id === tamano) ?? TAMANOS[1]
  return forma === 'rectangular' ? { ancho: t.ancho * 1.6, alto: t.alto } : { ancho: t.ancho, alto: t.alto }
}

const ROTACIONES = [0, 45, 90]

// Paleta de identidad (Avatar) + 2 tonos madera/piedra útiles para mobiliario de salón
const MESA_COLORES = [...AVATAR_PALETTE, '#f59e0b', '#78716c']

// ── Item mesa — estado de drag/resize LOCAL (no re-renderiza el resto del canvas) ──

interface MesaItemProps {
  mesa: Mesa
  selected: boolean
  onSelect: (id: string) => void
  onCommitMove: (id: string, x: number, y: number) => void
  onCommitResize: (id: string, ancho: number, alto: number) => void
}

const MesaCanvasItem = memo(function MesaCanvasItem({ mesa, selected, onSelect, onCommitMove, onCommitResize }: MesaItemProps) {
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const [resize, setResize] = useState<{ ancho: number; alto: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number; moved: boolean; canvasW: number; canvasH: number; lastX: number; lastY: number } | null>(null)
  const resizeRef = useRef<{ startX: number; startY: number; startAncho: number; startAlto: number; canvasW: number; canvasH: number; lastA: number; lastB: number } | null>(null)

  // Cuando el dato real (optimista) alcanza el overlay, se limpia el overlay local
  useEffect(() => { setDrag(null) }, [mesa.pos_x, mesa.pos_y])
  useEffect(() => { setResize(null) }, [mesa.ancho, mesa.alto])

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.stopPropagation() // no dispares el pan del canvas
    e.currentTarget.setPointerCapture(e.pointerId)
    const canvas = e.currentTarget.closest('[data-canvas]') as HTMLElement | null
    const rect = canvas?.getBoundingClientRect()
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      startPosX: mesa.pos_x, startPosY: mesa.pos_y,
      moved: false, canvasW: rect?.width ?? 1, canvasH: rect?.height ?? 1,
      lastX: mesa.pos_x, lastY: mesa.pos_y,
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const dr = dragRef.current
    if (!dr) return
    const dx = e.clientX - dr.startX
    const dy = e.clientY - dr.startY
    if (!dr.moved && Math.hypot(dx, dy) < 8) return
    dr.moved = true
    const x = Math.min(96, Math.max(0, dr.startPosX + (dx / dr.canvasW) * 100))
    const y = Math.min(96, Math.max(0, dr.startPosY + (dy / dr.canvasH) * 100))
    dr.lastX = x; dr.lastY = y
    setDrag({ x, y })
  }

  function onPointerUp() {
    const dr = dragRef.current
    dragRef.current = null
    if (dr?.moved) onCommitMove(mesa.id, dr.lastX, dr.lastY)
    else onSelect(mesa.id)
  }

  function onResizeDown(e: React.PointerEvent<HTMLSpanElement>) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const canvas = e.currentTarget.closest('[data-canvas]') as HTMLElement | null
    const rect = canvas?.getBoundingClientRect()
    resizeRef.current = {
      startX: e.clientX, startY: e.clientY,
      startAncho: mesa.ancho, startAlto: mesa.alto,
      canvasW: rect?.width ?? 1, canvasH: rect?.height ?? 1,
      lastA: mesa.ancho, lastB: mesa.alto,
    }
  }

  function onResizeMove(e: React.PointerEvent<HTMLSpanElement>) {
    e.stopPropagation()
    const rr = resizeRef.current
    if (!rr) return
    const dx = e.clientX - rr.startX
    const dy = e.clientY - rr.startY
    const ancho = Math.min(70, Math.max(5, rr.startAncho + (dx / rr.canvasW) * 100))
    const alto = Math.min(70, Math.max(5, rr.startAlto + (dy / rr.canvasH) * 100))
    rr.lastA = ancho; rr.lastB = alto
    setResize({ ancho, alto })
  }

  function onResizeUp(e: React.PointerEvent<HTMLSpanElement>) {
    e.stopPropagation()
    const rr = resizeRef.current
    resizeRef.current = null
    if (rr) onCommitResize(mesa.id, rr.lastA, rr.lastB)
  }

  const x = drag?.x ?? mesa.pos_x
  const y = drag?.y ?? mesa.pos_y
  const anchoUi = Math.max(resize?.ancho ?? mesa.ancho, 5)
  const altoUi = Math.max(resize?.alto ?? mesa.alto, 5)
  const capacidad = mesa.capacidad ?? 4
  const fill = mesa.color ?? MESA_DEFAULT

  return (
    <button
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: `${anchoUi}%`,
        aspectRatio: `${anchoUi} / ${altoUi}`,
        borderRadius: mesa.forma === 'redonda' ? '50%' : 12,
        transform: `rotate(${mesa.rotacion}deg)`,
        background: fill,
        border: selected ? '2px solid var(--accent)' : '2px solid rgba(0,0,0,0.22)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.22)',
        color: '#fff',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
        touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'grab',
      }}
    >
      <Sillas forma={mesa.forma} capacidad={capacidad} ancho={anchoUi} alto={altoUi} tamano={13} />
      <span style={{ fontSize: 15, fontWeight: 800, transform: `rotate(${-mesa.rotacion}deg)` }}>{mesa.numero}</span>
      <span style={{ fontSize: 10, opacity: 0.8, transform: `rotate(${-mesa.rotacion}deg)` }}>{capacidad}p</span>
      {selected && (
        <span
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          style={{
            position: 'absolute', right: -12, bottom: -12, width: 26, height: 26, borderRadius: '50%',
            background: '#fff', border: '2px solid var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'none', cursor: 'nwse-resize',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--accent)', transform: `rotate(${-mesa.rotacion}deg)` }}>open_in_full</span>
        </span>
      )}
    </button>
  )
})

function MesaPanel({
  mesa, onChange, onDelete, onCerrar,
}: {
  mesa: Mesa
  onChange: (id: string, datos: Partial<Mesa>) => void
  onDelete: (id: string) => void
  onCerrar: () => void
}) {
  const tamano = tamanoDesde(mesa)
  const chip = (activo: boolean): React.CSSProperties => ({
    background: activo ? 'var(--accent)' : 'var(--bg)',
    border: activo ? '1px solid var(--accent)' : '1px solid var(--border)',
    color: activo ? '#fff' : 'var(--text-1)',
  })

  return (
    <div style={{ background: 'var(--surface)', borderRadius: '16px 16px 0 0', padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14, borderTop: '1px solid var(--border)', boxShadow: '0 -8px 24px rgba(0,0,0,0.15)', maxHeight: '55vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontWeight: 700, color: 'var(--text-1)', fontSize: 16 }}>Mesa {mesa.numero}</p>
        <button onClick={onCerrar} style={{ background: 'none', border: 'none', color: 'var(--text-2)', fontSize: 14, minHeight: 44 }}>Listo</button>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Número / nombre</span>
          <input value={mesa.numero} onChange={e => onChange(mesa.id, { numero: e.target.value })} style={inputStyle} />
        </label>
        <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Sector</span>
          <input value={mesa.sector ?? ''} onChange={e => onChange(mesa.id, { sector: e.target.value })} placeholder="Salón, Terraza..." style={inputStyle} />
        </label>
        <label style={{ width: 76, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Cap.</span>
          <input type="number" min={1} value={mesa.capacidad ?? 4} onChange={e => onChange(mesa.id, { capacidad: parseInt(e.target.value) || 4 })} style={inputStyle} />
        </label>
      </div>

      <div>
        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Forma</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {FORMAS.map(f => {
            const activo = mesa.forma === f.id
            const dims = dimsDesde(tamano, f.id)
            return (
              <button key={f.id} onClick={() => onChange(mesa.id, { forma: f.id, ...dims })}
                style={{ flex: 1, minHeight: 60, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, ...chip(activo) }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{f.icon}</span>
                <span style={{ fontSize: 11 }}>{f.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Tamaño</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {TAMANOS.map(t => (
            <button key={t.id} onClick={() => onChange(mesa.id, dimsDesde(t.id, mesa.forma))}
              style={{ flex: 1, minHeight: 48, borderRadius: 10, fontSize: 13, fontWeight: 600, ...chip(tamano === t.id) }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Color</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => onChange(mesa.id, { color: null })} aria-label="Madera (default)"
            style={{ width: 34, height: 34, borderRadius: '50%', background: MESA_DEFAULT, border: !mesa.color ? '2px solid var(--text-1)' : '1px solid var(--border)' }} />
          {MESA_COLORES.map(c => (
            <button key={c} onClick={() => onChange(mesa.id, { color: c })} aria-label={c}
              style={{ width: 34, height: 34, borderRadius: '50%', background: c, border: mesa.color === c ? '2px solid var(--text-1)' : '1px solid var(--border)' }} />
          ))}
        </div>
      </div>

      <div>
        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Rotación</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {ROTACIONES.map(r => (
            <button key={r} onClick={() => onChange(mesa.id, { rotacion: r })}
              style={{ flex: 1, minHeight: 48, borderRadius: 10, fontSize: 13, fontWeight: 600, ...chip(mesa.rotacion === r) }}>
              {r}°
            </button>
          ))}
        </div>
      </div>

      <button onClick={() => onDelete(mesa.id)}
        style={{ minHeight: 48, borderRadius: 10, background: 'rgba(229,115,115,0.12)', border: '1px solid rgba(229,115,115,0.3)', color: '#e57373', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span> Eliminar mesa
      </button>
    </div>
  )
}

// ── Elementos decorativos (barra, caja, parrilla, planta, pared) ─────────────
// Config de tipos (ELEMENTO_TIPOS, elementoCfg) vive en lib/salon/elementos.ts — compartida con el mapa real.

interface ElementoItemProps {
  elemento: SalonElemento
  selected: boolean
  onSelect: (id: string) => void
  onCommitMove: (id: string, x: number, y: number) => void
  onCommitResize: (id: string, ancho: number, alto: number) => void
}

const ElementoCanvasItem = memo(function ElementoCanvasItem({ elemento, selected, onSelect, onCommitMove, onCommitResize }: ElementoItemProps) {
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const [resize, setResize] = useState<{ ancho: number; alto: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number; moved: boolean; canvasW: number; canvasH: number; lastX: number; lastY: number } | null>(null)
  const resizeRef = useRef<{ startX: number; startY: number; startAncho: number; startAlto: number; canvasW: number; canvasH: number; lastA: number; lastB: number } | null>(null)

  useEffect(() => { setDrag(null) }, [elemento.pos_x, elemento.pos_y])
  useEffect(() => { setResize(null) }, [elemento.ancho, elemento.alto])

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const canvas = e.currentTarget.closest('[data-canvas]') as HTMLElement | null
    const rect = canvas?.getBoundingClientRect()
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      startPosX: elemento.pos_x, startPosY: elemento.pos_y,
      moved: false, canvasW: rect?.width ?? 1, canvasH: rect?.height ?? 1,
      lastX: elemento.pos_x, lastY: elemento.pos_y,
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const dr = dragRef.current
    if (!dr) return
    const dx = e.clientX - dr.startX
    const dy = e.clientY - dr.startY
    if (!dr.moved && Math.hypot(dx, dy) < 8) return
    dr.moved = true
    const x = Math.min(98, Math.max(0, dr.startPosX + (dx / dr.canvasW) * 100))
    const y = Math.min(98, Math.max(0, dr.startPosY + (dy / dr.canvasH) * 100))
    dr.lastX = x; dr.lastY = y
    setDrag({ x, y })
  }

  function onPointerUp() {
    const dr = dragRef.current
    dragRef.current = null
    if (dr?.moved) onCommitMove(elemento.id, dr.lastX, dr.lastY)
    else onSelect(elemento.id)
  }

  function onResizeDown(e: React.PointerEvent<HTMLSpanElement>) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const canvas = e.currentTarget.closest('[data-canvas]') as HTMLElement | null
    const rect = canvas?.getBoundingClientRect()
    resizeRef.current = {
      startX: e.clientX, startY: e.clientY,
      startAncho: elemento.ancho, startAlto: elemento.alto,
      canvasW: rect?.width ?? 1, canvasH: rect?.height ?? 1,
      lastA: elemento.ancho, lastB: elemento.alto,
    }
  }

  function onResizeMove(e: React.PointerEvent<HTMLSpanElement>) {
    e.stopPropagation()
    const rr = resizeRef.current
    if (!rr) return
    const dx = e.clientX - rr.startX
    const dy = e.clientY - rr.startY
    const ancho = Math.min(90, Math.max(3, rr.startAncho + (dx / rr.canvasW) * 100))
    const alto = Math.min(90, Math.max(3, rr.startAlto + (dy / rr.canvasH) * 100))
    rr.lastA = ancho; rr.lastB = alto
    setResize({ ancho, alto })
  }

  function onResizeUp(e: React.PointerEvent<HTMLSpanElement>) {
    e.stopPropagation()
    const rr = resizeRef.current
    resizeRef.current = null
    if (rr) onCommitResize(elemento.id, rr.lastA, rr.lastB)
  }

  const cfg = elementoCfg(elemento.tipo)
  const x = drag?.x ?? elemento.pos_x
  const y = drag?.y ?? elemento.pos_y
  const anchoUi = Math.max(resize?.ancho ?? elemento.ancho, 3)
  const altoUi = Math.max(resize?.alto ?? elemento.alto, 3)

  return (
    <button
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: `${anchoUi}%`,
        aspectRatio: `${anchoUi} / ${altoUi}`,
        borderRadius: elemento.tipo === 'planta' ? '50%' : 6,
        transform: `rotate(${elemento.rotacion}deg)`,
        background: elemento.color ?? cfg.color,
        border: selected ? '2px solid var(--accent)' : '1px solid rgba(0,0,0,0.2)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
        color: '#fff',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
        touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'grab',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18, transform: `rotate(${-elemento.rotacion}deg)` }}>{cfg.icon}</span>
      {elemento.label && (
        <span style={{ fontSize: 9, opacity: 0.9, whiteSpace: 'nowrap', transform: `rotate(${-elemento.rotacion}deg)` }}>{elemento.label}</span>
      )}
      {selected && (
        <span
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          style={{
            position: 'absolute', right: -12, bottom: -12, width: 26, height: 26, borderRadius: '50%',
            background: '#fff', border: '2px solid var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'none', cursor: 'nwse-resize',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--accent)', transform: `rotate(${-elemento.rotacion}deg)` }}>open_in_full</span>
        </span>
      )}
    </button>
  )
})

function ElementoPanel({
  elemento, onChange, onDelete, onCerrar,
}: {
  elemento: SalonElemento
  onChange: (id: string, datos: Partial<SalonElemento>) => void
  onDelete: (id: string) => void
  onCerrar: () => void
}) {
  const cfg = elementoCfg(elemento.tipo)
  const chip = (activo: boolean): React.CSSProperties => ({
    background: activo ? 'var(--accent)' : 'var(--bg)',
    border: activo ? '1px solid var(--accent)' : '1px solid var(--border)',
    color: activo ? '#fff' : 'var(--text-1)',
  })

  return (
    <div style={{ background: 'var(--surface)', borderRadius: '16px 16px 0 0', padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14, borderTop: '1px solid var(--border)', boxShadow: '0 -8px 24px rgba(0,0,0,0.15)', maxHeight: '55vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>{cfg.icon}</span>
          <p style={{ fontWeight: 700, color: 'var(--text-1)', fontSize: 16 }}>{cfg.label}</p>
        </div>
        <button onClick={onCerrar} style={{ background: 'none', border: 'none', color: 'var(--text-2)', fontSize: 14, minHeight: 44 }}>Listo</button>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Nombre (opcional)</span>
        <input value={elemento.label ?? ''} onChange={e => onChange(elemento.id, { label: e.target.value || null })} placeholder={cfg.label} style={inputStyle} />
      </label>

      <div>
        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Color</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => onChange(elemento.id, { color: null })} aria-label="Color por defecto"
            style={{ width: 34, height: 34, borderRadius: '50%', background: cfg.color, border: !elemento.color ? '2px solid var(--text-1)' : '1px solid var(--border)' }} />
          {MESA_COLORES.map(c => (
            <button key={c} onClick={() => onChange(elemento.id, { color: c })} aria-label={c}
              style={{ width: 34, height: 34, borderRadius: '50%', background: c, border: elemento.color === c ? '2px solid var(--text-1)' : '1px solid var(--border)' }} />
          ))}
        </div>
      </div>

      <div>
        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Rotación</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {ROTACIONES.map(r => (
            <button key={r} onClick={() => onChange(elemento.id, { rotacion: r })}
              style={{ flex: 1, minHeight: 48, borderRadius: 10, fontSize: 13, fontWeight: 600, ...chip(elemento.rotacion === r) }}>
              {r}°
            </button>
          ))}
        </div>
      </div>

      <button onClick={() => onDelete(elemento.id)}
        style={{ minHeight: 48, borderRadius: 10, background: 'rgba(229,115,115,0.12)', border: '1px solid rgba(229,115,115,0.3)', color: '#e57373', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span> Eliminar
      </button>
    </div>
  )
}

function EditorSalon() {
  const RID = useRestauranteId()
  const { mesas, loading: loadingMesas, crearMesa, actualizarMesa, eliminarMesa, guardarLayout } = useMesas()
  const { elementos, loading: loadingElementos, crearElemento, actualizarElemento, eliminarElemento } = useSalonElementos()
  const [seleccion, setSeleccion] = useState<{ kind: 'mesa' | 'elemento'; id: string } | null>(null)
  const [creando, setCreando] = useState(false)

  // Refs para leer el estado más reciente sin recrear los callbacks memoizados
  const mesasRef = useRef(mesas); mesasRef.current = mesas
  const elementosRef = useRef(elementos); elementosRef.current = elementos
  const apiRef = useRef({ actualizarMesa, guardarLayout, crearMesa, eliminarMesa, actualizarElemento, crearElemento, eliminarElemento })
  apiRef.current = { actualizarMesa, guardarLayout, crearMesa, eliminarMesa, actualizarElemento, crearElemento, eliminarElemento }

  // Pila de deshacer — thunks que revierten cada operación
  const undoStack = useRef<Array<() => void | Promise<void>>>([])
  const [undoCount, setUndoCount] = useState(0)
  const pushUndo = useCallback((fn: () => void | Promise<void>) => {
    undoStack.current.push(fn)
    if (undoStack.current.length > 50) undoStack.current.shift()
    setUndoCount(undoStack.current.length)
  }, [])
  const undo = useCallback(async () => {
    const fn = undoStack.current.pop()
    setUndoCount(undoStack.current.length)
    if (fn) { try { await fn() } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error al deshacer') } }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])

  const mesaSeleccionada = seleccion?.kind === 'mesa' ? mesas.find(m => m.id === seleccion.id) ?? null : null
  const elementoSeleccionado = seleccion?.kind === 'elemento' ? elementos.find(e => e.id === seleccion.id) ?? null : null

  async function onCrearMesa() {
    if (!RID) return
    setCreando(true)
    try {
      const numero = String(mesas.length + 1)
      const id = await apiRef.current.crearMesa({ numero, sector: 'Salón', capacidad: 4, forma: 'cuadrada', ancho: 9, alto: 9, rotacion: 0, pos_x: 42, pos_y: 42 })
      pushUndo(() => apiRef.current.eliminarMesa(id))
      setSeleccion({ kind: 'mesa', id })
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al crear la mesa')
    } finally {
      setCreando(false)
    }
  }

  async function onCrearElemento(tipo: ElementoTipo) {
    if (!RID) return
    const cfg = elementoCfg(tipo)
    try {
      const id = await apiRef.current.crearElemento({ tipo, label: null, ancho: cfg.ancho, alto: cfg.alto, rotacion: 0, pos_x: 30, pos_y: 30 })
      pushUndo(() => apiRef.current.eliminarElemento(id))
      setSeleccion({ kind: 'elemento', id })
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al crear el elemento')
    }
  }

  // ── Callbacks estables (leen de refs) → los items memoizados no se re-renderizan de más ──

  const onCommitMoveMesa = useCallback((id: string, x: number, y: number) => {
    const prev = mesasRef.current.find(m => m.id === id)
    if (prev) pushUndo(() => apiRef.current.guardarLayout([{ id, pos_x: prev.pos_x, pos_y: prev.pos_y }]))
    apiRef.current.guardarLayout([{ id, pos_x: x, pos_y: y }]).catch((e: unknown) => alert(e instanceof Error ? e.message : 'Error al guardar'))
  }, [pushUndo])

  const onCommitResizeMesa = useCallback((id: string, ancho: number, alto: number) => {
    const prev = mesasRef.current.find(m => m.id === id)
    if (prev) pushUndo(() => apiRef.current.actualizarMesa(id, { ancho: prev.ancho, alto: prev.alto }))
    apiRef.current.actualizarMesa(id, { ancho, alto }).catch((e: unknown) => alert(e instanceof Error ? e.message : 'Error al guardar'))
  }, [pushUndo])

  const onCommitMoveElemento = useCallback((id: string, x: number, y: number) => {
    const prev = elementosRef.current.find(el => el.id === id)
    if (prev) pushUndo(() => apiRef.current.actualizarElemento(id, { pos_x: prev.pos_x, pos_y: prev.pos_y }))
    apiRef.current.actualizarElemento(id, { pos_x: x, pos_y: y }).catch((e: unknown) => alert(e instanceof Error ? e.message : 'Error al guardar'))
  }, [pushUndo])

  const onCommitResizeElemento = useCallback((id: string, ancho: number, alto: number) => {
    const prev = elementosRef.current.find(el => el.id === id)
    if (prev) pushUndo(() => apiRef.current.actualizarElemento(id, { ancho: prev.ancho, alto: prev.alto }))
    apiRef.current.actualizarElemento(id, { ancho, alto }).catch((e: unknown) => alert(e instanceof Error ? e.message : 'Error al guardar'))
  }, [pushUndo])

  const onSelectMesa = useCallback((id: string) => setSeleccion({ kind: 'mesa', id }), [])
  const onSelectElemento = useCallback((id: string) => setSeleccion({ kind: 'elemento', id }), [])

  // Cambios de propiedad desde el panel (con deshacer del valor previo)
  function onChangeMesa(id: string, datos: Partial<Mesa>) {
    const prev = mesasRef.current.find(m => m.id === id)
    if (prev) {
      const prevRec = prev as unknown as Record<string, unknown>
      const inverso = Object.fromEntries(Object.keys(datos).map(k => [k, prevRec[k]]))
      pushUndo(() => { apiRef.current.actualizarMesa(id, inverso) })
    }
    apiRef.current.actualizarMesa(id, datos).catch((e: unknown) => alert(e instanceof Error ? e.message : 'Error al guardar'))
  }

  function onChangeElemento(id: string, datos: Partial<SalonElemento>) {
    const prev = elementosRef.current.find(el => el.id === id)
    if (prev) {
      const prevRec = prev as unknown as Record<string, unknown>
      const inverso = Object.fromEntries(Object.keys(datos).map(k => [k, prevRec[k]]))
      pushUndo(() => { apiRef.current.actualizarElemento(id, inverso) })
    }
    apiRef.current.actualizarElemento(id, datos).catch((e: unknown) => alert(e instanceof Error ? e.message : 'Error al guardar'))
  }

  async function onDeleteMesa(id: string) {
    if (!confirm('¿Eliminar esta mesa?')) return
    const prev = mesasRef.current.find(m => m.id === id)
    setSeleccion(null)
    try {
      await apiRef.current.eliminarMesa(id)
      if (prev) pushUndo(() => { apiRef.current.crearMesa({ numero: prev.numero, sector: prev.sector ?? null, capacidad: prev.capacidad ?? null, forma: prev.forma, ancho: prev.ancho, alto: prev.alto, rotacion: prev.rotacion, pos_x: prev.pos_x, pos_y: prev.pos_y, color: prev.color ?? null }) })
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error al eliminar') }
  }

  async function onDeleteElemento(id: string) {
    if (!confirm('¿Eliminar este elemento?')) return
    const prev = elementosRef.current.find(el => el.id === id)
    setSeleccion(null)
    try {
      await apiRef.current.eliminarElemento(id)
      if (prev) pushUndo(() => { apiRef.current.crearElemento({ tipo: prev.tipo, label: prev.label ?? null, ancho: prev.ancho, alto: prev.alto, rotacion: prev.rotacion, pos_x: prev.pos_x, pos_y: prev.pos_y, color: prev.color ?? null }) })
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error al eliminar') }
  }

  if (loadingMesas || loadingElementos) return <p style={{ color: 'var(--text-3)', textAlign: 'center', padding: 32 }}>Cargando plano...</p>

  const undoBtn = (
    <button
      onClick={undo}
      disabled={undoCount === 0}
      aria-label="Deshacer"
      title="Deshacer (Ctrl+Z)"
      style={{
        width: 44, height: 44, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)',
        color: undoCount === 0 ? 'var(--text-3)' : 'var(--text-1)', opacity: undoCount === 0 ? 0.5 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 22 }}>undo</span>
    </button>
  )

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Arrastrá para mover · rueda o pellizco para acercar</p>
        <button onClick={onCrearMesa} disabled={creando}
          style={{ minHeight: 40, padding: '0 14px', borderRadius: 10, background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, opacity: creando ? 0.6 : 1 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Mesa
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, flexShrink: 0 }}>
        {ELEMENTO_TIPOS.map(t => (
          <button key={t.id} onClick={() => onCrearElemento(t.id)} title={`Agregar ${t.label}`}
            style={{ flexShrink: 0, minHeight: 40, padding: '0 12px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{t.icon}</span>
            <span style={{ fontSize: 12 }}>{t.label}</span>
          </button>
        ))}
      </div>

      <PanZoomCanvas toolbarExtra={undoBtn}>
        {mesas.length === 0 && elementos.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-3)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 40 }}>table_restaurant</span>
            <p>Sin mesas todavía — tocá "+ Mesa" para agregar la primera</p>
          </div>
        )}
        {elementos.map(el => (
          <ElementoCanvasItem
            key={el.id}
            elemento={el}
            selected={seleccion?.kind === 'elemento' && seleccion.id === el.id}
            onSelect={onSelectElemento}
            onCommitMove={onCommitMoveElemento}
            onCommitResize={onCommitResizeElemento}
          />
        ))}
        {mesas.map(m => (
          <MesaCanvasItem
            key={m.id}
            mesa={m}
            selected={seleccion?.kind === 'mesa' && seleccion.id === m.id}
            onSelect={onSelectMesa}
            onCommitMove={onCommitMoveMesa}
            onCommitResize={onCommitResizeMesa}
          />
        ))}
      </PanZoomCanvas>

      {mesaSeleccionada && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20 }}>
          <MesaPanel mesa={mesaSeleccionada} onChange={onChangeMesa} onDelete={onDeleteMesa} onCerrar={() => setSeleccion(null)} />
        </div>
      )}
      {elementoSeleccionado && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20 }}>
          <ElementoPanel elemento={elementoSeleccionado} onChange={onChangeElemento} onDelete={onDeleteElemento} onCerrar={() => setSeleccion(null)} />
        </div>
      )}
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────────────────

const TABS: SegmentedTab<Tab>[] = [
  { id: 'mesas', label: 'Mesas', icon: 'table_restaurant' },
  { id: 'medios', label: 'Medios de pago', icon: 'payments' },
  { id: 'estaciones', label: 'Estaciones KDS', icon: 'kitchen' },
]

export default function SalonConfigPage() {
  const router  = useRouter()
  const RID     = useRestauranteId()
  const supabase = createClient()
  const [tab,    setTab]    = useState<Tab>('mesas')

  // Medios de pago
  const [medios,      setMedios]      = useState<MedioPago[]>([])
  const [nuevoMedio,  setNuevoMedio]  = useState('')
  const [guardandoMedio, setGuardandoMedio] = useState(false)

  // Estaciones KDS
  const [estaciones,    setEstaciones]    = useState<Estacion[]>([])
  const [nuevaEstacion, setNuevaEstacion] = useState('')
  const [guardandoEst,  setGuardandoEst]  = useState(false)

  const fetchMedios = useCallback(async () => {
    if (!RID) return
    const { data } = await supabase.from('medios_pago').select('*').eq('restaurante_id', RID).order('nombre')
    setMedios((data ?? []) as MedioPago[])
  }, [RID, supabase])

  const fetchEstaciones = useCallback(async () => {
    if (!RID) return
    const { data } = await supabase.from('estaciones').select('*').eq('restaurante_id', RID).order('nombre')
    setEstaciones((data ?? []) as Estacion[])
  }, [RID, supabase])

  useEffect(() => { fetchMedios(); fetchEstaciones() }, [fetchMedios, fetchEstaciones])

  // ── Medios de pago ───────────────────────────────────────────────────────────

  async function guardarMedio() {
    if (!RID || !nuevoMedio.trim()) return
    setGuardandoMedio(true)
    try {
      await supabase.from('medios_pago').insert({ restaurante_id: RID, nombre: nuevoMedio.trim(), activo: true })
      setNuevoMedio('')
      await fetchMedios()
    } finally { setGuardandoMedio(false) }
  }

  async function toggleMedio(id: string, activo: boolean) {
    await supabase.from('medios_pago').update({ activo: !activo }).eq('id', id)
    await fetchMedios()
  }

  async function eliminarMedio(id: string) {
    if (!confirm('¿Eliminar este medio de pago?')) return
    await supabase.from('medios_pago').delete().eq('id', id)
    await fetchMedios()
  }

  // ── Estaciones KDS ───────────────────────────────────────────────────────────

  async function guardarEstacion() {
    if (!RID || !nuevaEstacion.trim()) return
    setGuardandoEst(true)
    try {
      await supabase.from('estaciones').insert({ restaurante_id: RID, nombre: nuevaEstacion.trim(), pantalla_asignada: nuevaEstacion.trim().toLowerCase().replace(/\s+/g, '_') })
      setNuevaEstacion('')
      await fetchEstaciones()
    } finally { setGuardandoEst(false) }
  }

  async function eliminarEstacion(id: string) {
    if (!confirm('¿Eliminar esta estación?')) return
    await supabase.from('estaciones').delete().eq('id', id)
    await fetchEstaciones()
  }

  // ── UI ───────────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* Header + tabs (patrón gestión) */}
      <div style={{ background: 'var(--navy)', padding: '46px 16px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#fff', minWidth: 44, minHeight: 44 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28 }}>arrow_back</span>
          </button>
          <p style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>Configuración del salón</p>
        </div>
        <SegmentedTabs tabs={TABS} active={tab} onChange={setTab} />
      </div>

      <div style={{ flex: 1, overflowY: tab === 'mesas' ? 'hidden' : 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>

        {/* ── MESAS ─────────────────────────────────────────────────────────── */}
        {tab === 'mesas' && <EditorSalon />}

        {/* ── MEDIOS DE PAGO ───────────────────────────────────────────────── */}
        {tab === 'medios' && (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={nuevoMedio} onChange={e => setNuevoMedio(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') guardarMedio() }}
                placeholder="Efectivo, Débito, MP, QR..."
                style={{ ...inputStyle, flex: 1 }} />
              <button onClick={guardarMedio} disabled={guardandoMedio || !nuevoMedio.trim()}
                style={{ minWidth: 52, minHeight: 44, borderRadius: 10, background: 'var(--navy)', color: '#fff', fontWeight: 700, opacity: guardandoMedio ? 0.6 : 1 }}>
                <span className="material-symbols-outlined">add</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {medios.map(m => (
                <div key={m.id} style={{ background: 'var(--surface)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--border)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: m.activo ? 'rgba(76,175,80,0.15)' : 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: m.activo ? '#4caf50' : 'var(--text-3)' }}>
                      {m.nombre.toLowerCase().includes('efectivo') ? 'payments' : m.nombre.toLowerCase().includes('débito') || m.nombre.toLowerCase().includes('credito') ? 'credit_card' : 'qr_code'}
                    </span>
                  </div>
                  <span style={{ color: 'var(--text-1)', flex: 1, fontWeight: 600 }}>{m.nombre}</span>
                  <button onClick={() => toggleMedio(m.id, m.activo)} style={{ background: m.activo ? 'rgba(76,175,80,0.15)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', color: m.activo ? '#4caf50' : 'var(--text-3)', fontSize: 13 }}>
                    {m.activo ? 'Activo' : 'Inactivo'}
                  </button>
                  <button onClick={() => eliminarMedio(m.id)} style={{ background: 'none', border: 'none', color: '#e57373', padding: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                  </button>
                </div>
              ))}
              {medios.length === 0 && <p style={{ color: 'var(--text-3)', textAlign: 'center', padding: 24 }}>Sin medios de pago. Agregá al menos uno para poder cobrar.</p>}
            </div>
          </>
        )}

        {/* ── ESTACIONES KDS ──────────────────────────────────────────────── */}
        {tab === 'estaciones' && (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={nuevaEstacion} onChange={e => setNuevaEstacion(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') guardarEstacion() }}
                placeholder="Parrilla, Frío, Pastelería..."
                style={{ ...inputStyle, flex: 1 }} />
              <button onClick={guardarEstacion} disabled={guardandoEst || !nuevaEstacion.trim()}
                style={{ minWidth: 52, minHeight: 44, borderRadius: 10, background: 'var(--navy)', color: '#fff', fontWeight: 700, opacity: guardandoEst ? 0.6 : 1 }}>
                <span className="material-symbols-outlined">add</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {estaciones.map(e => (
                <div key={e.id} style={{ background: 'var(--surface)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--border)' }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--accent)', fontSize: 22 }}>kitchen</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: 'var(--text-1)', fontWeight: 700 }}>{e.nombre}</p>
                    <p style={{ color: 'var(--text-3)', fontSize: 12 }}>pantalla: {e.pantalla_asignada}</p>
                  </div>
                  <button onClick={() => eliminarEstacion(e.id)} style={{ background: 'none', border: 'none', color: '#e57373', padding: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                  </button>
                </div>
              ))}
              {estaciones.length === 0 && (
                <div style={{ background: 'rgba(229,115,115,0.08)', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(229,115,115,0.2)' }}>
                  <p style={{ color: '#e57373', fontWeight: 600 }}>Sin estaciones KDS</p>
                  <p style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 4 }}>Las estaciones definen a qué pantalla de KDS va cada ítem de la carta. Creá una y luego asignala en cada ítem de la carta.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
