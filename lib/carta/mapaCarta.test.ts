import { describe, it, expect } from 'vitest'
import {
  claveIngrediente, itemsDePlato, indiceCompartidos, compartidosCon, masCompartidos,
  cumpleFiltros, formaDeGrupo, armarGrupos, posicionVentana, itemsDeFicha, type RecetaParaMapa,
} from './mapaCarta'

// Caso real de Bros (oct 2026): pollo frito, mbejú y crema de castañas llevan
// cilantro — el componente compartido es la receta "Cilantro osmosis".
const cilantroOsmosis = { id: 'r-cil', nombre: 'Cilantro osmosis', ingredientes: [] }
const chimi = { id: 'r-chimi', nombre: 'Chimi Crunch', ingredientes: [
  { nombre: 'Cilantro (tallos)' }, { nombre: 'Ajo' }, { nombre: 'Sal' }, { nombre: 'Aceite de oliva' },
] }
const tatemada = { id: 'r-tat', nombre: 'Salsa tatemada', ingredientes: [{ nombre: 'cilantro ( hoja y tallo )' }, { nombre: 'Tomate' }] }
const pechuga = { id: 'r-pech', nombre: 'Pechuga en bolsa', ingredientes: [{ nombre: 'Pollo' }, { nombre: 'Ajo' }, { nombre: 'Sal' }] }

const comp = (r: { id: string; nombre: string; ingredientes: RecetaParaMapa['ingredientes'] }) => ({ receta_id: r.id, receta: r })

const polloFrito = { id: 'pollo', plato_recetas: [comp(cilantroOsmosis), comp(pechuga)] }
const mbeju = { id: 'mbeju', plato_recetas: [comp(cilantroOsmosis), comp(tatemada)] }
const crema = { id: 'crema', plato_recetas: [comp(cilantroOsmosis), comp(chimi)] }
const flan = { id: 'flan', plato_recetas: [] as ReturnType<typeof comp>[] }

describe('claveIngrediente', () => {
  it('unifica las formas de escribir el mismo ingrediente', () => {
    expect(claveIngrediente('Cilantro (tallos)')).toBe('cilantro')
    expect(claveIngrediente('cilantro ( hoja y tallo )')).toBe('cilantro')
    expect(claveIngrediente('cilantro fresco')).toBe('cilantro')
    expect(claveIngrediente('Cilantro')).toBe('cilantro')
  })
  it('no confunde ingredientes distintos', () => {
    expect(claveIngrediente('Cilantro osmosis')).toBe('cilantro osmosis')
    expect(claveIngrediente('Ajíes encurtidos')).toBe('ajies encurtidos')
  })
  it('paréntesis sin cerrar o texto vacío', () => {
    expect(claveIngrediente('Perejil (picado')).toBe('perejil')
    expect(claveIngrediente('  ')).toBe('')
  })
})

describe('itemsDePlato', () => {
  it('trae los componentes y los ingredientes de adentro, sin básicos ni repetidos', () => {
    const items = itemsDePlato(crema)
    expect(items.map(i => i.clave)).toEqual(['r:r-cil', 'r:r-chimi', 'i:cilantro', 'i:ajo'])
    expect(items.find(i => i.clave === 'r:r-cil')!.via).toBe('componente')
    expect(items.some(i => i.clave === 'i:sal' || i.clave === 'i:aceite de oliva')).toBe(false)
  })
  it('baja a las subrecetas usando recetaPorId', () => {
    const base = { nombre: 'Base verde', ingredientes: [{ nombre: 'Menta' }] }
    const salsa = { id: 'r-salsa', nombre: 'Salsa', ingredientes: [{ nombre: 'Base verde', subreceta_id: 'r-base' }] }
    const items = itemsDePlato({ plato_recetas: [comp(salsa)] }, id => (id === 'r-base' ? base : undefined))
    expect(items.map(i => i.clave)).toEqual(['r:r-salsa', 'r:r-base', 'i:menta'])
    expect(items[1].nombre).toBe('Base verde')
  })
  it('componente sin receta cargada usa recetaPorId, y sin nada no rompe', () => {
    expect(itemsDePlato({ plato_recetas: [{ receta_id: 'x' }] }, () => ({ nombre: 'Pickle' }))[0].nombre).toBe('Pickle')
    expect(itemsDePlato({ plato_recetas: [{ receta_id: null }] })).toEqual([])
  })
})

describe('índice y compartidos (caso Bros)', () => {
  const platos = [polloFrito, mbeju, crema, flan].map(p => ({ id: p.id, items: itemsDePlato(p) }))
  const indice = indiceCompartidos(platos)

  it('pollo frito comparte "Cilantro osmosis" con mbejú y crema de castañas', () => {
    const c = compartidosCon('pollo', indice)
    expect(c.map(x => x.platoId).sort()).toEqual(['crema', 'mbeju'])
    for (const x of c) expect(x.items.map(i => i.nombre)).toContain('Cilantro osmosis')
  })

  it('mbejú y crema además comparten el cilantro de sus salsas (vía ingrediente) y van primero', () => {
    const c = compartidosCon('mbeju', indice)
    expect(c[0].platoId).toBe('crema')
    expect(c[0].items.map(i => i.clave)).toEqual(['r:r-cil', 'i:cilantro'])
  })

  it('un plato sin componentes no comparte nada', () => {
    expect(compartidosCon('flan', indice)).toEqual([])
  })

  it('lo más compartido arriba, los componentes antes que los ingredientes a igual cantidad', () => {
    const top = masCompartidos(indice)
    expect(top[0].item.nombre).toBe('Cilantro osmosis')
    expect(top[0].platoIds).toHaveLength(3)
  })

  it('un ingrediente que está en casi todos los platos no vincula; un componente sí', () => {
    const mk = (id: string) => ({ id, items: [{ clave: 'i:ajo', nombre: 'Ajo', via: 'ingrediente' as const }, { clave: 'r:base', nombre: 'Base', via: 'componente' as const }] })
    const idx = indiceCompartidos(['a', 'b', 'c', 'd', 'e', 'f'].map(mk))
    expect(idx.comunes.map(i => i.nombre)).toEqual(['Ajo'])
    expect(idx.porItem.has('r:base')).toBe(true)
    expect(compartidosCon('a', idx)[0].items.map(i => i.clave)).toEqual(['r:base'])
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
  it('bebidas y listas largas van en franja', () => {
    expect(formaDeGrupo('Bebidas', 3)).toBe('franja')
    expect(formaDeGrupo('Vinos', 1)).toBe('franja')
    expect(formaDeGrupo('Entradas', 20)).toBe('franja')
    expect(formaDeGrupo('Principales', 5)).toBe('grupo')
  })
  it('respeta el orden de categorías, muestra grupos vacíos, abre grupo para categorías sueltas y pone franjas primero', () => {
    const g = armarGrupos(
      [{ nombre: 'Principales', orden: 1 }, { nombre: 'Entradas', orden: 0 }, { nombre: 'Bebidas', orden: 2 }, { nombre: 'Guarnición 2', orden: 3 }],
      [{ categoria: 'Principales' }, { categoria: 'Bebidas' }, { categoria: 'Tapeo' }, { categoria: '' }],
    )
    expect(g.map(x => [x.nombre, x.platos.length])).toEqual([
      ['Bebidas', 1], ['Entradas', 0], ['Principales', 1], ['Guarnición 2', 0], ['Tapeo', 1], ['Sin grupo', 1],
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

describe('itemsDeFicha', () => {
  it('componentes vinculados cuentan como componente; los sueltos aportan ingredientes', () => {
    const items = itemsDeFicha([
      { receta_id: 'r-cil', ingredientes: [] },
      { receta_id: null, ingredientes: [{ nombre: 'Cilantro fresco', receta_id: null }, { nombre: 'Sal', receta_id: null }, { nombre: 'Fondo', receta_id: 'r-fondo' }] },
    ], id => ({ 'r-cil': { nombre: 'Cilantro osmosis' }, 'r-fondo': { nombre: 'Fondo oscuro' } } as Record<string, RecetaParaMapa>)[id])
    expect(items.map(i => [i.clave, i.nombre])).toEqual([
      ['r:r-cil', 'Cilantro osmosis'], ['i:cilantro', 'Cilantro'], ['r:r-fondo', 'Fondo oscuro'],
    ])
  })
})

describe('compartidosCon sin redundancia', () => {
  it('si comparten el chimichurri, no repite el ajo del chimichurri; sí muestra el ajo que viene de otro lado', () => {
    const chimi2 = { id: 'r-ch', nombre: 'Chimichurri', ingredientes: [{ nombre: 'Ajo' }, { nombre: 'Orégano' }] }
    const marinada = { id: 'r-mar', nombre: 'Marinada', ingredientes: [{ nombre: 'Ajo' }] }
    const asado = { id: 'asado', plato_recetas: [comp(chimi2)] }
    const chori = { id: 'chori', plato_recetas: [comp(chimi2)] }
    const pollo = { id: 'pollo2', plato_recetas: [comp(chimi2), comp(marinada)] }
    const vacio = { id: 'vacio', plato_recetas: [comp(marinada)] }
    const idx = indiceCompartidos([asado, chori, pollo, vacio].map(p => ({ id: p.id, items: itemsDePlato(p) })), 1)
    const deAsado = compartidosCon('asado', idx)
    expect(deAsado.find(c => c.platoId === 'chori')!.items.map(i => i.nombre)).toEqual(['Chimichurri'])
    // el pollo trae ajo también por la marinada, que el asado no tiene → el ajo del asado viene solo del chimi compartido: no se muestra
    expect(deAsado.find(c => c.platoId === 'pollo2')!.items.map(i => i.nombre)).toEqual(['Chimichurri'])
    // vacío no comparte preparación con el asado, pero sí el ajo
    expect(deAsado.find(c => c.platoId === 'vacio')!.items.map(i => i.nombre)).toEqual(['Ajo'])
  })
})

describe('orden de compartidos', () => {
  it('una preparación compartida pesa más que varios ingredientes sueltos', () => {
    const mk = (id: string, items: [string, 'componente' | 'ingrediente'][]) =>
      ({ id, items: items.map(([n, via]) => ({ clave: (via === 'componente' ? 'r:' : 'i:') + n, nombre: n, via })) })
    const idx = indiceCompartidos([
      mk('pollo', [['cil', 'componente'], ['ajo', 'ingrediente'], ['leche', 'ingrediente'], ['msa', 'ingrediente']]),
      mk('mbeju', [['cil', 'componente']]),
      mk('mila', [['ajo', 'ingrediente'], ['leche', 'ingrediente'], ['msa', 'ingrediente']]),
    ], 1)
    expect(compartidosCon('pollo', idx).map(c => c.platoId)).toEqual(['mbeju', 'mila'])
  })
})
