import { describe, it, expect } from 'vitest'
import { categoriaEs, agregarVentasPorPersona, getObjetivosEfectivos } from './ventasPorPersona'

describe('categoriaEs', () => {
  it('matchea postre sin importar mayúsculas', () => {
    expect(categoriaEs('Postres', 'postre')).toBe(true)
    expect(categoriaEs('postres', 'postre')).toBe(true)
  })

  it('matchea café con o sin acento, o "Cafetería"', () => {
    expect(categoriaEs('Café', 'cafe')).toBe(true)
    expect(categoriaEs('Cafetería', 'cafe')).toBe(true)
    expect(categoriaEs('Cafeteria', 'cafe')).toBe(true)
  })

  it('categorías que no matchean, o null, dan false', () => {
    expect(categoriaEs('Principales', 'postre')).toBe(false)
    expect(categoriaEs('Bebidas', 'cafe')).toBe(false)
    expect(categoriaEs(null, 'postre')).toBe(false)
    expect(categoriaEs(undefined, 'cafe')).toBe(false)
  })
})

describe('agregarVentasPorPersona', () => {
  it('agrupa por mozo_id: cantidad, ventas y ticket promedio', () => {
    const cuentas = [
      { id: 'c1', mozo_id: 'mozo-a', total: 10000 },
      { id: 'c2', mozo_id: 'mozo-a', total: 20000 },
      { id: 'c3', mozo_id: 'mozo-b', total: 5000 },
    ]
    const out = agregarVentasPorPersona(cuentas, new Map())
    expect(out.get('mozo-a')).toMatchObject({ cantidad: 2, ventas: 30000, ticket_promedio: 15000 })
    expect(out.get('mozo-b')).toMatchObject({ cantidad: 1, ventas: 5000, ticket_promedio: 5000 })
  })

  it('cuentas sin mozo asignado se agrupan bajo "—"', () => {
    const cuentas = [{ id: 'c1', mozo_id: null, total: 1000 }]
    const out = agregarVentasPorPersona(cuentas, new Map())
    expect(out.get('—')).toMatchObject({ cantidad: 1, ventas: 1000 })
  })

  it('calcula % de cuentas con postre y con café cruzando categoriasPorCuenta', () => {
    const cuentas = [
      { id: 'c1', mozo_id: 'mozo-a', total: 10000 },
      { id: 'c2', mozo_id: 'mozo-a', total: 10000 },
      { id: 'c3', mozo_id: 'mozo-a', total: 10000 },
      { id: 'c4', mozo_id: 'mozo-a', total: 10000 },
    ]
    const categoriasPorCuenta = new Map([
      ['c1', ['Principales', 'Postres']],
      ['c2', ['Principales', 'Cafetería']],
      ['c3', ['Principales']],
      ['c4', ['Principales']],
    ])
    const out = agregarVentasPorPersona(cuentas, categoriasPorCuenta)
    const stats = out.get('mozo-a')!
    expect(stats.pct_postre).toBe(25) // 1 de 4
    expect(stats.pct_cafe).toBe(25)   // 1 de 4
  })

  it('sin cuentas para un mozo en categoriasPorCuenta: 0%, no NaN', () => {
    const cuentas = [{ id: 'c1', mozo_id: 'mozo-a', total: 10000 }]
    const out = agregarVentasPorPersona(cuentas, new Map())
    const stats = out.get('mozo-a')!
    expect(stats.pct_postre).toBe(0)
    expect(stats.pct_cafe).toBe(0)
  })

  it('sin cuentas: mapa vacío', () => {
    expect(agregarVentasPorPersona([], new Map()).size).toBe(0)
  })
})

describe('getObjetivosEfectivos', () => {
  it('sin override: usa los del puesto tal cual', () => {
    const puesto = { pct_comandas_con_postre: 25, ticket_promedio: 12000 }
    expect(getObjetivosEfectivos(puesto, undefined)).toEqual(puesto)
  })

  it('el override de la persona pisa clave por clave, no reemplaza todo el objeto', () => {
    const puesto = { pct_comandas_con_postre: 25, pct_comandas_con_cafe: 25, ticket_promedio: 12000 }
    const miembro = { ticket_promedio: 15000 } // esta persona vende más caro, el resto queda igual
    expect(getObjetivosEfectivos(puesto, miembro)).toEqual({
      pct_comandas_con_postre: 25, pct_comandas_con_cafe: 25, ticket_promedio: 15000,
    })
  })

  it('sin puesto ni override: objeto vacío', () => {
    expect(getObjetivosEfectivos(null, null)).toEqual({})
  })
})
