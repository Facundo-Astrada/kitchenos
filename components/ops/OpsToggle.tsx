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
      {(['menu', 'carta'] as OpsModo[]).map((m) => {
        const active = value === m
        return (
          <button
            key={m}
            onClick={() => onChange(m)}
            style={{
              padding: '5px 16px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '.07em',
              fontFamily: 'inherit',
              background: active ? '#fff' : 'transparent',
              color: active ? 'var(--navy)' : 'rgba(255,255,255,.55)',
              transition: 'all .15s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {m === 'menu' ? 'Menú' : 'Carta'}
          </button>
        )
      })}
    </div>
  )
}
