'use client'

import { useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import type { Periodo } from './useReportes'

// Reporte de VENTAS (analítica transaccional, estilo Fudo → Reportes → Ventas).
// Fuente: `cuentas` cerradas (Salón) + pagos/comandas/comanda_items. NO usa la
// tabla agregada `ventas` (totales diarios importados) — esta necesita el detalle
// por transacción que solo tiene el modelo de Salón (por hora, medios, meseros).

export interface SerieItem { label: string; value: number; cantidad?: number }
export interface MedioItem { nombre: string; monto: number; pct: number }
export interface OrigenItem { origen: string; monto: number; pct: number; cantidad: number }
export interface MeseroItem { mozo_id: string; nombre: string; cantidad: number; ventas: number }
export interface PlatoVendido { carta_item_id: string; nombre: string; cantidad: number; ingreso: number }

export interface ReporteVentas {
  totalVentas: number
  cantVentas: number
  promedioVenta: number
  personas: number
  promedioPersona: number
  // comparación vs período anterior
  totalVentasPrev: number
  cantVentasPrev: number
  promedioVentaPrev: number
  // series
  evolucionDiaria: SerieItem[]
  porHora: SerieItem[]
  porDiaSemana: SerieItem[]
  medios: MedioItem[]
  origenes: OrigenItem[]
  meseros: MeseroItem[]
  platosVendidos: PlatoVendido[]
}

const ORIGEN_LABEL: Record<string, string> = { salon: 'Mesas', mostrador: 'Mostrador', delivery: 'Delivery', marca: 'Marca' }
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// Mismo criterio de rangos que useReportes.getDateRange (no exportado) — replicado
// para no acoplar. Devuelve strings ISO (fecha) inclusivos; el filtro usa >= from y < toExcl.
function getDateRange(periodo: Periodo): { from: string; toExcl: string; prevFrom: string; prevToExcl: string } {
  const now = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
  const manana = addDays(now, 1) // toExcl del período actual = mañana (incluye hoy)

  if (periodo === 'semana') {
    const from = addDays(now, -7)
    return { from: iso(from), toExcl: iso(manana), prevFrom: iso(addDays(from, -7)), prevToExcl: iso(from) }
  }
  if (periodo === 'mes') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    const prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return { from: iso(from), toExcl: iso(manana), prevFrom: iso(prevFrom), prevToExcl: iso(from) }
  }
  // mes_anterior
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const toExcl = new Date(now.getFullYear(), now.getMonth(), 1)
  const prevFrom = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  return { from: iso(from), toExcl: iso(toExcl), prevFrom: iso(prevFrom), prevToExcl: iso(from) }
}

interface CuentaRow { id: string; total: number; mozo_id: string | null; cerrada_at: string; cantidad_personas: number | null }

export function useReporteVentas() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const fetchReporte = useCallback(async (periodo: Periodo): Promise<ReporteVentas> => {
    const empty: ReporteVentas = {
      totalVentas: 0, cantVentas: 0, promedioVenta: 0, personas: 0, promedioPersona: 0,
      totalVentasPrev: 0, cantVentasPrev: 0, promedioVentaPrev: 0,
      evolucionDiaria: [], porHora: [], porDiaSemana: [], medios: [], origenes: [], meseros: [], platosVendidos: [],
    }
    if (!RESTAURANTE_ID) return empty
    const { from, toExcl, prevFrom, prevToExcl } = getDateRange(periodo)
    const fromISO = `${from}T00:00:00`, toISO = `${toExcl}T00:00:00`

    // 1. Cuentas cerradas del período
    const { data: cData, error } = await supabase
      .from('cuentas')
      .select('id, total, mozo_id, cerrada_at, cantidad_personas')
      .eq('restaurante_id', RESTAURANTE_ID)
      .eq('estado', 'cerrada')
      .gte('cerrada_at', fromISO).lt('cerrada_at', toISO)
      .order('cerrada_at', { ascending: true })
      .limit(1000)
    if (error) throw error
    const cuentas = (cData ?? []) as CuentaRow[]

    // Período anterior (solo totales, para el %)
    const { data: prevData } = await supabase
      .from('cuentas')
      .select('total')
      .eq('restaurante_id', RESTAURANTE_ID).eq('estado', 'cerrada')
      .gte('cerrada_at', `${prevFrom}T00:00:00`).lt('cerrada_at', `${prevToExcl}T00:00:00`)
      .limit(1000)
    const prevRows = (prevData ?? []) as { total: number }[]
    const totalVentasPrev = prevRows.reduce((s, r) => s + r.total, 0)
    const cantVentasPrev = prevRows.length

    if (cuentas.length === 0) {
      return { ...empty, totalVentasPrev, cantVentasPrev, promedioVentaPrev: cantVentasPrev > 0 ? totalVentasPrev / cantVentasPrev : 0 }
    }

    const ids = cuentas.map(c => c.id)
    const totalVentas = cuentas.reduce((s, c) => s + c.total, 0)
    const cantVentas = cuentas.length
    const personas = cuentas.reduce((s, c) => s + (c.cantidad_personas ?? 0), 0)

    // 2. Series temporales (día, hora, día de semana)
    const diaMap = new Map<string, number>()
    const horaArr = Array.from({ length: 24 }, () => 0)
    const dowArr = Array.from({ length: 7 }, () => 0)
    for (const c of cuentas) {
      const d = new Date(c.cerrada_at)
      const dia = c.cerrada_at.slice(0, 10)
      diaMap.set(dia, (diaMap.get(dia) ?? 0) + c.total)
      horaArr[d.getHours()] += c.total
      dowArr[(d.getDay() + 6) % 7] += c.total  // 0=Lun … 6=Dom
    }
    const evolucionDiaria: SerieItem[] = Array.from(diaMap.entries())
      .map(([dia, value]) => ({ label: new Date(dia + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }), value }))
    const porHora: SerieItem[] = horaArr.map((value, h) => ({ label: `${String(h).padStart(2, '0')}:00`, value })).filter(x => x.value > 0)
    const porDiaSemana: SerieItem[] = dowArr.map((value, i) => ({ label: DIAS[i], value }))

    // 3. Meseros
    const mozoAgg = new Map<string, { cantidad: number; ventas: number }>()
    for (const c of cuentas) {
      const k = c.mozo_id ?? '—'
      const g = mozoAgg.get(k) ?? { cantidad: 0, ventas: 0 }
      g.cantidad++; g.ventas += c.total
      mozoAgg.set(k, g)
    }
    const mozoIds = [...mozoAgg.keys()].filter(k => k !== '—')
    const mozoNombres = new Map<string, string>()
    if (mozoIds.length > 0) {
      const { data: eq } = await supabase.from('equipo_miembros').select('id, nombre, apellido').in('id', mozoIds)
      for (const m of (eq ?? []) as { id: string; nombre: string; apellido: string | null }[]) {
        mozoNombres.set(m.id, `${m.nombre}${m.apellido ? ' ' + m.apellido : ''}`)
      }
    }
    const meseros: MeseroItem[] = [...mozoAgg.entries()]
      .map(([mozo_id, g]) => ({ mozo_id, nombre: mozoNombres.get(mozo_id) ?? 'Sin asignar', ...g }))
      .sort((a, b) => b.ventas - a.ventas)

    // 4. Medios de pago (pagos de estas cuentas — chunked por el cap de query-string)
    const medioAgg = new Map<string, number>()
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const { data: pagos } = await supabase.from('pagos').select('medio_id, monto, propina').in('cuenta_id', chunk)
      for (const p of (pagos ?? []) as { medio_id: string; monto: number; propina: number | null }[]) {
        medioAgg.set(p.medio_id, (medioAgg.get(p.medio_id) ?? 0) + p.monto + (p.propina ?? 0))
      }
    }
    const medioNombres = new Map<string, string>()
    if (medioAgg.size > 0) {
      const { data: mp } = await supabase.from('medios_pago').select('id, nombre').eq('restaurante_id', RESTAURANTE_ID)
      for (const m of (mp ?? []) as { id: string; nombre: string }[]) medioNombres.set(m.id, m.nombre)
    }
    const totalMedios = [...medioAgg.values()].reduce((s, v) => s + v, 0) || 1
    const medios: MedioItem[] = [...medioAgg.entries()]
      .map(([id, monto]) => ({ nombre: medioNombres.get(id) ?? '—', monto, pct: (monto / totalMedios) * 100 }))
      .sort((a, b) => b.monto - a.monto)

    // 5. Origen + platos vendidos (vía comandas / comanda_items)
    const origenPorCuenta = new Map<string, string>()
    const platoAgg = new Map<string, { nombre: string; cantidad: number; ingreso: number }>()
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const { data: comandas } = await supabase
        .from('comandas')
        .select('cuenta_id, origen, items:comanda_items(cantidad, carta_item:carta_items(id, nombre, precio_venta))')
        .in('cuenta_id', chunk)
      for (const co of (comandas ?? []) as unknown as { cuenta_id: string; origen: string; items: { cantidad: number; carta_item: { id: string; nombre: string; precio_venta: number | null } | null }[] }[]) {
        if (!origenPorCuenta.has(co.cuenta_id)) origenPorCuenta.set(co.cuenta_id, co.origen)
        for (const it of co.items ?? []) {
          const ci = it.carta_item
          if (!ci) continue
          const g = platoAgg.get(ci.id) ?? { nombre: ci.nombre, cantidad: 0, ingreso: 0 }
          g.cantidad += it.cantidad
          g.ingreso += (ci.precio_venta ?? 0) * it.cantidad
          platoAgg.set(ci.id, g)
        }
      }
    }
    const origenAgg = new Map<string, { monto: number; cantidad: number }>()
    for (const c of cuentas) {
      const o = origenPorCuenta.get(c.id) ?? 'salon'
      const g = origenAgg.get(o) ?? { monto: 0, cantidad: 0 }
      g.monto += c.total; g.cantidad++
      origenAgg.set(o, g)
    }
    const totalOrigen = [...origenAgg.values()].reduce((s, v) => s + v.monto, 0) || 1
    const origenes: OrigenItem[] = [...origenAgg.entries()]
      .map(([origen, g]) => ({ origen: ORIGEN_LABEL[origen] ?? origen, monto: g.monto, cantidad: g.cantidad, pct: (g.monto / totalOrigen) * 100 }))
      .sort((a, b) => b.monto - a.monto)
    const platosVendidos: PlatoVendido[] = [...platoAgg.entries()]
      .map(([carta_item_id, g]) => ({ carta_item_id, ...g }))
      .sort((a, b) => b.ingreso - a.ingreso)

    return {
      totalVentas, cantVentas, promedioVenta: cantVentas > 0 ? totalVentas / cantVentas : 0,
      personas, promedioPersona: personas > 0 ? totalVentas / personas : 0,
      totalVentasPrev, cantVentasPrev, promedioVentaPrev: cantVentasPrev > 0 ? totalVentasPrev / cantVentasPrev : 0,
      evolucionDiaria, porHora, porDiaSemana, medios, origenes, meseros, platosVendidos,
    }
  }, [RESTAURANTE_ID, supabase])

  return { fetchReporte }
}
