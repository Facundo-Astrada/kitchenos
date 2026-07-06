'use client'

// Número tabular canónico de KitchenOS.
// Aplica font-variant-numeric: tabular-nums para alinear cifras en columnas.
// Usar en: precios, cantidades de stock, contadores, KPIs alineados.
// Regla de oro: ninguna pantalla aplica fuente monoespaciada directamente; usa este componente.

import { CSSProperties, ReactNode } from 'react'

interface NumProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

export function Num({ children, className, style }: NumProps) {
  return (
    <span
      className={className}
      style={{ fontVariantNumeric: 'tabular-nums', ...style }}
    >
      {children}
    </span>
  )
}
