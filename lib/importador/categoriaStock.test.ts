import { describe, it, expect } from 'vitest'
import { esCategoriaValida, columnaCategoriaConfiable } from './categoriaStock'

describe('esCategoriaValida', () => {
  it('acepta secciones', () => {
    expect(esCategoriaValida('Verduras', 'Papa')).toBe(true)
    expect(esCategoriaValida('Lácteos', 'Leche entera')).toBe(true)
    expect(esCategoriaValida('Descartables', 'Bandeja 107')).toBe(true)
  })

  it('rechaza el nombre del producto, unidades y números', () => {
    expect(esCategoriaValida('Ajo (kg)', 'Ajo')).toBe(false)
    expect(esCategoriaValida('Acido citrico (kg)', 'Ácido cítrico')).toBe(false)
    expect(esCategoriaValida('Alcaparras', 'alcaparras')).toBe(false)
    expect(esCategoriaValida('550', 'Harina')).toBe(false)
    expect(esCategoriaValida('', 'Harina')).toBe(false)
    expect(esCategoriaValida('Sin categoría', 'Harina')).toBe(false)
  })
})

describe('columnaCategoriaConfiable', () => {
  it('pocas secciones repetidas → confiable', () => {
    const v = Array.from({ length: 200 }, (_, i) => ['Verduras', 'Secos', 'Limpieza'][i % 3])
    expect(columnaCategoriaConfiable(v)).toBe(true)
  })

  it('un valor distinto por fila → no es una columna de secciones', () => {
    const v = Array.from({ length: 200 }, (_, i) => `Marca ${i}`)
    expect(columnaCategoriaConfiable(v)).toBe(false)
  })

  it('planilla chica con varias secciones sigue siendo confiable', () => {
    expect(columnaCategoriaConfiable(['Carnes', 'Lácteos', 'Verduras', 'Secos', 'Bebidas'])).toBe(true)
  })
})
