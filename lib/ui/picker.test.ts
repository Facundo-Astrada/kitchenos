import { describe, it, expect } from 'vitest'
import { opcionDesdeY, posicionPopover } from './picker'

describe('opcionDesdeY', () => {
  const rects = [
    { top: 0, bottom: 44 },
    { top: 44, bottom: 88 },
    { top: 88, bottom: 132 },
  ]

  it('encuentra la opción bajo el dedo', () => {
    expect(opcionDesdeY(10, rects)).toBe(0)
    expect(opcionDesdeY(60, rects)).toBe(1)
    expect(opcionDesdeY(130, rects)).toBe(2)
  })

  it('respeta los bordes de cada rect', () => {
    expect(opcionDesdeY(44, rects)).toBe(0) // borde compartido: gana el primer match
    expect(opcionDesdeY(0, rects)).toBe(0)
    expect(opcionDesdeY(132, rects)).toBe(2)
  })

  it('null si el dedo está fuera de la columna', () => {
    expect(opcionDesdeY(-10, rects)).toBeNull()
    expect(opcionDesdeY(200, rects)).toBeNull()
  })

  it('null con lista vacía', () => {
    expect(opcionDesdeY(10, [])).toBeNull()
  })
})

describe('posicionPopover', () => {
  const vw = 400
  const vh = 800

  it('se abre a la derecha cuando entra', () => {
    const anchor = { top: 100, bottom: 130, left: 50, right: 80 }
    const pos = posicionPopover(anchor, 150, 64, vw, vh)
    expect(pos.left).toBe(86) // right + gap(6)
  })

  it('se abre a la izquierda si no entra a la derecha', () => {
    const anchor = { top: 100, bottom: 130, left: 350, right: 380 }
    const pos = posicionPopover(anchor, 150, 64, vw, vh)
    expect(pos.left).toBe(350 - 6 - 64)
  })

  it('clampea el top para no salirse arriba', () => {
    const anchor = { top: 0, bottom: 20, left: 50, right: 80 }
    const pos = posicionPopover(anchor, 150, 64, vw, vh)
    expect(pos.top).toBeGreaterThanOrEqual(4)
  })

  it('clampea el top para no salirse abajo', () => {
    const anchor = { top: 780, bottom: 800, left: 50, right: 80 }
    const pos = posicionPopover(anchor, 150, 64, vw, vh)
    expect(pos.top).toBeLessThanOrEqual(vh - 150 - 4)
  })

  it('centra el popover en el anchor cuando hay lugar de sobra', () => {
    const anchor = { top: 400, bottom: 430, left: 50, right: 80 }
    const pos = posicionPopover(anchor, 150, 64, vw, vh)
    const centroAnchor = 415
    expect(pos.top).toBe(centroAnchor - 75)
  })
})
