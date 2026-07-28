import type { HaccpLimpieza } from '@/lib/hooks/useHaccp'

// ¿Esta limpieza recurrente toca en la fecha dada? Mismo criterio usado en
// HACCP (calendario), Mise (checklist_rutina, vía plaza) y el recuadro
// Limpieza de OPS Producción (sin filtrar por plaza) — una sola fuente de
// verdad para no divergir entre las tres pantallas.
export function limpiezaTocaFecha(l: HaccpLimpieza, fecha: Date): boolean {
  switch (l.frecuencia) {
    case 'cada_turno':
    case 'diaria':
      return true
    case 'semanal': {
      const dia = l.dia_semana ?? new Date(l.created_at).getDay()
      return fecha.getDay() === dia
    }
    case 'mensual': {
      const dia = l.dia_mes ?? new Date(l.created_at).getDate()
      return fecha.getDate() === dia
    }
    default:
      return false
  }
}
