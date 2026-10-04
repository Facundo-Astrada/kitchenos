import { describe, it, expect } from 'vitest'
import {
  componentesDePlato, componentesDeFicha, indiceCompartidos, compartidosCon, masCompartidos,
  cumpleFiltros, planoDeGrupo, armarGrupos, posicionVentana,
} from './mapaCarta'

// Caso real de Bros (oct 2026): el componente "Cilantro osmosis" (mise, plaza
// fríos) está en pollo frito, mbejú y crema de castañas.
const pr = (receta_id: string, nombre: string, plaza: string | null = null) => ({ receta_id, receta: { nombre }, plaza_efectiva: plaza })
const polloFrito = { id: 'pollo', plato_recetas: [pr('cil', 'Cilantro osmosis', 'frios'), pr('pech', 'Pechuga en bolsa', 'parrilla'), pr('pick', 'Zanahoria pickle', 'frios')] }
const mbeju = { id: 'mbeju', plato_recetas: [pr('cil', 'Cilantro osmosis', 'frios'), pr('ceb', 'Cebolla encurtida', 'frios')] }
const crema = { id: 'crema', plato_recetas: [pr('cil', 'Cilantro osmosis', 'frios'), pr('ceb', 'Cebolla encurtida', 'frios'), pr('cast', 'Crema de castañas')] }
const flan = { id: 'flan', plato_recetas: [] as ReturnType<typeof pr>[] }

describe('componentesDePlato', () => {
  it('lista los componentes del mise con su plaza, sin repetir', () => {
    const c = componentesDePlato({ plato_recetas: [...polloFrito.plato_recetas, pr('cil', 'Cilantro osmosis', 'frios')] })
    expect(c.map(x => [x.clave, x.nombre, x.plaza])).toEqual([
      ['r:cil', 'Cilantro osmosis', 'frios'], ['r:pech', 'Pechuga en bolsa', 'parrilla'], ['r:pick', 'Zanahoria pickle', 'frios'],
    ])
  })
  it('usa la plaza propia si no hay plaza efectiva, y el nombre de la receta si no vino embebida', () => {
    const c = componentesDePlato({ plato_recetas: [{ receta_id: 'x', plaza: 'calientes' }] }, () => 'Fondo oscuro')
    expect(c).toEqual([{ clave: 'r:x', nombre: 'Fondo oscuro', plaza: 'calientes' }])
  })
  it('ignora filas sin receta', () => {
    expect(componentesDePlato({ plato_recetas: [{ receta_id: null }] })).toEqual([])
  })
})

describe('componentesDeFicha', () => {
  it('solo cuentan los componentes de la idea vinculados a una receta', () => {
    const c = componentesDeFicha([{ nombre: 'Cilantro', receta_id: 'cil' }, { nombre: 'Masa nueva', receta_id: null }], id => (id === 'cil' ? 'Cilantro osmosis' : undefined))
    expect(c.map(x => x.nombre)).toEqual(['Cilantro osmosis'])
  })
})

describe('índice y compartidos (caso Bros)', () => {
  const indice = indiceCompartidos([polloFrito, mbeju, crema, flan].map(p => ({ id: p.id, componentes: componentesDePlato(p) })))

  it('pollo frito comparte "Cilantro osmosis" con mbejú y crema de castañas', () => {
    const c = compartidosCon('pollo', indice)
    expect(c.map(x => x.platoId).sort()).toEqual(['crema', 'mbeju'])
    for (const x of c) expect(x.componentes.map(i => i.nombre)).toEqual(['Cilantro osmosis'])
  })

  it('los que comparten más componentes van primero', () => {
    const c = compartidosCon('mbeju', indice)
    expect(c[0].platoId).toBe('crema')
    expect(c[0].componentes.map(i => i.nombre)).toEqual(['Cebolla encurtida', 'Cilantro osmosis'])
  })

  it('un plato sin componentes no comparte nada', () => {
    expect(compartidosCon('flan', indice)).toEqual([])
  })

  it('más compartidos: Cilantro osmosis en 3 platos, después Cebolla encurtida en 2', () => {
    expect(masCompartidos(indice).map(e => [e.componente.nombre, e.platoIds.length])).toEqual([
      ['Cilantro osmosis', 3], ['Cebolla encurtida', 2],
    ])
  })
})

describe('cumpleFiltros', () => {
  it('sin filtros pasa todo', () => expect(cumpleFiltros([], [])).toBe(true))
  it('exige todas las etiquetas, sin importar mayúsculas ni tildes', () => {
    expect(cumpleFiltros(['S/TACC', 'vegano'], ['s/tacc'])).toBe(true)
    expect(cumpleFiltros(['s/tacc'], ['s/tacc', 'vegano'])).toBe(false)
    expect(cumpleFiltros(null, ['keto'])).toBe(false)
  })
})

describe('grupos', () => {
  it('bebidas, vinos y cafetería van a segundo plano; una entrada larga no', () => {
    expect(planoDeGrupo('Bebidas')).toBe('secundario')
    expect(planoDeGrupo('Vinos')).toBe('secundario')
    expect(planoDeGrupo('Cafetería')).toBe('secundario')
    expect(planoDeGrupo('Entradas')).toBe('platos')
  })
  it('Principales primero, después el orden de categorías, grupos vacíos y sueltos, y los secundarios al final', () => {
    const g = armarGrupos(
      [{ nombre: 'Entradas', orden: 0 }, { nombre: 'Principales', orden: 1 }, { nombre: 'Bebidas', orden: 2 }, { nombre: 'Guarnición 2', orden: 3 }, { nombre: 'Cafetería', orden: 4 }],
      [{ categoria: 'Principales' }, { categoria: 'Bebidas' }, { categoria: 'Tapeo' }, { categoria: '' }],
    )
    expect(g.map(x => [x.nombre, x.platos.length])).toEqual([
      ['Principales', 1], ['Entradas', 0], ['Guarnición 2', 0], ['Tapeo', 1], ['Sin grupo', 1], ['Bebidas', 1], ['Cafetería', 0],
    ])
  })
})

describe('posicionVentana', () => {
  const tablero = { width: 1000, height: 700 }
  const ventana = { width: 300, height: 260 }
  it('a la derecha del círculo si entra', () => {
    const p = posicionVentana({ left: 100, top: 200, width: 80, height: 80 }, tablero, ventana)
    expect(p.lado).toBe('derecha')
    expect(p.left).toBe(190)
  })
  it('a la izquierda si a la derecha no entra', () => {
    const p = posicionVentana({ left: 850, top: 200, width: 80, height: 80 }, tablero, ventana)
    expect(p.lado).toBe('izquierda')
    expect(p.left + ventana.width).toBeLessThanOrEqual(850)
  })
  it('debajo si no entra a ningún lado, y nunca se sale del tablero', () => {
    const p = posicionVentana({ left: 150, top: 600, width: 80, height: 80 }, { width: 400, height: 700 }, ventana)
    expect(p.lado).toBe('abajo')
    expect(p.left).toBeGreaterThanOrEqual(10)
    expect(p.left + ventana.width).toBeLessThanOrEqual(390)
  })
  it('se corre para arriba si se saldría por abajo', () => {
    const p = posicionVentana({ left: 100, top: 650, width: 40, height: 40 }, tablero, ventana)
    expect(p.top + ventana.height).toBeLessThanOrEqual(690)
  })
})
