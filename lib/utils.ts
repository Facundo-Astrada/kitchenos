import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatPct(value: number): string {
  return `${value.toFixed(1)}%`
}

/** Calcula food cost % y margen dado costo total y precio de venta */
export function calcFoodCost(costoTotal: number, precioVenta: number) {
  const pct = precioVenta > 0 ? (costoTotal / precioVenta) * 100 : 0
  return {
    food_cost_pct: pct,
    margen_bruto: precioVenta - costoTotal,
  }
}

/** Retorna 'ok' | 'bajo' | 'critico' según stock */
export function getEstadoStock(
  actual: number,
  minimo: number,
  critico: number
): 'ok' | 'bajo' | 'critico' {
  if (actual <= critico) return 'critico'
  if (actual <= minimo) return 'bajo'
  return 'ok'
}

/** Formatea fecha ISO a dd/mm/yyyy */
export function formatFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR')
}

/** Iniciales de un nombre (máx 2 letras) */
export function getInitials(nombre: string): string {
  return nombre
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}
