import { describe, it, expect } from 'vitest'
import { clasificarIngenieriaMenu } from './ingenieriaMenu'

describe('clasificarIngenieriaMenu — distribución sesgada (el caso que motivó el fix)', () => {
  // 5 platos, uno (A) se lleva el 40% de las ventas. Con el promedio simple
  // viejo (avgPop = totalVendido/N) el ganador infla el promedio y arrastra
  // a "poco popular" a platos que en términos relativos venden bien.
  const base = [
    { item: 'A', pop: 40, margin: 100 },
    { item: 'B', pop: 20, margin: 100 },
    { item: 'C', pop: 15, margin: 100 },
    { item: 'D', pop: 15, margin: 100 },
    { item: 'E', pop: 10, margin: 100 },
  ]

  it('con el método viejo (promedio simple) caían 3 platos en "poco popular"', () => {
    const avgPop = base.reduce((s, x) => s + x.pop, 0) / base.length // 20
    const pocoPopularViejo = base.filter(x => x.pop < avgPop).map(x => x.item)
    expect(pocoPopularViejo).toEqual(['C', 'D', 'E'])
  })

  it('con el método nuevo (umbral fijo: 70% del mix ideal) caen menos', () => {
    const r = clasificarIngenieriaMenu(base)
    const pocoPopular = [...r.puzzle, ...r.perro].map(x => x.item)
    expect(pocoPopular).toEqual(['E'])
    expect(pocoPopular.length).toBeLessThan(3)
  })

  it('con margen parejo, estrella/caballo son los que llegan al umbral de popularidad', () => {
    const r = clasificarIngenieriaMenu(base)
    expect(r.estrella.map(x => x.item)).toEqual(['A', 'B', 'C', 'D'])
    expect(r.puzzle.map(x => x.item)).toEqual(['E'])
    expect(r.caballo).toEqual([])
    expect(r.perro).toEqual([])
  })
})

describe('clasificarIngenieriaMenu — casos borde', () => {
  it('N=0: no entra al cálculo, no rompe (100/0 no se evalúa)', () => {
    const r = clasificarIngenieriaMenu([])
    expect(r.hayDatos).toBe(false)
    expect(r.conVentas).toBe(false)
    expect(r.estrella).toEqual([])
    expect(r.caballo).toEqual([])
    expect(r.puzzle).toEqual([])
    expect(r.perro).toEqual([])
  })

  it('N=1: mix ideal 100%, índice 70%, funciona', () => {
    const r = clasificarIngenieriaMenu([{ item: 'A', pop: 5, margin: 100 }])
    expect(r.hayDatos).toBe(true)
    expect(r.estrella.map(x => x.item)).toEqual(['A'])
  })

  it('sin ventas cargadas: no divide por cero (fallback a promedio simple) y clasifica solo por rentabilidad', () => {
    const base = [
      { item: 'A', pop: 0, margin: 300 },
      { item: 'B', pop: 0, margin: 100 },
    ]
    const r = clasificarIngenieriaMenu(base)
    expect(r.conVentas).toBe(false)
    // margen promedio = 200 → A (300) queda arriba, B (100) abajo. Sin
    // ventas, popularidad es false para todos: la única variable es el margen.
    expect(r.puzzle.map(x => x.item)).toEqual(['A'])
    expect(r.perro.map(x => x.item)).toEqual(['B'])
    expect(r.estrella).toEqual([])
    expect(r.caballo).toEqual([])
  })
})
