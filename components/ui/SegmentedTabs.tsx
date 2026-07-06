'use client'

// Tabs canónicos de KitchenOS.
// variant='onDark' (default) → pill blanco sobre navy (patrón OPS / Equipo / Carta).
// variant='onLight' → pill blanco card sobre fondo claro (patrón HACCP sub-tabs).
// Regla de oro: ninguna pantalla introduce tabs propios; usa este componente.

import { CSSProperties } from 'react'

export interface SegmentedTab<T extends string = string> {
  id: T
  label: string
  icon?: string
}

interface SegmentedTabsProps<T extends string> {
  tabs: SegmentedTab<T>[]
  active: T
  onChange: (id: T) => void
  variant?: 'onDark' | 'onLight'
  style?: CSSProperties
}

export function SegmentedTabs<T extends string>({
  tabs,
  active,
  onChange,
  variant = 'onDark',
  style,
}: SegmentedTabsProps<T>) {
  const isDark = variant === 'onDark'

  const wrapperStyle: CSSProperties = isDark
    ? {
        display: 'flex',
        gap: 6,
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 13,
        padding: 4,
      }
    : {
        display: 'flex',
        background: 'var(--bg)',
        borderRadius: 10,
        padding: 3,
      }

  const btnBase: CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'inherit',
    transition: 'all .15s',
    padding: '8px 8px',
  }

  function btnStyle(isActive: boolean): CSSProperties {
    if (isDark) {
      return {
        ...btnBase,
        borderRadius: 10,
        background: isActive ? '#fff' : 'transparent',
        color: isActive ? 'var(--navy)' : 'rgba(255,255,255,0.7)',
        boxShadow: isActive ? '0 1px 3px rgba(0,0,0,.15)' : 'none',
      }
    }
    return {
      ...btnBase,
      borderRadius: 8,
      background: isActive ? 'var(--surface)' : 'transparent',
      color: isActive ? 'var(--navy)' : 'var(--text-3)',
      boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
    }
  }

  return (
    <div style={{ ...wrapperStyle, ...style }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={btnStyle(t.id === active)}>
          {t.icon && (
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{t.icon}</span>
          )}
          {t.label}
        </button>
      ))}
    </div>
  )
}
