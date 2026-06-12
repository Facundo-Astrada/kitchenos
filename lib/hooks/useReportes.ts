'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'

export type Periodo = 'semana' | 'mes' | 'mes_anterior'

export interface ReporteResumen {
  totalCompras: number
  cantFacturas: number
  productosEnStock: number
  foodCostPromedio: number
  comprasAnterior: number
  facturasAnterior: number
}

export interface FoodCostItem {
  nombre: string
  precio_venta: number
  costo_porcion: number
  food_cost_pct: number
  margen: number
}

export interface CompraProveedor {
  proveedor: string
  cantFacturas: number
  total: number
  porcentaje: number
}

export interface FacturaResumen {
  id: string
  proveedor_nombre: string
  fecha_factura: string | null
  total: number
  status: string
}

export interface PrecioEvolucion {
  producto: string
  precio_actual: number
  precio_anterior: number
  variacion_pct: number
}

export interface ProduccionData {
  recetasProducidas: { nombre: string; cantidad: number }[]
  ingredientesMasUsados: { nombre: string; usos: number }[]
  horasEstimadas: number
}

export interface CMVData {
  ventas: number
  compras: number
  cmvPct: number          // compras / ventas * 100
  cubiertos: number
  ticketPromedio: number
  margenBruto: number     // ventas - compras
  ventasAnterior: number
  comprasAnterior: number
}

export type PeriodoPresupuesto = 'semanal' | 'mensual' | 'trimestral' | 'semestral' | 'anual'

export interface PresupuestoRow {
  periodo: PeriodoPresupuesto
  presupuesto: number
  real: number
}

export interface RendimientoPlaza {
  plaza: string
  tareasTotal: number
  tareasCompletadas: number
  cumplimientoPct: number
  mermaCosto: number
}

function getDateRange(periodo: Periodo): { from: string; to: string; prevFrom: string; prevTo: string } {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  let from: string, prevFrom: string, prevTo: string

  if (periodo === 'semana') {
    const d = new Date(now)
    d.setDate(d.getDate() - 7)
    from = d.toISOString().slice(0, 10)
    const pd = new Date(d)
    pd.setDate(pd.getDate() - 7)
    prevFrom = pd.toISOString().slice(0, 10)
    prevTo = from
  } else if (periodo === 'mes') {
    from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    prevFrom = pm.toISOString().slice(0, 10)
    prevTo = from
  } else {
    // mes_anterior
    const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    from = pm.toISOString().slice(0, 10)
    const endPrev = new Date(now.getFullYear(), now.getMonth(), 0)
    const toStr = endPrev.toISOString().slice(0, 10)
    const pp = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    prevFrom = pp.toISOString().slice(0, 10)
    prevTo = from
    return { from, to: toStr, prevFrom, prevTo }
  }

  return { from, to, prevFrom, prevTo }
}

export function useReportes() {
  const RESTAURANTE_ID = useRestauranteId()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const fetchResumen = useCallback(async (periodo: Periodo): Promise<ReporteResumen> => {
    if (!RESTAURANTE_ID) return {} as ReporteResumen
    setLoading(true)
    setError(null)
    try {
      const { from, to, prevFrom, prevTo } = getDateRange(periodo)

      // Current period facturas
      const { data: facturas, error: facErr } = await supabase
        .from('facturas').select('id, total')
        .eq('restaurante_id', RESTAURANTE_ID)
        .eq('status', 'confirmada')
        .gte('fecha_factura', from).lte('fecha_factura', to)

      if (facErr) throw facErr

      const totalCompras = (facturas ?? []).reduce((s, f) => s + (f.total || 0), 0)
      const cantFacturas = (facturas ?? []).length

      // Previous period
      const { data: prevFacturas, error: prevErr } = await supabase
        .from('facturas').select('id, total')
        .eq('restaurante_id', RESTAURANTE_ID)
        .eq('status', 'confirmada')
        .gte('fecha_factura', prevFrom).lte('fecha_factura', prevTo)

      if (prevErr) throw prevErr

      const comprasAnterior = (prevFacturas ?? []).reduce((s, f) => s + (f.total || 0), 0)
      const facturasAnterior = (prevFacturas ?? []).length

      // Products count
      const { count: productosEnStock, error: countErr } = await supabase
        .from('productos').select('id', { count: 'exact', head: true })
        .eq('restaurante_id', RESTAURANTE_ID)
        .eq('activo', true)

      if (countErr) throw countErr

      // Food cost promedio from carta
      const { data: cartaItems, error: cartaErr } = await supabase
        .from('carta_items').select('id, precio_venta, receta_id')
        .eq('restaurante_id', RESTAURANTE_ID)
        .not('receta_id', 'is', null)

      if (cartaErr) throw cartaErr

      let foodCostPromedio = 0
      if (cartaItems && cartaItems.length > 0) {
        const recetaIds = cartaItems.map(c => c.receta_id).filter(Boolean) as string[]
        if (recetaIds.length > 0) {
          const { data: ingredientes, error: ingErr } = await supabase
            .from('ingredientes').select('receta_id, cantidad, costo_unitario')
            .in('receta_id', recetaIds)

          if (ingErr) throw ingErr

          const { data: recetas, error: recErr } = await supabase
            .from('recetas').select('id, porciones')
            .in('id', recetaIds)

          if (recErr) throw recErr

          const recetaMap: Record<string, number> = {}
          for (const r of (recetas ?? [])) recetaMap[r.id] = r.porciones || 1

          // Sum costs per receta
          const costMap: Record<string, number> = {}
          for (const ing of (ingredientes ?? [])) {
            costMap[ing.receta_id] = (costMap[ing.receta_id] || 0) + ing.cantidad * ing.costo_unitario
          }

          let totalPct = 0
          let count = 0
          for (const ci of cartaItems) {
            if (ci.receta_id && costMap[ci.receta_id] && ci.precio_venta > 0) {
              const costoPorcion = costMap[ci.receta_id] / (recetaMap[ci.receta_id] || 1)
              totalPct += (costoPorcion / ci.precio_venta) * 100
              count++
            }
          }
          foodCostPromedio = count > 0 ? totalPct / count : 0
        }
      }

      return {
        totalCompras, cantFacturas,
        productosEnStock: productosEnStock ?? 0,
        foodCostPromedio,
        comprasAnterior, facturasAnterior,
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar resumen de reportes'
      console.error('[useReportes] fetchResumen Error:', msg)
      setError(msg)
      return { totalCompras: 0, cantFacturas: 0, productosEnStock: 0, foodCostPromedio: 0, comprasAnterior: 0, facturasAnterior: 0 }
    } finally { setLoading(false) }
  }, [RESTAURANTE_ID, supabase])

  const fetchFoodCost = useCallback(async (): Promise<FoodCostItem[]> => {
    if (!RESTAURANTE_ID) return []
    setLoading(true)
    setError(null)
    try {
      const { data: cartaItems, error: cartaErr } = await supabase
        .from('carta_items').select('nombre, precio_venta, receta_id')
        .eq('restaurante_id', RESTAURANTE_ID)
        .not('receta_id', 'is', null)

      if (cartaErr) throw cartaErr
      if (!cartaItems?.length) return []

      const recetaIds = cartaItems.map(c => c.receta_id).filter(Boolean) as string[]
      const { data: recetas, error: recErr } = await supabase
        .from('recetas').select('id, porciones').in('id', recetaIds)
      if (recErr) throw recErr

      const { data: ingredientes, error: ingErr } = await supabase
        .from('ingredientes').select('receta_id, cantidad, costo_unitario').in('receta_id', recetaIds)
      if (ingErr) throw ingErr

      const recetaMap: Record<string, number> = {}
      for (const r of (recetas ?? [])) recetaMap[r.id] = r.porciones || 1

      const costMap: Record<string, number> = {}
      for (const ing of (ingredientes ?? [])) {
        costMap[ing.receta_id] = (costMap[ing.receta_id] || 0) + ing.cantidad * ing.costo_unitario
      }

      return cartaItems
        .filter(ci => ci.receta_id && costMap[ci.receta_id] && ci.precio_venta > 0)
        .map(ci => {
          const costoPorcion = costMap[ci.receta_id!] / (recetaMap[ci.receta_id!] || 1)
          const pct = (costoPorcion / ci.precio_venta) * 100
          return {
            nombre: ci.nombre,
            precio_venta: ci.precio_venta,
            costo_porcion: costoPorcion,
            food_cost_pct: pct,
            margen: ci.precio_venta - costoPorcion,
          }
        })
        .sort((a, b) => a.food_cost_pct - b.food_cost_pct)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar food cost'
      console.error('[useReportes] fetchFoodCost Error:', msg)
      setError(msg)
      return []
    } finally { setLoading(false) }
  }, [RESTAURANTE_ID, supabase])

  const fetchCompras = useCallback(async (periodo: Periodo): Promise<{ proveedores: CompraProveedor[]; facturas: FacturaResumen[] }> => {
    if (!RESTAURANTE_ID) return { proveedores: [], facturas: [] }
    setLoading(true)
    setError(null)
    try {
      const { from, to } = getDateRange(periodo)

      const { data: facturas, error: facErr } = await supabase
        .from('facturas').select('id, proveedor_nombre, fecha_factura, total, status')
        .eq('restaurante_id', RESTAURANTE_ID)
        .eq('status', 'confirmada')
        .gte('fecha_factura', from).lte('fecha_factura', to)
        .order('fecha_factura', { ascending: false })

      if (facErr) throw facErr

      const facs = (facturas ?? []) as FacturaResumen[]
      const totalGlobal = facs.reduce((s, f) => s + f.total, 0)

      // Group by proveedor
      const provMap: Record<string, { count: number; total: number }> = {}
      for (const f of facs) {
        if (!provMap[f.proveedor_nombre]) provMap[f.proveedor_nombre] = { count: 0, total: 0 }
        provMap[f.proveedor_nombre].count++
        provMap[f.proveedor_nombre].total += f.total
      }

      const proveedores: CompraProveedor[] = Object.entries(provMap)
        .map(([proveedor, data]) => ({
          proveedor,
          cantFacturas: data.count,
          total: data.total,
          porcentaje: totalGlobal > 0 ? (data.total / totalGlobal) * 100 : 0,
        }))
        .sort((a, b) => b.total - a.total)

      return { proveedores, facturas: facs }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar compras'
      console.error('[useReportes] fetchCompras Error:', msg)
      setError(msg)
      return { proveedores: [], facturas: [] }
    } finally { setLoading(false) }
  }, [RESTAURANTE_ID, supabase])

  const fetchPrecios = useCallback(async (): Promise<{ productos: PrecioEvolucion[]; inflacionCocina: number }> => {
    if (!RESTAURANTE_ID) return { productos: [], inflacionCocina: 0 }
    setLoading(true)
    setError(null)
    try {
      const { data: historial, error: histErr } = await supabase
        .from('precio_historial')
        .select('producto_id, precio_anterior, precio_nuevo, variacion_porcentaje, fecha')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('fecha', { ascending: false })

      if (histErr) throw histErr

      if (!historial?.length) {
        // Fallback: compare current prices in productos with factura_items
        const { data: productos, error: prodErr } = await supabase
          .from('productos').select('nombre, precio_unitario')
          .eq('restaurante_id', RESTAURANTE_ID)
          .eq('activo', true)
          .gt('precio_unitario', 0)
          .order('precio_unitario', { ascending: false })
          .limit(20)

        if (prodErr) throw prodErr

        return {
          productos: (productos ?? []).map(p => ({
            producto: p.nombre,
            precio_actual: p.precio_unitario,
            precio_anterior: p.precio_unitario,
            variacion_pct: 0,
          })),
          inflacionCocina: 0,
        }
      }

      // Group by producto_id, get latest change
      const prodIds = [...new Set(historial.map(h => h.producto_id))]
      const { data: productos, error: prodErr } = await supabase
        .from('productos').select('id, nombre, precio_unitario')
        .in('id', prodIds)

      if (prodErr) throw prodErr

      const prodNameMap: Record<string, { nombre: string; precio: number }> = {}
      for (const p of (productos ?? [])) prodNameMap[p.id] = { nombre: p.nombre, precio: p.precio_unitario }

      // Latest record per product
      const latestMap: Record<string, typeof historial[0]> = {}
      for (const h of historial) {
        if (!latestMap[h.producto_id]) latestMap[h.producto_id] = h
      }

      const result: PrecioEvolucion[] = Object.entries(latestMap)
        .map(([prodId, h]) => ({
          producto: prodNameMap[prodId]?.nombre ?? 'Desconocido',
          precio_actual: h.precio_nuevo,
          precio_anterior: h.precio_anterior,
          variacion_pct: h.variacion_porcentaje,
        }))
        .sort((a, b) => b.variacion_pct - a.variacion_pct)

      const avgInflation = result.length > 0
        ? result.reduce((s, r) => s + r.variacion_pct, 0) / result.length
        : 0

      return { productos: result, inflacionCocina: avgInflation }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar evolución de precios'
      console.error('[useReportes] fetchPrecios Error:', msg)
      setError(msg)
      return { productos: [], inflacionCocina: 0 }
    } finally { setLoading(false) }
  }, [RESTAURANTE_ID, supabase])

  const fetchProduccion = useCallback(async (periodo: Periodo): Promise<ProduccionData> => {
    if (!RESTAURANTE_ID) return { tareas: [], recetas: [], total_tiempo_min: 0 } as unknown as ProduccionData
    setLoading(true)
    setError(null)
    try {
      const { from, to } = getDateRange(periodo)

      const { data: tareas, error: tarErr } = await supabase
        .from('tareas').select('receta_id, titulo, tiempo_estimado_min')
        .eq('restaurante_id', RESTAURANTE_ID)
        .eq('categoria', 'produccion')
        .gte('created_at', `${from}T00:00:00`)
        .lte('created_at', `${to}T23:59:59`)

      if (tarErr) throw tarErr

      if (!tareas?.length) return { recetasProducidas: [], ingredientesMasUsados: [], horasEstimadas: 0 }

      const horasEstimadas = tareas.reduce((s, t) => s + (t.tiempo_estimado_min || 0), 0) / 60

      // Count recetas
      const recetaCount: Record<string, { nombre: string; cantidad: number }> = {}
      for (const t of tareas) {
        const key = t.receta_id || t.titulo
        if (!recetaCount[key]) recetaCount[key] = { nombre: t.titulo, cantidad: 0 }
        recetaCount[key].cantidad++
      }

      // Get ingredientes for recetas
      const recetaIds = tareas.map(t => t.receta_id).filter(Boolean) as string[]
      let ingredientesMasUsados: { nombre: string; usos: number }[] = []
      if (recetaIds.length > 0) {
        const { data: ingredientes, error: ingErr } = await supabase
          .from('ingredientes').select('nombre, receta_id')
          .in('receta_id', recetaIds)

        if (ingErr) throw ingErr

        const ingCount: Record<string, number> = {}
        for (const ing of (ingredientes ?? [])) {
          ingCount[ing.nombre] = (ingCount[ing.nombre] || 0) + 1
        }
        ingredientesMasUsados = Object.entries(ingCount)
          .map(([nombre, usos]) => ({ nombre, usos }))
          .sort((a, b) => b.usos - a.usos)
          .slice(0, 10)
      }

      return {
        recetasProducidas: Object.values(recetaCount).sort((a, b) => b.cantidad - a.cantidad),
        ingredientesMasUsados,
        horasEstimadas,
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar datos de producción'
      console.error('[useReportes] fetchProduccion Error:', msg)
      setError(msg)
      return { recetasProducidas: [], ingredientesMasUsados: [], horasEstimadas: 0 }
    } finally { setLoading(false) }
  }, [RESTAURANTE_ID, supabase])

  // ── CMV (Costo Mercadería Vendida) ──
  const fetchCMV = useCallback(async (periodo: Periodo): Promise<CMVData> => {
    const empty: CMVData = { ventas: 0, compras: 0, cmvPct: 0, cubiertos: 0, ticketPromedio: 0, margenBruto: 0, ventasAnterior: 0, comprasAnterior: 0 }
    if (!RESTAURANTE_ID) return empty
    setLoading(true)
    try {
      const { from, to, prevFrom, prevTo } = getDateRange(periodo)

      const [ventasRes, comprasRes, ventasPrevRes, comprasPrevRes] = await Promise.all([
        supabase.from('ventas').select('total_ventas, cantidad_cubiertos').eq('restaurante_id', RESTAURANTE_ID).gte('fecha', from).lte('fecha', to),
        supabase.from('facturas').select('total').eq('restaurante_id', RESTAURANTE_ID).eq('status', 'confirmada').gte('fecha_factura', from).lte('fecha_factura', to),
        supabase.from('ventas').select('total_ventas').eq('restaurante_id', RESTAURANTE_ID).gte('fecha', prevFrom).lte('fecha', prevTo),
        supabase.from('facturas').select('total').eq('restaurante_id', RESTAURANTE_ID).eq('status', 'confirmada').gte('fecha_factura', prevFrom).lte('fecha_factura', prevTo),
      ])

      const ventas = (ventasRes.data ?? []).reduce((s, v) => s + (v.total_ventas || 0), 0)
      const cubiertos = (ventasRes.data ?? []).reduce((s, v) => s + (v.cantidad_cubiertos || 0), 0)
      const compras = (comprasRes.data ?? []).reduce((s, f) => s + (f.total || 0), 0)
      const ventasAnterior = (ventasPrevRes.data ?? []).reduce((s, v) => s + (v.total_ventas || 0), 0)
      const comprasAnterior = (comprasPrevRes.data ?? []).reduce((s, f) => s + (f.total || 0), 0)

      return {
        ventas, compras,
        cmvPct: ventas > 0 ? (compras / ventas) * 100 : 0,
        cubiertos,
        ticketPromedio: cubiertos > 0 ? ventas / cubiertos : 0,
        margenBruto: ventas - compras,
        ventasAnterior, comprasAnterior,
      }
    } catch (e: unknown) {
      console.error('[useReportes] fetchCMV Error:', e)
      return empty
    } finally { setLoading(false) }
  }, [RESTAURANTE_ID, supabase])

  // ── Presupuesto vs Real ──
  const fetchPresupuestos = useCallback(async (): Promise<PresupuestoRow[]> => {
    if (!RESTAURANTE_ID) return []
    setLoading(true)
    try {
      const { data: presu } = await supabase.from('presupuestos').select('periodo, monto').eq('restaurante_id', RESTAURANTE_ID)
      const presuMap: Record<string, number> = {}
      for (const p of (presu ?? [])) presuMap[p.periodo] = p.monto || 0

      const now = new Date()
      const y = now.getFullYear(), m = now.getMonth()
      // Rangos del período actual
      const startWeek = new Date(now); startWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7))
      const ranges: Record<PeriodoPresupuesto, string> = {
        semanal: startWeek.toISOString().slice(0, 10),
        mensual: new Date(y, m, 1).toISOString().slice(0, 10),
        trimestral: new Date(y, Math.floor(m / 3) * 3, 1).toISOString().slice(0, 10),
        semestral: new Date(y, m < 6 ? 0 : 6, 1).toISOString().slice(0, 10),
        anual: new Date(y, 0, 1).toISOString().slice(0, 10),
      }
      const hoy = now.toISOString().slice(0, 10)

      const periodos: PeriodoPresupuesto[] = ['semanal', 'mensual', 'trimestral', 'semestral', 'anual']
      const rows = await Promise.all(periodos.map(async (per) => {
        const { data } = await supabase.from('facturas').select('total')
          .eq('restaurante_id', RESTAURANTE_ID).eq('status', 'confirmada')
          .gte('fecha_factura', ranges[per]).lte('fecha_factura', hoy)
        const real = (data ?? []).reduce((s, f) => s + (f.total || 0), 0)
        return { periodo: per, presupuesto: presuMap[per] ?? 0, real }
      }))
      return rows
    } catch (e: unknown) {
      console.error('[useReportes] fetchPresupuestos Error:', e)
      return []
    } finally { setLoading(false) }
  }, [RESTAURANTE_ID, supabase])

  const savePresupuesto = useCallback(async (periodo: PeriodoPresupuesto, monto: number) => {
    if (!RESTAURANTE_ID) return
    const { error } = await supabase.from('presupuestos').upsert(
      { restaurante_id: RESTAURANTE_ID, periodo, monto, updated_at: new Date().toISOString() },
      { onConflict: 'restaurante_id,periodo' }
    )
    if (error) throw error
  }, [RESTAURANTE_ID, supabase])

  // ── Rendimiento por plaza ──
  const fetchRendimiento = useCallback(async (periodo: Periodo): Promise<RendimientoPlaza[]> => {
    if (!RESTAURANTE_ID) return []
    setLoading(true)
    try {
      const { from, to } = getDateRange(periodo)
      const [tareasRes, mermaRes] = await Promise.all([
        supabase.from('tareas').select('plaza, estado').eq('restaurante_id', RESTAURANTE_ID)
          .gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`),
        supabase.from('merma').select('plaza, costo_estimado').eq('restaurante_id', RESTAURANTE_ID)
          .gte('fecha', from).lte('fecha', to),
      ])

      const map: Record<string, RendimientoPlaza> = {}
      const ensure = (plaza: string) => {
        const key = plaza || 'sin plaza'
        if (!map[key]) map[key] = { plaza: key, tareasTotal: 0, tareasCompletadas: 0, cumplimientoPct: 0, mermaCosto: 0 }
        return map[key]
      }
      for (const t of (tareasRes.data ?? [])) {
        const r = ensure(t.plaza)
        r.tareasTotal++
        if (t.estado === 'listo') r.tareasCompletadas++
      }
      for (const mm of (mermaRes.data ?? [])) {
        ensure(mm.plaza).mermaCosto += mm.costo_estimado || 0
      }
      return Object.values(map).map(r => ({
        ...r,
        cumplimientoPct: r.tareasTotal > 0 ? (r.tareasCompletadas / r.tareasTotal) * 100 : 0,
      })).sort((a, b) => b.tareasTotal - a.tareasTotal)
    } catch (e: unknown) {
      console.error('[useReportes] fetchRendimiento Error:', e)
      return []
    } finally { setLoading(false) }
  }, [RESTAURANTE_ID, supabase])

  return { loading, error, fetchResumen, fetchFoodCost, fetchCompras, fetchPrecios, fetchProduccion, fetchCMV, fetchPresupuestos, savePresupuesto, fetchRendimiento }
}
