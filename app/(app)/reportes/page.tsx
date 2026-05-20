'use client'

import PageTransition from '@/components/PageTransition'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import {
  useReportes,
  type Periodo,
  type ReporteResumen,
  type FoodCostItem,
  type CompraProveedor,
  type FacturaResumen,
  type PrecioEvolucion,
  type ProduccionData,
} from '@/lib/hooks/useReportes'

type Tab = 'resumen' | 'foodcost' | 'compras' | 'precios' | 'produccion'

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
  { key: 'mes_anterior', label: 'Último mes' },
]

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'resumen', label: 'Resumen', icon: 'dashboard' },
  { key: 'foodcost', label: 'Food Cost', icon: 'restaurant' },
  { key: 'compras', label: 'Compras', icon: 'shopping_cart' },
  { key: 'precios', label: 'Precios', icon: 'trending_up' },
  { key: 'produccion', label: 'Producción', icon: 'factory' },
]

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
  const { loading, fetchResumen, fetchFoodCost, fetchCompras, fetchPrecios, fetchProduccion } = useReportes()

  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [tab, setTab] = useState<Tab>('resumen')

  // Data states
  const [resumen, setResumen] = useState<ReporteResumen | null>(null)
  const [foodCostData, setFoodCostData] = useState<FoodCostItem[]>([])
  const [comprasData, setComprasData] = useState<{ proveedores: CompraProveedor[]; facturas: FacturaResumen[] }>({ proveedores: [], facturas: [] })
  const [preciosData, setPreciosData] = useState<{ productos: PrecioEvolucion[]; inflacionCocina: number }>({ productos: [], inflacionCocina: 0 })
  const [produccionData, setProduccionData] = useState<ProduccionData>({ recetasProducidas: [], ingredientesMasUsados: [], horasEstimadas: 0 })

  const [tabLoading, setTabLoading] = useState(false)

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
          break
        }
        case 'produccion': {
          const prod = await fetchProduccion(p)
          setProduccionData(prod)
          break
        }
      }
    } catch (e) {
      console.error('Error loading tab:', e)
    } finally {
      setTabLoading(false)
    }
  }, [fetchResumen, fetchFoodCost, fetchCompras, fetchPrecios, fetchProduccion])

  useEffect(() => {
    loadTab(tab, periodo)
  }, [tab, periodo, loadTab])

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function KpiCard({ label, value, prev, icon, suffix }: { label: string; value: number; prev?: number; icon: string; suffix?: string }) {
    const displayVal = suffix === '%' ? fmtPct(value) : suffix === '$' ? fmtMoney(value) : value.toString()
    let arrow = ''
    let arrowColor = 'var(--text-3)'
    if (prev !== undefined && prev > 0) {
      const change = ((value - prev) / prev) * 100
      if (change > 0) { arrow = `+${change.toFixed(0)}%`; arrowColor = label.includes('Food') ? '#dc2626' : '#16a34a' }
      else if (change < 0) { arrow = `${change.toFixed(0)}%`; arrowColor = label.includes('Food') ? '#16a34a' : '#dc2626' }
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <KpiCard label="Total Compras" value={resumen.totalCompras} prev={resumen.comprasAnterior} icon="payments" suffix="$" />
          <KpiCard label="Facturas" value={resumen.cantFacturas} prev={resumen.facturasAnterior} icon="receipt_long" />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <KpiCard label="Productos en Stock" value={resumen.productosEnStock} icon="inventory_2" />
          <KpiCard label="Food Cost Prom." value={resumen.foodCostPromedio} icon="restaurant" suffix="%" />
        </div>
      </div>
    )
  }

  function renderFoodCost() {
    if (!foodCostData.length) return <EmptyState icon="restaurant" text="Sin datos de food cost. Vinculá recetas a la carta." />
    const max = Math.max(...foodCostData.map(f => f.food_cost_pct))
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Summary */}
        <div style={{
          background: 'var(--surface)', borderRadius: 12, padding: 14,
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Food Cost Promedio</div>
          <div style={{
            fontSize: 26, fontWeight: 700,
            color: fcColor(foodCostData.reduce((s, f) => s + f.food_cost_pct, 0) / foodCostData.length),
          }}>
            {fmtPct(foodCostData.reduce((s, f) => s + f.food_cost_pct, 0) / foodCostData.length)}
          </div>
        </div>

        {/* Table */}
        <div style={{
          background: 'var(--surface)', borderRadius: 12,
          border: '1px solid var(--border)', overflow: 'hidden',
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 70px 70px 60px',
            padding: '10px 12px', borderBottom: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase',
          }}>
            <span>Plato</span>
            <span style={{ textAlign: 'right' }}>Costo</span>
            <span style={{ textAlign: 'right' }}>Precio</span>
            <span style={{ textAlign: 'right' }}>FC%</span>
          </div>
          {foodCostData.map((item, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr 70px 70px 60px',
              padding: '10px 12px',
              borderBottom: i < foodCostData.length - 1 ? '1px solid var(--border)' : 'none',
              fontSize: 13,
            }}>
              <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>{item.nombre}</span>
              <span style={{ textAlign: 'right', color: 'var(--text-2)' }}>{fmtMoney(item.costo_porcion)}</span>
              <span style={{ textAlign: 'right', color: 'var(--text-2)' }}>{fmtMoney(item.precio_venta)}</span>
              <span style={{
                textAlign: 'right', fontWeight: 600,
                color: fcColor(item.food_cost_pct),
              }}>{fmtPct(item.food_cost_pct)}</span>
            </div>
          ))}
        </div>

        {/* Bar chart */}
        <div style={{
          background: 'var(--surface)', borderRadius: 12, padding: 14,
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 12 }}>Food Cost por plato</div>
          <BarChart
            items={foodCostData.map(f => ({
              label: f.nombre,
              value: f.food_cost_pct,
              color: fcColor(f.food_cost_pct),
              subLabel: fmtPct(f.food_cost_pct),
            }))}
            maxVal={Math.max(max, 50)}
          />
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-3)' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#16a34a', marginRight: 4 }} /> &lt;30% Ideal</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#ca8a04', marginRight: 4 }} /> 30-35% Alerta</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#dc2626', marginRight: 4 }} /> &gt;35% Crítico</span>
        </div>
      </div>
    )
  }

  function renderCompras() {
    const { proveedores, facturas } = comprasData
    if (!proveedores.length) return <EmptyState icon="shopping_cart" text="Sin compras para el período" />
    const maxTotal = Math.max(...proveedores.map(p => p.total))
    const totalGlobal = proveedores.reduce((s, p) => s + p.total, 0)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* KPIs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <KpiCard label="Total Compras" value={totalGlobal} icon="payments" suffix="$" />
          <KpiCard label="Proveedores" value={proveedores.length} icon="local_shipping" />
        </div>

        {/* Bar chart */}
        <div style={{
          background: 'var(--surface)', borderRadius: 12, padding: 14,
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 12 }}>Compras por proveedor</div>
          <BarChart
            items={proveedores.map(p => ({
              label: p.proveedor,
              value: p.total,
              subLabel: `${fmtMoney(p.total)} (${fmtPct(p.porcentaje)})`,
            }))}
            maxVal={maxTotal}
          />
        </div>

        {/* Facturas list */}
        <div style={{
          background: 'var(--surface)', borderRadius: 12,
          border: '1px solid var(--border)', overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Últimas facturas</span>
          </div>
          {facturas.slice(0, 10).map((f, i) => (
            <div key={f.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px',
              borderBottom: i < Math.min(facturas.length, 10) - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{f.proveedor_nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{f.fecha_factura ?? 'Sin fecha'}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>{fmtMoney(f.total)}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  function renderPrecios() {
    const { productos, inflacionCocina } = preciosData
    if (!productos.length) return <EmptyState icon="trending_up" text="Sin datos de evolución de precios" />

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Inflation KPI */}
        <div style={{
          background: 'var(--surface)', borderRadius: 12, padding: 14,
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Inflación Cocina (promedio)</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: variacionColor(inflacionCocina) }}>
            {inflacionCocina > 0 ? '+' : ''}{fmtPct(inflacionCocina)}
          </div>
        </div>

        {/* Price table */}
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

  function EmptyState({ icon, text }: { icon: string; text: string }) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '48px 16px', gap: 8,
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--text-3)' }}>{icon}</span>
        <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{text}</span>
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
      <div style={{ background: 'var(--navy)', padding: '46px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 }}>Reportes</h1>
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

        {/* Period selector */}
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
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
      <div style={{
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
      <div style={{ padding: 16 }}>
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
            {tab === 'foodcost' && renderFoodCost()}
            {tab === 'compras' && renderCompras()}
            {tab === 'precios' && renderPrecios()}
            {tab === 'produccion' && renderProduccion()}
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
