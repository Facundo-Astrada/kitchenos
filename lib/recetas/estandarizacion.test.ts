import { describe, it, expect } from 'vitest'
import { nivelDeReceta, nivelDeComponente, nivelDePlato, nivelDeMenu, analizarCarta } from './estandarizacion'
import type { Receta, Ingrediente } from '@/types'
import type { CartaItemEnriquecido, PlatoRecetaEnriquecido } from '@/lib/hooks/useCarta'
import type { MenuPreparacion } from '@/lib/hooks/useMenus'

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

function menuPrep(overrides: Partial<MenuPreparacion> = {}): MenuPreparacion {
  return {
    id: nid(), menu_id: 'menu-1', paso: 'paso-1', tipo: 'receta', ref_id: null, nombre: 'preparación',
    prioridad: 'media', plaza: null, seccion_mise: null, usuario_asignado: null,
    cantidad: null, unidad: null, variante: null, cantidad_ops: null, unidad_ops: null,
    recipiente_nombre: null, peso_porcion: null, peso_porcion_unidad: null,
    orden: 0, nota: null, dias_antes: 0,
    ...overrides,
  }
}

function menu(overrides: Partial<{ id: string; nombre: string; preparaciones: MenuPreparacion[] }> = {}) {
  return { id: nid(), nombre: 'menú', preparaciones: [], ...overrides }
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

// ── Menús — la segunda fuente de componentes (sep 2026) ─────────────────
describe('nivelDeMenu — menu_preparaciones con la misma escala que un plato', () => {
  it('tipo receta resuelta + peso_porcion cargado → N3 si la receta detrás también llega', () => {
    const r = receta({ nombre: 'Fondo', procedimiento: 'Hervir', peso_total_g: 1000, ingredientes: [ing()] })
    const m = menu({ preparaciones: [menuPrep({ tipo: 'receta', ref_id: r.id, nombre: 'Fondo', peso_porcion: 200, peso_porcion_unidad: 'g' })] })
    const mapa = new Map([[r.id, r]])
    const d = nivelDeMenu(m, mapa)
    expect(d.nivel).toBe(3)
  })

  it('tipo receta sin gramaje (ni peso_porcion ni cantidad en peso/volumen) → tapa en N1', () => {
    const r = receta({ nombre: 'Fondo', procedimiento: 'Hervir', peso_total_g: 1000, ingredientes: [ing()] })
    const m = menu({ preparaciones: [menuPrep({ tipo: 'receta', ref_id: r.id, nombre: 'Fondo', cantidad: 2, unidad: 'porc' })] })
    const mapa = new Map([[r.id, r]])
    const d = nivelDeMenu(m, mapa)
    expect(d.nivel).toBe(1)
    expect(d.faltantes).toContain('gramaje en este menú')
  })

  it('gramaje derivado de cantidad+unidad cuando no hay peso_porcion (ej. 300 g)', () => {
    const r = receta({ nombre: 'Fondo', procedimiento: 'Hervir', peso_total_g: 1000, ingredientes: [ing()] })
    const m = menu({ preparaciones: [menuPrep({ tipo: 'receta', ref_id: r.id, nombre: 'Fondo', cantidad: 300, unidad: 'g' })] })
    const mapa = new Map([[r.id, r]])
    expect(nivelDeMenu(m, mapa).nivel).toBe(3)
  })

  it('tipo producto se excluye — no cuenta como componente a estandarizar', () => {
    const m = menu({ preparaciones: [menuPrep({ tipo: 'producto', ref_id: 'prod-1', nombre: 'Pan casero' })] })
    const d = nivelDeMenu(m)
    expect(d.componentes).toHaveLength(0)
    expect(d.nivel).toBe(0)
  })

  it('preparación sin tipo ni ref_id (nunca vinculada) → N0, no se oculta', () => {
    const m = menu({ preparaciones: [menuPrep({ tipo: null, ref_id: null, nombre: 'Sopa Juliana' })] })
    const d = nivelDeMenu(m)
    expect(d.componentes).toHaveLength(1)
    expect(d.componentes[0].diag.nivel).toBe(0)
  })

  it('menú sin preparaciones relevantes → N0', () => {
    expect(nivelDeMenu(menu()).nivel).toBe(0)
  })
})

describe('analizarCarta con menús — misma cola, misma lista', () => {
  it('una receta usada en un plato Y en un menú se agrupa en una sola fila de la cola', () => {
    const chimichurri = receta({ nombre: 'Chimichurri', ingredientes: [], procedimiento: null }) // N1
    const item = cartaItem({
      nombre: 'Bife',
      plato_recetas: [platoReceta({ receta: chimichurri as Receta & { ingredientes: Ingrediente[] }, gramaje_efectivo_g: 10 })],
    })
    const m = menu({
      nombre: 'Menú Ejecutivo',
      preparaciones: [menuPrep({ tipo: 'receta', ref_id: chimichurri.id, nombre: 'Chimichurri', cantidad: 50, unidad: 'g' })],
    })
    const mapa = new Map([[chimichurri.id, chimichurri]])

    const a = analizarCarta([item], mapa, [m])
    expect(a.cola).toHaveLength(1)
    expect(a.cola[0].nombre).toBe('Chimichurri')
    expect(a.cola[0].platosQueDestraba).toBe(2) // "Bife" + "Menú Ejecutivo"
    expect(a.cola[0].platos.sort()).toEqual(['Bife', 'Menú Ejecutivo'].sort())
  })

  it('primerId/primerTipo apuntan al plato cuando la receta aparece primero ahí (orden: platos antes que menús)', () => {
    const salsa = receta({ nombre: 'Salsa', ingredientes: [], procedimiento: null })
    const item = cartaItem({ id: 'plato-x', plato_recetas: [platoReceta({ receta: salsa as Receta & { ingredientes: Ingrediente[] }, gramaje_efectivo_g: 5 })] })
    const m = menu({ id: 'menu-x', preparaciones: [menuPrep({ tipo: 'receta', ref_id: salsa.id, nombre: 'Salsa', cantidad: 20, unidad: 'g' })] })
    const a = analizarCarta([item], new Map([[salsa.id, salsa]]), [m])
    expect(a.cola[0].primerTipo).toBe('plato')
    expect(a.cola[0].primerId).toBe('plato-x')
  })

  it('totalMenus y totalPlatos se cuentan por separado; sin menús, totalMenus es 0 (compat con useRutaImplantacion)', () => {
    const item = cartaItem({})
    expect(analizarCarta([item]).totalMenus).toBe(0)
    expect(analizarCarta([item], undefined, [menu()]).totalMenus).toBe(1)
  })

  it('platosPorNivel cuenta también los menús cuando se pasan (ej: 1 plato N0 + 1 menú N0 = 2 en el bucket 0)', () => {
    const a = analizarCarta([cartaItem({ plato_recetas: [] })], undefined, [menu()])
    expect(a.platosPorNivel[0]).toBe(2)
  })
})

describe('nivelDeMenu — tipo "plato" (el menú reusa un plato entero de la carta)', () => {
  it('resuelve al nivel real del plato referenciado, no a "sin receta"', () => {
    const r = receta({ nombre: 'Chimichurri', procedimiento: 'x', ingredientes: [ing()] }) // N2 (sin peso_total_g)
    const plato = cartaItem({
      id: 'asado-1', nombre: 'Asado de Tira al Rescoldo',
      plato_recetas: [platoReceta({ receta: r as Receta & { ingredientes: Ingrediente[] }, gramaje_efectivo_g: 20 })],
    })
    const m = menu({ preparaciones: [menuPrep({ tipo: 'plato', ref_id: 'asado-1', nombre: 'Asado de Tira al Rescoldo' })] })
    const cartaItemsPorId = new Map([[plato.id, plato]])

    const d = nivelDeMenu(m, undefined, cartaItemsPorId)
    expect(d.nivel).toBe(2) // el nivel real del plato, no 0
    expect(d.componentes[0].nombre).toBe('Asado de Tira al Rescoldo')
  })

  it('sin cartaItemsPorId, o si el plato no aparece ahí, cae a N0 en vez de romper', () => {
    const m = menu({ preparaciones: [menuPrep({ tipo: 'plato', ref_id: 'no-existe', nombre: 'Fantasma' })] })
    expect(nivelDeMenu(m).nivel).toBe(0)
    expect(nivelDeMenu(m, undefined, new Map()).nivel).toBe(0)
  })

  it('en la cola, el "arreglo" de un plato reusado en un menú apunta al PLATO, no al menú', () => {
    const r = receta({ nombre: 'Chimichurri', ingredientes: [], procedimiento: null }) // N1
    const plato = cartaItem({ id: 'asado-1', nombre: 'Asado de Tira', plato_recetas: [platoReceta({ receta: r as Receta & { ingredientes: Ingrediente[] }, gramaje_efectivo_g: 20 })] })
    const m = menu({ id: 'menu-1', nombre: 'Noche de Asado', preparaciones: [menuPrep({ tipo: 'plato', ref_id: 'asado-1', nombre: 'Asado de Tira' })] })

    const a = analizarCarta([plato], undefined, [m])
    const filaDelPlatoReusado = a.cola.find(c => c.nombre === 'Asado de Tira')
    expect(filaDelPlatoReusado).toBeDefined()
    expect(filaDelPlatoReusado!.primerTipo).toBe('plato')
    expect(filaDelPlatoReusado!.primerId).toBe('asado-1') // no 'menu-1'
  })

  it('la resolución de tipo:"plato" no se degrada si items llega filtrado — usa cartaItemsPorId explícito', () => {
    const r = receta({ nombre: 'Chimichurri', procedimiento: 'x', peso_total_g: 100, ingredientes: [ing()] }) // N3
    const plato = cartaItem({ id: 'asado-1', nombre: 'Asado', plato_recetas: [platoReceta({ receta: r as Receta & { ingredientes: Ingrediente[] }, gramaje_efectivo_g: 20 })] })
    const m = menu({ preparaciones: [menuPrep({ tipo: 'plato', ref_id: 'asado-1', nombre: 'Asado' })] })
    const cartaItemsPorIdCompleto = new Map([[plato.id, plato]])

    // items llega VACÍO (como si el plato hubiera quedado afuera de un filtro de categoría)
    // pero cartaItemsPorId explícito sigue trayendo el plato real.
    const a = analizarCarta([], undefined, [m], cartaItemsPorIdCompleto)
    expect(a.platosPorNivel[3]).toBe(1) // el menú resuelve N3, no N0
  })
})
