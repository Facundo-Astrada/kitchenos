import { describe, it, expect } from 'vitest'
import { unitConversionFactor, parseNumero, parsePrecio, separarCantidadUnidad } from './unidades'

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

describe('parseNumero', () => {
  it('coma decimal y punto de miles', () => {
    expect(parseNumero('0,5')).toBe(0.5)
    expect(parseNumero('1.500,5')).toBe(1500.5)
    expect(parseNumero('1.500.000')).toBe(1500000)
  })
  it('punto solo es decimal (teclado del celular)', () => {
    expect(parseNumero('1.5')).toBe(1.5)
    expect(parseNumero('500')).toBe(500)
  })
  it('vacío o inválido → 0', () => {
    expect(parseNumero('')).toBe(0)
    expect(parseNumero('abc')).toBe(0)
    expect(parseNumero(null)).toBe(0)
  })
})

describe('parsePrecio', () => {
  it('punto con 3 dígitos es miles en plata', () => {
    expect(parsePrecio('12.500')).toBe(12500)
    expect(parsePrecio('12.500,50')).toBe(12500.5)
    expect(parsePrecio('15,42')).toBe(15.42)
    expect(parsePrecio('8.5')).toBe(8.5)
    expect(parsePrecio('0.125')).toBe(0.125)
  })
})

describe('separarCantidadUnidad', () => {
  it('separa número y unidad pegados o con espacio', () => {
    expect(separarCantidadUnidad('500 g')).toEqual({ numero: '500', unidad: 'g' })
    expect(separarCantidadUnidad('1,5lt')).toEqual({ numero: '1,5', unidad: 'l' })
    expect(separarCantidadUnidad('200cc')).toEqual({ numero: '200', unidad: 'ml' })
    expect(separarCantidadUnidad('2 kg')).toEqual({ numero: '2', unidad: 'kg' })
    expect(separarCantidadUnidad('3 u')).toEqual({ numero: '3', unidad: 'u' })
  })

  it('sin letras o a medio tipear no propone unidad', () => {
    expect(separarCantidadUnidad('0,5')).toEqual({ numero: '0,5', unidad: null })
    expect(separarCantidadUnidad('500 m')).toEqual({ numero: '500', unidad: null })
    expect(separarCantidadUnidad('')).toEqual({ numero: '', unidad: null })
  })
})
