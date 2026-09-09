import { describe, it, expect } from 'vitest'
import { hitTestSeccion, hitTestItem, calcularReordenSeccion, type RectLike } from './miseReorder'

function rect(left: number, top: number, width: number, height: number): RectLike {
  return { left, top, right: left + width, bottom: top + height }
}

describe('hitTestSeccion', () => {
  const secciones = [
    { id: 'heladera', rect: rect(0, 0, 900, 200) },
    { id: 'freezer', rect: rect(0, 220, 900, 200) },
  ]

  it('columna única (grid=false): solo importa Y', () => {
    expect(hitTestSeccion(9999, 50, secciones, false)).toBe('heladera')
    expect(hitTestSeccion(-500, 250, secciones, false)).toBe('freezer')
  })

  it('grilla (grid=true): X e Y tienen que caer dentro', () => {
    expect(hitTestSeccion(50, 50, secciones, true)).toBe('heladera')
    expect(hitTestSeccion(2000, 50, secciones, true)).toBe(null)
  })

  it('sin match, devuelve null', () => {
    expect(hitTestSeccion(50, 9999, secciones, false)).toBe(null)
  })
})

describe('hitTestItem', () => {
  it('columna única: el más cercano por distancia vertical, antes/después por mitad', () => {
    const items = [
      { id: 'a', rect: rect(0, 0, 300, 40) },
      { id: 'b', rect: rect(0, 40, 300, 40) },
    ]
    // Arriba de la mitad de "b" → antes de "b"
    expect(hitTestItem(10, 45, items, false)).toEqual({ itemId: 'b', insertAfter: false })
    // Debajo de la mitad de "b" → después de "b"
    expect(hitTestItem(10, 75, items, false)).toEqual({ itemId: 'b', insertAfter: true })
  })

  it('grilla: distancia euclídea — un ítem al lado (misma fila) importa, no solo el de abajo', () => {
    // Dos columnas, una sola fila: "a" en (0,0)-(300,40), "b" en (320,0)-(620,40).
    const items = [
      { id: 'a', rect: rect(0, 0, 300, 40) },
      { id: 'b', rect: rect(320, 0, 300, 40) },
    ]
    // Cursor cerca del borde derecho de "a" (x=280, centro de "a" en x=150),
    // todavía más cerca de "a" que de "b" — con hit-test 1D esto solo miraría
    // Y; en 2D tiene que reconocer que sigue sobre "a" y que está a la
    // derecha de su centro.
    const hit = hitTestItem(280, 20, items, true)
    expect(hit?.itemId).toBe('a')
    expect(hit?.insertAfter).toBe(true)
  })

  it('grilla: fila siguiente — el más cercano cambia de fila, y adentro de esa fila X sigue importando', () => {
    const items = [
      { id: 'a', rect: rect(0, 0, 300, 40) },
      { id: 'c', rect: rect(0, 60, 300, 40) }, // fila de abajo
    ]
    // Bien abajo (dentro de "c") y a la derecha de su centro (150).
    const hit = hitTestItem(290, 90, items, true)
    expect(hit?.itemId).toBe('c')
    expect(hit?.insertAfter).toBe(true)
  })

  it('sin ítems, devuelve null', () => {
    expect(hitTestItem(0, 0, [], true)).toBe(null)
  })
})

describe('calcularReordenSeccion', () => {
  it('sin cambios cuando el resultado es el mismo orden', () => {
    const items = [
      { id: 'a', orden: 0, seccion_id: 'sec1' },
      { id: 'b', orden: 1, seccion_id: 'sec1' },
      { id: 'c', orden: 2, seccion_id: 'sec1' },
    ]
    // Arrastrar "a" y soltarlo justo antes de "b" — es donde ya estaba.
    const dragged = { id: 'a', orden: 0, seccion_id: 'sec1' }
    const updates = calcularReordenSeccion(items, dragged, 'sec1', 'b', false)
    expect(updates).toEqual([])
  })

  it('reordena dentro de la misma sección — antes de un ítem', () => {
    const items = [
      { id: 'a', orden: 0, seccion_id: 'sec1' },
      { id: 'b', orden: 1, seccion_id: 'sec1' },
      { id: 'c', orden: 2, seccion_id: 'sec1' },
    ]
    // Mover "c" antes de "a"
    const dragged = { id: 'c', orden: 2, seccion_id: 'sec1' }
    const updates = calcularReordenSeccion(items, dragged, 'sec1', 'a', false)
    const porId = Object.fromEntries(updates.map(u => [u.id, u.orden]))
    expect(porId.c).toBe(0)
    expect(porId.a).toBe(1)
    expect(porId.b).toBe(2)
  })

  it('migra de sección cuando el destino es otro', () => {
    const items = [
      { id: 'x', orden: 0, seccion_id: 'sec2' },
      { id: 'y', orden: 1, seccion_id: 'sec2' },
    ]
    const dragged = { id: 'a', orden: 5, seccion_id: 'sec1' }
    const updates = calcularReordenSeccion(items, dragged, 'sec2', 'x', true)
    const filaA = updates.find(u => u.id === 'a')!
    expect(filaA.seccion_id).toBe('sec2')
    expect(filaA.orden).toBe(1) // después de "x"
  })

  it('sin overItemId, va al final de la sección destino', () => {
    const items = [
      { id: 'x', orden: 0, seccion_id: 'sec2' },
      { id: 'y', orden: 1, seccion_id: 'sec2' },
    ]
    const dragged = { id: 'a', orden: 5, seccion_id: 'sec1' }
    const updates = calcularReordenSeccion(items, dragged, 'sec2', null, false)
    const filaA = updates.find(u => u.id === 'a')!
    expect(filaA.orden).toBe(2)
    expect(filaA.seccion_id).toBe('sec2')
  })
})
