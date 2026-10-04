import { describe, it, expect } from 'vitest'
import { bloquesDeEstante, ordenarRecorrido } from './recorrido'

const p = (id: string, estante_id: string | null, stock_grupo_id: string | null, orden_sector: number) =>
  ({ id, nombre: id, estante_id, stock_grupo_id, orden_sector })

describe('ordenarRecorrido', () => {
  const estantes = [{ id: 'e2', orden: 1 }, { id: 'e1', orden: 0 }]
  const grupos = [
    { id: 'latas', estante_id: 'e1', orden: 2 },
    { id: 'vinagres', estante_id: 'e1', orden: 0 },
    { id: 'aceites', estante_id: 'e1', orden: 1 },
  ]

  it('recorre estante por estante, grupo por grupo, sueltos al final de cada estante', () => {
    const productos = [
      p('suelto-e1', 'e1', null, 0),
      p('lata', 'e1', 'latas', 0),
      p('sin-estante', null, null, 0),
      p('aceite-b', 'e1', 'aceites', 1),
      p('aceite-a', 'e1', 'aceites', 0),
      p('vinagre', 'e1', 'vinagres', 5),
      p('en-e2', 'e2', null, 0),
    ]
    expect(ordenarRecorrido(productos, estantes, grupos).map(x => x.id)).toEqual([
      'vinagre', 'aceite-a', 'aceite-b', 'lata', 'suelto-e1', 'en-e2', 'sin-estante',
    ])
  })

  it('un grupo de otro estante cuenta como suelto', () => {
    const productos = [p('raro', 'e2', 'vinagres', 0), p('otro', 'e2', null, 1)]
    const productos2 = [p('otro', 'e2', null, 0), p('raro', 'e2', 'vinagres', 1), p('agrupado', 'e2', 'g-e2', 5)]
    const grupos2 = [...grupos, { id: 'g-e2', estante_id: 'e2', orden: 0 }]
    expect(ordenarRecorrido(productos, estantes, grupos).map(x => x.id)).toEqual(['raro', 'otro'])
    expect(ordenarRecorrido(productos2, estantes, grupos2).map(x => x.id)).toEqual(['agrupado', 'otro', 'raro'])
  })
})

describe('bloquesDeEstante', () => {
  it('un bloque por grupo (incluso vacío) y los sueltos al final', () => {
    const grupos = [{ id: 'g2', estante_id: 'e1', orden: 1 }, { id: 'g1', estante_id: 'e1', orden: 0 }]
    const bloques = bloquesDeEstante([p('a', 'e1', 'g2', 0), p('b', 'e1', null, 0), p('c', 'e1', 'fantasma', 0)], grupos)
    expect(bloques.map(b => [b.grupo?.id ?? null, b.productos.map(x => x.id)])).toEqual([
      ['g1', []],
      ['g2', ['a']],
      [null, ['b', 'c']],
    ])
  })
})
