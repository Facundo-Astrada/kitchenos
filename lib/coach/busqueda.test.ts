import { describe, it, expect } from 'vitest'
import { puntuar, buscar, ganadorClaro, etiquetaDesambiguacion } from './busqueda'

// Los casos no son inventados: salen de consultar la base de producción
// (sep 2026) con las tres preguntas que el Coach contestaba mal.

describe('puntuar — tildes', () => {
  it('encuentra "Mbejú" buscando "mbeju" (el ilike de Postgres no lo hacía)', () => {
    expect(puntuar({ nombre: 'Mbejú' }, 'mbeju')).toBeGreaterThan(0)
  })

  it('encuentra "Mbeju" buscando "mbejú" — funciona en los dos sentidos', () => {
    expect(puntuar({ nombre: 'Mbeju' }, 'mbejú')).toBeGreaterThan(0)
  })

  it('colapsa la ñ: "noquis" encuentra "Ñoquis"', () => {
    expect(puntuar({ nombre: 'Ñoquis de papa' }, 'noquis')).toBeGreaterThan(0)
  })

  it('el nombre exacto puntúa más alto que una coincidencia parcial', () => {
    expect(puntuar({ nombre: 'Mbejú' }, 'mbeju'))
      .toBeGreaterThan(puntuar({ nombre: 'Mbejú relleno de jamón' }, 'mbeju'))
  })
})

describe('puntuar — categoría', () => {
  it('"carne" alcanza un corte por su categoría, no por su nombre', () => {
    // El caso que rompía: "Vacío" no contiene la palabra "carne" en ningún lado.
    expect(puntuar({ nombre: 'Vacío', categoria: 'Carnes' }, 'carne')).toBeGreaterThan(0)
  })

  it('tolera el plural en los dos sentidos', () => {
    expect(puntuar({ nombre: 'Tomate perita', categoria: 'Verduras' }, 'tomates')).toBeGreaterThan(0)
    expect(puntuar({ nombre: 'Papas', categoria: 'Verduras' }, 'papa')).toBeGreaterThan(0)
  })

  it('un match por nombre gana sobre uno por categoría', () => {
    const porNombre = puntuar({ nombre: 'Carne molida', categoria: 'Carnes' }, 'carne')
    const porCategoria = puntuar({ nombre: 'Vacío', categoria: 'Carnes' }, 'carne')
    expect(porNombre).toBeGreaterThan(porCategoria)
  })

  it('no arrastra productos de otra categoría', () => {
    expect(puntuar({ nombre: 'Lavandina', categoria: 'Limpieza' }, 'carne')).toBe(0)
  })
})

describe('puntuar — varias palabras', () => {
  it('prefiere el que tiene todos los términos', () => {
    const oliva = puntuar({ nombre: 'Aceite de oliva extra virgen', categoria: 'Aceites' }, 'aceite de oliva')
    const girasol = puntuar({ nombre: 'Aceite de girasol', categoria: 'Aceites' }, 'aceite de oliva')
    expect(oliva).toBeGreaterThan(girasol)
  })

  it('igual devuelve algo si solo pega parte de la frase', () => {
    expect(puntuar({ nombre: 'Aceite de girasol', categoria: 'Aceites' }, 'aceite de oliva')).toBeGreaterThan(0)
  })
})

describe('buscar', () => {
  const productos = [
    { nombre: 'Carne Picada Especial', categoria: 'Carnes' },
    { nombre: 'Vacío', categoria: 'Carnes' },
    { nombre: 'Asado de tira', categoria: 'Carnes' },
    { nombre: 'Lavandina', categoria: 'Limpieza' },
    { nombre: 'Tomate perita', categoria: 'Verduras' },
  ]

  it('"carne" trae los 3 cortes y ninguno de limpieza', () => {
    const res = buscar(productos, 'carne')
    expect(res).toHaveLength(3)
    expect(res.map(r => r.item.nombre)).not.toContain('Lavandina')
  })

  it('ordena por relevancia: el que lo tiene en el nombre va primero', () => {
    expect(buscar(productos, 'carne')[0].item.nombre).toBe('Carne Picada Especial')
  })

  it('devuelve vacío cuando no hay nada parecido', () => {
    expect(buscar(productos, 'langostinos')).toHaveLength(0)
  })

  it('respeta el límite', () => {
    expect(buscar(productos, 'carne', 2)).toHaveLength(2)
  })
})

describe('ganadorClaro', () => {
  it('con una sola coincidencia, esa es', () => {
    expect(ganadorClaro(buscar([{ nombre: 'Mbejú' }], 'mbeju'))?.nombre).toBe('Mbejú')
  })

  it('duplicados con el MISMO nombre no son ambigüedad: devuelve el primero', () => {
    // Bros tiene "Mbejú" cargado 4 veces. Listarle 4 opciones idénticas al
    // usuario para que elija era el bug, no la solución.
    const res = buscar([{ nombre: 'Mbejú' }, { nombre: 'Mbejú' }, { nombre: 'Mbejú' }], 'mbeju')
    expect(ganadorClaro(res)?.nombre).toBe('Mbejú')
  })

  it('nombres distintos empatados sí son ambiguos: hay que preguntar', () => {
    const res = buscar([{ nombre: 'Salsa criolla' }, { nombre: 'Salsa golf' }], 'salsa')
    expect(ganadorClaro(res)).toBeNull()
  })

  it('sin coincidencias no hay ganador', () => {
    expect(ganadorClaro([])).toBeNull()
  })
})

describe('etiquetaDesambiguacion', () => {
  it('agrega lo que distingue a dos filas con el mismo nombre', () => {
    expect(etiquetaDesambiguacion({ nombre: 'Mbejú', categoria: 'Panadería' }, '8 porciones'))
      .toBe('Mbejú (Panadería, 8 porciones)')
  })

  it('dice "sin categoría" en vez de dejar el hueco', () => {
    expect(etiquetaDesambiguacion({ nombre: 'Mbeju', categoria: null })).toBe('Mbeju (sin categoría)')
  })
})

describe('puntuar - alias (composicion de un plato de la carta)', () => {
  // El plato de Bros se llama "Mbeju" a secas pero lleva girgolas asadas.
  const plato = { nombre: 'Mbeju', categoria: 'Entradas', alias: 'Cebolla encurtida Mbeju Ajies encurtidos Cilantro osmosis Salsa tatemada Girgolas asadas' }

  it('lo encuentra por un componente que no esta en el nombre', () => {
    expect(puntuar(plato, 'girgolas')).toBeGreaterThan(0)
  })

  it('encuentra "mbeju de girgolas", que no es el nombre de nada', () => {
    expect(puntuar(plato, 'mbeju de girgolas')).toBeGreaterThan(0)
  })

  it('el nombre sigue pesando mas que un componente', () => {
    expect(puntuar(plato, 'mbeju')).toBeGreaterThan(puntuar(plato, 'girgolas'))
  })

  it('encuentra "el de girgolas": las palabras vacias no pueden tapar la util', () => {
    expect(puntuar(plato, 'el de girgolas')).toBeGreaterThan(0)
  })

  it('no arrastra platos que no lo llevan', () => {
    expect(puntuar({ nombre: 'Provoleta', categoria: 'Entradas', alias: 'Provolone Oregano' }, 'girgolas')).toBe(0)
  })

  it('sin alias se comporta igual que antes', () => {
    expect(puntuar({ nombre: 'Mbeju', categoria: 'Entradas' }, 'girgolas')).toBe(0)
  })
})
