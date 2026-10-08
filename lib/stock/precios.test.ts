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
