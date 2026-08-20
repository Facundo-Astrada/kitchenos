'use client'

// Selector de responsables (0..N) de un área o de un área+capa. Puede haber
// más de una persona respondiendo por lo mismo — varios chefs, socios en
// Dirección — así que esto es un multi-toggle, no un <select> de una sola
// opción. El panel sale por portal (ver .claude/docs/ui.md "Overlay dentro
// de un contenedor que se pliega") porque se usa dentro de una tabla con
// scroll horizontal, que recortaría un dropdown position:absolute normal.

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Miembro } from '@/lib/hooks/useEquipo'

interface ResponsablesPickerProps {
  miembros: Miembro[]
  selected: string[]
  onToggle: (miembroId: string) => void
  isAdmin: boolean
  emptyLabel: string
  alert?: boolean
}

export function ResponsablesPicker({ miembros, selected, onToggle, isAdmin, emptyLabel, alert = false }: ResponsablesPickerProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocPointer(e: PointerEvent) {
      const target = e.target as Node
      if (btnRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointer)
    return () => document.removeEventListener('pointerdown', onDocPointer)
  }, [open])

  function toggleOpen() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.left, width: Math.max(190, r.width) })
    }
    setOpen(o => !o)
  }

  const nombres = selected.map(id => miembros.find(m => m.id === id)).filter((m): m is Miembro => !!m)
  const hayHueco = alert && nombres.length === 0
  const resumen = nombres.length === 0
    ? emptyLabel
    : nombres.length === 1
      ? `${nombres[0].nombre} ${nombres[0].apellido}`
      : `${nombres[0].nombre} ${nombres[0].apellido} +${nombres.length - 1}`

  const color = hayHueco ? 'var(--red)' : 'var(--text-1)'

  if (!isAdmin) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color, fontWeight: hayHueco ? 700 : 500, fontSize: 12.5 }}>
        {hayHueco && <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>}
        {resumen}
      </span>
    )
  }

  return (
    <>
      <button
        ref={btnRef} type="button" onClick={toggleOpen}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer',
          color, fontWeight: hayHueco ? 700 : 500, fontSize: 12.5, fontFamily: 'inherit', padding: 0, maxWidth: '100%',
        }}
      >
        {hayHueco && <span className="material-symbols-outlined" style={{ fontSize: 14, flexShrink: 0 }}>error</span>}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resumen}</span>
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-3)', flexShrink: 0 }}>expand_more</span>
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width, maxWidth: 260, maxHeight: 280,
            overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,.18)', zIndex: 2000, padding: 5,
          }}
        >
          {miembros.length === 0 && (
            <div style={{ padding: 8, fontSize: 12, color: 'var(--text-3)' }}>Sin miembros cargados</div>
          )}
          {miembros.map(m => {
            const active = selected.includes(m.id)
            return (
              <button
                key={m.id} type="button" onClick={() => onToggle(m.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 8px', borderRadius: 8,
                  border: 'none', background: active ? 'rgba(67,97,160,.1)' : 'transparent', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                  background: active ? 'var(--accent)' : 'transparent',
                  border: active ? 'none' : '2px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {active && <span className="material-symbols-outlined" style={{ fontSize: 11, color: '#fff' }}>check</span>}
                </div>
                <span style={{ fontSize: 12.5, color: 'var(--text-1)' }}>{m.nombre} {m.apellido}</span>
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </>
  )
}
