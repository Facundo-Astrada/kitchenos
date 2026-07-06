'use client'

// Chips de filtro canónicos de KitchenOS.
// context='onLight' (default) → activo navy sólido / inactivo var(--surface) con borde.
// context='onDark' → activo navy sólido / inactivo rgba(255,255,255,.08) (para headers oscuros).
// Scroll horizontal automático con fade en el borde derecho.
// Regla de oro: ninguna pantalla introduce chips propios; usa este componente.

import { useRef, useEffect, useState, CSSProperties } from 'react'

export interface FilterChip<T extends string = string> {
  value: T
  label: string
}

interface FilterChipsProps<T extends string> {
  chips: FilterChip<T>[]
  active: T
  onChange: (value: T) => void
  context?: 'onLight' | 'onDark'
  style?: CSSProperties
}

export function FilterChips<T extends string>({
  chips,
  active,
  onChange,
  context = 'onLight',
  style,
}: FilterChipsProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showFade, setShowFade] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => setShowFade(el.scrollWidth > el.clientWidth + 2)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [chips])

  const isDark = context === 'onDark'

  function chipStyle(isActive: boolean): CSSProperties {
    if (isActive) {
      return {
        flexShrink: 0,
        padding: '6px 14px',
        borderRadius: 99,
        fontSize: 13,
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: 'pointer',
        border: '1px solid var(--navy)',
        background: 'var(--navy)',
        color: '#fff',
        transition: 'all .15s',
      }
    }
    if (isDark) {
      return {
        flexShrink: 0,
        padding: '6px 14px',
        borderRadius: 99,
        fontSize: 13,
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: 'pointer',
        border: '1px solid rgba(255,255,255,.15)',
        background: 'rgba(255,255,255,.08)',
        color: 'rgba(255,255,255,.7)',
        transition: 'all .15s',
      }
    }
    return {
      flexShrink: 0,
      padding: '6px 14px',
      borderRadius: 99,
      fontSize: 13,
      fontWeight: 600,
      fontFamily: 'inherit',
      cursor: 'pointer',
      border: '1px solid var(--border)',
      background: 'var(--surface)',
      color: 'var(--text-2)',
      transition: 'all .15s',
    }
  }

  return (
    <div style={{ position: 'relative', ...style }}>
      <div
        ref={scrollRef}
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
      >
        {chips.map(c => (
          <button key={c.value} onClick={() => onChange(c.value)} style={chipStyle(c.value === active)}>
            {c.label}
          </button>
        ))}
      </div>
      {/* Fade derecho indica que hay más chips */}
      {showFade && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 32,
            pointerEvents: 'none',
            background: isDark
              ? 'linear-gradient(to left, var(--navy) 20%, transparent)'
              : 'linear-gradient(to left, var(--bg) 20%, transparent)',
          }}
        />
      )}
    </div>
  )
}
