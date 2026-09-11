import { describe, it, expect } from 'vitest'
import { semanasSeguidasConFactura } from './facturas'

const HOY = new Date('2026-09-11')

describe('semanasSeguidasConFactura', () => {
  it('sin facturas da 0', () => {
    expect(semanasSeguidasConFactura([], HOY)).toBe(0)
  })

  it('con carga en las 4 últimas semanas da 4', () => {
    const fechas = ['2026-09-10', '2026-09-03', '2026-08-27', '2026-08-20']
    expect(semanasSeguidasConFactura(fechas, HOY)).toBe(4)
  })

  it('caso real Bros 11/09: ~3 meses de carga casi diaria pero sin factura esta semana da 3, no 0', () => {
    // Última factura el 03/09 (8 días antes de "hoy") — la semana en curso
    // (04/09 al 11/09) queda vacía, pero las 3 anteriores tienen carga.
    const fechas = [
      '2026-09-03', '2026-08-31', '2026-08-29',
      '2026-08-27', '2026-08-26', '2026-08-25',
      '2026-08-20', '2026-08-19',
    ]
    expect(semanasSeguidasConFactura(fechas, HOY)).toBe(3)
  })

  it('hábito muerto hace más de un mes da 0, la ventana no mira para siempre', () => {
    const fechas = ['2026-06-15', '2026-06-01']
    expect(semanasSeguidasConFactura(fechas, HOY)).toBe(0)
  })

  it('un bache en el medio no tira todo a 0: cuenta las semanas presentes, salteando la vacía', () => {
    // 07/09 cae en la semana en curso; 24/08 dos semanas atrás. La semana
    // intermedia y la más vieja de las 4 quedan vacías — da 2, no 0 ni 4.
    const fechas = ['2026-09-07', '2026-08-24']
    expect(semanasSeguidasConFactura(fechas, HOY)).toBe(2)
  })

  it('una factura de hace más de 4 semanas no suma', () => {
    const fechas = ['2026-08-01']
    expect(semanasSeguidasConFactura(fechas, HOY)).toBe(0)
  })
})
