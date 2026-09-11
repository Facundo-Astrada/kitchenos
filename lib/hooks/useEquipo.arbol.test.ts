import { describe, it, expect, vi } from 'vitest'
import type { Puesto } from './useEquipo'

vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))

import { construirArbolPuestos, idsDescendientes } from './useEquipo'

const P = (id: string, reportaA: string | null, orden = 0, nombre = id): Puesto => ({
  id, nombre, descripcion: null, tareas_funciones: [], permisos_app: [],
  nivel: 'cocinero', plaza_default: null, ver_costos: false,
  reporta_a_puesto_id: reportaA, area_key: 'cocina', orden,
  objetivos: {} as Puesto['objetivos'],
  restaurante_id: 'r1', created_at: '2026-01-01',
})

const nombres = (ns: { nombre: string }[]) => ns.map(n => n.nombre)

describe('construirArbolPuestos', () => {
  it('sin puestos devuelve un árbol vacío', () => {
    expect(construirArbolPuestos([])).toEqual([])
  })

  it('anida los hijos bajo su padre', () => {
    const arbol = construirArbolPuestos([
      P('chef', null), P('sous', 'chef'), P('parrilla', 'sous'),
    ])
    expect(nombres(arbol)).toEqual(['chef'])
    expect(nombres(arbol[0].hijos)).toEqual(['sous'])
    expect(nombres(arbol[0].hijos[0].hijos)).toEqual(['parrilla'])
  })

  // La razón por la que existe el fallback: un puesto borrado no se lleva
  // puestos a la tumba.
  it('un puesto que reporta a uno inexistente cae como raíz, no se pierde', () => {
    const arbol = construirArbolPuestos([P('chef', null), P('huerfano', 'borrado-hace-meses')])
    expect(nombres(arbol).sort()).toEqual(['chef', 'huerfano'])
  })

  it('un puesto que se reporta a sí mismo cae como raíz en vez de colgar el render', () => {
    const arbol = construirArbolPuestos([P('raro', 'raro')])
    expect(nombres(arbol)).toEqual(['raro'])
    expect(arbol[0].hijos).toEqual([])
  })

  it('ordena raíces e hijos por `orden` y desempata por nombre', () => {
    const arbol = construirArbolPuestos([
      P('b', null, 1), P('a', null, 0),
      P('z', 'a', 5), P('m', 'a', 5), P('c', 'a', 1),
    ])
    expect(nombres(arbol)).toEqual(['a', 'b'])
    expect(nombres(arbol[0].hijos)).toEqual(['c', 'm', 'z'])
  })

  it('no pierde ningún puesto: la suma de nodos del árbol es la entrada', () => {
    const puestos = [P('a', null), P('b', 'a'), P('c', 'b'), P('d', null), P('e', 'nope')]
    const contar = (ns: { hijos: unknown[] }[]): number =>
      ns.reduce((n, x) => n + 1 + contar(x.hijos as { hijos: unknown[] }[]), 0)
    expect(contar(construirArbolPuestos(puestos))).toBe(puestos.length)
  })

  it('no muta el array de entrada', () => {
    const puestos = [P('b', null, 1), P('a', null, 0)]
    const copia = puestos.map(p => p.id)
    construirArbolPuestos(puestos)
    expect(puestos.map(p => p.id)).toEqual(copia)
  })
})

describe('idsDescendientes', () => {
  const cadena = [P('chef', null), P('sous', 'chef'), P('parrilla', 'sous'), P('ayudante', 'parrilla')]

  it('baja por toda la cadena, no solo un nivel', () => {
    expect([...idsDescendientes('chef', cadena)].sort())
      .toEqual(['ayudante', 'parrilla', 'sous'])
  })

  it('una hoja no tiene descendientes', () => {
    expect(idsDescendientes('ayudante', cadena).size).toBe(0)
  })

  it('no se incluye a sí mismo (uno puede seguir siendo su propia referencia)', () => {
    expect(idsDescendientes('sous', cadena).has('sous')).toBe(false)
  })

  // Para esto existe la función: que el select de "reporta a" no ofrezca a
  // alguien que ya está debajo.
  it('un ciclo ya existente en los datos no la cuelga', () => {
    const ciclo = [P('a', 'c'), P('b', 'a'), P('c', 'b')]
    const r = idsDescendientes('a', ciclo)
    expect([...r].sort()).toEqual(['a', 'b', 'c'])
  })
})
