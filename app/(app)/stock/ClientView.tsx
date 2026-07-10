'use client'

import PageTransition from '@/components/PageTransition'
import { SheetChrome } from '@/lib/ui/chrome'
import { SegmentedTabs } from '@/components/ui'
import type { SegmentedTab } from '@/components/ui'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useStock, type ProductoConEstado } from '@/lib/hooks/useStock'
import { useRecetas } from '@/lib/hooks/useRecetas'
import { useCategoriasProducto } from '@/lib/hooks/useCategoriasProducto'
import { usePermisos } from '@/lib/hooks/usePermisos'
import PageHeader from '@/components/shell/PageHeader'
import ActionButton from '@/components/shell/ActionButton'
import MermaBottomSheet from '@/components/merma/MermaBottomSheet'
import { useMerma } from '@/lib/hooks/useMerma'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import ImportadorArchivo, { UndoBanner } from '@/components/importador/ImportadorArchivo'
import CarritoCompras, { type CartItem } from '@/components/stock/CarritoCompras'
import MultiSelectFiltro from '@/components/stock/MultiSelectFiltro'
import { usePedidos } from '@/lib/hooks/usePedidos'
import { useProveedores } from '@/lib/hooks/useProveedores'
import { usePreciosProveedores, type ComparadorPrecioProducto } from '@/lib/hooks/usePreciosProveedores'
import { canonUnit } from '@/lib/hooks/useRecetas'
import { exportarExcel, fechaArchivo } from '@/lib/exportar'
import type { MisePlaceItem, MisePlaceRegistro } from '@/types'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'

const UNIDADES = ['kg', 'g', 'L', 'ml', 'unidad', 'docena', 'caja', 'bolsa', 'lata', 'botella']
const UNIDADES_USO = ['kg', 'g', 'l', 'ml', 'unidad']

const STOCK_TABS: SegmentedTab<'insumos' | 'producciones'>[] = [
  { id: 'insumos', label: 'Insumos' },
  { id: 'producciones', label: 'Producciones' },
]

// ── Paste desde Excel ──
type PasteRow = { nombre: string; precio: number | null; stock: number | null; unidad: string | null }

function parseNumAR(s: string): number | null {
  if (!s?.trim()) return null
  const clean = s.trim().replace(/[$\s]/g, '')
  // Formato AR: $1.500,00 → punto=miles, coma=decimal
  if (clean.includes('.') && clean.includes(',')) {
    const n = parseFloat(clean.replace(/\./g, '').replace(',', '.'))
    return isNaN(n) ? null : n
  }
  if (clean.includes(',') && !clean.includes('.')) {
    const n = parseFloat(clean.replace(',', '.'))
    return isNaN(n) ? null : n
  }
  const n = parseFloat(clean)
  return isNaN(n) ? null : n
}

function parseTSV(text: string): PasteRow[] {
  const lines = text.trim().split('\n').map(l => l.trimEnd()).filter(Boolean)
  if (!lines.length) return []
  const first = lines[0].split('\t')
  const isHeader = first.some(c => /nombre|product|precio|stock|unidad|categ/i.test(c.trim()))
  let [colN, colP, colS, colU] = [0, 1, 2, 3]
  if (isHeader) {
    first.forEach((h, i) => {
      const lh = h.toLowerCase().trim()
      if (/nombre|product|insumo/.test(lh)) colN = i
      else if (/precio|price|costo/.test(lh)) colP = i
      else if (/stock|cantidad|qty/.test(lh)) colS = i
      else if (/unidad|unit/.test(lh)) colU = i
    })
  }
  return lines.slice(isHeader ? 1 : 0).map(line => {
    const c = line.split('\t')
    return {
      nombre: c[colN]?.trim() ?? '',
      precio: parseNumAR(c[colP] ?? ''),
      stock: parseNumAR(c[colS] ?? ''),
      unidad: c[colU]?.trim() || null,
    }
  }).filter(r => r.nombre.length >= 2)
}

type FiltroEstado = 'all' | 'critico' | 'bajo' | 'pendiente' | 'inmovil' | 'unidad'
const INMOVIL_DIAS = 60
const PRECIO_SOSPECHOSO_UMBRAL = 2000

function esUnidadSospechosa(p: { unidad: string; precio_unitario: number | null }): boolean {
  const u = (p.unidad ?? '').toLowerCase().trim()
  const esU = u === 'u' || u === 'unidad' || u === 'unidades' || u === 'un'
  return esU && (p.precio_unitario ?? 0) > PRECIO_SOSPECHOSO_UMBRAL
}
type SortMode = 'default' | 'valor_desc'

interface FormData {
  nombre: string
  categoria: string
  unidad: string
  stock_actual: string
  stock_minimo: string
  stock_critico: string
  precio_unitario: string
  // unidad de compra (opcional)
  unidad_compra: string
  cantidad_por_envase: string
  unidad_uso: string
  // producción interna (opcional)
  es_produccion: boolean
  receta_id: string
}

const FORM_EMPTY: FormData = {
  nombre: '',
  categoria: '',
  unidad: 'kg',
  stock_actual: '0',
  stock_minimo: '0',
  stock_critico: '0',
  precio_unitario: '0',
  unidad_compra: '',
  cantidad_por_envase: '',
  unidad_uso: '',
  es_produccion: false,
  receta_id: '',
}

function fmtPrecio(n: number) {
  if (!n || n === 0) return '—'
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

function fmtValor(n: number) {
  if (!n || n === 0) return '—'
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

function valorStock(p: ProductoConEstado) {
  if (!p.precio_unitario || p.precio_unitario === 0) return 0
  return p.stock_actual * p.precio_unitario
}

type ProdItem = MisePlaceItem & { registro: MisePlaceRegistro | null }

function prodStatus(item: ProdItem): 'ok' | 'bajo' | 'sin_stock' | 'sin_datos' {
  if (!item.registro) return 'sin_datos'
  const actual = item.registro.cantidad_actual
  if (actual == null) return item.registro.completado ? 'ok' : 'sin_datos'
  if (actual === 0) return 'sin_stock'
  if (item.cantidad > 0 && actual < item.cantidad * 0.8) return 'bajo'
  return 'ok'
}

function fmtFechaRel(fecha: string): string {
  const hoy = new Date().toISOString().slice(0, 10)
  const ayer = new Date(Date.now() - 864e5).toISOString().slice(0, 10)
  if (fecha === hoy) return 'Hoy'
  if (fecha === ayer) return 'Ayer'
  const d = new Date(fecha + 'T12:00')
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

export default function StockPage() {
  const router = useRouter()
  const RESTAURANTE_ID = useRestauranteId()
  const { productos, loading, error, actualizarStock, agregarProducto, actualizarProducto, eliminarProducto, refetch } = useStock()
  const { recetas } = useRecetas()
  const { categorias, agregarCategoria } = useCategoriasProducto()
  const { crearPedido } = usePedidos()
  const { proveedores } = useProveedores()
  const { fetchComparador } = usePreciosProveedores()
  const [comparadorPrecios, setComparadorPrecios] = useState<ComparadorPrecioProducto[]>([])
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    fetchComparador().then(r => setComparadorPrecios(r.comparador))
  }, [RESTAURANTE_ID, fetchComparador])
  const { puedeEditar, puedeEliminar, isAdmin } = usePermisos()
  const canEdit = isAdmin || puedeEditar('stock')
  const isDesktop = useIsDesktop()
  const [isNarrow, setIsNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 479px)')
    setIsNarrow(mq.matches)
    const h = (e: MediaQueryListEvent) => setIsNarrow(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  // ── Tabs ──
  const [activeTab, setActiveTab] = useState<'insumos' | 'producciones'>('insumos')
  const [prodItems, setProdItems] = useState<ProdItem[]>([])
  const [prodLoading, setProdLoading] = useState(false)

  const fetchProdStock = useCallback(async () => {
    if (!RESTAURANTE_ID) return
    setProdLoading(true)
    const supabase = createClient()
    try {
      const { data: items } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('plaza').order('orden', { ascending: true })
      if (!items?.length) { setProdItems([]); return }
      const since = new Date(); since.setDate(since.getDate() - 30)
      const { data: registros } = await supabase
        .from('checklist_registros')
        .select('*')
        .in('checklist_item_id', items.map((i: { id: string }) => i.id))
        .gte('fecha', since.toISOString().slice(0, 10))
        .order('fecha', { ascending: false })
      const latestByItem = new Map<string, MisePlaceRegistro>()
      for (const r of (registros ?? []) as MisePlaceRegistro[]) {
        if (!latestByItem.has(r.checklist_item_id)) {
          latestByItem.set(r.checklist_item_id, r)
        }
      }
      setProdItems((items as MisePlaceItem[]).map(item => ({
        ...item,
        registro: latestByItem.get(item.id) ?? null,
      })))
    } finally {
      setProdLoading(false)
    }
  }, [RESTAURANTE_ID])

  useEffect(() => {
    if (activeTab === 'producciones') fetchProdStock()
  }, [activeTab, fetchProdStock])

  // Allow Kitchen Coach tour to switch tabs via kc-set-tab event
  useEffect(() => {
    function handleSetTab(e: Event) {
      const { tab } = (e as CustomEvent<{ tab: string }>).detail
      if (tab === 'insumos' || tab === 'producciones') setActiveTab(tab)
    }
    window.addEventListener('kc-set-tab', handleSetTab)
    return () => window.removeEventListener('kc-set-tab', handleSetTab)
  }, [])

  // Filters
  const [search, setSearch] = useState('')
  const [catFilters, setCatFilters] = useState<string[]>([])
  const [provFilters, setProvFilters] = useState<string[]>([])
  const [estadoFilter, setEstadoFilter] = useState<FiltroEstado>('all')
  const [sortMode, setSortMode] = useState<SortMode>('default')

  // Inline stock edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Inline edit de umbrales (mínimo / crítico)
  const [editThr, setEditThr] = useState<{ id: string; min: string; crit: string } | null>(null)
  const guardarUmbrales = useCallback(async () => {
    if (!editThr) return
    const min = parseFloat(editThr.min) || 0
    const crit = parseFloat(editThr.crit) || 0
    try {
      await actualizarProducto(editThr.id, { stock_minimo: min, stock_critico: crit })
    } catch { /* noop */ }
    setEditThr(null)
  }, [editThr, actualizarProducto])

  // Add/edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProducto, setEditingProducto] = useState<ProductoConEstado | null>(null)
  const [form, setForm] = useState<FormData>(FORM_EMPTY)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [showUnidadCompra, setShowUnidadCompra] = useState(false)

  // Badge de sobreprecio vs. otros proveedores (Q5) — solo para el producto en edición
  const badgeSobreprecio = useMemo(() => {
    if (!editingProducto || !editingProducto.precio_unitario) return null
    const u = canonUnit(editingProducto.unidad)
    const match = comparadorPrecios.find(c => c.productoId === editingProducto.id && c.unidad === u)
    if (!match) return null
    const precioActual = editingProducto.precio_unitario
    if (precioActual <= match.mejorPrecio * 1.01) return null   // ya es el mejor precio (o casi)
    return {
      deltaPct: ((precioActual - match.mejorPrecio) / match.mejorPrecio) * 100,
      mejorProveedor: match.mejorProveedor,
      mejorPrecio: match.mejorPrecio,
      mejorFecha: match.mejorFecha,
    }
  }, [editingProducto, comparadorPrecios])

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showImportador, setShowImportador] = useState(false)
  const [showRebuildModal, setShowRebuildModal] = useState(false)
  const [rebuildPreview, setRebuildPreview] = useState<{
    productos: Array<{ nombre: string; precio_unitario: number; unidad: string; categoria: string; proveedor_nombre: string | null; ocurrencias: number }>
    total_productos: number
    total_proveedores_nuevos: number
    message?: string
  } | null>(null)
  const [rebuildLoading, setRebuildLoading] = useState(false)
  const [rebuildResult, setRebuildResult] = useState<{
    productos_borrados: number
    productos_creados: number
    proveedores_creados: number
    ingredientes_vinculados: number
  } | null>(null)

  // ── Planilla import ──────────────────────────────────────────
  type PlanillaConfianza = 'exacto' | 'parcial' | 'nuevo'
  type PlanillaStage = 'loading' | 'preview' | 'saving' | 'done'
  interface PlanillaItemUI {
    nombre: string
    unidad: string | null
    stock_actual: number | null
    stock_minimo: number | null
    stock_critico: number | null
    hoja: string
    producto_id: string | null
    producto_nombre: string | null
    producto_unidad: string | null
    confianza: PlanillaConfianza
    selected: boolean
  }
  const [showPlanillaImport, setShowPlanillaImport] = useState(false)
  const [planillaStage, setPlanillaStage] = useState<PlanillaStage>('loading')
  const [planillaItems, setPlanillaItems] = useState<PlanillaItemUI[]>([])
  const [planillaError, setPlanillaError] = useState<string | null>(null)
  const [planillaResult, setPlanillaResult] = useState<{ updated: number; created: number } | null>(null)
  const [planillaFilter, setPlanillaFilter] = useState<'todos' | 'actualizar' | 'nuevo'>('todos')
  const planillaFileRef = useRef<HTMLInputElement>(null)

  async function handlePlanillaFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setShowPlanillaImport(true)
    setPlanillaStage('loading')
    setPlanillaError(null)
    setPlanillaResult(null)
    setPlanillaItems([])
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
      const sheets = wb.SheetNames.map((nombre: string) => {
        const ws = wb.Sheets[nombre]
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
        return { nombre, rows: rows.map(r => (r as unknown[]).map(c => String(c ?? ''))) }
      })
      const res = await fetch('/api/stock/import-planilla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'preview', sheets }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? `Error ${res.status}`)
      setPlanillaItems((data.items as PlanillaItemUI[]).map(item => ({ ...item, selected: true })))
      setPlanillaFilter('todos')
      setPlanillaStage('preview')
    } catch (err) {
      setPlanillaError(err instanceof Error ? err.message : 'Error al procesar el archivo')
    }
  }

  async function handlePlanillaGuardar() {
    const selected = planillaItems.filter(i => i.selected)
    if (!selected.length) return
    setPlanillaStage('saving')
    try {
      const res = await fetch('/api/stock/import-planilla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'apply', items: selected }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Error al guardar')
      setPlanillaResult({ updated: data.updated, created: data.created })
      setPlanillaStage('done')
      refetch()
    } catch (err) {
      setPlanillaError(err instanceof Error ? err.message : 'Error al guardar')
      setPlanillaStage('preview')
    }
  }

  // ── Carrito de compras ───────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)

  const addToCart = useCallback((p: ProductoConEstado) => {
    setCart(prev => {
      if (prev.some(it => it.producto_id === p.id)) return prev // ya está
      // Cantidad sugerida: lo que falta para llegar al mínimo (o 1)
      const sugerida = Math.max(1, +(p.stock_minimo - p.stock_actual).toFixed(2))
      return [...prev, {
        producto_id: p.id,
        nombre: p.nombre,
        unidad: p.unidad_compra ?? p.unidad,
        precio_unitario: p.precio_unitario ?? 0,
        proveedor_id: p.proveedor_id ?? null,
        cantidad: sugerida,
      }]
    })
    setCartOpen(true)
  }, [])

  const updateCartQty = useCallback((id: string, cantidad: number) => {
    setCart(prev => cantidad <= 0
      ? prev.filter(it => it.producto_id !== id)
      : prev.map(it => it.producto_id === id ? { ...it, cantidad } : it))
  }, [])

  const removeFromCart = useCallback((id: string) => {
    setCart(prev => prev.filter(it => it.producto_id !== id))
  }, [])

  const confirmarPedidos = useCallback(async (notas: string) => {
    if (!cart.length) return
    // Agrupar por proveedor → un pedido por proveedor
    const grupos = new Map<string, CartItem[]>()
    for (const it of cart) {
      const key = it.proveedor_id ?? '__sin__'
      if (!grupos.has(key)) grupos.set(key, [])
      grupos.get(key)!.push(it)
    }
    try {
      for (const [key, items] of grupos.entries()) {
        const prov = key === '__sin__' ? null : proveedores.find(p => p.id === key)
        await crearPedido({
          proveedor_id: prov?.id ?? null,
          proveedor_nombre: prov?.nombre ?? 'Sin proveedor',
          notas: notas || null,
          items: items.map(it => ({
            producto_nombre: it.nombre,
            producto_id: it.producto_id,
            cantidad: it.cantidad,
            unidad: it.unidad,
            precio_estimado: it.precio_unitario,
          })),
        })
      }
      setCart([])
      setCartOpen(false)
      setSugToast(`${grupos.size === 1 ? 'Pedido creado' : `${grupos.size} pedidos creados`} en borrador`)
      setTimeout(() => setSugToast(null), 2800)
    } catch (e) {
      setSugToast('Error al crear pedido: ' + (e instanceof Error ? e.message : 'desconocido'))
      setTimeout(() => setSugToast(null), 3500)
    }
  }, [cart, proveedores, crearPedido])

  // Nueva categoría modal
  const [newCatModal, setNewCatModal] = useState(false)
  const [newCatNombre, setNewCatNombre] = useState('')
  const [newCatColor, setNewCatColor] = useState('#4361a0')
  const [newCatSaving, setNewCatSaving] = useState(false)

  // Banner rebuild: aparece cuando hay facturas pero >50% productos sin precio/proveedor
  const [facturasCount, setFacturasCount] = useState(0)
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const supabase = createClient()
    supabase.from('facturas')
      .select('*', { count: 'exact', head: true })
      .eq('restaurante_id', RESTAURANTE_ID)
      .then(({ count }) => setFacturasCount(count ?? 0))
  }, [RESTAURANTE_ID])

  const productosIncompletos = productos.filter(p => !p.precio_unitario || p.precio_unitario <= 0).length
  const showRebuildBanner = facturasCount > 0 && (productos.length === 0 || productosIncompletos / Math.max(productos.length, 1) > 0.3)

  // Quick stock mode
  const [quickMode, setQuickMode] = useState(false)
  const [quickIdx, setQuickIdx] = useState(0)
  const [quickValue, setQuickValue] = useState('')
  const quickRef = useRef<HTMLInputElement>(null)
  const [quickSector, setQuickSector] = useState<string | null>(null)
  const [showSectorSelect, setShowSectorSelect] = useState(false)
  const [quickChangedCount, setQuickChangedCount] = useState(0)

  // ── Sugerir mínimos (Feature 2) ──
  type Sugerencia = { id: string; nombre: string; unidad: string; entregas: number; sugerido_minimo: number; sugerido_critico: number }
  const [showSugerir, setShowSugerir] = useState(false)
  const [sugLoading, setSugLoading] = useState(false)
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [sugSelected, setSugSelected] = useState<Set<string>>(new Set())
  const [sugApplying, setSugApplying] = useState(false)
  const [sugToast, setSugToast] = useState<string | null>(null)

  async function abrirSugerir() {
    setShowSugerir(true)
    setSugLoading(true)
    setSugerencias([])
    try {
      const res = await fetch('/api/stock/sugerir-minimos', { method: 'POST' })
      const data = await res.json()
      const list: Sugerencia[] = data.sugerencias ?? []
      setSugerencias(list)
      setSugSelected(new Set(list.map(s => s.id)))
    } catch {
      setSugerencias([])
    }
    setSugLoading(false)
  }

  async function aplicarSugerencias() {
    setSugApplying(true)
    try {
      const elegidas = sugerencias.filter(s => sugSelected.has(s.id))
      for (const s of elegidas) {
        await actualizarProducto(s.id, { stock_minimo: s.sugerido_minimo, stock_critico: s.sugerido_critico })
      }
      setShowSugerir(false)
      setSugToast(`${elegidas.length} producto${elegidas.length !== 1 ? 's' : ''} con mínimo sugerido`)
      setTimeout(() => setSugToast(null), 3000)
      refetch()
    } catch { /* noop */ }
    setSugApplying(false)
  }

  // ── Stock inmóvil (Feature 3) — última compra por producto (precio_historial) ──
  const [inmovilMap, setInmovilMap] = useState<Map<string, string>>(new Map())
  const [inmovilLoaded, setInmovilLoaded] = useState(false)

  const cargarInmovil = useCallback(async () => {
    if (!RESTAURANTE_ID) return
    const supabase = createClient()
    const { data } = await supabase
      .from('precio_historial')
      .select('producto_id, fecha')
      .eq('restaurante_id', RESTAURANTE_ID)
      .order('fecha', { ascending: false })
    const m = new Map<string, string>()
    for (const r of (data ?? []) as { producto_id: string | null; fecha: string }[]) {
      if (r.producto_id && !m.has(r.producto_id)) m.set(r.producto_id, String(r.fecha).slice(0, 10))
    }
    setInmovilMap(m)
    setInmovilLoaded(true)
  }, [RESTAURANTE_ID])

  useEffect(() => {
    if (estadoFilter === 'inmovil' && !inmovilLoaded) cargarInmovil()
  }, [estadoFilter, inmovilLoaded, cargarInmovil])

  const esInmovil = useCallback((p: ProductoConEstado): boolean => {
    if (p.stock_actual <= 0) return false
    const last = inmovilMap.get(p.id) ?? (p.created_at ? p.created_at.slice(0, 10) : null)
    if (!last) return false
    const dias = (Date.now() - new Date(last + 'T12:00').getTime()) / 86_400_000
    return dias >= INMOVIL_DIAS
  }, [inmovilMap])
  // Orden congelado del stockeo en curso (ids). Se fija al iniciar para que la
  // lista NO se reordene al guardar (cambia el estado del producto) y el botón
  // Atrás siempre vuelva al producto correcto para corregir una carga.
  const [quickOrder, setQuickOrder] = useState<string[]>([])
  const [showQuickSummary, setShowQuickSummary] = useState(false)

  // Merma
  const { registrarMerma } = useMerma()
  const [mermaOpen, setMermaOpen] = useState(false)
  const [mermaPrefill, setMermaPrefill] = useState<{ producto_nombre?: string; producto_id?: string; unidad?: string } | undefined>()

  // Corrección masiva de unidades (A3)
  const [unidadEdits, setUnidadEdits] = useState<Record<string, string>>({})
  const [unidadSaving, setUnidadSaving] = useState(false)

  // Paste desde Excel (desktop)
  const [pasteRows, setPasteRows] = useState<PasteRow[]>([])
  const [pasteLoading, setPasteLoading] = useState(false)
  const [pasteResult, setPasteResult] = useState<{ ok: number; err: number } | null>(null)

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const active = document.activeElement
      if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (!text.includes('\t')) return
      e.preventDefault()
      const rows = parseTSV(text)
      if (rows.length > 0) { setPasteRows(rows); setPasteResult(null) }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  // Lista de nombres para el dropdown (combina DB + las que ya se usan en productos)
  const categoriasNombres = useMemo(() => {
    const deDB = categorias.map(c => c.nombre)
    const deProductos = Array.from(new Set(productos.map(p => p.categoria).filter(Boolean)))
    const todas = Array.from(new Set([...deDB, ...deProductos])).sort((a, b) => a.localeCompare(b, 'es'))
    return todas
  }, [categorias, productos])

  // Solo categorías que tienen productos (para filtro)
  const categoriasFiltro = useMemo(() =>
    Array.from(new Set(productos.map(p => p.categoria).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')),
    [productos]
  )

  // Opciones de filtro de categoría (con conteo)
  const catOpciones = useMemo(() => {
    const cnt = new Map<string, number>()
    for (const p of productos) if (p.categoria) cnt.set(p.categoria, (cnt.get(p.categoria) ?? 0) + 1)
    return categoriasFiltro.map(c => ({ value: c, label: c, count: cnt.get(c) ?? 0 }))
  }, [productos, categoriasFiltro])

  // Opciones de filtro de proveedor (con conteo) — incluye "Sin proveedor"
  const provOpciones = useMemo(() => {
    const nombre = new Map(proveedores.map(pr => [pr.id, pr.nombre]))
    const cnt = new Map<string, number>()
    for (const p of productos) {
      const key = p.proveedor_id ?? '__sin__'
      cnt.set(key, (cnt.get(key) ?? 0) + 1)
    }
    const opts = Array.from(cnt.entries())
      .filter(([k]) => k !== '__sin__')
      .map(([id, count]) => ({ value: id, label: nombre.get(id) ?? 'Proveedor', count }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'))
    if (cnt.has('__sin__')) opts.push({ value: '__sin__', label: 'Sin proveedor', count: cnt.get('__sin__')! })
    return opts
  }, [productos, proveedores])

  // Filtered + sorted list
  const filtered = useMemo(() => {
    let list = productos
    if (estadoFilter === 'pendiente') {
      list = productos.filter(p => p.stock_actual === 0 && p.precio_unitario === 0)
    } else if (estadoFilter === 'inmovil') {
      list = inmovilLoaded ? productos.filter(esInmovil) : []
    } else if (estadoFilter === 'unidad') {
      list = productos.filter(esUnidadSospechosa)
    } else if (estadoFilter !== 'all') {
      list = list.filter(p => p.estado === estadoFilter)
    }
    if (catFilters.length) list = list.filter(p => catFilters.includes(p.categoria))
    if (provFilters.length) list = list.filter(p => provFilters.includes(p.proveedor_id ?? '__sin__'))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(p => p.nombre.toLowerCase().includes(q))
    }
    if (sortMode === 'valor_desc') {
      list = [...list].sort((a, b) => valorStock(b) - valorStock(a))
    }
    return list
  }, [productos, estadoFilter, catFilters, provFilters, search, sortMode, esInmovil, inmovilLoaded])

  const totalDormido = useMemo(
    () => estadoFilter === 'inmovil' ? filtered.reduce((s, p) => s + valorStock(p), 0) : 0,
    [estadoFilter, filtered]
  )

  // Cantidad de columnas visibles (para colSpan de estados vacíos)
  const colCount = 3 + (isDesktop ? 2 : 0) + (isAdmin ? 2 : 0)

  const totalValor = useMemo(() =>
    filtered.reduce((acc, p) => acc + valorStock(p), 0),
    [filtered]
  )

  const nCritico = useMemo(() => productos.filter(p => p.estado === 'critico').length, [productos])
  const nBajo = useMemo(() => productos.filter(p => p.estado === 'bajo').length, [productos])
  const nPendiente = useMemo(() => productos.filter(p => p.stock_actual === 0 && p.precio_unitario === 0).length, [productos])
  const nUnidadSospechosa = useMemo(() => productos.filter(esUnidadSospechosa).length, [productos])

  useEffect(() => {
    // Insights accionables para Kitchen Coach (no solo conteos)
    const criticos = productos
      .filter(p => p.estado === 'critico')
      .map(p => ({ nombre: p.nombre, stock: p.stock_actual, critico: p.stock_critico, unidad: p.unidad }))
      .slice(0, 8)
    const sinPrecio = productos.filter(p => !p.precio_unitario || p.precio_unitario <= 0).length
    const valorTotalStock = productos.reduce((acc, p) => acc + valorStock(p), 0)
    // categorías con más productos en riesgo (crítico o bajo)
    const riesgoPorCat: Record<string, number> = {}
    for (const p of productos) {
      if (p.estado === 'critico' || p.estado === 'bajo') riesgoPorCat[p.categoria] = (riesgoPorCat[p.categoria] ?? 0) + 1
    }
    const categoriasEnRiesgo = Object.entries(riesgoPorCat)
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([cat, n]) => ({ categoria: cat, enRiesgo: n }))

    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'stock',
      tab: activeTab,
      total: productos.length,
      criticos,            // top-8 con nombre + cuánto queda vs umbral
      bajos: nBajo,
      pendientes: nPendiente, // sin stock y sin precio (a completar)
      sinPrecio,           // subvalúan el food cost de las recetas
      valorTotalStock: Math.round(valorTotalStock),
      categoriasEnRiesgo,
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [productos, activeTab, nCritico, nBajo, nPendiente])

  // Quick mode: lista filtrada por sector, críticos/bajos primero
  const sortByEstado = useCallback((arr: ProductoConEstado[]) => {
    const order = { critico: 0, bajo: 1, ok: 2 }
    return [...arr].sort((a, b) =>
      (order[a.estado as keyof typeof order] ?? 2) - (order[b.estado as keyof typeof order] ?? 2))
  }, [])
  // Productos del stockeo en curso, en el orden congelado pero con datos en vivo
  // (al volver atrás muestra el valor ya guardado, para poder corregirlo).
  const quickItems = useMemo(() => {
    const byId = new Map(productos.map(p => [p.id, p]))
    return quickOrder.map(id => byId.get(id)).filter(Boolean) as ProductoConEstado[]
  }, [quickOrder, productos])

  function openMerma(p: ProductoConEstado) {
    setMermaPrefill({ producto_nombre: p.nombre, producto_id: p.id, unidad: p.unidad })
    setMermaOpen(true)
  }

  // ── Corrección masiva de unidades ──
  async function aplicarCambiosUnidad() {
    if (Object.keys(unidadEdits).length === 0) return
    setUnidadSaving(true)
    const supabase = createClient()
    try {
      for (const [id, unidad] of Object.entries(unidadEdits)) {
        await actualizarProducto(id, { unidad })
        // Propaga unidad_costo a ingredientes vinculados para que el food cost pueda calcularse
        await supabase.from('ingredientes').update({ unidad_costo: unidad }).eq('producto_id', id)
      }
      setUnidadEdits({})
      setEstadoFilter('all')
      refetch()
    } catch { /* noop */ }
    setUnidadSaving(false)
  }

  // ── Inline stock edit ──
  function startEdit(p: ProductoConEstado) {
    setEditingId(p.id)
    setEditValue(String(p.stock_actual))
    setTimeout(() => inputRef.current?.select(), 30)
  }

  async function commitEdit(id: string) {
    const val = parseFloat(editValue)
    if (!isNaN(val) && val >= 0) await actualizarStock(id, val)
    setEditingId(null)
  }

  function cancelEdit() { setEditingId(null) }

  // ── Add / Edit modal ──
  function openAdd() {
    setEditingProducto(null)
    setForm(FORM_EMPTY)
    setFormError(null)
    setShowUnidadCompra(false)
    setModalOpen(true)
  }

  function openEdit(p: ProductoConEstado) {
    setEditingProducto(p)
    setForm({
      nombre: p.nombre,
      categoria: p.categoria,
      unidad: p.unidad,
      stock_actual: String(p.stock_actual),
      stock_minimo: String(p.stock_minimo),
      stock_critico: String(p.stock_critico),
      precio_unitario: String(p.precio_unitario || 0),
      unidad_compra: p.unidad_compra ?? '',
      cantidad_por_envase: p.cantidad_por_envase != null ? String(p.cantidad_por_envase) : '',
      unidad_uso: p.unidad_uso ?? '',
      es_produccion: !!p.es_produccion,
      receta_id: p.receta_id ?? '',
    })
    setShowUnidadCompra(!!(p.unidad_compra || p.cantidad_por_envase))
    setFormError(null)
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.nombre.trim()) { setFormError('El nombre es obligatorio'); return }
    setSaving(true)
    setFormError(null)
    try {
      const datos = {
        nombre: form.nombre.trim(),
        categoria: form.categoria,
        unidad: form.unidad,
        stock_actual: parseFloat(form.stock_actual) || 0,
        stock_minimo: parseFloat(form.stock_minimo) || 0,
        stock_critico: parseFloat(form.stock_critico) || 0,
        activo: true,
        proveedor_id: null,
        precio_unitario: parseFloat(form.precio_unitario) || 0,
        unidad_compra: showUnidadCompra && form.unidad_compra.trim() ? form.unidad_compra.trim() : null,
        cantidad_por_envase: showUnidadCompra && form.cantidad_por_envase ? parseFloat(form.cantidad_por_envase) || null : null,
        unidad_uso: showUnidadCompra && form.unidad_uso ? form.unidad_uso : null,
        es_produccion: form.es_produccion,
        receta_id: form.es_produccion && form.receta_id ? form.receta_id : null,
      }
      if (editingProducto) {
        await actualizarProducto(editingProducto.id, datos)
      } else {
        await agregarProducto(datos)
      }
      setModalOpen(false)
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    await eliminarProducto(deleteId)
    setDeleteId(null)
    if (editingProducto?.id === deleteId) setModalOpen(false)
  }

  async function handleNewCat() {
    if (!newCatNombre.trim()) return
    setNewCatSaving(true)
    try {
      await agregarCategoria(newCatNombre.trim(), newCatColor)
      setForm(f => ({ ...f, categoria: newCatNombre.trim() }))
      setNewCatModal(false)
      setNewCatNombre('')
    } catch {
      // ignore duplicate
    } finally {
      setNewCatSaving(false)
    }
  }

  // ── PDF export ──
  async function exportPDF() {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    doc.setFillColor(30, 41, 59)
    doc.rect(0, 0, 210, 32, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(18)
    doc.text('Inventario', 14, 15)
    doc.setFontSize(10)
    doc.text(`${filtered.length} productos · ${new Date().toLocaleDateString('es-AR')}`, 14, 25)
    doc.setTextColor(0, 0, 0)
    autoTable(doc, {
      startY: 38,
      head: [isAdmin
        ? ['#', 'Producto', 'Categoría', 'Unidad', 'Precio', 'Stock', 'Valor', 'Estado']
        : ['#', 'Producto', 'Categoría', 'Unidad', 'Stock', 'Estado']],
      body: filtered.map((p, i) => isAdmin
        ? [i + 1, p.nombre, p.categoria, p.unidad, fmtPrecio(p.precio_unitario), p.stock_actual, valorStock(p) > 0 ? fmtValor(valorStock(p)) : '—', p.estado === 'critico' ? 'CRÍTICO' : p.estado === 'bajo' ? 'BAJO' : 'OK']
        : [i + 1, p.nombre, p.categoria, p.unidad, p.stock_actual, p.estado === 'critico' ? 'CRÍTICO' : p.estado === 'bajo' ? 'BAJO' : 'OK']),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
    })
    if (totalValor > 0 && isAdmin) {
      const finalY = (doc as InstanceType<typeof jsPDF> & { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 200
      doc.setFontSize(9)
      doc.setTextColor(60, 60, 60)
      doc.text(`Valor total del stock: ${fmtValor(totalValor)}`, 14, finalY + 8)
    }
    doc.setFontSize(7)
    doc.setTextColor(150)
    doc.text('Generado por KitchenOS', 14, 285)
    doc.save(`inventario-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  // ── Estado badge ──
  function estadoBadge(p: ProductoConEstado) {
    if (p.stock_actual === 0 && p.precio_unitario === 0) return (
      <span style={{ background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 6, padding: '2px 6px', fontSize: 9, fontWeight: 700, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>Pendiente</span>
    )
    if (p.estado === 'critico') return (
      <span style={{ background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, padding: '2px 6px', fontSize: 9, fontWeight: 700, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>Crítico</span>
    )
    if (p.estado === 'bajo') return (
      <span style={{ background: 'rgba(245,158,11,.15)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 6, padding: '2px 6px', fontSize: 9, fontWeight: 700, color: '#fcd34d', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>Bajo</span>
    )
    return (
      <span style={{ background: 'rgba(74,222,128,.1)', border: '1px solid rgba(74,222,128,.25)', borderRadius: 6, padding: '2px 6px', fontSize: 9, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>OK</span>
    )
  }

  function exportXLSX() {
    exportarExcel(`stock_${fechaArchivo()}.xlsx`, [{
      nombre: 'Productos',
      filas: productos.map(p => ({
        'Nombre': p.nombre,
        'Categoría': p.categoria,
        'Unidad': p.unidad,
        'Stock actual': p.stock_actual,
        'Stock mínimo': p.stock_minimo,
        'Stock crítico': p.stock_critico,
        'Precio unitario': p.precio_unitario,
        'Estado': p.estado,
        'Activo': p.activo ? 'Sí' : 'No',
      })),
    }])
  }

  const nAlerta = nCritico + nBajo

  return (
    <PageTransition>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      <PageHeader
        title="Inventario"
        icon="inventory_2"
        subtitle={loading ? '…' : `${productos.length} producto${productos.length !== 1 ? 's' : ''}`}
        onBack={() => router.back()}
        actions={
          <div style={{ position: 'relative', overflow: 'hidden', maxWidth: '100%' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', scrollbarWidth: 'none' }}>
            <button
              data-coach-target="stock-kpis"
              onClick={() => setEstadoFilter(f => f === 'critico' ? 'all' : 'critico')}
              style={{ background: estadoFilter === 'critico' ? 'rgba(239,68,68,.4)' : 'rgba(239,68,68,.2)', border: `1px solid ${estadoFilter === 'critico' ? 'rgba(239,68,68,.7)' : 'rgba(239,68,68,.35)'}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
            >
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fca5a5', fontFamily: "'DM Mono', monospace" }}>{nCritico}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Crítico</span>
            </button>
            <button
              onClick={() => setEstadoFilter(f => f === 'bajo' ? 'all' : 'bajo')}
              style={{ background: estadoFilter === 'bajo' ? 'rgba(245,158,11,.3)' : 'rgba(245,158,11,.15)', border: `1px solid ${estadoFilter === 'bajo' ? 'rgba(245,158,11,.6)' : 'rgba(245,158,11,.3)'}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
            >
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fcd34d', fontFamily: "'DM Mono', monospace" }}>{nBajo}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Bajo</span>
            </button>
            {nPendiente > 0 && (
              <button
                onClick={() => setEstadoFilter(f => f === 'pendiente' ? 'all' : 'pendiente')}
                style={{ background: estadoFilter === 'pendiente' ? 'rgba(239,68,68,.3)' : 'rgba(239,68,68,.1)', border: `1px solid ${estadoFilter === 'pendiente' ? 'rgba(239,68,68,.5)' : 'rgba(239,68,68,.2)'}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
              >
                <span style={{ fontSize: 15, fontWeight: 700, color: '#fca5a5', fontFamily: "'DM Mono', monospace" }}>{nPendiente}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Pendiente</span>
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setEstadoFilter(f => f === 'inmovil' ? 'all' : 'inmovil')}
                title={`Productos con stock pero sin compras hace +${INMOVIL_DIAS} días`}
                style={{ background: estadoFilter === 'inmovil' ? 'rgba(139,92,246,.35)' : 'rgba(139,92,246,.15)', border: `1px solid ${estadoFilter === 'inmovil' ? 'rgba(139,92,246,.6)' : 'rgba(139,92,246,.3)'}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#c4b5fd' }}>hourglass_empty</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Inmóvil</span>
              </button>
            )}
            {isAdmin && nUnidadSospechosa > 0 && (
              <button
                onClick={() => setEstadoFilter(f => f === 'unidad' ? 'all' : 'unidad')}
                title="Productos 'por unidad' con precio alto — posible unidad incorrecta que excluye líneas del food cost"
                style={{ background: estadoFilter === 'unidad' ? 'rgba(245,158,11,.35)' : 'rgba(245,158,11,.15)', border: `1px solid ${estadoFilter === 'unidad' ? 'rgba(245,158,11,.6)' : 'rgba(245,158,11,.3)'}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fcd34d' }}>warning</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#fcd34d', fontFamily: "'DM Mono', monospace" }}>{nUnidadSospechosa}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Unidades</span>
              </button>
            )}
            <ActionButton icon="table_view" label="Excel" variant="secondary" onClick={exportXLSX} />
            <ActionButton icon="picture_as_pdf" label="PDF" variant="secondary" onClick={exportPDF} />
            <button
              data-coach-target="stock-importar"
              onClick={() => setShowImportador(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 8, background: 'rgba(255,255,255,.15)', color: '#fff', border: '1px solid rgba(255,255,255,.25)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload_file</span>
              Importar
            </button>
            <button
              onClick={() => planillaFileRef.current?.click()}
              title="Importar planilla de stock (Excel con múltiples hojas)"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 8, background: 'rgba(255,255,255,.15)', color: '#fff', border: '1px solid rgba(255,255,255,.25)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>table_chart</span>
              Planilla
            </button>
            {isAdmin && (
              <button
                onClick={abrirSugerir}
                title="Sugerir stock mínimo y crítico desde la frecuencia de compra"
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 8, background: 'rgba(255,255,255,.15)', color: '#fff', border: '1px solid rgba(255,255,255,.25)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>tune</span>
                Sugerir mínimos
              </button>
            )}
            <button
              data-coach-target="stock-rebuild"
              onClick={async () => {
                setShowRebuildModal(true)
                setRebuildLoading(true)
                setRebuildResult(null)
                try {
                  const res = await fetch('/api/importador/productos-desde-facturas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ restaurante_id: RESTAURANTE_ID, mode: 'preview' }),
                  })
                  const data = await res.json()
                  setRebuildPreview(data)
                } catch {
                  setRebuildPreview({ productos: [], total_productos: 0, total_proveedores_nuevos: 0, message: 'Error al cargar preview' })
                }
                setRebuildLoading(false)
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 8, background: 'rgba(239,68,68,.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,.3)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
              title="Borrar stock y reconstruir desde facturas"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
              Rebuild
            </button>
            <button
              data-coach-target="stock-stockear"
              onClick={() => setShowSectorSelect(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 8, background: '#fff', color: 'var(--navy)', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>speed</span>
              Stockear
            </button>
          </div>
          {/* Fade indicator — right edge */}
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 32, background: 'linear-gradient(to right, transparent, var(--navy))', pointerEvents: 'none' }} />
          </div>
        }
        below={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Tab bar */}
            <div data-coach-target="stock-tabs">
              <SegmentedTabs tabs={STOCK_TABS} active={activeTab} onChange={setActiveTab} style={{ width: '100%' }} />
            </div>
            {/* Insumos filters */}
            {activeTab === 'insumos' && (
              <div data-coach-target="stock-filtros" style={{ display: 'flex', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, padding: '0 10px', height: 32, flex: 1 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'rgba(255,255,255,.4)' }}>search</span>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar…"
                    style={{ border: 'none', background: 'none', outline: 'none', fontSize: 12, fontFamily: 'inherit', color: '#fff', width: '100%' }}
                  />
                  {search && (
                    <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.5)', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                  )}
                </div>
                <MultiSelectFiltro
                  label="Categorías"
                  icon="category"
                  opciones={catOpciones}
                  seleccionadas={catFilters}
                  onChange={setCatFilters}
                />
                <MultiSelectFiltro
                  label="Proveedor"
                  icon="local_shipping"
                  opciones={provOpciones}
                  seleccionadas={provFilters}
                  onChange={setProvFilters}
                />
                <button
                  onClick={() => setSortMode(s => s === 'valor_desc' ? 'default' : 'valor_desc')}
                  title={sortMode === 'valor_desc' ? 'Orden por valor activo' : 'Ordenar por valor'}
                  style={{ height: 32, padding: '0 8px', background: sortMode === 'valor_desc' ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, cursor: 'pointer' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: sortMode === 'valor_desc' ? '#fff' : 'rgba(255,255,255,.5)', display: 'block' }}>sort</span>
                </button>
              </div>
            )}
            {/* Producciones refresh */}
            {activeTab === 'producciones' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', flex: 1 }}>
                  Stock registrado en checklist de plaza
                </span>
                <button onClick={fetchProdStock} style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'rgba(255,255,255,.7)' }}>refresh</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', fontWeight: 600 }}>Actualizar</span>
                </button>
              </div>
            )}
          </div>
        }
      />

      <UndoBanner tipo="stock" onUndo={() => refetch()} />

      {/* ── Producciones view ── */}
      {activeTab === 'producciones' && (
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {prodLoading ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--text-3)', display: 'block', marginBottom: 8 }}>hourglass_empty</span>
              <p style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>Cargando producciones…</p>
            </div>
          ) : prodItems.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--text-3)', display: 'block', marginBottom: 8 }}>restaurant_menu</span>
              <p style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>Sin producciones configuradas</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Agregá ítems en el checklist de plaza</p>
            </div>
          ) : (() => {
            const plazas = Array.from(new Set(prodItems.map(i => i.plaza))).sort()
            const nHoy = prodItems.filter(i => i.registro?.fecha === new Date().toISOString().slice(0, 10)).length
            const nSinDatos = prodItems.filter(i => prodStatus(i) === 'sin_datos').length
            return (
              <div style={{ paddingBottom: 80 }}>
                {/* Summary bar */}
                <div style={{ display: 'flex', gap: 8, padding: '10px 14px 0' }}>
                  <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', fontFamily: "'DM Mono', monospace" }}>{nHoy}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Hoy</div>
                  </div>
                  <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981', fontFamily: "'DM Mono', monospace" }}>{prodItems.filter(i => prodStatus(i) === 'ok').length}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>OK</div>
                  </div>
                  <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b', fontFamily: "'DM Mono', monospace" }}>{prodItems.filter(i => prodStatus(i) === 'bajo').length}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Bajo</div>
                  </div>
                  {nSinDatos > 0 && (
                    <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{nSinDatos}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Sin datos</div>
                    </div>
                  )}
                </div>

                {plazas.map(plaza => {
                  const plazaItems = prodItems.filter(i => i.plaza === plaza)
                  return (
                    <div key={plaza}>
                      <div style={{ padding: '14px 14px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                        {plaza} · {plazaItems.length} ítem{plazaItems.length !== 1 ? 's' : ''}
                      </div>
                      {plazaItems.map(item => {
                        const st = prodStatus(item)
                        const actual = item.registro?.cantidad_actual
                        const fecha = item.registro?.fecha
                        const colorMap = { ok: '#10b981', bajo: '#f59e0b', sin_stock: '#ef4444', sin_datos: 'var(--text-3)' }
                        const bgMap = { ok: 'rgba(16,185,129,.08)', bajo: 'rgba(245,158,11,.08)', sin_stock: 'rgba(239,68,68,.08)', sin_datos: 'transparent' }
                        const labelMap = { ok: 'OK', bajo: 'Bajo', sin_stock: 'Sin stock', sin_datos: 'Sin datos' }
                        const pct = (item.cantidad > 0 && actual != null && actual > 0)
                          ? Math.min(100, Math.round((actual / item.cantidad) * 100)) : 0
                        return (
                          <div key={item.id} style={{ margin: '0 14px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {item.nombre}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
                                  {fecha ? fmtFechaRel(fecha) : 'Nunca registrado'}
                                  {item.registro?.turno ? ` · ${item.registro.turno}` : ''}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                {actual != null ? (
                                  <div style={{ fontSize: 15, fontWeight: 800, color: colorMap[st], fontFamily: "'DM Mono', monospace" }}>
                                    {actual}<span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-3)', marginLeft: 2 }}>{item.unidad}</span>
                                  </div>
                                ) : item.registro?.completado ? (
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>✓</div>
                                ) : (
                                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>—</div>
                                )}
                                {item.cantidad > 0 && (
                                  <div style={{ fontSize: 9, color: 'var(--text-3)' }}>meta: {item.cantidad} {item.unidad}</div>
                                )}
                              </div>
                              <div style={{ background: bgMap[st], borderRadius: 6, padding: '3px 8px', flexShrink: 0 }}>
                                <span style={{ fontSize: 9, fontWeight: 700, color: colorMap[st], textTransform: 'uppercase', letterSpacing: '.05em' }}>
                                  {labelMap[st]}
                                </span>
                              </div>
                            </div>
                            {/* Progress bar */}
                            {pct > 0 && (
                              <div style={{ marginTop: 8, height: 3, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: colorMap[st], transition: 'width .3s' }} />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}

      {/* ── Banner CTA: Rebuild desde facturas ── */}
      {activeTab === 'insumos' && showRebuildBanner && (
        <div style={{
          margin: '8px 12px 0', padding: '12px 14px',
          background: 'linear-gradient(135deg, rgba(67,97,160,.12), rgba(239,68,68,.08))',
          border: '1px solid rgba(67,97,160,.3)', borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--accent)', flexShrink: 0 }}>auto_fix_high</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.3 }}>
              {productos.length === 0 ? 'Stock vacío' : `${productosIncompletos} productos sin precio`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
              Tenés {facturasCount} facturas. Podés reconstruir el stock automáticamente.
            </div>
          </div>
          <button
            onClick={async () => {
              setShowRebuildModal(true)
              setRebuildLoading(true)
              setRebuildResult(null)
              try {
                const res = await fetch('/api/importador/productos-desde-facturas', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ restaurante_id: RESTAURANTE_ID, mode: 'preview' }),
                })
                const data = await res.json()
                if (!res.ok || data.error) {
                  setRebuildPreview({
                    productos: [],
                    total_productos: 0,
                    total_proveedores_nuevos: 0,
                    message: data.error || `Error HTTP ${res.status}`,
                  })
                } else {
                  setRebuildPreview({
                    productos: data.productos ?? [],
                    total_productos: data.total_productos ?? 0,
                    total_proveedores_nuevos: data.total_proveedores_nuevos ?? 0,
                    message: data.message,
                  })
                }
              } catch (e) {
                setRebuildPreview({
                  productos: [], total_productos: 0, total_proveedores_nuevos: 0,
                  message: 'Error de red: ' + (e instanceof Error ? e.message : 'desconocido'),
                })
              }
              setRebuildLoading(false)
            }}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: 'white', fontWeight: 700, fontSize: 12,
              cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            Reconstruir
          </button>
        </div>
      )}

      {/* ── Banner CTA: unidades sospechosas ── */}
      {activeTab === 'insumos' && nUnidadSospechosa > 0 && estadoFilter !== 'unidad' && (
        <div style={{
          margin: '8px 12px 0', padding: '12px 14px',
          background: 'linear-gradient(135deg, rgba(245,158,11,.12), rgba(234,179,8,.08))',
          border: '1px solid rgba(245,158,11,.3)', borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#f59e0b', flexShrink: 0 }}>warning</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.3 }}>
              {nUnidadSospechosa} producto{nUnidadSospechosa !== 1 ? 's' : ''} con posible unidad incorrecta
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
              Cargados &quot;por unidad&quot; con precio alto — el food cost excluye esas líneas silenciosamente.
            </div>
          </div>
          <button
            onClick={() => setEstadoFilter('unidad')}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            Revisar
          </button>
        </div>
      )}

      {/* ── Insumos: tabla unificada (thead sticky) ── */}
      {activeTab === 'insumos' && (
      <div data-coach-target="stock-lista" style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {estadoFilter === 'unidad' && (
          <div style={{ margin: '8px 12px', padding: '14px', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 10, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#f59e0b', flexShrink: 0 }}>warning</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                  {filtered.length} producto{filtered.length !== 1 ? 's' : ''} con unidad a revisar
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
                  Seleccioná la unidad correcta (kg, l, etc.) y aplicá. El food cost dejará de excluir esas líneas.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {filtered.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{fmtPrecio(p.precio_unitario ?? 0)} / {p.unidad}</div>
                  </div>
                  <select
                    value={unidadEdits[p.id] ?? p.unidad}
                    onChange={e => setUnidadEdits(prev => ({ ...prev, [p.id]: e.target.value }))}
                    style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontFamily: 'inherit', cursor: 'pointer' }}
                  >
                    {(['u', 'g', 'kg', 'ml', 'l'] as const).map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <button
              disabled={unidadSaving || Object.keys(unidadEdits).length === 0}
              onClick={aplicarCambiosUnidad}
              style={{
                width: '100%', padding: 12, borderRadius: 8, border: 'none',
                background: Object.keys(unidadEdits).length === 0 ? 'var(--border)' : 'var(--accent)',
                color: '#fff', fontWeight: 700, fontSize: 13,
                cursor: Object.keys(unidadEdits).length === 0 ? 'default' : 'pointer',
                fontFamily: 'inherit', opacity: unidadSaving ? .6 : 1,
              }}
            >
              {unidadSaving
                ? 'Guardando…'
                : Object.keys(unidadEdits).length === 0
                  ? 'Modificá al menos una unidad'
                  : `Aplicar ${Object.keys(unidadEdits).length} cambio${Object.keys(unidadEdits).length !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
        {estadoFilter === 'inmovil' && (
          <div style={{ margin: '8px 12px 0', padding: '12px 14px', background: 'rgba(139,92,246,.08)', border: '1px solid rgba(139,92,246,.3)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#8b5cf6', flexShrink: 0 }}>hourglass_empty</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                {!inmovilLoaded ? 'Analizando movimientos…'
                  : filtered.length === 0 ? 'Sin capital dormido'
                  : `${fmtValor(totalDormido)} en stock inmóvil`}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
                {!inmovilLoaded ? 'Revisando últimas compras de cada producto'
                  : filtered.length === 0 ? `Todo tu stock rotó en los últimos ${INMOVIL_DIAS} días`
                  : `${filtered.length} producto${filtered.length !== 1 ? 's' : ''} con stock pero sin comprarse hace +${INMOVIL_DIAS} días`}
              </div>
            </div>
          </div>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: isDesktop ? '30%' : undefined }} />
            {isDesktop && <col style={{ width: '14%' }} />}
            {isDesktop && <col style={{ width: '16%' }} />}
            {isAdmin && <col style={{ width: isDesktop ? '10%' : 64 }} />}
            <col style={{ width: isDesktop ? '18%' : isNarrow ? 64 : 96 }} />
            <col style={{ width: isDesktop ? '6%' : isNarrow ? 62 : 56 }} />
            {isAdmin && <col style={{ width: isDesktop ? '6%' : 64 }} />}
          </colgroup>
          <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
            <tr>
              <th style={{ ...thStyle, background: 'var(--navy)', textAlign: 'left', paddingLeft: 12, color: 'rgba(255,255,255,.7)' }}>Producto</th>
              {isDesktop && <th style={{ ...thStyle, background: 'var(--navy)', textAlign: 'left', paddingLeft: 8, color: 'rgba(255,255,255,.7)' }}>Categoría</th>}
              {isDesktop && <th style={{ ...thStyle, background: 'var(--navy)', textAlign: 'left', paddingLeft: 8, color: 'rgba(255,255,255,.7)' }}>Nivel</th>}
              {isAdmin && <th style={{ ...thStyle, background: 'var(--navy)', textAlign: 'right', paddingRight: 8 }}>Precio</th>}
              <th style={{ ...thStyle, background: '#243a5e', color: 'rgba(255,255,255,.9)' }}>Stock</th>
              <th style={{ ...thStyle, background: 'var(--navy)' }}>Estado</th>
              {isAdmin && <th style={{ ...thStyle, background: 'var(--navy)' }} aria-label="Acciones"></th>}
            </tr>
          </thead>
          {loading ? (
            <tbody><tr><td colSpan={colCount} style={{ padding: '48px 24px', textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--text-3)', display: 'block', marginBottom: 8 }}>hourglass_empty</span>
              <p style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>Cargando inventario…</p>
            </td></tr></tbody>
          ) : error ? (
            <tbody><tr><td colSpan={colCount} style={{ padding: '48px 24px', textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#ef4444', display: 'block', marginBottom: 8 }}>error</span>
              <p style={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>{error}</p>
            </td></tr></tbody>
          ) : filtered.length === 0 ? (
            <tbody><tr><td colSpan={colCount} style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--text-3)', display: 'block', marginBottom: 8 }}>search_off</span>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{productos.length === 0 ? 'Sin productos aún' : 'Sin resultados'}</div>
              {productos.length === 0 && <p style={{ fontSize: 11, marginTop: 6, color: 'var(--text-3)' }}>Los productos se agregan automáticamente al cargar facturas</p>}
            </td></tr></tbody>
          ) : (
            <tbody>
              {filtered.map((p, i) => {
                const val = valorStock(p)
                return (
                  <tr
                    key={p.id}
                    onDoubleClick={() => canEdit && openEdit(p)}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: (p.stock_actual === 0 && p.precio_unitario === 0)
                        ? 'rgba(239,68,68,0.07)'
                        : i % 2 === 0 ? 'var(--surface)' : 'var(--bg)',
                      cursor: canEdit ? 'pointer' : 'default',
                    }}
                  >
                    {/* Producto */}
                    <td style={{ padding: '11px 8px 11px 12px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.25, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {p.nombre}
                          {p.es_produccion && (
                            <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', padding: '1px 5px', borderRadius: 4, background: 'rgba(16,185,129,.12)', color: '#10b981', flexShrink: 0 }}>
                              Producción
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                          {!isDesktop && `${p.categoria} · `}{p.unidad_uso ?? p.unidad}
                          {val > 0 && isAdmin && !isDesktop && <span style={{ color: 'var(--accent)', fontWeight: 700, marginLeft: 6, fontFamily: "'DM Mono', monospace" }}>{fmtValor(val)}</span>}
                        </div>
                        {isNarrow && (
                          <div style={{ fontSize: 9.5, color: 'var(--text-3)', marginTop: 2, fontFamily: "'DM Mono', monospace", display: 'flex', gap: 8 }}>
                            <span>mín <b style={{ color: '#d97706' }}>{p.stock_minimo ?? 0}</b></span>
                            <span>crít <b style={{ color: '#dc2626' }}>{p.stock_critico ?? 0}</b></span>
                          </div>
                        )}
                      </div>
                    </td>
                    {/* Categoría — solo desktop */}
                    {isDesktop && (
                      <td style={{ padding: '11px 8px' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{p.categoria || '—'}</span>
                        {val > 0 && isAdmin && (
                          <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, marginTop: 1, fontFamily: "'DM Mono', monospace" }}>{fmtValor(val)}</div>
                        )}
                      </td>
                    )}
                    {/* Nivel — mini-barra stock vs mínimo (solo desktop) */}
                    {isDesktop && (() => {
                      const min = p.stock_minimo ?? 0
                      const pct = min > 0 ? Math.min(100, Math.round((p.stock_actual / min) * 100)) : (p.stock_actual > 0 ? 100 : 0)
                      const barColor = p.estado === 'critico' ? '#dc2626' : p.estado === 'bajo' ? '#d97706' : '#10b981'
                      return (
                        <td style={{ padding: '11px 10px 11px 8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: barColor, transition: 'width .2s' }} />
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: 'var(--text-3)', minWidth: 28, textAlign: 'right' }}>{min > 0 ? `${pct}%` : '—'}</span>
                          </div>
                        </td>
                      )
                    })()}
                    {/* Precio */}
                    {isAdmin && (
                    <td style={{ padding: '11px 8px 11px 4px', textAlign: 'right' }}>
                      <span style={{ fontSize: 12, fontWeight: 500, fontFamily: "'DM Mono', monospace", color: 'var(--text-2)' }}>
                        {fmtPrecio(p.precio_unitario)}
                      </span>
                    </td>
                    )}
                    {/* Stock + umbrales editables — HORIZONTAL alineado */}
                    <td style={{ padding: '8px 6px', background: 'color-mix(in srgb, var(--accent) 6%, transparent)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        {/* Número de stock (sub-columna derecha, ancho fijo) */}
                        <div style={{ width: 62, textAlign: 'right', flexShrink: 0 }}>
                        {editingId === p.id ? (
                          <input
                            ref={inputRef}
                            type="number"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => commitEdit(p.id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitEdit(p.id)
                              if (e.key === 'Escape') cancelEdit()
                            }}
                            style={{ width: 54, textAlign: 'center', fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono', monospace", background: 'var(--navy)', color: '#fff', border: '1px solid rgba(255,255,255,.3)', borderRadius: 6, padding: '3px 4px', outline: 'none' }}
                          />
                        ) : (
                          <button
                            onClick={e => { if (canEdit) { e.stopPropagation(); startEdit(p) } }}
                            title="Tocá para editar stock"
                            style={{ background: 'none', border: 'none', cursor: canEdit ? 'pointer' : 'default', padding: 0, fontSize: 16, fontWeight: 800, lineHeight: 1, fontFamily: "'DM Mono', monospace", color: p.estado === 'critico' ? '#dc2626' : p.estado === 'bajo' ? '#d97706' : 'var(--text-1)', whiteSpace: 'nowrap' }}
                          >
                            {p.stock_actual}
                            <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--text-3)', marginLeft: 2 }}>{p.unidad_uso ?? p.unidad}</span>
                          </button>
                        )}
                        </div>

                        {/* Separador vertical + Mín/Crít — oculto en pantallas muy angostas (<480px) */}
                        {!isNarrow && <div style={{ width: 1, alignSelf: 'stretch', minHeight: 22, background: 'var(--border)', opacity: 0.6 }} />}

                        {/* Mín / Crít (sub-columna izquierda, ancho fijo) */}
                        {!isNarrow && <div style={{ width: 84, textAlign: 'left', flexShrink: 0 }}>
                        {editThr?.id === p.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }} onClick={e => e.stopPropagation()}>
                            <input
                              type="number" value={editThr.min} autoFocus
                              onChange={e => setEditThr(t => t && { ...t, min: e.target.value })}
                              onKeyDown={e => { if (e.key === 'Enter') guardarUmbrales(); if (e.key === 'Escape') setEditThr(null) }}
                              style={{ width: 30, textAlign: 'center', fontSize: 10, fontWeight: 700, fontFamily: "'DM Mono', monospace", background: 'var(--bg)', color: '#d97706', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 1px', outline: 'none' }}
                            />
                            <input
                              type="number" value={editThr.crit}
                              onChange={e => setEditThr(t => t && { ...t, crit: e.target.value })}
                              onKeyDown={e => { if (e.key === 'Enter') guardarUmbrales(); if (e.key === 'Escape') setEditThr(null) }}
                              style={{ width: 30, textAlign: 'center', fontSize: 10, fontWeight: 700, fontFamily: "'DM Mono', monospace", background: 'var(--bg)', color: '#dc2626', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 1px', outline: 'none' }}
                            />
                            <button onClick={guardarUmbrales} aria-label="Guardar umbrales" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#10b981' }}>check_circle</span>
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={e => { if (canEdit) { e.stopPropagation(); setEditThr({ id: p.id, min: String(p.stock_minimo ?? 0), crit: String(p.stock_critico ?? 0) }) } }}
                            title="Tocá para editar mínimo y crítico"
                            aria-label="Editar mínimo y crítico"
                            style={{ background: 'none', border: 'none', cursor: canEdit ? 'pointer' : 'default', padding: 0, fontSize: 9.5, lineHeight: 1, fontFamily: "'DM Mono', monospace", color: 'var(--text-3)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            <span>mín <b style={{ color: '#d97706' }}>{p.stock_minimo ?? 0}</b></span>
                            <span>crít <b style={{ color: '#dc2626' }}>{p.stock_critico ?? 0}</b></span>
                          </button>
                        )}
                        </div>}
                      </div>
                    </td>
                    {/* Estado */}
                    <td style={{ padding: '11px 4px', textAlign: 'center' }}>
                      {estadoBadge(p)}
                    </td>
                    {/* Acciones */}
                    {isAdmin && (
                    <td style={{ padding: '11px 4px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); addToCart(p) }}
                          aria-label="Agregar al carrito de compras"
                          title="Agregar al pedido"
                          disabled={cart.some(it => it.producto_id === p.id)}
                          style={{ background: 'none', border: 'none', cursor: cart.some(it => it.producto_id === p.id) ? 'default' : 'pointer', padding: 0, display: 'flex' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 19, color: cart.some(it => it.producto_id === p.id) ? 'var(--accent)' : (p.estado === 'critico' || p.estado === 'bajo') ? 'var(--accent)' : 'var(--text-3)' }}>
                            {cart.some(it => it.producto_id === p.id) ? 'shopping_cart' : 'add_shopping_cart'}
                          </span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openMerma(p) }}
                          aria-label="Registrar merma"
                          title="Registrar merma"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--text-3)' }}>delete_sweep</span>
                        </button>
                      </div>
                    </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          )}
        </table>
      </div>
      )}

      {/* ── Footer ── */}
      <div style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '7px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {canEdit && (
            <button
              data-shortcut="new"
              onClick={openAdd}
              style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: 11, fontWeight: 600 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
              Producto
            </button>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{isDesktop ? 'Doble clic para editar · Ctrl+V para pegar Excel' : 'Doble tap para editar'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {totalValor > 0 && isAdmin && (
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)' }}>
              Stock: <span style={{ color: 'var(--accent)', fontFamily: "'DM Mono', monospace" }}>{fmtValor(totalValor)}</span>
            </span>
          )}
          {nAlerta > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>
              {nAlerta} alerta{nAlerta !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* ── Add/Edit modal ── */}
      {modalOpen && (
        <div
          style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} onClick={() => setModalOpen(false)} />
          <div
            style={{ position: 'relative', background: 'var(--surface)', borderRadius: '16px 16px 0 0', padding: '20px 16px 100px', maxHeight: '92%', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(0,0,0,.3)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 16px' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
                {editingProducto ? 'Editar producto' : 'Nuevo producto'}
              </h2>
              {editingProducto && puedeEliminar && (
                <button
                  onClick={() => setDeleteId(editingProducto.id)}
                  style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#ef4444', fontFamily: 'inherit' }}
                >
                  Eliminar
                </button>
              )}
            </div>

            {formError && (
              <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#ef4444' }}>
                {formError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={lblStyle}>Nombre *</span>
                <input
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Lomo, Tomate perita…"
                  style={inputStyle}
                />
              </label>

              {/* Categoría + botón "+" */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={lblStyle}>Categoría</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <select
                      value={form.categoria}
                      onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                      style={{ ...inputStyle, appearance: 'auto', flex: 1 }}
                    >
                      <option value="">Elegir…</option>
                      {categoriasNombres.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button
                      onClick={() => setNewCatModal(true)}
                      title="Nueva categoría"
                      style={{ width: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-2)' }}>add</span>
                    </button>
                  </div>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={lblStyle}>Unidad</span>
                  <select value={form.unidad} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer', appearance: 'auto' }}>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </label>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ ...lblStyle, color: 'var(--navy)' }}>
                  {form.es_produccion ? 'Costo unitario ($) — desde receta' : 'Precio unitario ($)'}
                </span>
                <input type="number" min="0" step="0.01" value={form.precio_unitario} onChange={e => setForm(f => ({ ...f, precio_unitario: e.target.value }))}
                  placeholder="0"
                  style={{ ...inputStyle, borderColor: 'rgba(28,45,74,.3)' }} />
              </label>

              {/* Badge sobreprecio vs. otros proveedores (Q5) */}
              {badgeSobreprecio && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 10,
                  background: 'rgba(220,38,38,.06)', border: '1px solid rgba(220,38,38,.25)',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#dc2626', flexShrink: 0 }}>trending_up</span>
                  <span style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.4 }}>
                    Pagaste <strong style={{ color: '#dc2626' }}>{badgeSobreprecio.deltaPct.toFixed(0)}% más</strong> que el mejor precio reciente
                    ({badgeSobreprecio.mejorProveedor}, {fmtPrecio(badgeSobreprecio.mejorPrecio)} el {new Date(badgeSobreprecio.mejorFecha + 'T12:00:00').toLocaleDateString('es-AR')})
                  </span>
                </div>
              )}

              {/* ── Producción interna ── */}
              <div style={{ background: form.es_produccion ? 'rgba(16,185,129,.06)' : 'var(--bg)', border: `1px solid ${form.es_produccion ? 'rgba(16,185,129,.3)' : 'var(--border)'}`, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.es_produccion}
                    onChange={e => setForm(f => ({ ...f, es_produccion: e.target.checked, receta_id: e.target.checked ? f.receta_id : '' }))}
                    style={{ width: 18, height: 18, accentColor: '#10b981', flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Producción interna</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Caldo, masa, fondo, salsa base — se produce, no se compra</div>
                  </div>
                </label>

                {form.es_produccion && (() => {
                  const recetaSel = recetas.find(r => r.id === form.receta_id)
                  const costoPorc = recetaSel ? recetaSel.food_cost.costo_porcion : 0
                  return (
                    <>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={lblStyle}>Receta de origen</span>
                        <select
                          value={form.receta_id}
                          onChange={e => {
                            const r = recetas.find(x => x.id === e.target.value)
                            const c = r ? r.food_cost.costo_porcion : 0
                            setForm(f => ({
                              ...f,
                              receta_id: e.target.value,
                              // El costo se toma de la receta (costo por porción)
                              precio_unitario: c > 0 ? String(Math.round(c * 100) / 100) : f.precio_unitario,
                            }))
                          }}
                          style={{ ...inputStyle, appearance: 'auto', cursor: 'pointer' }}
                        >
                          <option value="">Elegir receta…</option>
                          {recetas.map(r => (
                            <option key={r.id} value={r.id}>{r.nombre}</option>
                          ))}
                        </select>
                      </label>
                      {recetaSel && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', borderRadius: 8, padding: '8px 10px' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
                            Costo desde receta ({recetaSel.porciones ?? 1} porc.)
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>
                            {fmtPrecio(costoPorc)}/porción
                          </span>
                        </div>
                      )}
                      {form.receta_id && (
                        <button
                          onClick={() => {
                            const r = recetas.find(x => x.id === form.receta_id)
                            const c = r ? r.food_cost.costo_porcion : 0
                            if (c > 0) setForm(f => ({ ...f, precio_unitario: String(Math.round(c * 100) / 100) }))
                          }}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'none', border: '1px solid rgba(16,185,129,.4)', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#10b981', fontFamily: 'inherit' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>refresh</span>
                          Recalcular costo desde la receta
                        </button>
                      )}
                    </>
                  )
                })()}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={lblStyle}>Stock actual</span>
                  <input type="number" min="0" value={form.stock_actual} onChange={e => setForm(f => ({ ...f, stock_actual: e.target.value }))} style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ ...lblStyle, color: 'rgba(245,158,11,.9)' }}>Mínimo</span>
                  <input type="number" min="0" value={form.stock_minimo} onChange={e => setForm(f => ({ ...f, stock_minimo: e.target.value }))} style={{ ...inputStyle, borderColor: 'rgba(245,158,11,.4)' }} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ ...lblStyle, color: 'rgba(239,68,68,.9)' }}>Crítico</span>
                  <input type="number" min="0" value={form.stock_critico} onChange={e => setForm(f => ({ ...f, stock_critico: e.target.value }))} style={{ ...inputStyle, borderColor: 'rgba(239,68,68,.4)' }} />
                </label>
              </div>

              {/* ── Unidad de compra (colapsable) ── */}
              <button
                onClick={() => setShowUnidadCompra(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', color: 'var(--text-2)', fontFamily: 'inherit' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {showUnidadCompra ? 'expand_less' : 'expand_more'}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Unidad de compra (opcional)</span>
              </button>

              {showUnidadCompra && (
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)' }}>
                    Ej: comprás 1 caja de 100 unidades → el stock se lleva en unidades
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={lblStyle}>Unidad de compra</span>
                      <input
                        value={form.unidad_compra}
                        onChange={e => setForm(f => ({ ...f, unidad_compra: e.target.value }))}
                        placeholder="caja, pack, bolsa…"
                        style={inputStyle}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={lblStyle}>Cantidad por envase</span>
                      <input
                        type="number" min="1" step="1"
                        value={form.cantidad_por_envase}
                        onChange={e => setForm(f => ({ ...f, cantidad_por_envase: e.target.value }))}
                        placeholder="100"
                        style={inputStyle}
                      />
                    </label>
                  </div>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={lblStyle}>Unidad de uso (stock se mide en)</span>
                    <select
                      value={form.unidad_uso}
                      onChange={e => setForm(f => ({ ...f, unidad_uso: e.target.value }))}
                      style={{ ...inputStyle, appearance: 'auto', cursor: 'pointer' }}
                    >
                      <option value="">Misma que unidad principal</option>
                      {UNIDADES_USO.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </div>

            <button
              data-shortcut="save"
              onClick={handleSave}
              disabled={saving}
              style={{ marginTop: 20, width: '100%', background: 'var(--navy)', border: 'none', borderRadius: 10, padding: '13px 16px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'inherit' }}
            >
              {saving ? 'Guardando…' : editingProducto ? 'Guardar cambios' : 'Agregar producto'}
            </button>
          </div>
        </div>
      )}

      {/* ── Nueva categoría modal ── */}
      {newCatModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 16px' }}>Nueva categoría</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                value={newCatNombre}
                onChange={e => setNewCatNombre(e.target.value)}
                placeholder="Ej: Congelados, Especias…"
                autoFocus
                style={inputStyle}
                onKeyDown={e => { if (e.key === 'Enter') handleNewCat() }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>Color</span>
                <input
                  type="color"
                  value={newCatColor}
                  onChange={e => setNewCatColor(e.target.value)}
                  style={{ width: 40, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0 }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setNewCatModal(false)} style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 11, fontSize: 13, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={handleNewCat} disabled={newCatSaving || !newCatNombre.trim()} style={{ flex: 1, background: 'var(--navy)', border: 'none', borderRadius: 10, padding: 11, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: !newCatNombre.trim() ? 0.5 : 1 }}>
                {newCatSaving ? 'Guardando…' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Merma bottom sheet ── */}
      <MermaBottomSheet
        open={mermaOpen}
        onClose={() => setMermaOpen(false)}
        onRegistrar={async (data) => {
          await registrarMerma(data)
          setMermaOpen(false)
        }}
        prefill={mermaPrefill}
      />

      {/* ── Sector selector ── */}
      {showSectorSelect && (
        <SheetChrome>
        <div onClick={() => setShowSectorSelect(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 16px 0', flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 16px' }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>¿Qué sector vas a stockear?</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>Filtrá por sector para agilizar el recorrido</div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '0 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => { const list = sortByEstado(filtered); setQuickSector(null); setQuickOrder(list.map(p => p.id)); setQuickIdx(0); setQuickChangedCount(0); setQuickValue(String(list[0]?.stock_actual ?? '')); setQuickMode(true); setShowSectorSelect(false) }}
                style={{ padding: '13px 16px', borderRadius: 12, background: 'var(--navy)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>inventory_2</span>
                Todo el stock ({filtered.length} productos)
              </button>
              {categoriasFiltro.map(cat => {
                const count = filtered.filter(p => p.categoria === cat).length
                const criticos = filtered.filter(p => p.categoria === cat && p.estado === 'critico').length
                return (
                  <button key={cat}
                    onClick={() => { const list = sortByEstado(filtered.filter(p => p.categoria === cat)); setQuickSector(cat); setQuickOrder(list.map(p => p.id)); setQuickIdx(0); setQuickChangedCount(0); setQuickValue(String(list[0]?.stock_actual ?? '')); setQuickMode(true); setShowSectorSelect(false) }}
                    style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <span style={{ color: 'var(--text-1)' }}>{cat}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {criticos > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,.1)', padding: '2px 7px', borderRadius: 99 }}>{criticos} crítico{criticos > 1 ? 's' : ''}</span>}
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{count} prod.</span>
                    </span>
                  </button>
                )
              })}
            </div>
            </div>
            <div style={{ padding: '8px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', flexShrink: 0 }}>
              <button onClick={() => setShowSectorSelect(false)} style={{ width: '100%', padding: 12, borderRadius: 12, background: 'transparent', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
        </SheetChrome>
      )}

      {/* ── Quick stock mode ── */}
      {quickMode && quickItems.length > 0 && (() => {
        const p = quickItems[quickIdx]
        if (!p) { setQuickMode(false); return null }
        const enteredVal = parseFloat(quickValue)
        const diff = !isNaN(enteredVal) && enteredVal !== p.stock_actual ? enteredVal - p.stock_actual : null
        const isLast = quickIdx === quickItems.length - 1

        function saveAndNext(skip = false) {
          if (!skip) {
            const v = parseFloat(quickValue)
            if (!isNaN(v) && v >= 0) {
              actualizarStock(p.id, v)
              setQuickChangedCount(c => c + 1)
            }
          }
          if (!isLast) {
            const next = quickIdx + 1
            setQuickIdx(next)
            setQuickValue(String(quickItems[next]?.stock_actual ?? ''))
            setTimeout(() => { quickRef.current?.focus(); quickRef.current?.select() }, 30)
          } else {
            setQuickMode(false)
            setShowQuickSummary(true)
            setTimeout(() => setShowQuickSummary(false), 3000)
          }
        }

        return (
          <SheetChrome>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onPointerDown={e => { e.preventDefault(); setQuickMode(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.7)', fontSize: 22 }}>close</span>
                  </button>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Stock rápido</div>
                    {quickSector && <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>{quickSector}</div>}
                  </div>
                </div>
                <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, fontWeight: 600 }}>{quickIdx + 1}/{quickItems.length}</span>
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,.15)', borderRadius: 99, marginTop: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#22c55e', borderRadius: 99, width: `${((quickIdx + 1) / quickItems.length) * 100}%`, transition: 'width .3s' }} />
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 24px 0', gap: 12 }}>
              {p.estado === 'critico' && <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,.1)', padding: '3px 10px', borderRadius: 99 }}>CRÍTICO</span>}
              {p.estado === 'bajo' && <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,.1)', padding: '3px 10px', borderRadius: 99 }}>BAJO</span>}
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)', textAlign: 'center', lineHeight: 1.2 }}>{p.nombre}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{p.categoria}</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                Actual: <b style={{ fontFamily: "'DM Mono', monospace" }}>{p.stock_actual} {p.unidad_uso ?? p.unidad}</b>
                <span style={{ color: 'var(--text-3)', margin: '0 6px' }}>·</span>Mín: {p.stock_minimo}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ position: 'relative' }}>
                  <input
                    ref={quickRef}
                    type="number"
                    inputMode="decimal"
                    value={quickValue}
                    onChange={e => setQuickValue(e.target.value)}
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); saveAndNext() }
                      if (e.key === 'Escape') { e.preventDefault(); setQuickMode(false) }
                    }}
                    style={{ width: 160, padding: '12px 16px', borderRadius: 16, border: `2px solid ${diff !== null ? (diff > 0 ? '#22c55e' : '#ef4444') : 'var(--navy)'}`, background: 'var(--surface)', fontSize: 44, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: 'var(--text-1)', textAlign: 'center', outline: 'none', transition: 'border-color .15s' }}
                  />
                  {diff !== null && (
                    <div style={{ position: 'absolute', top: -10, right: -14, background: diff > 0 ? '#22c55e' : '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '2px 8px' }}>
                      {diff > 0 ? '+' : ''}{diff % 1 === 0 ? diff : diff.toFixed(1)} {p.unidad_uso ?? p.unidad}
                    </div>
                  )}
                </div>
                <button
                  onPointerDown={e => { e.preventDefault(); saveAndNext() }}
                  style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--navy)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, boxShadow: '0 4px 14px rgba(28,45,74,.35)' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 30, color: '#fff' }}>{isLast ? 'check' : 'arrow_forward'}</span>
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>en {p.unidad_uso ?? p.unidad}</div>
            </div>

            <div style={{ padding: '16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                onPointerDown={e => { e.preventDefault(); if (quickIdx > 0) { const prev = quickIdx - 1; setQuickIdx(prev); setQuickValue(String(quickItems[prev]?.stock_actual ?? '')); setTimeout(() => { quickRef.current?.focus(); quickRef.current?.select() }, 30) } }}
                disabled={quickIdx === 0}
                title="Volver al producto anterior para corregir un peso mal cargado"
                style={{ flex: 1, minWidth: 0, height: 48, borderRadius: 10, background: quickIdx > 0 ? 'rgba(67,97,160,.12)' : 'var(--surface)', border: `1px solid ${quickIdx > 0 ? 'var(--accent)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '0 8px', fontSize: 13, fontWeight: 700, color: quickIdx > 0 ? 'var(--accent)' : 'var(--text-3)', fontFamily: 'inherit', cursor: quickIdx > 0 ? 'pointer' : 'default', opacity: quickIdx > 0 ? 1 : 0.4 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18, flexShrink: 0 }}>undo</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {quickIdx > 0 ? `Corregir: ${quickItems[quickIdx - 1]?.nombre ?? 'anterior'}` : 'Atrás'}
                </span>
              </button>
              <button
                onPointerDown={e => { e.preventDefault(); saveAndNext(true) }}
                style={{ flex: 1, height: 48, borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Saltar
              </button>
              <button
                onPointerDown={e => { e.preventDefault(); saveAndNext() }}
                style={{ flex: 2, height: 48, borderRadius: 10, background: 'var(--navy)', border: 'none', fontSize: 15, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {isLast ? 'Finalizar ✓' : 'Guardar →'}
              </button>
            </div>
          </div>
          </SheetChrome>
        )
      })()}

      {showQuickSummary && (
        <div style={{ position: 'fixed', bottom: 'var(--toast-bottom)', left: '50%', transform: 'translateX(-50%)', zIndex: 200, background: 'var(--navy)', color: '#fff', borderRadius: 12, padding: '10px 20px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
          {quickChangedCount} producto{quickChangedCount !== 1 ? 's' : ''} actualizados
        </div>
      )}

      {sugToast && (
        <div style={{ position: 'fixed', bottom: 'var(--toast-bottom)', left: '50%', transform: 'translateX(-50%)', zIndex: 200, background: '#10b981', color: '#fff', borderRadius: 12, padding: '10px 20px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
          {sugToast}
        </div>
      )}

      {/* ── Modal: Sugerir mínimos ── */}
      {showSugerir && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,.6)' }}
          onClick={() => !sugApplying && setShowSugerir(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,.4)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Sugerir mínimos</h3>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-3)' }}>Calculado desde la frecuencia y cantidad de compra</p>
              </div>
              <button onClick={() => !sugApplying && setShowSugerir(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-2)' }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div style={{ overflow: 'auto', flex: 1, padding: sugLoading || sugerencias.length === 0 ? 24 : '8px 12px' }}>
              {sugLoading ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-2)', fontSize: 13 }}>Analizando compras…</div>
              ) : sugerencias.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)', fontSize: 13 }}>
                  No hay suficientes compras repetidas para sugerir mínimos. Cargá más facturas (al menos 2 entregas por producto) y volvé a intentar.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>
                    <span>{sugSelected.size} de {sugerencias.length} seleccionados</span>
                    <button onClick={() => setSugSelected(sugSelected.size === sugerencias.length ? new Set() : new Set(sugerencias.map(s => s.id)))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>
                      {sugSelected.size === sugerencias.length ? 'Ninguno' : 'Todos'}
                    </button>
                  </div>
                  {sugerencias.map(s => {
                    const sel = sugSelected.has(s.id)
                    return (
                      <button key={s.id} onClick={() => setSugSelected(prev => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n })}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <input type="checkbox" checked={sel} readOnly style={{ width: 16, height: 16, accentColor: 'var(--navy)', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.nombre}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{s.entregas} entregas registradas</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(245,158,11,.95)' }}>mín {s.sugerido_minimo} {s.unidad}</div>
                          <div style={{ fontSize: 10, color: 'rgba(239,68,68,.9)' }}>crít {s.sugerido_critico} {s.unidad}</div>
                        </div>
                      </button>
                    )
                  })}
                </>
              )}
            </div>

            {sugerencias.length > 0 && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                <button onClick={aplicarSugerencias} disabled={sugApplying || sugSelected.size === 0}
                  style={{ width: '100%', background: 'var(--navy)', border: 'none', borderRadius: 10, padding: '12px 16px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', opacity: (sugApplying || sugSelected.size === 0) ? 0.6 : 1, fontFamily: 'inherit' }}>
                  {sugApplying ? 'Aplicando…' : `Aplicar a ${sugSelected.size} producto${sugSelected.size !== 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteId && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }} onClick={() => setDeleteId(null)} />
          <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 16, padding: 24, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,.4)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>Eliminar producto</h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 20px' }}>Esta acción desactiva el producto. ¿Confirmás?</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteId(null)} style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={handleDelete} style={{ flex: 1, background: '#ef4444', border: 'none', borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Importador Excel ── */}
      {showImportador && (
        <ImportadorArchivo
          tipo="stock"
          restauranteId={RESTAURANTE_ID}
          onImportCompleto={(n) => { setShowImportador(false); refetch() }}
          onClose={() => setShowImportador(false)}
        />
      )}

      {/* ── Rebuild Stock desde facturas ── */}
      {showRebuildModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,.6)' }}
          onClick={() => !rebuildLoading && setShowRebuildModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,.4)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-1)' }}>
                Reconstruir stock desde facturas
              </h3>
              <button onClick={() => !rebuildLoading && setShowRebuildModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-2)' }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div style={{ overflow: 'auto', flex: 1, padding: 20 }}>
              {rebuildLoading && !rebuildPreview && (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-2)' }}>
                  Analizando facturas…
                </div>
              )}

              {rebuildResult && (
                <div style={{ background: 'rgba(22,101,52,.1)', border: '1px solid rgba(22,101,52,.3)', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#166534', marginBottom: 8 }}>
                    ✓ Rebuild completado
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-1)', fontSize: 13, lineHeight: 1.7 }}>
                    <li>{rebuildResult.productos_borrados} productos viejos eliminados</li>
                    <li>{rebuildResult.productos_creados} productos creados con precio real</li>
                    <li>{rebuildResult.proveedores_creados} proveedores nuevos</li>
                    <li>{rebuildResult.ingredientes_vinculados} ingredientes vinculados al stock</li>
                  </ul>
                </div>
              )}

              {rebuildPreview && !rebuildResult && (
                <>
                  {rebuildPreview.message && (
                    <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: 14, marginBottom: 16, color: '#991b1b', fontSize: 13 }}>
                      {rebuildPreview.message}
                    </div>
                  )}
                  {!rebuildPreview.message && rebuildPreview.total_productos === 0 && (
                    <div style={{ background: 'rgba(67,97,160,.08)', border: '1px solid rgba(67,97,160,.3)', borderRadius: 10, padding: 14, marginBottom: 16, color: 'var(--text-1)', fontSize: 13 }}>
                      No se detectaron productos importables desde las facturas cargadas. Asegurate de tener facturas con items de productos.
                    </div>
                  )}
                  {rebuildPreview.total_productos > 0 && (
                    <>
                      <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
                        Vas a <b style={{ color: '#991b1b' }}>borrar {productos.length} productos actuales</b> y crear:
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                        <div style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{rebuildPreview.total_productos}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Productos</div>
                        </div>
                        <div style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{rebuildPreview.total_proveedores_nuevos}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Proveedores nuevos</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>Vista previa (primeros 10):</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {rebuildPreview.productos.slice(0, 10).map((p, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg)', borderRadius: 8, fontSize: 12 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{p.nombre}</div>
                              <div style={{ color: 'var(--text-3)', fontSize: 11 }}>
                                {p.categoria} · {p.proveedor_nombre || 'sin proveedor'}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 700, color: 'var(--text-1)' }}>${p.precio_unitario.toLocaleString('es-AR')}/{p.unidad}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowRebuildModal(false)} disabled={rebuildLoading}
                style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-1)', cursor: rebuildLoading ? 'wait' : 'pointer', fontWeight: 600 }}>
                {rebuildResult ? 'Cerrar' : 'Cancelar'}
              </button>
              {rebuildPreview && !rebuildResult && rebuildPreview.total_productos > 0 && (
                <button
                  onClick={async () => {
                    setRebuildLoading(true)
                    try {
                      const res = await fetch('/api/stock/rebuild', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ restaurante_id: RESTAURANTE_ID, confirm: true }),
                      })
                      const data = await res.json()
                      if (res.ok) {
                        setRebuildResult(data)
                        refetch()
                      } else {
                        alert(data.error || 'Error al ejecutar rebuild')
                      }
                    } catch (e) {
                      alert(e instanceof Error ? e.message : 'Error')
                    }
                    setRebuildLoading(false)
                  }}
                  disabled={rebuildLoading}
                  style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: '#991b1b', color: 'white', cursor: rebuildLoading ? 'wait' : 'pointer', fontWeight: 600, opacity: rebuildLoading ? 0.6 : 1 }}>
                  {rebuildLoading ? 'Procesando…' : 'Borrar y reconstruir'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Paste desde Excel ── */}
      {pasteRows.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.65)', padding: 24 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,.5)' }}>

            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)' }}>table_view</span>
                  Pegar desde Excel
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
                  {pasteRows.length} producto{pasteRows.length !== 1 ? 's' : ''} detectado{pasteRows.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={() => { setPasteRows([]); setPasteResult(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', display: 'flex' }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Resultado */}
            {pasteResult && (
              <div style={{ padding: '10px 20px', background: pasteResult.err === 0 ? 'rgba(22,163,74,.08)' : 'rgba(245,158,11,.08)', borderBottom: '1px solid var(--border)', fontSize: 13, color: pasteResult.err === 0 ? '#166534' : '#92400e', fontWeight: 600 }}>
                {pasteResult.ok > 0 && `✓ ${pasteResult.ok} producto${pasteResult.ok !== 1 ? 's' : ''} importado${pasteResult.ok !== 1 ? 's' : ''}. `}
                {pasteResult.err > 0 && `⚠ ${pasteResult.err} error${pasteResult.err !== 1 ? 's' : ''}.`}
              </div>
            )}

            {/* Tabla preview */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', position: 'sticky', top: 0 }}>
                    {['Nombre', 'Precio', 'Stock', 'Unidad'].map(h => (
                      <th key={h} style={{ padding: '8px 16px', textAlign: h === 'Nombre' || h === 'Unidad' ? 'left' : 'right', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pasteRows.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
                      <td style={{ padding: '9px 16px', fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}>{r.nombre}</td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontSize: 12, fontFamily: "'DM Mono', monospace", color: r.precio != null ? 'var(--text-1)' : 'var(--text-3)' }}>
                        {r.precio != null ? `$${r.precio.toLocaleString('es-AR')}` : '—'}
                      </td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontSize: 12, fontFamily: "'DM Mono', monospace", color: r.stock != null ? 'var(--text-1)' : 'var(--text-3)' }}>
                        {r.stock != null ? r.stock : '—'}
                      </td>
                      <td style={{ padding: '9px 16px', fontSize: 12, color: 'var(--text-2)' }}>{r.unidad ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Acciones */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)', flex: 1 }}>
                Columnas: Nombre · Precio · Stock · Unidad (con o sin encabezados)
              </span>
              <button
                onClick={() => { setPasteRows([]); setPasteResult(null) }}
                style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-1)', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', fontSize: 13 }}
              >
                {pasteResult ? 'Cerrar' : 'Cancelar'}
              </button>
              {!pasteResult && (
                <button
                  onClick={async () => {
                    setPasteLoading(true)
                    let ok = 0, err = 0
                    for (const r of pasteRows) {
                      try {
                        await agregarProducto({
                          nombre: r.nombre,
                          categoria: '',
                          unidad: r.unidad ?? 'kg',
                          stock_actual: r.stock ?? 0,
                          stock_minimo: 0,
                          stock_critico: 0,
                          activo: true,
                          proveedor_id: null,
                          precio_unitario: r.precio ?? 0,
                          unidad_compra: null,
                          cantidad_por_envase: null,
                          unidad_uso: null,
                        })
                        ok++
                      } catch { err++ }
                    }
                    setPasteResult({ ok, err })
                    setPasteLoading(false)
                    if (ok > 0) refetch()
                  }}
                  disabled={pasteLoading}
                  style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: 'var(--navy)', color: '#fff', cursor: pasteLoading ? 'wait' : 'pointer', fontWeight: 700, fontFamily: 'inherit', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, opacity: pasteLoading ? 0.7 : 1 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
                  {pasteLoading ? 'Importando…' : `Importar ${pasteRows.length} producto${pasteRows.length !== 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ── Carrito de compras ── */}
      {isAdmin && (
        <CarritoCompras
          cart={cart}
          proveedores={proveedores}
          onUpdateQty={updateCartQty}
          onRemove={removeFromCart}
          onClear={() => { setCart([]); setCartOpen(false) }}
          onConfirm={confirmarPedidos}
          open={cartOpen}
          onToggle={setCartOpen}
        />
      )}

      {/* ── File input planilla (siempre montado) ── */}
      <input
        ref={planillaFileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handlePlanillaFile}
      />

      {/* ── Modal import planilla de stock ── */}
      {showPlanillaImport && (
        <div
          onClick={() => { if (planillaStage !== 'saving') setShowPlanillaImport(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 300, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg)', borderRadius: '20px 20px 0 0', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
          >
            {/* Header del modal */}
            <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)' }}>table_chart</span>
                  <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Importar planilla de stock</p>
                </div>
                {planillaStage !== 'saving' && (
                  <button onClick={() => setShowPlanillaImport(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-2)', display: 'flex' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
                  </button>
                )}
              </div>
            </div>

            {/* Contenido */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '16px' }}>

              {/* ── Estado: loading / error ── */}
              {(planillaStage === 'loading' || planillaStage === 'saving') && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '40px 0' }}>
                  {planillaError ? (
                    <>
                      <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#ef4444' }}>error</span>
                      <p style={{ color: 'var(--text-1)', fontWeight: 600, textAlign: 'center' }}>{planillaError}</p>
                      <button onClick={() => { setPlanillaError(null); planillaFileRef.current?.click() }} style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                        Elegir otro archivo
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined animate-spin" style={{ fontSize: 40, color: 'var(--accent)' }}>progress_activity</span>
                      <p style={{ color: 'var(--text-2)', fontSize: 14, textAlign: 'center' }}>
                        {planillaStage === 'saving' ? 'Guardando en KitchenOS…' : 'Leyendo planilla con IA…'}
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* ── Estado: done ── */}
              {planillaStage === 'done' && planillaResult && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '32px 0' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 52, color: '#10b981' }}>check_circle</span>
                  <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Stock actualizado</p>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 20px' }}>
                      <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)' }}>{planillaResult.updated}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Actualizados</p>
                    </div>
                    <div style={{ textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 20px' }}>
                      <p style={{ fontSize: 28, fontWeight: 800, color: '#10b981' }}>{planillaResult.created}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Nuevos</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowPlanillaImport(false)}
                    style={{ padding: '10px 28px', borderRadius: 10, border: 'none', background: 'var(--navy)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
                  >
                    Listo
                  </button>
                </div>
              )}

              {/* ── Estado: preview ── */}
              {planillaStage === 'preview' && (() => {
                const nExacto = planillaItems.filter(i => i.confianza === 'exacto').length
                const nParcial = planillaItems.filter(i => i.confianza === 'parcial').length
                const nNuevo = planillaItems.filter(i => i.confianza === 'nuevo').length
                const nSelected = planillaItems.filter(i => i.selected).length

                const filteredItems = planillaItems.filter(i => {
                  if (planillaFilter === 'actualizar') return i.confianza !== 'nuevo'
                  if (planillaFilter === 'nuevo') return i.confianza === 'nuevo'
                  return true
                })

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Resumen */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 80, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                        <p style={{ fontSize: 20, fontWeight: 800, color: '#15803d' }}>{nExacto}</p>
                        <p style={{ fontSize: 10, color: '#15803d', fontWeight: 700, textTransform: 'uppercase' }}>Exactos</p>
                      </div>
                      <div style={{ flex: 1, minWidth: 80, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                        <p style={{ fontSize: 20, fontWeight: 800, color: '#92400e' }}>{nParcial}</p>
                        <p style={{ fontSize: 10, color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>Similares</p>
                      </div>
                      <div style={{ flex: 1, minWidth: 80, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                        <p style={{ fontSize: 20, fontWeight: 800, color: '#1d4ed8' }}>{nNuevo}</p>
                        <p style={{ fontSize: 10, color: '#1d4ed8', fontWeight: 700, textTransform: 'uppercase' }}>Nuevos</p>
                      </div>
                    </div>

                    {/* Error inline */}
                    {planillaError && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 12px', color: '#991b1b', fontSize: 13 }}>
                        {planillaError}
                      </div>
                    )}

                    {/* Filtros */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['todos', 'actualizar', 'nuevo'] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => setPlanillaFilter(f)}
                          style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: planillaFilter === f ? 'var(--accent)' : 'var(--surface)', color: planillaFilter === f ? '#fff' : 'var(--text-2)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}
                        >
                          {f === 'todos' ? `Todos (${planillaItems.length})` : f === 'actualizar' ? `Actualizar (${nExacto + nParcial})` : `Nuevos (${nNuevo})`}
                        </button>
                      ))}
                      <button
                        onClick={() => setPlanillaItems(prev => prev.map(i => ({ ...i, selected: !prev.every(x => x.selected) })))}
                        style={{ marginLeft: 'auto', padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        {planillaItems.every(i => i.selected) ? 'Deselect todo' : 'Select todo'}
                      </button>
                    </div>

                    {/* Lista */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {filteredItems.map((item, idx) => {
                        const realIdx = planillaItems.indexOf(item)
                        const confColor = item.confianza === 'exacto' ? '#15803d' : item.confianza === 'parcial' ? '#92400e' : '#1d4ed8'
                        const confBg = item.confianza === 'exacto' ? '#f0fdf4' : item.confianza === 'parcial' ? '#fffbeb' : '#eff6ff'
                        const confBorder = item.confianza === 'exacto' ? '#86efac' : item.confianza === 'parcial' ? '#fde68a' : '#bfdbfe'
                        const confLabel = item.confianza === 'exacto' ? '✓' : item.confianza === 'parcial' ? '~' : '+'

                        return (
                          <div
                            key={idx}
                            onClick={() => setPlanillaItems(prev => prev.map((x, i) => i === realIdx ? { ...x, selected: !x.selected } : x))}
                            style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, border: `1px solid ${item.selected ? confBorder : 'var(--border)'}`, background: item.selected ? confBg : 'var(--surface)', cursor: 'pointer', opacity: item.selected ? 1 : 0.45, transition: 'opacity .15s' }}
                          >
                            <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${item.selected ? confColor : 'var(--border)'}`, background: item.selected ? confColor : 'transparent', flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {item.selected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{item.nombre}</p>
                                <span style={{ fontSize: 10, fontWeight: 800, color: confColor, background: confBg, border: `1px solid ${confBorder}`, borderRadius: 5, padding: '1px 5px' }}>{confLabel} {item.confianza}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{item.hoja}</span>
                              </div>
                              {item.producto_nombre && item.confianza !== 'exacto' && (
                                <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '2px 0 0' }}>→ {item.producto_nombre}</p>
                              )}
                              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                                {item.stock_actual !== null && (
                                  <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0 }}>Actual: <b>{item.stock_actual}</b> {item.unidad ?? ''}</p>
                                )}
                                {item.stock_minimo !== null && (
                                  <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0 }}>Mín: <b>{item.stock_minimo}</b></p>
                                )}
                                {item.stock_critico !== null && (
                                  <p style={{ fontSize: 11, color: '#ef4444', margin: 0 }}>Crít: <b>{item.stock_critico}</b></p>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Footer con botón guardar */}
            {planillaStage === 'preview' && (
              <div style={{ padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                <button
                  onClick={handlePlanillaGuardar}
                  disabled={planillaItems.filter(i => i.selected).length === 0}
                  style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: planillaItems.filter(i => i.selected).length === 0 ? 'not-allowed' : 'pointer', opacity: planillaItems.filter(i => i.selected).length === 0 ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span>
                  Guardar {planillaItems.filter(i => i.selected).length} productos en stock
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </PageTransition>
  )
}

// ── Shared styles ──
const inputStyle: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '9px 10px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

const lblStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-2)',
  textTransform: 'uppercase', letterSpacing: '.06em',
}

const thStyle: React.CSSProperties = {
  padding: '7px 4px', fontSize: 9, fontWeight: 700,
  color: 'rgba(255,255,255,.45)', textTransform: 'uppercase',
  letterSpacing: '.07em', textAlign: 'center',
}
