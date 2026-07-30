import type { SupabaseClient } from '@supabase/supabase-js'

export interface SugerenciaItem {
  recetaId: string
  nombre: string
  plaza: string | null
  unidad: string
  promedioVenta: number
  muestras: number
  stockActual: number
  sugerido: number
}

export interface SugerenciaResultado {
  fechaObjetivo: string
  diaSemanaLabel: string
  semanasAnalizadas: number
  itemsVendidosSinMatch: number
  sugerencias: SugerenciaItem[]
}

const DIAS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

function normNombre(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

interface VentaItemRow {
  nombre_plato: string
  cantidad: number
  ventas: { fecha: string } | { fecha: string }[]
}

/**
 * Motor de sugerencia de producción (sin IA, reglas — E1a).
 * Para cada receta con ventas registradas, promedia lo vendido en las últimas
 * `semanas` ocurrencias del mismo día de semana que `fechaObjetivo` y le resta
 * el stock actual de mise (último `cantidad_actual` conocido, hoy o ayer).
 * Matching venta↔receta por nombre normalizado exacto — mismo criterio que
 * `ventas/page.tsx` (fcTeorico) y `carta/page.tsx` (RentabilidadView), no fuzzy.
 */
export async function calcularSugerenciaProduccion(opts: {
  supabase: SupabaseClient
  restauranteId: string
  fechaObjetivo: string
  semanas?: number
}): Promise<SugerenciaResultado> {
  const { supabase, restauranteId, fechaObjetivo, semanas = 8 } = opts
  const diaSemana = new Date(fechaObjetivo + 'T12:00:00').getDay()

  const desde = new Date(fechaObjetivo + 'T12:00:00')
  desde.setDate(desde.getDate() - 7 * semanas)
  const desdeStr = desde.toISOString().slice(0, 10)

  const { data: ventasItems, error: viErr } = await supabase
    .from('ventas_items')
    .select('nombre_plato, cantidad, ventas!inner(fecha, restaurante_id)')
    .eq('ventas.restaurante_id', restauranteId)
    .gte('ventas.fecha', desdeStr)
    .lt('ventas.fecha', fechaObjetivo)
  if (viErr) throw viErr

  const filtradas = ((ventasItems ?? []) as unknown as VentaItemRow[]).filter(r => {
    const v = Array.isArray(r.ventas) ? r.ventas[0] : r.ventas
    return v && new Date(v.fecha + 'T12:00:00').getDay() === diaSemana
  })

  const { data: recetas, error: recErr } = await supabase
    .from('recetas')
    .select('id, nombre')
    .eq('restaurante_id', restauranteId)
    .eq('activa', true)
  if (recErr) throw recErr
  const recetaPorNombre = new Map<string, { id: string; nombre: string }>()
  for (const r of recetas ?? []) recetaPorNombre.set(normNombre(r.nombre), r)

  const acc = new Map<string, { nombre: string; total: number; fechas: Set<string> }>()
  let sinMatch = 0
  for (const it of filtradas) {
    const receta = recetaPorNombre.get(normNombre(it.nombre_plato))
    if (!receta) { sinMatch++; continue }
    const v = Array.isArray(it.ventas) ? it.ventas[0] : it.ventas
    const g = acc.get(receta.id) ?? { nombre: receta.nombre, total: 0, fechas: new Set<string>() }
    g.total += Number(it.cantidad) || 0
    g.fechas.add(v.fecha)
    acc.set(receta.id, g)
  }

  const recetaIds = Array.from(acc.keys())
  const miseByReceta = new Map<string, { itemId: string; plaza: string; unidad: string }>()
  if (recetaIds.length > 0) {
    const { data: items } = await supabase
      .from('checklist_items')
      .select('id, receta_id, plaza, unidad')
      .eq('restaurante_id', restauranteId)
      .in('receta_id', recetaIds)
    for (const it of (items ?? []) as { id: string; receta_id: string; plaza: string; unidad: string }[]) {
      if (!miseByReceta.has(it.receta_id)) miseByReceta.set(it.receta_id, { itemId: it.id, plaza: it.plaza, unidad: it.unidad })
    }
  }

  const itemIds = Array.from(miseByReceta.values()).map(v => v.itemId)
  const stockByItem = new Map<string, number>()
  if (itemIds.length > 0) {
    const desdeStock = new Date(fechaObjetivo + 'T12:00:00')
    desdeStock.setDate(desdeStock.getDate() - 2)
    const { data: regs } = await supabase
      .from('checklist_registros')
      .select('checklist_item_id, fecha, cantidad_actual')
      .in('checklist_item_id', itemIds)
      .gte('fecha', desdeStock.toISOString().slice(0, 10))
      .not('cantidad_actual', 'is', null)
      // Con turnos de servicio, 2+ registros pueden compartir fecha — desempate
      // por turno para que "el más reciente" sea determinístico (ver mismo
      // comentario en stock/ClientView.tsx).
      .order('fecha', { ascending: false })
      .order('turno', { ascending: false })
    for (const r of (regs ?? []) as { checklist_item_id: string; cantidad_actual: number }[]) {
      if (!stockByItem.has(r.checklist_item_id)) stockByItem.set(r.checklist_item_id, Number(r.cantidad_actual) || 0)
    }
  }

  const sugerencias: SugerenciaItem[] = []
  for (const [recetaId, g] of acc) {
    if (g.fechas.size < 2) continue // muestra insuficiente — no confiable
    const promedio = g.total / g.fechas.size
    const mise = miseByReceta.get(recetaId)
    const stockActual = mise ? (stockByItem.get(mise.itemId) ?? 0) : 0
    const sugerido = Math.max(0, Math.round(promedio - stockActual))
    sugerencias.push({
      recetaId,
      nombre: g.nombre,
      plaza: mise?.plaza ?? null,
      unidad: mise?.unidad ?? 'porc',
      promedioVenta: Math.round(promedio * 10) / 10,
      muestras: g.fechas.size,
      stockActual,
      sugerido,
    })
  }
  sugerencias.sort((a, b) => b.sugerido - a.sugerido)

  return {
    fechaObjetivo,
    diaSemanaLabel: DIAS_ES[diaSemana],
    semanasAnalizadas: semanas,
    itemsVendidosSinMatch: sinMatch,
    sugerencias,
  }
}
