import { describe, it, expect } from 'vitest'
import { calcularMovimiento, tramosDeGrupo, siguienteGrupoLibre, type ItemGrupo } from './grupoUbicacion'

const S = 'sec-a'
const T = 'sec-b'
const it_ = (id: string, orden: number, g: number | null = null, sec = S): ItemGrupo => ({ id, orden, seccion_id: sec, grupo_ubicacion: g })

/** Aplica los cambios y devuelve la sección destino como "id:grupo" en orden. */
function aplicar(items: ItemGrupo[], cambios: ReturnType<typeof calcularMovimiento>, sec = S) {
  const m = new Map(items.map(i => [i.id, { ...i }]))
  for (const c of cambios) Object.assign(m.get(c.id)!, c)
  return [...m.values()]
    .filter(i => i.seccion_id === sec)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .map(i => `${i.id}:${i.grupo_ubicacion ?? '-'}`)
}

describe('calcularMovimiento — agrupar (Ctrl)', () => {
  it('crea un grupo nuevo con un ítem suelto y queda pegado a él', () => {
    const items = [it_('a', 0), it_('b', 1), it_('c', 2), it_('d', 3)]
    const cambios = calcularMovimiento({ destino: items, origen: items, dragged: items[3], overSecId: S, overItemId: 'a', insertAfter: true, agrupar: true })
    expect(aplicar(items, cambios)).toEqual(['a:1', 'd:1', 'b:-', 'c:-'])
  })

  it('se suma a un grupo existente', () => {
    const items = [it_('a', 0, 1), it_('b', 1, 1), it_('c', 2), it_('d', 3)]
    const cambios = calcularMovimiento({ destino: items, origen: items, dragged: items[3], overSecId: S, overItemId: 'b', insertAfter: true, agrupar: true })
    expect(aplicar(items, cambios)).toEqual(['a:1', 'b:1', 'd:1', 'c:-'])
  })

  it('usa el menor número libre para el grupo nuevo', () => {
    const items = [it_('a', 0, 1), it_('b', 1, 1), it_('c', 2), it_('d', 3)]
    const cambios = calcularMovimiento({ destino: items, origen: items, dragged: items[3], overSecId: S, overItemId: 'c', insertAfter: false, agrupar: true })
    expect(aplicar(items, cambios)).toEqual(['a:1', 'b:1', 'd:2', 'c:2'])
  })

  it('cambiarse de grupo disuelve el viejo si queda uno solo', () => {
    const items = [it_('a', 0, 1), it_('b', 1, 1), it_('c', 2, 2), it_('d', 3, 2)]
    const cambios = calcularMovimiento({ destino: items, origen: items, dragged: items[1], overSecId: S, overItemId: 'd', insertAfter: true, agrupar: true })
    expect(aplicar(items, cambios)).toEqual(['a:-', 'c:2', 'd:2', 'b:2'])
  })

  it('agrupar en otra sección trae el ítem y limpia el origen', () => {
    const origen = [it_('a', 0, 1), it_('b', 1, 1)]
    const destino = [it_('x', 0, null, T), it_('y', 1, null, T)]
    const todos = [...origen, ...destino]
    const cambios = calcularMovimiento({ destino, origen, dragged: origen[0], overSecId: T, overItemId: 'y', insertAfter: true, agrupar: true })
    expect(aplicar(todos, cambios, T)).toEqual(['x:-', 'y:1', 'a:1'])
    expect(aplicar(todos, cambios, S)).toEqual(['b:-'])
  })
})

describe('calcularMovimiento — arrastre normal', () => {
  it('reordena dentro del grupo sin sacarlo', () => {
    const items = [it_('a', 0, 1), it_('b', 1, 1), it_('c', 2, 1), it_('d', 3)]
    const cambios = calcularMovimiento({ destino: items, origen: items, dragged: items[2], overSecId: S, overItemId: 'a', insertAfter: false, agrupar: false })
    expect(aplicar(items, cambios)).toEqual(['c:1', 'a:1', 'b:1', 'd:-'])
  })

  it('sacarlo fuera del tramo lo saca del grupo', () => {
    const items = [it_('a', 0, 1), it_('b', 1, 1), it_('c', 2, 1), it_('d', 3)]
    const cambios = calcularMovimiento({ destino: items, origen: items, dragged: items[0], overSecId: S, overItemId: 'd', insertAfter: true, agrupar: false })
    expect(aplicar(items, cambios)).toEqual(['b:1', 'c:1', 'd:-', 'a:-'])
  })

  it('no parte un grupo ajeno: se corre al final del grupo', () => {
    const items = [it_('a', 0, 1), it_('b', 1, 1), it_('c', 2, 1), it_('d', 3)]
    const cambios = calcularMovimiento({ destino: items, origen: items, dragged: items[3], overSecId: S, overItemId: 'a', insertAfter: true, agrupar: false })
    expect(aplicar(items, cambios)).toEqual(['a:1', 'b:1', 'c:1', 'd:-'])
    expect(cambios).toEqual([])
  })

  it('mover a otra sección lo deja suelto', () => {
    const origen = [it_('a', 0, 1), it_('b', 1, 1), it_('c', 2, 1)]
    const destino = [it_('x', 0, 1, T), it_('y', 1, 1, T)]
    const cambios = calcularMovimiento({ destino, origen, dragged: origen[0], overSecId: T, overItemId: null, insertAfter: false, agrupar: false })
    expect(aplicar([...origen, ...destino], cambios, T)).toEqual(['x:1', 'y:1', 'a:-'])
  })

  it('sin cambios no devuelve nada', () => {
    const items = [it_('a', 0), it_('b', 1)]
    expect(calcularMovimiento({ destino: items, origen: items, dragged: items[0], overSecId: S, overItemId: 'b', insertAfter: false, agrupar: false })).toEqual([])
  })
})

describe('tramosDeGrupo', () => {
  it('junta consecutivos y trata un grupo de uno como suelto', () => {
    const items = [it_('a', 0, 1), it_('b', 1, 1), it_('c', 2), it_('d', 3, 2)]
    expect(tramosDeGrupo(items).map(t => [t.grupo, t.items.map(i => i.id).join('')])).toEqual([[1, 'ab'], [null, 'c'], [null, 'd']])
  })
})

describe('siguienteGrupoLibre', () => {
  it('rellena huecos', () => {
    expect(siguienteGrupoLibre([it_('a', 0, 1), it_('b', 1, 3)])).toBe(2)
  })
})
