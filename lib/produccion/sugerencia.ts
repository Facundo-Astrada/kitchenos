import type { SupabaseClient } from '@supabase/supabase-js'
import { cubiertosVivos, tieneCarga } from '@/lib/reservas/helpers'
import type { EstadoReserva } from '@/types'

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
  /** PLAN-4-CAPAS B10 — 1 si no hay reservas de hoy o no hay suficiente
   * historial de reservas para estimar el walk-in con confianza (no adivina
   * en el vacío: mismo criterio de "muestra insuficiente" que ya usa este
   * motor para las recetas). */
  factorDemanda: number
  cubiertosReservados: number
  cubiertosPromedio: number | null
  /** Texto ya armado ("Sábado con 62 cubiertos... sugiero 38% más"), null si factorDemanda === 1. */
  narracionFactor: string | null
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

  // PLAN-4-CAPAS B10 — factor de demanda: escala el promedio histórico de
  // cada receta según cuánta más (o menos) gente hay reservada hoy contra lo
  // habitual. Necesita DOS series históricas confiables (cubiertos totales
  // por `ventas.cantidad_cubiertos` y reservas por fecha) para decomponer
  // "cuánto de lo vendido era walk-in" — si falta cualquiera de las dos,
  // factor_demanda queda en 1 y el motor se comporta igual que antes de B10.
  const { data: ventasHist, error: vhErr } = await supabase
    .from('ventas')
    .select('fecha, cantidad_cubiertos')
    .eq('restaurante_id', restauranteId)
    .gte('fecha', desdeStr)
    .lt('fecha', fechaObjetivo)
  if (vhErr) throw vhErr
  const cubiertosPorFecha = new Map<string, number>()
  for (const v of (ventasHist ?? []) as { fecha: string; cantidad_cubiertos: number | null }[]) {
    if (new Date(v.fecha + 'T12:00:00').getDay() !== diaSemana) continue
    if (v.cantidad_cubiertos == null) continue
    cubiertosPorFecha.set(v.fecha, Number(v.cantidad_cubiertos))
  }

  const { data: reservasHist, error: rhErr } = await supabase
    .from('reservas')
    .select('fecha, pax, estado')
    .eq('restaurante_id', restauranteId)
    .gte('fecha', desdeStr)
    .lt('fecha', fechaObjetivo)
  if (rhErr) throw rhErr
  const reservadosPorFecha = new Map<string, number>()
  for (const r of (reservasHist ?? []) as { fecha: string; pax: number; estado: string }[]) {
    if (!cubiertosPorFecha.has(r.fecha)) continue // solo sirve para decomponer fechas con dato real de cubiertos
    if (!tieneCarga(r.estado as EstadoReserva)) continue
    reservadosPorFecha.set(r.fecha, (reservadosPorFecha.get(r.fecha) ?? 0) + Number(r.pax))
  }
  const walkInsHistoricos: number[] = []
  for (const [fecha, cubiertos] of cubiertosPorFecha) {
    const reservado = reservadosPorFecha.get(fecha)
    if (reservado === undefined) continue // sin reservas cargadas ese día pasado: no hay con qué decomponer
    walkInsHistoricos.push(Math.max(0, cubiertos - reservado))
  }
  const cubiertosPromedio = cubiertosPorFecha.size > 0
    ? [...cubiertosPorFecha.values()].reduce((a, b) => a + b, 0) / cubiertosPorFecha.size
    : null

  const { data: reservasHoy, error: rErr } = await supabase
    .from('reservas')
    .select('pax, estado')
    .eq('restaurante_id', restauranteId)
    .eq('fecha', fechaObjetivo)
  if (rErr) throw rErr
  const cubiertosReservados = cubiertosVivos((reservasHoy ?? []) as { pax: number; estado: EstadoReserva }[])

  let factorDemanda = 1
  let narracionFactor: string | null = null
  if (cubiertosReservados > 0 && cubiertosPromedio !== null && cubiertosPromedio > 0 && walkInsHistoricos.length >= 2) {
    const walkInEsperado = walkInsHistoricos.reduce((a, b) => a + b, 0) / walkInsHistoricos.length
    factorDemanda = (cubiertosReservados + walkInEsperado) / cubiertosPromedio
    const pct = Math.round((factorDemanda - 1) * 100)
    if (pct !== 0) {
      const diaCap = DIAS_ES[diaSemana].charAt(0).toUpperCase() + DIAS_ES[diaSemana].slice(1)
      narracionFactor = `${diaCap} con ${cubiertosReservados} cubiertos reservados contra un promedio de ${Math.round(cubiertosPromedio)} — sugiero un ${Math.abs(pct)}% ${pct > 0 ? 'más' : 'menos'} de lo habitual`
    }
  }

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
    const sugerido = Math.max(0, Math.round(promedio * factorDemanda - stockActual))
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
    factorDemanda: Math.round(factorDemanda * 100) / 100,
    cubiertosReservados,
    cubiertosPromedio: cubiertosPromedio !== null ? Math.round(cubiertosPromedio) : null,
    narracionFactor,
    sugerencias,
  }
}
