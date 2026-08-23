import { describe, it, expect } from 'vitest'
import { semanaDeFecha, cubiertosVivos } from './helpers'
import type { Reserva } from '@/types'

function reserva(pax: number, estado: Reserva['estado']): Pick<Reserva, 'pax' | 'estado'> {
  return { pax, estado }
}

describe('semanaDeFecha', () => {
  it('un miércoles devuelve el lunes a domingo de esa semana', () => {
    // 2026-08-19 es un miércoles
    expect(semanaDeFecha('2026-08-19')).toEqual([
      '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20',
      '2026-08-21', '2026-08-22', '2026-08-23',
    ])
  })

  it('el propio lunes es el primer día devuelto', () => {
    expect(semanaDeFecha('2026-08-17')[0]).toBe('2026-08-17')
  })

  it('un domingo pertenece a la semana que termina ese día, no a la siguiente', () => {
    expect(semanaDeFecha('2026-08-23')).toEqual([
      '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20',
      '2026-08-21', '2026-08-22', '2026-08-23',
    ])
  })

  it('cruza de mes correctamente', () => {
    // 2026-09-01 es un martes
    expect(semanaDeFecha('2026-09-01')).toEqual([
      '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03',
      '2026-09-04', '2026-09-05', '2026-09-06',
    ])
  })

  it('cruza de año correctamente', () => {
    // 2026-12-31 es un jueves
    expect(semanaDeFecha('2026-12-31')).toEqual([
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31',
      '2027-01-01', '2027-01-02', '2027-01-03',
    ])
  })
})

describe('cubiertosVivos', () => {
  it('suma pax de reservas activas', () => {
    expect(cubiertosVivos([reserva(2, 'pendiente'), reserva(4, 'confirmada')])).toBe(6)
  })

  it('excluye canceladas y no-shows', () => {
    expect(cubiertosVivos([
      reserva(2, 'pendiente'),
      reserva(5, 'cancelada'),
      reserva(3, 'no_show'),
      reserva(4, 'sentada'),
    ])).toBe(6)
  })

  it('lista vacía da 0', () => {
    expect(cubiertosVivos([])).toBe(0)
  })
})
