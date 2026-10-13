import { describe, it, expect } from 'vitest'
import { puedeEditarNotaTarea } from './notasTarea'

const base = { miembroId: 'm1', nota: 'dejé la salsa a medias', notaPorId: 'm2' }

describe('puedeEditarNotaTarea', () => {
  it('chef, sous chef y admin editan cualquier nota', () => {
    for (const rol of ['chef', 'sous_chef', 'admin', 'owner']) {
      expect(puedeEditarNotaTarea({ ...base, rol })).toBe(true)
    }
  })

  it('el equipo no pisa la nota de otro', () => {
    for (const rol of ['parrilla', 'frios', 'linea', 'ayudante', 'cocinero']) {
      expect(puedeEditarNotaTarea({ ...base, rol })).toBe(false)
    }
  })

  it('el equipo edita la propia y agrega donde no hay', () => {
    expect(puedeEditarNotaTarea({ ...base, rol: 'parrilla', notaPorId: 'm1' })).toBe(true)
    expect(puedeEditarNotaTarea({ ...base, rol: 'parrilla', nota: null, notaPorId: null })).toBe(true)
  })

  it('sin miembro no edita la de otro', () => {
    expect(puedeEditarNotaTarea({ ...base, rol: 'linea', miembroId: null })).toBe(false)
  })
})
