'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { useVentas, type NuevaVenta } from '@/lib/hooks/useVentas'
import { useCarta } from '@/lib/hooks/useCarta'
import type { Venta, VentaItem, OrigenVenta } from '@/types'

const normName = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')

// ── Helpers ─────────────────────────────────────────────────

type Periodo = 'semana' | 'mes' | 'todo'

function fmtDate(d: Date) {
  return d.toISOString().split('T')[0]
}

function getRango(periodo: Periodo): { desde?: string; hasta?: string } {
  const hoy = new Date()
  switch (periodo) {
    case 'semana': {
      const inicio = new Date(hoy)
      inicio.setDate(hoy.getDate() - 6)
      return { desde: fmtDate(inicio), hasta: fmtDate(hoy) }
    }
    case 'mes': {
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
      return { desde: fmtDate(inicio), hasta: fmtDate(hoy) }
    }
    case 'todo':
      return {}
  }
}

function fmtPrecio(n: number | null | undefined): string {
  if (n == null) return '—'
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

function fmtFecha(fecha: string): string {
  const hoy = fmtDate(new Date())
  const ayer = new Date()
  ayer.setDate(ayer.getDate() - 1)
  if (fecha === hoy) return 'Hoy'
  if (fecha === fmtDate(ayer)) return 'Ayer'
  const d = new Date(fecha + 'T12:00:00')
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
}

const ORIGEN_CONFIG: Record<OrigenVenta, { label: string; icon: string; color: string }> = {
  excel: { label: 'Excel', icon: 'table_view', color: '#16a34a' },
  sheets: { label: 'Sheets', icon: 'table_chart', color: '#0ea5e9' },
  manual: { label: 'Manual', icon: 'edit_note', color: '#8b5cf6' },
  pos: { label: 'POS', icon: 'point_of_sale', color: '#f97316' },
}

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'todo', label: 'Todo' },
]

// ── Detected item state (before saving) ─────────────────────

interface ItemDetectado {
  nombre_plato: string
  cantidad: number
  precio_unitario: number
}

interface ParsedVenta {
  fecha: string
  total: number
  cantidad_cubiertos?: number | null
  notas?: string | null
  items: ItemDetectado[]
}

// ── Ejemplos de formatos por origen ─────────────────────────

const EJEMPLOS_ORIGEN = [
  {
    id: 'pos',
    label: 'Cierre de POS / caja',
    icon: 'point_of_sale',
    color: '#f97316',
    preview: 'Resumen cierre 06/05 — 52 cubiertos — Total: $328.500',
    texto: `Resumen cierre 06/05/2026
Turno noche — 52 cubiertos
Bife de chorizo  x18  $5.200
Milanesa napolitana  x15  $4.800
Ensalada mixta  x22  $1.400
Gaseosas  x45  $900
Total: $328.500`,
  },
  {
    id: 'sheets',
    label: 'Google Sheets / Excel (texto copiado)',
    icon: 'table_chart',
    color: '#0ea5e9',
    preview: 'Fecha · Plato · Cantidad · Precio Unitario',
    texto: `Fecha\tPlato\tCantidad\tPrecio Unitario
2026-05-06\tBife de chorizo\t18\t5200
2026-05-06\tMilanesa napolitana\t15\t4800
2026-05-06\tEnsalada mixta\t22\t1400
2026-05-06\tGaseosas\t45\t900`,
  },
  {
    id: 'manual',
    label: 'Nota rápida / WhatsApp',
    icon: 'edit_note',
    color: '#8b5cf6',
    preview: 'Lunes 06/05 — Bife x12 $5200 — Pastas x20 $3100…',
    texto: `Lunes 06/05 — 38 cubiertos
Bife x12 — $5.200 c/u
Pastas x20 — $3.100 c/u
Postres x18 — $1.600 c/u
Total del día $144.700`,
  },
]

// ── Component ───────────────────────────────────────────────

export default function VentasPage() {
  const { ventas, loading, error, agregarVenta, eliminarVenta, fetchVentas } = useVentas()
  const { items: cartaItems } = useCarta()
  const [tab, setTab] = useState<'resumen' | 'platos' | 'importar'>('resumen')
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [ventaDetalle, setVentaDetalle] = useState<Venta | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  // Importar tab state
  const [modoImport, setModoImport] = useState<'excel' | 'texto' | null>(null)
  const [textoRaw, setTextoRaw] = useState('')
  const [parsedVenta, setParsedVenta] = useState<ParsedVenta | null>(null)
  const [importing, setImporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Cierre rápido (Feature 3)
  const [showQuick, setShowQuick] = useState(false)
  const [quickFecha, setQuickFecha] = useState(fmtDate(new Date()))
  const [quickTotal, setQuickTotal] = useState('')
  const [quickCubiertos, setQuickCubiertos] = useState('')
  const [quickSaving, setQuickSaving] = useState(false)

  // ── Periodo change ──────────────────────────────────────
  const handlePeriodo = useCallback((p: Periodo) => {
    setPeriodo(p)
    const { desde, hasta } = getRango(p)
    fetchVentas(desde, hasta)
  }, [fetchVentas])

  // ── Stats ───────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalVentas = ventas.reduce((s, v) => s + (v.total_ventas ?? 0), 0)
    const totalCubiertos = ventas.reduce((s, v) => s + (v.cantidad_cubiertos ?? 0), 0)
    const promedioDiario = ventas.length > 0 ? totalVentas / ventas.length : 0

    // Top plato por cantidad
    const platoCounts: Record<string, number> = {}
    ventas.forEach(v => {
      v.items?.forEach(it => {
        platoCounts[it.nombre_plato] = (platoCounts[it.nombre_plato] ?? 0) + it.cantidad
      })
    })
    const topPlato = Object.entries(platoCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    return { totalVentas, totalCubiertos, promedioDiario, topPlato }
  }, [ventas])

  // ── Feature 1: Ranking / mix de platos vendidos ──
  const platosRank = useMemo(() => {
    const map = new Map<string, { nombre: string; cantidad: number; revenue: number }>()
    for (const v of ventas) for (const it of (v.items ?? [])) {
      const key = normName(it.nombre_plato)
      const g = map.get(key) ?? { nombre: it.nombre_plato, cantidad: 0, revenue: 0 }
      g.cantidad += it.cantidad
      g.revenue += (it.subtotal ?? it.cantidad * it.precio_unitario)
      map.set(key, g)
    }
    const arr = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
    const totalRev = arr.reduce((s, x) => s + x.revenue, 0)
    return { arr, totalRev }
  }, [ventas])

  // ── Feature 2: Food cost teórico del período ──
  const fcTeorico = useMemo(() => {
    const costMap = new Map<string, number>()
    for (const ci of cartaItems) if (ci.costo_porcion != null) costMap.set(normName(ci.nombre), ci.costo_porcion)
    let costo = 0, ventasMatch = 0, totalItems = 0, matchedItems = 0
    for (const v of ventas) for (const it of (v.items ?? [])) {
      totalItems++
      const c = costMap.get(normName(it.nombre_plato))
      if (c != null) {
        matchedItems++
        costo += c * it.cantidad
        ventasMatch += (it.subtotal ?? it.cantidad * it.precio_unitario)
      }
    }
    const fcPct = ventasMatch > 0 ? (costo / ventasMatch) * 100 : null
    const cobertura = totalItems > 0 ? Math.round((matchedItems / totalItems) * 100) : 0
    return { costo, fcPct, cobertura, hayItems: totalItems > 0, hayCosto: costMap.size > 0 }
  }, [ventas, cartaItems])

  // ── Feature 3: días del mes sin ventas cargadas ──
  const diasFaltantes = useMemo(() => {
    if (periodo !== 'mes') return [] as string[]
    const hoy = new Date()
    const loaded = new Set(ventas.map(v => v.fecha))
    const out: string[] = []
    for (let d = 1; d <= hoy.getDate(); d++) {
      const ds = fmtDate(new Date(hoy.getFullYear(), hoy.getMonth(), d))
      if (!loaded.has(ds)) out.push(ds)
    }
    return out
  }, [periodo, ventas])

  async function handleQuickSave() {
    const total = Number(quickTotal)
    if (!(total > 0)) return
    setQuickSaving(true)
    try {
      await agregarVenta({
        fecha: quickFecha,
        origen: 'manual',
        total_ventas: total,
        cantidad_cubiertos: quickCubiertos ? Number(quickCubiertos) : null,
        notas: 'Cierre rápido',
      })
      showToast('Cierre guardado')
      setQuickTotal(''); setQuickCubiertos(''); setShowQuick(false)
      const { desde, hasta } = getRango(periodo)
      fetchVentas(desde, hasta)
    } catch (e: unknown) {
      showToast('Error al guardar: ' + (e instanceof Error ? e.message : 'desconocido'))
    } finally {
      setQuickSaving(false)
    }
  }

  useEffect(() => {
    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'ventas',
      tab,
      periodo,
      totalVentas: Math.round(stats.totalVentas),
      totalCubiertos: stats.totalCubiertos,
      promedioDiario: Math.round(stats.promedioDiario),
      topPlato: stats.topPlato,
      dias: ventas.length,
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [tab, periodo, stats, ventas.length])

  // ── Delete ──────────────────────────────────────────────
  async function handleEliminar(id: string) {
    setDeletingId(id)
    try {
      await eliminarVenta(id)
      showToast('Venta eliminada')
      if (ventaDetalle?.id === id) setVentaDetalle(null)
    } catch (e: unknown) {
      showToast('Error: ' + (e instanceof Error ? e.message : 'desconocido'))
    } finally {
      setDeletingId(null)
    }
  }

  // ── Excel import ────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

        const items: ItemDetectado[] = []
        let total = 0
        let fecha = fmtDate(new Date())

        // Try to detect header row with: plato/plato, cantidad/cant, precio
        let dataStartRow = 0
        const headerKeywords = ['plato', 'nombre', 'item', 'producto', 'descripcion', 'descripción']
        for (let i = 0; i < Math.min(5, rows.length); i++) {
          const row = rows[i].map(c => String(c).toLowerCase())
          if (headerKeywords.some(k => row.some(cell => cell.includes(k)))) {
            dataStartRow = i + 1
            break
          }
        }

        // Find column indices from header
        const headerRow = rows[dataStartRow - 1]?.map(c => String(c).toLowerCase()) ?? []
        const colNombre = headerRow.findIndex(c => c.includes('plato') || c.includes('nombre') || c.includes('item') || c.includes('producto') || c.includes('descripci'))
        const colCantidad = headerRow.findIndex(c => c.includes('cant') || c.includes('qty') || c.includes('unid'))
        const colPrecio = headerRow.findIndex(c => c.includes('precio') || c.includes('unit') || c.includes('valor'))
        const colFecha = headerRow.findIndex(c => c.includes('fecha') || c.includes('date'))
        const colTotal = headerRow.findIndex(c => c.includes('total') || c.includes('importe') || c.includes('subtotal'))

        for (let i = dataStartRow; i < rows.length; i++) {
          const row = rows[i]
          if (!row || row.every(c => c === '' || c === null || c === undefined)) continue

          // Try to extract fecha from the row if column found
          if (colFecha >= 0 && row[colFecha]) {
            const rawFecha = row[colFecha]
            if (typeof rawFecha === 'number') {
              // Excel serial date
              const excelDate = XLSX.SSF.parse_date_code(rawFecha)
              if (excelDate) {
                const d = new Date(excelDate.y, excelDate.m - 1, excelDate.d)
                fecha = fmtDate(d)
              }
            } else {
              const parsed = new Date(String(rawFecha))
              if (!isNaN(parsed.getTime())) {
                fecha = fmtDate(parsed)
              }
            }
          }

          const nombre = colNombre >= 0 ? String(row[colNombre] ?? '').trim() : String(row[0] ?? '').trim()
          const cantRaw = colCantidad >= 0 ? row[colCantidad] : row[1]
          const precioRaw = colPrecio >= 0 ? row[colPrecio] : row[2]
          const totalRaw = colTotal >= 0 ? row[colTotal] : null

          if (!nombre) continue

          const cantidad = Number(String(cantRaw).replace(',', '.')) || 1
          const precio = Number(String(precioRaw).replace(',', '.').replace(/[^0-9.]/g, '')) || 0
          const subtotal = totalRaw ? Number(String(totalRaw).replace(',', '.').replace(/[^0-9.]/g, '')) : 0

          if (nombre && (precio > 0 || subtotal > 0)) {
            items.push({
              nombre_plato: nombre,
              cantidad,
              precio_unitario: precio > 0 ? precio : (subtotal / cantidad),
            })
            total += subtotal > 0 ? subtotal : precio * cantidad
          }
        }

        // If no structured columns, treat as list of names
        if (items.length === 0) {
          rows.slice(dataStartRow).forEach(row => {
            const nombre = String(row[0] ?? '').trim()
            if (nombre) {
              items.push({ nombre_plato: nombre, cantidad: 1, precio_unitario: 0 })
            }
          })
        }

        setModoImport('excel')
        setParsedVenta({
          fecha,
          total,
          cantidad_cubiertos: null,
          notas: `Importado desde ${file.name}`,
          items,
        })
      } catch (err) {
        console.error('[VentasPage] Excel parse error:', err)
        showToast('Error al procesar el archivo')
      }
    }
    reader.readAsArrayBuffer(file)
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── IA import ───────────────────────────────────────────
  async function handleImportTexto() {
    if (!textoRaw.trim()) return
    setImporting(true)
    try {
      const res = await fetch('/api/ventas/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: textoRaw }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error de IA')

      setParsedVenta({
        fecha: json.fecha ?? fmtDate(new Date()),
        total: json.total ?? 0,
        cantidad_cubiertos: json.cantidad_cubiertos ?? null,
        notas: json.notas ?? null,
        items: (json.items ?? []) as ItemDetectado[],
      })
    } catch (e: unknown) {
      showToast('Error al importar: ' + (e instanceof Error ? e.message : 'desconocido'))
    } finally {
      setImporting(false)
    }
  }

  // ── Save confirmed venta ─────────────────────────────────
  async function handleGuardar(overrides: Partial<ParsedVenta>) {
    if (!parsedVenta) return
    setSaving(true)
    try {
      const datos: NuevaVenta = {
        fecha: overrides.fecha ?? parsedVenta.fecha,
        origen: modoImport === 'excel' ? 'excel' : modoImport === 'texto' ? 'manual' : 'manual',
        total_ventas: overrides.total ?? parsedVenta.total,
        cantidad_cubiertos: overrides.cantidad_cubiertos ?? parsedVenta.cantidad_cubiertos,
        notas: overrides.notas ?? parsedVenta.notas,
        items: (overrides.items ?? parsedVenta.items).filter(it => it.nombre_plato.trim()),
      }
      await agregarVenta(datos)
      showToast('Ventas guardadas')
      setParsedVenta(null)
      setModoImport(null)
      setTextoRaw('')
      setTab('resumen')
      const { desde, hasta } = getRango(periodo)
      fetchVentas(desde, hasta)
    } catch (e: unknown) {
      showToast('Error al guardar: ' + (e instanceof Error ? e.message : 'desconocido'))
    } finally {
      setSaving(false)
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2800)
  }

  function resetImport() {
    setParsedVenta(null)
    setModoImport(null)
    setTextoRaw('')
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 100 }}>

      {/* Navy Header */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
        <h1 className="text-[22px] font-bold text-white">Ventas</h1>
        <p className="text-[13px] mt-0.5 text-white/60">Importá y analizá tus ventas diarias</p>
      </div>

      {/* Tabs */}
      <div
        className="flex"
        style={{ background: 'var(--navy)', paddingBottom: 12, paddingLeft: 16, paddingRight: 16, gap: 8 }}
      >
        {(['resumen', 'platos', 'importar'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors"
            style={{
              background: tab === t ? 'rgba(255,255,255,0.18)' : 'transparent',
              color: tab === t ? '#fff' : 'rgba(255,255,255,0.55)',
            }}
          >
            {t === 'resumen' ? 'Resumen' : t === 'platos' ? 'Platos' : 'Importar'}
          </button>
        ))}
      </div>

      {/* ── TAB RESUMEN ─────────────────────────────────── */}
      {tab === 'resumen' && (
        <>
          {/* Period pills */}
          <div className="flex gap-2 px-4 pt-4 pb-3">
            {PERIODOS.map(p => (
              <button
                key={p.value}
                onClick={() => handlePeriodo(p.value)}
                className="text-[13px] font-medium px-3.5 py-1.5 rounded-full transition-colors"
                style={{
                  background: periodo === p.value ? 'var(--navy)' : 'var(--surface)',
                  color: periodo === p.value ? '#fff' : 'var(--text-2)',
                  border: `1px solid ${periodo === p.value ? 'var(--navy)' : 'var(--border)'}`,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* KPI cards */}
          <div data-coach-target="ventas-stats" className="flex gap-3 px-4 pb-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            <StatCard icon="payments" label="Total ventas" value={fmtPrecio(stats.totalVentas)} color="var(--accent)" />
            <StatCard icon="groups" label="Cubiertos" value={String(stats.totalCubiertos || '—')} color="#10b981" />
            <StatCard icon="trending_up" label="Prom. diario" value={fmtPrecio(stats.promedioDiario)} color="#f97316" />
            <StatCard icon="star" label="Top plato" value={stats.topPlato ?? '—'} color="#ec4899" />
          </div>

          {/* ── Feature 3: Cierre rápido + alerta de días sin cargar ── */}
          <div className="px-4 pb-2">
            {!showQuick ? (
              <button
                onClick={() => setShowQuick(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold"
                style={{ background: 'var(--navy)', color: '#fff' }}
              >
                <span className="material-symbols-outlined text-[18px]">bolt</span>
                Cargar cierre del día
              </button>
            ) : (
              <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>Cierre rápido</p>
                  <button onClick={() => setShowQuick(false)} className="material-symbols-outlined text-[18px]" style={{ color: 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer' }}>close</button>
                </div>
                <div className="flex gap-2">
                  <input type="date" value={quickFecha} onChange={e => setQuickFecha(e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded-lg text-[13px] focus:outline-none" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
                  <input type="number" inputMode="decimal" value={quickTotal} onChange={e => setQuickTotal(e.target.value)} placeholder="Total $"
                    className="flex-1 px-2 py-1.5 rounded-lg text-[13px] focus:outline-none" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
                  <input type="number" inputMode="numeric" value={quickCubiertos} onChange={e => setQuickCubiertos(e.target.value)} placeholder="Cub."
                    className="w-16 px-2 py-1.5 rounded-lg text-[13px] focus:outline-none" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
                </div>
                <button onClick={handleQuickSave} disabled={quickSaving || !(Number(quickTotal) > 0)}
                  className="py-2 rounded-lg text-[13px] font-semibold" style={{ background: 'var(--accent)', color: '#fff', opacity: (quickSaving || !(Number(quickTotal) > 0)) ? 0.6 : 1 }}>
                  {quickSaving ? 'Guardando…' : 'Guardar cierre'}
                </button>
              </div>
            )}
            {diasFaltantes.length > 0 && (
              <div className="mt-2 flex items-start gap-2 rounded-xl p-2.5" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                <span className="material-symbols-outlined text-[18px]" style={{ color: '#92400e' }}>event_busy</span>
                <p className="text-[12px]" style={{ color: '#92400e', lineHeight: 1.4 }}>
                  <b>{diasFaltantes.length} día{diasFaltantes.length !== 1 ? 's' : ''}</b> de este mes sin ventas cargadas. Con huecos, el CMV y el ticket promedio se distorsionan.
                </p>
              </div>
            )}
          </div>

          {/* ── Feature 2: Food cost teórico del período ── */}
          {fcTeorico.hayItems && fcTeorico.hayCosto && fcTeorico.fcPct != null && (
            <div className="px-4 pb-3">
              <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>Food cost teórico</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>según el costo de receta de lo vendido</p>
                  </div>
                  <div className="text-right">
                    <div className="text-[20px] font-bold" style={{ color: fcTeorico.fcPct >= 35 ? '#ef4444' : fcTeorico.fcPct >= 30 ? '#f59e0b' : '#16a34a' }}>
                      {fcTeorico.fcPct.toFixed(1)}%
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-2)' }}>costo mercadería {fmtPrecio(fcTeorico.costo)}</div>
                  </div>
                </div>
                {fcTeorico.cobertura < 80 && (
                  <p className="text-[10px] mt-2" style={{ color: 'var(--text-3)' }}>
                    Calculado sobre el {fcTeorico.cobertura}% de los platos vendidos (el resto no tiene receta costeada). Vinculá recetas para mayor precisión.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              <span className="material-symbols-outlined animate-spin text-[28px]" style={{ color: 'var(--text-2)' }}>progress_activity</span>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="mx-4 p-4 rounded-xl text-[13px]" style={{ background: '#fee2e2', color: '#dc2626' }}>
              {error}
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && ventas.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <span className="material-symbols-outlined text-[48px] mb-3" style={{ color: 'var(--border)' }}>bar_chart</span>
              <p className="text-[15px] font-medium" style={{ color: 'var(--text-1)' }}>Sin datos de ventas</p>
              <p className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>
                Importá tus ventas desde la pestaña Importar
              </p>
              <button
                onClick={() => setTab('importar')}
                className="mt-4 px-4 py-2 rounded-full text-[13px] font-semibold text-white"
                style={{ background: 'var(--navy)' }}
              >
                Ir a Importar
              </button>
            </div>
          )}

          {/* Ventas list */}
          {!loading && ventas.length > 0 && (
            <div data-coach-target="ventas-lista" className="px-4 flex flex-col gap-3">
              {ventas.map(v => {
                const origenConf = ORIGEN_CONFIG[v.origen] ?? ORIGEN_CONFIG.manual
                const isExpanded = ventaDetalle?.id === v.id
                return (
                  <div
                    key={v.id}
                    className="rounded-xl overflow-hidden"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                  >
                    {/* Main row */}
                    <button
                      className="w-full flex items-center gap-3 p-3 text-left"
                      onClick={() => setVentaDetalle(isExpanded ? null : v)}
                    >
                      {/* Origen icon */}
                      <div
                        className="flex items-center justify-center rounded-lg shrink-0"
                        style={{ width: 40, height: 40, background: origenConf.color + '18' }}
                      >
                        <span className="material-symbols-outlined text-[20px]" style={{ color: origenConf.color }}>
                          {origenConf.icon}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
                            {fmtFecha(v.fecha)}
                          </span>
                          <span
                            className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                            style={{ background: origenConf.color + '18', color: origenConf.color }}
                          >
                            {origenConf.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[13px] font-bold" style={{ color: 'var(--navy)' }}>
                            {fmtPrecio(v.total_ventas)}
                          </span>
                          {(v.cantidad_cubiertos ?? 0) > 0 && (
                            <span className="text-[12px]" style={{ color: 'var(--text-2)' }}>
                              {v.cantidad_cubiertos} cubiertos
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Chevron */}
                      <span className="material-symbols-outlined text-[18px] shrink-0" style={{ color: 'var(--text-2)' }}>
                        {isExpanded ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>

                    {/* Expanded: items */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid var(--border)' }}>
                        {/* Notes */}
                        {v.notas && (
                          <div className="px-3 py-2">
                            <p className="text-[12px]" style={{ color: 'var(--text-2)' }}>{v.notas}</p>
                          </div>
                        )}

                        {/* Items table */}
                        {(v.items?.length ?? 0) > 0 ? (
                          <div>
                            {/* Header */}
                            <div className="flex px-3 py-1.5" style={{ background: 'var(--bg)' }}>
                              <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>Plato</span>
                              <span className="w-10 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>Cant.</span>
                              <span className="w-20 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>Precio</span>
                              <span className="w-20 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>Subtotal</span>
                            </div>
                            {v.items!.map((it, idx) => (
                              <div
                                key={it.id}
                                className="flex items-center px-3 py-2"
                                style={{ borderTop: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'var(--bg)' }}
                              >
                                <span className="flex-1 text-[13px] truncate pr-2" style={{ color: 'var(--text-1)' }}>{it.nombre_plato}</span>
                                <span className="w-10 text-right text-[13px]" style={{ color: 'var(--text-2)' }}>{it.cantidad}</span>
                                <span className="w-20 text-right text-[13px]" style={{ color: 'var(--text-2)' }}>{fmtPrecio(it.precio_unitario)}</span>
                                <span className="w-20 text-right text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
                                  {fmtPrecio((it.subtotal ?? it.cantidad * it.precio_unitario))}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="px-3 py-2 text-[12px]" style={{ color: 'var(--text-2)' }}>Sin detalle por plato</p>
                        )}

                        {/* Delete row */}
                        <div className="flex justify-end px-3 py-2" style={{ borderTop: '1px solid var(--border)' }}>
                          <button
                            onClick={() => handleEliminar(v.id)}
                            disabled={deletingId === v.id}
                            className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg"
                            style={{ color: '#ef4444', background: '#fee2e2' }}
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              {deletingId === v.id ? 'progress_activity' : 'delete'}
                            </span>
                            Eliminar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── TAB PLATOS (ranking / mix) ──────────────────── */}
      {tab === 'platos' && (
        <>
          <div className="flex gap-2 px-4 pt-4 pb-3">
            {PERIODOS.map(p => (
              <button key={p.value} onClick={() => handlePeriodo(p.value)}
                className="text-[13px] font-medium px-3.5 py-1.5 rounded-full transition-colors"
                style={{ background: periodo === p.value ? 'var(--navy)' : 'var(--surface)', color: periodo === p.value ? '#fff' : 'var(--text-2)', border: `1px solid ${periodo === p.value ? 'var(--navy)' : 'var(--border)'}` }}>
                {p.label}
              </button>
            ))}
          </div>

          {platosRank.arr.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <span className="material-symbols-outlined text-[48px] mb-3" style={{ color: 'var(--border)' }}>restaurant</span>
              <p className="text-[15px] font-medium" style={{ color: 'var(--text-1)' }}>Sin platos vendidos</p>
              <p className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>
                Importá ventas con el detalle de platos (no solo el total) para ver el ranking
              </p>
            </div>
          ) : (
            <div className="px-4 flex flex-col gap-2">
              <div className="flex items-center justify-between pb-1">
                <p className="text-[12px] font-semibold" style={{ color: 'var(--text-2)' }}>{platosRank.arr.length} platos · ordenados por facturación</p>
              </div>
              {platosRank.arr.map((p, i) => {
                const pct = platosRank.totalRev > 0 ? (p.revenue / platosRank.totalRev) * 100 : 0
                const esTop = i < 3
                const esCola = i >= platosRank.arr.length - 3 && platosRank.arr.length > 6
                return (
                  <div key={p.nombre} className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center rounded-lg shrink-0 text-[12px] font-bold"
                        style={{ width: 26, height: 26, background: esTop ? '#16a34a18' : esCola ? '#ef444418' : 'var(--bg)', color: esTop ? '#16a34a' : esCola ? '#ef4444' : 'var(--text-2)' }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-1)' }}>{p.nombre}</span>
                          <span className="text-[13px] font-bold shrink-0" style={{ color: 'var(--navy)' }}>{fmtPrecio(p.revenue)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg)' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: esTop ? '#16a34a' : esCola ? '#ef4444' : 'var(--accent)' }} />
                          </div>
                          <span className="text-[11px] shrink-0" style={{ color: 'var(--text-2)' }}>{pct.toFixed(0)}%</span>
                          <span className="text-[11px] shrink-0" style={{ color: 'var(--text-3)' }}>· {p.cantidad} u</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── TAB IMPORTAR ────────────────────────────────── */}
      {tab === 'importar' && (
        <div className="px-4 pt-5">

          {/* Siempre montado para que el onChange llegue aunque cambie modoImport */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Confirm screen — parsed venta review */}
          {parsedVenta ? (
            <ConfirmScreen
              parsed={parsedVenta}
              onSave={handleGuardar}
              onCancel={resetImport}
              saving={saving}
            />
          ) : (
            <>
              {/* Mode selection */}
              {!modoImport && (
                <div className="flex flex-col gap-3">
                  <p className="text-[14px] font-semibold mb-1" style={{ color: 'var(--text-1)' }}>
                    ¿Cómo querés importar las ventas?
                  </p>

                  {/* Excel / CSV */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-4 p-4 rounded-xl text-left transition-colors active:scale-[.98]"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                  >
                    <div
                      className="flex items-center justify-center rounded-xl shrink-0"
                      style={{ width: 52, height: 52, background: '#16a34a18' }}
                    >
                      <span className="material-symbols-outlined text-[28px]" style={{ color: '#16a34a' }}>table_view</span>
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold" style={{ color: 'var(--text-1)' }}>Subir Excel / CSV</p>
                      <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-2)' }}>
                        Cargá un .xlsx, .xls o .csv exportado de tu sistema
                      </p>
                      <p className="text-[11px] mt-1 font-mono" style={{ color: 'var(--text-3)', letterSpacing: 0 }}>
                        Fecha · Plato · Cantidad · Precio
                      </p>
                    </div>
                  </button>

                  {/* Text / IA */}
                  <button
                    onClick={() => setModoImport('texto')}
                    className="flex items-center gap-4 p-4 rounded-xl text-left transition-colors active:scale-[.98]"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                  >
                    <div
                      className="flex items-center justify-center rounded-xl shrink-0"
                      style={{ width: 52, height: 52, background: '#8b5cf618' }}
                    >
                      <span className="material-symbols-outlined text-[28px]" style={{ color: '#8b5cf6' }}>auto_awesome</span>
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold" style={{ color: 'var(--text-1)' }}>Pegar datos (IA)</p>
                      <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-2)' }}>
                        Pegá un resumen del POS, texto de WhatsApp o cualquier formato libre
                      </p>
                    </div>
                  </button>

                </div>
              )}

              {/* Texto mode */}
              {modoImport === 'texto' && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setModoImport(null)}
                      className="flex items-center justify-center rounded-lg"
                      style={{ width: 32, height: 32, background: 'var(--surface)', border: '1px solid var(--border)' }}
                    >
                      <span className="material-symbols-outlined text-[18px]" style={{ color: 'var(--text-2)' }}>arrow_back</span>
                    </button>
                    <p className="text-[15px] font-semibold" style={{ color: 'var(--text-1)' }}>Pegar datos de ventas</p>
                  </div>

                  {/* Ejemplos por origen */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-2)' }}>
                      Ejemplos — tocá uno para ver el formato
                    </p>
                    <div className="flex flex-col gap-2">
                      {EJEMPLOS_ORIGEN.map(ej => (
                        <button
                          key={ej.id}
                          onClick={() => setTextoRaw(ej.texto)}
                          className="flex items-start gap-3 p-3 rounded-xl text-left transition-colors active:scale-[.98]"
                          style={{
                            background: textoRaw === ej.texto ? ej.color + '18' : 'var(--surface)',
                            border: `1px solid ${textoRaw === ej.texto ? ej.color : 'var(--border)'}`,
                          }}
                        >
                          <span className="material-symbols-outlined text-[18px] mt-0.5 shrink-0" style={{ color: ej.color }}>{ej.icon}</span>
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>{ej.label}</p>
                            <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-2)' }}>{ej.preview}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    value={textoRaw}
                    onChange={e => setTextoRaw(e.target.value)}
                    placeholder={'Pegá el resumen del POS, una lista de ventas, o cualquier texto con datos.\n\nEjemplo:\nLunes 18/04 — 45 cubiertos\nBife de chorizo x18 — $5.200\nEnsalada x12 — $1.800\nTotal: $124.400'}
                    rows={10}
                    className="w-full rounded-xl p-3 text-[13px] resize-none focus:outline-none"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-1)',
                    }}
                  />

                  <button
                    onClick={handleImportTexto}
                    disabled={!textoRaw.trim() || importing}
                    className="flex items-center justify-center gap-2 py-3.5 rounded-xl text-[14px] font-semibold transition-opacity"
                    style={{
                      background: 'var(--navy)',
                      color: '#fff',
                      opacity: (!textoRaw.trim() || importing) ? 0.6 : 1,
                    }}
                  >
                    {importing ? (
                      <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                    )}
                    {importing ? 'Procesando con IA…' : 'Interpretar con IA'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-[13px] font-medium shadow-lg whitespace-nowrap"
          style={{ background: 'var(--navy)', color: '#fff' }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}

// ── StatCard ─────────────────────────────────────────────────

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div
      className="shrink-0 rounded-xl p-3 flex flex-col gap-1"
      style={{ minWidth: 130, background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[16px]" style={{ color }}>{icon}</span>
        <span className="text-[11px] font-medium" style={{ color: 'var(--text-2)' }}>{label}</span>
      </div>
      <p className="text-[16px] font-bold truncate" style={{ color: 'var(--text-1)' }}>{value}</p>
    </div>
  )
}

// ── ConfirmScreen ─────────────────────────────────────────────

interface ConfirmScreenProps {
  parsed: ParsedVenta
  onSave: (overrides: Partial<ParsedVenta>) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function ConfirmScreen({ parsed, onSave, onCancel, saving }: ConfirmScreenProps) {
  const [fecha, setFecha] = useState(parsed.fecha)
  const [total, setTotal] = useState(String(parsed.total))
  const [cubiertos, setCubiertos] = useState(String(parsed.cantidad_cubiertos ?? ''))
  const [notas, setNotas] = useState(parsed.notas ?? '')
  const [items, setItems] = useState<ItemDetectado[]>(parsed.items)

  function updateItem(idx: number, field: keyof ItemDetectado, value: string) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      if (field === 'nombre_plato') return { ...it, nombre_plato: value }
      return { ...it, [field]: Number(value) || 0 }
    }))
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function addItem() {
    setItems(prev => [...prev, { nombre_plato: '', cantidad: 1, precio_unitario: 0 }])
  }

  const totalCalc = useMemo(() => {
    const fromItems = items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0)
    return fromItems > 0 ? fromItems : Number(total) || 0
  }, [items, total])

  function fmtPrecio(n: number) {
    return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Back */}
      <div className="flex items-center gap-2">
        <button
          onClick={onCancel}
          className="flex items-center justify-center rounded-lg"
          style={{ width: 32, height: 32, background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <span className="material-symbols-outlined text-[18px]" style={{ color: 'var(--text-2)' }}>arrow_back</span>
        </button>
        <p className="text-[15px] font-semibold" style={{ color: 'var(--text-1)' }}>Revisar antes de guardar</p>
      </div>

      {/* Fields */}
      <div className="flex flex-col gap-3">
        <Field label="Fecha">
          <input
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-[14px] focus:outline-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
          />
        </Field>

        <Field label="Total ventas ($)">
          <input
            type="number"
            value={total}
            onChange={e => setTotal(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-[14px] focus:outline-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
          />
        </Field>

        <Field label="Cubiertos (opcional)">
          <input
            type="number"
            value={cubiertos}
            onChange={e => setCubiertos(e.target.value)}
            placeholder="ej: 45"
            className="w-full px-3 py-2 rounded-lg text-[14px] focus:outline-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
          />
        </Field>

        <Field label="Notas">
          <input
            type="text"
            value={notas}
            onChange={e => setNotas(e.target.value)}
            placeholder="Observaciones opcionales"
            className="w-full px-3 py-2 rounded-lg text-[14px] focus:outline-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
          />
        </Field>
      </div>

      {/* Items section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
            Platos ({items.length})
          </p>
          <button
            onClick={addItem}
            className="flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-lg"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
            Agregar
          </button>
        </div>

        {items.length === 0 && (
          <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>Sin platos detectados</p>
        )}

        <div className="flex flex-col gap-2">
          {items.map((it, idx) => (
            <div
              key={idx}
              className="rounded-xl p-3 flex flex-col gap-2"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              {/* Nombre */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={it.nombre_plato}
                  onChange={e => updateItem(idx, 'nombre_plato', e.target.value)}
                  placeholder="Nombre del plato"
                  className="flex-1 px-2 py-1.5 rounded-lg text-[13px] focus:outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                />
                <button
                  onClick={() => removeItem(idx)}
                  className="flex items-center justify-center rounded-lg shrink-0"
                  style={{ width: 30, height: 30, background: '#fee2e2' }}
                >
                  <span className="material-symbols-outlined text-[16px]" style={{ color: '#ef4444' }}>close</span>
                </button>
              </div>

              {/* Cantidad y precio */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className="text-[11px] mb-1" style={{ color: 'var(--text-2)' }}>Cantidad</p>
                  <input
                    type="number"
                    value={it.cantidad}
                    onChange={e => updateItem(idx, 'cantidad', e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg text-[13px] focus:outline-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                  />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] mb-1" style={{ color: 'var(--text-2)' }}>Precio unitario</p>
                  <input
                    type="number"
                    value={it.precio_unitario}
                    onChange={e => updateItem(idx, 'precio_unitario', e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg text-[13px] focus:outline-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                  />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] mb-1" style={{ color: 'var(--text-2)' }}>Subtotal</p>
                  <div
                    className="px-2 py-1.5 rounded-lg text-[13px] font-semibold"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--navy)' }}
                  >
                    {fmtPrecio(it.cantidad * it.precio_unitario)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Total summary */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded-xl"
        style={{ background: 'var(--navy)' }}
      >
        <span className="text-[14px] font-semibold text-white">Total calculado</span>
        <span className="text-[18px] font-bold text-white">{fmtPrecio(totalCalc)}</span>
      </div>

      {/* Save button */}
      <button
        onClick={() => onSave({
          fecha,
          total: Number(total) || totalCalc,
          cantidad_cubiertos: cubiertos ? Number(cubiertos) : null,
          notas: notas || null,
          items,
        })}
        disabled={saving}
        className="flex items-center justify-center gap-2 py-3.5 rounded-xl text-[14px] font-semibold transition-opacity"
        style={{ background: 'var(--accent)', color: '#fff', opacity: saving ? 0.6 : 1 }}
      >
        {saving ? (
          <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
        ) : (
          <span className="material-symbols-outlined text-[20px]">save</span>
        )}
        {saving ? 'Guardando…' : 'Confirmar y guardar'}
      </button>
    </div>
  )
}

// ── Field wrapper ─────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[12px] font-semibold mb-1" style={{ color: 'var(--text-2)' }}>{label}</p>
      {children}
    </div>
  )
}
