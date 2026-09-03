'use client'

/**
 * La marca única de "esto lo hace la IA".
 *
 * Antes cada pantalla dibujaba lo suyo: el ícono `auto_awesome` aparecía en 12
 * archivos con tres colores distintos (`var(--accent)`, `#4361a0` escrito a
 * mano, y un violeta `#8b5cf6` que no es token de nada). El panel de import
 * del Recetario encima lo envolvía en un degradé navy→violeta, que DESIGN.md
 * §10 prohíbe por nombre. Doce features de IA que el cliente no leía como una
 * sola capacidad, sino como botones sueltos.
 *
 * Decisión: la IA no estrena color. Es `--accent`, el acento interactivo, más
 * el ícono `auto_awesome`. Los tintes salen de `color-mix` sobre el token —
 * DESIGN.md §3: ningún hex suelto en componentes.
 */

import { CSSProperties, ReactNode } from 'react'

/** Tinte del acento, sin hex suelto (DESIGN.md §3). */
export const iaTinte = (pct: number) => `color-mix(in srgb, var(--accent) ${pct}%, transparent)`

interface IAIconProps {
  size?: number
  style?: CSSProperties
}

/** El ícono, siempre el mismo y siempre del mismo color. */
export function IAIcon({ size = 16, style }: IAIconProps) {
  return (
    <span
      className="material-symbols-outlined"
      aria-hidden="true"
      style={{ fontSize: size, color: 'var(--accent)', ...style }}
    >
      auto_awesome
    </span>
  )
}

interface IAButtonProps {
  label: string
  onClick: () => void
  /** `solid` para la acción principal de una pantalla; `soft` para una oferta. */
  variant?: 'solid' | 'soft'
  disabled?: boolean
  full?: boolean
  style?: CSSProperties
}

/** CTA que se lee como acción de IA. Un solo lugar donde cambiarle el look. */
export function IAButton({ label, onClick, variant = 'soft', disabled, full, style }: IAButtonProps) {
  const solid = variant === 'solid'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        // 44px: mínimo táctil de pantalla de gestión (DESIGN.md §7). El
        // Recetario es Registro Preparación, no superficie de servicio.
        minHeight: 44,
        padding: '10px 18px',
        borderRadius: 99,
        border: solid ? 'none' : `1px solid ${iaTinte(28)}`,
        background: solid ? 'var(--accent)' : iaTinte(10),
        color: solid ? '#fff' : 'var(--accent)',
        fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        width: full ? '100%' : undefined,
        ...style,
      }}
    >
      <IAIcon size={16} style={solid ? { color: '#fff' } : undefined} />
      {label}
    </button>
  )
}

interface IAPanelProps {
  title: string
  hint?: string
  children: ReactNode
  style?: CSSProperties
}

/**
 * Contenedor de un bloque de IA. Reemplaza al degradé violeta del Recetario
 * por una superficie de acento plana.
 */
export function IAPanel({ title, hint, children, style }: IAPanelProps) {
  return (
    <div style={{
      background: iaTinte(6),
      border: `1px solid ${iaTinte(16)}`,
      borderRadius: 16,
      padding: '14px 12px',
      ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <IAIcon size={18} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{title}</span>
        {hint && <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}
