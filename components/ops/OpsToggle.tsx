'use client'

import type { OpsModo } from '@/types'

interface OpsToggleProps {
  value: OpsModo
  onChange: (m: OpsModo) => void
}

export function OpsToggle({ value, onChange }: OpsToggleProps) {
  return (
    <div style={{
      display: 'flex',
      background: 'rgba(255,255,255,.12)',
      borderRadius: 999,
      padding: 2,
      gap: 0,
    }}>
      {(['menu', 'carta', 'evento'] as OpsModo[]).map((m) => {
        const active = value === m
        return (
          <button
            key={m}
            onClick={() => onChange(m)}
            style={{
              padding: '4px 14px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              background: active ? '#fff' : 'transparent',
              color: active ? 'var(--navy)' : 'rgba(255,255,255,.55)',
              transition: 'all .15s',
              WebkitTapHighlightColor: 'transparent',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>
              {m === 'menu' ? 'Menú' : m === 'evento' ? 'Evento' : 'Carta'}
            </span>
            {active && (
              <span style={{ fontSize: 8, fontWeight: 600, opacity: 0.5, letterSpacing: '.04em', lineHeight: 1.3 }}>
                {m === 'carta' ? 'Por prioridad' : 'Por categoría'}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
