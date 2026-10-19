import { describe, it, expect } from 'vitest'
import { ocupantesDePuesto, puestosDeMiembro, puestoEstaCubierto } from './ocupantes'

const m = (id: string, puesto_id: string | null, puestos_extra: string[] = []) =>
  ({ id, puesto_id, puestos_extra })

describe('ocupantesDePuesto', () => {
  const miembros = [
    m('franco', 'direccion'),
    m('leon', 'polivalente', ['compras', 'mantenimiento']),
    m('zoe', 'compras'),
    m('sin', null),
  ]

  it('separa a los que lo tienen como principal de los que lo cubren también', () => {
    const r = ocupantesDePuesto('compras', miembros)
    expect(r.principales.map(x => x.id)).toEqual(['zoe'])
    expect(r.tambien.map(x => x.id)).toEqual(['leon'])
  })

  it('un puesto que solo cubre alguien como extra tiene ocupante "también" y ninguno principal', () => {
    const r = ocupantesDePuesto('mantenimiento', miembros)
    expect(r.principales).toEqual([])
    expect(r.tambien.map(x => x.id)).toEqual(['leon'])
  })

  it('puesto sin nadie', () => {
    expect(ocupantesDePuesto('nadie', miembros)).toEqual({ principales: [], tambien: [] })
  })

  it('no repite a una persona que tiene el mismo puesto como principal y en extras', () => {
    const r = ocupantesDePuesto('x', [m('a', 'x', ['x'])])
    expect(r.principales.map(i => i.id)).toEqual(['a'])
    expect(r.tambien).toEqual([])
  })

  it('tolera puestos_extra ausente (filas viejas o mocks)', () => {
    const r = ocupantesDePuesto('p', [{ id: 'a', puesto_id: 'p' }])
    expect(r.principales).toHaveLength(1)
    expect(r.tambien).toEqual([])
  })
})

describe('puestosDeMiembro', () => {
  it('principal primero, después los extra', () => {
    expect(puestosDeMiembro(m('leon', 'polivalente', ['compras', 'mantenimiento'])))
      .toEqual(['polivalente', 'compras', 'mantenimiento'])
  })

  it('sin principal devuelve solo los extra', () => {
    expect(puestosDeMiembro(m('a', null, ['compras']))).toEqual(['compras'])
  })

  it('sin nada, vacío; y sin duplicados', () => {
    expect(puestosDeMiembro(m('a', null))).toEqual([])
    expect(puestosDeMiembro(m('a', 'p', ['p', 'q', 'q']))).toEqual(['p', 'q'])
  })
})

describe('puestoEstaCubierto', () => {
  it('cubierto si alguien lo tiene como principal o como extra', () => {
    const miembros = [m('leon', 'polivalente', ['compras'])]
    expect(puestoEstaCubierto('polivalente', miembros)).toBe(true)
    expect(puestoEstaCubierto('compras', miembros)).toBe(true)
    expect(puestoEstaCubierto('salon', miembros)).toBe(false)
  })
})
