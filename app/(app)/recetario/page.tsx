'use client'

import PageTransition from '@/components/PageTransition'
import { motion } from 'motion/react'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useRecetas, calcFoodCost, type RecetaConCosto } from '@/lib/hooks/useRecetas'
import { useStock } from '@/lib/hooks/useStock'
import { useCategoriasProducto } from '@/lib/hooks/useCategoriasProducto'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { FC_ALERT_HIGH, FC_ALERT_OK } from '@/lib/constants'
import ImageCropModal from '@/components/ui/ImageCropModal'
import { exportarExcel, fechaArchivo } from '@/lib/exportar'
import ImportadorFichasTecnicas from '@/components/importador/ImportadorFichasTecnicas'
const UNIDADES = ['kg', 'g', 'l', 'ml', 'u']

// ── Tipos para importación IA ──
type ImportMode = 'camera' | 'gallery' | 'file' | 'audio' | 'text' | 'glink' | null

// Raw API response shape
interface IAApiResult {
  nombre_sugerido?: string
  categoria_sugerida?: string
  porciones?: number
  tiempo_minutos?: number
  ingredientes: { nombre: string; cantidad: string; unidad: string }[]
  procedimiento: string[]
  _demo?: boolean
}

// Internal form shape
interface IAResult {
  nombre?: string
  categoria?: string
  porciones?: number
  tiempo_min?: number
  ingredientes: { nombre: string; cantidad: string; unidad: string }[]
  pasos: string[]
}

function apiToForm(data: IAApiResult): IAResult {
  return {
    nombre: data.nombre_sugerido,
    categoria: data.categoria_sugerida,
    porciones: data.porciones,
    tiempo_min: data.tiempo_minutos,
    ingredientes: data.ingredientes || [],
    pasos: data.procedimiento || [],
  }
}

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

async function callRecetaImport(mode: 'image' | 'text' | 'google_url', payload: { text?: string; image_base64?: string; media_type?: string; google_url?: string }): Promise<IAApiResult> {
  const res = await fetch('/api/recetas/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'import', mode, ...payload }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error || `Error ${res.status}`)
  }
  return res.json()
}

async function callRecetaImportMulti(mode: 'image' | 'text' | 'google_url', payload: { text?: string; image_base64?: string; media_type?: string; google_url?: string }): Promise<{ recetas: IAApiResult[]; _demo?: boolean }> {
  const res = await fetch('/api/recetas/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'import_multi', mode, ...payload }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error || `Error ${res.status}`)
  }
  return res.json()
}

async function callRecetaAdjust(currentRecipe: IAApiResult, userMessage: string): Promise<IAApiResult> {
  const res = await fetch('/api/recetas/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'adjust', currentRecipe, userMessage }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error || `Error ${res.status}`)
  }
  return res.json()
}

/** Parsea "0,3" o "0.3" → 0.3 */
function parseNum(s: string | number | null | undefined): number {
  if (s === null || s === undefined) return 0
  if (typeof s === 'number') return isNaN(s) ? 0 : s
  return parseFloat(String(s).replace(',', '.')) || 0
}

function toGramos(cantidad: number, unidad: string): number {
  const u = (unidad || '').toLowerCase().trim()
  if (u === 'kg') return cantidad * 1000
  if (u === 'g') return cantidad
  if (u === 'l' || u === 'lt' || u === 'lts' || u === 'l') return cantidad * 1000
  if (u === 'ml') return cantidad
  return 0
}

function calcPesoPorcion(ingredientes: { cantidad: number | string; unidad: string }[], porciones: number): number | null {
  if (!porciones || porciones <= 0) return null
  const totalG = ingredientes.reduce((s, i) => s + toGramos(parseNum(i.cantidad), i.unidad), 0)
  if (totalG <= 0) return null
  return Math.round(totalG / porciones)
}

function formatPeso(gramos: number): string {
  if (gramos >= 1000) return `${(gramos / 1000).toFixed(gramos % 1000 === 0 ? 0 : 1)}kg/u`
  return `${gramos}g/u`
}

function fcColor(pct: number) {
  if (pct >= FC_ALERT_HIGH) return '#ef4444'
  if (pct >= FC_ALERT_OK) return '#f59e0b'
  return '#4ade80'
}

// ── Form types ──
interface FormIng {
  id: number
  cantidad: string
  unidad: string
  nombre: string
  costo_unitario: number
}

interface FormPaso {
  id: number
  texto: string
}

let _id = 0
function uid() { return ++_id }

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2 } },
}

export default function RecetarioPage() {
  const router = useRouter()
  const RESTAURANTE_ID = useRestauranteId()
  const { recetas, loading, error, agregarReceta, agregarIngrediente, actualizarReceta, eliminarReceta, publicarReceta } = useRecetas()
  const { productos: stockProductos, agregarProducto } = useStock()
  const { categorias: catDB } = useCategoriasProducto()
  const { puedeEditar, isAdmin } = usePermisos()
  const canEdit = isAdmin || puedeEditar('recetas')

  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [creando, setCreando] = useState(false)
  const [tab, setTab] = useState<'recetas' | 'ideas'>('recetas')

  // Allow Kitchen Coach tour to switch tabs
  useEffect(() => {
    function handleSetTab(e: Event) {
      const { tab: t } = (e as CustomEvent<{ tab: string }>).detail
      if (t === 'recetas' || t === 'ideas') { setTab(t); setCatFilter('') }
    }
    window.addEventListener('kc-set-tab', handleSetTab)
    return () => window.removeEventListener('kc-set-tab', handleSetTab)
  }, [])
  const [showFichas, setShowFichas] = useState(false)
  const [showLink, setShowLink] = useState(false)

  // Borrador a enriquecer con IA (abre NuevaFichaScreen pre-poblado)
  const [enrichingDraft, setEnrichingDraft] = useState<typeof recetas[0] | null>(null)

  // Separar publicadas vs borradores
  const recetasPublicadas = useMemo(() => recetas.filter(r => r.status !== 'draft'), [recetas])
  const recetasDraft = useMemo(() => recetas.filter(r => r.status === 'draft'), [recetas])

  function exportXLSX() {
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
    exportarExcel(`recetario_${fechaArchivo()}.xlsx`, [
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
    Array.from(new Set(recetasPublicadas.map(r => r.categoria).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')),
    [recetasPublicadas])

  const activeList = tab === 'recetas' ? recetasPublicadas : recetasDraft

  const filtered = useMemo(() => {
    let list = activeList
    if (catFilter) list = list.filter(r => r.categoria === catFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(r => r.nombre.toLowerCase().includes(q))
    }
    return list
  }, [activeList, catFilter, search])

  const fcPromedio = useMemo(() => {
    const conPrecio = recetasPublicadas.filter(r => (r.precio_venta ?? 0) > 0)
    if (conPrecio.length === 0) return 0
    return conPrecio.reduce((s, r) => s + r.food_cost.food_cost_pct, 0) / conPrecio.length
  }, [recetasPublicadas])

  const nAlertas = useMemo(() => recetasPublicadas.filter(r => r.food_cost.food_cost_pct >= FC_ALERT_HIGH).length, [recetasPublicadas])

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

  if (creando) {
    return (
      <NuevaFichaScreen
        categorias={categorias}
        stockProductos={stockProductos}
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
        onClose={() => { setCreando(false); setEnrichingDraft(null) }}
        onCreated={(id, asDraft) => {
          setCreando(false)
          setEnrichingDraft(null)
          if (asDraft) { setTab('ideas') }
          else { router.push(`/recetario/${id}`) }
        }}
      />
    )
  }

  return (
    <PageTransition>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: '46px 16px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => router.back()} style={btnClear}><span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.7)', fontSize: 22 }}>arrow_back</span></button>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Recetario</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>Fichas técnicas · Food cost</div>
            </div>
          </div>
          {isAdmin && (
          <button
            onClick={exportXLSX}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 8, background: 'rgba(255,255,255,.15)', color: '#fff', border: '1px solid rgba(255,255,255,.25)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>table_view</span>
            Exportar
          </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, padding: '0 10px', height: 34 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'rgba(255,255,255,.4)' }}>search</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar receta…" style={{ border: 'none', background: 'none', outline: 'none', fontSize: 12, fontFamily: 'inherit', color: '#fff', width: '100%' }} />
          {search && <button onClick={() => setSearch('')} style={{ ...btnClear, color: 'rgba(255,255,255,.5)', fontSize: 16 }}>×</button>}
        </div>
      </div>

      {/* ── Tabs: Recetas | Ideas ── */}
      <div data-coach-target="recetario-tabs" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 14px', display: 'flex', gap: 0, flexShrink: 0 }}>
        <button
          onClick={() => { setTab('recetas'); setCatFilter('') }}
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
          onClick={() => { setTab('ideas'); setCatFilter('') }}
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

      {/* Category tabs (solo en pestaña Recetas) */}
      {tab === 'recetas' && categoriasFiltro.length > 0 && (
        <div data-coach-target="recetario-categorias" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '8px 14px', display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0, scrollbarWidth: 'none' }}>
          <CatTab label="Todas" active={!catFilter} onClick={() => setCatFilter('')} />
          {categoriasFiltro.map(c => <CatTab key={c} label={c} active={catFilter === c} onClick={() => setCatFilter(catFilter === c ? '' : c)} />)}
        </div>
      )}

      {/* Body */}
      <div data-coach-target="recetario-lista" style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '12px 14px 80px' }}>
        {loading ? (
          <EmptyMsg icon="hourglass_empty" text="Cargando recetas…" />
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}><p style={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>{error}</p></div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{tab === 'ideas' ? '💡' : '📖'}</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {tab === 'ideas'
                ? 'Sin ideas guardadas'
                : activeList.length === 0 ? 'Sin recetas aún' : 'Sin resultados'}
            </div>
            {tab === 'recetas' && activeList.length === 0 && (
              <p style={{ fontSize: 11, marginTop: 6, color: '#64748b' }}>Tocá "Nueva receta" para empezar</p>
            )}
            {tab === 'ideas' && (
              <p style={{ fontSize: 11, marginTop: 6, color: '#64748b' }}>Podés guardar recetas como borrador mientras las desarrollás</p>
            )}
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            {filtered.map(r => (
              <motion.div key={r.id} variants={itemVariants}>
                <RecetaCard
                  receta={r}
                  isDraft={r.status === 'draft'}
                  onPublish={r.status === 'draft' ? () => publicarReceta(r.id) : undefined}
                  onCompleteIA={r.status === 'draft' ? () => { setEnrichingDraft(r); setCreando(true) } : undefined}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* ── Botones NUEVA RECETA + IMPORTAR FICHAS ── */}
      <div data-coach-target="recetario-acciones" style={{ position: 'absolute', bottom: 110, left: 14, right: 14, zIndex: 10, display: 'flex', gap: 10 }}>
        <button
          data-coach-target="recetario-nueva"
          onClick={() => setCreando(true)}
          style={{
            flex: 1, background: 'linear-gradient(135deg, var(--navy), #4361a0)',
            border: 'none', borderRadius: 16, padding: '14px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 6px 24px rgba(28,45,74,.45)', cursor: 'pointer',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#fff' }}>add_circle</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', fontFamily: 'inherit' }}>Nueva receta</span>
        </button>
        {isAdmin && (
        <button
          data-coach-target="recetario-importar"
          onClick={() => setShowFichas(true)}
          title="Importar fichas técnicas"
          style={{
            background: 'var(--surface)', border: '1.5px solid var(--border)',
            borderRadius: 16, padding: '14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,.08)', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--accent)' }}>upload_file</span>
        </button>
        )}
        <button
          data-coach-target="recetario-vincular"
          onClick={() => setShowLink(true)}
          title="Vincular ingredientes con stock"
          style={{
            background: 'var(--surface)', border: '1.5px solid var(--border)',
            borderRadius: 16, padding: '14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,.08)', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#10b981' }}>link</span>
        </button>
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
                Enviar a IA ✨
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════
// PANTALLA DE RESULTADO IA — tipo chat
// Muestra la imagen enviada + respuesta de Claude con formato legible
// Botones: "Cargar al formulario" y "Pedir ajustes"
// ════════════════════════════════════════════════════════════════════

interface IAResultScreenProps {
  result: IAApiResult
  previewUrl: string | null  // data URL of uploaded image
  inputText: string | null   // text that was sent
  onAccept: (r: IAResult) => void
  onClose: () => void
  // Fix 1: direct save
  agregarReceta?: (d: any, ingredientes?: any[]) => Promise<string>
  agregarProducto?: (datos: any) => Promise<void>
  stockProductos?: { nombre: string; unidad: string }[]
  restauranteId?: string
  onSaved?: (id: string) => void
  catSugeridas?: string[]
}

function IAResultScreen({ result, previewUrl, inputText, onAccept, onClose, agregarReceta, agregarProducto, stockProductos, onSaved, catSugeridas = [] }: IAResultScreenProps) {
  const [adjustText, setAdjustText] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [current, setCurrent] = useState<IAApiResult>(result)
  const [chatHistory, setChatHistory] = useState<{ role: 'ia' | 'user'; text: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Editable follow-up fields
  const [editPorciones, setEditPorciones] = useState(String(result.porciones || ''))
  const [editTiempo, setEditTiempo] = useState(String(result.tiempo_minutos || ''))
  const [editCategoria, setEditCategoria] = useState(result.categoria_sugerida || '')
  const [extraNotes, setExtraNotes] = useState('')

  // Sync when current changes
  useEffect(() => {
    setEditPorciones(String(current.porciones || ''))
    setEditTiempo(String(current.tiempo_minutos || ''))
    setEditCategoria(current.categoria_sugerida || '')
  }, [current])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [chatHistory, current])

  async function handleAdjust() {
    if (!adjustText.trim()) return
    const msg = adjustText.trim()
    setAdjustText('')
    setChatHistory(prev => [...prev, { role: 'user', text: msg }])
    setAdjusting(true)
    setError(null)
    try {
      const updated = await callRecetaAdjust(current, msg)
      setCurrent(updated)
      setChatHistory(prev => [...prev, { role: 'ia', text: '✅ Receta actualizada con tus cambios.' }])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al ajustar')
    } finally {
      setAdjusting(false)
    }
  }

  const ing = current.ingredientes || []
  const pasos = current.procedimiento || []

  // Fix 1: Guardar directamente desde la pantalla de resultado IA
  async function handleGuardarDirecto() {
    if (!agregarReceta) { onAccept(apiToForm(current)); return }
    setSaving(true)
    setError(null)
    try {
      const procedimiento = (current.procedimiento || []).map((p, i) => `${i + 1}. ${p}`).join('\n') || ''
      const ingredientesData = (current.ingredientes || []).map(ing => ({
        nombre: String(ing.nombre || 'Ingrediente'),
        cantidad: parseNum(ing.cantidad),
        unidad: ing.unidad || 'u',
        costo_unitario: 0,
        unidad_costo: ing.unidad || 'u',
      }))
      const id = await agregarReceta({
        nombre: current.nombre_sugerido || 'Receta importada',
        categoria: editCategoria || current.categoria_sugerida || 'Otros',
        porciones: Math.max(1, parseNum(editPorciones) || parseNum(current.porciones) || 1),
        tiempo_min: Math.max(0, parseNum(editTiempo) || parseNum(current.tiempo_minutos) || 0),
        precio_venta: 0,
        procedimiento,
        activa: true,
        status: 'published' as const,
      }, ingredientesData)
      // Fix 2: Sync ingredientes faltantes al stock
      if (agregarProducto && stockProductos) {
        const stockNombres = new Set(stockProductos.map(p => p.nombre.toLowerCase().trim()))
        for (const ing of ingredientesData) {
          if (!stockNombres.has(ing.nombre.toLowerCase().trim())) {
            try {
              await agregarProducto({
                nombre: ing.nombre,
                categoria: 'Sin categoría',
                unidad: ing.unidad,
                stock_actual: 0,
                stock_minimo: 0,
                stock_critico: 0,
                precio_unitario: 0,
                activo: true,
                proveedor_id: null,
              })
            } catch { /* ignorar errores individuales */ }
          }
        }
      }
      if (onSaved) onSaved(id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar receta')
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: '44px 12px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
              <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.7)', fontSize: 20 }}>arrow_back</span>
            </button>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Resultado de IA</span>
            {current._demo && <span style={{ fontSize: 9, background: 'rgba(251,191,36,.2)', color: '#fbbf24', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>DEMO</span>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => {
                const form = apiToForm(current)
                form.porciones = parseInt(editPorciones) || form.porciones
                form.tiempo_min = parseInt(editTiempo) || form.tiempo_min
                form.categoria = editCategoria || form.categoria
                onAccept(form)
              }}
              style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.8)', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Editar
            </button>
            <button
              onClick={handleGuardarDirecto}
              disabled={saving}
              style={{ background: saving ? 'rgba(74,222,128,.4)' : '#4ade80', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#0a2a0a', cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {saving ? '…' : <><span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span> Guardar</>}
            </button>
          </div>
        </div>
      </div>

      {/* Chat body */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '12px 10px 12px' }}>

        {/* User message bubble (image or text) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <div style={{
            maxWidth: '80%', background: 'var(--navy)', borderRadius: '16px 16px 4px 16px',
            padding: previewUrl ? 6 : 12, color: '#fff', fontSize: 13,
          }}>
            {previewUrl ? (
              <img src={previewUrl} alt="Enviado" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 12, display: 'block' }} />
            ) : inputText ? (
              <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{inputText.length > 200 ? inputText.substring(0, 200) + '…' : inputText}</p>
            ) : (
              <p style={{ margin: 0, opacity: .7 }}>Archivo enviado</p>
            )}
          </div>
        </div>

        {/* IA response bubble */}
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
          <div style={{
            maxWidth: '90%', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '16px 16px 16px 4px', padding: '14px 16px',
          }}>
            {/* Sparkle icon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 14 }}>✨</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Claude</span>
            </div>

            <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.4 }}>
              Encontré esta receta: <em>{current.nombre_sugerido || 'Sin nombre'}</em>
            </p>

            {/* Ingredientes */}
            <div style={{ marginBottom: 12 }}>
              <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>📋 Ingredientes:</p>
              {ing.map((item, i) => (
                <p key={i} style={{ margin: '2px 0 2px 8px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  • {item.cantidad} {item.unidad} — {item.nombre}
                </p>
              ))}
            </div>

            {/* Procedimiento */}
            <div style={{ marginBottom: 12 }}>
              <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>👨‍🍳 Procedimiento:</p>
              {pasos.map((paso, i) => (
                <p key={i} style={{ margin: '2px 0 2px 8px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  {i + 1}. {paso}
                </p>
              ))}
            </div>

            {/* Meta */}
            <div style={{
              display: 'flex', gap: 12, padding: '8px 0 0', borderTop: '1px solid var(--border)',
              fontSize: 12, color: 'var(--text-3)',
            }}>
              {current.porciones && <span>🍽️ {current.porciones} porc.{(() => { const p = calcPesoPorcion(ing, parseNum(current.porciones)); return p ? ` · ${formatPeso(p)}` : '' })()}</span>}
              {current.tiempo_minutos && <span>⏱️ {current.tiempo_minutos} min</span>}
              {current.categoria_sugerida && <span>📁 {current.categoria_sugerida}</span>}
            </div>
          </div>
        </div>

        {/* ── Preguntas de seguimiento ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
          <div style={{
            maxWidth: '90%', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '16px 16px 16px 4px', padding: '14px 16px',
          }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-1)', lineHeight: 1.5 }}>
              Confirmá estos datos antes de cargar:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>🍽️ Porciones</span>
                <input
                  type="number" inputMode="numeric" min="1"
                  value={editPorciones}
                  onChange={e => setEditPorciones(e.target.value)}
                  placeholder="4"
                  style={iaFieldStyle}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>⏱️ Tiempo (min)</span>
                <input
                  type="number" inputMode="numeric" min="0"
                  value={editTiempo}
                  onChange={e => setEditTiempo(e.target.value)}
                  placeholder="30"
                  style={iaFieldStyle}
                />
              </label>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>📁 Categoría</span>
              <select
                value={editCategoria}
                onChange={e => setEditCategoria(e.target.value)}
                style={{ ...iaFieldStyle, WebkitAppearance: 'none', appearance: 'auto' } as unknown as React.CSSProperties}
              >
                <option value="">Elegir…</option>
                {catSugeridas.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>📝 Notas adicionales</span>
              <input
                value={extraNotes}
                onChange={e => setExtraNotes(e.target.value)}
                placeholder="Agregar ingrediente, cambiar algo…"
                onKeyDown={e => { if (e.key === 'Enter' && extraNotes.trim()) { e.preventDefault(); setAdjustText(extraNotes); setExtraNotes(''); handleAdjust() } }}
                style={iaFieldStyle}
              />
            </label>
          </div>
        </div>

        {/* Chat history (adjustments) */}
        {chatHistory.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
            <div style={{
              maxWidth: '80%', padding: '10px 14px', fontSize: 13, lineHeight: 1.4,
              borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: msg.role === 'user' ? 'var(--navy)' : 'var(--surface)',
              border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
              color: msg.role === 'user' ? '#fff' : 'var(--text-1)',
            }}>
              {msg.text}
            </div>
          </div>
        ))}

        {adjusting && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px 14px 14px 4px', padding: '10px 14px' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-3)' }} />
                <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-3)', animationDelay: '.2s' }} />
                <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-3)', animationDelay: '.4s' }} />
              </div>
            </div>
          </div>
        )}

        {error && <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '6px 10px', marginBottom: 8, fontSize: 11, color: '#ef4444' }}>{error}</div>}
      </div>

      {/* Bottom action bar */}
      <div style={{
        flexShrink: 0, borderTop: '1px solid var(--border)', background: 'var(--surface)',
        padding: '8px 10px calc(env(safe-area-inset-bottom, 0px) + 8px)',
      }}>
        {/* Adjust input */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            value={adjustText}
            onChange={e => setAdjustText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdjust() } }}
            placeholder="Pedí ajustes… ej: sacá la sal, poné 6 porciones"
            disabled={adjusting}
            style={{
              flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
              padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)',
              outline: 'none',
            }}
          />
          <button
            onClick={handleAdjust}
            disabled={!adjustText.trim() || adjusting}
            style={{
              background: adjustText.trim() ? 'var(--navy)' : 'var(--border)',
              border: 'none', borderRadius: 10, width: 42, display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', transition: 'background .15s',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>send</span>
          </button>
        </div>

        {/* Main action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              const form = apiToForm(current)
              form.porciones = parseInt(editPorciones) || form.porciones
              form.tiempo_min = parseInt(editTiempo) || form.tiempo_min
              form.categoria = editCategoria || form.categoria
              onAccept(form)
            }}
            style={{
              flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              padding: '12px 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-2)', cursor: 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
            Editar más
          </button>
          <button
            onClick={handleGuardarDirecto}
            disabled={saving}
            style={{
              flex: 2, background: saving ? 'rgba(74,222,128,.5)' : '#22c55e', border: 'none', borderRadius: 10,
              padding: '12px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: saving ? 'default' : 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: saving ? 0.8 : 1,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{saving ? 'hourglass_empty' : 'check_circle'}</span>
            {saving ? 'Guardando…' : 'Guardar receta'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════
// PANTALLA MULTI-RESULTADO IA — checkboxes + importar seleccionadas
// ════════════════════════════════════════════════════════════════════

interface IAMultiResultScreenProps {
  results: IAApiResult[]
  previewUrl: string | null
  inputText: string | null
  agregarReceta: (d: any, ingredientes?: any[]) => Promise<string>
  agregarIngrediente: (recetaId: string, d: any) => Promise<void>
  agregarProducto?: (datos: any) => Promise<void>
  stockProductos?: { nombre: string; unidad: string }[]
  onDone: (count: number) => void
  onClose: () => void
}

function IAMultiResultScreen({ results, previewUrl, inputText, agregarReceta, agregarIngrediente, agregarProducto, stockProductos, onDone, onClose }: IAMultiResultScreenProps) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(results.map((_, i) => i)))
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  function toggleSelect(idx: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === results.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(results.map((_, i) => i)))
    }
  }

  function toggleExpand(idx: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  async function handleImportSelected() {
    const indices = Array.from(selected).sort((a, b) => a - b)
    if (indices.length === 0) return
    setImporting(true)
    setImportProgress(0)
    setError(null)

    // Fix 2: preparar set de nombres en stock para sync
    const stockNombres = new Set(
      (stockProductos || []).map(p => p.nombre.toLowerCase().trim())
    )

    let imported = 0
    for (const idx of indices) {
      const r = results[idx]
      try {
        const procedimiento = (r.procedimiento || []).map((p, i) => `${i + 1}. ${p}`).join('\n') || ''
        const ingredientesData = (r.ingredientes || []).map(ing => ({
          nombre: String(ing.nombre || 'Ingrediente'),
          cantidad: parseNum(ing.cantidad),
          unidad: ing.unidad || 'u',
          costo_unitario: 0,
          unidad_costo: ing.unidad || 'u',
        }))
        await agregarReceta({
          nombre: r.nombre_sugerido || `Receta importada ${idx + 1}`,
          categoria: r.categoria_sugerida || 'Otros',
          porciones: Math.max(1, parseNum(r.porciones) || 1),
          tiempo_min: Math.max(0, parseNum(r.tiempo_minutos) || 0),
          precio_venta: 0,
          procedimiento,
          activa: true,
          status: 'published' as const,
        }, ingredientesData)
        // Fix 2: sync ingredientes faltantes al stock
        if (agregarProducto) {
          for (const ing of ingredientesData) {
            if (!stockNombres.has(ing.nombre.toLowerCase().trim())) {
              try {
                await agregarProducto({
                  nombre: ing.nombre,
                  categoria: 'Sin categoría',
                  unidad: ing.unidad,
                  stock_actual: 0,
                  stock_minimo: 0,
                  stock_critico: 0,
                  precio_unitario: 0,
                  activo: true,
                  proveedor_id: null,
                })
                stockNombres.add(ing.nombre.toLowerCase().trim()) // evitar duplicados
              } catch { /* ignorar */ }
            }
          }
        }
        imported++
      } catch (e) {
        const msg = e instanceof Error ? e.message : `Error en receta ${idx + 1}`
        console.error(`Error importing recipe ${idx}:`, e)
        setError(`Error al guardar: ${msg}`)
      }
      setImportProgress(imported)
    }
    setImporting(false)
    if (imported > 0) onDone(imported)
  }

  const selectedCount = selected.size
  const categoryCounts: Record<string, number> = {}
  results.forEach(r => {
    const cat = r.categoria_sugerida || 'Otros'
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)', position: 'relative' }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: '44px 12px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
              <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.7)', fontSize: 20 }}>arrow_back</span>
            </button>
            <div>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Recetas encontradas</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginLeft: 8 }}>{results.length} recetas</span>
            </div>
          </div>
        </div>

        {/* Summary strip */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {Object.entries(categoryCounts).map(([cat, count]) => (
            <span key={cat} style={{
              fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 99,
              background: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.7)',
            }}>
              {cat} ({count})
            </span>
          ))}
        </div>
      </div>

      {/* Select all bar */}
      <div style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <button onClick={toggleSelectAll} style={{
          background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 8, padding: 0,
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: selected.size === results.length ? 'var(--navy)' : 'transparent',
            border: selected.size === results.length ? '2px solid var(--navy)' : '2px solid var(--border)',
            transition: 'all .15s',
          }}>
            {selected.size === results.length && (
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>check</span>
            )}
            {selected.size > 0 && selected.size < results.length && (
              <span style={{ width: 10, height: 2, background: 'var(--text-3)', borderRadius: 1 }} />
            )}
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
            {selected.size === results.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
          </span>
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
          {selectedCount} de {results.length}
        </span>
      </div>

      {/* Body — recipe cards with checkboxes */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '10px 14px 120px' }}>
        {/* Source info */}
        {(previewUrl || inputText) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 10px',
            background: 'rgba(28,45,74,.06)', border: '1px solid rgba(28,45,74,.15)', borderRadius: 10,
          }}>
            <span style={{ fontSize: 14 }}>✨</span>
            <span style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}>
              Claude encontró <b>{results.length} recetas</b> en {previewUrl ? 'la imagen' : 'el archivo'}.
              Seleccioná las que querés importar.
            </span>
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#ef4444' }}>
            {error}
          </div>
        )}

        {results.map((r, idx) => {
          const isSelected = selected.has(idx)
          const isExpanded = expanded.has(idx)
          const ingCount = (r.ingredientes || []).length
          const pasosCount = (r.procedimiento || []).length

          return (
            <div key={idx} style={{
              marginBottom: 8, borderRadius: 12, overflow: 'hidden',
              border: isSelected ? '1.5px solid rgba(28,45,74,.5)' : '1px solid var(--border)',
              background: isSelected ? 'rgba(28,45,74,.03)' : 'var(--surface)',
              transition: 'all .15s',
            }}>
              {/* Row: checkbox + name + category + expand */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 0, padding: '10px 10px', cursor: 'pointer',
                }}
                onClick={() => toggleSelect(idx)}
              >
                {/* Checkbox */}
                <div style={{
                  width: 22, height: 22, borderRadius: 6, marginRight: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isSelected ? 'var(--navy)' : 'transparent',
                  border: isSelected ? '2px solid var(--navy)' : '2px solid var(--border)',
                  transition: 'all .15s',
                }}>
                  {isSelected && <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#fff' }}>check</span>}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.nombre_sugerido || `Receta ${idx + 1}`}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{r.categoria_sugerida || '—'}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{ingCount} ing.</span>
                    {r.porciones && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{r.porciones} porc.{(() => { const p = calcPesoPorcion(r.ingredientes || [], parseNum(r.porciones)); return p ? ` · ${formatPeso(p)}` : '' })()}</span>}
                    {r.tiempo_minutos && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{r.tiempo_minutos} min</span>}
                  </div>
                </div>

                {/* Expand toggle */}
                <button
                  onClick={e => { e.stopPropagation(); toggleExpand(idx) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' }}
                >
                  <span className="material-symbols-outlined" style={{
                    fontSize: 18, color: 'var(--text-3)',
                    transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s',
                  }}>expand_more</span>
                </button>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div style={{ padding: '0 12px 12px 44px', borderTop: '1px solid var(--border)' }}>
                  {/* Ingredientes */}
                  {ingCount > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Ingredientes</p>
                      {(r.ingredientes || []).map((ing, i) => (
                        <p key={i} style={{ margin: '1px 0', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}>
                          • {ing.nombre} — {ing.cantidad} {ing.unidad}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Procedimiento */}
                  {pasosCount > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Procedimiento</p>
                      {(r.procedimiento || []).map((paso, i) => (
                        <p key={i} style={{ margin: '1px 0', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}>
                          {i + 1}. {paso}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Bottom import bar — always visible at bottom */}
      <div style={{
        flexShrink: 0,
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        padding: '12px 14px calc(env(safe-area-inset-bottom, 16px) + 12px)',
      }}>
        {importing ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>
              Guardando… {importProgress}/{selectedCount}
            </div>
            <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', background: 'var(--navy)', borderRadius: 2,
                width: `${selectedCount > 0 ? (importProgress / selectedCount) * 100 : 0}%`,
                transition: 'width .3s',
              }} />
            </div>
          </div>
        ) : (
          <button
            onClick={handleImportSelected}
            disabled={selectedCount === 0}
            style={{
              width: '100%', background: selectedCount > 0 ? 'linear-gradient(135deg, var(--navy), #4361a0)' : 'var(--border)',
              border: 'none', borderRadius: 12, padding: '14px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              cursor: selectedCount > 0 ? 'pointer' : 'default',
              boxShadow: selectedCount > 0 ? '0 4px 16px rgba(28,45,74,.35)' : 'none',
              transition: 'all .2s',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fff' }}>check_circle</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'inherit' }}>
              {selectedCount > 0
                ? `Confirmar receta${selectedCount > 1 ? 's' : ''} (${selectedCount})`
                : 'Seleccioná al menos una receta'}
            </span>
          </button>
        )}
      </div>
    </div>
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
  categorias: string[]
  stockProductos: { id: string; nombre: string; unidad: string; precio_unitario: number; categoria: string }[]
  agregarReceta: (d: any, ingredientes?: any[]) => Promise<string>
  agregarIngrediente: (recetaId: string, d: any) => Promise<void>
  agregarProducto: (datos: any) => Promise<void>
  actualizarReceta: (id: string, d: any) => Promise<void>
  initialDraft?: InitialDraft
  onClose: () => void
  onCreated: (id: string, asDraft?: boolean) => void
}

function NuevaFichaScreen({ categorias, stockProductos, agregarReceta, agregarIngrediente, agregarProducto, actualizarReceta, initialDraft, onClose, onCreated }: NuevaFichaProps) {
  const [ings, setIngs] = useState<FormIng[]>(() => [{ id: uid(), cantidad: '', unidad: 'kg', nombre: '', costo_unitario: 0 }])
  const [pasos, setPasos] = useState<FormPaso[]>(() => [{ id: uid(), texto: '' }])
  const [nombre, setNombre] = useState(initialDraft?.nombre || '')
  const [categoria, setCategoria] = useState(initialDraft?.categoria || '')
  const [porciones, setPorciones] = useState(String(initialDraft?.porciones || 1))
  const [tiempoMin, setTiempoMin] = useState(initialDraft?.tiempo_min ? String(initialDraft.tiempo_min) : '')
  const [precioVenta, setPrecioVenta] = useState(initialDraft?.precio_venta ? String(initialDraft.precio_venta) : '')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [activeIngId, setActiveIngId] = useState<number | null>(null)

  // IA import
  const [iaMode, setIaMode] = useState<ImportMode>(null)
  const [iaProcessing, setIaProcessing] = useState(false)
  const [iaTextInput, setIaTextInput] = useState('')
  const [iaGoogleLink, setIaGoogleLink] = useState('')
  const [iaResult, setIaResult] = useState<IAApiResult | null>(null)
  const [iaPreviewUrl, setIaPreviewUrl] = useState<string | null>(null)
  const [iaInputText, setIaInputText] = useState<string | null>(null)
  const [iaMultiResults, setIaMultiResults] = useState<IAApiResult[] | null>(null)
  const [iaCollapsed, setIaCollapsed] = useState(false)
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

  // Food cost live
  const costoTotal = useMemo(() => ings.reduce((s, i) => s + (parseFloat(i.cantidad) || 0) * i.costo_unitario, 0), [ings])
  const porcionesN = parseInt(porciones) || 1
  const precioVentaN = parseNum(precioVenta) || 0
  const costoPorcion = porcionesN > 0 ? costoTotal / porcionesN : 0
  const fcPct = precioVentaN > 0 ? (costoPorcion / precioVentaN) * 100 : 0
  const margen = precioVentaN - costoPorcion

  // Stock name index for quick search
  const stockIndex = useMemo(() => stockProductos.map(p => ({ ...p, lower: p.nombre.toLowerCase() })), [stockProductos])

  // ── Ingrediente operations ──
  const updateIng = useCallback((id: number, patch: Partial<FormIng>) => {
    setIngs(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
  }, [])

  const removeIng = useCallback((id: number) => {
    setIngs(prev => {
      const next = prev.filter(i => i.id !== id)
      return next.length ? next : [{ id: uid(), cantidad: '', unidad: 'kg', nombre: '', costo_unitario: 0 }]
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
      const newRow: FormIng = { id: newId, cantidad: '', unidad: 'kg', nombre: '', costo_unitario: 0 }
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
    try {
      // Determine if this source likely has multiple recipes → use multi endpoint
      const isMultiSource = mode === 'glink' || mode === 'file'

      if (mode === 'text' && typeof data === 'string') {
        setIaInputText(data)
        const result = await callRecetaImport('text', { text: data })
        setIaResult(result)

      } else if ((mode === 'camera' || mode === 'gallery') && data instanceof File) {
        const dataUrl = await fileToDataUrl(data)
        setIaPreviewUrl(dataUrl)
        const { base64, media_type } = await fileToBase64(data)
        const multiRes = await callRecetaImportMulti('image', { image_base64: base64, media_type })
        if (multiRes.recetas.length === 1) {
          handleAcceptIAResult(apiToForm(multiRes.recetas[0]))
        } else {
          setIaMultiResults(multiRes.recetas)
        }

      } else if (mode === 'file' && data instanceof File) {
        if (data.type.startsWith('image/')) {
          const dataUrl = await fileToDataUrl(data)
          setIaPreviewUrl(dataUrl)
          const { base64, media_type } = await fileToBase64(data)
          const multiRes = await callRecetaImportMulti('image', { image_base64: base64, media_type })
          if (multiRes.recetas.length === 1) {
            handleAcceptIAResult(apiToForm(multiRes.recetas[0]))
          } else {
            setIaMultiResults(multiRes.recetas)
          }
        } else if (
          data.name.match(/\.(xlsx|xls|ods|numbers)$/i) ||
          data.type.includes('spreadsheet') ||
          data.type.includes('excel')
        ) {
          setIaInputText(`📊 ${data.name} (${(data.size / 1024).toFixed(0)} KB)`)
          const { base64 } = await fileToBase64(data)
          const multiRes = await callRecetaImportMulti('text', { text: `__XLSX_BASE64__:${base64}` })
          if (multiRes.recetas.length === 1) {
            handleAcceptIAResult(apiToForm(multiRes.recetas[0]))
          } else {
            setIaMultiResults(multiRes.recetas)
          }
        } else {
          const text = await data.text()
          setIaInputText(text)
          const result = await callRecetaImport('text', { text })
          handleAcceptIAResult(apiToForm(result))
        }

      } else if (mode === 'audio' && typeof data === 'string') {
        setIaInputText(data)
        const result = await callRecetaImport('text', { text: data })
        setIaResult(result)

      } else if (mode === 'glink' && typeof data === 'string') {
        setIaInputText(`📎 ${data}`)
        const multiRes = await callRecetaImportMulti('google_url', { google_url: data })
        if (multiRes.recetas.length === 1) {
          handleAcceptIAResult(apiToForm(multiRes.recetas[0]))
        } else {
          setIaMultiResults(multiRes.recetas)
        }

      } else {
        throw new Error('Modo de importación no válido')
      }
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Error al procesar con IA')
    } finally {
      setIaProcessing(false)
    }
  }

  // Fix 2: sincronizar ingredientes faltantes con el stock
  async function sincronizarIngredientesConStock(ingredientesData: { nombre: string; unidad: string }[]) {
    const stockNombres = new Set(stockProductos.map(p => p.nombre.toLowerCase().trim()))
    for (const ing of ingredientesData) {
      if (!stockNombres.has(ing.nombre.toLowerCase().trim())) {
        try {
          await agregarProducto({
            nombre: ing.nombre,
            categoria: 'Sin categoría',
            unidad: ing.unidad,
            stock_actual: 0,
            stock_minimo: 0,
            stock_critico: 0,
            precio_unitario: 0,
            activo: true,
            proveedor_id: null,
          })
          stockNombres.add(ing.nombre.toLowerCase().trim())
        } catch { /* ignorar */ }
      }
    }
  }

  // Cuando la IA termina de analizar → poblar el formulario directamente
  function handleAcceptIAResult(r: IAResult) {
    if (r.nombre) setNombre(r.nombre)
    if (r.categoria) setCategoria(r.categoria)
    if (r.porciones) setPorciones(String(r.porciones))
    if (r.tiempo_min) setTiempoMin(String(r.tiempo_min))
    if (r.ingredientes.length > 0) {
      setIngs(r.ingredientes.map(i => ({
        id: uid(), nombre: i.nombre, cantidad: i.cantidad, unidad: i.unidad, costo_unitario: 0,
      })))
    }
    if (r.pasos.length > 0) {
      setPasos(r.pasos.map(t => ({ id: uid(), texto: typeof t === 'string' ? t : '' })))
    }
    // Limpiar estado de IA (la pantalla ya muestra el formulario poblado)
    setIaResult(null)
    setIaPreviewUrl(null)
    setIaInputText(null)
    setIaMode(null)
    setIaCollapsed(false)
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
      const ingredientesData = ingsValidos.map(ing => ({
        nombre: ing.nombre.trim(),
        cantidad: parseNum(ing.cantidad),
        unidad: ing.unidad || 'u',
        costo_unitario: ing.costo_unitario ?? 0,
        unidad_costo: ing.unidad || 'u',
      }))
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
        }, ingredientesData)
      }
      await sincronizarIngredientesConStock(ingredientesData)
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

  // ── Si hay resultado de IA pendiente, mostrar pantalla de resultado ──
  if (iaResult) {
    return (
      <IAResultScreen
        result={iaResult}
        previewUrl={iaPreviewUrl}
        inputText={iaInputText}
        onAccept={handleAcceptIAResult}
        onClose={() => { setIaResult(null); setIaPreviewUrl(null); setIaInputText(null) }}
        agregarReceta={agregarReceta}
        agregarProducto={agregarProducto}
        stockProductos={stockProductos}
        catSugeridas={categorias}
        onSaved={(id) => { setIaResult(null); setIaPreviewUrl(null); setIaInputText(null); onCreated(id) }}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ── Compact header ── */}
      <div style={{ background: 'var(--navy)', padding: '44px 12px 10px', flexShrink: 0 }}>
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
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '10px 10px 32px' }}>

        {formError && <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '6px 10px', marginBottom: 8, fontSize: 11, color: '#ef4444' }}>{formError}</div>}

        {/* ═══ IMPORTAR CON IA ═══ */}
        {iaCollapsed ? (
          /* Collapsed state — subtle link to re-open */
          <div style={{ marginBottom: 14, textAlign: 'center' }}>
            <button
              onClick={() => setIaCollapsed(false)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                borderRadius: 99, transition: 'background .15s',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#4361a0' }}>auto_awesome</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#4361a0' }}>Importar otra receta con IA</span>
            </button>
          </div>
        ) : (
          /* Expanded state — full IA import options */
          <div style={{ background: 'linear-gradient(135deg, rgba(28,45,74,.05), rgba(168,85,247,.05))', borderRadius: 16, padding: '14px 12px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#4361a0' }}>auto_awesome</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>Importar con IA</span>
              <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>Más rápido</span>
            </div>

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
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#4361a0' }}>text_snippet</span>
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
          </div>
        )}

        {/* Separador */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>o cargá manualmente</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* ═══ 1. INGREDIENTES ═══ */}
        <Section icon="restaurant" title="Ingredientes" badge={ingCount > 0 ? `${ingCount}` : undefined} badgeColor="var(--navy)">
          <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {ings.map((ing, idx) => (
              <IngRow
                key={ing.id}
                ing={ing}
                idx={idx}
                isActive={activeIngId === ing.id}
                stockIndex={stockIndex}
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
            onClick={() => {
              const newId = uid()
              setIngs(prev => [...prev, { id: newId, cantidad: '', unidad: 'kg', nombre: '', costo_unitario: 0 }])
              pendingFocusRef.current = { id: newId, type: 'ing' }
            }}
            style={{ marginTop: 6, width: '100%', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 8, padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-3)' }}>add</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'inherit' }}>Agregar ingrediente</span>
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
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  list="cat-nueva"
                  value={categoria}
                  onChange={e => setCategoria(e.target.value)}
                  placeholder="Categoría"
                  style={{ ...inp, fontSize: 11 }}
                />
                <datalist id="cat-nueva">{categorias.map(c => <option key={c} value={c} />)}</datalist>
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
      <input ref={fileInputRef} type="file" accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.txt,.tsv,.ods,.numbers,application/vnd.google-apps.spreadsheet,application/vnd.google-apps.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/*" style={{ display: 'none' }} onChange={e => handleFileSelected('file', e)} />
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
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#4361a0' }}>link</span>
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


// ════════════════════════════════════════════════════════════════════
// FILA DE INGREDIENTE — velocidad máxima
// [Nombre] | [Cantidad·numpad] [kg] [✓ o ×]
// Activa: ✓ confirma + crea siguiente + focus nombre
// Inactiva: × elimina fila
// Toca fuera de ingredientes → deja de agregar
// ════════════════════════════════════════════════════════════════════

interface IngRowProps {
  ing: FormIng
  idx: number
  isActive: boolean
  stockIndex: { id: string; nombre: string; unidad: string; precio_unitario: number; categoria: string; lower: string }[]
  cantidadRefs: React.MutableRefObject<Map<number, HTMLInputElement>>
  nombreRefs: React.MutableRefObject<Map<number, HTMLInputElement>>
  onUpdate: (id: number, patch: Partial<FormIng>) => void
  onRemove: (id: number) => void
  onConfirm: (id: number) => void
  onFocusRow: (id: number | null) => void
}

function IngRow({ ing, idx, isActive, stockIndex, cantidadRefs, nombreRefs, onUpdate, onRemove, onConfirm, onFocusRow }: IngRowProps) {
  const [showUnitPicker, setShowUnitPicker] = useState(false)
  const [suggestions, setSuggestions] = useState<typeof stockIndex>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [nombreFocused, setNombreFocused] = useState(false)

  // Cuando los productos del stock cargan (o cambian), re-ejecutar búsqueda si el campo está activo
  useEffect(() => {
    if (!nombreFocused || !ing.nombre.trim() || stockIndex.length === 0) return
    const q = ing.nombre.toLowerCase()
    const matches = stockIndex.filter(p => p.lower.includes(q)).slice(0, 6)
    setSuggestions(matches)
    setShowSuggestions(matches.length > 0)
  }, [stockIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  const cantRef = useCallback((el: HTMLInputElement | null) => {
    if (el) cantidadRefs.current.set(ing.id, el)
    else cantidadRefs.current.delete(ing.id)
  }, [ing.id, cantidadRefs])

  const nomRef = useCallback((el: HTMLInputElement | null) => {
    if (el) nombreRefs.current.set(ing.id, el)
    else nombreRefs.current.delete(ing.id)
  }, [ing.id, nombreRefs])

  function handleNombreChange(val: string) {
    onUpdate(ing.id, { nombre: val })
    if (val.trim().length >= 1) {
      const q = val.toLowerCase()
      const matches = stockIndex.filter(p => p.lower.includes(q)).slice(0, 6)
      setSuggestions(matches)
      setShowSuggestions(matches.length > 0)
    } else {
      setShowSuggestions(false)
    }
  }

  function selectSuggestion(p: typeof stockIndex[0]) {
    onUpdate(ing.id, { nombre: p.nombre, unidad: p.unidad, costo_unitario: p.precio_unitario || 0 })
    setShowSuggestions(false)
    setTimeout(() => {
      const el = cantidadRefs.current.get(ing.id)
      if (el) el.focus()
    }, 50)
  }

  function handleNombreKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      setShowSuggestions(false)
      const el = cantidadRefs.current.get(ing.id)
      if (el) el.focus()
    }
  }

  function handleCantidadKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      onConfirm(ing.id)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        background: isActive ? 'rgba(28,45,74,.04)' : 'transparent',
        borderBottom: '1px solid var(--border)',
        transition: 'background .15s',
      }}>

        {/* Nombre ingrediente — PRIMERO */}
        <input
          ref={nomRef}
          value={ing.nombre}
          onChange={e => handleNombreChange(e.target.value)}
          onKeyDown={handleNombreKeyDown}
          onFocus={() => {
            setNombreFocused(true)
            onFocusRow(ing.id)
            if (ing.nombre.trim()) {
              const q = ing.nombre.toLowerCase()
              const m = stockIndex.filter(p => p.lower.includes(q)).slice(0, 6)
              if (m.length) { setSuggestions(m); setShowSuggestions(true) }
            }
          }}
          onBlur={() => { setNombreFocused(false); setTimeout(() => setShowSuggestions(false), 150) }}
          placeholder={idx === 0 ? 'Ingrediente…' : ''}
          enterKeyHint="next"
          style={{
            flex: 1, border: 'none', background: 'transparent', outline: 'none',
            padding: '9px 8px 9px 10px', fontSize: 12, fontFamily: 'inherit',
            color: 'var(--text-1)', minWidth: 0,
          }}
        />

        {/* Separador */}
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        {/* Cantidad — text + decimal keyboard, acepta coma y punto */}
        <input
          ref={cantRef}
          type="text"
          inputMode="decimal"
          value={ing.cantidad}
          onChange={e => {
            // Acepta números, punto y coma
            const val = e.target.value.replace(/[^0-9.,]/g, '')
            onUpdate(ing.id, { cantidad: val })
          }}
          onFocus={() => onFocusRow(ing.id)}
          onKeyDown={handleCantidadKeyDown}
          placeholder="0"
          enterKeyHint="done"
          style={{
            width: 50, border: 'none', background: 'transparent', outline: 'none',
            padding: '9px 2px 9px 6px', fontSize: 13, fontWeight: 700,
            fontFamily: "'DM Mono', monospace", color: 'var(--text-1)', textAlign: 'right',
          }}
        />

        {/* Unidad — texto plano tocable */}
        <button
          onClick={() => setShowUnitPicker(!showUnitPicker)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '9px 2px 9px 2px', fontSize: 11, fontWeight: 700,
            color: 'var(--text-3)', fontFamily: 'inherit',
            minWidth: 22, textAlign: 'left',
          }}
        >
          {ing.unidad}
        </button>

        {/* ✓ (activa) o × (inactiva) — mismo lugar */}
        {isActive ? (
          <button
            onClick={() => onConfirm(ing.id)}
            style={{
              background: 'var(--navy)', border: 'none', cursor: 'pointer',
              padding: '0', width: 36, height: '100%', minHeight: 38,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, borderRadius: '0 6px 6px 0',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fff' }}>check</span>
          </button>
        ) : (
          <button
            onClick={() => onRemove(ing.id)}
            style={{
              ...btnClear, padding: '8px 8px 8px 2px', opacity: .3, flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#ef4444' }}>close</span>
          </button>
        )}
      </div>

      {/* Unit picker */}
      {showUnitPicker && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', zIndex: 30,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,.15)',
          display: 'flex', gap: 0, overflow: 'hidden',
        }}>
          {UNIDADES.map(u => (
            <button
              key={u}
              onClick={() => { onUpdate(ing.id, { unidad: u }); setShowUnitPicker(false) }}
              style={{
                padding: '8px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12, fontWeight: u === ing.unidad ? 700 : 500,
                background: u === ing.unidad ? 'var(--navy)' : 'transparent',
                color: u === ing.unidad ? '#fff' : 'var(--text-2)',
              }}
            >{u}</button>
          ))}
        </div>
      )}

      {/* Stock suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 25,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '0 0 8px 8px', boxShadow: '0 4px 12px rgba(0,0,0,.12)',
          maxHeight: 140, overflowY: 'auto',
        }}>
          {suggestions.map(p => (
            <button
              key={p.id}
              onMouseDown={e => { e.preventDefault(); selectSuggestion(p) }}
              onTouchStart={e => { e.preventDefault(); selectSuggestion(p) }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '7px 10px', background: 'none',
                border: 'none', borderBottom: '1px solid var(--border)',
                cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              }}
            >
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{p.nombre}</span>
                <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 6 }}>{p.unidad}</span>
              </div>
              {p.precio_unitario > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)' }}>
                  ${p.precio_unitario.toLocaleString('es-AR')}
                </span>
              )}
            </button>
          ))}
        </div>
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

function CatTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: active ? 'var(--navy)' : 'var(--bg)', color: active ? '#fff' : 'var(--text-2)', border: active ? 'none' : '1px solid var(--border)', borderRadius: 99, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
      {label}
    </button>
  )
}

function EmptyMsg({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--text-3)', display: 'block', marginBottom: 8 }}>{icon}</span>
      <p style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>{text}</p>
    </div>
  )
}

function RecetaCard({ receta: r, isDraft, onPublish, onCompleteIA }: { receta: RecetaConCosto; isDraft?: boolean; onPublish?: () => void; onCompleteIA?: () => void }) {
  const fc = r.food_cost
  const sinIngredientes = (r.ingredientes?.length ?? 0) === 0
  return (
    <div style={{ position: 'relative' }}>
      <Link href={`/recetario/${r.id}`} style={{ textDecoration: 'none', display: 'block', background: 'var(--surface)', border: isDraft ? '1px solid rgba(245,158,11,.3)' : '1px solid var(--border)', borderRadius: 14, padding: isDraft && onCompleteIA ? '14px 14px 44px' : '14px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{r.nombre}</span>
              {isDraft && (
                <span style={{
                  fontSize: 9, fontWeight: 700, color: '#92400e', background: 'rgba(245,158,11,.15)',
                  border: '1px solid rgba(245,158,11,.3)', borderRadius: 4, padding: '1px 6px',
                }}>BORRADOR</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{r.categoria} · {r.porciones} porc.{(() => { const p = calcPesoPorcion(r.ingredientes || [], r.porciones ?? 0); return p ? ` · ${formatPeso(p)}` : '' })()} · {r.tiempo_min} min</div>
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
          <div style={{ marginTop: 6, fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>⚠ Sin ingredientes cargados</div>
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
                color: '#92400e', cursor: 'pointer', fontFamily: 'inherit',
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

const btnClear: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }
const lbl: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }
const inp: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', width: '100%', boxSizing: 'border-box' as const }
const iaFieldStyle: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', width: '100%', boxSizing: 'border-box' as const }
const iaCardBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'rgba(28,45,74,.06)', border: 'none', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const, transition: 'background .15s' }
const iaCardIcon: React.CSSProperties = { fontSize: 22, color: '#4361a0', flexShrink: 0, opacity: 0.8 }
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

            {error && <div style={{ fontSize: 12, color: '#ef4444', padding: '8px 12px', background: '#fef2f2', borderRadius: 8, marginBottom: 12 }}>{error}</div>}
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
