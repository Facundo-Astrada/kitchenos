'use client'

// PrioridadPicker — reemplaza el badge que ciclaba prioridad con cada tap
// (SP→P→REF→...). Ese gesto era 1 salto de grupo por tap sin control fino:
// pasar de SP a REF eran 2 taps y el ítem se movía de golpe entre uno y otro,
// así que el dedo terminaba tocando donde ya no estaba el botón.
//
// Gesto nuevo: mantener apretado abre, pegada al botón, una columna vertical
// con las opciones — deslizar el dedo resalta la opción bajo él, soltar
// aplica. Un tap sin arrastre dejar el menú abierto (modo "sticky"): se elige
// tocando una opción o se cierra tocando afuera / Escape (DESIGN.md §10:
// ningún gesto es la única vía).
//
// Position capture (setPointerCapture) en el trigger: mientras se arrastra,
// TODOS los pointermove/pointerup de ese dedo llegan al trigger aunque pase
// por encima de las opciones — evita que además disparen su propio click al
// soltar (doble commit) y evita pointerenter/over espurios en el popover.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { tap } from '@/lib/ui/motion'
import { opcionDesdeY, posicionPopover, type RectV } from '@/lib/ui/picker'

export interface PrioOpcion<T extends string> {
  value: T
  label: string
  color: string
  bg: string
}

interface PrioridadPickerProps<T extends string> {
  value: T
  /** Cómo se pinta el trigger para `value` — separado de `opciones` porque el
   *  valor actual puede no ser elegible (ej. Modo Control: un ítem 'chk' se
   *  ve verde/OK pero el picker solo ofrece sp/p/ref). */
  display: { label: string; color: string; bg: string }
  opciones: PrioOpcion<T>[]
  onChange: (v: T) => void
  disabled?: boolean
  variant: 'chip' | 'circle'
  title?: string
}

const OPTION_H = 44
const OPTION_GAP = 3
const PAD = 5
const MOVE_THRESHOLD = 8

type Mode = 'closed' | 'dragging' | 'sticky'

export function PrioridadPicker<T extends string>({
  value, display, opciones, onChange, disabled, variant, title,
}: PrioridadPickerProps<T>) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<Mode>('closed')
  const [anchor, setAnchor] = useState<{ top: number; bottom: number; left: number; right: number } | null>(null)
  const [highlightIdx, setHighlightIdx] = useState<number | null>(null)
  const startYRef = useRef(0)
  const movedRef = useRef(false)

  const anchoPopover = variant === 'circle' ? 56 : 74
  const altoPopover = opciones.length * OPTION_H + Math.max(0, opciones.length - 1) * OPTION_GAP + PAD * 2

  const popoverPos = anchor && typeof window !== 'undefined'
    ? posicionPopover(anchor, altoPopover, anchoPopover, window.innerWidth, window.innerHeight)
    : null

  const rects: RectV[] = popoverPos
    ? opciones.map((_, i) => {
        const top = popoverPos.top + PAD + i * (OPTION_H + OPTION_GAP)
        return { top, bottom: top + OPTION_H }
      })
    : []

  function elegir(idx: number) {
    const opt = opciones[idx]
    if (opt && opt.value !== value) { onChange(opt.value); tap(30) }
    setMode('closed')
  }

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (disabled) return
    const rect = triggerRef.current!.getBoundingClientRect()
    setAnchor(rect)
    const idx = opciones.findIndex(o => o.value === value)
    setHighlightIdx(idx === -1 ? 0 : idx)
    startYRef.current = e.clientY
    movedRef.current = false
    setMode('dragging')
    tap(10)
    try { triggerRef.current?.setPointerCapture(e.pointerId) } catch { /* no soportado, seguimos igual */ }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (mode !== 'dragging') return
    if (Math.abs(e.clientY - startYRef.current) > MOVE_THRESHOLD) movedRef.current = true
    const idx = opcionDesdeY(e.clientY, rects)
    if (idx !== null) {
      setHighlightIdx(prev => {
        if (prev !== idx) tap(10)
        return idx
      })
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (mode !== 'dragging') return
    e.stopPropagation()
    try { triggerRef.current?.releasePointerCapture(e.pointerId) } catch { /* ya liberado */ }
    if (movedRef.current) {
      if (highlightIdx !== null) elegir(highlightIdx)
      else setMode('closed')
    } else {
      // Tap sin arrastre: queda abierto, se elige tocando una opción.
      setMode('sticky')
    }
  }

  function handlePointerCancel() {
    setMode('closed')
  }

  function handleKeyDownTrigger(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const rect = triggerRef.current!.getBoundingClientRect()
      setAnchor(rect)
      const idx = opciones.findIndex(o => o.value === value)
      setHighlightIdx(idx === -1 ? 0 : idx)
      setMode('sticky')
    }
  }

  // Cerrar al tocar afuera o con Escape — solo en modo sticky (el drag ya se
  // resuelve solo al soltar el dedo). Capture-phase: corre antes de que el
  // click del propio tap que abrió el sticky llegue a dispararse de nuevo.
  useEffect(() => {
    if (mode !== 'sticky') return
    function onPointerDownOutside(e: PointerEvent) {
      const t = e.target as Node
      if (popoverRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setMode('closed')
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { setMode('closed'); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(opciones.length - 1, (i ?? -1) + 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(0, (i ?? 1) - 1)); return }
      if (e.key === 'Enter' && highlightIdx !== null) elegir(highlightIdx)
    }
    window.addEventListener('pointerdown', onPointerDownOutside, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDownOutside, true)
      window.removeEventListener('keydown', onKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, highlightIdx])

  const open = mode !== 'closed'

  const triggerStyle: React.CSSProperties = variant === 'chip'
    ? {
        display: 'inline-flex', alignItems: 'center', gap: 2,
        fontSize: 10, fontWeight: 800, padding: '3px 8px',
        borderRadius: 6, marginTop: 3, marginLeft: 3,
        background: display.bg, color: display.color,
        border: `1px solid ${display.color}40`, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
        touchAction: 'none', WebkitTapHighlightColor: 'transparent',
        opacity: disabled ? 0.6 : 1,
      }
    : {
        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
        fontSize: 10, fontWeight: 800, transition: 'all .15s',
        WebkitTapHighlightColor: 'transparent', touchAction: 'none',
        background: disabled ? 'var(--bg)' : display.bg,
        border: disabled ? '1px solid var(--border)' : `1.5px solid ${display.color}`,
        color: disabled ? 'var(--text-3)' : display.color,
        cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', padding: 0,
      }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title={title}
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleKeyDownTrigger}
        onClick={e => e.stopPropagation()}
        style={triggerStyle}
      >
        {variant === 'chip' ? (
          <>
            {display.label}
            <span className="material-symbols-outlined" style={{ fontSize: 11, opacity: .7 }}>sync_alt</span>
          </>
        ) : display.label}
      </button>

      {open && popoverPos && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', left: popoverPos.left, top: popoverPos.top,
            width: anchoPopover, padding: PAD, borderRadius: 12,
            background: 'var(--surface)', boxShadow: 'var(--shadow-3)',
            border: '1px solid var(--border)', zIndex: 2200,
            display: 'flex', flexDirection: 'column', gap: OPTION_GAP,
          }}
        >
          {opciones.map((opt, i) => {
            const activa = highlightIdx === i
            return (
              <div
                key={opt.value}
                onClick={() => elegir(i)}
                style={{
                  height: OPTION_H, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, cursor: 'pointer', userSelect: 'none',
                  background: activa ? opt.bg : 'transparent',
                  color: opt.color,
                  border: activa ? `1.5px solid ${opt.color}` : '1.5px solid transparent',
                  transition: mode === 'dragging' ? 'none' : 'background .1s, border-color .1s',
                }}
              >
                {opt.label}
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
