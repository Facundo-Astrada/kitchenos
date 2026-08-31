import { describe, it, expect } from 'vitest'
import { matchVentasPorCartaItem, gramajePorUnidad } from './consumoTeorico'

// unitConversionFactor se mudó a lib/unidades.ts (día 10 de plan-consolidado.md
// §2) — sus tests viven en lib/unidades.test.ts.

describe('matchVentasPorCartaItem', () => {
  const cartaItems = [
    { id: 'ci-1', nombre: 'Bife de Chorizo' },
    { id: 'ci-2', nombre: 'Ensalada Mixta' },
  ]

  it('matchea por nombre normalizado (case/espacios) y suma cantidades repetidas', () => {
    const ventas = [
      { nombre_plato: 'bife de chorizo', cantidad: 3 },
      { nombre_plato: '  Bife  de   Chorizo ', cantidad: 2 },
      { nombre_plato: 'Ensalada Mixta', cantidad: 5 },
    ]
    const out = matchVentasPorCartaItem(ventas, cartaItems)
    expect(out.get('ci-1')).toBe(5)
    expect(out.get('ci-2')).toBe(5)
  })

  it('ítems de venta sin match en la carta se ignoran, no rompen', () => {
    const ventas = [{ nombre_plato: 'Plato que ya no existe', cantidad: 10 }]
    const out = matchVentasPorCartaItem(ventas, cartaItems)
    expect(out.size).toBe(0)
  })
})

describe('gramajePorUnidad', () => {
  const recetasPorId = new Map([
    ['rec-base', { id: 'rec-base', porciones: 4 }],   // ficha para 4 porciones
    ['rec-guarnicion', { id: 'rec-guarnicion', porciones: 2 }],
    ['rec-vacia', { id: 'rec-vacia', porciones: 4 }], // sin ingredientes cargados
  ])

  it('receta directa (carta_items.receta_id): gramaje = cantidad / porciones', () => {
    const ingredientesPorReceta = new Map([
      ['rec-base', [{ receta_id: 'rec-base', producto_id: 'prod-carne', cantidad: 800, unidad: 'g' }]],
    ])
    const { contribuciones } = gramajePorUnidad('ci-1', 'rec-base', [], recetasPorId, ingredientesPorReceta)
    expect(contribuciones).toEqual([{ producto_id: 'prod-carne', cantidad: 200, unidad: 'g' }]) // 800/4
  })

  it('plato compuesto (plato_recetas): multiplica por el `porciones` de cada sub-receta', () => {
    const ingredientesPorReceta = new Map([
      ['rec-base', [{ receta_id: 'rec-base', producto_id: 'prod-carne', cantidad: 800, unidad: 'g' }]],
      ['rec-guarnicion', [{ receta_id: 'rec-guarnicion', producto_id: 'prod-papa', cantidad: 1000, unidad: 'g' }]],
    ])
    const platoRecetas = [
      { plato_id: 'ci-1', receta_id: 'rec-base', porciones: 1 },
      { plato_id: 'ci-1', receta_id: 'rec-guarnicion', porciones: 2 }, // 2 porciones de guarnición por plato
    ]
    const { contribuciones } = gramajePorUnidad('ci-1', null, platoRecetas, recetasPorId, ingredientesPorReceta)
    expect(contribuciones).toContainEqual({ producto_id: 'prod-carne', cantidad: 200, unidad: 'g' }) // 800/4 × 1
    expect(contribuciones).toContainEqual({ producto_id: 'prod-papa', cantidad: 1000, unidad: 'g' })  // 1000/2 × 2
  })

  it('ingrediente subreceta (sin producto_id) no aporta contribución', () => {
    const ingredientesPorReceta = new Map([
      ['rec-base', [
        { receta_id: 'rec-base', producto_id: 'prod-carne', cantidad: 800, unidad: 'g' },
        { receta_id: 'rec-base', producto_id: null, cantidad: 1, unidad: 'porcion' }, // subreceta
      ]],
    ])
    const { contribuciones } = gramajePorUnidad('ci-1', 'rec-base', [], recetasPorId, ingredientesPorReceta)
    expect(contribuciones).toHaveLength(1)
    expect(contribuciones[0].producto_id).toBe('prod-carne')
  })

  it('sin receta vinculada ni plato_recetas: sin contribuciones (caso "no se puede calcular")', () => {
    const { contribuciones } = gramajePorUnidad('ci-1', null, [], recetasPorId, new Map())
    expect(contribuciones).toEqual([])
  })

  it('receta vinculada pero sin ingredientes cargados: sin contribuciones', () => {
    const { contribuciones } = gramajePorUnidad('ci-1', 'rec-vacia', [], recetasPorId, new Map())
    expect(contribuciones).toEqual([])
  })
})
