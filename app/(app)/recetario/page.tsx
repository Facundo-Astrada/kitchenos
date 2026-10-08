'use client'

import PageTransition from '@/components/PageTransition'
import { motion } from 'motion/react'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import PhotoPicker from '@/components/ui/PhotoPicker'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useRecetas, calcFoodCost, type RecetaConCosto } from '@/lib/hooks/useRecetas'
import { vincularIngredientesConStock, buscarProductoExacto } from '@/lib/recetas/vinculo'
import { useStock } from '@/lib/hooks/useStock'
import { useCategoriasProducto } from '@/lib/hooks/useCategoriasProducto'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { createClient } from '@/lib/supabase/client'
import { FC_ALERT_HIGH, FC_ALERT_OK } from '@/lib/constants'
import ImageCropModal from '@/components/ui/ImageCropModal'
import { createPortal } from 'react-dom'
import { SheetChrome, useSheetOpen } from '@/lib/ui/chrome'
import { unitConversionFactor, canonUnit } from '@/lib/unidades'
import { exportarExcel, fechaArchivo } from '@/lib/exportar'
import ImportadorFichasTecnicas from '@/components/importador/ImportadorFichasTecnicas'
import { clasificarArchivo } from '@/lib/recetas/iaImport'
import { nivelDeReceta } from '@/lib/recetas/estandarizacion'
import { NivelBadge } from '@/app/(app)/carta/EstandarizacionView'
import { HeaderAction, Skeleton, FilterChips, EmptyState, IAButton, IAPanel } from '@/components/ui'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import {
  CargaRapidaIngredientes, TotalesRapidosBar, nuevaFilaRapida, filasToIngredientesData,
  type FilaIngredienteRapido,
} from '@/components/recetas/CargaRapidaIngredientes'
import { IAMultiResultScreen } from './IAResultScreens'
import { IngRow, UNIDADES_SUBRECETA, patchVinculo, type FormIng } from './IngRow'
import { sugerenciaDeProducto, sugerenciaDeReceta, type SugerenciaIngrediente } from '@/lib/recetas/sugerencias'
import type { ResultadoVinculoIA } from '@/lib/recetas/vinculoIA'
import { apiToForm, parseNum, calcPesoPorcion, formatPeso, type IAApiResult } from './shared'


// Categorías canónicas de recetas
const CATEGORIAS_RECETA = [
  'Entradas', 'Principales', 'Guarniciones', 'Salsas', 'Fondos', 'Bases',
  'Carnes', 'Aves', 'Pescados', 'Vegetariano', 'Postres', 'Repostería',
  'Panificados', 'Bebidas', 'Otros',
]

// Normaliza nombres de categoría con variantes históricas
function normalizeCategoria(cat: string | null | undefined): string {
  if (!cat) return ''
  const lower = cat.toLowerCase().trim()
  const MAP: Record<string, string> = {
    entrantes: 'Entradas',
    garnishes: 'Guarniciones',
    guarniciones: 'Guarniciones',
    'carnes rojas': 'Carnes',
    otros: 'Otros',
    otras: 'Otros',
    other: 'Otros',
    'bases y salsas': 'Salsas',
    salsa: 'Salsas',
  }
  return MAP[lower] ?? (cat.charAt(0).toUpperCase() + cat.slice(1))
}

// ── Tipos para importación IA ──
type ImportMode = 'camera' | 'gallery' | 'file' | 'audio' | 'text' | 'glink' | null

// ── Helpers ──
async function fileToBase64(file: File): Promise<{ base64: string; media_type: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      resolve({ base64, media_type: file.type || 'image/jpeg' })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

type ImportPayload = {
  text?: string
  image_base64?: string
  media_type?: string
  google_url?: string
  /** PDF o .docx en base64. Antes estos archivos se mandaban como texto crudo. */
  file_base64?: string
  file_name?: string
  /** Categorías reales del restaurante — sin esto la IA elige de una lista inventada. */
  categorias?: string[]
}

type ImportApiMode = 'image' | 'text' | 'google_url' | 'document'

async function postImport(action: 'import' | 'import_multi', mode: ImportApiMode, payload: ImportPayload) {
  const res = await fetch('/api/recetas/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, mode, ...payload }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error || `Error ${res.status}`)
  }
  return res.json()
}

async function callRecetaImport(mode: ImportApiMode, payload: ImportPayload): Promise<IAApiResult> {
  return postImport('import', mode, payload)
}

async function callRecetaImportMulti(mode: ImportApiMode, payload: ImportPayload): Promise<{ recetas: IAApiResult[] }> {
  return postImport('import_multi', mode, payload)
}

function fcColor(pct: number) {
  if (pct >= FC_ALERT_HIGH) return '#ef4444'
  if (pct >= FC_ALERT_OK) return '#f59e0b'
  return '#4ade80'
}

// ── Form types ── (FormIng vive en ./IngRow)

interface FormPaso {
  id: number
  texto: string
}

let _id = 0
function uid() { return ++_id }

// Sin stagger ni y-translate: la animación de entrada con `y: 12` por ítem hacía
// que las cards se movieran bajo el dedo durante >1s (stagger 0.05 × N recetas),
// y el primer tap caía sobre un target en movimiento → "hay que apretar dos veces"
// (tanto en una receta como en el buscador, por el main thread ocupado componiendo).
// Fade rápido en su posición final → tappable de inmediato.
const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0 } },
}
const itemVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.12 } },
}

type Tab = 'recetas' | 'ideas'
const TAB_IDS: Tab[] = ['recetas', 'ideas']
function esTab(v: string | null): v is Tab {
  return v != null && (TAB_IDS as string[]).includes(v)
}

export default function RecetarioPage() {
  const router = useRouter()
  const RESTAURANTE_ID = useRestauranteId()
  const { recetas, loading, error, agregarReceta, agregarIngrediente, actualizarReceta, eliminarReceta, publicarReceta } = useRecetas()
  const { productos: stockProductos, agregarProducto } = useStock()
  const { categorias: catDB } = useCategoriasProducto()
  const { puedeEditar, isAdmin, verCostos } = usePermisos()
  const canEdit = isAdmin || puedeEditar('recetas')
  const isDesktop = useIsDesktop()
  // Para resolver ingredientes tipo "subreceta" a su propio nivel en las
  // cards (ver lib/recetas/estandarizacion.ts) — acá SÍ está el recetario
  // completo (a diferencia de Carta, que solo trae las recetas linkeadas a un plato).
  const recetasPorId = useMemo(() => new Map(recetas.map(r => [r.id, r])), [recetas])

  const [search, setSearch] = useState('')
  // Ideas no tiene chips de categoría propios, no necesita filtro.
  const [catFilterRecetas, setCatFilterRecetas] = useState('')
  const [creando, setCreando] = useState(false)
  const [cargaRapida, setCargaRapida] = useState(false)
  const [tab, setTab] = useState<Tab>('recetas')

  // Tab inicial desde la URL (?tab=) — deep-link, mismo patrón que operaciones/page.tsx
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (esTab(t)) setTab(t)
  }, [])

  // Allow Kitchen Coach tour to switch tabs
  useEffect(() => {
    function handleSetTab(e: Event) {
      const { tab: t } = (e as CustomEvent<{ tab: string }>).detail
      if (esTab(t)) setTab(t)
    }
    window.addEventListener('kc-set-tab', handleSetTab)
    return () => window.removeEventListener('kc-set-tab', handleSetTab)
  }, [])

  // Swipe horizontal entre pestañas — scroll-snap nativo, mismo patrón que
  // operaciones/page.tsx (ver .claude/docs/ui.md § Tabs con swipe). A
  // diferencia de OPS, acá no hace falta lazy-mount: las 3 pestañas no tienen
  // hooks propios de fetch (recetas/cartaItems ya están bajados arriba), así
  // que se montan las tres desde el principio.
  const scrollRef = useRef<HTMLDivElement>(null)
  const tabRef = useRef<Tab>(tab)
  useEffect(() => { tabRef.current = tab }, [tab])
  const scrollDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didInitScroll = useRef(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const idx = TAB_IDS.indexOf(tab)
    const target = idx * el.clientWidth
    if (Math.abs(el.scrollLeft - target) < 2) { didInitScroll.current = true; return }
    el.scrollTo({ left: target, behavior: didInitScroll.current ? 'smooth' : 'auto' })
    didInitScroll.current = true
  }, [tab])

  function handleTabScroll() {
    const el = scrollRef.current
    if (!el || el.clientWidth === 0) return
    if (scrollDebounce.current) clearTimeout(scrollDebounce.current)
    scrollDebounce.current = setTimeout(() => {
      const idx = Math.round(el.scrollLeft / el.clientWidth)
      const next = TAB_IDS[Math.min(TAB_IDS.length - 1, Math.max(0, idx))]
      if (next !== tabRef.current) setTab(next)
    }, 90)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      el.scrollTo({ left: TAB_IDS.indexOf(tabRef.current) * el.clientWidth, behavior: 'auto' })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Volver de "Nueva ficha"/"Carga rápida" (reemplazan todo el árbol, ver los
  // `if (creando)`/`if (cargaRapida)` de abajo) remonta la fila de swipe con
  // scrollLeft en 0 — sin esto, salir de "Nueva" desde la pestaña Ideas te
  // devolvía a Recetas en vez de a donde estabas.
  useEffect(() => {
    if (creando || cargaRapida) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: TAB_IDS.indexOf(tabRef.current) * el.clientWidth, behavior: 'auto' })
  }, [creando, cargaRapida])
  // Si "Nueva receta" abre con el panel de IA desplegado. Solo lo apaga quien
  // eligió explícitamente cargar a mano desde el estado vacío.
  const [importarConIA, setImportarConIA] = useState(true)
  const [showFichas, setShowFichas] = useState(false)
  const [showLink, setShowLink] = useState(false)

  // Borrador a enriquecer con IA (abre NuevaFichaScreen pre-poblado)
  const [enrichingDraft, setEnrichingDraft] = useState<typeof recetas[0] | null>(null)

  // Separar publicadas vs borradores
  const recetasPublicadas = useMemo(() => recetas.filter(r => r.status !== 'draft'), [recetas])
  const recetasDraft = useMemo(() => recetas.filter(r => r.status === 'draft'), [recetas])

  async function exportXLSX() {
    const recetasRows = recetas.map(r => ({
      'Nombre': r.nombre,
      'Categoría': r.categoria,
      'Porciones': r.porciones ?? 1,
      'Precio venta': r.precio_venta ?? 0,
      'Costo total': r.food_cost.costo_total.toFixed(2),
      'Costo porción': r.food_cost.costo_porcion.toFixed(2),
      'Food cost %': r.food_cost.food_cost_pct.toFixed(1),
      'Margen bruto': r.food_cost.margen_bruto.toFixed(2),
      'Estado': r.status,
    }))
    const ingRows = recetas.flatMap(r =>
      (r.ingredientes ?? []).map(i => ({
        'Receta': r.nombre,
        'Ingrediente': i.nombre,
        'Tipo': i.tipo ?? 'insumo',
        'Cantidad': i.cantidad,
        'Unidad': i.unidad,
        'Costo unitario': i.costo_unitario ?? 0,
        'Merma %': i.merma_pct ?? 0,
      }))
    )
    await exportarExcel(`recetario_${fechaArchivo()}.xlsx`, [
      { nombre: 'Recetas', filas: recetasRows },
      { nombre: 'Ingredientes', filas: ingRows },
    ])
  }

  const categorias = useMemo(() => {
    const catSugeridas = catDB.map(c => c.nombre)
    const usadas = Array.from(new Set(recetas.map(r => r.categoria).filter(Boolean)))
    return Array.from(new Set([...usadas, ...catSugeridas])).sort((a, b) => a.localeCompare(b, 'es'))
  }, [recetas, catDB])

  const categoriasFiltro = useMemo(() =>
    Array.from(new Set(recetasPublicadas.map(r => normalizeCategoria(r.categoria)).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')),
    [recetasPublicadas])

  // Recetas e Ideas se filtran por separado — las dos pestañas están montadas a
  // la vez (swipe), cada una con su propia búsqueda por nombre (search es
  // compartido a propósito: encontrar "milanesa" tiene que valer para las 3).
  const filteredRecetas = useMemo(() => {
    let list = recetasPublicadas
    if (catFilterRecetas) list = list.filter(r => normalizeCategoria(r.categoria) === catFilterRecetas)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(r => r.nombre.toLowerCase().includes(q))
    }
    return list
  }, [recetasPublicadas, catFilterRecetas, search])

  const filteredIdeas = useMemo(() => {
    if (!search.trim()) return recetasDraft
    const q = search.trim().toLowerCase()
    return recetasDraft.filter(r => r.nombre.toLowerCase().includes(q))
  }, [recetasDraft, search])

  const fcPromedio = useMemo(() => {
    const conPrecio = recetasPublicadas.filter(r => (r.precio_venta ?? 0) > 0)
    if (conPrecio.length === 0) return 0
    return conPrecio.reduce((s, r) => s + r.food_cost.food_cost_pct, 0) / conPrecio.length
  }, [recetasPublicadas])

  const nAlertas = useMemo(() => recetasPublicadas.filter(r => r.food_cost.food_cost_pct >= FC_ALERT_HIGH).length, [recetasPublicadas])

  // ── Salud del recetario (Feature 2) ──
  const [saludOpen, setSaludOpen] = useState(false)
  const salud = useMemo(() => {
    const costeoIncompleto = recetasPublicadas.filter(r => {
      const prodIngs = (r.ingredientes ?? []).filter(i => i.tipo !== 'subreceta')
      if (prodIngs.length === 0) return false
      return prodIngs.some(i => !i.producto_id || !((i.costo_unitario ?? 0) > 0))
    })
    const fcCritico = recetasPublicadas.filter(r => (r.precio_venta ?? 0) > 0 && r.food_cost.food_cost_pct >= FC_ALERT_HIGH)
    const sinPrecio = recetasPublicadas.filter(r => (r.precio_venta ?? 0) === 0)
    return { costeoIncompleto, fcCritico, sinPrecio, total: costeoIncompleto.length + fcCritico.length + sinPrecio.length }
  }, [recetasPublicadas])

  useEffect(() => {
    // Insights accionables para Kitchen Coach
    const fcAlto = recetasPublicadas
      .filter(r => r.food_cost.food_cost_pct >= FC_ALERT_HIGH)
      .map(r => ({ nombre: r.nombre, fc: Math.round(r.food_cost.food_cost_pct), precio: r.precio_venta ?? 0 }))
      .sort((a, b) => b.fc - a.fc)
      .slice(0, 5)
    const sinIngredientes = recetas
      .filter(r => (r.ingredientes?.length ?? 0) === 0)
      .map(r => r.nombre)
      .slice(0, 5)
    const sinPrecio = recetasPublicadas
      .filter(r => (r.precio_venta ?? 0) === 0)
      .map(r => r.nombre)
      .slice(0, 5)
    const sinVincular = recetasPublicadas
      .filter(r => r.ingredientes?.some(i => !i.producto_id))
      .map(r => r.nombre)
      .slice(0, 5)
    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'recetario',
      tab,
      total: recetas.length,
      publicadas: recetasPublicadas.length,
      ideas: recetasDraft.length,
      fcPromedio: Math.round(fcPromedio),
      fcAlto,
      sinIngredientes,
      sinPrecio,
      sinVincular,
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [recetas, recetasPublicadas, recetasDraft, tab, fcPromedio])

  // En desktop la Nueva receta se abre como modal centrado sobre la lista (mismo
  // chrome que el editor rápido de OPS, RecetaQuickEditModal); en el celular
  // sigue ocupando toda la pantalla.
  const nuevaFicha = creando ? (
      <NuevaFichaScreen
        enModal={isDesktop}
        categorias={categorias}
        stockProductos={stockProductos}
        recetas={recetasPublicadas}
        agregarReceta={agregarReceta}
        agregarIngrediente={agregarIngrediente}
        agregarProducto={agregarProducto}
        actualizarReceta={actualizarReceta}
        initialDraft={enrichingDraft ? {
          id: enrichingDraft.id,
          nombre: enrichingDraft.nombre,
          categoria: enrichingDraft.categoria,
          porciones: enrichingDraft.porciones ?? undefined,
          precio_venta: enrichingDraft.precio_venta ?? undefined,
          tiempo_min: enrichingDraft.tiempo_min ?? undefined,
        } : undefined}
        iaAbierta={importarConIA}
        onClose={() => { setCreando(false); setEnrichingDraft(null); setImportarConIA(true) }}
        onCreated={(id, asDraft) => {
          setCreando(false)
          setEnrichingDraft(null)
          setImportarConIA(true)
          if (asDraft) { setTab('ideas') }
          else { router.push(`/recetario/${id}`) }
        }}
      />
  ) : null

  if (nuevaFicha && !isDesktop) return nuevaFicha

  if (cargaRapida) {
    return (
      <CargaRapidaScreen
        categorias={categorias}
        stockProductos={stockProductos}
        recetasDisponibles={recetasPublicadas}
        agregarReceta={agregarReceta}
        onClose={() => setCargaRapida(false)}
        onCreated={(id, asDraft) => {
          setCargaRapida(false)
          if (asDraft) { setTab('ideas') }
          else { router.push(`/recetario/${id}`) }
        }}
      />
    )
  }

  const slotStyle: React.CSSProperties = {
    flex: '0 0 100%', minWidth: 0, height: '100%',
    overflow: 'hidden', display: 'flex', flexDirection: 'column',
    scrollSnapAlign: 'start',
  }

  return (
    <PageTransition>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => router.back()} aria-label="Volver" className="hit-slop" style={btnClear}><span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.7)', fontSize: 22 }}>arrow_back</span></button>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Recetario</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>Fichas técnicas{verCostos && ' · Food cost'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* El XLSX lleva precio, costo total, costo/porcion, FC% y margen. */}
            {verCostos && (
              <button onClick={exportXLSX} title="Exportar Excel" aria-label="Exportar Excel"
                style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 10, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 17, color: '#fff' }}>table_view</span>
              </button>
            )}
            {isAdmin && (
              <button data-coach-target="recetario-importar" onClick={() => setShowFichas(true)} title="Importar fichas técnicas" aria-label="Importar fichas técnicas"
                style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 10, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 17, color: '#fff' }}>upload_file</span>
              </button>
            )}
            <button data-coach-target="recetario-vincular" onClick={() => setShowLink(true)} title="Vincular ingredientes con stock" aria-label="Vincular ingredientes con stock"
              style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 10, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 17, color: '#10b981' }}>link</span>
            </button>
            {canEdit && (
              <button onClick={() => setCargaRapida(true)} title="Carga rápida — ingredientes/subrecetas al toque" aria-label="Carga rápida"
                style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 10, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 17, color: '#f97316' }}>bolt</span>
              </button>
            )}
            <HeaderAction label="Nueva" icon="add" onClick={() => setCreando(true)} />
          </div>
        </div>
        {/* Tira de KPIs — food cost promedio y cuántas recetas están en zona
            crítica. Solo en la pestaña Recetas (son datos de recetas
            publicadas) y solo si ya hay al menos una con precio cargado, si
            no "0.0%" se lee como food cost perfecto en vez de "sin datos". */}
        {verCostos && tab === 'recetas' && recetasPublicadas.some(r => (r.precio_venta ?? 0) > 0) && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <KpiBox value={`${fcPromedio.toFixed(1)}%`} label="FC promedio" color={fcColor(fcPromedio)} />
            </div>
            <div style={{ flex: 1 }}>
              <KpiBox value={String(nAlertas)} label="FC crítico" color={nAlertas > 0 ? '#ef4444' : '#4ade80'} />
            </div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, padding: '0 10px', height: 34 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'rgba(255,255,255,.4)' }}>search</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar receta…" style={{ border: 'none', background: 'none', outline: 'none', fontSize: 12, fontFamily: 'inherit', color: '#fff', width: '100%' }} />
          {search && <button onClick={() => setSearch('')} aria-label="Limpiar búsqueda" className="hit-slop" style={{ ...btnClear, color: 'rgba(255,255,255,.5)', fontSize: 16 }}>×</button>}
        </div>
      </div>

      {/* ── Tabs: Recetas | Ideas | Platos ── */}
      <div data-coach-target="recetario-tabs" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 14px', display: 'flex', gap: 0, flexShrink: 0 }}>
        <button
          onClick={() => setTab('recetas')}
          style={{
            flex: 1, padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            color: tab === 'recetas' ? 'var(--text-1)' : 'var(--text-3)',
            borderBottom: tab === 'recetas' ? '2px solid var(--navy)' : '2px solid transparent',
            transition: 'all .15s',
          }}
        >
          Recetas
        </button>
        <button
          onClick={() => setTab('ideas')}
          style={{
            flex: 1, padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            color: tab === 'ideas' ? 'var(--text-1)' : 'var(--text-3)',
            borderBottom: tab === 'ideas' ? '2px solid #f59e0b' : '2px solid transparent',
            transition: 'all .15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          Ideas
          {recetasDraft.length > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#fff', background: '#f59e0b',
              borderRadius: 99, padding: '1px 7px', minWidth: 18, textAlign: 'center',
            }}>{recetasDraft.length}</span>
          )}
        </button>
      </div>

      {/* ── Swipe track: Recetas / Ideas — scroll-snap nativo, mismo
          patrón que operaciones/page.tsx (ver .claude/docs/ui.md § Tabs con
          swipe). Ninguna hace fetch propio (recetas ya están bajadas
          arriba), así que las dos se montan siempre — a diferencia de
          OPS no hace falta lazy-mount. ── */}
      <div
        ref={scrollRef}
        onScroll={handleTabScroll}
        className="ops-swipe-track"
        style={{
          flex: 1, minHeight: 0, display: 'flex',
          overflowX: 'auto', overflowY: 'hidden',
          scrollSnapType: 'x mandatory', overscrollBehaviorX: 'contain',
        }}
      >
        {/* ── Panel: Recetas ── */}
        <div style={slotStyle}>
          {categoriasFiltro.length > 0 && (
            <div data-coach-target="recetario-categorias" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '8px 14px', flexShrink: 0 }}>
              <FilterChips
                chips={[{ value: '', label: 'Todas' }, ...categoriasFiltro.map(c => ({ value: c, label: c }))]}
                active={catFilterRecetas}
                onChange={setCatFilterRecetas}
              />
            </div>
          )}
          <div data-coach-target="recetario-lista" style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 24px' }}>
            {/* Salud del recetario — lista costeo incompleto y food cost critico: es plata. */}
            {verCostos && !loading && salud.total > 0 && (
              <div style={{ marginBottom: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <button onClick={() => setSaludOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '11px 12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#f59e0b' }}>health_and_safety</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Salud del recetario</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#f59e0b', borderRadius: 99, padding: '1px 7px' }}>{salud.total}</span>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)', marginLeft: 'auto', transform: saludOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .2s' }}>expand_more</span>
                </button>
                {saludOpen && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    {([
                      { key: 'costeoIncompleto', label: 'Costeo incompleto', hint: 'ingredientes sin vincular o sin costo — subvalúan el food cost', color: '#f59e0b', items: salud.costeoIncompleto },
                      { key: 'fcCritico', label: 'Food cost crítico (>35%)', hint: 'poco margen — revisá precio o receta', color: '#ef4444', items: salud.fcCritico },
                      { key: 'sinPrecio', label: 'Sin precio de venta', hint: 'no se puede calcular el food cost', color: 'var(--text-3)', items: salud.sinPrecio },
                    ] as const).filter(g => g.items.length > 0).map(g => (
                      <div key={g.key} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{g.label}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>({g.items.length})</span>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8 }}>{g.hint}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {g.items.slice(0, 12).map(r => (
                            <button key={r.id} onClick={() => router.push(`/recetario/${r.id}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit' }}>
                              {r.nombre}
                              {g.key === 'fcCritico' && <span style={{ fontSize: 10, fontWeight: 800, color: '#ef4444', fontFamily: "'DM Mono', monospace" }}>{r.food_cost.food_cost_pct.toFixed(0)}%</span>}
                            </button>
                          ))}
                          {g.items.length > 12 && <span style={{ fontSize: 10, color: 'var(--text-3)', alignSelf: 'center' }}>+{g.items.length - 12} más</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {loading ? (
              <div style={isDesktop
                ? { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }
                : { display: 'flex', flexDirection: 'column', gap: 8 }
              }>
                {Array.from({ length: 6 }, (_, i) => <RecetaCardSkeleton key={i} />)}
              </div>
            ) : error ? (
              <div style={{ textAlign: 'center', padding: '48px 24px' }}><p style={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>{error}</p></div>
            ) : filteredRecetas.length === 0 ? (
              recetasPublicadas.length === 0 ? (
                <EmptyState
                  icon="menu_book"
                  title="Sin recetas aún"
                  subtitle="Cargá una a mano, o sacale una foto a tus fichas y dejá que la IA las transcriba."
                  cta={{ label: 'Cargar a mano', onClick: () => { setImportarConIA(false); setCreando(true) } }}
                  ctaIA={{ label: 'Importar con IA', onClick: () => { setImportarConIA(true); setCreando(true) } }}
                />
              ) : (
                <EmptyState icon="menu_book" title="Sin resultados" />
              )
            ) : (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                style={isDesktop
                  ? { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }
                  : { display: 'flex', flexDirection: 'column', gap: 8 }
                }
              >
                {filteredRecetas.map(r => (
                  <motion.div key={r.id} variants={itemVariants}>
                    <RecetaCard receta={r} recetasPorId={recetasPorId} />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </div>

        {/* ── Panel: Ideas ── */}
        <div style={slotStyle}>
          <div data-coach-target="recetario-lista-ideas" style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 24px' }}>
            {loading ? (
              <div style={isDesktop
                ? { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }
                : { display: 'flex', flexDirection: 'column', gap: 8 }
              }>
                {Array.from({ length: 6 }, (_, i) => <RecetaCardSkeleton key={i} />)}
              </div>
            ) : error ? (
              <div style={{ textAlign: 'center', padding: '48px 24px' }}><p style={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>{error}</p></div>
            ) : filteredIdeas.length === 0 ? (
              recetasDraft.length === 0 ? (
                <EmptyState
                  icon="lightbulb"
                  title="Sin ideas guardadas"
                  subtitle="Podés guardar recetas como borrador mientras las desarrollás"
                />
              ) : (
                <EmptyState icon="lightbulb" title="Sin resultados" />
              )
            ) : (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                style={isDesktop
                  ? { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }
                  : { display: 'flex', flexDirection: 'column', gap: 8 }
                }
              >
                {filteredIdeas.map(r => (
                  <motion.div key={r.id} variants={itemVariants}>
                    <RecetaCard
                      receta={r}
                      isDraft
                      onPublish={() => publicarReceta(r.id)}
                      onCompleteIA={() => { setEnrichingDraft(r); setCreando(true) }}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </div>

      </div>


      {/* ── Drawer: Importar fichas técnicas ── */}
      {showFichas && RESTAURANTE_ID && (
        <>
          <div className="fixed inset-0 z-[200]" style={{ background: 'rgba(0,0,0,.45)' }} onClick={() => setShowFichas(false)} />
          <div className="fixed inset-x-0 bottom-0 z-[201]" style={{ background: 'var(--bg)', borderRadius: '20px 20px 0 0', maxHeight: '90dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxWidth: 520, margin: '0 auto' }}>
            <div style={{ background: 'var(--navy)', padding: '20px 16px 14px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <button onClick={() => setShowFichas(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(255,255,255,.6)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
              </button>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Importar fichas técnicas</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              <ImportadorFichasTecnicas
                restauranteId={RESTAURANTE_ID}
                onImportCompleto={() => setShowFichas(false)}
                onClose={() => setShowFichas(false)}
              />
            </div>
          </div>
        </>
      )}

      {/* ── Drawer: Vincular ingredientes con stock ── */}
      {showLink && RESTAURANTE_ID && (
        <>
          <div className="fixed inset-0 z-[200]" style={{ background: 'rgba(0,0,0,.45)' }} onClick={() => setShowLink(false)} />
          <div className="fixed inset-x-0 bottom-0 z-[201]" style={{ background: 'var(--bg)', borderRadius: '20px 20px 0 0', maxHeight: '92dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxWidth: 520, margin: '0 auto' }}>
            <VincularStockDrawer restauranteId={RESTAURANTE_ID} onClose={() => setShowLink(false)} />
          </div>
        </>
      )}

      {nuevaFicha && isDesktop && <ModalCentrado>{nuevaFicha}</ModalCentrado>}

    </div>
    </PageTransition>
  )
}


// ════════════════════════════════════════════════════════════════════
// AUDIO RECORDER MODAL — estilo Gemini con animación de ondas
// Usa MediaRecorder API para grabar audio nativo
// ════════════════════════════════════════════════════════════════════

function AudioRecorderModal({ onClose, onRecorded }: { onClose: () => void; onRecorded: (blob: Blob, transcript: string) => void }) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [done, setDone] = useState(false)
  const [blobReady, setBlobReady] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [liveText, setLiveText] = useState('')
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const recognitionRef = useRef<any>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptRef = useRef('')

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
        mediaRecRef.current.stop()
      }
      mediaRecRef.current?.stream?.getTracks().forEach(t => t.stop())
      if (recognitionRef.current) { try { recognitionRef.current.stop() } catch {} }
    }
  }, [])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      transcriptRef.current = ''
      setLiveText('')

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        stream.getTracks().forEach(t => t.stop())
        setBlobReady(blob)
        setDone(true)
      }
      mr.start()
      mediaRecRef.current = mr

      // Start live transcription with Web Speech API
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition
      if (SpeechRecognition) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recognition = new (SpeechRecognition as any)()
        recognition.lang = 'es-AR'
        recognition.continuous = true
        recognition.interimResults = true
        recognition.maxAlternatives = 1
        recognition.onresult = (event: any) => {
          let interim = ''
          let final = ''
          for (let i = 0; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              final += event.results[i][0].transcript + ' '
            } else {
              interim += event.results[i][0].transcript
            }
          }
          transcriptRef.current = final
          setLiveText(final + (interim ? interim : ''))
        }
        recognition.onerror = () => {} // Ignore errors silently
        recognition.start()
        recognitionRef.current = recognition
      }

      setRecording(true)
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } catch {
      setError('No se pudo acceder al micrófono. Verificá los permisos.')
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (recognitionRef.current) { try { recognitionRef.current.stop() } catch {} }
    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      mediaRecRef.current.stop()
    }
    setRecording(false)
  }, [])

  const handleSend = useCallback(() => {
    if (blobReady) onRecorded(blobReady, liveText || transcriptRef.current)
  }, [blobReady, liveText, onRecorded])

  const handleRetry = useCallback(() => {
    setBlobReady(null)
    setDone(false)
    setSeconds(0)
    setLiveText('')
    transcriptRef.current = ''
    startRecording()
  }, [startRecording])

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Fondo animado estilo Gemini */}
      <div className="absolute inset-0 overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #1a1040 40%, #24243e 100%)' }}>
        {/* Orbes animados */}
        <div className="absolute rounded-full blur-3xl opacity-40 animate-pulse"
          style={{ width: 260, height: 260, top: '15%', left: '10%', background: 'radial-gradient(circle, #4361a0 0%, transparent 70%)', animationDuration: '3s' }} />
        <div className="absolute rounded-full blur-3xl opacity-30 animate-pulse"
          style={{ width: 200, height: 200, top: '55%', right: '5%', background: 'radial-gradient(circle, #c084fc 0%, transparent 70%)', animationDuration: '4s', animationDelay: '1s' }} />
        <div className="absolute rounded-full blur-3xl opacity-25 animate-pulse"
          style={{ width: 180, height: 180, bottom: '10%', left: '25%', background: 'radial-gradient(circle, #67e8f9 0%, transparent 70%)', animationDuration: '3.5s', animationDelay: '0.5s' }} />
        {recording && (
          <div className="absolute rounded-full blur-3xl opacity-50 animate-pulse"
            style={{ width: 320, height: 320, top: '30%', left: '20%', background: 'radial-gradient(circle, #f472b6 0%, transparent 70%)', animationDuration: '1.5s' }} />
        )}
      </div>

      {/* Contenido */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-sm px-6 py-10 text-white">
        {/* Cerrar */}
        <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20">
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 5l10 10M15 5L5 15" /></svg>
        </button>

        {/* Error */}
        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/20 border border-red-400/30 text-sm text-center">
            {error}
            <button onClick={onClose} className="block mx-auto mt-2 text-white/80 underline text-xs">Cerrar</button>
          </div>
        )}

        {/* Estado: sin grabar todavía */}
        {!recording && !done && !error && (
          <>
            <div className="mb-6">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-60">
                <path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>
            <p className="text-lg font-medium mb-1 text-white/90">Grabar audio</p>
            <p className="text-sm text-white/50 mb-10 text-center">Dictá la receta y la IA la procesará</p>
            <button
              onClick={startRecording}
              className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30 active:scale-95 transition-transform"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                <path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" />
              </svg>
            </button>
          </>
        )}

        {/* Grabando */}
        {recording && (
          <>
            {/* Anillos pulsantes */}
            <div className="relative mb-8">
              <div className="absolute inset-0 -m-6 rounded-full border-2 border-red-400/30 animate-ping" style={{ animationDuration: '2s' }} />
              <div className="absolute inset-0 -m-3 rounded-full border border-red-400/20 animate-ping" style={{ animationDuration: '2.5s' }} />
              <div className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/40">
                <div className="w-5 h-5 rounded-sm bg-white" />
              </div>
            </div>
            <p className="text-3xl font-mono mb-2 tracking-wider">{fmtTime(seconds)}</p>
            {liveText && (
              <div className="mb-4 max-h-24 overflow-y-auto px-4">
                <p className="text-xs text-white/60 text-center leading-relaxed">{liveText}</p>
              </div>
            )}
            <p className="text-sm text-white/50 mb-10 animate-pulse">{liveText ? 'Escuchando...' : 'Grabando...'}</p>
            <button
              onClick={stopRecording}
              className="w-20 h-20 rounded-full bg-white/10 border-2 border-white/30 flex items-center justify-center active:scale-95 transition-transform"
            >
              <div className="w-7 h-7 rounded-sm bg-white" />
            </button>
          </>
        )}

        {/* Grabación terminada */}
        {done && blobReady && (
          <>
            <div className="mb-6">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-green-400">
                <path d="M9 12l2 2 4-4" />
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <p className="text-lg font-medium mb-1 text-white/90">Audio listo</p>
            <p className="text-sm text-white/50 mb-1">{fmtTime(seconds)} grabados</p>
            {liveText && (
              <div className="max-h-20 overflow-y-auto px-2 mb-2">
                <p className="text-xs text-white/50 text-center leading-relaxed">{liveText}</p>
              </div>
            )}
            <p className="text-xs text-white/30 mb-8">{(blobReady.size / 1024).toFixed(0)} KB</p>
            <div className="flex gap-4">
              <button
                onClick={handleRetry}
                className="px-6 py-3 rounded-xl bg-white/10 border border-white/20 text-sm font-medium active:bg-white/20 transition-colors"
              >
                Repetir
              </button>
              <button
                onClick={handleSend}
                className="px-6 py-3 rounded-xl bg-indigo-500 text-sm font-medium shadow-lg shadow-indigo-500/30 active:bg-indigo-600 transition-colors"
              >
                Enviar a IA
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}




// Modal centrado con fondo translúcido (desktop). Tocar afuera NO cierra: el
// alta no se guarda sola y un click perdido tiraba la receta a medio cargar —
// se cierra con la X o guardando.
function ModalCentrado({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <SheetChrome>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}>
        <div className="toast-enter" style={{
          position: 'relative', width: '100%', maxWidth: 760, height: 'min(920px, 92vh)',
          borderRadius: 18, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.35)',
          background: 'var(--bg)',
        }}>
          {children}
        </div>
      </div>
    </SheetChrome>,
    document.body,
  )
}

// ════════════════════════════════════════════════════════════════════
// NUEVA FICHA — optimizada para velocidad máxima
// Flujo: Ingredientes → Procedimiento → Nombre/Datos → Guardar
// ════════════════════════════════════════════════════════════════════

interface InitialDraft {
  id: string
  nombre: string
  categoria?: string
  porciones?: number
  precio_venta?: number
  tiempo_min?: number
}

interface NuevaFichaProps {
  /** Dentro del modal de desktop: sin el espacio de la barra de estado arriba. */
  enModal?: boolean
  categorias: string[]
  stockProductos: { id: string; nombre: string; unidad: string; precio_unitario: number; categoria: string }[]
  /** Recetas publicadas, para usarlas como subreceta desde el campo ingrediente. */
  recetas: RecetaConCosto[]
  agregarReceta: (d: any, ingredientes?: any[]) => Promise<string>
  agregarIngrediente: (recetaId: string, d: any) => Promise<void>
  agregarProducto: (datos: any) => Promise<string>
  actualizarReceta: (id: string, d: any) => Promise<void>
  initialDraft?: InitialDraft
  /**
   * Si el panel de import por IA arranca abierto. Quien vino por "Nueva
   * receta" eligió cargar a mano y no necesita el panel encima; quien vino por
   * "Importar con IA" viene justamente a eso.
   */
  iaAbierta?: boolean
  onClose: () => void
  onCreated: (id: string, asDraft?: boolean) => void
}

function NuevaFichaScreen({ enModal = false, categorias, stockProductos, recetas, agregarReceta, agregarIngrediente, agregarProducto, actualizarReceta, initialDraft, iaAbierta = true, onClose, onCreated }: NuevaFichaProps) {
  // Esconde el FAB del Coach mientras se carga: en el celular tapaba el
  // desplegable de sugerencias y el botón ✓ de la fila.
  useSheetOpen()
  const [ings, setIngs] = useState<FormIng[]>(() => [{ id: uid(), cantidad: '', unidad: 'kg', nombre: '', costo_unitario: 0, grupo: '' }])
  // Etapa actual: se asigna a los ingredientes que se agreguen de acá en adelante
  // (mismo criterio de agrupación que la ficha del recetario, ver .claude/docs/columnas.md).
  // Foto de la receta (PLAN-ACCESO-Y-USO B5.2). Estaba solo en la hoja de
  // edicion del detalle: habia que crear la receta, entrar, y recien ahi
  // podias sacarle la foto — asi que en la practica casi ninguna receta la
  // tenia. El path se genera antes de guardar porque la receta todavia no
  // tiene id; la URL viaja en el insert como una columna mas.
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const fotoPathRef = useRef(uid())
  const [pasos, setPasos] = useState<FormPaso[]>(() => [{ id: uid(), texto: '' }])
  const [nombre, setNombre] = useState(initialDraft?.nombre || '')
  const [categoria, setCategoria] = useState(initialDraft?.categoria || '')
  const [porciones, setPorciones] = useState(String(initialDraft?.porciones || 1))
  const [tiempoMin, setTiempoMin] = useState(initialDraft?.tiempo_min ? String(initialDraft.tiempo_min) : '')
  const [precioVenta, setPrecioVenta] = useState(initialDraft?.precio_venta ? String(initialDraft.precio_venta) : '')
  const [esPlato, setEsPlato] = useState(false)   // "trabajar como plato" — OPS por ingrediente en la ficha
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [activeIngId, setActiveIngId] = useState<number | null>(null)

  // IA import
  const [iaMode, setIaMode] = useState<ImportMode>(null)
  const [iaProcessing, setIaProcessing] = useState(false)
  const [iaTextInput, setIaTextInput] = useState('')
  const [iaGoogleLink, setIaGoogleLink] = useState('')
  // Fuente de la última importación (foto / archivo / texto) para comparar
  // contra el formulario ya cargado. null = no vino de la IA o ya se cerró.
  const [iaOrigen, setIaOrigen] = useState<{ previewUrl: string | null; texto: string | null; rinde: string | null } | null>(null)
  const [verOriginal, setVerOriginal] = useState(false)
  // Vínculo por IA de lo que el nombre exacto no resolvió (ver vincularConIA).
  const [iaVinculo, setIaVinculo] = useState<{ estado: 'buscando' | 'listo' | 'error'; auto: number; dudas: number } | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [iaPreviewUrl, setIaPreviewUrl] = useState<string | null>(null)
  const [iaInputText, setIaInputText] = useState<string | null>(null)
  const [iaMultiResults, setIaMultiResults] = useState<IAApiResult[] | null>(null)
  const [iaCollapsed, setIaCollapsed] = useState(!iaAbierta)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [cropMode, setCropMode] = useState<ImportMode>(null)
  const [cropOriginalFile, setCropOriginalFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  // Refs map: ingId → input refs (for auto-focus)
  const cantidadRefs = useRef<Map<number, HTMLInputElement>>(new Map())
  const nombreRefs = useRef<Map<number, HTMLInputElement>>(new Map())
  const pasoRefs = useRef<Map<number, HTMLInputElement>>(new Map())
  // Track which row to focus after render ('ing' or 'paso')
  const pendingFocusRef = useRef<{ id: number; type: 'ing' | 'paso' } | null>(null)

  // After ings/pasos change, focus the pending element
  useEffect(() => {
    if (pendingFocusRef.current !== null) {
      const { id, type } = pendingFocusRef.current
      const map = type === 'ing' ? nombreRefs.current : pasoRefs.current
      const el = map.get(id)
      if (el) {
        el.focus()
        pendingFocusRef.current = null
      }
    }
  }, [ings, pasos])

  // Food cost live — convierte la unidad de la receta a la del precio (500 g ×
  // $/kg); antes multiplicaba directo y "500 g" de un producto por kg daba ×1000.
  const costoTotal = useMemo(() => ings.reduce((s, i) =>
    s + parseNum(i.cantidad) * unitConversionFactor(i.unidad, i.unidad_costo || i.unidad) * i.costo_unitario, 0), [ings])
  // ── Etapas del alta (PLAN-ACCESO-Y-USO B6) ──────────────────────────────
  // El modelo siempre soporto N etapas (`ingredientes.grupo` es por ingrediente),
  // pero el alta tenia UN selector global arriba de una lista plana: se leia
  // como "elegi LA etapa de esta receta", no se veia que ingrediente habia
  // caido en cual, y si te equivocabas no lo podias corregir sin guardar y
  // entrar al detalle. Ahora se renderiza en bloques, uno por etapa.
  //
  // `ings` sigue siendo un array plano — es la fuente de verdad y lo que se
  // guarda. Las etapas se derivan de el, en orden de primera aparicion.
  const etapasCreacion = useMemo(() => {
    const orden: string[] = []
    for (const i of ings) {
      const g = i.grupo ?? ''
      if (!orden.includes(g)) orden.push(g)
    }
    return orden.length ? orden : ['']
  }, [ings])

  // Una receta simple sigue siendo simple: con una sola etapa sin nombre no se
  // dibuja ningun encabezado y la pantalla queda igual que antes.
  const mostrarEtapas = etapasCreacion.length > 1 || etapasCreacion[0] !== ''

  const renombrarEtapa = useCallback((anterior: string, nuevo: string) => {
    setIngs(prev => prev.map(i => (i.grupo ?? '') === anterior ? { ...i, grupo: nuevo } : i))
  }, [])

  // Inserta al final de SU etapa, no al final de la lista: si no, agregar a la
  // primera etapa mandaria la fila abajo de todo y se romperia el agrupamiento.
  const agregarIngEnEtapa = useCallback((grupo: string) => {
    const newId = uid()
    setIngs(prev => {
      const nueva: FormIng = { id: newId, cantidad: '', unidad: 'kg', nombre: '', costo_unitario: 0, grupo }
      let ultimo = -1
      prev.forEach((i, idx) => { if ((i.grupo ?? '') === grupo) ultimo = idx })
      if (ultimo === -1) return [...prev, nueva]
      const next = [...prev]
      next.splice(ultimo + 1, 0, nueva)
      return next
    })
    pendingFocusRef.current = { id: newId, type: 'ing' }
  }, [])

  const agregarEtapa = useCallback(() => {
    const newId = uid()
    setIngs(prev => {
      const usados = new Set(prev.map(i => (i.grupo ?? '').trim()).filter(Boolean))
      let n = usados.size + 1
      let nombre = `Etapa ${n}`
      while (usados.has(nombre)) { n++; nombre = `Etapa ${n}` }
      return [...prev, { id: newId, cantidad: '', unidad: 'kg', nombre: '', costo_unitario: 0, grupo: nombre }]
    })
    pendingFocusRef.current = { id: newId, type: 'ing' }
  }, [])

  const eliminarEtapa = useCallback((grupo: string) => {
    setIngs(prev => {
      const next = prev.filter(i => (i.grupo ?? '') !== grupo)
      return next.length ? next : [{ id: uid(), cantidad: '', unidad: 'kg', nombre: '', costo_unitario: 0, grupo: '' }]
    })
  }, [])
  const porcionesN = parseInt(porciones) || 1
  const precioVentaN = parseNum(precioVenta) || 0
  const costoPorcion = porcionesN > 0 ? costoTotal / porcionesN : 0
  const fcPct = precioVentaN > 0 ? (costoPorcion / precioVentaN) * 100 : 0
  const margen = precioVentaN - costoPorcion

  // Para completar una idea con IA: no ofrecerla como subreceta de sí misma.
  const recetasSugeribles = useMemo(
    () => initialDraft?.id ? recetas.filter(r => r.id !== initialDraft.id) : recetas,
    [recetas, initialDraft?.id])

  // ── Ingrediente operations ──
  const updateIng = useCallback((id: number, patch: Partial<FormIng>) => {
    setIngs(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
  }, [])

  const removeIng = useCallback((id: number) => {
    setIngs(prev => {
      const next = prev.filter(i => i.id !== id)
      return next.length ? next : [{ id: uid(), cantidad: '', unidad: 'kg', nombre: '', costo_unitario: 0, grupo: '' }]
    })
  }, [])

  // Confirm current row + create next + focus its nombre
  const confirmAndNext = useCallback((currentId: number) => {
    const newId = uid()
    setIngs(prev => {
      const idx = prev.findIndex(i => i.id === currentId)
      const current = prev[idx]
      if (!current || !current.nombre.trim()) return prev
      if (idx < prev.length - 1) {
        const nextRow = prev[idx + 1]
        if (!nextRow.nombre.trim() && !nextRow.cantidad) {
          pendingFocusRef.current = { id: nextRow.id, type: 'ing' }
          return [...prev]
        }
      }
      // Hereda la etapa de la fila actual: Enter dentro de "Marinada" agrega
      // otro ingrediente de la marinada, no uno suelto en la etapa que
      // estuviera seleccionada arriba (PLAN-ACCESO-Y-USO B6).
      const newRow: FormIng = { id: newId, cantidad: '', unidad: 'kg', nombre: '', costo_unitario: 0, grupo: current.grupo ?? '' }
      const next = [...prev]
      next.splice(idx + 1, 0, newRow)
      pendingFocusRef.current = { id: newId, type: 'ing' }
      return next
    })
  }, [])

  // ── Paso operations ──
  const updatePaso = useCallback((id: number, texto: string) => {
    setPasos(prev => prev.map(p => p.id === id ? { ...p, texto } : p))
  }, [])

  const removePaso = useCallback((id: number) => {
    setPasos(prev => {
      const next = prev.filter(p => p.id !== id)
      return next.length ? next : [{ id: uid(), texto: '' }]
    })
  }, [])

  // Confirm paso + create next + focus it
  const confirmPasoAndNext = useCallback((currentId: number) => {
    const newId = uid()
    setPasos(prev => {
      const idx = prev.findIndex(p => p.id === currentId)
      const current = prev[idx]
      if (!current || !current.texto.trim()) return prev
      // If next row is empty, focus that
      if (idx < prev.length - 1) {
        const nextRow = prev[idx + 1]
        if (!nextRow.texto.trim()) {
          pendingFocusRef.current = { id: nextRow.id, type: 'paso' }
          return [...prev]
        }
      }
      const newRow: FormPaso = { id: newId, texto: '' }
      const next = [...prev]
      next.splice(idx + 1, 0, newRow)
      pendingFocusRef.current = { id: newId, type: 'paso' }
      return next
    })
  }, [])

  // ── IA Import (API real de Claude → pantalla intermedia) ──
  // Sources that likely contain multiple recipes use import_multi
  async function runIAImport(mode: ImportMode, data?: string | File) {
    setIaMode(null)
    setIaProcessing(true)
    setIaCollapsed(true)
    setFormError(null)
    setIaPreviewUrl(null)
    setIaInputText(null)
    setIaMultiResults(null)
    // De dónde salió la receta: se muestra arriba del formulario para comparar.
    const origen: { previewUrl: string | null; texto: string | null } = { previewUrl: null, texto: null }
    const conPreview = async (file: File) => { origen.previewUrl = await fileToDataUrl(file); setIaPreviewUrl(origen.previewUrl) }
    const conTexto = (t: string) => { origen.texto = t; setIaInputText(t) }
    try {
      // Una sola receta entra derecho al formulario, ya cargada y editable: la
      // pantalla de revisión tipo chat que había en el medio era un paso de
      // más para hacerlo parado en la cocina. La comparación contra la fuente
      // sigue: queda la franja "Cargada con IA" con la foto arriba del form.
      // Varias recetas (un PDF con 10 fichas) siguen yendo a la pantalla multi.
      const recibir = (recetas: IAApiResult[]) => {
        if (recetas.length === 1) cargarResultadoIA(recetas[0], origen)
        else setIaMultiResults(recetas)
      }

      if (mode === 'text' && typeof data === 'string') {
        conTexto(data)
        cargarResultadoIA(await callRecetaImport('text', { text: data, categorias }), origen)

      } else if ((mode === 'camera' || mode === 'gallery') && data instanceof File) {
        await conPreview(data)
        const { base64, media_type } = await fileToBase64(data)
        recibir((await callRecetaImportMulti('image', { image_base64: base64, media_type, categorias })).recetas)

      } else if (mode === 'file' && data instanceof File) {
        const resumen = `${data.name} (${(data.size / 1024).toFixed(0)} KB)`

        switch (clasificarArchivo(data)) {
          case 'imagen': {
            await conPreview(data)
            const { base64, media_type } = await fileToBase64(data)
            recibir((await callRecetaImportMulti('image', { image_base64: base64, media_type, categorias })).recetas)
            break
          }
          case 'planilla': {
            conTexto(resumen)
            const { base64 } = await fileToBase64(data)
            recibir((await callRecetaImportMulti('text', { text: `__XLSX_BASE64__:${base64}`, categorias })).recetas)
            break
          }
          case 'documento': {
            // El bug que reportó Franco vivía acá: los PDF no tenían rama y
            // caían en `texto`, o sea `await data.text()` sobre un binario.
            // Ahora viajan en base64 y el servidor los manda como bloque
            // `document`, que es lo que la API sabe leer.
            conTexto(resumen)
            const { base64, media_type } = await fileToBase64(data)
            recibir((await callRecetaImportMulti('document', {
              file_base64: base64, media_type, file_name: data.name, categorias,
            })).recetas)
            break
          }
          default: {
            const text = await data.text()
            conTexto(text)
            recibir((await callRecetaImportMulti('text', { text, categorias })).recetas)
          }
        }

      } else if (mode === 'audio' && typeof data === 'string') {
        conTexto(data)
        cargarResultadoIA(await callRecetaImport('text', { text: data, categorias }), origen)

      } else if (mode === 'glink' && typeof data === 'string') {
        conTexto(data)
        recibir((await callRecetaImportMulti('google_url', { google_url: data, categorias })).recetas)

      } else {
        throw new Error('Modo de importación no válido')
      }
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Error al procesar con IA')
    } finally {
      setIaProcessing(false)
    }
  }

  // Resultado de la IA → formulario poblado, listo para corregir y guardar.
  // Lo que coincide exacto por nombre con Stock (o con una receta, si viene en
  // peso) ya queda vinculado: ícono verde y costo en vivo sin tocar nada.
  function cargarResultadoIA(r: IAApiResult, origen: { previewUrl: string | null; texto: string | null }) {
    const form = apiToForm(r)
    if (form.nombre) setNombre(form.nombre)
    if (form.categoria) setCategoria(form.categoria)
    if (form.porciones) setPorciones(String(form.porciones))
    if (form.tiempo_min) setTiempoMin(String(form.tiempo_min))
    if (form.ingredientes.length > 0) {
      const filas = form.ingredientes.map((i): FormIng => {
        const unidad = canonUnit(i.unidad) || 'u'
        const base: FormIng = { id: uid(), nombre: i.nombre, cantidad: String(i.cantidad ?? ''), unidad, costo_unitario: 0, grupo: '' }
        const prod = buscarProductoExacto(i.nombre, stockProductos)
        if (prod) {
          return { ...base, nombre: prod.nombre, tipo: 'producto', producto_id: prod.id, unidad_costo: prod.unidad, costo_unitario: prod.precio_unitario || 0 }
        }
        const rec = UNIDADES_SUBRECETA.includes(unidad) ? buscarProductoExacto(i.nombre, recetasSugeribles) : undefined
        if (rec) {
          return { ...base, nombre: rec.nombre, tipo: 'subreceta', subreceta_id: rec.id, unidad_costo: 'g', costo_unitario: rec.costoPorGramo ?? 0 }
        }
        return base
      })
      setIngs(filas)
      vincularConIA(filas)
    }
    if (form.pasos.length > 0) {
      setPasos(form.pasos.map(t => ({ id: uid(), texto: typeof t === 'string' ? t : '' })))
    }
    setIaOrigen({
      ...origen,
      rinde: r.rinde != null ? `${String(r.rinde).replace('.', ',')}${r.rinde_unidad ?? ''}` : null,
    })
    setIaPreviewUrl(null)
    setIaInputText(null)
    setIaMode(null)
    setIaCollapsed(true)
    bodyRef.current?.scrollTo({ top: 0 })
  }

  // Lo que el nombre exacto no vinculó, lo intenta la IA (lib/recetas/vinculoIA.ts):
  // si está segura vincula sola, si duda deja los candidatos como chips en la
  // fila. Best-effort: si falla, quedan como estaban (se vinculan a mano).
  async function vincularConIA(filas: FormIng[]) {
    const pendientes = filas.filter(f => f.nombre.trim() && !f.producto_id && !f.subreceta_id)
    if (pendientes.length === 0) { setIaVinculo(null); return }
    setIaVinculo({ estado: 'buscando', auto: 0, dudas: 0 })
    try {
      const res = await fetch('/api/recetas/vincular-ia', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredientes: pendientes.map(f => ({ nombre: f.nombre, unidad: f.unidad })) }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { resultados = [] } = await res.json() as { resultados?: ResultadoVinculoIA[] }

      const catalogo = new Map<string, SugerenciaIngrediente>()
      for (const p of stockProductos) catalogo.set(`producto:${p.id}`, sugerenciaDeProducto(p))
      for (const r of recetasSugeribles) catalogo.set(`subreceta:${r.id}`, sugerenciaDeReceta(r))

      const plan = new Map<number, { nombre: string; opciones: SugerenciaIngrediente[]; segura: boolean }>()
      for (const r of resultados) {
        const fila = pendientes[r.i]
        if (!fila) continue
        const opciones = r.opciones.map(o => catalogo.get(`${o.tipo}:${o.id}`)).filter((o): o is SugerenciaIngrediente => !!o)
        if (opciones.length === 0) continue
        // Una receta como ingrediente va en peso: si la fila viene en "u" o
        // litros, vincularla sola cambiaría el sentido de la cantidad — se pregunta.
        const segura = r.segura && (opciones[0].tipo === 'producto' || UNIDADES_SUBRECETA.includes(fila.unidad))
        plan.set(fila.id, { nombre: fila.nombre, opciones, segura })
      }
      const valores = [...plan.values()]
      setIaVinculo({ estado: 'listo', auto: valores.filter(v => v.segura).length, dudas: valores.filter(v => !v.segura).length })
      setIngs(prev => prev.map(i => {
        const p = plan.get(i.id)
        // Si el cocinero ya tocó la fila mientras la IA pensaba, manda él.
        if (!p || i.nombre !== p.nombre || i.producto_id || i.subreceta_id) return i
        if (p.segura) return { ...i, ...patchVinculo(i, p.opciones[0]), vinculoIA: true }
        return { ...i, opcionesIA: p.opciones }
      }))
    } catch (e) {
      console.warn('[recetario] vínculo por IA:', e)
      setIaVinculo({ estado: 'error', auto: 0, dudas: 0 })
    }
  }

  function handleImportOption(mode: ImportMode) {
    if (mode === 'camera') {
      cameraInputRef.current?.click()
    } else if (mode === 'gallery') {
      galleryInputRef.current?.click()
    } else if (mode === 'file') {
      fileInputRef.current?.click()
    } else if (mode === 'audio') {
      setIaMode('audio')
    } else if (mode === 'text') {
      setIaMode('text')
    } else if (mode === 'glink') {
      setIaMode('glink')
    }
  }

  function handleFileSelected(mode: ImportMode, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (file.type.startsWith('image/') && (mode === 'camera' || mode === 'gallery')) {
      // Show crop UI before sending to AI
      const url = URL.createObjectURL(file)
      setCropSrc(url)
      setCropMode(mode)
      setCropOriginalFile(file)
    } else {
      runIAImport(mode, file)
    }
  }

  function handleCropConfirm(blob: Blob) {
    if (!cropMode || !cropOriginalFile) return
    const croppedFile = new File([blob], cropOriginalFile.name, { type: 'image/jpeg' })
    setCropSrc(null)
    setCropMode(null)
    setCropOriginalFile(null)
    runIAImport(cropMode, croppedFile)
  }

  function handleCropCancel() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
    setCropMode(null)
    setCropOriginalFile(null)
  }

  // ── Save ──
  async function handleGuardar(status: 'published' | 'draft' = 'published') {
    const isDraft = status === 'draft'
    if (!isDraft && !nombre.trim()) { setFormError('Ponele un nombre a la receta'); return }
    const ingsValidos = ings.filter(i => i.nombre.trim())
    const pasosValidos = pasos.filter(p => p.texto.trim())
    setSaving(true)
    setFormError(null)
    try {
      const procedimiento = pasosValidos.map((p, i) => `${i + 1}. ${p.texto.trim()}`).join('\n')
      // unidad_costo = la del precio (la del producto elegido), no la de la
      // receta: antes se copiaba ing.unidad y 500 g de un producto a $/kg se
      // costeaba 500 × precio/kg (×1000).
      const ingredientesData = await vincularIngredientesConStock(ingsValidos.map(ing => ({
        nombre: ing.nombre.trim(),
        cantidad: parseNum(ing.cantidad),
        unidad: ing.unidad || 'u',
        costo_unitario: ing.costo_unitario ?? 0,
        unidad_costo: ing.unidad_costo || ing.unidad || 'u',
        tipo: ing.tipo ?? 'producto',
        producto_id: ing.tipo === 'subreceta' ? null : (ing.producto_id ?? null),
        subreceta_id: ing.tipo === 'subreceta' ? (ing.subreceta_id ?? null) : null,
        grupo: ing.grupo?.trim() || null,
      })), stockProductos, agregarProducto)
      let savedId: string
      if (initialDraft?.id) {
        // Actualizar el borrador existente en vez de crear uno nuevo
        await actualizarReceta(initialDraft.id, {
          nombre: nombre.trim() || (isDraft ? 'Borrador sin nombre' : ''),
          categoria: categoria.trim() || 'otros',
          porciones: porcionesN,
          tiempo_min: parseInt(tiempoMin) || 0,
          precio_venta: precioVentaN,
          procedimiento,
          activa: true,
          status,
          es_plato: esPlato,
          ...(fotoUrl ? { foto_url: fotoUrl } : {}),
        })
        if (ingredientesData.length > 0) {
          await fetch('/api/recetas/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              enrichRecetaId: initialDraft.id,
              receta: { procedimiento },
              ingredientes: ingredientesData,
            }),
          })
        }
        savedId = initialDraft.id
      } else {
        savedId = await agregarReceta({
          nombre: nombre.trim() || (isDraft ? 'Borrador sin nombre' : ''),
          categoria: categoria.trim() || 'otros',
          porciones: porcionesN,
          tiempo_min: parseInt(tiempoMin) || 0,
          precio_venta: precioVentaN,
          procedimiento,
          activa: true,
          status,
          es_plato: esPlato,
          ...(fotoUrl ? { foto_url: fotoUrl } : {}),
        }, ingredientesData)
      }
      onCreated(savedId, isDraft)
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Error al crear')
    } finally { setSaving(false) }
  }

  const ingCount = ings.filter(i => i.nombre.trim()).length

  // ── Si hay múltiples resultados de IA, mostrar pantalla multi ──
  if (iaMultiResults && iaMultiResults.length > 0) {
    return (
      <IAMultiResultScreen
        results={iaMultiResults}
        previewUrl={iaPreviewUrl}
        inputText={iaInputText}
        agregarReceta={agregarReceta}
        agregarIngrediente={agregarIngrediente}
        agregarProducto={agregarProducto}
        stockProductos={stockProductos}
        onDone={(count) => {
          setIaMultiResults(null)
          setIaPreviewUrl(null)
          setIaInputText(null)
          if (count > 0) {
            onCreated('', true) // Go to Ideas tab
          }
        }}
        onClose={() => { setIaMultiResults(null); setIaPreviewUrl(null); setIaInputText(null) }}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ── Compact header ── */}
      <div style={{ background: 'var(--navy)', padding: enModal ? '12px 14px 10px' : '44px 12px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onClose} style={btnClear}><span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.7)', fontSize: 20 }}>close</span></button>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{initialDraft ? 'Completar receta' : 'Nueva receta'}</span>
            {ingCount > 0 && <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', fontWeight: 600 }}>{ingCount} ing.</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => handleGuardar('draft')} disabled={saving} style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontFamily: 'inherit' }}>
              Borrador
            </button>
            <button onClick={() => handleGuardar('published')} disabled={saving} style={{ background: 'var(--navy)', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', opacity: saving ? .5 : 1, fontFamily: 'inherit' }}>
              {saving ? '…' : 'Guardar'}
            </button>
          </div>
        </div>

        {/* Live food cost strip */}
        {costoTotal > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'center' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
              Costo <b style={{ color: '#fff', fontFamily: "'DM Mono', monospace" }}>${costoTotal.toFixed(0)}</b>
            </span>
            {precioVentaN > 0 && <>
              <span style={{ color: 'rgba(255,255,255,.2)' }}>|</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
                FC <b style={{ color: fcColor(fcPct), fontFamily: "'DM Mono', monospace" }}>{fcPct.toFixed(1)}%</b>
              </span>
              <span style={{ color: 'rgba(255,255,255,.2)' }}>|</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
                Margen <b style={{ color: margen >= 0 ? '#4ade80' : '#ef4444', fontFamily: "'DM Mono', monospace" }}>${margen.toFixed(0)}</b>
              </span>
            </>}
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '10px 10px 32px' }}>

        {formError && <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '6px 10px', marginBottom: 8, fontSize: 11, color: '#ef4444' }}>{formError}</div>}

        {/* ═══ CARGADA CON IA ═══ — la receta ya está en el formulario de abajo;
            esto queda para comparar contra la fuente sin cambiar de pantalla. */}
        {iaOrigen && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
            padding: '8px 10px', borderRadius: 12,
            background: 'rgba(67,97,160,.07)', border: '1px solid rgba(67,97,160,.25)',
          }}>
            {iaOrigen.previewUrl ? (
              <button onClick={() => setVerOriginal(true)} title="Ver la foto original" style={{ ...btnClear, padding: 0, flexShrink: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={iaOrigen.previewUrl} alt="Original" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, display: 'block', border: '1px solid var(--border)' }} />
              </button>
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)', flexShrink: 0 }}>auto_awesome</span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>Cargada con IA · revisá y guardá</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {iaOrigen.previewUrl ? 'Tocá la foto para compararla' : iaOrigen.texto ? `Desde: ${iaOrigen.texto}` : 'Corregí lo que haga falta abajo'}
                {iaOrigen.rinde && ` · la ficha original rinde ${iaOrigen.rinde}`}
              </div>
              {iaVinculo && (
                <div style={{ fontSize: 11, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, color: iaVinculo.estado === 'listo' && iaVinculo.dudas > 0 ? '#b45309' : 'var(--text-2)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13, animation: iaVinculo.estado === 'buscando' ? 'spin 1s linear infinite' : undefined }}>
                    {iaVinculo.estado === 'buscando' ? 'progress_activity' : iaVinculo.estado === 'error' ? 'link_off' : 'link'}
                  </span>
                  {iaVinculo.estado === 'buscando' && 'Buscando tus insumos en Stock…'}
                  {iaVinculo.estado === 'error' && 'No se pudo buscar en Stock — vinculá a mano'}
                  {iaVinculo.estado === 'listo' && (
                    iaVinculo.auto + iaVinculo.dudas === 0
                      ? 'Lo que falta no está en Stock: se crea al guardar'
                      : [
                          iaVinculo.auto > 0 && `La IA vinculó ${iaVinculo.auto}`,
                          iaVinculo.dudas > 0 && `${iaVinculo.dudas} para elegir abajo`,
                        ].filter(Boolean).join(' · ')
                  )}
                  <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                </div>
              )}
            </div>
            <button onClick={() => { setIaOrigen(null); setIaVinculo(null) }} aria-label="Cerrar aviso" style={{ ...btnClear, padding: 4, flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>close</span>
            </button>
          </div>
        )}

        {/* ═══ IMPORTAR CON IA ═══ */}
        {iaOrigen ? null : iaCollapsed ? (
          /* Colapsado: era un link de 12px, más escondido en el segundo uso que
             en el primero — justo al revés de lo que conviene. Ahora es el
             mismo botón de IA que en el estado vacío. */
          <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'center' }}>
            <IAButton label="Importar otra receta con IA" onClick={() => setIaCollapsed(false)} />
          </div>
        ) : (
          /* Desplegado: todas las fuentes.
             El degradé navy→violeta que tenía está prohibido por DESIGN.md §10. */
          <IAPanel title="Importar con IA" hint="Más rápido" style={{ marginBottom: 16 }}>

            {/* Grid 2×2: Foto, Imagen, Archivo, Link */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <button onClick={() => handleImportOption('camera')} style={iaCardBtn}>
                <span className="material-symbols-outlined" style={iaCardIcon}>photo_camera</span>
                <span style={iaCardLabel}>Sacar foto</span>
              </button>
              <button onClick={() => handleImportOption('gallery')} style={iaCardBtn}>
                <span className="material-symbols-outlined" style={iaCardIcon}>image</span>
                <span style={iaCardLabel}>Subir imagen</span>
              </button>
              <button onClick={() => handleImportOption('file')} style={iaCardBtn}>
                <span className="material-symbols-outlined" style={iaCardIcon}>upload_file</span>
                <div>
                  <span style={{ ...iaCardLabel, display: 'block' }}>Subir archivo</span>
                  <span style={{ fontSize: 9, color: 'var(--text-3)', lineHeight: 1.2 }}>Excel · Sheets · PDF</span>
                </div>
              </button>
              <button onClick={() => handleImportOption('glink')} style={iaCardBtn}>
                <span className="material-symbols-outlined" style={iaCardIcon}>link</span>
                <div>
                  <span style={{ ...iaCardLabel, display: 'block' }}>Link de Google</span>
                  <span style={{ fontSize: 9, color: 'var(--text-3)', lineHeight: 1.2 }}>Sheets · Docs</span>
                </div>
              </button>
            </div>

            {/* Row: Voz + Texto */}
            {iaMode === 'text' ? (
              /* Inline text input — no modal, header stays accessible */
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>text_snippet</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>Pegar texto de receta</span>
                  </div>
                  <button onClick={() => setIaMode(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>close</span>
                  </button>
                </div>
                <textarea
                  value={iaTextInput}
                  onChange={e => setIaTextInput(e.target.value)}
                  placeholder={'Pegá el texto de la receta acá…\n\nEj: texto copiado de WhatsApp, email, web, etc.'}
                  autoFocus
                  style={{ ...inp, minHeight: 120, resize: 'vertical', fontSize: 12, lineHeight: 1.6, width: '100%', boxSizing: 'border-box' }}
                />
                <button
                  onClick={() => { runIAImport('text', iaTextInput); setIaTextInput('') }}
                  disabled={!iaTextInput.trim()}
                  style={{
                    marginTop: 8, width: '100%', background: 'var(--navy)', border: 'none',
                    borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 700,
                    color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                    opacity: iaTextInput.trim() ? 1 : .4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span>
                  Analizar con IA
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button onClick={() => handleImportOption('audio')} style={iaCardBtn}>
                  <span className="material-symbols-outlined" style={iaCardIcon}>mic</span>
                  <span style={iaCardLabel}>Dictar por voz</span>
                </button>
                <button onClick={() => handleImportOption('text')} style={iaCardBtn}>
                  <span className="material-symbols-outlined" style={iaCardIcon}>text_snippet</span>
                  <span style={iaCardLabel}>Pegar texto</span>
                </button>
              </div>
            )}
          </IAPanel>
        )}

        {/* Separador */}
        {!iaOrigen && <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>o cargá manualmente</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>}

        {/* ═══ 0. FOTO ═══ */}
        {/* Al lado del nombre y no escondida en una hoja aparte: la foto es lo
            que hace reconocible el plato en el pase, y si no esta acá nadie la
            carga (PLAN-ACCESO-Y-USO B5.2). */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
          padding: '10px 12px', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 12,
        }}>
          <PhotoPicker
            currentUrl={fotoUrl}
            path={`recetas/${fotoPathRef.current}`}
            onUploaded={setFotoUrl}
            onRemoved={() => setFotoUrl(null)}
            size={64}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
              {fotoUrl ? 'Foto cargada' : 'Sacale una foto al plato'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4 }}>
              Opcional, pero es lo que hace que se reconozca de un vistazo en el pase.
            </div>
          </div>
        </div>

        {/* ═══ 1. INGREDIENTES ═══ */}
        <Section icon="restaurant" title="Ingredientes" badge={ingCount > 0 ? `${ingCount}` : undefined} badgeColor="var(--navy)">
          {/* Un bloque por etapa. Cada uno con su nombre, sus ingredientes y su
              propio "agregar" — asi se ve que ingrediente quedo en cual y se
              puede corregir en el momento, sin guardar y volver a entrar. */}
          {etapasCreacion.map((etapa, etapaIdx) => {
            const filas = ings.filter(i => (i.grupo ?? '') === etapa)
            return (
              <div key={etapa || '__general__'} style={{ marginBottom: mostrarEtapas ? 14 : 0 }}>
                {mostrarEtapas && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 800, color: 'var(--text-3)',
                      textTransform: 'uppercase', letterSpacing: '.06em',
                      flexShrink: 0, minWidth: 16,
                    }}>{etapaIdx + 1}</span>
                    <input
                      value={etapa}
                      onChange={e => renombrarEtapa(etapa, e.target.value)}
                      placeholder="General (sin etapa)"
                      style={{
                        flex: 1, border: 'none', borderBottom: '1px solid var(--border)',
                        background: 'transparent', padding: '3px 2px', fontSize: 12,
                        fontWeight: 700, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none',
                      }}
                    />
                    {etapasCreacion.length > 1 && (
                      <button
                        onClick={() => eliminarEtapa(etapa)}
                        title="Eliminar etapa y sus ingredientes"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0 }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--text-3)' }}>close</span>
                      </button>
                    )}
                  </div>
                )}
                {/* `overflow: visible` a propósito: con `hidden` el desplegable de
                    sugerencias de la fila (absolute, debajo de ella) quedaba
                    recortado — con un solo ingrediente, invisible del todo. */}
                <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'visible' }}>
                  {filas.map((ing, filaIdx) => (
                    <IngRow
                      key={ing.id}
                      ing={ing}
                      idx={ings.indexOf(ing)}
                      isLast={filaIdx === filas.length - 1}
                      isActive={activeIngId === ing.id}
                      stockProductos={stockProductos}
                      recetas={recetasSugeribles}
                      cantidadRefs={cantidadRefs}
                      nombreRefs={nombreRefs}
                      onUpdate={updateIng}
                      onRemove={removeIng}
                      onConfirm={confirmAndNext}
                      onFocusRow={setActiveIngId}
                    />
                  ))}
                </div>
                <button
                  onClick={() => agregarIngEnEtapa(etapa)}
                  style={{ marginTop: 6, width: '100%', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 8, padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-3)' }}>add</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'inherit' }}>
                    Agregar ingrediente{mostrarEtapas && etapa ? ` a ${etapa}` : ''}
                  </span>
                </button>
              </div>
            )
          })}

          <button
            onClick={agregarEtapa}
            style={{ marginTop: 8, width: '100%', background: 'transparent', border: '1px dashed var(--accent)', borderRadius: 8, padding: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--accent)' }}>library_add</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', fontFamily: 'inherit' }}>
              Agregar etapa
            </span>
          </button>
        </Section>

        {/* ═══ 2. PROCEDIMIENTO ═══ */}
        <Section icon="format_list_numbered" title="Procedimiento" badge={pasos.filter(p => p.texto.trim()).length > 0 ? `${pasos.filter(p => p.texto.trim()).length}` : undefined} badgeColor="var(--text-2)">
          <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }} onFocus={() => setActiveIngId(null)}>
            {pasos.map((p, idx) => (
              <PasoRow
                key={p.id}
                paso={p}
                idx={idx}
                total={pasos.length}
                pasoRefs={pasoRefs}
                onUpdate={updatePaso}
                onRemove={removePaso}
                onConfirm={confirmPasoAndNext}
              />
            ))}
          </div>

          <button
            onClick={() => {
              const newId = uid()
              setPasos(prev => [...prev, { id: newId, texto: '' }])
              pendingFocusRef.current = { id: newId, type: 'paso' }
            }}
            style={{ marginTop: 6, width: '100%', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 8, padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-3)' }}>add</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'inherit' }}>Agregar paso</span>
          </button>
        </Section>

        {/* ═══ 3. NOMBRE + DATOS ═══ */}
        <Section icon="edit_note" title="Datos de la receta">
          <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', padding: 12 }} onFocus={() => setActiveIngId(null)}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Nombre de la receta *"
                style={{ ...inp, flex: 2, fontWeight: 600, fontSize: 13 }}
              />
              <div style={{ flex: 1 }}>
                <select
                  value={CATEGORIAS_RECETA.includes(categoria) ? categoria : (categoria ? '__otra' : '')}
                  onChange={e => { if (e.target.value !== '__otra') setCategoria(e.target.value) }}
                  style={{ ...inp, fontSize: 11 }}
                >
                  <option value="">Categoría…</option>
                  {CATEGORIAS_RECETA.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__otra">Otra…</option>
                </select>
                {(!CATEGORIAS_RECETA.includes(categoria) && categoria) && (
                  <input
                    value={categoria}
                    onChange={e => setCategoria(e.target.value)}
                    placeholder="Nombre de categoría"
                    style={{ ...inp, fontSize: 11, marginTop: 4 }}
                  />
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={lbl}>Porciones</span>
                <input type="number" inputMode="numeric" min="1" value={porciones} onChange={e => setPorciones(e.target.value)} style={{ ...inp, textAlign: 'center', padding: '7px 4px' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={lbl}>Tiempo min</span>
                <input type="number" inputMode="numeric" min="0" value={tiempoMin} onChange={e => setTiempoMin(e.target.value)} placeholder="—" style={{ ...inp, textAlign: 'center', padding: '7px 4px' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={lbl}>Precio $</span>
                <input type="text" inputMode="decimal" value={precioVenta} onChange={e => setPrecioVenta(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="—" style={{ ...inp, textAlign: 'center', padding: '7px 4px' }} />
              </label>
            </div>
          </div>
          {/* Trabajar como plato — habilita OPS por ingrediente en la ficha */}
          <button
            type="button"
            onClick={() => setEsPlato(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginTop: 10, borderRadius: 10, border: `1px solid ${esPlato ? 'rgba(67,97,160,.35)' : 'var(--border)'}`, background: esPlato ? 'rgba(67,97,160,.06)' : 'var(--bg)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: esPlato ? 'var(--accent)' : 'var(--text-3)' }}>restaurant</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Trabajar como plato</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>Cada ingrediente/subreceta se rutea a una plaza (botón OPS en la ficha).</span>
            </span>
            <span style={{ width: 40, height: 24, borderRadius: 99, background: esPlato ? 'var(--accent)' : 'var(--border)', position: 'relative', flexShrink: 0, transition: 'background .15s' }}>
              <span style={{ position: 'absolute', top: 2, left: esPlato ? 18 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
            </span>
          </button>
        </Section>

        {/* Save buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button onClick={() => handleGuardar('draft')} disabled={saving} style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px', fontSize: 13, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Guardar como idea
          </button>
          <button onClick={() => handleGuardar('published')} disabled={saving} style={{ flex: 1, background: 'var(--navy)', border: 'none', borderRadius: 10, padding: '12px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', opacity: saving ? .5 : 1, fontFamily: 'inherit' }}>
            {saving ? 'Guardando…' : 'Guardar receta'}
          </button>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => handleFileSelected('camera', e)} />
      <input ref={galleryInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFileSelected('gallery', e)} />
      <input ref={fileInputRef} type="file" accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.txt,.tsv,.ods,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/*" style={{ display: 'none' }} onChange={e => handleFileSelected('file', e)} />
      {/* audio uses custom recorder modal, no hidden input */}

      {/* IA Processing overlay */}
      {iaProcessing && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 60,
          background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <div style={{
            width: 48, height: 48, border: '3px solid rgba(255,255,255,.2)',
            borderTopColor: '#c4b5fd', borderRadius: '50%',
            animation: 'spin .8s linear infinite',
          }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Analizando con IA…</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>Buscando recetas, ingredientes y pasos</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* Foto original a pantalla completa (desde la franja "Cargada con IA") */}
      {verOriginal && iaOrigen?.previewUrl && (
        <div
          onClick={() => setVerOriginal(false)}
          style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, cursor: 'zoom-out' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iaOrigen.previewUrl} alt="Receta original" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
          <span className="material-symbols-outlined" style={{ position: 'absolute', top: 14, right: 14, fontSize: 26, color: '#fff' }}>close</span>
        </div>
      )}

      {/* Image crop modal */}
      {cropSrc && (
        <ImageCropModal
          src={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}

      {/* Google link modal */}
      {iaMode === 'glink' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 55, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} onClick={() => setIaMode(null)} />
          <div style={{
            position: 'relative', background: 'var(--surface)',
            borderRadius: '16px 16px 0 0', padding: '20px 14px 32px',
            boxShadow: '0 -8px 40px rgba(0,0,0,.3)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 14px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)' }}>link</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Pegar link de Google</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Pegá el link de un Google Sheets o Google Docs.<br />
              El documento debe estar compartido como "Cualquier persona con el enlace".
            </p>
            <input
              value={iaGoogleLink}
              onChange={e => setIaGoogleLink(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              autoFocus
              style={{ ...inp, fontSize: 12 }}
            />
            {/* Quick examples */}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, color: 'var(--text-3)', padding: '3px 6px', background: 'var(--bg)', borderRadius: 4, border: '1px solid var(--border)' }}>
                <span style={{ color: '#34a853' }}>●</span> Google Sheets
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-3)', padding: '3px 6px', background: 'var(--bg)', borderRadius: 4, border: '1px solid var(--border)' }}>
                <span style={{ color: '#4285f4' }}>●</span> Google Docs
              </span>
            </div>
            <button
              onClick={() => { runIAImport('glink', iaGoogleLink); setIaGoogleLink('') }}
              disabled={!iaGoogleLink.trim() || !iaGoogleLink.includes('docs.google.com')}
              style={{
                marginTop: 12, width: '100%', background: 'var(--navy)', border: 'none',
                borderRadius: 10, padding: '12px', fontSize: 13, fontWeight: 700,
                color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                opacity: iaGoogleLink.includes('docs.google.com') ? 1 : .4,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span>
              Importar con IA
            </button>
          </div>
        </div>
      )}

      {/* Audio recorder modal */}
      {iaMode === 'audio' && (
        <AudioRecorderModal
          onClose={() => setIaMode(null)}
          onRecorded={(_blob, transcript) => {
            setIaMode(null)
            if (transcript.trim()) {
              runIAImport('audio', transcript)
            } else {
              setFormError('No se detectó voz. Intentá de nuevo hablando más cerca del micrófono.')
            }
          }}
        />
      )}
    </div>
  )
}


// ── Micro components ──
// ── Section wrapper ──
function Section({ icon, title, badge, badgeColor, children }: {
  icon: string; title: string; badge?: string; badgeColor?: string; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, paddingLeft: 2 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--text-3)' }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{title}</span>
        {badge && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: '#fff',
            background: badgeColor || 'var(--text-3)',
            borderRadius: 99, padding: '1px 6px', marginLeft: 2,
          }}>{badge}</span>
        )}
        <div style={{ flex: 1, height: 1, background: 'var(--border)', marginLeft: 6 }} />
      </div>
      {children}
    </div>
  )
}

// ── Paso row with auto-advance ──
interface PasoRowProps {
  paso: FormPaso
  idx: number
  total: number
  pasoRefs: React.MutableRefObject<Map<number, HTMLInputElement>>
  onUpdate: (id: number, texto: string) => void
  onRemove: (id: number) => void
  onConfirm: (id: number) => void
}

function PasoRow({ paso, idx, total, pasoRefs, onUpdate, onRemove, onConfirm }: PasoRowProps) {
  const ref = useCallback((el: HTMLInputElement | null) => {
    if (el) pasoRefs.current.set(paso.id, el)
    else pasoRefs.current.delete(paso.id)
  }, [paso.id, pasoRefs])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      borderBottom: idx < total - 1 ? '1px solid var(--border)' : 'none',
    }}>
      <span style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
        width: 28, textAlign: 'center', flexShrink: 0,
        padding: '9px 0 9px 4px',
      }}>{idx + 1}.</span>
      <input
        ref={ref}
        value={paso.texto}
        onChange={e => onUpdate(paso.id, e.target.value)}
        placeholder={idx === 0 ? 'Salpimentar el lomo…' : 'Siguiente paso…'}
        enterKeyHint="next"
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onConfirm(paso.id)
          }
        }}
        style={{
          flex: 1, border: 'none', background: 'transparent', outline: 'none',
          padding: '9px 8px', fontSize: 12, fontFamily: 'inherit',
          color: 'var(--text-1)', minWidth: 0,
        }}
      />
      {total > 1 && (
        <button onClick={() => onRemove(paso.id)} style={{ ...btnClear, padding: '8px', opacity: .3 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-3)' }}>close</span>
        </button>
      )}
    </div>
  )
}

function KpiBox({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.45)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 2 }}>{label}</div>
    </div>
  )
}

// Forma de RecetaCard sin datos (S5.3) — reemplaza el "Cargando recetas…"
// centrado, que saltaba a la lista completa de golpe.
function RecetaCardSkeleton() {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
      <Skeleton width="55%" height={14} style={{ marginBottom: 8 }} />
      <Skeleton width="35%" height={11} style={{ marginBottom: 12 }} />
      <div style={{ display: 'flex', gap: 12 }}>
        <Skeleton width={50} height={11} />
        <Skeleton width={50} height={11} />
        <Skeleton width={50} height={11} />
      </div>
    </div>
  )
}

function RecetaCard({ receta: r, isDraft, onPublish, onCompleteIA, recetasPorId }: { receta: RecetaConCosto; isDraft?: boolean; onPublish?: () => void; onCompleteIA?: () => void; recetasPorId?: Map<string, RecetaConCosto> }) {
  const fc = r.food_cost
  const sinIngredientes = (r.ingredientes?.length ?? 0) === 0
  // Escala N0-N3 (lib/recetas/estandarizacion.ts) — reemplaza el binario
  // "SIN PESO NETO" (sep 2026): una receta puede tener peso_total_g cargado
  // y aun así no estar verificada si le faltan costos de ingredientes.
  // No se muestra en drafts (ya tienen su propio badge BORRADOR, y siempre
  // topean en N1 — mostrar N1 ahí sería redundante).
  const diagReceta = useMemo(() => isDraft ? null : nivelDeReceta(r, recetasPorId), [r, recetasPorId, isDraft])
  return (
    <div style={{ position: 'relative' }}>
      <Link href={`/recetario/${r.id}`} style={{ textDecoration: 'none', display: 'block', background: r.es_plato && !isDraft ? 'rgba(67,97,160,.035)' : 'var(--surface)', border: isDraft ? '1px solid rgba(245,158,11,.3)' : r.es_plato ? '1px solid rgba(67,97,160,.35)' : '1px solid var(--border)', borderRadius: 14, padding: isDraft && onCompleteIA ? '14px 14px 44px' : '14px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{r.nombre}</span>
              {isDraft && (
                <span style={{
                  fontSize: 9, fontWeight: 700, color: 'var(--amber-fg)', background: 'rgba(245,158,11,.15)',
                  border: '1px solid rgba(245,158,11,.3)', borderRadius: 4, padding: '1px 6px',
                }}>BORRADOR</span>
              )}
              {r.es_plato && !isDraft && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: 9, fontWeight: 700, color: 'var(--accent)', background: 'rgba(67,97,160,.1)',
                  border: '1px solid rgba(67,97,160,.28)', borderRadius: 4, padding: '1px 6px',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 11 }}>restaurant</span>
                  PLATO
                </span>
              )}
              {diagReceta && (
                <NivelBadge nivel={diagReceta.nivel} title={diagReceta.faltantes.join(' · ') || 'Peso pesado y costo de factura verificados'} />
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
              {normalizeCategoria(r.categoria)}
              {(r.porciones ?? 0) > 1 && ` · ${r.porciones} porc.${(() => { const p = calcPesoPorcion(r.ingredientes || [], r.porciones ?? 0); return p ? ` · ${formatPeso(p)}` : '' })()}`}
              {(r.tiempo_min ?? 0) > 0 && ` · ${r.tiempo_min} min`}
            </div>
          </div>
          {(r.precio_venta ?? 0) > 0 && !isDraft && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: fcColor(fc.food_cost_pct), fontFamily: "'DM Mono', monospace" }}>{fc.food_cost_pct.toFixed(1)}%</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>FC</div>
            </div>
          )}
        </div>
        {(r.precio_venta ?? 0) > 0 && !isDraft && (
          <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
            <span style={{ color: 'var(--text-3)' }}>Costo: <b style={{ color: 'var(--text-2)', fontFamily: "'DM Mono', monospace" }}>${fc.costo_porcion.toFixed(0)}</b></span>
            <span style={{ color: 'var(--text-3)' }}>Venta: <b style={{ color: 'var(--text-2)', fontFamily: "'DM Mono', monospace" }}>${(r.precio_venta ?? 0).toLocaleString('es-AR')}</b></span>
            <span style={{ color: 'var(--text-3)' }}>Margen: <b style={{ color: fc.margen_bruto > 0 ? '#4ade80' : '#ef4444', fontFamily: "'DM Mono', monospace" }}>${fc.margen_bruto.toFixed(0)}</b></span>
          </div>
        )}
        {sinIngredientes && (
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>warning</span>Sin ingredientes cargados
          </div>
        )}
      </Link>

      {/* Botones de acción para borradores */}
      {isDraft && (
        <div style={{ position: 'absolute', bottom: 8, left: 10, right: 10, display: 'flex', gap: 6 }}>
          {onCompleteIA && (
            <button
              onClick={e => { e.stopPropagation(); e.preventDefault(); onCompleteIA() }}
              style={{
                flex: 1, background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.3)',
                borderRadius: 8, padding: '5px 10px', fontSize: 10, fontWeight: 700,
                color: 'var(--amber-fg)', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>auto_awesome</span>
              {sinIngredientes ? 'Cargar con IA' : 'Actualizar con IA'}
            </button>
          )}
          {onPublish && (
            <button
              onClick={e => { e.stopPropagation(); e.preventDefault(); onPublish() }}
              style={{
                background: 'var(--navy)', border: 'none', borderRadius: 8,
                padding: '5px 10px', fontSize: 10, fontWeight: 700, color: '#fff',
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>publish</span>
              Publicar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// CARGA RÁPIDA — crear una receta tipeando ingredientes/subrecetas al toque,
// sin pasar por el wizard completo (foto, IA, pasos). Food cost en vivo.
// ════════════════════════════════════════════════════════════════════
function CargaRapidaScreen({ categorias, stockProductos, recetasDisponibles, agregarReceta, onClose, onCreated }: {
  categorias: string[]
  stockProductos: { id: string; nombre: string; unidad: string; precio_unitario: number }[]
  recetasDisponibles: RecetaConCosto[]
  agregarReceta: (datos: any, ingredientesData?: any) => Promise<string>
  onClose: () => void
  onCreated: (id: string, asDraft?: boolean) => void
}) {
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState('')
  const [porciones, setPorciones] = useState('1')
  const [precioVenta, setPrecioVenta] = useState('')
  const [filas, setFilas] = useState<FilaIngredienteRapido[]>([nuevaFilaRapida()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(publicar: boolean) {
    if (!nombre.trim()) { setError('Ponele un nombre a la receta'); return }
    setSaving(true)
    setError(null)
    try {
      const nuevaId = await agregarReceta({
        nombre: nombre.trim(),
        categoria: categoria.trim() || 'Otros',
        porciones: parseInt(porciones) || 1,
        precio_venta: parseFloat(precioVenta.replace(',', '.')) || 0,
        status: publicar ? 'published' : 'draft',
        activa: true,
      }, filasToIngredientesData(filas, stockProductos))
      onCreated(nuevaId, !publicar)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally { setSaving(false) }
  }

  return (
    <PageTransition>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={onClose} style={btnClear}><span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.7)', fontSize: 22 }}>arrow_back</span></button>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Carga rápida</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>Ingredientes/subrecetas al toque</div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 24px' }}>
          <Section icon="edit_note" title="Datos de la receta">
            <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', padding: 12 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <input autoFocus value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre de la receta *" style={{ ...inp, flex: 2, fontWeight: 600, fontSize: 13 }} />
                <div style={{ flex: 1 }}>
                  <select
                    value={CATEGORIAS_RECETA.includes(categoria) ? categoria : (categoria ? '__otra' : '')}
                    onChange={e => { if (e.target.value !== '__otra') setCategoria(e.target.value) }}
                    style={{ ...inp, fontSize: 11 }}
                  >
                    <option value="">Categoría…</option>
                    {(categorias.length ? categorias : CATEGORIAS_RECETA).map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="__otra">Otra…</option>
                  </select>
                  {(!CATEGORIAS_RECETA.includes(categoria) && categoria) && (
                    <input value={categoria} onChange={e => setCategoria(e.target.value)} placeholder="Nombre de categoría" style={{ ...inp, fontSize: 11, marginTop: 4 }} />
                  )}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={lbl}>Porciones</span>
                  <input type="number" inputMode="numeric" min="1" value={porciones} onChange={e => setPorciones(e.target.value)} style={{ ...inp, textAlign: 'center', padding: '7px 4px' }} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={lbl}>Precio venta $</span>
                  <input type="text" inputMode="decimal" value={precioVenta} onChange={e => setPrecioVenta(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="—" style={{ ...inp, textAlign: 'center', padding: '7px 4px' }} />
                </label>
              </div>
            </div>
          </Section>

          <Section icon="restaurant" title="Ingredientes / subrecetas">
            <TotalesRapidosBar filas={filas} porciones={parseInt(porciones) || 1} precioVenta={parseFloat(precioVenta.replace(',', '.')) || 0} />
            <CargaRapidaIngredientes filas={filas} onChange={setFilas} stockProductos={stockProductos} recetasDisponibles={recetasDisponibles} />
          </Section>

          {error && <div style={{ color: 'var(--red-fg)', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => guardar(false)} disabled={saving}
              style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: 'var(--navy)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Guardando…' : 'Guardar como idea'}
            </button>
            <button onClick={() => guardar(true)} disabled={saving}
              style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-1)', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit' }}>
              Publicar directo
            </button>
          </div>
        </div>
      </div>
    </PageTransition>
  )
}

const btnClear: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }
const lbl: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }
const inp: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', width: '100%', boxSizing: 'border-box' as const }
const iaCardBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'rgba(28,45,74,.06)', border: 'none', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const, transition: 'background .15s' }
const iaCardIcon: React.CSSProperties = { fontSize: 22, color: 'var(--accent)', flexShrink: 0, opacity: 0.8 }
const iaCardLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }

// ════════════════════════════════════════════════════════════════════
// VINCULAR STOCK DRAWER
// ════════════════════════════════════════════════════════════════════

type LinkMatch = {
  nombre_ingrediente: string
  ingrediente_ids: string[]
  receta_nombres: string[]
  producto_id: string
  nombre_producto: string
  precio_unitario: number
  unidad_producto: string
  confianza: 'exacto' | 'parcial' | 'fuzzy'
}

type LinkSinMatch = {
  nombre_ingrediente: string
  ingrediente_ids: string[]
  receta_nombres: string[]
}

function VincularStockDrawer({ restauranteId, onClose }: { restauranteId: string; onClose: () => void }) {
  const [fase, setFase] = useState<'idle' | 'cargando' | 'revision' | 'aplicando' | 'done'>('idle')
  const [matches, setMatches] = useState<LinkMatch[]>([])
  const [sinMatch, setSinMatch] = useState<LinkSinMatch[]>([])
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set())
  const [vinculados, setVinculados] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const confianzaColor = { exacto: '#10b981', parcial: '#f59e0b', fuzzy: '#f97316' }
  const confianzaLabel = { exacto: 'Exacto', parcial: 'Parcial', fuzzy: 'Aproximado' }

  async function buscar() {
    setFase('cargando')
    setError(null)
    try {
      const res = await fetch('/api/recetas/auto-link-ingredientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurante_id: restauranteId }),
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()
      setMatches(data.matches ?? [])
      setSinMatch(data.sin_match ?? [])
      setExcluidos(new Set())
      setFase('revision')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al buscar')
      setFase('idle')
    }
  }

  async function aplicar() {
    setFase('aplicando')
    setError(null)
    const links = matches
      .filter(m => !excluidos.has(m.nombre_ingrediente))
      .map(m => ({ ingrediente_ids: m.ingrediente_ids, producto_id: m.producto_id }))
    try {
      const res = await fetch('/api/recetas/auto-link-ingredientes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links }),
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()
      setVinculados(data.vinculados ?? 0)
      setFase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al aplicar')
      setFase('revision')
    }
  }

  const matchesActivos = matches.filter(m => !excluidos.has(m.nombre_ingrediente))

  return (
    <>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: '20px 16px 14px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(255,255,255,.6)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
        </button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Vincular ingredientes con stock</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Food cost automático</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

        {/* Idle */}
        {fase === 'idle' && (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(16,185,129,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#10b981' }}>link</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>Vinculación automática</div>
            <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 24 }}>
              Analiza todos los ingredientes del recetario y los vincula automáticamente con los productos de stock usando coincidencia de nombre. Una vez vinculados, el food cost se actualiza solo cuando cambian los precios.
            </p>
            <button
              onClick={buscar}
              style={{ background: '#10b981', border: 'none', borderRadius: 12, padding: '13px 28px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Buscar coincidencias
            </button>
          </div>
        )}

        {/* Cargando */}
        {fase === 'cargando' && (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-2)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#10b981', display: 'block', marginBottom: 12 }}>sync</span>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Analizando ingredientes…</div>
          </div>
        )}

        {/* Revisión */}
        {fase === 'revision' && (
          <>
            {/* Resumen */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <div style={{ background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981' }}>{matches.length}</div>
                <div style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase' }}>Con coincidencia</div>
              </div>
              <div style={{ background: 'rgba(148,163,184,.08)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-2)' }}>{sinMatch.length}</div>
                <div style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase' }}>Sin coincidencia</div>
              </div>
            </div>

            {matches.length === 0 && sinMatch.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-3)', fontSize: 13 }}>
                Todos los ingredientes ya están vinculados.
              </div>
            )}

            {/* Lista de matches */}
            {matches.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
                  Vincular automáticamente
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                  {matches.map(m => {
                    const excluido = excluidos.has(m.nombre_ingrediente)
                    return (
                      <div key={m.nombre_ingrediente} style={{ background: excluido ? 'var(--bg)' : 'rgba(16,185,129,.05)', border: `1px solid ${excluido ? 'var(--border)' : 'rgba(16,185,129,.2)'}`, borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 10, opacity: excluido ? 0.5 : 1, transition: 'all .15s' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nombre_ingrediente}</span>
                            <span style={{ fontSize: 9, fontWeight: 700, color: confianzaColor[m.confianza], background: `${confianzaColor[m.confianza]}18`, borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>{confianzaLabel[m.confianza]}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#10b981' }}>arrow_forward</span>
                            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{m.nombre_producto}</span>
                            <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700, marginLeft: 4 }}>${m.precio_unitario.toLocaleString('es-AR')}/{m.unidad_producto}</span>
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                            {m.ingrediente_ids.length} ingrediente{m.ingrediente_ids.length > 1 ? 's' : ''} en {m.receta_nombres.slice(0, 2).join(', ')}{m.receta_nombres.length > 2 ? ` +${m.receta_nombres.length - 2}` : ''}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const next = new Set(excluidos)
                            if (excluido) { next.delete(m.nombre_ingrediente) } else { next.add(m.nombre_ingrediente) }
                            setExcluidos(next)
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0, marginTop: 2 }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: excluido ? 'var(--text-3)' : '#10b981' }}>
                            {excluido ? 'toggle_off' : 'toggle_on'}
                          </span>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Sin match */}
            {sinMatch.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
                  Sin coincidencia en stock
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
                  {sinMatch.map(s => (
                    <div key={s.nombre_ingrediente} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{s.nombre_ingrediente}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{s.receta_nombres.slice(0, 2).join(', ')}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {error && <div style={{ fontSize: 12, color: '#ef4444', padding: '8px 12px', background: 'var(--red-bg)', borderRadius: 8, marginBottom: 12 }}>{error}</div>}
          </>
        )}

        {/* Aplicando */}
        {fase === 'aplicando' && (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-2)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#10b981', display: 'block', marginBottom: 12 }}>sync</span>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Aplicando vínculos…</div>
          </div>
        )}

        {/* Done */}
        {fase === 'done' && (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(16,185,129,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#10b981' }}>check_circle</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>
              {vinculados} ingrediente{vinculados !== 1 ? 's' : ''} vinculado{vinculados !== 1 ? 's' : ''}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 24 }}>
              El food cost se actualizará automáticamente cuando cambien los precios en stock.
            </p>
            {sinMatch.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 16 }}>
                {sinMatch.length} ingrediente{sinMatch.length !== 1 ? 's' : ''} sin producto en stock — agregalos primero para vincularlos.
              </div>
            )}
            <button onClick={onClose} style={{ background: 'var(--navy)', border: 'none', borderRadius: 12, padding: '12px 28px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
              Cerrar
            </button>
          </div>
        )}
      </div>

      {/* Footer con botón Aplicar */}
      {fase === 'revision' && matchesActivos.length > 0 && (
        <div style={{ padding: '12px 16px 28px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
          <button
            onClick={aplicar}
            style={{ width: '100%', background: '#10b981', border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Aplicar {matchesActivos.length} vínculo{matchesActivos.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </>
  )
}
