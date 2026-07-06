'use client'

// Estado vacío canónico de KitchenOS.
// Icono Material + título + subtítulo opcional + CTA opcional.
// Regla de oro: ninguna pantalla introduce empty states propios; usa este componente.

import { CSSProperties } from 'react'

interface EmptyStateProps {
  icon: string
  title: string
  subtitle?: string
  cta?: {
    label: string
    onClick: () => void
  }
  style?: CSSProperties
}

export function EmptyState({ icon, title, subtitle, cta, style }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        gap: 0,
        ...style,
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: 52, color: 'var(--border)', marginBottom: 12 }}
      >
        {icon}
      </span>
      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{title}</p>
      {subtitle && (
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4, marginBottom: 0, lineHeight: 1.45 }}>
          {subtitle}
        </p>
      )}
      {cta && (
        <button
          onClick={cta.onClick}
          style={{
            marginTop: 16,
            padding: '8px 20px',
            borderRadius: 99,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: 'inherit',
            background: 'var(--navy)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {cta.label}
        </button>
      )}
    </div>
  )
}
