'use client'

import PageTransition from '@/components/PageTransition'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { useAuth } from '@/lib/auth/context'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { createClient } from '@/lib/supabase/client'
import { HeaderAction } from '@/components/ui'
import { exportarExcel, fechaArchivo, type HojaExcel } from '@/lib/exportar'
import {
  useReportes,
  type Periodo,
  type ReporteResumen,
  type FoodCostItem,
  type CompraProveedor,
  type FacturaResumen,
  type PrecioEvolucion,
  type ProduccionData,
  type CMVData,
  type PresupuestoRow,
  type PeriodoPresupuesto,
  type RendimientoPlaza,
} from '@/lib/hooks/useReportes'
import {
  usePreciosProveedores,
  type ComparadorPrecioProducto,
  type TopSobreprecioItem,
} from '@/lib/hooks/usePreciosProveedores'
import { useCajaTurno } from '@/lib/hooks/useCajaTurno'
import { useMediosPago } from '@/lib/hooks/useMediosPago'
import { useChecklist, type PaseTurnoIncumplido } from '@/lib/hooks/useChecklist'
import { useReporteVentas, type ReporteVentas } from '@/lib/hooks/useReporteVentas'
import { useCarta } from '@/lib/hooks/useCarta'
import type { CajaTurno, ChecklistAuditoria } from '@/types'

type Tab = 'resumen' | 'ventas' | 'cmv' | 'presupuesto' | 'rendimiento' | 'foodcost' | 'compras' | 'precios' | 'produccion' | 'caja' | 'auditoria'

// Tabs con export a Excel (Q3) — contextual al tab activo, mismos números que el render.
const TABS_EXPORTABLES: Tab[] = ['cmv', 'compras', 'foodcost', 'presupuesto', 'rendimiento', 'caja', 'auditoria']

// Rango de fechas simple para el histórico de auditorías — mismos períodos que el selector, sin comparación vs. anterior.
function rangoAuditoria(periodo: Periodo): { from: string; to: string } {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  if (periodo === 'semana') {
    const d = new Date(now); d.setDate(d.getDate() - 7)
    return { from: d.toISOString().slice(0, 10), to }
  }
  if (periodo === 'mes') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), to }
  }
  const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endPrev = new Date(now.getFullYear(), now.getMonth(), 0)
  return { from: pm.toISOString().slice(0, 10), to: endPrev.toISOString().slice(0, 10) }
}

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
  { key: 'mes_anterior', label: 'Último mes' },
]

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'resumen', label: 'Resumen', icon: 'dashboard' },
  { key: 'ventas', label: 'Ventas', icon: 'point_of_sale' },
  { key: 'cmv', label: 'CMV', icon: 'savings' },
  { key: 'presupuesto', label: 'Presupuesto', icon: 'account_balance_wallet' },
  { key: 'rendimiento', label: 'Rendimiento', icon: 'speed' },
  { key: 'foodcost', label: 'Food Cost', icon: 'restaurant' },
  { key: 'compras', label: 'Compras', icon: 'shopping_cart' },
  { key: 'precios', label: 'Precios', icon: 'trending_up' },
  { key: 'produccion', label: 'Producción', icon: 'factory' },
  { key: 'caja', label: 'Caja', icon: 'point_of_sale' },
  { key: 'auditoria', label: 'Auditoría', icon: 'fact_check' },
]

const PLAZA_LABELS: Record<string, string> = {
  parrilla: 'Parrilla', frios: 'Fríos', calientes: 'Calientes',
  pase: 'Pase', pasteleria: 'Pastelería', panaderia: 'Panadería', general: 'General',
}

const PRESU_LABELS: Record<PeriodoPresupuesto, string> = {
  semanal: 'Semanal', mensual: 'Mensual', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual',
}

function fmtMoney(n: number) {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtPct(n: number) {
  return n.toFixed(1) + '%'
}

function fcColor(pct: number) {
  if (pct < 30) return '#16a34a'
  if (pct <= 35) return '#ca8a04'
  return '#dc2626'
}

function variacionColor(pct: number) {
  if (pct > 2) return '#dc2626'
  if (pct < -2) return '#16a34a'
  return 'var(--text-2)'
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function ReportesPage() {
  const router = useRouter()
  const { perfil } = useAuth()
  const esAdmin = perfil?.rol === 'admin'
  const { puedeVer } = usePermisos()
  const RESTAURANTE_ID = useRestauranteId()
  const { loading, fetchResumen, fetchFoodCost, fetchCompras, fetchPrecios, fetchProduccion, fetchCMV, fetchPresupuestos, savePresupuesto, fetchRendimiento } = useReportes()
  const { fetchComparador } = usePreciosProveedores()
  const { fetchHistorial } = useCajaTurno()
  const { medios } = useMediosPago()
  const { fetchAuditorias, fetchAuditoriaPaseTurno } = useChecklist()
  const { fetchReporte: fetchReporteVentas } = useReporteVentas()
  const { items: cartaItemsRep } = useCarta()
  const isDesktop = useIsDesktop()

  // Mapa carta_item_id → costo por porción (cubre platos 1:1 y compuestos) para
  // el ranking de platos por GANANCIA — el diferenciador vs Fudo, que solo rankea
  // por facturación porque no conoce el food cost.
  const costoPorItem = useMemo(() => {
    const m: Record<string, number> = {}
    for (const it of cartaItemsRep) if (it.costo_porcion != null) m[it.id] = it.costo_porcion
    return m
  }, [cartaItemsRep])

  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [tab, setTab] = useState<Tab>('resumen')

  const [restauranteNombre, setRestauranteNombre] = useState('')
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const supabase = createClient()
    supabase.from('restaurantes').select('nombre').eq('id', RESTAURANTE_ID).maybeSingle()
      .then(({ data }) => setRestauranteNombre(data?.nombre ?? ''))
  }, [RESTAURANTE_ID])

  // Nombres de equipo para mostrar quién abrió/cerró cada caja (tab Caja)
  const [nombresEquipo, setNombresEquipo] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const supabase = createClient()
    supabase.from('equipo_miembros').select('id, nombre, apellido').eq('restaurante_id', RESTAURANTE_ID)
      .then(({ data }) => setNombresEquipo(Object.fromEntries(
        (data ?? []).map((m: { id: string; nombre: string; apellido: string }) => [m.id, `${m.nombre} ${m.apellido}`.trim()])
      )))
  }, [RESTAURANTE_ID])

  useEffect(() => {
    function handleSetTab(e: Event) {
      const { tab: t } = (e as CustomEvent<{ tab: string }>).detail
      if (['resumen','ventas','cmv','presupuesto','rendimiento','foodcost','compras','precios','produccion','caja','auditoria'].includes(t)) setTab(t as Tab)
    }
    window.addEventListener('kc-set-tab', handleSetTab)
    return () => window.removeEventListener('kc-set-tab', handleSetTab)
  }, [])

  // kc_screen_context se escribe después de declarar los estados de datos

  // Data states
  const [resumen, setResumen] = useState<ReporteResumen | null>(null)
  const [foodCostData, setFoodCostData] = useState<FoodCostItem[]>([])
  const [comprasData, setComprasData] = useState<{ proveedores: CompraProveedor[]; facturas: FacturaResumen[] }>({ proveedores: [], facturas: [] })
  const [preciosData, setPreciosData] = useState<{ productos: PrecioEvolucion[]; inflacionCocina: number }>({ productos: [], inflacionCocina: 0 })
  const [comparadorData, setComparadorData] = useState<{ comparador: ComparadorPrecioProducto[]; topSobreprecio: TopSobreprecioItem[] }>({ comparador: [], topSobreprecio: [] })
  const [produccionData, setProduccionData] = useState<ProduccionData>({ recetasProducidas: [], ingredientesMasUsados: [], horasEstimadas: 0 })
  const [cmvData, setCmvData] = useState<CMVData | null>(null)
  const [presuData, setPresuData] = useState<PresupuestoRow[]>([])
  const [rendData, setRendData] = useState<RendimientoPlaza[]>([])
  const [cajaHistorial, setCajaHistorial] = useState<CajaTurno[]>([])
  const [auditoriaHistorial, setAuditoriaHistorial] = useState<ChecklistAuditoria[]>([])
  const [paseTurnoIncumplidos, setPaseTurnoIncumplidos] = useState<PaseTurnoIncumplido[]>([])
  const [ventasRep, setVentasRep] = useState<ReporteVentas | null>(null)

  const [tabLoading, setTabLoading] = useState(false)

  useEffect(() => {
    const ctx: Record<string, unknown> = { screen: 'reportes', tab, periodo }
    if (resumen) {
      ctx.totalCompras = Math.round(resumen.totalCompras ?? 0)
      ctx.foodCostPromedio = Math.round(resumen.foodCostPromedio ?? 0)
    }
    if (foodCostData.length > 0) {
      ctx.fcAlto = foodCostData.filter(r => r.food_cost_pct >= 33)
        .map(r => ({ nombre: r.nombre, fc: Math.round(r.food_cost_pct) }))
        .slice(0, 5)
    }
    if (comprasData.proveedores.length > 0) {
      ctx.topProveedores = comprasData.proveedores
        .slice(0, 3)
        .map(p => ({ proveedor: p.proveedor, total: Math.round(p.total) }))
    }
    if (preciosData.inflacionCocina > 0) ctx.inflacionCocina = Math.round(preciosData.inflacionCocina)
    if (comparadorData.topSobreprecio.length > 0) {
      ctx.ahorroPotencialTotal = Math.round(comparadorData.topSobreprecio.reduce((s, t) => s + t.ahorroPotencial, 0))
    }
    if (cmvData) ctx.cmvPct = Math.round(cmvData.cmvPct ?? 0)
    if (cajaHistorial.length > 0) ctx.diferenciaUltimoCierre = Math.round(cajaHistorial[0].diferencia_total ?? 0)
    localStorage.setItem('kc_screen_context', JSON.stringify(ctx))
    return () => localStorage.removeItem('kc_screen_context')
  }, [tab, periodo, resumen, foodCostData, comprasData, preciosData, comparadorData, cmvData, cajaHistorial])

  // Lazy fetch per tab
  const loadTab = useCallback(async (t: Tab, p: Periodo) => {
    setTabLoading(true)
    try {
      switch (t) {
        case 'resumen': {
          const r = await fetchResumen(p)
          setResumen(r)
          break
        }
        case 'ventas': {
          const v = await fetchReporteVentas(p)
          setVentasRep(v)
          break
        }
        case 'foodcost': {
          const fc = await fetchFoodCost()
          setFoodCostData(fc)
          break
        }
        case 'compras': {
          const c = await fetchCompras(p)
          setComprasData(c)
          break
        }
        case 'precios': {
          const pr = await fetchPrecios()
          setPreciosData(pr)
          const cmp = await fetchComparador()
          setComparadorData(cmp)
          break
        }
        case 'produccion': {
          const prod = await fetchProduccion(p)
          setProduccionData(prod)
          break
        }
        case 'cmv': {
          const c = await fetchCMV(p)
          setCmvData(c)
          break
        }
        case 'presupuesto': {
          const pr = await fetchPresupuestos()
          setPresuData(pr)
          break
        }
        case 'rendimiento': {
          const r = await fetchRendimiento(p)
          setRendData(r)
          break
        }
        case 'caja': {
          const h = await fetchHistorial()
          setCajaHistorial(h)
          break
        }
        case 'auditoria': {
          const { from, to } = rangoAuditoria(p)
          const [a, pt] = await Promise.all([
            fetchAuditorias(from, to),
            fetchAuditoriaPaseTurno(from, to),
          ])
          setAuditoriaHistorial(a)
          setPaseTurnoIncumplidos(pt)
          break
        }
      }
    } catch (e) {
      console.error('Error loading tab:', e)
    } finally {
      setTabLoading(false)
    }
  }, [fetchResumen, fetchReporteVentas, fetchFoodCost, fetchCompras, fetchPrecios, fetchComparador, fetchProduccion, fetchCMV, fetchPresupuestos, fetchRendimiento, fetchHistorial, fetchAuditorias, fetchAuditoriaPaseTurno])

  useEffect(() => {
    loadTab(tab, periodo)
  }, [tab, periodo, loadTab])

  // ---------------------------------------------------------------------------
  // Export a Excel (Q3) — contextual al tab activo, mismos números que el render.
  // ---------------------------------------------------------------------------

  function buildMetaHoja(): HojaExcel {
    return {
      nombre: 'Info',
      filas: [
        { Campo: 'Restaurante', Valor: restauranteNombre || '—' },
        { Campo: 'Período', Valor: PERIODOS.find(p => p.key === periodo)?.label ?? periodo },
        { Campo: 'Fecha de exportación', Valor: fechaArchivo() },
      ],
    }
  }

  function hojasCMV(): HojaExcel[] {
    if (!cmvData) return []
    const c = cmvData
    return [{
      nombre: 'CMV',
      filas: [{
        'Ventas': c.ventas,
        'Compras (costo)': c.compras,
        'CMV %': Math.round(c.cmvPct * 10) / 10,
        'Margen bruto': c.margenBruto,
        'Ticket promedio': Math.round(c.ticketPromedio),
        'Cubiertos': c.cubiertos,
        'Ventas período anterior': c.ventasAnterior,
        'Compras período anterior': c.comprasAnterior,
      }],
    }]
  }

  function hojasCompras(): HojaExcel[] {
    const { proveedores, facturas } = comprasData
    return [
      {
        nombre: 'Por proveedor',
        filas: proveedores.map(p => ({
          'Proveedor': p.proveedor,
          'Facturas': p.cantFacturas,
          'Total': p.total,
          '% del total': Math.round(p.porcentaje * 10) / 10,
        })),
      },
      {
        nombre: 'Facturas',
        filas: facturas.map(f => ({
          'Proveedor': f.proveedor_nombre,
          'Fecha': f.fecha_factura ?? '',
          'Total': f.total,
          'Estado': f.status,
        })),
      },
    ]
  }

  function hojasFoodCost(): HojaExcel[] {
    return [{
      nombre: 'Food Cost',
      filas: foodCostData.map(f => ({
        'Plato': f.nombre,
        'Costo porción': Math.round(f.costo_porcion),
        'Precio venta': f.precio_venta,
        'Food cost %': Math.round(f.food_cost_pct * 10) / 10,
        'Margen': Math.round(f.margen),
      })),
    }]
  }

  function hojasPresupuesto(): HojaExcel[] {
    const periodos: PeriodoPresupuesto[] = ['semanal', 'mensual', 'trimestral', 'semestral', 'anual']
    return [{
      nombre: 'Presupuesto vs Real',
      filas: periodos.map(per => {
        const row = presuData.find(r => r.periodo === per) ?? { periodo: per, presupuesto: 0, real: 0 }
        return {
          'Período': PRESU_LABELS[per],
          'Presupuesto': row.presupuesto,
          'Real': row.real,
          'Diferencia': row.presupuesto - row.real,
        }
      }),
    }]
  }

  function hojasRendimiento(): HojaExcel[] {
    return [{
      nombre: 'Rendimiento por plaza',
      filas: rendData.map(r => ({
        'Plaza': r.plaza,
        'Tareas completadas': r.tareasCompletadas,
        'Tareas totales': r.tareasTotal,
        'Cumplimiento %': Math.round(r.cumplimientoPct * 10) / 10,
        'Merma ($)': Math.round(r.mermaCosto),
      })),
    }]
  }

  function medioNombre(id: string): string {
    return medios.find(m => m.id === id)?.nombre ?? id
  }

  function hojasCaja(): HojaExcel[] {
    const detalle: Record<string, string | number>[] = []
    for (const c of cajaHistorial) {
      const medioIds = new Set([
        ...Object.keys(c.montos_esperados ?? {}),
        ...Object.keys(c.montos_declarados ?? {}),
      ])
      for (const medioId of medioIds) {
        const esperado = c.montos_esperados?.[medioId] ?? 0
        const declarado = c.montos_declarados?.[medioId] ?? 0
        detalle.push({
          'Cierre': c.fecha_cierre ?? '',
          'Medio': medioNombre(medioId),
          'Esperado': Math.round(esperado),
          'Declarado': Math.round(declarado),
          'Diferencia': Math.round(declarado - esperado),
        })
      }
    }
    return [
      {
        nombre: 'Cierres',
        filas: cajaHistorial.map(c => ({
          'Apertura': c.fecha_apertura,
          'Cierre': c.fecha_cierre ?? '',
          'Abrió': c.abierta_por ? (nombresEquipo[c.abierta_por] ?? c.abierta_por) : '—',
          'Cerró': c.cerrada_por ? (nombresEquipo[c.cerrada_por] ?? c.cerrada_por) : '—',
          'Fondo inicial': c.monto_inicial,
          'Diferencia total': c.diferencia_total ?? 0,
          'Arqueo ciego': c.arqueo_ciego ? 'Sí' : 'No',
          'Notas': c.notas ?? '',
        })),
      },
      { nombre: 'Detalle por medio', filas: detalle },
    ]
  }

  function hojasAuditoria(): HojaExcel[] {
    return [{
      nombre: 'Auditorías',
      filas: auditoriaHistorial.map(a => ({
        'Fecha': a.fecha,
        'Plaza': PLAZA_LABELS[a.plaza] ?? a.plaza,
        'Score %': a.score,
        'Puntaje obtenido': a.puntaje_obtenido,
        'Puntaje posible': a.puntaje_posible,
        'Ítems evaluados': a.items_evaluados,
        'Ítems fallidos': a.items_fallidos,
      })),
    }]
  }

  async function exportAuditoriaPDF() {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    doc.setFillColor(30, 41, 59)
    doc.rect(0, 0, 210, 32, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(18)
    doc.text(`Reporte de Auditoría — ${restauranteNombre || 'KitchenOS'}`, 14, 15)
    doc.setFontSize(10)
    doc.text(`Período: ${PERIODOS.find(p => p.key === periodo)?.label ?? periodo} · Generado: ${fechaArchivo()}`, 14, 25)

    doc.setTextColor(0, 0, 0)
    autoTable(doc, {
      startY: 38,
      head: [['Fecha', 'Plaza', 'Score', 'Evaluados', 'Fallidos']],
      body: auditoriaHistorial.map(a => [
        a.fecha, PLAZA_LABELS[a.plaza] ?? a.plaza, `${a.score}%`, String(a.items_evaluados), String(a.items_fallidos),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
    })

    doc.setFontSize(7)
    doc.setTextColor(150)
    doc.text('Generado por KitchenOS — Checklists nivel auditoría', 14, 285)
    doc.save(`auditoria_${fechaArchivo()}.pdf`)
  }

  function handleExportar() {
    let hojas: HojaExcel[] = []
    let slug = ''
    switch (tab) {
      case 'cmv': hojas = hojasCMV(); slug = 'cmv'; break
      case 'compras': hojas = hojasCompras(); slug = 'compras'; break
      case 'foodcost': hojas = hojasFoodCost(); slug = 'food_cost'; break
      case 'presupuesto': hojas = hojasPresupuesto(); slug = 'presupuesto'; break
      case 'rendimiento': hojas = hojasRendimiento(); slug = 'rendimiento'; break
      case 'caja': hojas = hojasCaja(); slug = 'caja'; break
      case 'auditoria': hojas = hojasAuditoria(); slug = 'auditoria'; break
      default: return
    }
    if (!hojas.length) return
    exportarExcel(`reportes_${slug}_${fechaArchivo()}.xlsx`, [buildMetaHoja(), ...hojas])
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function KpiCard({ label, value, prev, icon, suffix }: { label: string; value: number; prev?: number; icon: string; suffix?: string }) {
    const displayVal = value === 0 ? '—' : suffix === '%' ? fmtPct(value) : suffix === '$' ? fmtMoney(value) : value.toString()
    let arrow = ''
    let arrowColor = 'var(--text-3)'
    if (prev !== undefined && prev > 0 && value > 0) {
      const change = ((value - prev) / prev) * 100
      if (change > 0) { arrow = `+${change.toFixed(0)}%`; arrowColor = label.includes('Food') ? '#dc2626' : '#16a34a' }
      else if (change < 0) { arrow = `${change.toFixed(0)}%`; arrowColor = label.includes('Food') ? '#16a34a' : '#dc2626' }
    } else if (prev !== undefined && prev > 0 && value === 0) {
      arrow = 'sin datos aún'; arrowColor = 'var(--text-3)'
    }

    return (
      <div style={{
        background: 'var(--surface)', borderRadius: 12, padding: 16,
        border: '1px solid var(--border)', flex: '1 1 140px', minWidth: 140,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>{icon}</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)' }}>{displayVal}</div>
        {arrow && (
          <div style={{ fontSize: 11, color: arrowColor, marginTop: 4 }}>
            {arrow} vs anterior
          </div>
        )}
      </div>
    )
  }

  function BarChart({ items, maxVal }: { items: { label: string; value: number; color?: string; subLabel?: string }[]; maxVal: number }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item, i) => (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{item.label}</span>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{item.subLabel ?? ''}</span>
            </div>
            <div style={{ background: 'var(--border)', borderRadius: 6, height: 22, overflow: 'hidden' }}>
              <div style={{
                width: maxVal > 0 ? `${Math.min((item.value / maxVal) * 100, 100)}%` : '0%',
                height: '100%',
                background: item.color || 'var(--navy)',
                borderRadius: 6,
                transition: 'width 0.4s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6,
              }}>
                {item.value / maxVal > 0.15 && (
                  <span style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>{fmtMoney(item.value)}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Tab content
  // ---------------------------------------------------------------------------

  function renderResumen() {
    if (!resumen) return <EmptyState icon="dashboard" text="Sin datos para el período" />
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: 10 }}>
          <KpiCard label="Total Compras" value={resumen.totalCompras} prev={resumen.comprasAnterior} icon="payments" suffix="$" />
          <KpiCard label="Facturas" value={resumen.cantFacturas} prev={resumen.facturasAnterior} icon="receipt_long" />
          <KpiCard label="Productos en Stock" value={resumen.productosEnStock} icon="inventory_2" />
          <KpiCard label="Food Cost Prom." value={resumen.foodCostPromedio} icon="restaurant" suffix="%" />
        </div>
      </div>
    )
  }

  function renderVentas() {
    const v = ventasRep
    if (!v) return <EmptyState icon="point_of_sale" text="Sin datos para el período" />
    if (v.cantVentas === 0) {
      return <EmptyState icon="point_of_sale" text="Sin ventas cerradas en el período. Las ventas del Salón (mesas cobradas) alimentan este reporte." />
    }
    const card = (title: string, node: React.ReactNode) => (
      <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 12 }}>{title}</div>
        {node}
      </div>
    )
    // Ranking de platos por GANANCIA (ingreso − costo food cost) — el diferenciador.
    const platosConMargen = v.platosVendidos.map(p => {
      const costoUnit = costoPorItem[p.carta_item_id]
      const costoTotal = costoUnit != null ? costoUnit * p.cantidad : null
      return { ...p, costoTotal, ganancia: costoTotal != null ? p.ingreso - costoTotal : null }
    })
    const rankGanancia = [...platosConMargen].filter(p => p.ganancia != null).sort((a, b) => (b.ganancia ?? 0) - (a.ganancia ?? 0)).slice(0, 12)
    const conCosto = platosConMargen.filter(p => p.ganancia != null).length

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* KPIs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <KpiCard label="Total ventas" value={v.totalVentas} prev={v.totalVentasPrev} icon="payments" suffix="$" />
          <KpiCard label="Cant. de ventas" value={v.cantVentas} prev={v.cantVentasPrev} icon="receipt_long" />
          <KpiCard label="Promedio por venta" value={v.promedioVenta} prev={v.promedioVentaPrev} icon="calculate" suffix="$" />
          <KpiCard label="Personas" value={v.personas} icon="groups" />
          <KpiCard label="Prom. por persona" value={v.promedioPersona} icon="person" suffix="$" />
        </div>

        <div style={isDesktop ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' } : { display: 'flex', flexDirection: 'column', gap: 16 }}>
          {v.evolucionDiaria.length > 0 && card('Evolución de ventas', <BarChart items={v.evolucionDiaria.map(d => ({ label: d.label, value: d.value, subLabel: fmtMoney(d.value) }))} maxVal={Math.max(...v.evolucionDiaria.map(d => d.value))} />)}
          {v.porDiaSemana.some(d => d.value > 0) && card('Ventas por día de la semana', <BarChart items={v.porDiaSemana.map(d => ({ label: d.label, value: d.value, subLabel: fmtMoney(d.value) }))} maxVal={Math.max(...v.porDiaSemana.map(d => d.value))} />)}
          {v.porHora.length > 0 && card('Ventas por hora', <BarChart items={v.porHora.map(d => ({ label: d.label, value: d.value, color: '#f97316', subLabel: fmtMoney(d.value) }))} maxVal={Math.max(...v.porHora.map(d => d.value))} />)}
          {v.medios.length > 0 && card('Medios de pago', <BarChart items={v.medios.map(m => ({ label: m.nombre, value: m.monto, color: 'var(--accent)', subLabel: `${fmtMoney(m.monto)} · ${fmtPct(m.pct)}` }))} maxVal={Math.max(...v.medios.map(m => m.monto))} />)}
          {v.origenes.length > 0 && card('Origen de las ventas', <BarChart items={v.origenes.map(o => ({ label: o.origen, value: o.monto, subLabel: `${fmtMoney(o.monto)} · ${fmtPct(o.pct)}` }))} maxVal={Math.max(...v.origenes.map(o => o.monto))} />)}
          {v.meseros.length > 0 && card('Ranking de meseros', (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {v.meseros.map((m, i) => (
                <div key={m.mozo_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < v.meseros.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', width: 18 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{m.nombre}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{m.cantidad} vta{m.cantidad !== 1 ? 's' : ''}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{fmtMoney(m.ventas)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Diferenciador KOS: ranking por GANANCIA (no solo facturación) */}
        {rankGanancia.length > 0 && (
          <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#16a34a' }}>trending_up</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Platos por ganancia real</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>Ingreso − food cost. Lo que un POS no puede calcular porque no conoce las recetas.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 90px', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              <span>Plato</span>
              <span style={{ textAlign: 'right' }}>Vend.</span>
              <span style={{ textAlign: 'right' }}>Ingreso</span>
              <span style={{ textAlign: 'right' }}>Ganancia</span>
            </div>
            {rankGanancia.map((p, i) => (
              <div key={p.carta_item_id} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 90px', padding: '9px 0', borderBottom: i < rankGanancia.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
                <span style={{ color: 'var(--text-1)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                <span style={{ textAlign: 'right', color: 'var(--text-2)' }}>{p.cantidad}</span>
                <span style={{ textAlign: 'right', color: 'var(--text-2)' }}>{fmtMoney(p.ingreso)}</span>
                <span style={{ textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{fmtMoney(p.ganancia ?? 0)}</span>
              </div>
            ))}
            {conCosto < v.platosVendidos.length && (
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8 }}>
                {v.platosVendidos.length - conCosto} plato(s) vendidos sin food cost cargado quedan fuera de este ranking — vinculá su receta en Carta.
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  function renderFoodCost() {
    if (!foodCostData.length) return <EmptyState icon="restaurant" text="Sin datos de food cost. Vinculá recetas a la carta (Carta → Plato → FC)." />
    const max = Math.max(...foodCostData.map(f => f.food_cost_pct))
    const avgFc = foodCostData.reduce((s, f) => s + f.food_cost_pct, 0) / foodCostData.length
    return (
      <div style={isDesktop
        ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }
        : { display: 'flex', flexDirection: 'column', gap: 16 }
      }>
        {/* Left: Summary + Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Food Cost Promedio</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: fcColor(avgFc) }}>{fmtPct(avgFc)}</div>
          </div>
          <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 60px', padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase' }}>
              <span>Plato</span>
              <span style={{ textAlign: 'right' }}>Costo</span>
              <span style={{ textAlign: 'right' }}>Precio</span>
              <span style={{ textAlign: 'right' }}>FC%</span>
            </div>
            {foodCostData.map((item, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 60px', padding: '10px 12px', borderBottom: i < foodCostData.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
                <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>{item.nombre}</span>
                <span style={{ textAlign: 'right', color: 'var(--text-2)' }}>{fmtMoney(item.costo_porcion)}</span>
                <span style={{ textAlign: 'right', color: 'var(--text-2)' }}>{fmtMoney(item.precio_venta)}</span>
                <span style={{ textAlign: 'right', fontWeight: 600, color: fcColor(item.food_cost_pct) }}>{fmtPct(item.food_cost_pct)}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Right: Bar chart + Legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 12 }}>Food Cost por plato</div>
            <BarChart
              items={foodCostData.map(f => ({ label: f.nombre, value: f.food_cost_pct, color: fcColor(f.food_cost_pct), subLabel: fmtPct(f.food_cost_pct) }))}
              maxVal={Math.max(max, 50)}
            />
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-3)' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#16a34a', marginRight: 4 }} /> &lt;30% Ideal</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#ca8a04', marginRight: 4 }} /> 30-35% Alerta</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#dc2626', marginRight: 4 }} /> &gt;35% Crítico</span>
          </div>
        </div>
      </div>
    )
  }

  function renderCompras() {
    const { proveedores, facturas } = comprasData
    if (!proveedores.length) {
      const esMesActual = periodo === 'mes'
      return <EmptyState icon="shopping_cart"
        text={esMesActual ? `Sin compras en "${PERIODOS.find(p => p.key === periodo)?.label}". Puede que el mes no tenga facturas cargadas aún.` : 'Sin compras para el período seleccionado.'}
        cta={esMesActual ? { label: 'Ver Último mes', onClick: () => setPeriodo('mes_anterior') } : undefined}
      />
    }
    const maxTotal = Math.max(...proveedores.map(p => p.total))
    const totalGlobal = proveedores.reduce((s, p) => s + p.total, 0)

    return (
      <div style={isDesktop
        ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }
        : { display: 'flex', flexDirection: 'column', gap: 16 }
      }>
        {/* Left: KPIs + Bar chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <KpiCard label="Total Compras" value={totalGlobal} icon="payments" suffix="$" />
            <KpiCard label="Proveedores" value={proveedores.length} icon="local_shipping" />
          </div>
          <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 12 }}>Compras por proveedor</div>
            <BarChart
              items={proveedores.map(p => ({ label: p.proveedor, value: p.total, subLabel: `${fmtMoney(p.total)} (${fmtPct(p.porcentaje)})` }))}
              maxVal={maxTotal}
            />
          </div>
        </div>
        {/* Right: Facturas list */}
        <div>
          <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Últimas facturas</span>
            </div>
            {facturas.slice(0, isDesktop ? 20 : 10).map((f, i) => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: i < Math.min(facturas.length, isDesktop ? 20 : 10) - 1 ? '1px solid var(--border)' : 'none' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{f.proveedor_nombre}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{f.fecha_factura ?? 'Sin fecha'}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>{fmtMoney(f.total)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  function renderPrecios() {
    const { productos, inflacionCocina } = preciosData
    const { comparador, topSobreprecio } = comparadorData
    if (!productos.length && !comparador.length) return <EmptyState icon="trending_up" text="Sin datos de precios — importá facturas para ver la evolución" />

    const ahorroTotal = topSobreprecio.reduce((s, t) => s + t.ahorroPotencial, 0)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Inflation KPI */}
        {productos.length > 0 && (
          <div style={{
            background: 'var(--surface)', borderRadius: 12, padding: 14,
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Inflación Cocina (promedio)</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: variacionColor(inflacionCocina) }}>
              {inflacionCocina > 0 ? '+' : ''}{fmtPct(inflacionCocina)}
            </div>
          </div>
        )}

        {/* Price table */}
        {productos.length > 0 && (
          <div style={{
            background: 'var(--surface)', borderRadius: 12,
            border: '1px solid var(--border)', overflow: 'hidden',
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 75px 75px 65px',
              padding: '10px 12px', borderBottom: '1px solid var(--border)',
              fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase',
            }}>
              <span>Producto</span>
              <span style={{ textAlign: 'right' }}>Anterior</span>
              <span style={{ textAlign: 'right' }}>Actual</span>
              <span style={{ textAlign: 'right' }}>Var%</span>
            </div>
            {productos.slice(0, 20).map((item, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr 75px 75px 65px',
                padding: '10px 12px',
                borderBottom: i < Math.min(productos.length, 20) - 1 ? '1px solid var(--border)' : 'none',
                fontSize: 13,
              }}>
                <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>{item.producto}</span>
                <span style={{ textAlign: 'right', color: 'var(--text-3)' }}>{fmtMoney(item.precio_anterior)}</span>
                <span style={{ textAlign: 'right', color: 'var(--text-2)' }}>{fmtMoney(item.precio_actual)}</span>
                <span style={{
                  textAlign: 'right', fontWeight: 600,
                  color: variacionColor(item.variacion_pct),
                }}>
                  {item.variacion_pct > 0 ? '+' : ''}{fmtPct(item.variacion_pct)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Top 10 sobreprecio — alerta agregada, "número de marketing" (Q5) */}
        {topSobreprecio.length > 0 && (
          <div style={{
            background: 'rgba(220,38,38,.06)', borderRadius: 12, padding: 14,
            border: '1px solid rgba(220,38,38,.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#dc2626' }}>savings</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Ahorro potencial (últimos 90 días)</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#dc2626', marginBottom: 10 }}>{fmtMoney(ahorroTotal)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10 }}>
              Top {topSobreprecio.length} productos donde pagaste por encima del mejor precio disponible entre tus proveedores
            </div>
            {topSobreprecio.map((t, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0', borderTop: i > 0 ? '1px solid rgba(220,38,38,.12)' : 'none',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.producto}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Mejor: {t.mejorProveedor} a {fmtMoney(t.mejorPrecio)}/{t.unidad}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', flexShrink: 0, marginLeft: 10 }}>{fmtMoney(t.ahorroPotencial)}</div>
              </div>
            ))}
          </div>
        )}

        {/* Comparador de precios por proveedor (Q5) */}
        {comparador.length > 0 && (
          <div style={{
            background: 'var(--surface)', borderRadius: 12,
            border: '1px solid var(--border)', overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Comparador de precios por proveedor</span>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Últimos 90 días · solo productos comprados a 2 o más proveedores</div>
            </div>
            {comparador.slice(0, 20).map((c, i) => (
              <div key={i} style={{
                padding: '10px 12px',
                borderBottom: i < Math.min(comparador.length, 20) - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{c.producto}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>/{c.unidad}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#16a34a' }}>
                    Mejor: {c.mejorProveedor} — {fmtMoney(c.mejorPrecio)}
                  </span>
                  <span style={{ color: c.deltaUltimoPct > 0.5 ? '#dc2626' : 'var(--text-3)', fontWeight: 600 }}>
                    Último: {c.ultimoPagado.proveedor} — {fmtMoney(c.ultimoPagado.precio)}
                    {c.deltaUltimoPct > 0.5 ? ` (+${fmtPct(c.deltaUltimoPct)})` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderProduccion() {
    const { recetasProducidas, ingredientesMasUsados, horasEstimadas } = produccionData
    if (!recetasProducidas.length) return <EmptyState icon="factory" text="Sin datos de producción para el período" />
    const maxReceta = Math.max(...recetasProducidas.map(r => r.cantidad))
    const maxIng = ingredientesMasUsados.length > 0 ? Math.max(...ingredientesMasUsados.map(i => i.usos)) : 1

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* KPI */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <KpiCard label="Recetas Producidas" value={recetasProducidas.length} icon="menu_book" />
          <KpiCard label="Horas Estimadas" value={Math.round(horasEstimadas * 10) / 10} icon="schedule" />
        </div>

        {/* Recetas bar chart */}
        <div style={{
          background: 'var(--surface)', borderRadius: 12, padding: 14,
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 12 }}>Recetas más producidas</div>
          {recetasProducidas.slice(0, 10).map((r, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{r.nombre}</span>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.cantidad}x</span>
              </div>
              <div style={{ background: 'var(--border)', borderRadius: 6, height: 18, overflow: 'hidden' }}>
                <div style={{
                  width: `${(r.cantidad / maxReceta) * 100}%`,
                  height: '100%', background: 'var(--navy)', borderRadius: 6,
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          ))}
        </div>

        {/* Ingredientes más usados */}
        {ingredientesMasUsados.length > 0 && (
          <div style={{
            background: 'var(--surface)', borderRadius: 12, padding: 14,
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 12 }}>Ingredientes más usados</div>
            {ingredientesMasUsados.slice(0, 10).map((ing, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{ing.nombre}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{ing.usos} usos</span>
                </div>
                <div style={{ background: 'var(--border)', borderRadius: 6, height: 18, overflow: 'hidden' }}>
                  <div style={{
                    width: `${(ing.usos / maxIng) * 100}%`,
                    height: '100%', background: '#8b5cf6', borderRadius: 6,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── CMV ──
  function renderCMV() {
    if (!cmvData || (cmvData.ventas === 0 && cmvData.compras === 0)) {
      const esMesActual = periodo === 'mes'
      return <EmptyState icon="savings"
        text={esMesActual ? `Sin datos en "${PERIODOS.find(p => p.key === periodo)?.label}". Es posible que el mes recién empiece.` : 'Sin datos. Importá ventas y cargá facturas para calcular el CMV.'}
        cta={esMesActual ? { label: 'Ver Último mes', onClick: () => setPeriodo('mes_anterior') } : undefined}
      />
    }
    const c = cmvData
    const cmvCol = c.cmvPct < 33 ? '#16a34a' : c.cmvPct <= 40 ? '#ca8a04' : '#dc2626'
    return (
      <div style={isDesktop
        ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }
        : { display: 'flex', flexDirection: 'column', gap: 16 }
      }>
        {/* Left: Hero + Bar chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 18, border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Costo Mercadería Vendida</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: cmvCol, lineHeight: 1 }}>{c.ventas > 0 ? fmtPct(c.cmvPct) : '—'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
              {c.ventas > 0 ? (c.cmvPct < 33 ? 'Saludable' : c.cmvPct <= 40 ? 'Atención' : 'Crítico') : 'Importá ventas para el %'}
            </div>
          </div>
          <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 12 }}>Ventas vs Costo</div>
            <BarChart
              items={[
                { label: 'Ventas', value: c.ventas, color: '#16a34a', subLabel: fmtMoney(c.ventas) },
                { label: 'Compras', value: c.compras, color: 'var(--navy)', subLabel: fmtMoney(c.compras) },
              ]}
              maxVal={Math.max(c.ventas, c.compras, 1)}
            />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
            El CMV se calcula como compras confirmadas ÷ ventas del período. Un CMV sano en gastronomía suele estar entre 28% y 35%.
          </p>
        </div>
        {/* Right: KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignContent: 'start' }}>
          <KpiCard label="Ventas" value={c.ventas} prev={c.ventasAnterior} icon="point_of_sale" suffix="$" />
          <KpiCard label="Compras (costo)" value={c.compras} prev={c.comprasAnterior} icon="shopping_cart" suffix="$" />
          <KpiCard label="Margen bruto" value={c.margenBruto} icon="trending_up" suffix="$" />
          <KpiCard label="Ticket promedio" value={Math.round(c.ticketPromedio)} icon="receipt" suffix="$" />
          {esAdmin && c.costoLaboral !== null && (
            <KpiCard label="Costo laboral" value={c.costoLaboral} prev={c.costoLaboralAnterior ?? undefined} icon="badge" suffix="$" />
          )}
        </div>
        {esAdmin && c.costoLaboral === null && (
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.5, gridColumn: isDesktop ? '1 / -1' : undefined }}>
            Cargá el costo por hora de tu equipo (Turnos → Equipo → editar miembro) para ver el costo laboral del período.
          </p>
        )}
      </div>
    )
  }

  // ── Presupuesto vs Real ──
  function renderPresupuesto() {
    const periodos: PeriodoPresupuesto[] = ['semanal', 'mensual', 'trimestral', 'semestral', 'anual']
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
          Ingresá tu presupuesto de compras por período. Se compara contra las facturas confirmadas del período actual.
        </p>
        {periodos.map(per => {
          const row = presuData.find(r => r.periodo === per) ?? { periodo: per, presupuesto: 0, real: 0 }
          const pct = row.presupuesto > 0 ? (row.real / row.presupuesto) * 100 : 0
          const over = row.presupuesto > 0 && row.real > row.presupuesto
          const barCol = pct < 80 ? '#16a34a' : pct <= 100 ? '#ca8a04' : '#dc2626'
          return (
            <div key={per} style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{PRESU_LABELS[per]}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>$</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    defaultValue={row.presupuesto || ''}
                    placeholder="0"
                    onBlur={async (e) => {
                      const val = parseFloat(e.target.value) || 0
                      if (val !== row.presupuesto) {
                        await savePresupuesto(per, val)
                        const updated = await fetchPresupuestos()
                        setPresuData(updated)
                      }
                    }}
                    style={{
                      width: 110, textAlign: 'right', padding: '6px 10px', borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)',
                      fontSize: 14, fontWeight: 600, outline: 'none',
                    }}
                  />
                </div>
              </div>
              {row.presupuesto > 0 ? (
                <>
                  <div style={{ background: 'var(--border)', borderRadius: 6, height: 20, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: barCol, borderRadius: 6, transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-2)' }}>Gastado: <strong style={{ color: 'var(--text-1)' }}>{fmtMoney(row.real)}</strong></span>
                    <span style={{ color: over ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                      {over ? `Excedido ${fmtMoney(row.real - row.presupuesto)}` : `Resta ${fmtMoney(row.presupuesto - row.real)}`}
                    </span>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  Gastado este período: <strong style={{ color: 'var(--text-1)' }}>{fmtMoney(row.real)}</strong> · Definí un presupuesto para ver el avance
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ── Rendimiento por plaza ──
  function renderRendimiento() {
    if (!rendData.length) return <EmptyState icon="speed" text="Sin actividad por plaza en el período" />
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rendData.map(r => {
          const col = r.cumplimientoPct >= 80 ? '#16a34a' : r.cumplimientoPct >= 50 ? '#ca8a04' : '#dc2626'
          return (
            <div key={r.plaza} style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', textTransform: 'capitalize' }}>{r.plaza}</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: col }}>{fmtPct(r.cumplimientoPct)}</span>
              </div>
              <div style={{ background: 'var(--border)', borderRadius: 6, height: 16, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ width: `${Math.min(r.cumplimientoPct, 100)}%`, height: '100%', background: col, borderRadius: 6, transition: 'width 0.4s' }} />
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-2)' }}>
                <span><span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle' }}>check_circle</span> {r.tareasCompletadas}/{r.tareasTotal} tareas</span>
                {r.mermaCosto > 0 && (
                  <span style={{ color: '#dc2626' }}><span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle' }}>delete_sweep</span> {fmtMoney(r.mermaCosto)} merma</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function renderCaja() {
    if (!cajaHistorial.length) return <EmptyState icon="point_of_sale" text="Todavía no hay cierres de caja registrados" />
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {cajaHistorial.map(c => {
          const diferencia = c.diferencia_total ?? 0
          const col = diferencia === 0 ? '#16a34a' : diferencia > 0 ? '#16a34a' : '#dc2626'
          const medioIds = Object.keys(c.montos_declarados ?? {})
          return (
            <div key={c.id} style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                  {c.fecha_cierre ? new Date(c.fecha_cierre).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                </span>
                <span style={{ fontSize: 16, fontWeight: 800, color: col }}>
                  {diferencia > 0 ? '+' : ''}{fmtMoney(diferencia)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>
                {c.fecha_cierre ? new Date(c.fecha_cierre).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : ''}
                {' · '}Abrió {c.abierta_por ? (nombresEquipo[c.abierta_por] ?? '—') : '—'}
                {' · '}Cerró {c.cerrada_por ? (nombresEquipo[c.cerrada_por] ?? '—') : '—'}
                {c.arqueo_ciego && ' · arqueo ciego'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {medioIds.map(medioId => {
                  const esperado = c.montos_esperados?.[medioId] ?? 0
                  const declarado = c.montos_declarados?.[medioId] ?? 0
                  const diff = declarado - esperado
                  return (
                    <div key={medioId} style={{ flex: '1 1 120px', background: 'var(--bg)', borderRadius: 8, padding: '6px 10px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase' }}>{medioNombre(medioId)}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: diff === 0 ? 'var(--text-1)' : diff > 0 ? '#16a34a' : '#dc2626' }}>
                        {fmtMoney(declarado)}
                      </div>
                    </div>
                  )
                })}
              </div>
              {c.notas && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, fontStyle: 'italic' }}>{c.notas}</div>}
            </div>
          )
        })}
      </div>
    )
  }

  function scoreColor(score: number) {
    if (score >= 90) return '#16a34a'
    if (score >= 70) return '#f97316'
    return '#dc2626'
  }

  // Pase de turno incumplido (Fase 3): turnos con apertura pero sin ningún
  // cierre completado — se deduce de checklist_registros, sin storage propio.
  // "Sin asignar" cuando nadie llegó a tocar el cierre (usuario_id null).
  function renderPaseTurnoIncumplido() {
    if (!paseTurnoIncumplidos.length) return null
    const porPlaza = new Map<string, number>()
    const porPersona = new Map<string, number>()
    for (const pt of paseTurnoIncumplidos) {
      porPlaza.set(pt.plaza, (porPlaza.get(pt.plaza) ?? 0) + 1)
      const nombre = pt.usuarioId ? (nombresEquipo[pt.usuarioId] ?? 'Ex-miembro del equipo') : 'Sin asignar'
      porPersona.set(nombre, (porPersona.get(nombre) ?? 0) + 1)
    }
    return (
      <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 16, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#dc2626' }}>report</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Pase de turno incumplido</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#dc2626' }}>{paseTurnoIncumplidos.length} turnos</span>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0 }}>Turnos donde se hizo la apertura pero nadie cerró el mise. No bloquea nada — es información para conversar con el equipo.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 6px' }}>Por plaza</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[...porPlaza.entries()].sort((a, b) => b[1] - a[1]).map(([plaza, n]) => (
                <div key={plaza} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: 'var(--text-2)' }}>{PLAZA_LABELS[plaza] ?? plaza}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{n}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 6px' }}>Por persona</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[...porPersona.entries()].sort((a, b) => b[1] - a[1]).map(([nombre, n]) => (
                <div key={nombre} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: 'var(--text-2)' }}>{nombre}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  function renderAuditoria() {
    const paseTurnoCard = renderPaseTurnoIncumplido()
    if (!auditoriaHistorial.length) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {paseTurnoCard}
          <EmptyState icon="fact_check" text="Todavía no hay pasadas de auditoría cerradas en este período. Se registran desde Checklist → Rutina, configurando puntaje en un ítem." />
        </div>
      )
    }
    const porFecha = [...auditoriaHistorial].sort((a, b) => a.fecha.localeCompare(b.fecha))
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {paseTurnoCard}
        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 16, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Evolución del score</span>
            <button onClick={exportAuditoriaPDF} style={{
              display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--accent)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', padding: 0,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>picture_as_pdf</span>
              Exportar PDF
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100 }}>
            {porFecha.map(a => (
              <div key={a.id} title={`${a.fecha} · ${PLAZA_LABELS[a.plaza] ?? a.plaza} · ${a.score}%`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ width: '100%', height: `${Math.max(a.score, 3)}%`, background: scoreColor(a.score), borderRadius: '4px 4px 0 0', transition: 'height .3s' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{porFecha[0]?.fecha}</span>
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{porFecha[porFecha.length - 1]?.fecha}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...auditoriaHistorial].sort((a, b) => b.fecha.localeCompare(a.fecha)).map(a => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                  {new Date(a.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {' · '}{PLAZA_LABELS[a.plaza] ?? a.plaza}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                  {a.items_evaluados} evaluados{a.items_fallidos > 0 ? ` · ${a.items_fallidos} fallidos` : ''}
                </div>
              </div>
              <span style={{ fontSize: 16, fontWeight: 800, color: scoreColor(a.score), fontFamily: "'DM Mono', monospace" }}>{a.score}%</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  function EmptyState({ icon, text, cta }: { icon: string; text: string; cta?: { label: string; onClick: () => void } }) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '48px 16px', gap: 8,
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--text-3)' }}>{icon}</span>
        <span style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', maxWidth: 280 }}>{text}</span>
        {cta && (
          <button onClick={cta.onClick} style={{ marginTop: 8, padding: '10px 20px', borderRadius: 10, border: 'none', background: 'var(--navy)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {cta.label}
          </button>
        )}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  return (
    <PageTransition>
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 }}>Reportes</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {puedeVer('reportes') && TABS_EXPORTABLES.includes(tab) && (
              <HeaderAction
                label="Exportar"
                icon="table_view"
                onClick={handleExportar}
                disabled={tabLoading}
                style={{ padding: '7px 12px', fontSize: 12 }}
              />
            )}
            {esAdmin && (
              <button
                onClick={() => router.push('/reportes/personal')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(255,255,255,0.15)', border: 'none',
                  borderRadius: 10, padding: '7px 12px', cursor: 'pointer',
                  color: '#fff', fontSize: 12, fontWeight: 600,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>group</span>
                Personal
              </button>
            )}
          </div>
        </div>

        {/* Period selector */}
        <div data-coach-target="reportes-periodo" style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          {PERIODOS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriodo(p.key)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                border: 'none', cursor: 'pointer',
                background: periodo === p.key ? '#fff' : 'rgba(255,255,255,0.15)',
                color: periodo === p.key ? 'var(--navy)' : 'rgba(255,255,255,0.8)',
                transition: 'all 0.2s',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div data-coach-target="reportes-tabs" style={{
        display: 'flex', overflowX: 'auto', gap: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        WebkitOverflowScrolling: 'touch',
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '10px 14px', fontSize: 12, fontWeight: 500,
              border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              background: 'transparent',
              color: tab === t.key ? 'var(--navy)' : 'var(--text-3)',
              borderBottom: tab === t.key ? '2px solid var(--navy)' : '2px solid transparent',
              transition: 'all 0.2s',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div data-coach-target="reportes-contenido" style={{ padding: isDesktop ? '24px 32px' : 16 }}>
        {(loading || tabLoading) ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '48px 16px', gap: 8,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
            <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Cargando...</span>
          </div>
        ) : (
          <>
            {tab === 'resumen' && renderResumen()}
            {tab === 'ventas' && renderVentas()}
            {tab === 'cmv' && renderCMV()}
            {tab === 'presupuesto' && renderPresupuesto()}
            {tab === 'rendimiento' && renderRendimiento()}
            {tab === 'foodcost' && renderFoodCost()}
            {tab === 'compras' && renderCompras()}
            {tab === 'precios' && renderPrecios()}
            {tab === 'produccion' && renderProduccion()}
            {tab === 'caja' && renderCaja()}
            {tab === 'auditoria' && renderAuditoria()}
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
    </PageTransition>
  )
}
