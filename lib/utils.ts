import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Slug ascii en minúsculas, sin diacríticos — usado como key estable (plaza custom, turno de servicio, etc). */
export function slugify(s: string, fallback = 'item'): string {
  const sinDiacriticos = s.normalize('NFD').split('').filter(ch => {
    const code = ch.codePointAt(0)!
    return code < 0x300 || code > 0x36f
  }).join('')
  return sinDiacriticos.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback
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

// ── Cuentas por pagar (M1, jul 2026) ─────────────────────────
export type UrgenciaVencimiento = 'vencida' | 'esta_semana' | 'proximamente' | 'sin_fecha'

export interface VencimientoFactura {
  fecha: string | null          // ISO date del vencimiento, null = sin plazo fijo
  diasRestantes: number | null  // negativo = vencida; null si sin_fecha
  urgencia: UrgenciaVencimiento
}

/**
 * Vencimiento de pago de una factura a crédito. Prioridad:
 * 1. `fecha_vencimiento` real (columna cargada a mano o por importador) — la fuente
 *    de verdad cuando existe.
 * 2. Inferido: `30dias`/`60dias` cuentan desde `fecha_factura`.
 * `cuenta_corriente` sin `fecha_vencimiento` no tiene plazo fijo (se salda al
 * arreglo con el proveedor) → `sin_fecha`, no se le inventa una fecha.
 * `contado`/`pagada` no aplican acá (no deberían llegar a esta función).
 */
export function calcularVencimientoFactura(f: { fecha_factura: string; condicion_pago?: string | null; fecha_vencimiento?: string | null }): VencimientoFactura {
  let fechaVenc: string | null = f.fecha_vencimiento ?? null
  if (!fechaVenc) {
    const dias = f.condicion_pago === '30dias' ? 30 : f.condicion_pago === '60dias' ? 60 : null
    if (dias === null) return { fecha: null, diasRestantes: null, urgencia: 'sin_fecha' }
    const venc = new Date(f.fecha_factura + 'T12:00:00')
    venc.setDate(venc.getDate() + dias)
    fechaVenc = venc.toISOString().slice(0, 10)
  }

  const venc = new Date(fechaVenc + 'T12:00:00')
  const hoy = new Date()
  hoy.setHours(12, 0, 0, 0)
  const diasRestantes = Math.round((venc.getTime() - hoy.getTime()) / 86400000)
  const urgencia: UrgenciaVencimiento = diasRestantes < 0 ? 'vencida' : diasRestantes <= 7 ? 'esta_semana' : 'proximamente'
  return { fecha: fechaVenc, diasRestantes, urgencia }
}
