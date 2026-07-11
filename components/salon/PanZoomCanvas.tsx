'use client'

// Espacio de trabajo con zoom/pan para el plano del salón — usado por el editor
// (salon/config) y el mapa real (salon). Patrón estándar de editores de planos 2D:
// mundo virtual de tamaño fijo + wrapper con transform translate+scale.
// Los ítems hijos se posicionan en % del mundo (igual que siempre) y deben hacer
// stopPropagation en su onPointerDown para no disparar el pan.

import { useRef, useState, useLayoutEffect, useCallback, type ReactNode, type CSSProperties } from 'react'

export const MUNDO_W = 1200
export const MUNDO_H = 800

const MIN_SCALE = 0.3
const MAX_SCALE = 3
const PAN_THRESHOLD = 8

interface Transform { x: number; y: number; scale: number }

export function PanZoomCanvas({
  children, toolbarExtra, worldStyle,
}: {
  children: ReactNode
  toolbarExtra?: ReactNode
  worldStyle?: CSSProperties
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [tf, setTf] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const tfRef = useRef(tf)
  tfRef.current = tf

  // pointers activos (para pan de 1 dedo y pinch de 2)
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const panRef = useRef<{ startX: number; startY: number; startTfX: number; startTfY: number; moved: boolean } | null>(null)
  const pinchRef = useRef<{ dist: number; scale: number; cx: number; cy: number; tfX: number; tfY: number } | null>(null)

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

  const fit = useCallback(() => {
    const vp = viewportRef.current
    if (!vp) return
    const rect = vp.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const scale = clampScale(Math.min(rect.width / MUNDO_W, rect.height / MUNDO_H) * 0.95)
    setTf({
      x: (rect.width - MUNDO_W * scale) / 2,
      y: (rect.height - MUNDO_H * scale) / 2,
      scale,
    })
  }, [])

  useLayoutEffect(() => { fit() }, [fit])

  /** Zoom hacia un punto del viewport (coordenadas locales al viewport). */
  function zoomHacia(px: number, py: number, factor: number) {
    setTf(prev => {
      const scale = clampScale(prev.scale * factor)
      const k = scale / prev.scale
      return {
        scale,
        x: px - (px - prev.x) * k,
        y: py - (py - prev.y) * k,
      }
    })
  }

  function zoomBoton(factor: number) {
    const vp = viewportRef.current
    if (!vp) return
    const rect = vp.getBoundingClientRect()
    zoomHacia(rect.width / 2, rect.height / 2, factor)
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault()
    const vp = viewportRef.current
    if (!vp) return
    const rect = vp.getBoundingClientRect()
    const factor = Math.exp(-e.deltaY * 0.0015)
    zoomHacia(e.clientX - rect.left, e.clientY - rect.top, factor)
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Solo el fondo (los ítems hacen stopPropagation en su propio onPointerDown)
    const vp = viewportRef.current
    if (!vp) return
    vp.setPointerCapture(e.pointerId)
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointersRef.current.size === 1) {
      panRef.current = {
        startX: e.clientX, startY: e.clientY,
        startTfX: tfRef.current.x, startTfY: tfRef.current.y,
        moved: false,
      }
      pinchRef.current = null
    } else if (pointersRef.current.size === 2) {
      const [p1, p2] = [...pointersRef.current.values()]
      const rect = vp.getBoundingClientRect()
      pinchRef.current = {
        dist: Math.hypot(p2.x - p1.x, p2.y - p1.y),
        scale: tfRef.current.scale,
        cx: (p1.x + p2.x) / 2 - rect.left,
        cy: (p1.y + p2.y) / 2 - rect.top,
        tfX: tfRef.current.x,
        tfY: tfRef.current.y,
      }
      panRef.current = null
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    const pinch = pinchRef.current
    if (pinch && pointersRef.current.size >= 2) {
      const [p1, p2] = [...pointersRef.current.values()]
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      if (pinch.dist === 0) return
      const scale = clampScale(pinch.scale * (dist / pinch.dist))
      const k = scale / pinch.scale
      setTf({
        scale,
        x: pinch.cx - (pinch.cx - pinch.tfX) * k,
        y: pinch.cy - (pinch.cy - pinch.tfY) * k,
      })
      return
    }

    const pan = panRef.current
    if (!pan) return
    const dx = e.clientX - pan.startX
    const dy = e.clientY - pan.startY
    if (!pan.moved && Math.hypot(dx, dy) < PAN_THRESHOLD) return
    pan.moved = true
    setTf(prev => ({ ...prev, x: pan.startTfX + dx, y: pan.startTfY + dy }))
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
    if (pointersRef.current.size === 0) panRef.current = null
  }

  const btnStyle: CSSProperties = {
    width: 44, height: 44, borderRadius: 12,
    background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
  }

  return (
    <div
      ref={viewportRef}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden',
        background: 'var(--bg)', borderRadius: 14, border: '1px solid var(--border)',
        touchAction: 'none', cursor: 'grab',
      }}
    >
      <div
        data-canvas
        style={{
          position: 'absolute',
          width: MUNDO_W,
          height: MUNDO_H,
          transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.scale})`,
          transformOrigin: '0 0',
          willChange: 'transform',
          background: 'var(--surface)',
          backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          borderRadius: 8,
          boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
          ...worldStyle,
        }}
      >
        {children}
      </div>

      {/* Toolbar de zoom */}
      <div style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 10 }}>
        {toolbarExtra}
        <button onClick={() => zoomBoton(1.3)} aria-label="Acercar" style={btnStyle}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>add</span>
        </button>
        <button onClick={() => zoomBoton(1 / 1.3)} aria-label="Alejar" style={btnStyle}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>remove</span>
        </button>
        <button onClick={fit} aria-label="Ajustar a pantalla" style={btnStyle}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>fit_screen</span>
        </button>
      </div>
    </div>
  )
}
