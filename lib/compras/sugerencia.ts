import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularSugerenciaProduccion } from '@/lib/produccion/sugerencia'
import { unitConversionFactor } from '@/lib/unidades'
import { diasHastaProximaEntrega } from '@/lib/proveedores/proximaEntrega'

export interface SugerenciaCompraItem {
  productoId: string
  nombre: string
  unidad: string
  consumoPrevisto: number
  stockActual: number
  stockSeguridad: number
  precioUnitario: number
  aPedir: number
}

export interface GrupoProveedorCompra {
  proveedorId: string | null
  proveedorNombre: string
  diasHastaEntrega: number | null
  items: SugerenciaCompraItem[]
}

export interface SugerenciaCompraResultado {
  fechaObjetivo: string
  factorDemanda: number
  narracionFactor: string | null
  recetasSinPorciones: number
  grupos: GrupoProveedorCompra[]
}

/**
 * Motor de sugerencia de compra (PLAN-4-CAPAS B10 parte B). Parte de la
 * sugerencia de producción (ya con el factor de demanda de reservas
 * aplicado, B10 parte A) y la traduce a "qué comprar" por producto:
 *
 *   consumo_previsto = Σ (producción sugerida de cada receta × cantidad de
 *                         ese producto en `ingredientes`, escalada por
 *                         receta.porciones)
 *   stock_seguridad  = stock_minimo × 1.25   (no existe columna — B2 lo
 *                       define como fórmula, no como campo)
 *   objetivo         = consumo_previsto + stock_seguridad
 *   a_pedir          = max(0, objetivo − stock_actual), topado por
 *                       stock_maximo si está cargado
 *
 * `ingredientes.cantidad` ya es la cantidad BRUTA de compra (la merma del
 * ingrediente ya está incorporada por quien cargó la receta — mismo
 * criterio que `calcFoodCost` en useRecetas.ts, no se re-aplica acá).
 * Agrupa por proveedor y ordena por próxima fecha de entrega.
 */
export async function calcularSugerenciaCompra(opts: {
  supabase: SupabaseClient
  restauranteId: string
  fechaObjetivo: string
  semanas?: number
}): Promise<SugerenciaCompraResultado> {
  const { supabase, restauranteId, fechaObjetivo, semanas } = opts

  const produccion = await calcularSugerenciaProduccion({ supabase, restauranteId, fechaObjetivo, semanas })
  const recetaIds = produccion.sugerencias.filter(s => s.sugerido > 0).map(s => s.recetaId)

  const base = {
    fechaObjetivo,
    factorDemanda: produccion.factorDemanda,
    narracionFactor: produccion.narracionFactor,
  }
  if (recetaIds.length === 0) {
    return { ...base, recetasSinPorciones: 0, grupos: [] }
  }

  const sugeridoPorReceta = new Map(produccion.sugerencias.map(s => [s.recetaId, s.sugerido]))

  const { data: recetasData, error: recErr } = await supabase
    .from('recetas')
    .select('id, porciones')
    .in('id', recetaIds)
  if (recErr) throw recErr
  const porcionesPorReceta = new Map<string, number | null>()
  for (const r of (recetasData ?? []) as { id: string; porciones: number | null }[]) {
    porcionesPorReceta.set(r.id, r.porciones)
  }

  const { data: ingredientesData, error: ingErr } = await supabase
    .from('ingredientes')
    .select('receta_id, producto_id, cantidad, unidad')
    .in('receta_id', recetaIds)
    .not('producto_id', 'is', null)
  if (ingErr) throw ingErr
  type IngredienteRow = { receta_id: string; producto_id: string; cantidad: number; unidad: string }
  const ingredientes = (ingredientesData ?? []) as IngredienteRow[]

  const productoIds = [...new Set(ingredientes.map(i => i.producto_id))]
  const productoPorId = new Map<string, { id: string; nombre: string; unidad: string; stock_actual: number; stock_minimo: number; stock_maximo: number | null; proveedor_id: string | null; precio_unitario: number }>()
  if (productoIds.length > 0) {
    const { data: productosData, error: prodErr } = await supabase
      .from('productos')
      .select('id, nombre, unidad, stock_actual, stock_minimo, stock_maximo, proveedor_id, precio_unitario')
      .in('id', productoIds)
    if (prodErr) throw prodErr
    for (const p of productosData ?? []) productoPorId.set(p.id, p)
  }

  let recetasSinPorciones = 0
  const vistasRecetasSinPorciones = new Set<string>()
  const consumoPorProducto = new Map<string, number>()
  for (const ing of ingredientes) {
    const sugerido = sugeridoPorReceta.get(ing.receta_id)
    if (!sugerido || sugerido <= 0) continue
    const porciones = porcionesPorReceta.get(ing.receta_id)
    if (!porciones || porciones <= 0) {
      if (!vistasRecetasSinPorciones.has(ing.receta_id)) { vistasRecetasSinPorciones.add(ing.receta_id); recetasSinPorciones++ }
      continue
    }
    const producto = productoPorId.get(ing.producto_id)
    if (!producto) continue
    const factorUnidad = unitConversionFactor(ing.unidad, producto.unidad)
    if (factorUnidad === 0) continue // unidades incompatibles (cuenta vs. peso/volumen) — dato a corregir a mano
    const consumo = ing.cantidad * (sugerido / porciones) * factorUnidad
    consumoPorProducto.set(ing.producto_id, (consumoPorProducto.get(ing.producto_id) ?? 0) + consumo)
  }

  const items: SugerenciaCompraItem[] = []
  const proveedorIdPorProducto = new Map<string, string | null>()
  for (const [productoId, consumoPrevisto] of consumoPorProducto) {
    const producto = productoPorId.get(productoId)
    if (!producto) continue
    const stockSeguridad = producto.stock_minimo * 1.25
    const objetivo = consumoPrevisto + stockSeguridad
    let aPedir = Math.max(0, objetivo - producto.stock_actual)
    if (producto.stock_maximo != null) {
      const techo = Math.max(0, producto.stock_maximo - producto.stock_actual)
      aPedir = Math.min(aPedir, techo)
    }
    if (aPedir <= 0) continue
    proveedorIdPorProducto.set(productoId, producto.proveedor_id)
    items.push({
      productoId,
      nombre: producto.nombre,
      unidad: producto.unidad,
      consumoPrevisto: Math.round(consumoPrevisto * 100) / 100,
      stockActual: producto.stock_actual,
      stockSeguridad: Math.round(stockSeguridad * 100) / 100,
      precioUnitario: producto.precio_unitario,
      aPedir: Math.round(aPedir * 100) / 100,
    })
  }

  const proveedorIds = [...new Set([...proveedorIdPorProducto.values()].filter((id): id is string => !!id))]
  const proveedorPorId = new Map<string, { nombre: string; dias_entrega: string[] | null }>()
  if (proveedorIds.length > 0) {
    const { data: provData, error: provErr } = await supabase
      .from('proveedores')
      .select('id, nombre, dias_entrega')
      .in('id', proveedorIds)
    if (provErr) throw provErr
    for (const p of (provData ?? []) as { id: string; nombre: string; dias_entrega: string[] | null }[]) {
      proveedorPorId.set(p.id, { nombre: p.nombre, dias_entrega: p.dias_entrega })
    }
  }

  const grupos = new Map<string, GrupoProveedorCompra>()
  for (const item of items) {
    const proveedorId = proveedorIdPorProducto.get(item.productoId) ?? null
    const key = proveedorId ?? '__sin_proveedor__'
    if (!grupos.has(key)) {
      const prov = proveedorId ? proveedorPorId.get(proveedorId) : null
      grupos.set(key, {
        proveedorId,
        proveedorNombre: prov?.nombre ?? 'Sin proveedor asignado',
        diasHastaEntrega: prov ? diasHastaProximaEntrega(prov.dias_entrega) : null,
        items: [],
      })
    }
    grupos.get(key)!.items.push(item)
  }

  const gruposOrdenados = [...grupos.values()].sort((a, b) => {
    if (a.diasHastaEntrega === null && b.diasHastaEntrega === null) return 0
    if (a.diasHastaEntrega === null) return 1
    if (b.diasHastaEntrega === null) return -1
    return a.diasHastaEntrega - b.diasHastaEntrega
  })

  return { ...base, recetasSinPorciones, grupos: gruposOrdenados }
}
