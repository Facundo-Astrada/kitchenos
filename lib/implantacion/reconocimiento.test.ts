import { describe, it, expect } from 'vitest'
import { avanceSemanal, type FotoProgreso } from './reconocimiento'

const HOY = new Date('2026-09-11T12:00:00')
const foto = (fecha: string, insertadas: number, pct = insertadas * 3): FotoProgreso =>
  ({ fecha, insertadas, total: 31, pct })

describe('avanceSemanal', () => {
  it('sin fotos no hay avance', () => {
    expect(avanceSemanal([], HOY)).toBeNull()
  })

  // La regla que protege el canal entero: el día que se instala la app, todo el
  // progreso acumulado parecería de esta semana.
  it('con una sola foto devuelve null: no hay contra qué restar', () => {
    expect(avanceSemanal([foto('2026-09-11', 24)], HOY)).toBeNull()
  })

  it('sin ninguna foto de hace 7 días o más devuelve null', () => {
    const r = avanceSemanal([foto('2026-09-11', 24), foto('2026-09-09', 22)], HOY)
    expect(r).toBeNull()
  })

  it('resta contra la foto más reciente que ya tiene una semana', () => {
    const r = avanceSemanal([
      foto('2026-09-11', 24), foto('2026-09-08', 23),
      foto('2026-09-04', 20), foto('2026-08-28', 11),
    ], HOY)
    expect(r).not.toBeNull()
    expect(r!.desde.fecha).toBe('2026-09-04')
    expect(r!.insertadasEstaSemana).toBe(4)
  })

  it('la foto de exactamente hace 7 días sirve como referencia', () => {
    const r = avanceSemanal([foto('2026-09-11', 10), foto('2026-09-04', 7)], HOY)
    expect(r!.desde.fecha).toBe('2026-09-04')
    expect(r!.insertadasEstaSemana).toBe(3)
  })

  it('el pct que reporta es el de hoy, no el de la referencia', () => {
    const r = avanceSemanal([foto('2026-09-11', 24, 77), foto('2026-09-01', 20, 64)], HOY)
    expect(r!.pct).toBe(77)
  })

  it('no le importa el orden en que vengan las fotos', () => {
    const desordenadas = [foto('2026-09-01', 20), foto('2026-09-11', 24), foto('2026-09-03', 21)]
    const r = avanceSemanal(desordenadas, HOY)
    expect(r!.hasta.fecha).toBe('2026-09-11')
    // Referencia = 09-03, la MÁS RECIENTE que ya tiene una semana (corte 09-04),
    // no la más vieja que haya: 24 - 21 = 3.
    expect(r!.desde.fecha).toBe('2026-09-03')
    expect(r!.insertadasEstaSemana).toBe(3)
  })

  // Se puede desconfirmar un checkpoint manual o borrar datos.
  it('un retroceso no se reporta como avance negativo: se calla en 0', () => {
    const r = avanceSemanal([foto('2026-09-11', 18), foto('2026-09-01', 22)], HOY)
    expect(r!.insertadasEstaSemana).toBe(0)
  })

  it('una semana sin avance da 0 — el texto del aviso se encarga de no mandarlo', () => {
    const r = avanceSemanal([foto('2026-09-11', 24), foto('2026-09-02', 24)], HOY)
    expect(r!.insertadasEstaSemana).toBe(0)
  })

  it('si el equipo estuvo un mes sin abrir la app, compara contra la última foto que haya', () => {
    const r = avanceSemanal([foto('2026-09-11', 24), foto('2026-08-05', 12)], HOY)
    expect(r!.desde.fecha).toBe('2026-08-05')
    expect(r!.insertadasEstaSemana).toBe(12)
  })
})
