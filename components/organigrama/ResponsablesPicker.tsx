'use client'

// Selector de responsables (0..N) de un área o de un área+capa. Puede haber
// más de una persona respondiendo por lo mismo — varios chefs, socios en
// Dirección — así que esto es un multi-toggle, no un <select> de una sola
// opción. Todos los titulares llevan lo mismo, sin jerarquía. Donde se lo pasa
// (Cobertura), cada persona además se puede marcar como suplente: cubre si falta
// un titular, y la app sugiere a quien Polivalencia ya mide como autónomo.
// El panel sale por portal (ver .claude/docs/ui.md "Overlay dentro
// de un contenedor que se pliega") porque se usa dentro de una tabla con
// scroll horizontal, que recortaría un dropdown position:absolute normal.

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Miembro } from '@/lib/hooks/useEquipo'

interface ResponsablesPickerProps {
  miembros: Miembro[]
  /** Titulares. */
  selected: string[]
  onToggle: (miembroId: string) => void
  /** Suplentes confirmados. Sin esto el selector solo maneja titulares. */
  suplentes?: string[]
  onToggleSuplente?: (miembroId: string) => void
  /** Ids que Polivalencia sugiere como suplentes (autónomos en las plazas del área). */
  sugeridos?: string[]
  isAdmin: boolean
  emptyLabel: string
  alert?: boolean
}

export function ResponsablesPicker({
  miembros, selected, onToggle, suplentes = [], onToggleSuplente, sugeridos = [], isAdmin, emptyLabel, alert = false,
}: ResponsablesPickerProps) {
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
  const cantSuplentes = suplentes.filter(id => miembros.some(m => m.id === id)).length

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
        {cantSuplentes > 0 && (
          <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 500, flexShrink: 0 }}>· {cantSuplentes} sup.</span>
        )}
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-3)', flexShrink: 0 }}>expand_more</span>
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width, maxWidth: 340, maxHeight: 320,
            overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,.18)', zIndex: 2000, padding: 5,
          }}
        >
          {onToggleSuplente && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px 6px', fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
              <span>Lo llevan</span>
              <span>Suplente</span>
            </div>
          )}
          {miembros.length === 0 && (
            <div style={{ padding: 8, fontSize: 12, color: 'var(--text-3)' }}>Sin miembros cargados</div>
          )}
          {miembros.map(m => {
            const active = selected.includes(m.id)
            const esSuplente = suplentes.includes(m.id)
            const sugerido = !active && !esSuplente && sugeridos.includes(m.id)
            return (
              <div
                key={m.id}
                style={{ display: 'flex', alignItems: 'center', gap: 4, borderRadius: 8, background: active ? 'rgba(67,97,160,.1)' : 'transparent' }}
              >
                <button
                  type="button" onClick={() => onToggle(m.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, padding: '7px 8px', borderRadius: 8,
                    border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left',
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
                  <span style={{ fontSize: 12.5, color: 'var(--text-1)', minWidth: 0 }}>{m.nombre} {m.apellido}</span>
                </button>
                {onToggleSuplente && (
                  <button
                    type="button" onClick={() => onToggleSuplente(m.id)}
                    title={sugerido ? 'Polivalencia lo mide como autónomo en las plazas de esta área' : undefined}
                    style={{
                      fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, marginRight: 6, cursor: 'pointer', whiteSpace: 'nowrap',
                      border: esSuplente ? 'none' : `1px ${sugerido ? 'solid' : 'dashed'} ${sugerido ? 'var(--accent)' : 'var(--border)'}`,
                      background: esSuplente ? 'var(--accent)' : 'transparent',
                      color: esSuplente ? '#fff' : sugerido ? 'var(--accent)' : 'var(--text-3)',
                    }}
                  >
                    {esSuplente ? 'Suplente' : sugerido ? 'Sugerido' : '+ Suplente'}
                  </button>
                )}
              </div>
            )
          })}
        </div>,
        document.body
      )}
    </>
  )
}
