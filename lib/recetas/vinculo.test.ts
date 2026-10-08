import { describe, it, expect } from 'vitest'
import { claveExacta, buscarProductoExacto } from './vinculo'

const productos = [
  { id: '1', nombre: 'Agua oxigenada' },
  { id: '2', nombre: 'Papel manteca rollo' },
  { id: '3', nombre: 'Limón' },
  { id: '4', nombre: 'Huevo' },
  { id: '5', nombre: 'Manteca' },
]

describe('vínculo exacto ingrediente ↔ producto', () => {
  it('ignora mayúsculas, tildes, espacios y plural simple', () => {
    expect(claveExacta('  LIMONES ')).toBe(claveExacta('Limón'))
    expect(buscarProductoExacto('Huevos', productos)?.id).toBe('4')
    expect(buscarProductoExacto('manteca', productos)?.id).toBe('5')
  })

  it('no vincula por parecido (contiene / comparte palabras)', () => {
    expect(buscarProductoExacto('Agua', productos)).toBeUndefined()
    expect(buscarProductoExacto('Manteca derretida', productos)).toBeUndefined()
  })
})
