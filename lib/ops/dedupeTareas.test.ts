import { describe, it, expect } from 'vitest'
import { normalizarTitulo, claveTarea, fusionarDuplicados, tareaExistentePara, esProduccionDelDia } from './dedupeTareas'
import type { Tarea } from '@/types'

const HOY = '2026-08-26'

let seq = 0
function tarea(over: Partial<Tarea> = {}): Tarea {
  seq++
  return {
    id: `t${seq}`,
    titulo: 'Trucha curada',
    status: 'pendiente',
    prioridad: 'alta',
    categoria: 'produccion',
    modo: 'carta',
    plaza: 'parrilla',
    seccion: 'caliente',
    estado: 'pendiente',
    turno_fecha: HOY,
    restaurante_id: 'r1',
    created_at: `2026-08-26T12:00:0${seq}.000Z`,
    ...over,
  } as Tarea
}

describe('normalizarTitulo', () => {
  it('iguala acentos, mayúsculas y espacios de más', () => {
    expect(normalizarTitulo('Crema Ácida  Casera ')).toBe(normalizarTitulo('crema acida casera'))
  })
})

describe('claveTarea', () => {
  it('ignora la categoría — pase_turno y produccion son el mismo trabajo', () => {
    expect(claveTarea(tarea({ categoria: 'pase_turno' }))).toBe(claveTarea(tarea({ categoria: 'produccion' })))
  })

  it('ignora el vínculo con el mise — la fila del lote de un menú no lo tiene', () => {
    const delLote = tarea({ modo: 'menu', plaza: null, seccion: 'Apetizer', menu_id: 'm1', checklist_item_id: null })
    const delMise = tarea({ modo: 'menu', plaza: null, seccion: 'apetizer', menu_id: 'm1', checklist_item_id: 'ci-1' })
    expect(claveTarea(delLote)).toBe(claveTarea(delMise))
  })

  it('separa la misma preparación en dos plazas — son dos columnas del board', () => {
    expect(claveTarea(tarea({ plaza: 'parrilla' }))).not.toBe(claveTarea(tarea({ plaza: 'calientes' })))
  })

  it('separa días distintos — el carryover de ayer sigue siendo su propia fila', () => {
    expect(claveTarea(tarea())).not.toBe(claveTarea(tarea({ turno_fecha: '2026-08-25' })))
  })

  it('separa dos menús distintos con la misma preparación', () => {
    const a = tarea({ modo: 'menu', plaza: null, seccion: 'pasta', menu_id: 'm1' })
    const b = tarea({ modo: 'menu', plaza: null, seccion: 'pasta', menu_id: 'm2' })
    expect(claveTarea(a)).not.toBe(claveTarea(b))
  })
})

describe('fusionarDuplicados', () => {
  // El caso Bros del 26/8: tres inserts a milisegundos por un triple tap.
  it('deja una sola fila cuando el mismo tilde entró tres veces', () => {
    const g = [tarea(), tarea(), tarea()]
    const { filas, ocultosIds } = fusionarDuplicados(g)
    expect(filas).toHaveLength(1)
    expect(ocultosIds).toHaveLength(2)
  })

  // "lo que queda de un turno se duplica con lo que marca el que ingresa":
  // con dos turnos por día el pase cae sobre la MISMA turno_fecha.
  it('fusiona el pase del turno anterior con la producción del que entra', () => {
    const delAlmuerzo = tarea({ id: 'a', categoria: 'produccion', estado: 'listo', checklist_item_id: 'ci-1' })
    const paraLaCena = tarea({ id: 'b', categoria: 'pase_turno', estado: 'pendiente', checklist_item_id: 'ci-1' })
    const { filas } = fusionarDuplicados([delAlmuerzo, paraLaCena])
    expect(filas.map(f => f.id)).toEqual(['b'])
  })

  it('prefiere la fila vinculada al mise aunque sea más vieja', () => {
    const delLote = tarea({ id: 'lote', checklist_item_id: null, created_at: '2026-08-26T23:00:00.000Z' })
    const delMise = tarea({ id: 'mise', checklist_item_id: 'ci-1', created_at: '2026-08-26T09:00:00.000Z' })
    const { filas, gemelosPorId } = fusionarDuplicados([delLote, delMise])
    expect(filas.map(f => f.id)).toEqual(['mise'])
    expect(gemelosPorId.get('mise')).toEqual(['lote', 'mise'])
  })

  // La fila representa al grupo, pero se dibuja donde estaba la PRIMERA
  // gemela: fusionar no puede reordenar el board bajo el dedo del cocinero.
  it('la fila queda en el lugar de la primera gemela', () => {
    const a = tarea({ id: 'a' })
    const otra = tarea({ id: 'otra', titulo: 'Pan' })
    const b = tarea({ id: 'b' })
    expect(fusionarDuplicados([a, otra, b]).filas.map(f => f.id)).toEqual(['b', 'otra'])
  })

  it('no toca lo que no está duplicado', () => {
    const t = [tarea({ titulo: 'Pan' }), tarea({ titulo: 'Trucha curada' })]
    const { filas, gemelosPorId, ocultosIds } = fusionarDuplicados(t)
    expect(filas).toHaveLength(2)
    expect(gemelosPorId.size).toBe(0)
    expect(ocultosIds).toEqual([])
  })
})

describe('tareaExistentePara', () => {
  it('encuentra la del mismo ítem del mise aunque ya esté tildada', () => {
    const listo = tarea({ id: 'x', checklist_item_id: 'ci-1', estado: 'listo' })
    const hallada = tareaExistentePara([listo], { titulo: 'Trucha curada', turno_fecha: HOY, modo: 'carta', plaza: 'parrilla', checklist_item_id: 'ci-1' })
    expect(hallada?.id).toBe('x')
  })

  it('encuentra la del mismo ítem aunque venga con otra categoría', () => {
    const pase = tarea({ id: 'p', checklist_item_id: 'ci-1', categoria: 'pase_turno' })
    const hallada = tareaExistentePara([pase], { titulo: 'Trucha curada', turno_fecha: HOY, modo: 'carta', plaza: 'parrilla', checklist_item_id: 'ci-1' })
    expect(hallada?.id).toBe('p')
  })

  // La fila que dejó "activar el menú por fecha" no tiene checklist_item_id:
  // el tilde del mise tiene que adoptarla, no ponerse al lado.
  it('adopta la fila del lote de un menú, que no tiene vínculo con el mise', () => {
    const delLote = tarea({ id: 'lote', modo: 'menu', plaza: null, seccion: 'Apetizer', menu_id: 'm1', checklist_item_id: null, titulo: 'Garbanzos fritos' })
    const hallada = tareaExistentePara([delLote], {
      titulo: 'Garbanzos fritos', turno_fecha: HOY, modo: 'menu', plaza: null, seccion: 'apetizer', menu_id: 'm1', checklist_item_id: 'ci-9',
    })
    expect(hallada?.id).toBe('lote')
  })

  it('no confunde la misma preparación de otra plaza', () => {
    const enCalientes = tarea({ id: 'c', plaza: 'calientes', checklist_item_id: 'ci-otro' })
    const hallada = tareaExistentePara([enCalientes], { titulo: 'Trucha curada', turno_fecha: HOY, modo: 'carta', plaza: 'parrilla', checklist_item_id: 'ci-1' })
    expect(hallada).toBeNull()
  })

  it('no confunde el mismo ítem de otro día', () => {
    const ayer = tarea({ id: 'y', turno_fecha: '2026-08-25', checklist_item_id: 'ci-1' })
    const hallada = tareaExistentePara([ayer], { titulo: 'Trucha curada', turno_fecha: HOY, modo: 'carta', plaza: 'parrilla', checklist_item_id: 'ci-1' })
    expect(hallada).toBeNull()
  })

  it('ignora las subtareas', () => {
    const sub = tarea({ id: 's', parent_id: 'padre', checklist_item_id: 'ci-1' })
    const hallada = tareaExistentePara([sub], { titulo: 'Trucha curada', turno_fecha: HOY, modo: 'carta', plaza: 'parrilla', checklist_item_id: 'ci-1' })
    expect(hallada).toBeNull()
  })
})

// La regla se aplica ahora dentro de useTareas.agregarTarea, por donde pasan
// todas las pantallas que crean producción. Este es el borde: qué entra a la
// regla y qué no.
describe('esProduccionDelDia — qué queda dentro de la regla', () => {
  it('la producción del día entra', () => {
    expect(esProduccionDelDia(tarea())).toBe(true)
  })

  it('el pase de turno entra — es el mismo trabajo pedido de otra forma', () => {
    expect(esProduccionDelDia(tarea({ categoria: 'pase_turno' }))).toBe(true)
  })

  it('una nota de pedido NO entra: no tiene jornada ni es producción', () => {
    expect(esProduccionDelDia(tarea({ categoria: 'pedido_nota', turno_fecha: null }))).toBe(false)
  })

  // Lo que se escribe a mano en el Pase o el Calendario. Dos anotaciones con el
  // mismo texto son dos anotaciones: juntarlas sería borrarle una al que la puso.
  it('una anotación libre NO entra', () => {
    expect(esProduccionDelDia(tarea({ categoria: 'general' }))).toBe(false)
  })

  it('una subtarea NO entra: cuelga de su padre, no ocupa fila propia', () => {
    expect(esProduccionDelDia(tarea({ parent_id: 'padre' }))).toBe(false)
  })

  it('una tarea suelta sin jornada NO entra', () => {
    expect(esProduccionDelDia(tarea({ turno_fecha: null }))).toBe(false)
  })
})
