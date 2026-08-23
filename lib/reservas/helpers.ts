import { sumarDias } from '@/lib/ops/turnos'
import type { Reserva } from '@/types'

// Reservas que ya no representan carga real sobre la cocina/salón — no suman
// a "cubiertos" en el resumen del día ni de la semana.
const ESTADOS_SIN_CARGA = new Set(['cancelada', 'no_show'])

/** Lunes a domingo (ISO, 'YYYY-MM-DD') de la semana que contiene `fecha`. */
export function semanaDeFecha(fecha: string): string[] {
  const [y, m, d] = fecha.split('-').map(Number)
  // Mediodía UTC (mismo truco que sumarDias): evita que el cálculo del día
  // de la semana cruce un borde de DST/UTC y devuelva el día equivocado.
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() // 0=Dom..6=Sáb
  const offsetALunes = dow === 0 ? -6 : 1 - dow
  const lunes = sumarDias(fecha, offsetALunes)
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))
}

/** Suma de pax de reservas con carga real (excluye canceladas y no-shows). */
export function cubiertosVivos(reservas: Pick<Reserva, 'pax' | 'estado'>[]): number {
  return reservas.reduce((s, r) => s + (ESTADOS_SIN_CARGA.has(r.estado) ? 0 : r.pax), 0)
}
