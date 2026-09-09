import { describe, it, expect } from 'vitest'
import { moverItemSobreItem, moverItemASeccion, type ItemConSeccion } from './reordenarItems'

interface Item extends ItemConSeccion {
  nombre: string
}

function item(_uid: number, _seccion: string, nombre: string): Item {
  return { _uid, _seccion, nombre }
}

describe('moverItemSobreItem', () => {
  it('reordena dentro de la misma sección', () => {
    const items = [item(1, 'Entradas', 'A'), item(2, 'Entradas', 'B'), item(3, 'Entradas', 'C')]
    const next = moverItemSobreItem(items, 1, 3)
    // Mismo criterio que el drag de secciones (splice/splice sin reajustar
    // el índice tras el remove): A termina DESPUÉS de C, no en su lugar.
    expect(next.map(i => i.nombre)).toEqual(['B', 'C', 'A'])
  })

  it('migra a la sección del ítem destino cuando es de otra sección', () => {
    const items = [item(1, 'Entradas', 'A'), item(2, 'Principales', 'B'), item(3, 'Principales', 'C')]
    const next = moverItemSobreItem(items, 1, 3)
    const movido = next.find(i => i._uid === 1)!
    expect(movido._seccion).toBe('Principales')
    // Mismo criterio que el caso anterior: termina después de C.
    expect(next.map(i => i.nombre)).toEqual(['B', 'C', 'A'])
  })

  it('no toca nada si el uid arrastrado y el destino son el mismo', () => {
    const items = [item(1, 'Entradas', 'A'), item(2, 'Entradas', 'B')]
    expect(moverItemSobreItem(items, 1, 1)).toBe(items)
  })

  it('no toca nada si algún uid no existe', () => {
    const items = [item(1, 'Entradas', 'A'), item(2, 'Entradas', 'B')]
    expect(moverItemSobreItem(items, 1, 999)).toBe(items)
    expect(moverItemSobreItem(items, 999, 2)).toBe(items)
  })

  it('no muta el array original', () => {
    const items = [item(1, 'Entradas', 'A'), item(2, 'Principales', 'B')]
    const original = [...items]
    moverItemSobreItem(items, 1, 2)
    expect(items).toEqual(original)
  })
})

describe('moverItemASeccion', () => {
  it('manda el ítem al final, migrado a la sección destino', () => {
    const items = [item(1, 'Entradas', 'A'), item(2, 'Principales', 'B'), item(3, 'Principales', 'C')]
    const next = moverItemASeccion(items, 1, 'Principales')
    expect(next.map(i => i.nombre)).toEqual(['B', 'C', 'A'])
    expect(next.find(i => i._uid === 1)!._seccion).toBe('Principales')
  })

  it('no toca nada si el uid no existe', () => {
    const items = [item(1, 'Entradas', 'A')]
    expect(moverItemASeccion(items, 999, 'Principales')).toBe(items)
  })
})
