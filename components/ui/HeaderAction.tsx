'use client'

// Botón de acción primaria canónico de KitchenOS para headers navy.
// Siempre va DENTRO del header (background: var(--navy)).
// Reemplaza FABs de acción por pantalla y barras flotantes.
// Regla de oro: ninguna pantalla crea un botón de crear propio; usa este componente.

import { CSSProperties } from 'react'

interface HeaderActionProps {
  label?: string
  icon?: string
  onClick: () => void
  style?: CSSProperties
  disabled?: boolean
}

export function HeaderAction({
  label = 'Nuevo',
  icon = 'add',
  onClick,
  style,
  disabled = false,
}: HeaderActionProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: 'rgba(255,255,255,0.18)',
        border: '1px solid rgba(255,255,255,.3)',
        borderRadius: 10,
        padding: '7px 14px',
        color: '#fff',
        fontWeight: 700,
        fontSize: 13,
        fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
        ...style,
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>
      {label}
    </button>
  )
}
