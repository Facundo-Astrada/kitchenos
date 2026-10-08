import { describe, it, expect } from 'vitest'
import { esSinPrecio, usoEnRecetas, ordenarPorUso } from './sinPrecio'

describe('filtro Sin precio de Stock', () => {
  it('cuenta sin precio solo lo activo, en uso y que no es producción', () => {
    expect(esSinPrecio({ id: '1', nombre: 'Sal', precio_unitario: 0 })).toBe(true)
    expect(esSinPrecio({ id: '2', nombre: 'Agua', precio_unitario: null })).toBe(true)
    expect(esSinPrecio({ id: '3', nombre: 'Manteca', precio_unitario: 11723 })).toBe(false)
    expect(esSinPrecio({ id: '4', nombre: 'Viejo', precio_unitario: 0, fuera_de_uso: true })).toBe(false)
    expect(esSinPrecio({ id: '5', nombre: 'Salsa', precio_unitario: 0, es_produccion: true })).toBe(false)
  })

  it('ordena por cantidad de recetas que lo usan (una receta cuenta una vez)', () => {
    const uso = usoEnRecetas([
      { id: 'r1', ingredientes: [{ producto_id: 'sal' }, { producto_id: 'sal' }, { producto_id: 'agua' }] },
      { id: 'r2', ingredientes: [{ producto_id: 'sal' }] },
    ])
    expect(uso.get('sal')).toBe(2)
    const orden = ordenarPorUso([{ id: 'agua', nombre: 'Agua' }, { id: 'x', nombre: 'Ajo' }, { id: 'sal', nombre: 'Sal' }], uso)
    expect(orden.map(p => p.id)).toEqual(['sal', 'agua', 'x'])
  })
})
