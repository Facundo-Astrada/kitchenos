'use client'

import { useEffect, useRef, useState } from 'react'

export interface FiltroOpcion {
  value: string
  label: string
  count?: number
}

interface Props {
  label: string          // "Categorías", "Proveedor"
  icon: string           // material symbol
  opciones: FiltroOpcion[]
  seleccionadas: string[]
  onChange: (vals: string[]) => void
}

/**
 * Dropdown de filtro multi-selección para el header navy del stock.
 * Botón compacto que muestra el conteo; popover con checkboxes.
 */
export default function MultiSelectFiltro({ label, icon, opciones, seleccionadas, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const n = seleccionadas.length
  const toggle = (v: string) => {
    onChange(seleccionadas.includes(v) ? seleccionadas.filter(x => x !== v) : [...seleccionadas, v])
  }

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          height: 32, display: 'flex', alignItems: 'center', gap: 5, padding: '0 10px',
          background: n > 0 ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.1)',
          border: '1px solid rgba(255,255,255,.15)', borderRadius: 8,
          fontSize: 11, fontFamily: 'inherit', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'rgba(255,255,255,.6)' }}>{icon}</span>
        <span style={{ fontWeight: 600 }}>{label}{n > 0 ? ` (${n})` : ''}</span>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'rgba(255,255,255,.5)' }}>{open ? 'expand_less' : 'expand_more'}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 60,
            width: 230, maxHeight: 320, display: 'flex', flexDirection: 'column',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
            boxShadow: '0 8px 28px rgba(0,0,0,.28)', overflow: 'hidden',
          }}
        >
          {/* Header del popover */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-3)' }}>{label}</span>
            {n > 0 && (
              <button onClick={() => onChange([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>
                Limpiar
              </button>
            )}
          </div>

          {/* Lista de opciones */}
          <div style={{ overflowY: 'auto', flex: 1, padding: 4 }}>
            {opciones.length === 0 && (
              <div style={{ padding: '16px 12px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>Sin opciones</div>
            )}
            {opciones.map(op => {
              const checked = seleccionadas.includes(op.value)
              return (
                <button
                  key={op.value}
                  onClick={() => toggle(op.value)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px',
                    background: checked ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'none',
                    border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  }}
                >
                  <span style={{
                    width: 17, height: 17, borderRadius: 5, flexShrink: 0,
                    border: `2px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                    background: checked ? 'var(--accent)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {checked && <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#fff', fontWeight: 700 }}>check</span>}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{op.label}</span>
                  {op.count != null && <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{op.count}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
