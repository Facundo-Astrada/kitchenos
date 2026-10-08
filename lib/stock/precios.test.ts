import { describe, it, expect } from 'vitest'
import { aUnidadDelProducto } from './precios'

describe('aUnidadDelProducto — la factura se lleva a la unidad del producto', () => {
  it('factura en kg, producto en g: convierte cantidad y precio', () => {
    const r = aUnidadDelProducto({ cantidad: 2, unidad: 'kg', precio_unitario: 8000 }, { unidad: 'g' })
    expect(r?.cantidad).toBeCloseTo(2000)
    expect(r?.precio).toBeCloseTo(8)
  })

  it('factura en g, producto en kg', () => {
    const r = aUnidadDelProducto({ cantidad: 500, unidad: 'g', precio_unitario: 8 }, { unidad: 'kg' })
    expect(r?.cantidad).toBeCloseTo(0.5)
    expect(r?.precio).toBeCloseTo(8000)
  })

  it('misma unidad: sin cambios', () => {
    expect(aUnidadDelProducto({ cantidad: 3, unidad: 'kg', precio_unitario: 100 }, { unidad: 'kg' })).toEqual({ cantidad: 3, precio: 100 })
  })

  it('unidades contra kg sin peso por unidad: no convertible', () => {
    expect(aUnidadDelProducto({ cantidad: 10, unidad: 'u', precio_unitario: 200 }, { unidad: 'kg' })).toBeNull()
  })

  it('unidades no métricas distintas (caja contra kg): no convertible', () => {
    expect(aUnidadDelProducto({ cantidad: 1, unidad: 'caja', precio_unitario: 5000 }, { unidad: 'kg' })).toBeNull()
    expect(aUnidadDelProducto({ cantidad: 1, unidad: 'caja', precio_unitario: 5000 }, { unidad: 'caja' })).toEqual({ cantidad: 1, precio: 5000 })
  })

  it('unidades contra kg con peso por unidad (1 u = 50 g)', () => {
    const r = aUnidadDelProducto({ cantidad: 10, unidad: 'u', precio_unitario: 200 }, { unidad: 'kg', peso_por_unidad_g: 50 })
    expect(r?.cantidad).toBeCloseTo(0.5)
    expect(r?.precio).toBeCloseTo(4000)
  })
})

describe('aUnidadDelProducto — envase de compra', () => {
  const nori = { unidad: 'unidad', unidad_compra: 'pack', cantidad_por_envase: 12 }

  it('una línea en pack se reparte en las unidades del envase', () => {
    expect(aUnidadDelProducto({ cantidad: 2, unidad: 'pack', precio_unitario: 10000 }, nori))
      .toEqual({ cantidad: 24, precio: 10000 / 12 })
  })

  it('reconoce abreviaturas y plurales de factura', () => {
    expect(aUnidadDelProducto({ cantidad: 1, unidad: 'PAQ', precio_unitario: 12000 }, nori)?.cantidad).toBe(12)
    expect(aUnidadDelProducto({ cantidad: 1, unidad: 'Packs', precio_unitario: 12000 }, nori)?.precio).toBe(1000)
    expect(aUnidadDelProducto({ cantidad: 3, unidad: 'CJ', precio_unitario: 600 }, { unidad: 'u', unidad_compra: 'caja', cantidad_por_envase: 6 }))
      .toEqual({ cantidad: 18, precio: 100 })
  })

  it('una línea en unidades no toca el envase', () => {
    expect(aUnidadDelProducto({ cantidad: 5, unidad: 'u', precio_unitario: 900 }, nori)).toEqual({ cantidad: 5, precio: 900 })
  })

  it('sin cantidad por envase no convierte', () => {
    expect(aUnidadDelProducto({ cantidad: 1, unidad: 'pack', precio_unitario: 10000 }, { unidad: 'unidad', unidad_compra: 'pack', cantidad_por_envase: null })).toBeNull()
  })
})
