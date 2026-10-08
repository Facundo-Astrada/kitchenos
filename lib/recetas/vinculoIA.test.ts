import { describe, it, expect } from 'vitest'
import { armarCatalogo, armarPedido, interpretarRespuesta } from './vinculoIA'

const { texto, refs } = armarCatalogo(
  [
    { id: 'leche-entera', nombre: 'Leche entera', unidad: 'l' },
    { id: 'leche-polvo', nombre: 'Leche en polvo', unidad: 'kg' },
    { id: 'salsa-inglesa', nombre: 'Salsa inglesa', unidad: 'l' },
  ],
  [{ id: 'ajo-asado', nombre: 'Ajo asado' }],
)

describe('armarCatalogo', () => {
  it('numera insumos con P y recetas con R', () => {
    expect(texto).toContain('P0 | Leche entera | l')
    expect(texto).toContain('R0 | Ajo asado')
    expect(refs.get('P2')).toEqual({ tipo: 'producto', id: 'salsa-inglesa' })
    expect(refs.get('R0')).toEqual({ tipo: 'subreceta', id: 'ajo-asado' })
  })
})

describe('armarPedido', () => {
  it('numera los ingredientes desde 0', () => {
    expect(armarPedido([{ nombre: 'Leche', unidad: 'g' }, { nombre: 'Sal' }]))
      .toBe('INGREDIENTES DE LA RECETA:\n0 | Leche (g)\n1 | Sal')
  })
})

describe('interpretarRespuesta', () => {
  it('traduce refs a ids y respeta seguro/dudoso', () => {
    const r = interpretarRespuesta({
      resultados: [
        { i: 0, opciones: ['P0', 'P1'], segura: false },
        { i: 1, opciones: ['p2'], segura: true },
        { i: 2, opciones: ['R0'], segura: true },
      ],
    }, refs, 3)
    expect(r).toEqual([
      { i: 0, opciones: [{ tipo: 'producto', id: 'leche-entera' }, { tipo: 'producto', id: 'leche-polvo' }], segura: false },
      { i: 1, opciones: [{ tipo: 'producto', id: 'salsa-inglesa' }], segura: true },
      { i: 2, opciones: [{ tipo: 'subreceta', id: 'ajo-asado' }], segura: true },
    ])
  })

  it('descarta refs inventadas, índices fuera de rango y repetidos', () => {
    const r = interpretarRespuesta({
      resultados: [
        { i: 0, opciones: ['P99', 'X1'], segura: true },
        { i: 0, opciones: ['P0'], segura: true },
        { i: 7, opciones: ['P0'], segura: true },
        { i: 1, opciones: ['P0', 'P0', 'P1', 'P2', 'R0'], segura: false },
      ],
    }, refs, 2)
    expect(r).toEqual([
      { i: 0, opciones: [], segura: false },
      { i: 1, opciones: [{ tipo: 'producto', id: 'leche-entera' }, { tipo: 'producto', id: 'leche-polvo' }, { tipo: 'producto', id: 'salsa-inglesa' }], segura: false },
    ])
  })

  it('respuesta rota → lista vacía', () => {
    expect(interpretarRespuesta(null, refs, 2)).toEqual([])
    expect(interpretarRespuesta({ resultados: 'x' }, refs, 2)).toEqual([])
  })
})
