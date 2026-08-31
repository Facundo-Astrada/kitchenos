'use client'

import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import { fetchObjetivosFamilia } from './useCategoriasGasto'
import type { CategoriaGasto } from '@/types'

const REGEX_BEBIDA = /bebida|vino|bodega|cerveza|licor|cafeter/i

export interface SectorRow {
  categoriaGastoId: string
  nombre: string
  esBebida: boolean
  presupuesto: number
  presupuestoEsSugerido: boolean
  /** Share histórico de este sector sobre el gasto de mercadería de los 3 meses previos — insumo de sembrarMes(), no derivar de `presupuesto` (deja de ser el mix una vez que hay un valor guardado). */
  mixHistorico: number
  objSobreVentas: number
  gastoReal: number
  pctSobreVentas: number
  desvioPuntos: number
  ejecutadoPct: number
}

export interface SemanaCelda {
  gasto: number
  presupuesto: number
  desvioPct: number | null   // null si no hay presupuesto de esa semana (sin dato)
  future: boolean            // la semana todavía no empezó (fuera del corte)
}

export interface SemanaRow {
  categoriaGastoId: string
  nombre: string
  celdas: SemanaCelda[]      // 5 elementos, índice 0..4 = semana 1..5
}

export interface PresupuestoCMVData {
  mes: string                     // 'YYYY-MM-01'
  diasDelMes: number
  diasCorridos: number
  ritmoMes: number                // 0..1

  ventasReales: number
  ventasEstimadas: number
  ventasEstimadasEsSugerido: boolean
  ventasEstimadasSugerido: number

  gastoTotal: number
  presupuestoTotal: number
  cmvPct: number
  objetivoPct: number
  desvioPuntos: number
  desvioPlata: number

  proyVentas: number
  proyGasto: number
  sobrecostoProy: number
  saldo: number
  saldoPct: number

  subtotalComidaReal: number
  subtotalBebidasReal: number

  sectores: SectorRow[]
  semanas: SemanaRow[]
  historiaInsuficiente: boolean

  sinCategorizarMonto: number
  sinCategorizarN: number

  merma: { costo: number; n: number; nSinCosto: number }
  arreglos: { total: number; porCategoria: { nombre: string; monto: number }[] }
}

interface FacturaRow {
  total: number
  fecha_factura: string
  categoria_gasto_id: string | null
}

function primerDiaMes(mes: string): Date {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m - 1, 1)
}
function fmtISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function ultimoDiaMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}
function semanaDeDia(dia: number): number {
  // 1-7→1, 8-14→2, 15-21→3, 22-28→4, 29+→5 (bloques de días del mes)
  return Math.min(Math.floor((dia - 1) / 7) + 1, 5)
}
function diasEnSemana(w: number, diasDelMes: number): number {
  return w < 5 ? 7 : diasDelMes - 28
}
function inicioSemana(w: number): number {
  return (w - 1) * 7 + 1
}

// PostgREST corta a 1000 filas por request — paginar cualquier barrido que
// pueda superarlo (ver .claude/docs/columnas.md, patrón de useCategoriasGasto).
async function fetchFacturasPaginado(
  supabase: ReturnType<typeof createClient>,
  restauranteId: string,
  from: string,
  to: string
): Promise<FacturaRow[]> {
  const rows: FacturaRow[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('facturas')
      .select('total, fecha_factura, categoria_gasto_id')
      .eq('restaurante_id', restauranteId)
      .neq('status', 'observada')
      .gte('fecha_factura', from)
      .lte('fecha_factura', to)
      .range(offset, offset + 999)
    if (error) throw error
    rows.push(...((data ?? []) as FacturaRow[]))
    if (!data || data.length < 1000) break
  }
  return rows
}

async function fetchPresupuestoCMV(key: string): Promise<PresupuestoCMVData> {
  const [, rid, mes] = key.split('|')
  const supabase = createClient()

  const mesInicio = primerDiaMes(mes)
  const finDeMes = ultimoDiaMes(mesInicio)
  const hoy = new Date()
  const corte = hoy < mesInicio ? mesInicio : hoy > finDeMes ? finDeMes : hoy
  const diasDelMes = finDeMes.getDate()
  const diasCorridos = corte.getMonth() === mesInicio.getMonth() && corte.getFullYear() === mesInicio.getFullYear()
    ? corte.getDate()
    : diasDelMes
  const ritmoMes = diasDelMes > 0 ? diasCorridos / diasDelMes : 0

  // Ventana histórica: los 3 meses calendario inmediatamente anteriores al mes
  // visto (no a "hoy") — así el mix y el sugerido de ventas se mantienen
  // consistentes al navegar hacia atrás en el tiempo.
  const histFrom = new Date(mesInicio.getFullYear(), mesInicio.getMonth() - 3, 1)
  const histTo = new Date(mesInicio.getFullYear(), mesInicio.getMonth(), 0)

  const [
    categoriasRes,
    presuMesRes,
    presuSectorRes,
    facturasMes,
    facturasHist,
    ventasMesRes,
    ventasHistRes,
    mermaRes,
    objetivos,
  ] = await Promise.all([
    supabase.from('categorias_gasto').select('id, nombre, cuenta_en_cmv, es_mejora')
      .eq('restaurante_id', rid).eq('activa', true).order('orden').order('nombre'),
    supabase.from('presupuesto_mes').select('ventas_estimadas')
      .eq('restaurante_id', rid).eq('mes', fmtISO(mesInicio)).maybeSingle(),
    supabase.from('presupuesto_sector').select('categoria_gasto_id, monto')
      .eq('restaurante_id', rid).eq('mes', fmtISO(mesInicio)),
    fetchFacturasPaginado(supabase, rid, fmtISO(mesInicio), fmtISO(corte)),
    fetchFacturasPaginado(supabase, rid, fmtISO(histFrom), fmtISO(histTo)),
    supabase.from('ventas').select('total_ventas').eq('restaurante_id', rid)
      .gte('fecha', fmtISO(mesInicio)).lte('fecha', fmtISO(corte)),
    supabase.from('ventas').select('total_ventas, fecha').eq('restaurante_id', rid)
      .gte('fecha', fmtISO(histFrom)).lte('fecha', fmtISO(histTo)),
    supabase.from('merma').select('costo_estimado').eq('restaurante_id', rid)
      .gte('fecha', fmtISO(mesInicio)).lte('fecha', fmtISO(corte)),
    fetchObjetivosFamilia(supabase, rid),
  ])

  // Objetivo de materia prima — editable por restaurante desde el tab
  // Familias (elBullifoundation 6.1 / SINTESIS-ORGANIZACION-GASTRONOMICA.md
  // §5.1 es el default 30%, pero cada restaurante puede pisarlo).
  const OBJETIVO_PCT = objetivos.materia_prima

  const categorias = (categoriasRes.data ?? []) as Pick<CategoriaGasto, 'id' | 'nombre' | 'cuenta_en_cmv' | 'es_mejora'>[]
  const categoriasCmv = categorias.filter(c => c.cuenta_en_cmv)
  const categoriasMejora = categorias.filter(c => c.es_mejora)
  const nombrePorId = new Map(categorias.map(c => [c.id, c.nombre]))

  const ventasReales = (ventasMesRes.data ?? []).reduce((s, v) => s + (v.total_ventas || 0), 0)

  // ── Ventas estimadas: promedio de los 3 meses calendario anteriores, sumados
  // mes a mes (no promedio de filas diarias — meses de distinta duración) ──
  const ventasPorMes = new Map<string, number>()
  for (const v of (ventasHistRes.data ?? []) as { total_ventas: number; fecha: string }[]) {
    const k = v.fecha.slice(0, 7)
    ventasPorMes.set(k, (ventasPorMes.get(k) ?? 0) + (v.total_ventas || 0))
  }
  const mesesConVentas = Array.from(ventasPorMes.values())
  const ventasEstimadasSugerido = mesesConVentas.length > 0
    ? mesesConVentas.reduce((s, v) => s + v, 0) / 3   // /3 fijo: meses sin filas cuentan como 0, no se saltean
    : 0

  const ventasEstimadasGuardado = presuMesRes.data?.ventas_estimadas ?? null
  const ventasEstimadasEsSugerido = ventasEstimadasGuardado == null || ventasEstimadasGuardado === 0
  const ventasEstimadas = ventasEstimadasEsSugerido ? ventasEstimadasSugerido : ventasEstimadasGuardado

  // ── Mix histórico por sector (share del gasto de mercadería de los 3 meses previos) ──
  const histPorSector = new Map<string, number>()
  let histTotal = 0
  for (const f of facturasHist) {
    if (!f.categoria_gasto_id) continue
    if (!categoriasCmv.some(c => c.id === f.categoria_gasto_id)) continue
    histPorSector.set(f.categoria_gasto_id, (histPorSector.get(f.categoria_gasto_id) ?? 0) + (f.total || 0))
    histTotal += f.total || 0
  }
  const historiaInsuficiente = histTotal === 0
  const mixPorSector = new Map<string, number>()
  for (const c of categoriasCmv) {
    mixPorSector.set(
      c.id,
      historiaInsuficiente ? 1 / categoriasCmv.length : (histPorSector.get(c.id) ?? 0) / histTotal
    )
  }

  const presupuestoSectorGuardado = new Map<string, number>(
    (presuSectorRes.data ?? []).map(r => [r.categoria_gasto_id as string, r.monto as number])
  )

  const presupuestoTotal = ventasEstimadas * OBJETIVO_PCT / 100

  // ── Gasto real del mes: por sector, por semana, sin categorizar, arreglos ──
  const gastoPorSector = new Map<string, number>()
  const gastoPorSectorSemana = new Map<string, number[]>()
  const gastoPorMejora = new Map<string, number>()
  let gastoTotal = 0
  let sinCategorizarMonto = 0
  let sinCategorizarN = 0

  for (const f of facturasMes) {
    const dia = Number(f.fecha_factura.slice(8, 10))
    const w = semanaDeDia(dia)

    if (!f.categoria_gasto_id) {
      sinCategorizarMonto += f.total || 0
      sinCategorizarN += 1
      continue
    }
    if (categoriasCmv.some(c => c.id === f.categoria_gasto_id)) {
      gastoPorSector.set(f.categoria_gasto_id, (gastoPorSector.get(f.categoria_gasto_id) ?? 0) + (f.total || 0))
      gastoTotal += f.total || 0
      const arr = gastoPorSectorSemana.get(f.categoria_gasto_id) ?? [0, 0, 0, 0, 0]
      arr[w - 1] += f.total || 0
      gastoPorSectorSemana.set(f.categoria_gasto_id, arr)
    }
    if (categoriasMejora.some(c => c.id === f.categoria_gasto_id)) {
      gastoPorMejora.set(f.categoria_gasto_id, (gastoPorMejora.get(f.categoria_gasto_id) ?? 0) + (f.total || 0))
    }
  }

  const cmvPct = ventasReales > 0 ? (gastoTotal / ventasReales) * 100 : 0
  const desvioPlata = gastoTotal - (ventasReales * OBJETIVO_PCT / 100)

  const proyVentas = ritmoMes > 0 ? ventasReales / ritmoMes : 0
  const proyGasto = proyVentas * cmvPct / 100
  const sobrecostoProy = proyGasto - (proyVentas * OBJETIVO_PCT / 100)

  const saldo = presupuestoTotal - gastoTotal
  const saldoPct = presupuestoTotal > 0 ? (saldo / presupuestoTotal) * 100 : 0

  // ── Filas de sector ──
  const sectores: SectorRow[] = categoriasCmv.map(c => {
    const mix = mixPorSector.get(c.id) ?? 0
    const presupuestoGuardado = presupuestoSectorGuardado.get(c.id)
    const presupuestoEsSugerido = presupuestoGuardado == null
    const presupuesto = presupuestoEsSugerido ? presupuestoTotal * mix : presupuestoGuardado
    const gastoReal = gastoPorSector.get(c.id) ?? 0
    const objSobreVentas = mix * OBJETIVO_PCT
    const pctSobreVentas = ventasReales > 0 ? (gastoReal / ventasReales) * 100 : 0
    return {
      categoriaGastoId: c.id,
      nombre: c.nombre,
      esBebida: REGEX_BEBIDA.test(c.nombre),
      presupuesto,
      presupuestoEsSugerido,
      mixHistorico: mix,
      objSobreVentas,
      gastoReal,
      pctSobreVentas,
      desvioPuntos: pctSobreVentas - objSobreVentas,
      ejecutadoPct: presupuesto > 0 ? (gastoReal / presupuesto) * 100 : 0,
    }
  }).sort((a, b) => b.gastoReal - a.gastoReal)

  const subtotalComidaReal = sectores.filter(s => !s.esBebida).reduce((s, r) => s + r.gastoReal, 0)
  const subtotalBebidasReal = sectores.filter(s => s.esBebida).reduce((s, r) => s + r.gastoReal, 0)

  // ── Filas de semana ──
  const semanas: SemanaRow[] = categoriasCmv.map(c => {
    const gastoSemanas = gastoPorSectorSemana.get(c.id) ?? [0, 0, 0, 0, 0]
    const mix = mixPorSector.get(c.id) ?? 0
    const presupuestoSector = (presupuestoSectorGuardado.get(c.id) ?? presupuestoTotal * mix)
    const celdas: SemanaCelda[] = [1, 2, 3, 4, 5].map(w => {
      const presu = presupuestoSector * diasEnSemana(w, diasDelMes) / diasDelMes
      const gasto = gastoSemanas[w - 1]
      return {
        gasto,
        presupuesto: presu,
        desvioPct: presu > 0 ? (gasto / presu) - 1 : null,
        future: inicioSemana(w) > diasCorridos,
      }
    })
    return { categoriaGastoId: c.id, nombre: c.nombre, celdas }
  }).sort((a, b) => {
    const totalA = a.celdas.reduce((s, c) => s + c.gasto, 0)
    const totalB = b.celdas.reduce((s, c) => s + c.gasto, 0)
    return totalB - totalA
  })

  const merma = (mermaRes.data ?? []) as { costo_estimado: number | null }[]

  return {
    mes: fmtISO(mesInicio),
    diasDelMes,
    diasCorridos,
    ritmoMes,
    ventasReales,
    ventasEstimadas,
    ventasEstimadasEsSugerido,
    ventasEstimadasSugerido,
    gastoTotal,
    presupuestoTotal,
    cmvPct,
    objetivoPct: OBJETIVO_PCT,
    desvioPuntos: cmvPct - OBJETIVO_PCT,
    desvioPlata,
    proyVentas,
    proyGasto,
    sobrecostoProy,
    saldo,
    saldoPct,
    subtotalComidaReal,
    subtotalBebidasReal,
    sectores,
    semanas,
    historiaInsuficiente,
    sinCategorizarMonto,
    sinCategorizarN,
    merma: {
      costo: merma.reduce((s, m) => s + (m.costo_estimado || 0), 0),
      n: merma.length,
      nSinCosto: merma.filter(m => !m.costo_estimado).length,
    },
    arreglos: {
      total: Array.from(gastoPorMejora.values()).reduce((s, v) => s + v, 0),
      porCategoria: categoriasMejora
        .map(c => ({ nombre: c.nombre, monto: gastoPorMejora.get(c.id) ?? 0 }))
        .filter(r => r.monto > 0)
        .sort((a, b) => b.monto - a.monto),
    },
  }
}

export function usePresupuestoCMV(mes: string) {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID && mes ? `presupuesto-cmv|${RESTAURANTE_ID}|${mes}` : null
  const { data, isLoading: loading, error, mutate } = useSWR(swrKey, fetchPresupuestoCMV, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
    keepPreviousData: true,
  })

  const guardarVentasEstimadas = useCallback(async (mesStr: string, monto: number) => {
    if (!RESTAURANTE_ID) throw new Error('Sesión no cargada')
    const { error: err } = await supabase.from('presupuesto_mes').upsert(
      { restaurante_id: RESTAURANTE_ID, mes: mesStr, ventas_estimadas: monto, updated_at: new Date().toISOString() },
      { onConflict: 'restaurante_id,mes' }
    )
    if (err) throw err
    await mutate()
  }, [RESTAURANTE_ID, supabase, mutate])

  const guardarPresupuestoSector = useCallback(async (mesStr: string, categoriaGastoId: string, monto: number) => {
    if (!RESTAURANTE_ID) throw new Error('Sesión no cargada')
    const { error: err } = await supabase.from('presupuesto_sector').upsert(
      { restaurante_id: RESTAURANTE_ID, categoria_gasto_id: categoriaGastoId, mes: mesStr, monto, updated_at: new Date().toISOString() },
      { onConflict: 'restaurante_id,categoria_gasto_id,mes' }
    )
    if (err) throw err
    await mutate()
  }, [RESTAURANTE_ID, supabase, mutate])

  // "Usar sugerido" — siembra ventas estimadas + presupuesto de cada sector
  // con el mix histórico, mismo rol que aplicarEstructuraEstandar del tab Familias.
  const sembrarMes = useCallback(async (mesStr: string) => {
    if (!RESTAURANTE_ID || !data) return
    await guardarVentasEstimadas(mesStr, data.ventasEstimadasSugerido)
    const presupuestoTotalSugerido = data.ventasEstimadasSugerido * data.objetivoPct / 100
    await Promise.all(data.sectores.map(s =>
      guardarPresupuestoSector(mesStr, s.categoriaGastoId, Math.round(presupuestoTotalSugerido * s.mixHistorico))
    ))
  }, [RESTAURANTE_ID, data, guardarVentasEstimadas, guardarPresupuestoSector])

  return {
    data,
    loading,
    error: error as Error | null,
    guardarVentasEstimadas,
    guardarPresupuestoSector,
    sembrarMes,
    refetch: mutate,
  }
}
