'use client'

import PageTransition from '@/components/PageTransition'
import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { EmptyState, SegmentedTabs, Num } from '@/components/ui'
import { FAMILIA_GASTO_LABELS } from '@/lib/hooks/useCategoriasGasto'
import {
  useReportes,
  type PresupuestoFamiliasData,
} from '@/lib/hooks/useReportes'
import {
  usePresupuestoCMV,
  type SectorRow,
} from '@/lib/hooks/usePresupuestoCMV'

type Tab = 'familias' | 'sector'

function fmtMoney(n: number) {
  return '$' + Math.round(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtPct(n: number) {
  return n.toFixed(1) + '%'
}
function fmtPuntos(n: number) {
  return (n <= 0 ? '−' : '+') + fmtPct(Math.abs(n))
}
function colorDesvio(puntos: number) {
  return puntos <= 0 ? '#16a34a' : puntos <= 3 ? '#ca8a04' : '#dc2626'
}

function mesActualISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function mesConDelta(mesISO: string, delta: number): string {
  const [y, m] = mesISO.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function mesLabel(mesISO: string): string {
  const [y, m] = mesISO.split('-').map(Number)
  const label = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export default function PresupuestoPage() {
  const router = useRouter()
  const { verCostos } = usePermisos()
  const isDesktop = useIsDesktop()
  const [tab, setTab] = useState<Tab>('sector')
  const [mes, setMes] = useState(mesActualISO)

  // ── Familias (movido de Reportes → Presupuesto) ──
  const { fetchPresupuestoFamilias, savePresupuestoFamilia, aplicarEstructuraEstandar } = useReportes()
  const [presuFamiliasData, setPresuFamiliasData] = useState<PresupuestoFamiliasData>({ rows: [], ventas: 0, ventasPeriodoAnterior: 0, ebitdaPct: 0 })
  const [familiasLoading, setFamiliasLoading] = useState(false)
  const [aplicandoEstandar, setAplicandoEstandar] = useState(false)

  const loadFamilias = useCallback(async () => {
    setFamiliasLoading(true)
    try {
      const pr = await fetchPresupuestoFamilias()
      setPresuFamiliasData(pr)
    } finally { setFamiliasLoading(false) }
  }, [fetchPresupuestoFamilias])

  useEffect(() => { if (verCostos && tab === 'familias') loadFamilias() }, [verCostos, tab, loadFamilias])

  // ── CMV por sector ──
  const { data, loading: sectorLoading, guardarVentasEstimadas, guardarPresupuestoSector, sembrarMes } = usePresupuestoCMV(mes)
  const [sembrando, setSembrando] = useState(false)

  // Contexto para Kitchen Coach — insights accionables, no conteos. El
  // desvío total no dice nada sin saber QUÉ sector lo explica.
  useEffect(() => {
    if (!data) return
    const peorSector = [...data.sectores].sort((a, b) => b.desvioPuntos - a.desvioPuntos)[0]
    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'presupuesto',
      tab,
      mes: data.mes,
      cmvPct: Math.round(data.cmvPct * 10) / 10,
      objetivoPct: data.objetivoPct,
      desvioPuntos: Math.round(data.desvioPuntos * 10) / 10,
      desvioPlata: Math.round(data.desvioPlata),
      peorSector: peorSector ? { nombre: peorSector.nombre, desvioPuntos: Math.round(peorSector.desvioPuntos * 10) / 10 } : null,
      sinCategorizarMonto: Math.round(data.sinCategorizarMonto),
      sinPresupuestoCargado: !!(data.sectores.every(s => s.presupuestoEsSugerido) && data.ventasEstimadasEsSugerido),
      mermaSinCosto: data.merma.nSinCosto,
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [data, tab])

  if (!verCostos) {
    return (
      <PageTransition>
        <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
          <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 }}>Presupuesto</h1>
          </div>
          <EmptyState icon="lock" title="Sin acceso a los costos" subtitle="Tu puesto no tiene habilitado ver precios, food cost y presupuesto." />
        </div>
      </PageTransition>
    )
  }

  const sinPresupuestoTodavia = data && data.sectores.every(s => s.presupuestoEsSugerido) && data.ventasEstimadasEsSugerido

  async function handleSembrar() {
    if (sembrando) return
    setSembrando(true)
    try { await sembrarMes(mes) } finally { setSembrando(false) }
  }

  return (
    <PageTransition>
      <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
        {/* Header */}
        <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 }}>Presupuesto</h1>
            {tab === 'sector' && (
              <div data-coach-target="presupuesto-mes" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={() => setMes(m => mesConDelta(m, -1))}
                  style={{ background: 'rgba(255,255,255,.12)', border: 'none', borderRadius: 8, width: 28, height: 28, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>chevron_left</span>
                </button>
                <span style={{ fontSize: 12, color: '#fff', fontWeight: 600, minWidth: 100, textAlign: 'center' }}>{mesLabel(mes)}</span>
                <button onClick={() => setMes(m => mesConDelta(m, 1))} disabled={mes >= mesActualISO()}
                  style={{ background: 'rgba(255,255,255,.12)', border: 'none', borderRadius: 8, width: 28, height: 28, display: 'grid', placeItems: 'center', cursor: mes >= mesActualISO() ? 'default' : 'pointer', opacity: mes >= mesActualISO() ? .4 : 1 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>chevron_right</span>
                </button>
              </div>
            )}
          </div>
          <div data-coach-target="presupuesto-tabs">
            <SegmentedTabs
              tabs={[
                { id: 'sector', label: 'CMV por sector', icon: 'savings' },
                { id: 'familias', label: 'Familias', icon: 'account_balance_wallet' },
              ]}
              active={tab}
              onChange={setTab}
            />
          </div>
        </div>

        <div style={{ padding: '14px 14px calc(var(--fab-bottom) + 14px)', maxWidth: 1160, margin: '0 auto' }}>
          {tab === 'familias' ? (
            familiasLoading && !presuFamiliasData.rows.length ? (
              <EmptyState icon="hourglass_top" title="Cargando..." />
            ) : (
              <TabFamilias
                data={presuFamiliasData}
                aplicandoEstandar={aplicandoEstandar}
                onAplicarEstandar={async () => {
                  const base = presuFamiliasData.ventasPeriodoAnterior > 0 ? presuFamiliasData.ventasPeriodoAnterior : presuFamiliasData.ventas
                  if (base <= 0 || aplicandoEstandar) return
                  setAplicandoEstandar(true)
                  try { await aplicarEstructuraEstandar(base); await loadFamilias() } finally { setAplicandoEstandar(false) }
                }}
                onGuardarFamilia={async (familia, val) => { await savePresupuestoFamilia(familia, val); await loadFamilias() }}
              />
            )
          ) : (
            !data ? (
              <EmptyState icon="hourglass_top" title="Cargando..." />
            ) : data.sectores.length === 0 ? (
              <EmptyState icon="savings" title="Sin categorías de mercadería"
                subtitle="Configurá al menos una categoría de gasto con «Entra al CMV» activado para ver esta pantalla."
                cta={{ label: 'Ir a Categorías de Gasto', onClick: () => router.push('/facturas') }} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <BloqueA data={data} isDesktop={isDesktop}
                  sinPresupuestoTodavia={!!sinPresupuestoTodavia} sembrando={sembrando} onSembrar={handleSembrar}
                  onGuardarVentas={(val) => guardarVentasEstimadas(mes, val)} />

                {data.sinCategorizarMonto > 0 && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', borderRadius: 12, padding: '12px 14px', background: '#fbf0dc' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#c07806' }}>warning</span>
                    <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.45, flex: 1 }}>
                      <strong>{fmtMoney(data.sinCategorizarMonto)}</strong> en {data.sinCategorizarN} facturas del mes están sin categoría. Parte puede ser mercadería: el CMV de arriba es un piso, no el número final.
                    </div>
                    <button onClick={() => router.push('/facturas')}
                      style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, padding: '5px 11px', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Asignar por proveedor
                    </button>
                  </div>
                )}

                <BloqueSectoresSemanas
                  sectores={data.sectores} semanas={data.semanas}
                  mesLabelStr={mesLabel(data.mes)} diasDelMes={data.diasDelMes} mes={mes}
                  onGuardar={guardarPresupuestoSector}
                  subtotalComida={data.subtotalComidaReal} subtotalBebidas={data.subtotalBebidasReal} />

                <BloqueD merma={data.merma} arreglos={data.arreglos} ventasReales={data.ventasReales} />
              </div>
            )
          )}
        </div>
      </div>
    </PageTransition>
  )
}

// ── Bloque A · El mes ──
function BloqueA({ data, isDesktop, sinPresupuestoTodavia, sembrando, onSembrar, onGuardarVentas }: {
  data: NonNullable<ReturnType<typeof usePresupuestoCMV>['data']>
  isDesktop: boolean
  sinPresupuestoTodavia: boolean
  sembrando: boolean
  onSembrar: () => void
  onGuardarVentas: (val: number) => Promise<void>
}) {
  const col = colorDesvio(data.desvioPuntos)
  return (
    <div data-coach-target="presupuesto-hero" style={{ background: 'var(--surface)', borderRadius: 14, padding: 16, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', fontWeight: 600, marginBottom: 12 }}>
        {mesLabel(data.mes)} · {data.diasCorridos} de {data.diasDelMes} días
      </div>

      <div style={isDesktop ? { display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20, alignItems: 'center' } : { display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 46, fontWeight: 800, lineHeight: .95, letterSpacing: '-0.02em', color: col }}>
            <Num>{data.ventasReales > 0 ? fmtPct(data.cmvPct) : '—'}</Num>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.4 }}>
            CMV · objetivo <strong>{fmtPct(data.objetivoPct)}</strong><br />
            <span style={{ color: col, fontWeight: 700 }}>{fmtPuntos(data.desvioPuntos)} puntos</span> = <Num>{fmtMoney(Math.abs(data.desvioPlata))}</Num> {data.desvioPlata >= 0 ? 'de sobrecosto' : 'de margen'}
          </div>
        </div>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Stat label="Avance del mes" value={fmtPct(data.ritmoMes * 100)} sub={`${data.diasCorridos} de ${data.diasDelMes} días`} />
            <Stat label="Ventas" value={fmtMoney(data.ventasReales)} sub={data.ventasEstimadas > 0 ? `${fmtPct(data.ventasReales / data.ventasEstimadas * 100)} de ${fmtMoney(data.ventasEstimadas)} estimados` : 'sin estimado cargado'} />
            <Stat label="Gasto de mercadería" value={fmtMoney(data.gastoTotal)} sub={data.presupuestoTotal > 0 ? `${fmtPct(data.gastoTotal / data.presupuestoTotal * 100)} de ${fmtMoney(data.presupuestoTotal)}` : 'sin presupuesto'} />
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ background: 'var(--border)', borderRadius: 99, height: 8, overflow: 'hidden', position: 'relative' }}>
              <div style={{ width: `${Math.min(data.presupuestoTotal > 0 ? (data.gastoTotal / data.presupuestoTotal) * 100 : 0, 100)}%`, height: '100%', borderRadius: 99, background: col }} />
              <div style={{ position: 'absolute', top: -3, left: `${Math.min(data.ritmoMes * 100, 100)}%`, width: 2, height: 14, background: 'var(--text-3)', borderRadius: 2 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-2)', marginTop: 5 }}>
              <span>Presupuesto ejecutado {fmtPct(data.presupuestoTotal > 0 ? (data.gastoTotal / data.presupuestoTotal) * 100 : 0)}</span>
              <span>▲ ritmo del mes {fmtPct(data.ritmoMes * 100)}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: 12 }}>
        <Stat label="Proyección · ventas" value={fmtMoney(data.proyVentas)} sub="al ritmo del mes" accent />
        <Stat label="Proyección · gasto" value={fmtMoney(data.proyGasto)} sub="si el CMV no cambia" accent />
        <Stat label="Sobrecosto proyectado" value={fmtMoney(Math.abs(data.sobrecostoProy))} sub="contra el objetivo" color={data.sobrecostoProy > 0 ? '#ca8a04' : undefined} />
        <Stat label="Saldo de presupuesto" value={fmtMoney(Math.abs(data.saldo))} sub={data.saldo >= 0 ? `${fmtPct(data.saldoPct)} sin gastar` : 'excedido'} />
      </div>

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <VentasEstimadasInput data={data} onGuardar={onGuardarVentas} />
        {sinPresupuestoTodavia && (
          <button onClick={onSembrar} disabled={sembrando}
            style={{ padding: '9px 14px', borderRadius: 10, border: 'none', background: '#dc580c', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: sembrando ? .6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span>
            {sembrando ? 'Sembrando…' : 'Usar sugerido'}
          </button>
        )}
      </div>
      {data.historiaInsuficiente && (
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '8px 0 0' }}>
          Menos de 3 meses de historia de compras: el reparto sugerido por sector es en partes iguales hasta que haya más datos.
        </p>
      )}
    </div>
  )
}

function VentasEstimadasInput({ data, onGuardar }: { data: NonNullable<ReturnType<typeof usePresupuestoCMV>['data']>; onGuardar: (val: number) => Promise<void> }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
      <span>Ventas estimadas del mes:</span>
      <input
        type="number"
        inputMode="numeric"
        defaultValue={Math.round(data.ventasEstimadas) || ''}
        placeholder={String(Math.round(data.ventasEstimadasSugerido))}
        onBlur={async (e) => {
          const val = parseFloat(e.target.value) || 0
          if (val !== data.ventasEstimadas) await onGuardar(val)
        }}
        style={{ width: 130, textAlign: 'right', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontSize: 13, fontWeight: 600, outline: 'none' }}
      />
      {data.ventasEstimadasEsSugerido && (
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>sugerido, promedio 3 meses</span>
      )}
    </div>
  )
}

function Stat({ label, value, sub, accent, color }: { label: string; value: string; sub?: string; accent?: boolean; color?: string }) {
  return (
    <div style={{ borderLeft: `2px solid ${color ?? (accent ? 'var(--accent)' : 'var(--border)')}`, paddingLeft: 12 }}>
      <div style={{ fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: color ?? 'var(--text-1)' }}><Num>{value}</Num></div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}><Num>{sub}</Num></div>}
    </div>
  )
}

// ── Bloque B+C fusionado · Sectores × Mes × Semanas ──
// Una sola grilla panorámica (pedido de Facundo, ago 2026): sector = fila,
// MES + cada semana = grupos de columna, fiel al diseño de la planilla
// original en vez de dos tablas apiladas.
type SemanaRow = ReturnType<typeof usePresupuestoCMV>['data'] extends infer D ? D extends { semanas: infer S } ? S : never : never

function DesvioPill({ puntos }: { puntos: number }) {
  const col = colorDesvio(puntos)
  const bg = puntos <= 0 ? '#e4f4ee' : puntos <= 3 ? '#fbf0dc' : '#fbe6e6'
  return (
    <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: bg, color: col }}>
      <Num>{fmtPuntos(puntos)} pts</Num>
    </span>
  )
}

const THG: CSSProperties = { textAlign: 'center', fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 700, padding: '8px 8px 6px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }
const TH: CSSProperties = { textAlign: 'right', fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 500, padding: '0 8px 8px', whiteSpace: 'nowrap' }
const TD: CSSProperties = { padding: '7px 8px', borderTop: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap' }

function BloqueSectoresSemanas({ sectores, semanas, mesLabelStr, diasDelMes, mes, onGuardar, subtotalComida, subtotalBebidas }: {
  sectores: SectorRow[]
  semanas: SemanaRow
  mesLabelStr: string
  diasDelMes: number
  mes: string
  onGuardar: (mes: string, categoriaGastoId: string, monto: number) => Promise<void>
  subtotalComida: number
  subtotalBebidas: number
}) {
  const semanaLabels = [
    ['Sem 1', '1–7'], ['Sem 2', '8–14'], ['Sem 3', '15–21'],
    ['Sem 4', '22–28'], ['Sem 5', `29–${diasDelMes}`],
  ]
  const semanasPorSector = new Map(semanas.map(s => [s.categoriaGastoId, s.celdas]))

  const totalPresupuesto = sectores.reduce((s, r) => s + r.presupuesto, 0)
  const totalReal = sectores.reduce((s, r) => s + r.gastoReal, 0)
  const totalDesvio = sectores.reduce((s, r) => s + r.desvioPuntos, 0)
  const totalesSemana = [0, 1, 2, 3, 4].map(w => semanas.reduce((s, r) => s + r.celdas[w].gasto, 0))
  const presuTotalesSemana = [0, 1, 2, 3, 4].map(w => semanas.reduce((s, r) => s + r.celdas[w].presupuesto, 0))

  return (
    <div data-coach-target="presupuesto-sectores" style={{ background: 'var(--surface)', borderRadius: 14, padding: 16, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', fontWeight: 600, marginBottom: 12 }}>
        Sectores — el mes y semana a semana
      </div>

      <div data-coach-target="presupuesto-semanas" style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, minWidth: 900 }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ ...THG, textAlign: 'left', verticalAlign: 'bottom', borderRight: '2px solid var(--border)' }}>Sector</th>
              <th colSpan={3} style={{ ...THG, background: 'var(--bg)', borderRight: '2px solid var(--border)' }}>{mesLabelStr}</th>
              {semanaLabels.map(([l]) => (
                <th key={l} style={THG}>{l}</th>
              ))}
            </tr>
            <tr>
              <th style={{ ...TH, textAlign: 'right' }}>Presupuesto</th>
              <th style={TH}>Real</th>
              <th style={{ ...TH, borderRight: '2px solid var(--border)' }}>Desvío</th>
              {semanaLabels.map(([l, r]) => (
                <th key={l} style={TH}>{r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sectores.map(row => {
              const celdas = semanasPorSector.get(row.categoriaGastoId) ?? []
              return (
                <tr key={row.categoriaGastoId}>
                  <td style={{ ...TD, textAlign: 'left', fontWeight: 500, borderRight: '2px solid var(--border)' }}>{row.nombre}</td>
                  <td style={TD}>
                    <input
                      type="number"
                      inputMode="numeric"
                      defaultValue={Math.round(row.presupuesto) || ''}
                      onBlur={async (e) => {
                        const val = parseFloat(e.target.value) || 0
                        if (Math.round(val) !== Math.round(row.presupuesto)) await onGuardar(mes, row.categoriaGastoId, val)
                      }}
                      style={{ width: 96, textAlign: 'right', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: row.presupuestoEsSugerido ? 'var(--bg)' : 'transparent', color: 'var(--text-2)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                    />
                  </td>
                  <td style={TD}><Num>{fmtMoney(row.gastoReal)}</Num></td>
                  <td style={{ ...TD, borderRight: '2px solid var(--border)' }}><DesvioPill puntos={row.desvioPuntos} /></td>
                  {celdas.map((c, i) => (
                    <td key={i} style={TD}>
                      {c.future ? (
                        <span style={{ color: 'var(--text-3)' }}>—</span>
                      ) : (
                        <>
                          <Num>{fmtMoney(c.gasto)}</Num>
                          {c.desvioPct != null && (
                            <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: c.desvioPct <= 0 ? '#16a34a' : '#dc2626' }}>
                              {c.desvioPct >= 0 ? '+' : ''}{Math.round(c.desvioPct * 100)}%
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
            <tr>
              <td style={{ ...TD, textAlign: 'left', fontWeight: 700, borderTop: '2px solid var(--text-3)', borderRight: '2px solid var(--border)' }}>Total mercadería</td>
              <td style={{ ...TD, fontWeight: 700, borderTop: '2px solid var(--text-3)' }}><Num>{fmtMoney(totalPresupuesto)}</Num></td>
              <td style={{ ...TD, fontWeight: 700, borderTop: '2px solid var(--text-3)' }}><Num>{fmtMoney(totalReal)}</Num></td>
              <td style={{ ...TD, borderTop: '2px solid var(--text-3)', borderRight: '2px solid var(--border)' }}><DesvioPill puntos={totalDesvio} /></td>
              {totalesSemana.map((t, i) => (
                <td key={i} style={{ ...TD, fontWeight: 700, borderTop: '2px solid var(--text-3)' }}>
                  {presuTotalesSemana[i] === 0 && t === 0 ? (
                    <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>—</span>
                  ) : (
                    <Num>{fmtMoney(t)}</Num>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: 'var(--text-2)' }}>
        <span>Comida: <strong style={{ color: 'var(--text-1)' }}><Num>{fmtMoney(subtotalComida)}</Num></strong></span>
        <span>Bebidas: <strong style={{ color: 'var(--text-1)' }}><Num>{fmtMoney(subtotalBebidas)}</Num></strong></span>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '10px 0 0', lineHeight: 1.5 }}>
        El presupuesto por sector se siembra con el mix real de los últimos 3 meses y queda editable. La semana compara gasto contra presupuesto semanal, no contra ventas — las compras entran a saltos y las ventas salen parejas.
      </p>
    </div>
  )
}

// ── Bloque D · Fuera del CMV ──
function BloqueD({ merma, arreglos, ventasReales }: {
  merma: { costo: number; n: number; nSinCosto: number }
  arreglos: { total: number; porCategoria: { nombre: string; monto: number }[] }
  ventasReales: number
}) {
  return (
    <div data-coach-target="presupuesto-fuera-cmv" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 16, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', fontWeight: 600, marginBottom: 10 }}>Desperdicio</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}><Num>{fmtMoney(merma.costo)}</Num></div>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{merma.n} registro{merma.n === 1 ? '' : 's'}</div>
        </div>
        {merma.nSinCosto > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, padding: '8px 10px', borderRadius: 10, background: '#fbf0dc', fontSize: 12 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#c07806' }}>warning</span>
            <span>{merma.nSinCosto} de {merma.n} registro{merma.n === 1 ? '' : 's'} sin costo — Merma no encontró precio del producto.</span>
          </div>
        )}
      </div>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 16, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', fontWeight: 600, marginBottom: 10 }}>Arreglos y mejoras</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}><Num>{arreglos.total > 0 ? fmtMoney(arreglos.total) : '—'}</Num></div>
          {ventasReales > 0 && arreglos.total > 0 && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{fmtPct(arreglos.total / ventasReales * 100)} de la venta</div>}
        </div>
        {arreglos.porCategoria.length > 0 ? (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {arreglos.porCategoria.map(c => (
              <div key={c.nombre} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-2)' }}>
                <span>{c.nombre}</span><Num>{fmtMoney(c.monto)}</Num>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '10px 0 0' }}>
            Marcá categorías con «Es mejora» en Categorías de Gasto para verlas acá.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Tab Familias (movido de Reportes) ──
function TabFamilias({ data, aplicandoEstandar, onAplicarEstandar, onGuardarFamilia }: {
  data: PresupuestoFamiliasData
  aplicandoEstandar: boolean
  onAplicarEstandar: () => Promise<void>
  onGuardarFamilia: (familia: PresupuestoFamiliasData['rows'][number]['familia'], val: number) => Promise<void>
}) {
  const { rows, ventas, ventasPeriodoAnterior, ebitdaPct } = data
  const sinEstructura = rows.every(r => r.presupuesto === 0)
  const ebitdaObjetivo = 15
  const ebitdaColor = ebitdaPct >= ebitdaObjetivo ? '#16a34a' : ebitdaPct >= ebitdaObjetivo - 5 ? '#ca8a04' : '#dc2626'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
        Presupuesto mensual por familia de gasto, contra las facturas categorizadas del mes. Objetivo estándar: 30 % materia prima, 33 % personal, 5 % alquiler, 17 % gastos generales — 15 % de EBITDA.
      </p>

      {sinEstructura && (ventasPeriodoAnterior > 0 || ventas > 0) && (
        <button onClick={onAplicarEstandar} disabled={aplicandoEstandar}
          style={{ alignSelf: 'flex-start', padding: '9px 14px', borderRadius: 10, border: 'none', background: '#dc580c', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: aplicandoEstandar ? .6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span>
          {aplicandoEstandar ? 'Aplicando…' : 'Usar estructura estándar'}
        </button>
      )}

      {rows.map(row => {
        const over = row.presupuesto > 0 && row.real > row.presupuesto
        const pctBarra = row.presupuesto > 0 ? Math.min((row.real / row.presupuesto) * 100, 100) : Math.min(row.realPct, 100)
        const barCol = colorDesvio(row.desvioPuntos)
        return (
          <div key={row.familia} style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{FAMILIA_GASTO_LABELS[row.familia]}</span>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Objetivo {row.objetivoPct}%</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>$</span>
                <input
                  type="number"
                  inputMode="numeric"
                  defaultValue={row.presupuesto || ''}
                  placeholder="0"
                  onBlur={async (e) => {
                    const val = parseFloat(e.target.value) || 0
                    if (val !== row.presupuesto) await onGuardarFamilia(row.familia, val)
                  }}
                  style={{
                    width: 110, textAlign: 'right', padding: '6px 10px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)',
                    fontSize: 14, fontWeight: 600, outline: 'none',
                  }}
                />
              </div>
            </div>
            <div style={{ background: 'var(--border)', borderRadius: 6, height: 20, overflow: 'hidden' }}>
              <div style={{ width: `${pctBarra}%`, height: '100%', background: barCol, borderRadius: 6, transition: 'width 0.4s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, flexWrap: 'wrap', gap: 4 }}>
              <span style={{ color: 'var(--text-2)' }}>
                Real: <strong style={{ color: 'var(--text-1)' }}>{fmtPct(row.realPct)}</strong> · {fmtMoney(row.real)}
              </span>
              <span style={{ color: row.desvioPuntos <= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                {fmtPuntos(row.desvioPuntos)} vs. objetivo · {fmtMoney(Math.abs(row.desvioPlata))}
              </span>
            </div>
            {row.presupuesto > 0 && (
              <div style={{ fontSize: 11, color: over ? '#dc2626' : 'var(--text-3)', marginTop: 4 }}>
                {over ? `Excedido ${fmtMoney(row.real - row.presupuesto)} sobre el presupuesto cargado` : `Presupuesto: ${fmtMoney(row.presupuesto)}`}
              </div>
            )}
          </div>
        )
      })}

      <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, border: `1px solid ${ebitdaColor}55` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>EBITDA del mes</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: ebitdaColor }}>{fmtPct(ebitdaPct)}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
          Objetivo {ebitdaObjetivo}% · Ventas del mes: {fmtMoney(ventas)}
          {ventas === 0 && ' · Sin ventas cargadas todavía este mes'}
        </div>
      </div>
    </div>
  )
}
