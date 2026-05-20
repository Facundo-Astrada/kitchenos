'use client'

import { useState, useRef } from 'react'

interface QuickAddProps {
  placeholder?: string
  onSave: (titulo: string) => Promise<void>
  autoFocus?: boolean
}

export function QuickAdd({ placeholder = 'Agregar preparación...', onSave, autoFocus }: QuickAddProps) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function submit() {
    const t = text.trim()
    if (!t || saving) return
    setSaving(true)
    setText('')
    try {
      await onSave(t)
    } finally {
      setSaving(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6, padding: '4px 0' }}>
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
        }}
        placeholder={placeholder}
        style={{
          flex: 1,
          background: 'var(--bg)',
          border: '1px dashed var(--border)',
          borderRadius: 10,
          padding: '7px 10px',
          fontSize: 13,
          color: 'var(--text-1)',
          fontFamily: 'inherit',
          outline: 'none',
        }}
      />
      <button
        onClick={submit}
        disabled={!text.trim() || saving}
        style={{
          flexShrink: 0,
          width: 34,
          background: text.trim() ? 'var(--navy)' : 'var(--border)',
          border: 'none',
          borderRadius: 10,
          cursor: text.trim() ? 'pointer' : 'default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background .15s',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>
          {saving ? 'more_horiz' : 'add'}
        </span>
      </button>
    </div>
  )
}
