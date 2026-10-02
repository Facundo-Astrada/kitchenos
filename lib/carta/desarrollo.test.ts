import { describe, it, expect } from 'vitest'
import {
  numerarLineas, recortarPorRangos, normalizarFichaIA, buscarRecetaExistente,
  vincularFicha, resumenTanda, correrConLimite, preguntasAbiertas, datosSinConfirmar,
} from './desarrollo'

// Notas reales del chef — cada una rompe una suposición distinta.
const PASTA = `Pasta rellena de carne

Hacer con roast beef cortado a cuchillo súper braseado con mirepoix básico y fondo de verduras oscuro
Agregar gelatina para tener un relleno no tan líquido si no más bien glutinoso o gelatinoso
Mucho pimiento y tomate
Usaría un molde grande para la pasta`

const PAPINES = `Papines confitados
En aceite con pimentón a baja temperatura
Cremoso el papin como una papa natural
Ralladura de limón con aceite de confitura
Se prueba`

// Sin nombre de plato, un porcentaje mezclado con pesos y una abreviatura ("msa").
const SIN_NOMBRE = `10 por ciento romanito
1 kg calabaza
1 kg ricotta
60 gr msa`

const TODO = `${PASTA}\n\n${PAPINES}\n\n${SIN_NOMBRE}`

describe('numerarLineas', () => {
  it('numera cada línea desde 1, incluidas las vacías', () => {
    expect(numerarLineas('a\n\nb')).toBe('1: a\n2: \n3: b')
  })
  it('tolera CRLF (notas pegadas desde Windows)', () => {
    expect(numerarLineas('a\r\nb')).toBe('1: a\n2: b')
  })
})

describe('recortarPorRangos', () => {
  it('separa tres notas pegadas juntas con los rangos de la IA', () => {
    const lineas = TODO.split('\n')
    const iPapines = lineas.indexOf('Papines confitados') + 1
    const iSin = lineas.indexOf('10 por ciento romanito') + 1
    const r = recortarPorRangos(TODO, [
      { nombre: 'Pasta rellena de carne', desde: 1, hasta: iPapines - 2 },
      { nombre: 'Papines confitados', desde: iPapines, hasta: iSin - 2 },
      { nombre: '', desde: iSin, hasta: lineas.length },
    ])
    expect(r).toHaveLength(3)
    expect(r[0].texto).toBe(PASTA)
    expect(r[1].texto).toBe(PAPINES)
    expect(r[2].texto).toBe(SIN_NOMBRE)
    expect(r[2].nombre_tentativo).toBe('')
  })

  it('no pierde líneas que ningún rango cubre: se pegan al plato anterior', () => {
    const texto = 'Plato A\nuno\ndos\nPlato B\ntres'
    const r = recortarPorRangos(texto, [
      { nombre: 'A', desde: 1, hasta: 2 },
      { nombre: 'B', desde: 4, hasta: 5 },
    ])
    expect(r[0].texto).toBe('Plato A\nuno\ndos')
    expect(r[1].texto).toBe('Plato B\ntres')
    const todo = r.map(x => x.texto).join('\n')
    expect(todo).toContain('dos')
  })

  it('una línea suelta antes del primer rango va al primer plato', () => {
    const r = recortarPorRangos('suelta\nA\nuno', [{ nombre: 'A', desde: 2, hasta: 3 }])
    expect(r).toHaveLength(1)
    expect(r[0].texto).toBe('suelta\nA\nuno')
  })

  it('rangos solapados: cada línea queda con un solo plato', () => {
    const r = recortarPorRangos('a\nb\nc\nd', [
      { nombre: 'X', desde: 1, hasta: 3 },
      { nombre: 'Y', desde: 3, hasta: 4 },
    ])
    expect(r[0].texto).toBe('a\nb\nc')
    expect(r[1].texto).toBe('d')
  })

  it('rangos fuera del texto o desordenados se acomodan', () => {
    const r = recortarPorRangos('a\nb', [
      { nombre: 'Y', desde: 2, hasta: 99 },
      { nombre: 'X', desde: 0, hasta: 1 },
    ])
    expect(r.map(x => x.texto)).toEqual(['a', 'b'])
  })

  it('sin rangos válidos devuelve todo el texto como un solo plato', () => {
    const r = recortarPorRangos(PASTA, [])
    expect(r).toEqual([{ nombre_tentativo: '', texto: PASTA }])
  })

  it('texto vacío no devuelve platos', () => {
    expect(recortarPorRangos('  \n ', [{ nombre: 'x', desde: 1, hasta: 2 }])).toEqual([])
  })
})

describe('normalizarFichaIA', () => {
  const pasta = {
    nombre: 'Pasta rellena de carne',
    nombre_sugerido: false,
    descripcion: 'Relleno de roast beef braseado, gelatinoso, en pasta de molde grande',
    categoria: 'Pastas',
    componentes: [
      {
        nombre: 'Relleno',
        origen: 'chef',
        ingredientes: [
          { nombre: 'Roast beef', cantidad: null, unidad: null, cantidad_origen: null, texto_cantidad: null },
          { nombre: 'Pimiento', cantidad: null, unidad: null, cantidad_origen: null, texto_cantidad: 'mucho' },
          { nombre: 'Gelatina', cantidad: 5, unidad: 'g', cantidad_origen: 'ia', texto_cantidad: null },
        ],
        procedimiento: [{ texto: 'Brasear súper el roast beef, cortar a cuchillo', origen: 'chef' }],
        nota_despacho: null,
      },
      { nombre: 'Pasta', origen: 'ia', ingredientes: [], procedimiento: [{ texto: 'Usar molde grande', origen: 'chef' }], nota_despacho: null },
    ],
    armado: null,
    preguntas: [
      { texto: '¿Qué salsa lleva?', componente: null },
      { texto: '¿Cuánta gelatina por kg?', componente: 'relleno' },
    ],
  }

  it('una cantidad vaga queda aprox y sin número inventado', () => {
    const { ficha } = normalizarFichaIA(pasta)
    const pimiento = ficha.componentes[0].ingredientes.find(i => i.nombre === 'Pimiento')!
    expect(pimiento.cantidad).toBeNull()
    expect(pimiento.aprox).toBe(true)
    expect(pimiento.texto_cantidad).toBe('mucho')
    expect(pimiento.cantidad_origen).toBeNull()
  })

  it('una cantidad sugerida por la IA conserva su origen ia', () => {
    const { ficha } = normalizarFichaIA(pasta)
    const gel = ficha.componentes[0].ingredientes.find(i => i.nombre === 'Gelatina')!
    expect(gel.cantidad).toBe(5)
    expect(gel.cantidad_origen).toBe('ia')
    expect(gel.aprox).toBe(false)
  })

  it('la pregunta se ancla al componente por nombre, sin importar mayúsculas', () => {
    const { ficha } = normalizarFichaIA(pasta)
    const p = ficha.preguntas.find(q => q.texto.includes('gelatina'))!
    expect(p.componente_id).toBe(ficha.componentes[0].id)
    expect(ficha.preguntas.find(q => q.texto.includes('salsa'))!.componente_id).toBeNull()
  })

  it('el chef nombró el plato: no se agrega la pregunta del nombre', () => {
    const { ficha, nombre } = normalizarFichaIA(pasta)
    expect(nombre).toBe('Pasta rellena de carne')
    expect(ficha.preguntas.some(q => q.texto.includes('se llama'))).toBe(false)
  })

  it('nota sin nombre de plato: la IA propone uno y queda la pregunta', () => {
    const { nombre, ficha } = normalizarFichaIA({
      nombre: 'Relleno de calabaza y ricotta',
      nombre_sugerido: true,
      componentes: [{
        nombre: 'Relleno',
        origen: 'chef',
        ingredientes: [
          { nombre: 'Calabaza', cantidad: 1, unidad: 'kg', cantidad_origen: 'chef', texto_cantidad: null },
          { nombre: 'Ricotta', cantidad: 1, unidad: 'kg', cantidad_origen: 'chef', texto_cantidad: null },
          { nombre: 'Romanito', cantidad: 10, unidad: '%', cantidad_origen: 'chef', texto_cantidad: null },
          { nombre: 'msa', cantidad: 60, unidad: 'g', cantidad_origen: 'chef', texto_cantidad: null },
        ],
        procedimiento: [], nota_despacho: null,
      }],
      preguntas: [{ texto: '¿"msa" es masa? ¿De qué es?', componente: 'Relleno' }],
    })
    expect(nombre).toBe('Relleno de calabaza y ricotta')
    expect(ficha.preguntas[0].texto).toBe('¿Cómo se llama el plato?')
    // el porcentaje se conserva como número + unidad %
    const rom = ficha.componentes[0].ingredientes.find(i => i.nombre === 'Romanito')!
    expect(rom.cantidad).toBe(10)
    expect(rom.unidad).toBe('%')
    // la abreviatura ambigua NO se "corrige" en silencio
    expect(ficha.componentes[0].ingredientes.some(i => i.nombre === 'msa')).toBe(true)
  })

  it('sin nombre ni propuesta usa el nombre tentativo del paso de separar', () => {
    const { nombre, ficha } = normalizarFichaIA({ componentes: [] }, 'Papines confitados')
    expect(nombre).toBe('Papines confitados')
    expect(ficha.preguntas[0].texto).toBe('¿Cómo se llama el plato?')
  })

  it('respuesta basura no rompe: ficha vacía', () => {
    for (const basura of [null, undefined, 'hola', 42, [], { componentes: 'x' }]) {
      const r = normalizarFichaIA(basura)
      expect(r.ficha.componentes).toEqual([])
      expect(r.nombre).toBe('Plato sin nombre')
    }
  })

  it('descarta ingredientes sin nombre y cantidades no positivas', () => {
    const { ficha } = normalizarFichaIA({
      nombre: 'X',
      componentes: [{
        nombre: 'C', origen: 'chef', procedimiento: [], nota_despacho: null,
        ingredientes: [
          { nombre: '', cantidad: 5 },
          { nombre: 'Sal', cantidad: -2, unidad: 'g', cantidad_origen: 'chef' },
          { nombre: 'Ajo', cantidad: 0, unidad: 'g' },
        ],
      }],
    })
    expect(ficha.componentes[0].ingredientes.map(i => [i.nombre, i.cantidad, i.unidad])).toEqual([
      ['Sal', null, null], ['Ajo', null, null],
    ])
  })
})

describe('buscarRecetaExistente', () => {
  const recetas = [
    { id: 'r1', nombre: 'Fondo oscuro' },
    { id: 'r2', nombre: 'Salsa de tomate' },
    { id: 'r3', nombre: 'Mirepoix' },
    { id: 'r4', nombre: 'Masa al huevo' },
    { id: 'r5', nombre: 'Fondo' },
  ]

  it('vincula "fondo de verduras oscuro" con la receta más específica "Fondo oscuro"', () => {
    expect(buscarRecetaExistente('fondo de verduras oscuro', recetas)?.id).toBe('r1')
  })

  it('"tomate" NO se vincula con "Salsa de tomate" (el chef escribió menos que la receta)', () => {
    expect(buscarRecetaExistente('tomate', recetas)).toBeNull()
  })

  it('"mirepoix básico" se vincula con "Mirepoix"', () => {
    expect(buscarRecetaExistente('mirepoix básico', recetas)?.id).toBe('r3')
  })

  it('coincidencia exacta gana, sin importar tildes ni mayúsculas', () => {
    expect(buscarRecetaExistente('MASA AL HUEVO', recetas)?.id).toBe('r4')
    expect(buscarRecetaExistente('Fondo', recetas)?.id).toBe('r5')
  })

  it('empate entre dos recetas igual de específicas: ambiguo, no vincula', () => {
    const dos = [{ id: 'a', nombre: 'Fondo claro' }, { id: 'b', nombre: 'Fondo oscuro' }]
    expect(buscarRecetaExistente('fondo claro oscuro', dos)).toBeNull()
  })

  it('texto vacío o solo palabras vacías no vincula', () => {
    expect(buscarRecetaExistente('', recetas)).toBeNull()
    expect(buscarRecetaExistente('de la', recetas)).toBeNull()
  })
})

describe('vincularFicha + resumenTanda', () => {
  it('completa receta_id en componentes e ingredientes y cuenta las bases reutilizadas', () => {
    const recetas = [{ id: 'r1', nombre: 'Fondo oscuro' }, { id: 'r3', nombre: 'Mirepoix' }]
    const { ficha: base } = normalizarFichaIA({
      nombre: 'Pasta',
      componentes: [{
        nombre: 'Relleno', origen: 'chef', procedimiento: [], nota_despacho: null,
        ingredientes: [
          { nombre: 'Fondo de verduras oscuro' },
          { nombre: 'Mirepoix básico' },
          { nombre: 'Roast beef' },
        ],
      }],
      preguntas: [{ texto: '¿Salsa?', componente: null }],
    })
    const { ficha, resumen } = vincularFicha(base, recetas)
    expect(ficha.componentes[0].ingredientes.map(i => i.receta_id)).toEqual(['r1', 'r3', null])
    expect(resumen.basesReutilizadas.sort()).toEqual(['Fondo oscuro', 'Mirepoix'])

    const t = resumenTanda([{ ficha }, { ficha }], [...resumen.basesReutilizadas, 'Mirepoix'])
    expect(t).toEqual({ platos: 2, preguntasAbiertas: 2, bases: expect.arrayContaining(['Fondo oscuro', 'Mirepoix']) })
    expect(t.bases).toHaveLength(2)
  })

  it('no pisa un vínculo puesto a mano', () => {
    const { ficha: base } = normalizarFichaIA({
      nombre: 'X',
      componentes: [{ nombre: 'Relleno', origen: 'chef', procedimiento: [], nota_despacho: null,
        ingredientes: [{ nombre: 'Fondo oscuro' }] }],
    })
    base.componentes[0].ingredientes[0].receta_id = 'manual'
    const { ficha } = vincularFicha(base, [{ id: 'r1', nombre: 'Fondo oscuro' }])
    expect(ficha.componentes[0].ingredientes[0].receta_id).toBe('manual')
  })
})

describe('correrConLimite', () => {
  it('nunca supera el límite en vuelo y devuelve en orden', async () => {
    let enVuelo = 0
    let maximo = 0
    const r = await correrConLimite([1, 2, 3, 4, 5, 6, 7], 3, async n => {
      enVuelo++
      maximo = Math.max(maximo, enVuelo)
      await new Promise(res => setTimeout(res, 5 * (8 - n)))
      enVuelo--
      return n * 10
    })
    expect(r).toEqual([10, 20, 30, 40, 50, 60, 70])
    expect(maximo).toBe(3)
  })
  it('lista vacía no cuelga', async () => {
    expect(await correrConLimite([], 4, async () => 1)).toEqual([])
  })
})

describe('preguntasAbiertas / datosSinConfirmar', () => {
  it('cuenta lo pendiente: preguntas sin resolver y datos que puso la IA', () => {
    const { ficha } = normalizarFichaIA({
      nombre: 'X',
      componentes: [{
        nombre: 'Masa', origen: 'ia', nota_despacho: null,
        ingredientes: [{ nombre: 'Harina', cantidad: 500, unidad: 'g', cantidad_origen: 'ia', texto_cantidad: null }],
        procedimiento: [{ texto: 'Amasar', origen: 'ia' }, { texto: 'Estirar', origen: 'chef' }],
      }],
      armado: { texto: 'Plato hondo', origen: 'ia' },
      preguntas: [{ texto: 'a', componente: null }, { texto: 'b', componente: null }],
    })
    expect(preguntasAbiertas(ficha)).toBe(2)
    ficha.preguntas[0].resuelta = true
    expect(preguntasAbiertas(ficha)).toBe(1)
    expect(datosSinConfirmar(ficha)).toBe(4) // componente + cantidad + 1 paso + armado
  })
})
