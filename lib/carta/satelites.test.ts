import { describe, it, expect } from 'vitest'
import {
  vinculosDe, basesMasCompartidas, cantidadDeSatelites, platosSueltos, centroSugerido, posicionesOrbita,
  type PlatoSatelite,
} from './satelites'

const chimi = { id: 'b-chimi', nombre: 'Chimichurri' }
const fondo = { id: 'b-fondo', nombre: 'Fondo oscuro' }
const papas = { id: 'b-papas', nombre: 'Papas confitadas' }
const pesto = { id: 'b-pesto', nombre: 'Pesto' }

function plato(id: string, categoria: string, bases: typeof chimi[], extra: Partial<PlatoSatelite> = {}): PlatoSatelite {
  return { id, nombre: id, categoria, bases, ...extra }
}

const bife = plato('Bife de chorizo', 'Principales', [chimi, papas])
const provoleta = plato('Provoleta', 'Entradas', [chimi])
const lomo = plato('Lomo', 'Principales', [fondo, papas])
const pasta = plato('Pasta rellena', 'Principales', [fondo])
const flan = plato('Flan', 'Postres', [])
const todos = [bife, provoleta, lomo, pasta, flan]

describe('vinculosDe', () => {
  it('lista los platos que comparten alguna base y cuáles', () => {
    const v = vinculosDe(bife, todos)
    expect(v.map(x => x.plato.id)).toEqual(['Lomo', 'Provoleta'])
    expect(v.find(x => x.plato.id === 'Provoleta')!.compartidas).toEqual([chimi])
    expect(v.find(x => x.plato.id === 'Lomo')!.compartidas).toEqual([papas])
  })

  it('los que comparten más bases van primero', () => {
    const a = plato('A', 'Principales', [chimi, papas, fondo])
    const b = plato('B', 'Entradas', [chimi])
    const c = plato('C', 'Entradas', [chimi, papas])
    expect(vinculosDe(a, [a, b, c]).map(x => x.plato.id)).toEqual(['C', 'B'])
  })

  it('un plato sin bases no tiene satélites, y no se vincula consigo mismo', () => {
    expect(vinculosDe(flan, todos)).toEqual([])
    expect(vinculosDe(bife, [bife]).length).toBe(0)
  })

  it('una base repetida dentro del mismo plato no cuenta dos veces', () => {
    const a = plato('A', 'Principales', [chimi, chimi])
    const b = plato('B', 'Entradas', [chimi, chimi])
    expect(vinculosDe(a, [a, b])[0].compartidas).toHaveLength(1)
  })

  it('las ideas en desarrollo entran como satélites y conservan la marca', () => {
    const idea = plato('Idea', 'Entradas', [fondo], { enDesarrollo: true })
    const v = vinculosDe(pasta, [pasta, idea])
    expect(v[0].plato.enDesarrollo).toBe(true)
  })
})

describe('basesMasCompartidas', () => {
  it('ordena por cantidad de platos y descarta las que usa uno solo', () => {
    const r = basesMasCompartidas(todos)
    expect(r.map(x => [x.base.id, x.platos.length])).toEqual([['b-chimi', 2], ['b-fondo', 2], ['b-papas', 2]])
    expect(r.some(x => x.base.id === 'b-pesto')).toBe(false)
  })
  it('minPlatos sube el umbral', () => {
    expect(basesMasCompartidas(todos, 3)).toEqual([])
  })
  it('un plato que repite una base no la infla', () => {
    const a = plato('A', 'x', [pesto, pesto])
    expect(basesMasCompartidas([a])).toEqual([])
  })
})

describe('cantidadDeSatelites / platosSueltos / centroSugerido', () => {
  const cant = cantidadDeSatelites(todos)
  it('cuenta platos distintos, no bases', () => {
    expect(cant.get('Bife de chorizo')).toBe(2)   // Provoleta (chimi) + Lomo (papas)
    expect(cant.get('Lomo')).toBe(2)              // Bife (papas) + Pasta (fondo)
    expect(cant.get('Flan')).toBe(0)
  })
  it('sueltos: ningún vínculo', () => {
    expect(platosSueltos(todos).map(p => p.id)).toEqual(['Flan'])
  })
  it('el centro sugerido es el principal con más satélites (desempata por nombre)', () => {
    expect(centroSugerido(todos)?.id).toBe('Bife de chorizo')
  })
  it('sin principales, el plato con más satélites', () => {
    expect(centroSugerido([provoleta, bife])?.id).toBe('Bife de chorizo')
  })
  it('carta vacía: null', () => {
    expect(centroSugerido([])).toBeNull()
  })
})

describe('posicionesOrbita', () => {
  it('lista vacía, sin posiciones', () => {
    expect(posicionesOrbita([])).toEqual([])
  })
  it('respeta el máximo y deja todo dentro del cuadrado', () => {
    const pos = posicionesOrbita(Array(30).fill(1), 12)
    expect(pos).toHaveLength(12)
    for (const p of pos) {
      expect(p.x).toBeGreaterThan(5); expect(p.x).toBeLessThan(95)
      expect(p.y).toBeGreaterThan(5); expect(p.y).toBeLessThan(95)
    }
  })
  it('más bases compartidas = más cerca del centro', () => {
    const [fuerte, flojo] = posicionesOrbita([3, 1])
    expect(fuerte.radio).toBeLessThan(flojo.radio)
  })
  it('todos igual de fuertes: mismo anillo (hasta 8 nodos) y ángulos distintos', () => {
    const pos = posicionesOrbita([1, 1, 1, 1])
    expect(new Set(pos.map(p => p.radio)).size).toBe(1)
    expect(new Set(pos.map(p => p.angulo)).size).toBe(4)
  })
  it('un solo satélite queda arriba del centro', () => {
    const [p] = posicionesOrbita([2])
    expect(p.x).toBeCloseTo(50)
    expect(p.y).toBeLessThan(50)
  })
})
