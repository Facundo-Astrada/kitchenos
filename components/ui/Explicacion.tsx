'use client'

// Tarjeta colapsable "¿Cómo se lee esto?" — Reportes y Presupuesto son plata
// y porcentajes sin contexto; esto es la explicación que hoy solo vive
// adentro del tour del Coach (se ve una vez, no vuelve). El contenido
// estático sale de lib/coach/explicaciones.ts — una sola fuente para acá y
// para el tour, así no divergen si cambia un cálculo (S6, Bloque 6).
// Regla de oro: ninguna pantalla arma su propia caja de ayuda; usa esta.

import { useState, type ReactNode } from 'react'

interface ExplicacionProps {
  /** Clave para recordar si esta explicación puntual ya se abrió (localStorage). */
  id: string
  queEs: string
  comoSeCalcula?: string
  /** Con números reales del restaurante — un ejemplo genérico se saltea, uno con la plata propia se lee. */
  ejemplo?: ReactNode
  queHacerSi?: string
}

export function Explicacion({ id, queEs, comoSeCalcula, ejemplo, queHacerSi }: ExplicacionProps) {
  const storageKey = `kc_explicacion_${id}`
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    try { return localStorage.getItem(storageKey) === '1' } catch { return false }
  })

  function toggle() {
    setOpen(v => {
      const next = !v
      try { localStorage.setItem(storageKey, next ? '1' : '0') } catch {}
      return next
    })
  }

  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', overflow: 'hidden' }}>
      <button
        onClick={toggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--accent)', flexShrink: 0 }}>help_outline</span>
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)' }}>¿Cómo se lee esto?</span>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 18, color: 'var(--text-3)', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }}
        >
          expand_more
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-1)' }}>{queEs}</p>
          {comoSeCalcula && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>
                Cómo se calcula
              </div>
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-2)', fontFamily: "'DM Mono', monospace" }}>{comoSeCalcula}</p>
            </div>
          )}
          {ejemplo && (
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '9px 11px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>
                Con tus números
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-1)' }}>{ejemplo}</div>
            </div>
          )}
          {queHacerSi && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>arrow_forward</span>
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-2)' }}>{queHacerSi}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
