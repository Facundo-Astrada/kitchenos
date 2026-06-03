'use client'

import PageTransition from '@/components/PageTransition'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useStock, type ProductoConEstado } from '@/lib/hooks/useStock'
import { useCategoriasProducto } from '@/lib/hooks/useCategoriasProducto'
import { usePermisos } from '@/lib/hooks/usePermisos'
import PageHeader from '@/components/shell/PageHeader'
import ActionButton from '@/components/shell/ActionButton'
import MermaBottomSheet from '@/components/merma/MermaBottomSheet'
import { useMerma } from '@/lib/hooks/useMerma'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import ImportadorArchivo, { UndoBanner } from '@/components/importador/ImportadorArchivo'
import { exportarExcel, fechaArchivo } from '@/lib/exportar'
import type { MisePlaceItem, MisePlaceRegistro } from '@/types'

const UNIDADES = ['kg', 'g', 'L', 'ml', 'unidad', 'docena', 'caja', 'bolsa', 'lata', 'botella']
const UNIDADES_USO = ['kg', 'g', 'l', 'ml', 'unidad']

type FiltroEstado = 'all' | 'critico' | 'bajo' | 'pendiente'
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
  const { categorias, agregarCategoria } = useCategoriasProducto()
  const { puedeEditar, puedeEliminar, isAdmin } = usePermisos()
  const canEdit = isAdmin || puedeEditar('stock')

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

  // Filters
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<FiltroEstado>('all')
  const [sortMode, setSortMode] = useState<SortMode>('default')

  // Inline stock edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Add/edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProducto, setEditingProducto] = useState<ProductoConEstado | null>(null)
  const [form, setForm] = useState<FormData>(FORM_EMPTY)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [showUnidadCompra, setShowUnidadCompra] = useState(false)

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
  const [showQuickSummary, setShowQuickSummary] = useState(false)

  // Merma
  const { registrarMerma } = useMerma()
  const [mermaOpen, setMermaOpen] = useState(false)
  const [mermaPrefill, setMermaPrefill] = useState<{ producto_nombre?: string; producto_id?: string; unidad?: string } | undefined>()

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

  // Filtered + sorted list
  const filtered = useMemo(() => {
    let list = productos
    if (estadoFilter === 'pendiente') {
      list = productos.filter(p => p.stock_actual === 0 && p.precio_unitario === 0)
    } else if (estadoFilter !== 'all') {
      list = list.filter(p => p.estado === estadoFilter)
    }
    if (catFilter) list = list.filter(p => p.categoria === catFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(p => p.nombre.toLowerCase().includes(q))
    }
    if (sortMode === 'valor_desc') {
      list = [...list].sort((a, b) => valorStock(b) - valorStock(a))
    }
    return list
  }, [productos, estadoFilter, catFilter, search, sortMode])

  const totalValor = useMemo(() =>
    filtered.reduce((acc, p) => acc + valorStock(p), 0),
    [filtered]
  )

  const nCritico = useMemo(() => productos.filter(p => p.estado === 'critico').length, [productos])
  const nBajo = useMemo(() => productos.filter(p => p.estado === 'bajo').length, [productos])
  const nPendiente = useMemo(() => productos.filter(p => p.stock_actual === 0 && p.precio_unitario === 0).length, [productos])

  useEffect(() => {
    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'stock',
      total: productos.length,
      criticos: nCritico,
      bajos: nBajo,
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [productos.length, nCritico, nBajo])

  // Quick mode: lista filtrada por sector, críticos/bajos primero
  const quickList = useMemo(() => {
    const base = quickSector ? filtered.filter(p => p.categoria === quickSector) : filtered
    return [...base].sort((a, b) => {
      const order = { critico: 0, bajo: 1, ok: 2 }
      return (order[a.estado as keyof typeof order] ?? 2) - (order[b.estado as keyof typeof order] ?? 2)
    })
  }, [filtered, quickSector])

  function openMerma(p: ProductoConEstado) {
    setMermaPrefill({ producto_nombre: p.nombre, producto_id: p.id, unidad: p.unidad })
    setMermaOpen(true)
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
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
            <button
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
            <ActionButton icon="table_view" label="Excel" variant="secondary" onClick={exportXLSX} />
            <ActionButton icon="picture_as_pdf" label="PDF" variant="secondary" onClick={exportPDF} />
            <button
              onClick={() => setShowImportador(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 8, background: 'rgba(255,255,255,.15)', color: '#fff', border: '1px solid rgba(255,255,255,.25)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload_file</span>
              Importar
            </button>
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
              onClick={() => setShowSectorSelect(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 8, background: '#fff', color: 'var(--navy)', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>speed</span>
              Stockear
            </button>
          </div>
        }
        below={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 6 }}>
              {(['insumos', 'producciones'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', transition: 'all .15s',
                    background: activeTab === tab ? '#fff' : 'rgba(255,255,255,.1)',
                    color: activeTab === tab ? 'var(--navy)' : 'rgba(255,255,255,.6)',
                  }}>
                  {tab === 'insumos' ? 'Insumos' : 'Producciones'}
                </button>
              ))}
            </div>
            {/* Insumos filters */}
            {activeTab === 'insumos' && (
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, padding: '0 10px', height: 32, flex: 1 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'rgba(255,255,255,.4)' }}>search</span>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar producto..."
                    style={{ border: 'none', background: 'none', outline: 'none', fontSize: 12, fontFamily: 'inherit', color: '#fff', width: '100%' }}
                  />
                  {search && (
                    <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.5)', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                  )}
                </div>
                <select
                  value={catFilter}
                  onChange={e => setCatFilter(e.target.value)}
                  style={{ height: 32, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, padding: '0 8px', fontSize: 11, fontFamily: 'inherit', color: '#fff', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="">Todas</option>
                  {categoriasFiltro.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
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

      {/* ── Insumos: fixed table header ── */}
      {activeTab === 'insumos' && (
      <div style={{ background: '#2d4070', flexShrink: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 26 }} />
            <col />
            <col style={{ width: 62 }} />
            <col style={{ width: 68 }} />
            <col style={{ width: 52 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={thStyle}>#</th>
              <th style={{ ...thStyle, textAlign: 'left', paddingLeft: 8, color: 'rgba(255,255,255,.7)' }}>Producto</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Precio</th>
              <th style={{ ...thStyle, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.9)' }}>Stock</th>
              <th style={thStyle}>Estado</th>
            </tr>
          </thead>
        </table>
      </div>
      )}

      {/* ── Scrollable body (insumos) ── */}
      {activeTab === 'insumos' && (
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {loading ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--text-3)', display: 'block', marginBottom: 8 }}>hourglass_empty</span>
            <p style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>Cargando inventario…</p>
          </div>
        ) : error ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#ef4444', display: 'block', marginBottom: 8 }}>error</span>
            <p style={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#94a3b8' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{productos.length === 0 ? 'Sin productos aún' : 'Sin resultados'}</div>
            {productos.length === 0 && <p style={{ fontSize: 11, marginTop: 6, color: '#64748b' }}>Los productos se agregan automáticamente al cargar facturas</p>}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 26 }} />
              <col />
              <col style={{ width: 62 }} />
              <col style={{ width: 68 }} />
              <col style={{ width: 52 }} />
            </colgroup>
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
                      cursor: 'default',
                    }}
                  >
                    <td style={{ padding: '8px 4px', fontSize: 10, color: 'var(--text-3)', textAlign: 'center', fontFamily: "'DM Mono', monospace" }}>
                      {i + 1}
                    </td>
                    <td style={{ padding: '8px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.2 }}>{p.nombre}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
                            {p.categoria} · {p.unidad_uso ?? p.unidad}
                          </div>
                          {val > 0 && isAdmin && (
                            <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, marginTop: 1, fontFamily: "'DM Mono', monospace" }}>
                              {fmtValor(val)}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); openMerma(p) }}
                          title="Registrar merma"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, marginTop: -2 }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>delete_sweep</span>
                        </button>
                      </div>
                    </td>
                    {isAdmin && (
                    <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                      <span style={{ fontSize: 10, fontWeight: 500, fontFamily: "'DM Mono', monospace", color: 'var(--text-3)', opacity: 0.7 }}>
                        {fmtPrecio(p.precio_unitario)}
                      </span>
                    </td>
                    )}
                    <td style={{ padding: '8px 4px', textAlign: 'center', background: 'rgba(255,255,255,.02)' }}>
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
                          style={{ width: 60, textAlign: 'center', fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono', monospace", background: 'var(--navy)', color: '#fff', border: '1px solid rgba(255,255,255,.3)', borderRadius: 6, padding: '3px 4px', outline: 'none' }}
                        />
                      ) : (
                        <button
                          onDoubleClick={e => { e.stopPropagation(); startEdit(p) }}
                          title="Doble tap para editar"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: p.estado === 'critico' ? '#fca5a5' : p.estado === 'bajo' ? '#fcd34d' : 'var(--text-1)' }}
                        >
                          {p.stock_actual}
                          <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--text-3)', marginLeft: 2 }}>{p.unidad_uso ?? p.unidad}</span>
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                      {estadoBadge(p)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      )}

      {/* ── Footer ── */}
      <div style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '7px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>✏️ Doble tap en fila para editar</span>
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
                <span style={{ ...lblStyle, color: 'var(--navy)' }}>Precio unitario ($)</span>
                <input type="number" min="0" step="0.01" value={form.precio_unitario} onChange={e => setForm(f => ({ ...f, precio_unitario: e.target.value }))}
                  placeholder="0"
                  style={{ ...inputStyle, borderColor: 'rgba(28,45,74,.3)' }} />
              </label>

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
                onClick={() => { setQuickSector(null); setQuickIdx(0); setQuickChangedCount(0); setQuickValue(String(quickList[0]?.stock_actual ?? '')); setQuickMode(true); setShowSectorSelect(false) }}
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
                    onClick={() => { setQuickSector(cat); setQuickIdx(0); setQuickChangedCount(0); const list = filtered.filter(p => p.categoria === cat); setQuickValue(String(list[0]?.stock_actual ?? '')); setQuickMode(true); setShowSectorSelect(false) }}
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
      )}

      {/* ── Quick stock mode ── */}
      {quickMode && quickList.length > 0 && (() => {
        const p = quickList[quickIdx]
        if (!p) { setQuickMode(false); return null }
        const enteredVal = parseFloat(quickValue)
        const diff = !isNaN(enteredVal) && enteredVal !== p.stock_actual ? enteredVal - p.stock_actual : null
        const isLast = quickIdx === quickList.length - 1

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
            setQuickValue(String(quickList[next]?.stock_actual ?? ''))
            setTimeout(() => { quickRef.current?.focus(); quickRef.current?.select() }, 30)
          } else {
            setQuickMode(false)
            setShowQuickSummary(true)
            setTimeout(() => setShowQuickSummary(false), 3000)
          }
        }

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'var(--navy)', padding: '46px 16px 14px', flexShrink: 0 }}>
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
                <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, fontWeight: 600 }}>{quickIdx + 1}/{quickList.length}</span>
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,.15)', borderRadius: 99, marginTop: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#22c55e', borderRadius: 99, width: `${((quickIdx + 1) / quickList.length) * 100}%`, transition: 'width .3s' }} />
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
                onPointerDown={e => { e.preventDefault(); if (quickIdx > 0) { const prev = quickIdx - 1; setQuickIdx(prev); setQuickValue(String(quickList[prev]?.stock_actual ?? '')); setTimeout(() => { quickRef.current?.focus(); quickRef.current?.select() }, 30) } }}
                disabled={quickIdx === 0}
                style={{ width: 44, height: 48, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: quickIdx > 0 ? 'pointer' : 'default', opacity: quickIdx > 0 ? 1 : 0.3 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-2)' }}>chevron_left</span>
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
        )
      })()}

      {showQuickSummary && (
        <div style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', zIndex: 200, background: 'var(--navy)', color: '#fff', borderRadius: 12, padding: '10px 20px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
          {quickChangedCount} producto{quickChangedCount !== 1 ? 's' : ''} actualizados
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
