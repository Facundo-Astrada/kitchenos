import { describe, it, expect } from 'vitest'
import { calcularCostoUsd } from './costos'

// El costo por llamada es la base sobre la que se fija el tope del Coach y, con él,
// el margen del plan (decisión de negocio 008). Un error acá no rompe nada visible
// —se paga solo— así que conviene que lo agarre un test y no la factura de Anthropic.

describe('calcularCostoUsd', () => {
  it('cobra entrada y salida a la tarifa de Sonnet 4.6', () => {
    // 1M in a $3 + 1M out a $15
    const costo = calcularCostoUsd('claude-sonnet-4-6', {
      tokensEntrada: 1_000_000,
      tokensSalida: 1_000_000,
    })
    expect(costo).toBeCloseTo(18, 6)
  })

  it('cobra Haiku 4.5 a un tercio de Sonnet', () => {
    const costo = calcularCostoUsd('claude-haiku-4-5', {
      tokensEntrada: 1_000_000,
      tokensSalida: 1_000_000,
    })
    expect(costo).toBeCloseTo(6, 6)
  })

  it('reconoce el ID con sufijo de fecha por prefijo', () => {
    // Las rutas usan 'claude-haiku-4-5-20251001', no el ID pelado.
    const conSufijo = calcularCostoUsd('claude-haiku-4-5-20251001', { tokensEntrada: 1_000_000, tokensSalida: 0 })
    const pelado = calcularCostoUsd('claude-haiku-4-5', { tokensEntrada: 1_000_000, tokensSalida: 0 })
    expect(conSufijo).toBe(pelado)
  })

  it('aplica los multiplicadores de cache: leer 0,1x y escribir 1,25x sobre la entrada', () => {
    const lectura = calcularCostoUsd('claude-sonnet-4-6', {
      tokensEntrada: 0, tokensSalida: 0, tokensCacheLectura: 1_000_000,
    })
    const escritura = calcularCostoUsd('claude-sonnet-4-6', {
      tokensEntrada: 0, tokensSalida: 0, tokensCacheEscritura: 1_000_000,
    })
    expect(lectura).toBeCloseTo(0.3, 6)
    expect(escritura).toBeCloseTo(3.75, 6)
  })

  it('un modelo desconocido se cobra como el más caro que usamos, no como gratis', () => {
    // Preferimos sobreestimar el costo antes que descubrir tarde que un modelo
    // nuevo estuvo contando $0 durante un mes.
    const costo = calcularCostoUsd('claude-modelo-que-no-existe', {
      tokensEntrada: 1_000_000, tokensSalida: 0,
    })
    expect(costo).toBeCloseTo(3, 6)
  })

  it('una llamada sin tokens no cuesta nada', () => {
    expect(calcularCostoUsd('claude-sonnet-4-6', { tokensEntrada: 0, tokensSalida: 0 })).toBe(0)
  })
})

describe('precios de los modelos vigentes', () => {
  it('cobra Sonnet 5 a su precio, no al del 4.6 que reemplazó', () => {
    // Un millón de tokens de entrada: $2, no los $3 del fallback.
    expect(calcularCostoUsd('claude-sonnet-5', { tokensEntrada: 1_000_000, tokensSalida: 0 }))
      .toBeCloseTo(2, 6)
    expect(calcularCostoUsd('claude-sonnet-5', { tokensEntrada: 0, tokensSalida: 1_000_000 }))
      .toBeCloseTo(10, 6)
  })

  it('no confunde sonnet-5 con sonnet-4-6 al matchear por prefijo', () => {
    const s5 = calcularCostoUsd('claude-sonnet-5', { tokensEntrada: 1_000_000, tokensSalida: 0 })
    const s46 = calcularCostoUsd('claude-sonnet-4-6', { tokensEntrada: 1_000_000, tokensSalida: 0 })
    expect(s5).toBeLessThan(s46)
  })
})
