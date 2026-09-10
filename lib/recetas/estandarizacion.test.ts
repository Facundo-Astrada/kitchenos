import { describe, it, expect } from 'vitest'
import { nivelDeReceta, nivelDeComponente, nivelDePlato, analizarCarta } from './estandarizacion'
import type { Receta, Ingrediente } from '@/types'
import type { CartaItemEnriquecido, PlatoRecetaEnriquecido } from '@/lib/hooks/useCarta'

// ── Fixtures mínimas — solo lo que el cálculo mira ──────────────────────
let seq = 0
const nid = () => `id-${seq++}`

function ing(overrides: Partial<Ingrediente> = {}): Ingrediente {
  return {
    id: nid(), receta_id: 'r', nombre: 'ingrediente', cantidad: 1, unidad: 'g',
    costo_unitario: 10, unidad_costo: 'g', producto_id: 'prod-1',
    ...overrides,
  }
}

function receta(overrides: Partial<Receta> = {}): Receta {
  return {
    id: nid(), nombre: 'receta', categoria: 'x', status: 'published',
    restaurante_id: 'rest-1', created_at: '2026-01-01',
    ingredientes: [],
    ...overrides,
  }
}

function platoReceta(overrides: Partial<PlatoRecetaEnriquecido> = {}): PlatoRecetaEnriquecido {
  return {
    id: nid(), plato_id: 'plato-1', receta_id: overrides.receta?.id ?? 'r', porciones: 1, orden: 0,
    costo_calculado: null, gramaje_efectivo_g: null,
    ...overrides,
  }
}

function cartaItem(overrides: Partial<CartaItemEnriquecido> = {}): CartaItemEnriquecido {
  return {
    id: nid(), nombre: 'plato', descripcion: null, procedimiento: null,
    precio_venta: 1000, categoria: 'Principales', receta_id: null, disponible: true,
    foto_url: null, orden: 0, tags: [], restaurante_id: 'rest-1', created_at: '2026-01-01',
    plato_recetas: [], plato_packaging: [], costo_packaging: 0,
    ...overrides,
  }
}

// ── El caso del pizarrón: Ciboulette N1 / Mayonesa N3 ───────────────────
describe('nivelDeReceta — los tres ejemplos del pizarrón', () => {
  it('Ciboulette: solo el nombre, sin ingredientes ni procedimiento → N1', () => {
    const r = receta({ nombre: 'Ciboulette', ingredientes: [], procedimiento: null })
    const d = nivelDeReceta(r)
    expect(d.nivel).toBe(1)
    expect(d.faltantes).toContain('cargar ingredientes')
    expect(d.faltantes).toContain('cargar procedimiento')
  })

  it('Mayonesa: cuerpo completo + peso pesado + todos los ingredientes con costo de producto → N3', () => {
    const r = receta({
      nombre: 'Mayonesa',
      procedimiento: 'Batir huevo con aceite...',
      peso_total_g: 500,
      ingredientes: [ing({ cantidad: 2, unidad: 'u' }), ing({ cantidad: 300, unidad: 'ml' })],
    })
    const d = nivelDeReceta(r)
    expect(d.nivel).toBe(3)
    expect(d.faltantes).toEqual([])
    expect(d.costoVerificado).toBe(true)
    expect(d.costoPorGramo).not.toBeNull()
  })

  it('receta con cuerpo pero sin peso_total_g (solo suma de crudos) → N2, costo no verificado', () => {
    const r = receta({
      nombre: 'Fondo',
      procedimiento: 'Hervir huesos 6 horas',
      ingredientes: [ing({ cantidad: 4000, unidad: 'g' })],
    })
    const d = nivelDeReceta(r)
    expect(d.nivel).toBe(2)
    expect(d.costoVerificado).toBe(false)
    expect(d.faltantes.some(f => f.includes('pesar el resultado final'))).toBe(true)
  })

  it('receta con cuerpo, peso pesado, pero un ingrediente sin costo de producto → N2, no N3', () => {
    const r = receta({
      procedimiento: 'Mezclar',
      peso_total_g: 200,
      ingredientes: [ing(), ing({ producto_id: null, costo_unitario: null, nombre: 'sal' })],
    })
    const d = nivelDeReceta(r)
    expect(d.nivel).toBe(2)
    expect(d.faltantes.some(f => f.includes('costo de 1 ingrediente (sal)'))).toBe(true)
  })

  it('sin receta vinculada → N0', () => {
    const d = nivelDeReceta(undefined)
    expect(d.nivel).toBe(0)
    expect(d.faltantes).toEqual(['vincular una receta'])
  })

  it('receta en borrador → N1 aunque tenga ingredientes y procedimiento', () => {
    const r = receta({ status: 'draft', procedimiento: 'algo', ingredientes: [ing()] })
    expect(nivelDeReceta(r).nivel).toBe(1)
  })
})

// ── Eje componente: el gramaje como peaje N1→N2 ──────────────────────
describe('nivelDeComponente — el gramaje topea aunque la receta sea perfecta', () => {
  const recetaN3 = receta({
    nombre: 'Mayonesa', procedimiento: 'Batir', peso_total_g: 500,
    ingredientes: [ing()],
  })

  it('receta N3 pero sin gramaje cargado en este plato → componente cae a N1', () => {
    const pr = platoReceta({ receta: recetaN3 as Receta & { ingredientes: Ingrediente[] }, gramaje_efectivo_g: null })
    const d = nivelDeComponente(pr)
    expect(d.nivel).toBe(1)
    expect(d.faltantes).toContain('gramaje en este plato')
  })

  it('receta N3 y gramaje conocido → componente N3, sin ruido de "gramaje" en faltantes', () => {
    const pr = platoReceta({ receta: recetaN3 as Receta & { ingredientes: Ingrediente[] }, gramaje_efectivo_g: 25 })
    const d = nivelDeComponente(pr)
    expect(d.nivel).toBe(3)
    expect(d.faltantes).toEqual([])
  })

  it('receta N1 (sin cuerpo) y gramaje conocido → sigue en N1, sin faltante repetido de gramaje', () => {
    const recetaN1 = receta({ nombre: 'Ciboulette', ingredientes: [], procedimiento: null })
    const pr = platoReceta({ receta: recetaN1 as Receta & { ingredientes: Ingrediente[] }, gramaje_efectivo_g: 5 })
    const d = nivelDeComponente(pr)
    expect(d.nivel).toBe(1)
    expect(d.faltantes).not.toContain('gramaje en este plato')
  })

  it('sin receta vinculada al componente → N0, no importa el gramaje', () => {
    const pr = platoReceta({ receta: undefined, gramaje_efectivo_g: 50 })
    expect(nivelDeComponente(pr).nivel).toBe(0)
  })
})

// ── El plato vale lo que vale su componente más flojo ────────────────
describe('nivelDePlato — el mínimo manda, no el promedio', () => {
  it('Puré: papas N2 + ciboulette N1 → el plato es N1 (el mínimo)', () => {
    const pure = receta({ nombre: 'Puré', procedimiento: 'Hervir y pisar', peso_total_g: 1000, ingredientes: [ing()] })
    const papas = receta({ nombre: 'Papas decoración', procedimiento: 'Cortar y freír', peso_total_g: 300, ingredientes: [ing()] })
    const ciboulette = receta({ nombre: 'Ciboulette', ingredientes: [], procedimiento: null })

    const item = cartaItem({
      nombre: 'Puré',
      plato_recetas: [
        platoReceta({ receta: pure as Receta & { ingredientes: Ingrediente[] }, gramaje_efectivo_g: 150 }),
        platoReceta({ receta: papas as Receta & { ingredientes: Ingrediente[] }, gramaje_efectivo_g: 40 }),
        platoReceta({ receta: ciboulette as Receta & { ingredientes: Ingrediente[] }, gramaje_efectivo_g: 2 }),
      ],
    })

    const d = nivelDePlato(item)
    expect(d.nivel).toBe(1)
    expect(d.componentes).toHaveLength(3)
  })

  it('Milanesa: milanesa N2 + mayonesa N3, ambas con gramaje → plato N2', () => {
    const milanesa = receta({ nombre: 'Milanesa', procedimiento: 'Empanar y freír', ingredientes: [ing()] }) // sin peso_total_g → N2
    const mayonesa = receta({ nombre: 'Mayonesa', procedimiento: 'Batir', peso_total_g: 500, ingredientes: [ing()] }) // N3

    const item = cartaItem({
      nombre: 'Milanesa',
      plato_recetas: [
        platoReceta({ receta: milanesa as Receta & { ingredientes: Ingrediente[] }, gramaje_efectivo_g: 180 }),
        platoReceta({ receta: mayonesa as Receta & { ingredientes: Ingrediente[] }, gramaje_efectivo_g: 20 }),
      ],
    })

    expect(nivelDePlato(item).nivel).toBe(2)
  })

  it('plato sin componentes ni receta directa → N0', () => {
    const item = cartaItem({ nombre: 'Vacío', plato_recetas: [], receta_id: null })
    const d = nivelDePlato(item)
    expect(d.nivel).toBe(0)
    expect(d.componentes).toEqual([])
  })

  it('plato con receta_id directa (sin plato_recetas) se trata como un único componente', () => {
    const r = receta({ nombre: 'Sopa', procedimiento: 'Hervir', peso_total_g: 1000, ingredientes: [ing()] })
    const item = cartaItem({ nombre: 'Sopa', receta_id: r.id, receta: r as Receta & { ingredientes: Ingrediente[] }, plato_recetas: [] })
    const d = nivelDePlato(item)
    expect(d.nivel).toBe(3)
    expect(d.componentes).toHaveLength(1)
  })
})

// ── Agregado + cola por palanca ────────────────────────────────────────
describe('analizarCarta — cola ordenada por cuántos platos destraba, no alfabético', () => {
  it('una receta compartida por más platos sube primero en la cola aunque su nombre venga después', () => {
    const chimichurriN1 = receta({ nombre: 'Zzz Chimichurri', ingredientes: [], procedimiento: null })
    const alioliN1 = receta({ nombre: 'Aioli', ingredientes: [], procedimiento: null })

    const items = [
      cartaItem({ nombre: 'Bife', plato_recetas: [platoReceta({ receta: chimichurriN1 as Receta & { ingredientes: Ingrediente[] }, gramaje_efectivo_g: 10 })] }),
      cartaItem({ nombre: 'Vacío', plato_recetas: [platoReceta({ receta: chimichurriN1 as Receta & { ingredientes: Ingrediente[] }, gramaje_efectivo_g: 10 })] }),
      cartaItem({ nombre: 'Papas', plato_recetas: [platoReceta({ receta: chimichurriN1 as Receta & { ingredientes: Ingrediente[] }, gramaje_efectivo_g: 10 })] }),
      cartaItem({ nombre: 'Pollo', plato_recetas: [platoReceta({ receta: alioliN1 as Receta & { ingredientes: Ingrediente[] }, gramaje_efectivo_g: 10 })] }),
    ]

    const a = analizarCarta(items)
    expect(a.cola[0].nombre).toBe('Zzz Chimichurri')
    expect(a.cola[0].platosQueDestraba).toBe(3)
    expect(a.cola[1].nombre).toBe('Aioli')
  })

  it('cuenta componentes y platos por nivel, y platosQueCostean exige nivel >= 2 en todos los componentes', () => {
    const n3 = receta({ nombre: 'Salsa N3', procedimiento: 'x', peso_total_g: 100, ingredientes: [ing()] })
    const n1 = receta({ nombre: 'Guarnición N1', ingredientes: [], procedimiento: null })

    const platoCompleto = cartaItem({
      nombre: 'Completo',
      plato_recetas: [platoReceta({ receta: n3 as Receta & { ingredientes: Ingrediente[] }, gramaje_efectivo_g: 30 })],
    })
    const platoIncompleto = cartaItem({
      nombre: 'Incompleto',
      plato_recetas: [platoReceta({ receta: n1 as Receta & { ingredientes: Ingrediente[] }, gramaje_efectivo_g: 5 })],
    })

    const a = analizarCarta([platoCompleto, platoIncompleto])
    expect(a.totalPlatos).toBe(2)
    expect(a.totalComponentes).toBe(2)
    expect(a.platosPorNivel[3]).toBe(1)
    expect(a.platosPorNivel[1]).toBe(1)
    expect(a.platosQueCostean).toBe(1)
    // El componente ya en N3 no aparece en la cola de trabajo pendiente.
    expect(a.cola.some(c => c.nombre === 'Salsa N3')).toBe(false)
    expect(a.cola.some(c => c.nombre === 'Guarnición N1')).toBe(true)
  })

  it('carta vacía no rompe', () => {
    const a = analizarCarta([])
    expect(a.totalPlatos).toBe(0)
    expect(a.totalComponentes).toBe(0)
    expect(a.cola).toEqual([])
    expect(a.platosQueCostean).toBe(0)
  })
})

// ── Subrecetas: un ingrediente subreceta no tiene producto_id propio ─────
describe('nivelDeReceta — recursión en ingredientes tipo subreceta', () => {
  it('sin recetasPorId, una subreceta cuenta como "sin costo" (comportamiento de hoy, sin recursar)', () => {
    const sub = receta({ nombre: 'Fondo', procedimiento: 'Hervir', peso_total_g: 1000, ingredientes: [ing()] })
    const padre = receta({
      nombre: 'Salsa', procedimiento: 'Reducir', peso_total_g: 300,
      ingredientes: [ing({ subreceta_id: sub.id, tipo: 'subreceta', producto_id: null, costo_unitario: null })],
    })
    const d = nivelDeReceta(padre)
    expect(d.nivel).toBe(2)
    expect(d.faltantes.some(f => f.includes('costo de 1 ingrediente'))).toBe(true)
  })

  it('con recetasPorId y la subreceta en N3, el ingrediente cuenta como resuelto → padre llega a N3', () => {
    const sub = receta({ nombre: 'Fondo', procedimiento: 'Hervir', peso_total_g: 1000, ingredientes: [ing()] })
    const padre = receta({
      nombre: 'Salsa', procedimiento: 'Reducir', peso_total_g: 300,
      ingredientes: [ing({ subreceta_id: sub.id, tipo: 'subreceta', producto_id: null, costo_unitario: null })],
    })
    const mapa = new Map([[sub.id, sub]])
    const d = nivelDeReceta(padre, mapa)
    expect(d.nivel).toBe(3)
    expect(d.faltantes).toEqual([])
  })

  it('con recetasPorId pero la subreceta todavía en N1, el padre queda topeado en N2', () => {
    const sub = receta({ nombre: 'Fondo', ingredientes: [], procedimiento: null }) // N1
    const padre = receta({
      nombre: 'Salsa', procedimiento: 'Reducir', peso_total_g: 300,
      ingredientes: [ing({ subreceta_id: sub.id, tipo: 'subreceta', producto_id: null, costo_unitario: null })],
    })
    const mapa = new Map([[sub.id, sub]])
    const d = nivelDeReceta(padre, mapa)
    expect(d.nivel).toBe(2)
    expect(d.faltantes.some(f => f.includes('costo de 1 ingrediente'))).toBe(true)
  })

  it('un ciclo de subrecetas (dato corrupto) no cuelga — corta en N1', () => {
    const aId = nid()
    const bId = nid()
    const a = receta({ id: aId, nombre: 'A', procedimiento: 'x', peso_total_g: 100, ingredientes: [ing({ subreceta_id: bId, tipo: 'subreceta', producto_id: null, costo_unitario: null })] })
    const b = receta({ id: bId, nombre: 'B', procedimiento: 'x', peso_total_g: 100, ingredientes: [ing({ subreceta_id: aId, tipo: 'subreceta', producto_id: null, costo_unitario: null })] })
    const mapa = new Map([[aId, a], [bId, b]])
    const d = nivelDeReceta(a, mapa)
    // No debe colgarse (timeout del test sería la señal de un bug real acá) — y no puede llegar a N3 con un ciclo sin resolver.
    expect(d.nivel).toBeLessThan(3)
  })
})
