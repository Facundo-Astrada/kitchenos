import { describe, it, expect } from 'vitest'
import { plazasDelArea, sugeridosParaArea } from './suplentes'

const puestos = [
  { area_key: 'cocina', plaza_default: 'parrilla' },
  { area_key: 'cocina', plaza_default: 'frios' },
  { area_key: 'cocina', plaza_default: 'parrilla' },
  { area_key: 'cocina', plaza_default: null },
  { area_key: 'compras_almacen', plaza_default: null },
  { area_key: 'salon', plaza_default: 'salon' },
]
const miembros = [{ id: 'facu' }, { id: 'zoe' }, { id: 'tamara' }, { id: 'julian' }, { id: 'aixa' }]

const cubre: Record<string, string[]> = {
  facu: ['parrilla', 'frios'],
  zoe: ['frios'],
  tamara: ['pasteleria'],   // autónoma, pero en una plaza que ningún puesto de Cocina lleva
  julian: ['parrilla'],
}
const plazasQueCubre = (id: string) => cubre[id] ?? []

describe('plazasDelArea', () => {
  it('las plaza_default de los puestos del área, sin repetir ni nulas', () => {
    expect(plazasDelArea('cocina', puestos)).toEqual(['parrilla', 'frios'])
  })
  it('un área sin plazas devuelve vacío', () => {
    expect(plazasDelArea('compras_almacen', puestos)).toEqual([])
  })
})

describe('sugeridosParaArea', () => {
  it('autónomos en alguna plaza del área', () => {
    expect(sugeridosParaArea({ areaKey: 'cocina', puestos, miembros, plazasQueCubre }))
      .toEqual(['facu', 'zoe', 'julian'])
  })

  it('no sugiere a los titulares ni a los ya confirmados', () => {
    expect(sugeridosParaArea({ areaKey: 'cocina', puestos, miembros, plazasQueCubre, excluir: ['facu', 'zoe'] }))
      .toEqual(['julian'])
  })

  it('quien solo cubre plazas de otra área no entra', () => {
    expect(sugeridosParaArea({ areaKey: 'cocina', puestos, miembros, plazasQueCubre })).not.toContain('tamara')
  })

  it('un área sin plazas no sugiere a nadie: los suplentes ahí son a mano', () => {
    expect(sugeridosParaArea({ areaKey: 'compras_almacen', puestos, miembros, plazasQueCubre })).toEqual([])
  })
})
