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
      // dias_semana (array) es la fuente de verdad desde S6/Bloque 3 — una
      // tarea semanal puede tocar varios días ("campana lunes y jueves").
      // dia_semana (single) se mantiene por compatibilidad con OPS/sync y
      // como fallback para filas sin dias_semana cargado todavía.
      if (l.dias_semana && l.dias_semana.length > 0) {
        return l.dias_semana.includes(fecha.getDay())
      }
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
