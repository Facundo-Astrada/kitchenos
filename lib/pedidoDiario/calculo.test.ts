import { describe, it, expect } from 'vitest'
import {
  proponerConConteo, cantidadInicialSinConteo, avance, totalEstimado, minutosParaCorte,
  textoCorte, diasDesde, textoAntiguedad, armarMensaje, telefonoWhatsApp, ajustarCantidad, pasoCantidad,
} from './calculo'

describe('proponerConConteo', () => {
  const cebolla = { stock_minimo: 4, stock_maximo: 6 }
  it('alcanza el mínimo → hay', () => {
    expect(proponerConConteo(4, cebolla)).toEqual({ estado: 'hay', cantidad: 0 })
    expect(proponerConConteo(5, cebolla).estado).toBe('hay')
  })
  it('bajo el mínimo → pide hasta el máximo', () => {
    expect(proponerConConteo(2, cebolla)).toEqual({ estado: 'pedir', cantidad: 4 })
    expect(proponerConConteo(0, cebolla)).toEqual({ estado: 'pedir', cantidad: 6 })
  })
  it('sin máximo repone hasta el mínimo', () => {
    expect(proponerConConteo(1.5, { stock_minimo: 4 })).toEqual({ estado: 'pedir', cantidad: 2.5 })
  })
  it('nunca supera el máximo', () => {
    const r = proponerConConteo(3.9, cebolla)
    expect(3.9 + r.cantidad).toBeLessThanOrEqual(6)
  })
})

describe('sin conteo', () => {
  it('usa la última pedida, si no el mínimo, si no 1', () => {
    expect(cantidadInicialSinConteo({ stock_minimo: 4 }, 3)).toBe(3)
    expect(cantidadInicialSinConteo({ stock_minimo: 4 }, null)).toBe(4)
    expect(cantidadInicialSinConteo({ stock_minimo: 0 })).toBe(1)
  })
  it('ajusta sin bajar de 0', () => {
    expect(ajustarCantidad(0.5, -0.5)).toBe(0)
    expect(ajustarCantidad(0, -1)).toBe(0)
    expect(pasoCantidad('kg')).toBe(0.5)
    expect(pasoCantidad('u')).toBe(1)
  })
})

describe('avance y total', () => {
  const lineas = {
    a: { estado: 'hay' as const, cantidad: 0 },
    b: { estado: 'pedir' as const, cantidad: 2 },
    c: { estado: 'pedir' as const, cantidad: 0 },
  }
  it('un pedir con cantidad 0 no cuenta como revisado', () => {
    expect(avance(lineas, ['a', 'b', 'c'])).toEqual({ revisados: 2, total: 3, completo: false })
    expect(avance(lineas, ['a', 'b']).completo).toBe(true)
    expect(avance({}, []).completo).toBe(false)
  })
  it('suma solo lo que se pide', () => {
    expect(totalEstimado(lineas, { a: 1000, b: 2400.4, c: 10 })).toBe(4801)
  })
})

describe('corte y antigüedad', () => {
  const ahora = new Date(2026, 9, 9, 16, 0)
  it('minutos y texto', () => {
    expect(minutosParaCorte('18:00', ahora)).toBe(120)
    expect(minutosParaCorte('x', ahora)).toBeNull()
    expect(textoCorte('18:00', ahora)).toBe('Cierra 18:00 · faltan 2 h')
    expect(textoCorte('15:00', ahora)).toBe('Cerró a las 15:00')
    expect(textoCorte(null, ahora)).toBeNull()
  })
  it('días del precio', () => {
    expect(diasDesde('2026-09-30', ahora)).toBe(9)
    expect(textoAntiguedad(9)).toBe('hace 9 días')
    expect(textoAntiguedad(null)).toBe('sin fecha')
  })
})

describe('mensaje', () => {
  it('sin precios, con nota', () => {
    const m = armarMensaje({ proveedor: 'Juan', fecha: 'jue 09/10', items: [{ nombre: 'Cebolla', cantidad: 4, unidad: 'kg' }, { nombre: 'Rúcula', cantidad: 2.5, unidad: 'atado' }], nota: ' Entregar temprano ' })
    expect(m).toContain('*Pedido - Juan*')
    expect(m).toContain('• Cebolla — 4 kg')
    expect(m).toContain('• Rúcula — 2,5 atado')
    expect(m).toContain('Entregar temprano')
    expect(m).not.toContain('$')
  })
  it('teléfono', () => {
    expect(telefonoWhatsApp('+54 9 11 5555-1234')).toBe('5491155551234')
    expect(telefonoWhatsApp('')).toBeNull()
  })
})
