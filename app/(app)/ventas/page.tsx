'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { useVentas, type NuevaVenta } from '@/lib/hooks/useVentas'
import { useCarta } from '@/lib/hooks/useCarta'
import { useVentasCerradas, type VentaCerrada, type AdicionItem } from '@/lib/hooks/useVentasCerradas'
import { useCajaTurno } from '@/lib/hooks/useCajaTurno'
import { useMediosPago } from '@/lib/hooks/useMediosPago'
import type { Venta, VentaItem, OrigenVenta, CajaTurno, CajaMovimiento } from '@/types'
import { SegmentedTabs, FilterChips, EmptyState, Num } from '@/components/ui'
import type { SegmentedTab, FilterChip } from '@/components/ui'
import { normalizarNombrePlato as normName, buildCartaItemLookup } from '@/lib/reportes/consumoTeorico'

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

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}
function fmtFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
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

const PERIODOS: FilterChip<Periodo>[] = [
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'todo', label: 'Todo' },
]

type VentasMainTab = 'ventas' | 'movimientos' | 'arqueos' | 'resumen' | 'platos' | 'importar'
const VENTAS_TABS: SegmentedTab<VentasMainTab>[] = [
  { id: 'ventas', label: 'Ventas' },
  { id: 'movimientos', label: 'Movimientos de caja' },
  { id: 'arqueos', label: 'Arqueos de Caja' },
  { id: 'resumen', label: 'Resumen' },
  { id: 'platos', label: 'Platos' },
  { id: 'importar', label: 'Importar' },
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

// ── Excel parsing helpers ────────────────────────────────────

function normalizeHdr(s: string): string {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

const HDR_NOMBRE = ['plato', 'nombre', 'item', 'producto', 'descripcion', 'articulo', 'concepto', 'detalle', 'comida', 'bebida']
const HDR_CANTIDAD = ['cant', 'qty', 'unid', 'cantidad', 'vendido', 'porcion']
const HDR_PRECIO = ['precio', 'unit', 'valor', 'tarifa', 'unitario']
const HDR_TOTAL = ['subtotal', 'total venta', 'importe', 'monto']
const HDR_FECHA = ['fecha', 'date', 'dia', 'creacion', 'creado', 'created', 'timestamp']

function hdrMatch(cell: string, keys: string[]): boolean {
  const n = normalizeHdr(cell)
  return keys.some(k => n.includes(k))
}

// Para totales: excluir columnas de costo (food cost) que no son ventas
function hdrMatchTotal(cell: string): boolean {
  const n = normalizeHdr(cell)
  if (n.startsWith('costo') || n.includes(' costo')) return false
  return HDR_TOTAL.some(k => n.includes(k))
}

function looksLikeCodes(values: string[]): boolean {
  const nonEmpty = values.filter(v => v.trim() !== '')
  if (nonEmpty.length < 2) return false
  const codeCount = nonEmpty.filter(v => /^[\d\s\-\.]+$/.test(v.trim()) || v.trim().length < 3).length
  return codeCount / nonEmpty.length > 0.6
}

// Parsea fechas en formato dd/mm/yyyy, dd/mm/yyyy hh:mm:ss, ISO, o serial Excel
function parseFecha(raw: unknown): Date | null {
  if (typeof raw === 'number') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (XLSX.SSF as any).parse_date_code(raw)
      if (d) return new Date(d.y, d.m - 1, d.d)
    } catch { return null }
    return null
  }
  const s = String(raw).trim()
  // dd/mm/yyyy o dd/mm/yyyy hh:mm:ss (formato Fudo y mayoría AR)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  // ISO o formato que JS entiende
  const p = new Date(s)
  return isNaN(p.getTime()) ? null : p
}

// Parsea números en formato AR: "7.024,79" o "7024,79" o "108000"
function parseNumAR(v: unknown): number {
  const s = String(v ?? '').trim()
  if (!s || s === '-') return 0
  // Si tiene coma: coma = decimal, puntos = miles → remover puntos, reemplazar coma
  if (s.includes(',')) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
  }
  // Sin coma: punto podría ser decimal o miles — asumir decimal si tiene pocos dígitos tras él
  return parseFloat(s.replace(/[^0-9.]/g, '')) || 0
}

interface ParseResult {
  ventas?: ParsedVenta[]   // uno por día
  error?: string
  warnings?: string[]
}

function parseSheetData(workbook: XLSX.WorkBook, sheetName: string, fileName: string): ParseResult {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return { error: `Hoja "${sheetName}" no encontrada.` }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]
  if (rows.length < 2) return { error: 'La hoja está vacía o tiene muy pocas filas.' }

  // Detectar fila de encabezado (primeras 8 filas)
  let headerIdx = -1
  let headerNorm: string[] = []
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    const norm = rows[i].map(c => normalizeHdr(String(c)))
    if (HDR_NOMBRE.some(k => norm.some(h => h.includes(k))) ||
        HDR_CANTIDAD.some(k => norm.some(h => h.includes(k)))) {
      headerIdx = i
      headerNorm = norm
      break
    }
  }

  // Índices de columnas
  let colNombre = headerNorm.findIndex(h => hdrMatch(h, HDR_NOMBRE))
  const colCantidad = headerNorm.findIndex(h => hdrMatch(h, HDR_CANTIDAD))
  const colPrecio = headerNorm.findIndex(h => hdrMatch(h, HDR_PRECIO))
  const colTotal = headerNorm.findIndex(h => hdrMatchTotal(h))  // excluye "Costo total"
  const colFecha = headerNorm.findIndex(h => hdrMatch(h, HDR_FECHA))
  const colCancelada = headerNorm.findIndex(h => h.includes('cancelad'))  // "Cancelada" en Fudo

  const dataStart = headerIdx >= 0 ? headerIdx + 1 : 0
  const dataRows = rows.slice(dataStart).filter(r => r.some(c => c !== '' && c !== null && c !== undefined))

  if (dataRows.length === 0) return { error: 'No se encontraron filas de datos en la hoja.' }

  const warnings: string[] = []

  // Si la columna de nombre parece tener códigos, buscar una mejor
  if (colNombre >= 0) {
    const nameVals = dataRows.map(r => String(r[colNombre] ?? ''))
    if (looksLikeCodes(nameVals)) {
      const colCount = Math.max(...rows.map(r => r.length))
      let bestCol = -1
      let bestAvgLen = 0
      for (let ci = 0; ci < colCount; ci++) {
        if ([colNombre, colCantidad, colPrecio, colTotal, colFecha].includes(ci)) continue
        const vals = dataRows.map(r => String(r[ci] ?? ''))
        if (!looksLikeCodes(vals)) {
          const nonEmpty = vals.filter(v => v.trim())
          const avg = nonEmpty.reduce((s, v) => s + v.length, 0) / Math.max(1, nonEmpty.length)
          if (avg > bestAvgLen) { bestAvgLen = avg; bestCol = ci }
        }
      }
      if (bestCol >= 0) {
        const oldH = String(headerIdx >= 0 ? rows[headerIdx][colNombre] ?? `col ${colNombre + 1}` : `col ${colNombre + 1}`)
        const newH = String(headerIdx >= 0 ? rows[headerIdx][bestCol] ?? `col ${bestCol + 1}` : `col ${bestCol + 1}`)
        warnings.push(`"${oldH}" tenía códigos — usamos "${newH}" como nombre del plato.`)
        colNombre = bestCol
      }
    }
  }

  // Primera pasada: recolectar items raw con fecha por ítem
  interface RawItem { nombre: string; cantidad: number; precio: number; fecha: string }
  const rawItems: RawItem[] = []

  for (const row of dataRows) {
    // Saltar cancelados
    if (colCancelada >= 0) {
      const v = normalizeHdr(String(row[colCancelada] ?? ''))
      if (v === 'si' || v === 'yes' || v === '1' || v === 'true') continue
    }

    // Fecha del ítem (por defecto: hoy)
    let itemFecha = fmtDate(new Date())
    if (colFecha >= 0 && row[colFecha]) {
      const d = parseFecha(row[colFecha])
      if (d) itemFecha = fmtDate(d)
    }

    const nombre = (colNombre >= 0 ? String(row[colNombre] ?? '') : String(row[0] ?? '')).trim()
    if (!nombre || /^[\d\s\-\.]+$/.test(nombre)) continue

    const cantRaw = colCantidad >= 0 ? row[colCantidad] : row[1]
    const precioRaw = colPrecio >= 0 ? row[colPrecio] : row[2]
    const totalRaw = colTotal >= 0 ? row[colTotal] : null

    const cantidad = Math.max(1, parseNumAR(cantRaw) || 1)
    const precio = parseNumAR(precioRaw)
    const sub = parseNumAR(totalRaw)

    const precioEfectivo = precio > 0 ? precio : (sub > 0 ? sub / cantidad : 0)
    rawItems.push({ nombre, cantidad, precio: precioEfectivo, fecha: itemFecha })
  }

  if (rawItems.length === 0) {
    if (headerIdx < 0) {
      return { error: 'No se detectó encabezado. El archivo necesita columnas "Nombre/Plato", "Cantidad" y "Precio".' }
    }
    const detected = headerNorm.filter(h => h.trim()).slice(0, 6).join(', ')
    return { error: `Encabezado detectado pero sin platos. Columnas: ${detected}. Verificá que el archivo tenga datos válidos.` }
  }

  // Agrupar por fecha → por nombre de plato
  const byDate = new Map<string, Map<string, ItemDetectado>>()
  for (const it of rawItems) {
    if (!byDate.has(it.fecha)) byDate.set(it.fecha, new Map())
    const byName = byDate.get(it.fecha)!
    const key = normalizeHdr(it.nombre)
    const ex = byName.get(key)
    if (ex) {
      ex.cantidad += it.cantidad
      if (ex.precio_unitario === 0 && it.precio > 0) ex.precio_unitario = it.precio
    } else {
      byName.set(key, { nombre_plato: it.nombre, cantidad: it.cantidad, precio_unitario: it.precio })
    }
  }

  const diasCount = byDate.size
  if (diasCount > 1) {
    warnings.push(`Datos de ${diasCount} días — se crearán ${diasCount} registros de venta separados.`)
  } else if (rawItems.length > 100) {
    const platosCount = byDate.values().next().value?.size ?? 0
    warnings.push(`${rawItems.length} filas agrupadas en ${platosCount} platos únicos.`)
  }

  // Un ParsedVenta por día, ordenados cronológicamente
  const ventas: ParsedVenta[] = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, byName]) => {
      const items = Array.from(byName.values()).sort((a, b) => b.cantidad - a.cantidad)
      const total = items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0)
      return { fecha, total, cantidad_cubiertos: null, notas: `Importado desde ${fileName}`, items }
    })

  return { ventas, warnings: warnings.length > 0 ? warnings : undefined }
}

// ── Component ───────────────────────────────────────────────

export default function VentasPage() {
  const { ventas, loading, error, agregarVenta, eliminarVenta, fetchVentas } = useVentas()
  const { items: cartaItems } = useCarta()
  const [tab, setTab] = useState<VentasMainTab>('ventas')
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [ventaDetalle, setVentaDetalle] = useState<Venta | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  // Importar tab state
  const [modoImport, setModoImport] = useState<'excel' | 'texto' | null>(null)
  const [textoRaw, setTextoRaw] = useState('')
  const [parsedVentas, setParsedVentas] = useState<ParsedVenta[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [parsedWorkbook, setParsedWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [pendingFileName, setPendingFileName] = useState('')
  const [importWarnings, setImportWarnings] = useState<string[]>([])

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
    const lookup = buildCartaItemLookup(cartaItems)
    const costoPorId = new Map<string, number>()
    for (const ci of cartaItems) if (ci.costo_porcion != null) costoPorId.set(ci.id, ci.costo_porcion)
    let costo = 0, ventasMatch = 0, totalItems = 0, matchedItems = 0
    for (const v of ventas) for (const it of (v.items ?? [])) {
      totalItems++
      const id = lookup.get(normName(it.nombre_plato))
      const c = id ? costoPorId.get(id) : undefined
      if (c != null) {
        matchedItems++
        costo += c * it.cantidad
        ventasMatch += (it.subtotal ?? it.cantidad * it.precio_unitario)
      }
    }
    const fcPct = ventasMatch > 0 ? (costo / ventasMatch) * 100 : null
    const cobertura = totalItems > 0 ? Math.round((matchedItems / totalItems) * 100) : 0
    return { costo, fcPct, cobertura, hayItems: totalItems > 0, hayCosto: costoPorId.size > 0 }
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
    if (fileInputRef.current) fileInputRef.current.value = ''

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })

        if (workbook.SheetNames.length > 1) {
          // Múltiples hojas: mostrar selector
          setParsedWorkbook(workbook)
          setPendingFileName(file.name)
          setModoImport('excel')
        } else {
          // Una sola hoja: parsear directo
          const result = parseSheetData(workbook, workbook.SheetNames[0], file.name)
          if (result.error) { showToast(result.error); return }
          setImportWarnings(result.warnings ?? [])
          setModoImport('excel')
          setParsedVentas(result.ventas!)
        }
      } catch (err) {
        console.error('[VentasPage] Excel parse error:', err)
        showToast('Error al procesar el archivo. Verificá que sea un .xlsx, .xls o .csv válido.')
      }
    }
    reader.readAsArrayBuffer(file)
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

      setParsedVentas([{
        fecha: json.fecha ?? fmtDate(new Date()),
        total: json.total ?? 0,
        cantidad_cubiertos: json.cantidad_cubiertos ?? null,
        notas: json.notas ?? null,
        items: (json.items ?? []) as ItemDetectado[],
      }])
    } catch (e: unknown) {
      showToast('Error al importar: ' + (e instanceof Error ? e.message : 'desconocido'))
    } finally {
      setImporting(false)
    }
  }

  // ── Save single confirmed venta (ConfirmScreen) ─────────────
  async function handleGuardarSingle(overrides: Partial<ParsedVenta>) {
    if (!parsedVentas?.[0]) return
    setSaving(true)
    try {
      const parsed = parsedVentas[0]
      const datos: NuevaVenta = {
        fecha: overrides.fecha ?? parsed.fecha,
        origen: modoImport === 'excel' ? 'excel' : 'manual',
        total_ventas: overrides.total ?? parsed.total,
        cantidad_cubiertos: overrides.cantidad_cubiertos ?? parsed.cantidad_cubiertos,
        notas: overrides.notas ?? parsed.notas,
        items: (overrides.items ?? parsed.items).filter(it => it.nombre_plato.trim()),
      }
      await agregarVenta(datos)
      showToast('Ventas guardadas')
      resetImport()
      setTab('resumen')
      const { desde, hasta } = getRango(periodo)
      fetchVentas(desde, hasta)
    } catch (e: unknown) {
      showToast('Error al guardar: ' + (e instanceof Error ? e.message : 'desconocido'))
    } finally {
      setSaving(false)
    }
  }

  // ── Save multiple ventas (multi-día) ─────────────────────────
  async function handleGuardarMulti() {
    if (!parsedVentas?.length) return
    setSaving(true)
    try {
      for (const parsed of parsedVentas) {
        await agregarVenta({
          fecha: parsed.fecha,
          origen: 'excel',
          total_ventas: parsed.total,
          cantidad_cubiertos: parsed.cantidad_cubiertos,
          notas: parsed.notas,
          items: parsed.items.filter(it => it.nombre_plato.trim()),
        })
      }
      showToast(parsedVentas.length === 1 ? 'Ventas guardadas' : `${parsedVentas.length} días guardados`)
      resetImport()
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
    setParsedVentas(null)
    setModoImport(null)
    setTextoRaw('')
    setParsedWorkbook(null)
    setPendingFileName('')
    setImportWarnings([])
  }

  // Desde el selector de hoja: si el archivo era el equivocado, ir directo a
  // elegir otro sin pasar por la pantalla de "¿Cómo querés importar?" ni
  // perder que ya estábamos en modo Excel.
  function handleElegirOtroArchivo() {
    setParsedWorkbook(null)
    setPendingFileName('')
    setImportWarnings([])
    fileInputRef.current?.click()
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 100 }}>

      {/* Navy Header */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
        <h1 className="text-[22px] font-bold text-white">Ventas</h1>
        <p className="text-[13px] mt-0.5 text-white/60">Importá y analizá tus ventas diarias</p>
      </div>

      {/* Tabs — SegmentedTabs canónico */}
      <div style={{ background: 'var(--navy)', padding: '0 16px 12px' }}>
        <SegmentedTabs tabs={VENTAS_TABS} active={tab} onChange={setTab} />
      </div>

      {/* ── TAB VENTAS (transaccional) ──────────────────── */}
      {tab === 'ventas' && <VentasTransaccionalTab />}

      {/* ── TAB MOVIMIENTOS DE CAJA ──────────────────────── */}
      {tab === 'movimientos' && <MovimientosCajaTab />}

      {/* ── TAB ARQUEOS DE CAJA ──────────────────────────── */}
      {tab === 'arqueos' && <ArqueosCajaTab />}

      {/* ── TAB RESUMEN ─────────────────────────────────── */}
      {tab === 'resumen' && (
        <>
          {/* FilterChips de período */}
          <FilterChips chips={PERIODOS} active={periodo} onChange={handlePeriodo} style={{ padding: '16px 16px 12px' }} />

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
                      <Num>{fcTeorico.fcPct.toFixed(1)}%</Num>
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-2)' }}>costo mercadería <Num>{fmtPrecio(fcTeorico.costo)}</Num></div>
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
            <EmptyState
              icon="bar_chart"
              title="Sin datos de ventas"
              subtitle="Importá tus ventas desde la pestaña Importar"
              cta={{ label: 'Ir a Importar', onClick: () => setTab('importar') }}
            />
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
          <FilterChips chips={PERIODOS} active={periodo} onChange={handlePeriodo} style={{ padding: '16px 16px 12px' }} />

          {platosRank.arr.length === 0 ? (
            <EmptyState
              icon="restaurant"
              title="Sin platos vendidos"
              subtitle="Importá ventas con el detalle de platos (no solo el total) para ver el ranking"
            />
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
                          <span className="text-[13px] font-bold shrink-0" style={{ color: 'var(--navy)' }}><Num>{fmtPrecio(p.revenue)}</Num></span>
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

          {/* Confirm / multi-day screen */}
          {parsedVentas ? (
            parsedVentas.length === 1 ? (
              <ConfirmScreen
                parsed={parsedVentas[0]}
                onSave={handleGuardarSingle}
                onCancel={resetImport}
                saving={saving}
                warnings={importWarnings}
              />
            ) : (
              <MultiDayConfirmScreen
                ventas={parsedVentas}
                onSave={handleGuardarMulti}
                onCancel={resetImport}
                saving={saving}
                warnings={importWarnings}
              />
            )
          ) : parsedWorkbook ? (
            /* Selector de hojas */
            <SheetPicker
              sheetNames={parsedWorkbook.SheetNames}
              fileName={pendingFileName}
              onSelect={(sheetName) => {
                const result = parseSheetData(parsedWorkbook, sheetName, pendingFileName)
                if (result.error) { showToast(result.error); return }
                setImportWarnings(result.warnings ?? [])
                setParsedVentas(result.ventas!)
                setParsedWorkbook(null)
              }}
              onCancel={handleElegirOtroArchivo}
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

                  {/* Formato esperado */}
                  <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-2)' }}>
                      Columnas que reconoce el Excel
                    </p>
                    <div className="rounded-lg p-2 text-[11px] font-mono" style={{ background: 'var(--bg)', color: 'var(--text-2)' }}>
                      <p>Nombre/Plato | Cantidad | Precio | Total | Fecha</p>
                    </div>
                    <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-3)' }}>
                      Mínimo necesario: nombre del plato + precio. Si el archivo tiene varias hojas, vas a poder elegir cuál usar.
                    </p>
                  </div>

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
      <p className="text-[16px] font-bold truncate" style={{ color: 'var(--text-1)' }}>
        <Num>{value}</Num>
      </p>
    </div>
  )
}

// ── MultiDayConfirmScreen ────────────────────────────────────

function MultiDayConfirmScreen({
  ventas,
  onSave,
  onCancel,
  saving,
  warnings,
}: {
  ventas: ParsedVenta[]
  onSave: () => Promise<void>
  onCancel: () => void
  saving: boolean
  warnings?: string[]
}) {
  const totalGlobal = ventas.reduce((s, v) => s + v.total, 0)
  const totalPlatos = ventas.reduce((s, v) => s + v.items.length, 0)

  function fmtP(n: number) {
    return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onCancel}
          className="flex items-center justify-center rounded-lg"
          style={{ width: 32, height: 32, background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <span className="material-symbols-outlined text-[18px]" style={{ color: 'var(--text-2)' }}>arrow_back</span>
        </button>
        <p className="text-[15px] font-semibold" style={{ color: 'var(--text-1)' }}>
          Importar {ventas.length} días de ventas
        </p>
      </div>

      {/* Warnings */}
      {warnings && warnings.length > 0 && (
        <div className="rounded-xl p-3 flex flex-col gap-1.5" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5" style={{ color: '#92400e' }}>warning</span>
              <p className="text-[12px]" style={{ color: '#92400e' }}>{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div className="rounded-xl p-3" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
        <p className="text-[13px]" style={{ color: '#1e40af' }}>
          Se van a guardar <b>{ventas.length} registros</b> — uno por día — con sus platos vendidos. Podés editarlos después desde el resumen.
        </p>
      </div>

      {/* Lista de días */}
      <div className="flex flex-col gap-2">
        {ventas.map((v, i) => (
          <div
            key={i}
            className="rounded-xl p-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
                  {fmtFecha(v.fecha)}
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-2)' }}>
                  {v.items.length} platos · {v.fecha}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[15px] font-bold" style={{ color: 'var(--navy)' }}>{fmtP(v.total)}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>a la carta</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Total global */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded-xl"
        style={{ background: 'var(--navy)' }}
      >
        <div>
          <p className="text-[13px] font-semibold text-white">{ventas.length} días · {totalPlatos} platos únicos</p>
        </div>
        <span className="text-[18px] font-bold text-white">{fmtP(totalGlobal)}</span>
      </div>

      {/* Botón guardar */}
      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center justify-center gap-2 py-3.5 rounded-xl text-[14px] font-semibold"
        style={{ background: 'var(--accent)', color: '#fff', opacity: saving ? 0.6 : 1 }}
      >
        {saving ? (
          <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
        ) : (
          <span className="material-symbols-outlined text-[20px]">save</span>
        )}
        {saving ? 'Guardando…' : `Guardar ${ventas.length} días`}
      </button>
    </div>
  )
}

// ── SheetPicker ───────────────────────────────────────────────

function SheetPicker({
  sheetNames,
  fileName,
  onSelect,
  onCancel,
}: {
  sheetNames: string[]
  fileName: string
  onSelect: (name: string) => void
  onCancel: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onCancel}
          title="Elegir otro archivo"
          className="flex items-center justify-center rounded-lg"
          style={{ width: 32, height: 32, background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <span className="material-symbols-outlined text-[18px]" style={{ color: 'var(--text-2)' }}>arrow_back</span>
        </button>
        <p className="text-[15px] font-semibold" style={{ color: 'var(--text-1)' }}>Elegir hoja</p>
      </div>

      <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>
          <b>{fileName}</b> tiene {sheetNames.length} hojas. ¿Cuál contiene las ventas?
        </p>
        <button
          onClick={onCancel}
          className="text-[12px] font-semibold mt-1.5"
          style={{ color: 'var(--accent)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          ¿Es el archivo equivocado? Elegir otro
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {sheetNames.map((name, i) => (
          <button
            key={name}
            onClick={() => onSelect(name)}
            className="flex items-center gap-3 p-4 rounded-xl text-left transition-colors active:scale-[.98]"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div
              className="flex items-center justify-center rounded-lg shrink-0"
              style={{ width: 40, height: 40, background: 'var(--accent)18', color: 'var(--accent)' }}
            >
              <span className="material-symbols-outlined text-[20px]">table_chart</span>
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>{name}</p>
              <p className="text-[12px]" style={{ color: 'var(--text-2)' }}>Hoja {i + 1}</p>
            </div>
            <span className="material-symbols-outlined text-[18px]" style={{ color: 'var(--text-2)' }}>chevron_right</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── ConfirmScreen ─────────────────────────────────────────────

interface ConfirmScreenProps {
  parsed: ParsedVenta
  onSave: (overrides: Partial<ParsedVenta>) => Promise<void>
  onCancel: () => void
  saving: boolean
  warnings?: string[]
}

function ConfirmScreen({ parsed, onSave, onCancel, saving, warnings }: ConfirmScreenProps) {
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

      {/* Warnings */}
      {warnings && warnings.length > 0 && (
        <div className="rounded-xl p-3 flex flex-col gap-1.5" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5" style={{ color: '#92400e' }}>warning</span>
              <p className="text-[12px]" style={{ color: '#92400e' }}>{w}</p>
            </div>
          ))}
        </div>
      )}

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

// ════════════════════════════════════════════════════════════════════
// Helpers compartidos por las 3 pestañas nuevas (Ventas / Movimientos / Arqueos)
// ════════════════════════════════════════════════════════════════════
const MESES_CAJA = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function mesAnioRango(mes: number, anio: number): { desde: string; hasta: string } {
  const desde = `${anio}-${String(mes).padStart(2, '0')}-01T00:00:00`
  const hastaDate = new Date(anio, mes, 0)
  const hasta = `${hastaDate.toISOString().slice(0, 10)}T23:59:59`
  return { desde, hasta }
}

const selStyleCaja: React.CSSProperties = { padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none' }

function MesAnioSelector({ mes, setMes, anio, setAnio }: { mes: number; setMes: (n: number) => void; anio: number; setAnio: (n: number) => void }) {
  return (
    <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
      <select value={mes} onChange={e => setMes(Number(e.target.value))} style={selStyleCaja}>
        {MESES_CAJA.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
      </select>
      <select value={anio} onChange={e => setAnio(Number(e.target.value))} style={selStyleCaja}>
        {[anio - 1, anio, anio + 1].map(a => <option key={a} value={a}>{a}</option>)}
      </select>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// VENTAS (transaccional) — log de cuentas cerradas por mesa/mozo. El
// equivalente real a la pestaña "Ventas" de Fudo (no confundir con la tab
// "Resumen", que es el importador de totales diarios). Lee de `cuentas`.
// ════════════════════════════════════════════════════════════════════
const ORIGEN_LABEL_VENTA: Record<string, string> = { salon: 'Mesas', mostrador: 'Mostrador', delivery: 'Delivery', marca: 'Marca' }

function VentasTransaccionalTab() {
  const { fetchPeriodo, fetchAdiciones, actualizarCuenta } = useVentasCerradas()
  const now = new Date()
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [anio, setAnio] = useState(now.getFullYear())
  const [ventas, setVentas] = useState<VentaCerrada[]>([])
  const [loading, setLoading] = useState(true)
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [origenFiltro, setOrigenFiltro] = useState('')
  const [facturadoFiltro, setFacturadoFiltro] = useState('')
  const [medioFiltro, setMedioFiltro] = useState('')
  const [search, setSearch] = useState('')
  const [seleccion, setSeleccion] = useState<VentaCerrada | null>(null)
  const [adiciones, setAdiciones] = useState<AdicionItem[]>([])
  const [adicionesLoading, setAdicionesLoading] = useState(false)
  const [editando, setEditando] = useState(false)
  const [editPersonas, setEditPersonas] = useState('')
  const [editCliente, setEditCliente] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    const { desde, hasta } = mesAnioRango(mes, anio)
    fetchPeriodo(desde, hasta).then(rows => { if (!cancel) { setVentas(rows); setLoading(false) } })
    return () => { cancel = true }
  }, [mes, anio, fetchPeriodo])

  const filtered = useMemo(() => {
    let list = ventas
    if (estadoFiltro) list = list.filter(v => v.estado === estadoFiltro)
    if (origenFiltro) list = list.filter(v => v.origen === origenFiltro)
    if (facturadoFiltro) list = list.filter(v => (facturadoFiltro === 'si') === v.facturado)
    if (medioFiltro) list = list.filter(v => v.medios.some(m => m.nombre === medioFiltro))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(v =>
        (v.mozo_nombre ?? '').toLowerCase().includes(q) ||
        (v.cliente_nombre ?? '').toLowerCase().includes(q) ||
        (v.mesa_numero ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [ventas, estadoFiltro, origenFiltro, facturadoFiltro, medioFiltro, search])

  const mediosDisponibles = useMemo(() => Array.from(new Set(ventas.flatMap(v => v.medios.map(m => m.nombre)))), [ventas])

  const kpis = useMemo(() => {
    const n = filtered.length
    const total = filtered.reduce((s, v) => s + v.total, 0)
    const personas = filtered.reduce((s, v) => s + (v.cantidad_personas ?? 0), 0)
    return { n, promedioVenta: n > 0 ? total / n : 0, personas, promedioPersona: personas > 0 ? total / personas : 0, total }
  }, [filtered])

  function abrirDetalle(v: VentaCerrada) {
    setSeleccion(v); setEditando(false)
    setAdicionesLoading(true)
    fetchAdiciones(v.id).then(a => setAdiciones(a)).finally(() => setAdicionesLoading(false))
  }

  function startEdit() {
    if (!seleccion) return
    setEditPersonas(seleccion.cantidad_personas != null ? String(seleccion.cantidad_personas) : '')
    setEditCliente(seleccion.cliente_nombre ?? '')
    setEditando(true)
  }

  async function guardarEdit() {
    if (!seleccion) return
    setSavingEdit(true)
    try {
      const personas = editPersonas.trim() ? parseInt(editPersonas, 10) : null
      const cliente = editCliente.trim() || null
      await actualizarCuenta(seleccion.id, { cantidad_personas: personas, cliente_nombre: cliente })
      const actualizada = { ...seleccion, cantidad_personas: personas, cliente_nombre: cliente }
      setSeleccion(actualizada)
      setVentas(prev => prev.map(v => v.id === actualizada.id ? actualizada : v))
      setEditando(false)
    } finally { setSavingEdit(false) }
  }

  async function toggleFacturado() {
    if (!seleccion) return
    const nuevo = !seleccion.facturado
    await actualizarCuenta(seleccion.id, { facturado: nuevo })
    const actualizada = { ...seleccion, facturado: nuevo }
    setSeleccion(actualizada)
    setVentas(prev => prev.map(v => v.id === actualizada.id ? actualizada : v))
  }

  if (seleccion) {
    const rows: [string, string][] = [
      ['Hora inicio', fmtFechaHora(seleccion.abierta_at)],
      ['Hora de cierre', seleccion.cerrada_at ? fmtFechaHora(seleccion.cerrada_at) : '—'],
      ['Tipo', ORIGEN_LABEL_VENTA[seleccion.origen ?? ''] ?? '—'],
      ['Estado', seleccion.estado === 'cerrada' ? 'Cerrada' : 'Abierta'],
      ['Caja', seleccion.caja_estado ? (seleccion.caja_estado === 'abierta' ? 'Turno abierto' : 'Turno cerrado') : 'Sin turno vinculado'],
      ['Mesa', seleccion.mesa_numero ?? '—'],
      ['Mozo', seleccion.mozo_nombre ?? '—'],
    ]
    return (
      <div className="px-4 pb-8">
        <button onClick={() => setSeleccion(null)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 13, fontWeight: 600, padding: '12px 0', fontFamily: 'inherit' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>Volver
        </button>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
          <div className="flex items-center justify-between mb-3">
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>{fmtPrecio(seleccion.total)}</span>
            <button onClick={toggleFacturado} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, background: seleccion.facturado ? 'rgba(67,97,160,.12)' : 'rgba(100,116,139,.12)', color: seleccion.facturado ? '#4361a0' : '#64748b' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>receipt</span>
              {seleccion.facturado ? 'Facturado' : 'No facturado'}
            </button>
          </div>
          {rows.map(([label, val]) => (
            <div key={label} className="flex justify-between py-1" style={{ fontSize: 13, borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-3)' }}>{label}</span>
              <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{val}</span>
            </div>
          ))}

          {/* Personas / Cliente — editable */}
          {editando ? (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div className="flex gap-2 mb-2">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3 }}>PERSONAS</div>
                  <input type="number" value={editPersonas} onChange={e => setEditPersonas(e.target.value)} placeholder="—"
                    style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 2 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3 }}>CLIENTE</div>
                  <input value={editCliente} onChange={e => setEditCliente(e.target.value)} placeholder="Nombre del cliente"
                    style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditando(false)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                <button onClick={guardarEdit} disabled={savingEdit} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: savingEdit ? .6 : 1 }}>{savingEdit ? '…' : 'Guardar'}</button>
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-center py-1" style={{ fontSize: 13, borderTop: '1px solid var(--border)', marginTop: 4 }}>
              <span style={{ color: 'var(--text-3)' }}>Personas · Cliente</span>
              <button onClick={startEdit} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                {seleccion.cantidad_personas ?? '—'} pers. · {seleccion.cliente_nombre ?? 'sin cliente'}
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>edit</span>
              </button>
            </div>
          )}

          {/* Medios de pago */}
          {seleccion.medios.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 6 }}>MEDIOS DE PAGO</div>
              {seleccion.medios.map((m, i) => (
                <div key={i} className="flex justify-between" style={{ fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: 'var(--text-2)' }}>{m.nombre}</span>
                  <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{fmtPrecio(m.monto)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Adiciones */}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Adiciones</div>
        {adicionesLoading ? (
          <div className="py-6 text-center text-[13px]" style={{ color: 'var(--text-3)' }}>Cargando…</div>
        ) : adiciones.length === 0 ? (
          <div className="py-6 text-center text-[13px]" style={{ color: 'var(--text-3)' }}>Sin ítems registrados</div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {adiciones.map((a, i) => (
              <div key={i} className="flex justify-between items-center" style={{ padding: '10px 12px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}>{a.nombre}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.cantidad} × {fmtPrecio(a.precio_unitario)}</div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{fmtPrecio(a.subtotal)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="px-4 pb-4">
      <div className="pt-4 pb-3"><MesAnioSelector mes={mes} setMes={setMes} anio={anio} setAnio={setAnio} /></div>

      <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
        <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)} style={selStyleCaja}>
          <option value="">Estado: todos</option>
          <option value="abierta">Abierta</option>
          <option value="cerrada">Cerrada</option>
        </select>
        <select value={origenFiltro} onChange={e => setOrigenFiltro(e.target.value)} style={selStyleCaja}>
          <option value="">Tipo: todos</option>
          {Object.entries(ORIGEN_LABEL_VENTA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={facturadoFiltro} onChange={e => setFacturadoFiltro(e.target.value)} style={selStyleCaja}>
          <option value="">Facturación: todas</option>
          <option value="si">Facturado</option>
          <option value="no">No facturado</option>
        </select>
        {mediosDisponibles.length > 0 && (
          <select value={medioFiltro} onChange={e => setMedioFiltro(e.target.value)} style={selStyleCaja}>
            <option value="">Medio: todos</option>
            {mediosDisponibles.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar mozo, cliente o mesa…"
          style={{ ...selStyleCaja, flex: 1, minWidth: 160 }} />
      </div>

      <div className="flex gap-3 pb-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <StatCard icon="receipt_long" label="Ventas" value={String(kpis.n)} color="var(--accent)" />
        <StatCard icon="calculate" label="Prom. por venta" value={fmtPrecio(kpis.promedioVenta)} color="#0ea5e9" />
        <StatCard icon="groups" label="Personas" value={String(kpis.personas || '—')} color="#10b981" />
        <StatCard icon="person" label="Prom. por persona" value={fmtPrecio(kpis.promedioPersona)} color="#f97316" />
        <StatCard icon="payments" label="Total" value={fmtPrecio(kpis.total)} color="var(--navy)" />
      </div>

      {loading ? (
        <div className="py-10 text-center text-[13px]" style={{ color: 'var(--text-3)' }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="receipt_long" title="Sin ventas" subtitle="No hay ventas cerradas en este período con estos filtros" />
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {filtered.map((v, i) => (
            <button key={v.id} onClick={() => abrirDetalle(v)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '11px 12px', border: 'none', borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-1.5">
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                    {v.mesa_numero ? `Mesa ${v.mesa_numero}` : (ORIGEN_LABEL_VENTA[v.origen ?? ''] ?? 'Venta')}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: v.estado === 'cerrada' ? 'rgba(16,185,129,.12)' : 'rgba(245,158,11,.12)', color: v.estado === 'cerrada' ? '#059669' : '#d97706' }}>
                    {v.estado === 'cerrada' ? 'Cerrada' : 'Abierta'}
                  </span>
                  {v.facturado && <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#4361a0' }} title="Facturado">receipt</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                  {v.mozo_nombre ?? '—'} · {fmtHora(v.abierta_at)}{v.cerrada_at ? ' – ' + fmtHora(v.cerrada_at) : ''}
                </div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', fontFamily: "'DM Mono', monospace" }}>{fmtPrecio(v.total)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// MOVIMIENTOS DE CAJA — ingresos/egresos manuales, historial filtrable
// (hasta ahora solo se veían en vivo dentro del turno abierto en Salón).
// ════════════════════════════════════════════════════════════════════
type MovimientoConMedio = CajaMovimiento & { medio_nombre: string | null; caja_estado: 'abierta' | 'cerrada' | null }

function MovimientosCajaTab() {
  const { fetchMovimientosPeriodo } = useCajaTurno()
  const now = new Date()
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [anio, setAnio] = useState(now.getFullYear())
  const [movimientos, setMovimientos] = useState<MovimientoConMedio[]>([])
  const [loading, setLoading] = useState(true)
  const [tipoFiltro, setTipoFiltro] = useState('')

  useEffect(() => {
    let cancel = false
    setLoading(true)
    const { desde, hasta } = mesAnioRango(mes, anio)
    fetchMovimientosPeriodo(desde, hasta).then(rows => { if (!cancel) { setMovimientos(rows); setLoading(false) } })
    return () => { cancel = true }
  }, [mes, anio, fetchMovimientosPeriodo])

  const filtered = useMemo(() => tipoFiltro ? movimientos.filter(m => m.tipo === tipoFiltro) : movimientos, [movimientos, tipoFiltro])

  const balance = useMemo(() => filtered.reduce((s, m) => s + (m.tipo === 'ingreso' ? m.monto : -m.monto), 0), [filtered])

  return (
    <div className="px-4 pb-4">
      <div className="pt-4 pb-3"><MesAnioSelector mes={mes} setMes={setMes} anio={anio} setAnio={setAnio} /></div>

      <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
        <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} style={selStyleCaja}>
          <option value="">Tipo: todos</option>
          <option value="ingreso">Ingreso</option>
          <option value="retiro">Retiro</option>
        </select>
      </div>

      <div className="flex gap-3 pb-4">
        <StatCard icon="account_balance" label="Balance" value={fmtPrecio(balance)} color={balance >= 0 ? '#16a34a' : '#dc2626'} />
        <StatCard icon="receipt_long" label="Registros" value={String(filtered.length)} color="var(--accent)" />
      </div>

      {loading ? (
        <div className="py-10 text-center text-[13px]" style={{ color: 'var(--text-3)' }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="account_balance" title="Sin movimientos" subtitle="No hay ingresos ni retiros manuales en este período" />
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {filtered.map((m, i) => (
            <div key={m.id} className="flex items-center gap-3" style={{ padding: '11px 12px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: m.tipo === 'ingreso' ? '#16a34a' : '#dc2626' }}>
                {m.tipo === 'ingreso' ? 'arrow_downward' : 'arrow_upward'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{m.motivo || (m.tipo === 'ingreso' ? 'Ingreso' : 'Retiro')}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  {fmtFechaHora(m.created_at)}{m.medio_nombre ? ' · ' + m.medio_nombre : ''}{m.caja_estado === 'abierta' ? ' · turno abierto' : ''}
                </div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: m.tipo === 'ingreso' ? '#16a34a' : '#dc2626', fontFamily: "'DM Mono', monospace" }}>
                {m.tipo === 'ingreso' ? '+' : '−'}{fmtPrecio(m.monto)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// ARQUEOS DE CAJA — historial de aperturas/cierres de turno, con KPIs.
// KOS soporta UN turno abierto por restaurante a la vez (a diferencia de
// Fudo, que permite varias cajas con nombre simultáneas) — el KPI "Saldo
// actual" refleja eso: lo que hay en el turno abierto ahora mismo, si hay uno.
// ════════════════════════════════════════════════════════════════════
function ArqueosCajaTab() {
  const { fetchTodasCajas, cajaAbierta, calcularEsperado } = useCajaTurno()
  const { medios } = useMediosPago()
  const now = new Date()
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [anio, setAnio] = useState(now.getFullYear())
  const [cajas, setCajas] = useState<CajaTurno[]>([])
  const [loading, setLoading] = useState(true)
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [seleccion, setSeleccion] = useState<CajaTurno | null>(null)
  const [saldoActual, setSaldoActual] = useState<number | null>(null)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    const { desde, hasta } = mesAnioRango(mes, anio)
    fetchTodasCajas(desde, hasta).then(rows => { if (!cancel) { setCajas(rows); setLoading(false) } })
    return () => { cancel = true }
  }, [mes, anio, fetchTodasCajas])

  useEffect(() => {
    let cancel = false
    if (!cajaAbierta) { setSaldoActual(null); return }
    calcularEsperado(cajaAbierta).then(esperado => {
      if (cancel) return
      const totalEsperado = Object.values(esperado).reduce((s, v) => s + v, 0)
      setSaldoActual(cajaAbierta.monto_inicial + totalEsperado)
    })
    return () => { cancel = true }
  }, [cajaAbierta, calcularEsperado])

  const filtered = useMemo(() => estadoFiltro ? cajas.filter(c => c.estado === estadoFiltro) : cajas, [cajas, estadoFiltro])

  const kpis = useMemo(() => {
    let ingresos = 0, egresos = 0, totalVentas = 0
    for (const c of filtered) {
      const decl = c.montos_declarados
      if (decl) totalVentas += Object.values(decl).reduce((s, v) => s + v, 0)
    }
    return { cajas: filtered.length, ingresos, egresos, totalVentas }
  }, [filtered])

  const medioNombre = (id: string) => medios.find(m => m.id === id)?.nombre ?? id

  if (seleccion) {
    const esp = seleccion.montos_esperados ?? {}
    const decl = seleccion.montos_declarados ?? {}
    const medioIds = Array.from(new Set([...Object.keys(esp), ...Object.keys(decl)]))
    return (
      <div className="px-4 pb-8">
        <button onClick={() => setSeleccion(null)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 13, fontWeight: 600, padding: '12px 0', fontFamily: 'inherit' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>Volver
        </button>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
          {[
            ['Apertura', fmtFechaHora(seleccion.fecha_apertura)],
            ['Cierre', seleccion.fecha_cierre ? fmtFechaHora(seleccion.fecha_cierre) : '—'],
            ['Estado', seleccion.estado === 'abierta' ? 'Abierta' : 'Cerrada'],
            ['Abierta por', seleccion.abierta_por ?? '—'],
            ['Cerrada por', seleccion.cerrada_por ?? '—'],
            ['Monto inicial', fmtPrecio(seleccion.monto_inicial)],
            ['Diferencia total', seleccion.diferencia_total != null ? fmtPrecio(seleccion.diferencia_total) : '—'],
            ['Arqueo ciego', seleccion.arqueo_ciego ? 'Sí' : 'No'],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between py-1" style={{ fontSize: 13, borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-3)' }}>{label}</span>
              <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{val}</span>
            </div>
          ))}
          {seleccion.notas && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3 }}>NOTAS</div>
              <div style={{ fontSize: 12, color: 'var(--text-1)' }}>{seleccion.notas}</div>
            </div>
          )}
        </div>
        {medioIds.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Por medio de pago</div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {medioIds.map((id, i) => {
                const e = esp[id] ?? 0, d = decl[id] ?? 0, diff = d - e
                return (
                  <div key={id} style={{ padding: '10px 12px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>{medioNombre(id)}</div>
                    <div className="flex justify-between" style={{ fontSize: 12, color: 'var(--text-2)' }}>
                      <span>Sistema: {fmtPrecio(e)}</span>
                      <span>Usuario: {fmtPrecio(d)}</span>
                      <span style={{ fontWeight: 700, color: diff === 0 ? 'var(--text-3)' : diff > 0 ? '#16a34a' : '#dc2626' }}>{diff === 0 ? '$0' : (diff > 0 ? '+' : '') + fmtPrecio(diff)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="px-4 pb-4">
      <div className="pt-4 pb-3"><MesAnioSelector mes={mes} setMes={setMes} anio={anio} setAnio={setAnio} /></div>

      <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
        <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)} style={selStyleCaja}>
          <option value="">Estado: todos</option>
          <option value="abierta">Abierta</option>
          <option value="cerrada">Cerrada</option>
        </select>
      </div>

      <div className="flex gap-3 pb-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <StatCard icon="point_of_sale" label="Turnos" value={String(kpis.cajas)} color="var(--accent)" />
        <StatCard icon="savings" label="Saldo actual" value={saldoActual != null ? fmtPrecio(saldoActual) : '—'} color="#16a34a" />
        <StatCard icon="payments" label="Declarado (cerrados)" value={fmtPrecio(kpis.totalVentas)} color="var(--navy)" />
      </div>

      {loading ? (
        <div className="py-10 text-center text-[13px]" style={{ color: 'var(--text-3)' }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="point_of_sale" title="Sin arqueos" subtitle="No hay turnos de caja en este período" />
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {filtered.map((c, i) => (
            <button key={c.id} onClick={() => setSeleccion(c)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '11px 12px', border: 'none', borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: c.estado === 'abierta' ? '#d97706' : 'var(--text-3)' }}>point_of_sale</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{fmtFechaHora(c.fecha_apertura)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.estado === 'abierta' ? 'Abierta' : `Cerrada · ${c.fecha_cierre ? fmtFechaHora(c.fecha_cierre) : ''}`}</div>
              </div>
              {c.diferencia_total != null ? (
                <span style={{ fontSize: 13, fontWeight: 800, color: c.diferencia_total === 0 ? 'var(--text-3)' : c.diferencia_total > 0 ? '#16a34a' : '#dc2626', fontFamily: "'DM Mono', monospace" }}>
                  {c.diferencia_total === 0 ? '$0' : (c.diferencia_total > 0 ? '+' : '') + fmtPrecio(c.diferencia_total)}
                </span>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>—</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
