'use client'

import { useState, useRef } from 'react'

interface QuickAddProps {
  placeholder?: string
  onSave: (titulo: string, recetaId?: string) => Promise<void>
  autoFocus?: boolean
  recetas?: { id: string; nombre: string }[]
  /** Más marcado (fondo + borde de acento permanentes, botón más grande) —
   * solo para el "agregar preparación" de cabecera de columna en Producción.
   * El de "agregar sub-preparación" (dentro de un ítem expandido) se queda
   * discreto: si también resalta, la fila expandida queda sobrecargada. */
  prominent?: boolean
}

export function QuickAdd({
  placeholder = 'Agregar preparación...',
  onSave,
  autoFocus,
  recetas,
  prominent,
}: QuickAddProps) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingRecetaId, setPendingRecetaId] = useState<string | undefined>()
  const inputRef = useRef<HTMLInputElement>(null)

  const sugerencias = recetas && text.length >= 3
    ? recetas.filter(r => r.nombre.toLowerCase().includes(text.toLowerCase())).slice(0, 3)
    : []

  async function submit() {
    const t = text.trim()
    if (!t || saving) return
    setSaving(true)
    setText('')
    const rid = pendingRecetaId
    setPendingRecetaId(undefined)
    try {
      await onSave(t, rid)
    } finally {
      setSaving(false)
      inputRef.current?.focus()
    }
  }

  function handleSelectReceta(r: { id: string; nombre: string }) {
    setText(r.nombre)
    setPendingRecetaId(r.id)
    inputRef.current?.focus()
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {sugerencias.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 5 }}>
          {sugerencias.map(r => (
            <button
              key={r.id}
              onMouseDown={(e) => { e.preventDefault(); handleSelectReceta(r) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 99,
                background: 'rgba(67,97,160,.12)', border: '1px solid rgba(67,97,160,.25)',
                color: 'var(--accent)', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 11 }}>menu_book</span>
              {r.nombre}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => { setText(e.target.value); if (pendingRecetaId) setPendingRecetaId(undefined) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
          }}
          placeholder={placeholder}
          style={{
            flex: 1,
            background: pendingRecetaId ? 'rgba(67,97,160,.06)' : prominent ? 'rgba(67,97,160,.05)' : 'var(--bg)',
            border: `1.5px dashed ${pendingRecetaId ? 'var(--accent)' : prominent ? 'rgba(67,97,160,.4)' : 'var(--border)'}`,
            borderRadius: 10,
            padding: prominent ? '9px 10px' : '7px 10px',
            fontSize: 13,
            color: 'var(--text-1)',
            fontFamily: 'inherit',
            outline: 'none',
            transition: 'border-color .15s, background .15s',
          }}
        />
        <button
          onClick={submit}
          disabled={!text.trim() || saving}
          style={{
            flexShrink: 0,
            width: prominent ? 40 : 34,
            // Marcado a propósito (S — "se usa poco"): antes era gris hasta
            // tipear, y al pie de una columna larga pasaba desapercibido.
            background: text.trim() ? 'var(--navy)' : prominent ? 'var(--accent)' : 'var(--border)',
            border: 'none',
            borderRadius: 10,
            cursor: text.trim() ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: prominent && !text.trim() ? '0 2px 8px rgba(67,97,160,.35)' : 'none',
            transition: 'background .15s',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: prominent ? 19 : 16, color: '#fff' }}>
            {saving ? 'more_horiz' : 'add'}
          </span>
        </button>
      </div>
    </div>
  )
}
