'use client'

// Avatar canónico de KitchenOS con color determinístico por hash del nombre.
// Paleta fija de 6 colores derivados de la identidad navy/accent.
// Regla de oro: ninguna pantalla crea avatares propios; usa este componente.

import { CSSProperties } from 'react'

// Paleta de 6 colores derivados de la identidad KitchenOS
const AVATAR_PALETTE = [
  '#4361a0', // accent navy
  '#10b981', // green
  '#f97316', // orange
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#0ea5e9', // blue
]

function hashName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0
  }
  return h
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getColor(name: string): string {
  return AVATAR_PALETTE[hashName(name) % AVATAR_PALETTE.length]
}

interface AvatarProps {
  name: string
  size?: number
  style?: CSSProperties
  className?: string
}

export function Avatar({ name, size = 40, style, className }: AvatarProps) {
  const color = getColor(name)
  const initials = getInitials(name)

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: '#fff',
        fontSize: Math.round(size * 0.38),
        fontWeight: 700,
        letterSpacing: '0.01em',
        userSelect: 'none',
        ...style,
      }}
    >
      {initials}
    </div>
  )
}
