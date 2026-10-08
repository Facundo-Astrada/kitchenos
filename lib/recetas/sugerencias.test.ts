import { describe, it, expect } from 'vitest'
import { buscarSugerenciasIngrediente, puntajeCoincidencia } from './sugerencias'

const productos = [
  { id: 'f', nombre: 'Fecula de papa', unidad: 'kg', precio_unitario: 3272.72 },
  { id: 'p0', nombre: 'Papa', unidad: 'kg', precio_unitario: 0 },
  { id: 'p1', nombre: 'Papa', unidad: 'kg', precio_unitario: 2210 },
  { id: 'ps', nombre: 'Papas', unidad: 'kg', precio_unitario: 0 },
  { id: 'c', nombre: 'Cebolla', unidad: 'kg', precio_unitario: 900 },
]
const recetas = [
  { id: 'r1', nombre: 'Ñoquis de papa', costoPorGramo: 0.004 },
  { id: 'r2', nombre: 'Papas pickle', costoPorGramo: null },
  { id: 'r3', nombre: 'Puré de papas ahumado', costoPorGramo: 0.002 },
]

describe('puntajeCoincidencia', () => {
  it('ordena igual < empieza < palabra < contiene', () => {
    expect(puntajeCoincidencia('Papa', 'papa')).toBe(0)
    expect(puntajeCoincidencia('Papas', 'papa')).toBe(1)
    expect(puntajeCoincidencia('Fecula de papa', 'papa')).toBe(2)
    expect(puntajeCoincidencia('Chipapa', 'papa')).toBe(3)
    expect(puntajeCoincidencia('Cebolla', 'papa')).toBe(-1)
  })

  it('ignora acentos y mayúsculas', () => {
    expect(puntajeCoincidencia('Puré de papas', 'pure')).toBe(1)
    expect(puntajeCoincidencia('Ñoquis', 'noquis')).toBe(0)
  })

  it('acepta palabras sueltas en otro orden', () => {
    expect(puntajeCoincidencia('Puré de papas ahumado', 'papas pure')).toBe(4)
  })
})

describe('buscarSugerenciasIngrediente', () => {
  it('pone el producto exacto con precio primero y no repite duplicados', () => {
    const r = buscarSugerenciasIngrediente('papa', productos, recetas)
    expect(r[0]).toMatchObject({ tipo: 'producto', id: 'p1', costoUnitario: 2210 })
    expect(r.filter(s => s.nombre === 'Papa')).toHaveLength(1)
    expect(r.map(s => s.id)).toEqual(['p1', 'ps', 'r2', 'f', 'r1', 'r3'])
  })

  it('incluye recetas como subrecetas costeadas por gramo', () => {
    const r = buscarSugerenciasIngrediente('noquis', productos, recetas)
    expect(r).toEqual([expect.objectContaining({ tipo: 'subreceta', id: 'r1', unidad: 'g', costoUnitario: 0.004 })])
  })

  it('excluye la receta que se está editando', () => {
    const r = buscarSugerenciasIngrediente('noquis', productos, recetas, { excluirRecetaId: 'r1' })
    expect(r).toEqual([])
  })

  it('respeta el límite y no busca con texto vacío', () => {
    expect(buscarSugerenciasIngrediente('papa', productos, recetas, { limite: 2 })).toHaveLength(2)
    expect(buscarSugerenciasIngrediente('  ', productos, recetas)).toEqual([])
  })
})
