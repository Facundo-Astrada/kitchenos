import { describe, it, expect } from 'vitest'
import { unitConversionFactor } from './unidades'

describe('unitConversionFactor', () => {
  it('misma unidad → factor 1', () => {
    expect(unitConversionFactor('g', 'g')).toBe(1)
    expect(unitConversionFactor('kg', 'kilos')).toBe(1) // ambas canonizan a 'kg'
  })

  it('chico → grande (g→kg, ml→l): /1000', () => {
    expect(unitConversionFactor('g', 'kg')).toBe(0.001)
    expect(unitConversionFactor('ml', 'l')).toBe(0.001)
  })

  it('grande → chico (kg→g, l→ml): ×1000', () => {
    expect(unitConversionFactor('kg', 'g')).toBe(1000)
    expect(unitConversionFactor('l', 'ml')).toBe(1000)
  })

  it('peso↔volumen mismo orden de magnitud: densidad ≈ 1', () => {
    expect(unitConversionFactor('g', 'ml')).toBe(1)
    expect(unitConversionFactor('kg', 'l')).toBe(1)
  })

  it('unidades (conteo) contra peso/volumen: incompatible, factor 0', () => {
    expect(unitConversionFactor('u', 'kg')).toBe(0)
    expect(unitConversionFactor('kg', 'u')).toBe(0)
  })

  it('normaliza variantes reales de datos importados', () => {
    expect(unitConversionFactor('grs', 'kgs')).toBe(0.001)
    expect(unitConversionFactor('lts', 'cc')).toBe(1000)
  })
})
