'use client'

import { useState, useMemo, useRef } from 'react'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { PLAZAS_OPS, SECCIONES_OPS } from '@/lib/ops/mise'
import { useSheetOpen } from '@/lib/ui/chrome'
import { usePermisos } from '@/lib/hooks/usePermisos'
import OpsPanel, { type OpsResult } from '@/components/ops/OpsPanel'
import { SegmentedTabs } from '@/components/ui'

// ── Tipos públicos ──────────────────────────────────────────
export type CompModo = 'plato' | 'menu' | 'evento'
export type CompRefTipo = 'receta' | 'producto' | 'plato' | null
export type CompPrioridad = 'critica' | 'alta' | 'media' | 'baja'

export interface CompItemOut {
  tipo: CompRefTipo
  ref_id: string | null
  nombre: string
  prioridad: CompPrioridad
  plaza: string | null
  seccion_mise: string | null
  usuario_asignado: string | null
  cantidad: number | null
  unidad: string | null
  variante: string | null
  // OPS mise
  cantidad_ops?: number | null
  unidad_ops?: string | null
  recipiente_nombre?: string | null
  recipiente_cantidad?: number | null
  peso_porcion?: number | null
  peso_porcion_unidad?: string | null
}
export interface CompPayload {
  tipo: CompModo
  nombre: string
  descripcion: string | null
  fechaEvento: string | null
  variantes: string[]
  precio: number
  categoria: string
  tags: string[]
  secciones: { nombre: string; items: CompItemOut[] }[]
}

// Fuente de datos con costo para el resumen vivo
// costoPorGramo: costo por gramo cuando se puede derivar (receta con peso_total_g
// cargado, o producto con unidad de stock convertible a gramos). null = no se
// puede calcular por gramo — el costeo cae a `costo` (por porción/unidad) como fallback.
export interface RefConCosto {
  id: string; nombre: string; costo: number; costoPorGramo?: number | null
  // Solo para recetas — ingredientes (producto + cantidad) para la vista rápida
  // "ver receta" (botón del ícono de recetario en cada ítem vinculado).
  ingredientes?: { nombre: string; cantidad: number; unidad: string }[]
}

// Datos para editar una composición existente
export interface CompInicial {
  modo: CompModo
  nombre: string
  descripcion: string | null
  fechaEvento?: string | null
  variantes?: string[]
  precio: number
  categoria: string
  tags: string[]
  secciones: { nombre: string; items: (CompItemOut & { _uid?: number })[] }[]
}

// ── Constantes ──────────────────────────────────────────────
const PLAZAS_BASE = ['parrilla', 'fríos', 'calientes', 'pase', 'pastelería']
// PLAZAS_OPS / SECCIONES_OPS ahora viven en @/lib/ops/mise; se re-exportan
// para no romper los imports existentes (`from './ComposicionEditor'`).
export { PLAZAS_OPS, SECCIONES_OPS }
const DEFAULT_SECCIONES = ['Entradas', 'Principales', 'Postres']

const PRIORIDADES: { id: CompPrioridad; label: string; sublabel: string; color: string; bg: string }[] = [
  { id: 'critica', label: 'SP',    sublabel: 'Super Prior.', color: '#ef4444', bg: '#fef2f2' },
  { id: 'alta',    label: 'P',     sublabel: 'Prioridad',    color: '#f97316', bg: '#fff7ed' },
  { id: 'media',   label: 'REF',   sublabel: 'Refuerzo',     color: '#3b82f6', bg: '#eff6ff' },
  { id: 'baja',    label: 'Check', sublabel: 'Check',        color: '#64748b', bg: '#f8fafc' },
]
const PRIO_CFG: Record<CompPrioridad, { label: string; color: string }> = {
  critica: { label: 'SP', color: '#ef4444' }, alta: { label: 'P', color: '#f97316' },
  media: { label: 'REF', color: '#3b82f6' }, baja: { label: 'Check', color: '#64748b' },
}
const TIPO_CFG: Record<'receta' | 'producto' | 'plato', { icon: string; color: string; bg: string; label: string }> = {
  receta:   { icon: 'menu_book',   color: '#4361a0', bg: 'rgba(67,97,160,.12)', label: 'Receta' },
  producto: { icon: 'inventory_2', color: '#059669', bg: 'rgba(5,150,105,.14)', label: 'Ingrediente' },
  plato:    { icon: 'restaurant',  color: '#f97316', bg: 'rgba(249,115,22,.14)', label: 'Plato' },
}
const TAG_CFG: Record<string, { label: string; bg: string; color: string }> = {
  's/tacc':      { label: 'S/TACC',      bg: 'rgba(146,64,14,.14)', color: '#92400e' },
  'vegano':      { label: 'Vegano',      bg: 'rgba(6,95,70,.14)',   color: '#065f46' },
  'vegetariano': { label: 'Vegetariano', bg: 'rgba(22,101,52,.14)', color: '#166534' },
  'keto':        { label: 'Keto',        bg: 'rgba(91,33,182,.14)', color: '#5b21b6' },
  'picante':     { label: 'Picante',     bg: 'rgba(153,27,27,.14)', color: '#991b1b' },
  'sin lactosa': { label: 'Sin lactosa', bg: 'rgba(7,89,133,.14)',  color: '#075985' },
}
const fmtMoney = (n: number) => n > 0 ? `$${Math.round(n).toLocaleString('es-AR')}` : '—'

interface ItemRow extends CompItemOut { _uid: number; _seccion: string }
let _u = 0
const uid = () => ++_u

// ── Vista rápida de receta — modal centrado al tocar el ícono de recetario
// en un ítem vinculado (producto + cantidad, sin salir del editor). ──
function RecetaPreviewModal({ nombre, ingredientes, onClose }: {
  nombre: string
  ingredientes: { nombre: string; cantidad: number; unidad: string }[]
  onClose: () => void
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, maxWidth: 420, width: '100%', maxHeight: '75vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 32px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ color: TIPO_CFG.receta.color, fontSize: 20 }}>menu_book</span>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>{nombre}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 2 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>
        <div style={{ overflowY: 'auto' }}>
          {ingredientes.length === 0 ? (
            <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>Esta receta todavía no tiene ingredientes cargados en el recetario.</div>
          ) : ingredientes.map((ing, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 16px', borderBottom: i < ingredientes.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{ing.nombre}</span>
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'monospace', flexShrink: 0 }}>{ing.cantidad}{ing.unidad}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// COMPOSICION EDITOR — un solo editor para Plato / Menú / Evento
// ════════════════════════════════════════════════════════════
export default function ComposicionEditor({
  inicial, recetas, productos, cartaItems, categoriasCarta, draftRecetaIds = new Set(), recipientesUsados = [], onSave, onCancel,
}: {
  inicial?: CompInicial
  recetas: RefConCosto[]
  productos: RefConCosto[]
  cartaItems: RefConCosto[]
  categoriasCarta: string[]
  draftRecetaIds?: Set<string>
  recipientesUsados?: string[]
  onSave: (payload: CompPayload) => Promise<void>
  onCancel: () => void
}) {
  useSheetOpen()
  const RESTAURANTE_ID = useRestauranteId()
  const { isAdmin } = usePermisos()

  async function crearIdeaReceta(nombre: string): Promise<string> {
    if (!RESTAURANTE_ID) throw new Error('Sin sesión')
    const res = await fetch('/api/recetas/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receta: { nombre: nombre.trim(), status: 'draft', activa: true, restaurante_id: RESTAURANTE_ID, porciones: 1 } }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Error al crear receta')
    return json.id as string
  }

  // Recetas-idea creadas en esta sesión del editor (draft) → se pintan en rojo
  // al instante, sin esperar el revalidate de useRecetas.
  const [localDraftIds, setLocalDraftIds] = useState<Set<string>>(new Set())
  const [creandoIdeaSec, setCreandoIdeaSec] = useState(false)
  const allDraftIds = useMemo(() => new Set<string>([...draftRecetaIds, ...localDraftIds]), [draftRecetaIds, localDraftIds])

  const [modo, setModo] = useState<CompModo>(inicial?.modo ?? 'plato')
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '')
  const [precio, setPrecio] = useState(inicial?.precio ? String(inicial.precio) : '')
  const [categoria, setCategoria] = useState(inicial?.categoria ?? categoriasCarta[0] ?? 'Principales')
  const [tags, setTags] = useState<string[]>(inicial?.tags ?? [])
  const [fechaEvento, setFechaEvento] = useState(inicial?.fechaEvento ?? '')
  const [variantes, setVariantes] = useState<string[]>(inicial?.variantes ?? [])
  const [nuevaVariante, setNuevaVariante] = useState('')

  // Secciones (para plato es una sola implícita)
  const [secciones, setSecciones] = useState<string[]>(() => {
    if (inicial && inicial.secciones.length > 0) return inicial.secciones.map(s => s.nombre)
    return inicial?.modo === 'plato' ? ['Componentes'] : [...DEFAULT_SECCIONES]
  })
  const [items, setItems] = useState<ItemRow[]>(() => {
    if (!inicial) return []
    return inicial.secciones.flatMap(s => s.items.map(it => ({ ...it, _uid: it._uid ?? uid(), _seccion: s.nombre })))
  })

  const [plazas, setPlazas] = useState<string[]>(() => {
    const fromItems = (inicial?.secciones ?? []).flatMap(s => s.items).map(i => i.plaza).filter((x): x is string => !!x)
    return Array.from(new Set([...PLAZAS_BASE, ...fromItems]))
  })

  const [expandedUid, setExpandedUid] = useState<number | null>(null)
  const [secEdit, setSecEdit] = useState<{ idx: number; val: string } | null>(null)
  const [nuevaSeccion, setNuevaSeccion] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeSearch, setActiveSearch] = useState<string | null>(null)
  const [sectionQuery, setSectionQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const nuevaSeccionRef = useRef<HTMLInputElement>(null)

  // ── Drag & drop de secciones (reordenar arrastrando el handle) ──
  const seccionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [draggingSec, setDraggingSec] = useState<string | null>(null)
  function handleSecDragStart(e: React.PointerEvent, sec: string) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDraggingSec(sec)
  }
  function handleSecDragMove(e: React.PointerEvent) {
    if (!draggingSec) return
    const y = e.clientY
    for (const [name, el] of Object.entries(seccionRefs.current)) {
      if (!el || name === draggingSec) continue
      const rect = el.getBoundingClientRect()
      if (y >= rect.top && y <= rect.bottom) {
        setSecciones(prev => {
          const from = prev.indexOf(draggingSec)
          const to = prev.indexOf(name)
          if (from === -1 || to === -1 || from === to) return prev
          const next = [...prev]
          next.splice(from, 1)
          next.splice(to, 0, draggingSec)
          return next
        })
        break
      }
    }
  }
  function handleSecDragEnd() { setDraggingSec(null) }

  // ── Estado exclusivo para modo plato (UI simplificada) ──
  const [platoRecetas, setPlatoRecetas] = useState<PlatoItem[]>(() => {
    if (!inicial || inicial.modo !== 'plato') return []
    return inicial.secciones.flatMap(s =>
      s.items
        .filter(it => (it.tipo === 'receta' || it.tipo === 'producto') && it.ref_id)
        .map(it => ({
          _uid: it._uid ?? uid(),
          ref_id: it.ref_id!,
          nombre: it.nombre,
          porciones: it.cantidad ?? 1,
          tipo: it.tipo as 'receta' | 'producto',
          opsPlaza: it.plaza ?? null,
          opsSeccion: it.seccion_mise ?? null,
          opsCantidad: it.cantidad_ops ?? null,
          opsUnidad: it.unidad_ops ?? null,
        }))
    )
  })
  const [platoSearch, setPlatoSearch] = useState('')
  const [platoShowResults, setPlatoShowResults] = useState(false)
  const [editingPorcionUid, setEditingPorcionUid] = useState<number | null>(null)
  const [editingPorcionVal, setEditingPorcionVal] = useState('')

  const esPlato = modo === 'plato'

  // Cambiar de modo migra la composición entre los dos modelos que la
  // sostienen (platoRecetas para Plato, items/secciones para Menú/Evento) —
  // antes se descartaba en silencio todo lo cargado al tocar el tab.
  function cambiarModo(m: CompModo) {
    if (m === modo) return

    if (m === 'plato') {
      // Menú/Evento → Plato: solo entran ítems vinculados a receta (el
      // modelo de Plato solo persiste recetas — ver PlatoRecetasEditor) —
      // si algo no entra, se avisa antes de aplicar el cambio.
      const compatibles = items.filter(it => it.tipo === 'receta' && it.ref_id && it.nombre.trim())
      const incompatibles = items.filter(it => it.nombre.trim()).length - compatibles.length
      if (incompatibles > 0 && !confirm(`El modo Plato solo admite recetas vinculadas. Se van a perder ${incompatibles} ítem(s) (texto libre, productos, platos vinculados o variantes). ¿Continuar?`)) return
      if (compatibles.length > 0) {
        setPlatoRecetas(compatibles.map(it => ({
          _uid: it._uid, ref_id: it.ref_id!, nombre: it.nombre, porciones: it.cantidad ?? 1, tipo: 'receta',
          opsPlaza: it.plaza ?? null, opsSeccion: it.seccion_mise ?? null, opsCantidad: it.cantidad_ops ?? null, opsUnidad: it.unidad_ops ?? null,
          opsRecipienteNombre: it.recipiente_nombre ?? null, opsRecipienteCantidad: it.recipiente_cantidad ?? null, opsPesoPorcion: it.peso_porcion ?? null, opsPesoPorcionUnidad: it.peso_porcion_unidad ?? null,
        })))
      }
      setSecciones(['Componentes'])
      setItems(prev => prev.map(it => ({ ...it, _seccion: 'Componentes' })))
    } else if (modo === 'plato') {
      // Plato → Menú/Evento: cada receta/producto pasa a la sección
      // "Componentes", conservando su OPS/mise.
      if (platoRecetas.length > 0) {
        setItems(platoRecetas.map(pr => ({
          _uid: pr._uid, _seccion: 'Componentes', tipo: pr.tipo, ref_id: pr.ref_id, nombre: pr.nombre,
          prioridad: 'media', plaza: pr.opsPlaza ?? null, seccion_mise: pr.opsSeccion ?? null, usuario_asignado: null,
          cantidad: pr.porciones, unidad: null, variante: null,
          cantidad_ops: pr.opsCantidad ?? null, unidad_ops: pr.opsUnidad ?? null,
          recipiente_nombre: pr.opsRecipienteNombre ?? null, recipiente_cantidad: pr.opsRecipienteCantidad ?? null, peso_porcion: pr.opsPesoPorcion ?? null, peso_porcion_unidad: pr.opsPesoPorcionUnidad ?? null,
        })))
        setSecciones(['Componentes'])
      } else {
        setSecciones(items.length > 0 ? ['Componentes'] : [...DEFAULT_SECCIONES])
      }
    }
    setModo(m)
  }

  // Costo total vivo
  const costoTotal = useMemo(() => {
    if (esPlato) {
      return platoRecetas.reduce((s, pr) => {
        const fuente = pr.tipo === 'producto' ? productos : recetas
        const ref = fuente.find(r => r.id === pr.ref_id)
        if (!ref) return s
        // Con gramaje cargado ("+ g / por plato") y costo por gramo derivable,
        // costear exacto por gramo — antes el gramaje se guardaba pero el costo
        // siempre asumía 1 porción completa de la receta, sin importar el peso.
        if (pr.opsCantidad != null && pr.opsUnidad === 'g' && ref.costoPorGramo != null) {
          return s + ref.costoPorGramo * pr.opsCantidad
        }
        return s + ref.costo * pr.porciones
      }, 0)
    }
    return items.reduce((s, it) => {
      const fuente = it.tipo === 'receta' ? recetas : it.tipo === 'producto' ? productos : it.tipo === 'plato' ? cartaItems : null
      const ref = fuente && it.ref_id ? fuente.find(f => f.id === it.ref_id) : null
      if (!ref) return s
      // Cantidad se carga en gramos: si la receta/producto tiene costo por gramo
      // derivable, usarlo (coincide con el costeo real del recetario). Si no
      // (ej: receta sin peso_total_g cargado), fallback a costo por porción/unidad
      // para no romper el food cost ya calculado.
      if (ref.costoPorGramo != null && it.cantidad != null) return s + ref.costoPorGramo * it.cantidad
      return s + ref.costo * (it.cantidad ?? 1)
    }, 0)
  }, [esPlato, platoRecetas, items, recetas, productos, cartaItems])

  const precioN = parseFloat(precio.replace(',', '.')) || 0
  const fcPct = precioN > 0 && costoTotal > 0 ? (costoTotal / precioN) * 100 : null
  const fcColor = fcPct == null ? 'var(--text-3)' : fcPct < 30 ? '#16a34a' : fcPct <= 35 ? '#d97706' : '#dc2626'

  const searchResults = useMemo(() => {
    if (!sectionQuery.trim()) return []
    const q = sectionQuery.toLowerCase()
    const recetasR = recetas.filter(r => r.nombre.toLowerCase().includes(q)).slice(0, 5).map(r => ({ ...r, tipo: 'receta' as const }))
    const productosR = productos.filter(r => r.nombre.toLowerCase().includes(q)).slice(0, 4).map(r => ({ ...r, tipo: 'producto' as const }))
    const platosR = cartaItems.filter(r => r.nombre.toLowerCase().includes(q)).slice(0, 3).map(r => ({ ...r, tipo: 'plato' as const }))
    return [...recetasR, ...productosR, ...platosR]
  }, [sectionQuery, recetas, productos, cartaItems])

  // ── Item ops ──
  function addItem(seccion: string) {
    const nuevo: ItemRow = { _uid: uid(), _seccion: seccion, tipo: null, ref_id: null, nombre: '', prioridad: 'media', plaza: null, seccion_mise: null, usuario_asignado: null, cantidad: null, unidad: null, variante: null }
    setItems(prev => [...prev, nuevo])
    setExpandedUid(nuevo._uid)
  }

  function addItemFromSearch(seccion: string, tipo: 'receta' | 'producto' | 'plato', ref_id: string, nombre: string) {
    // cantidad se deja sin cargar (no 1): el editor la interpreta en gramos para
    // el costeo — defaultear a 1 costeaba cada ítem como si pesara 1 gramo.
    const nuevo: ItemRow = { _uid: uid(), _seccion: seccion, tipo, ref_id, nombre, prioridad: 'media', plaza: null, seccion_mise: null, usuario_asignado: null, cantidad: null, unidad: null, variante: null }
    setItems(prev => [...prev, nuevo])
    setActiveSearch(null)
    setSectionQuery('')
  }

  function openSectionSearch(sec: string) {
    setActiveSearch(sec)
    setSectionQuery('')
    setTimeout(() => searchRef.current?.focus(), 50)
  }
  function updateItem(u: number, patch: Partial<ItemRow>) {
    setItems(prev => prev.map(it => it._uid === u ? { ...it, ...patch } : it))
    if (patch.plaza && !plazas.includes(patch.plaza)) setPlazas(prev => [...prev, patch.plaza!])
  }
  function removeItem(u: number) { setItems(prev => prev.filter(it => it._uid !== u)); if (expandedUid === u) setExpandedUid(null) }

  // ── Sección ops ──
  function commitSecRename() {
    if (!secEdit) return
    const nuevo = secEdit.val.trim(); const viejo = secciones[secEdit.idx]
    if (nuevo && nuevo !== viejo) {
      setSecciones(prev => prev.map((s, i) => i === secEdit.idx ? nuevo : s))
      setItems(prev => prev.map(it => it._seccion === viejo ? { ...it, _seccion: nuevo } : it))
    }
    setSecEdit(null)
  }
  function removeSeccion(sec: string) {
    const n = items.filter(it => it._seccion === sec).length
    if (n > 0 && !confirm(`La sección “${sec}” tiene ${n} ítem(s). ¿Eliminarla?`)) return
    setSecciones(prev => prev.filter(s => s !== sec)); setItems(prev => prev.filter(it => it._seccion !== sec))
  }
  function addSeccion() {
    const n = nuevaSeccion.trim()
    if (!n || secciones.includes(n)) { setNuevaSeccion(''); return }
    setSecciones(prev => [...prev, n]); setNuevaSeccion('')
  }

  async function handleSave() {
    if (!nombre.trim()) return
    setSaving(true)
    let secs
    if (esPlato) {
      secs = [{
        nombre: 'Recetas',
        items: platoRecetas.map(pr => ({
          tipo: pr.tipo,
          ref_id: pr.ref_id,
          nombre: pr.nombre,
          prioridad: 'media' as const,
          plaza: pr.opsPlaza ?? null,
          seccion_mise: pr.opsSeccion ?? null,
          usuario_asignado: null,
          cantidad: pr.porciones,
          unidad: null,
          variante: null,
          cantidad_ops: pr.opsCantidad ?? null,
          unidad_ops: pr.opsUnidad ?? null,
          recipiente_nombre: pr.opsRecipienteNombre ?? null,
          recipiente_cantidad: pr.opsRecipienteCantidad ?? null,
          peso_porcion: pr.opsPesoPorcion ?? null,
          peso_porcion_unidad: pr.opsPesoPorcionUnidad ?? null,
        })),
      }]
    } else {
      secs = secciones.map(nombreSec => ({
        nombre: nombreSec,
        items: items.filter(it => it._seccion === nombreSec && it.nombre.trim()).map(({ _uid, _seccion, ...rest }) => rest), // eslint-disable-line @typescript-eslint/no-unused-vars
      })).filter(s => s.items.length > 0 || secciones.length === 1)
    }
    try {
      await onSave({
        tipo: modo, nombre: nombre.trim(), descripcion: descripcion.trim() || null,
        fechaEvento: modo === 'evento' ? (fechaEvento || null) : null,
        variantes: esPlato ? [] : variantes,
        precio: precioN, categoria, tags, secciones: secs,
      })
    } finally { setSaving(false) }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, color: 'var(--text-1)', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: '46px 12px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.8)', fontSize: 22 }}>close</span>
            </button>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{inicial ? 'Editar' : 'Nuevo'}</span>
          </div>
          <button onClick={handleSave} disabled={saving || !nombre.trim()}
            style={{ background: nombre.trim() ? '#22c55e' : 'rgba(255,255,255,.2)', border: 'none', borderRadius: 8, padding: '6px 16px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: nombre.trim() ? 'pointer' : 'default', fontFamily: 'inherit', opacity: saving ? .6 : 1 }}>
            {saving ? '…' : 'Guardar'}
          </button>
        </div>
        {/* Segmented: tipo */}
        <SegmentedTabs
          tabs={[
            { id: 'plato', label: 'Plato', icon: 'restaurant' },
            { id: 'menu', label: 'Menú', icon: 'menu_book' },
            { id: 'evento', label: 'Evento', icon: 'celebration' },
          ]}
          active={modo}
          onChange={cambiarModo}
        />
      </div>

      {/* Resumen vivo */}
      <div style={{ flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '6px 12px 8px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>
          {esPlato ? 'Este plato' : modo === 'evento' ? 'Este evento' : 'Este menú'}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          {(() => {
            const Metric = ({ label, value, color, big }: { label: string; value: string; color?: string; big?: boolean }) => (
              <div style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: '5px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
                <div style={{ fontSize: big ? 15 : 13, fontWeight: 800, color: color ?? 'var(--text-1)', fontFamily: 'monospace' }}>{value}</div>
              </div>
            )
            return (
              <>
                <Metric label="Ítems" value={String(esPlato ? platoRecetas.length : items.filter(i => i.nombre.trim()).length)} />
                {isAdmin && <Metric label="Costo" value={fmtMoney(costoTotal)} />}
                {isAdmin && fcPct != null && <Metric label="Food cost" value={`${fcPct.toFixed(0)}%`} color={fcColor} big />}
                {isAdmin && esPlato && precioN > 0 && <Metric label="Margen" value={fmtMoney(precioN - costoTotal)} color={precioN - costoTotal > 0 ? '#16a34a' : '#dc2626'} />}
              </>
            )
          })()}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '14px 14px 100px' }}>
        {/* ── Bloque DATOS ── */}
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 2px 7px' }}>
          {esPlato ? 'Datos del plato' : modo === 'evento' ? 'Datos del evento' : 'Datos del menú'}
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, marginBottom: 18 }}>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder={esPlato ? 'Nombre del plato' : modo === 'evento' ? 'Nombre del evento' : 'Nombre del menú'} style={{ ...inp, fontWeight: 800, fontSize: 18, marginBottom: 10 }} autoFocus />

          {/* Precio — menú/evento (un precio; las variantes lo comparten) */}
          {!esPlato && (
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: 14 }}>$</span>
              <input value={precio} onChange={e => setPrecio(e.target.value)} placeholder={modo === 'evento' ? 'Precio del evento' : 'Precio del menú'} inputMode="decimal" style={{ ...inp, paddingLeft: 24 }} />
            </div>
          )}

          {/* Campos de Plato */}
          {esPlato && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: 14 }}>$</span>
                  <input value={precio} onChange={e => setPrecio(e.target.value)} placeholder="Precio" inputMode="decimal" style={{ ...inp, paddingLeft: 24 }} />
                </div>
                <select value={categoria} onChange={e => setCategoria(e.target.value)} style={{ ...inp, flex: 1, minWidth: 110 }}>
                  {categoriasCarta.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {/* Tags dietarios */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {Object.entries(TAG_CFG).map(([id, cfg]) => {
                  const on = tags.includes(id)
                  return (
                    <button key={id} onClick={() => setTags(prev => on ? prev.filter(t => t !== id) : [...prev, id])}
                      style={{ padding: '4px 10px', borderRadius: 99, border: `1px solid ${on ? cfg.color : 'var(--border)'}`, background: on ? cfg.bg : 'var(--surface)', color: on ? cfg.color : 'var(--text-3)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
            </>
          )}
          {/* Fecha del evento — solo en modo evento */}
          {modo === 'evento' && (
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>Fecha del evento</label>
              <input type="date" value={fechaEvento} onChange={e => setFechaEvento(e.target.value)} style={{ ...inp }} />
            </div>
          )}
          <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder={modo === 'evento' ? 'Lugar, comensales estimados…' : 'Descripción (opcional)'} style={{ ...inp }} />
        </div>

        {/* ── Bloque VARIANTES — solo menú/evento. Bloque propio (antes vivía
            al fondo de Datos, con label chica gris — pasaba desapercibido). ── */}
        {!esPlato && (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 2px 7px' }}>
              Variantes <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'none', letterSpacing: 0 }}>(opcional)</span>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid rgba(124,58,237,.3)', borderRadius: 14, padding: 12, marginBottom: 18 }}>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>
                Composiciones alternativas al mismo precio — el comensal elige una.
              </div>
              {variantes.length > 0 ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {variantes.map(v => (
                    <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 6px 4px 10px', borderRadius: 99, background: 'rgba(124,58,237,.1)', border: '1px solid rgba(124,58,237,.35)', color: '#7c3aed', fontSize: 12, fontWeight: 700 }}>
                      {v}
                      <button onClick={() => { setVariantes(prev => prev.filter(x => x !== v)); setItems(prev => prev.map(it => it.variante === v ? { ...it, variante: null } : it)) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#7c3aed', display: 'flex' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 10px', borderRadius: 10, background: 'rgba(124,58,237,.06)', marginBottom: 10 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#7c3aed', flexShrink: 0 }}>call_split</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4 }}>
                    Ej: agregá <b style={{ color: 'var(--text-2)' }}>Proteína</b> y <b style={{ color: 'var(--text-2)' }}>Pasta</b> — 1 precio, el comensal elige una al pedir.
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={nuevaVariante} onChange={e => setNuevaVariante(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const n = nuevaVariante.trim(); if (n && !variantes.includes(n)) setVariantes(prev => [...prev, n]); setNuevaVariante('') } }}
                  placeholder="Agregar variante (ej: Proteína)" style={{ ...inp, flex: 1 }} />
                <button onClick={() => { const n = nuevaVariante.trim(); if (n && !variantes.includes(n)) setVariantes(prev => [...prev, n]); setNuevaVariante('') }} disabled={!nuevaVariante.trim()}
                  style={{ padding: '0 14px', borderRadius: 10, border: 'none', background: nuevaVariante.trim() ? '#7c3aed' : 'var(--border)', color: '#fff', cursor: nuevaVariante.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Bloque COMPOSICIÓN ── */}
        {esPlato ? (
          // ── UI simplificada para modo Plato (igual que la vista de detalle) ──
          <PlatoRecetasEditor
            recetas={recetas}
            productos={productos}
            platoRecetas={platoRecetas}
            setPlatoRecetas={setPlatoRecetas}
            costoTotal={costoTotal}
            platoSearch={platoSearch}
            setPlatoSearch={setPlatoSearch}
            platoShowResults={platoShowResults}
            setPlatoShowResults={setPlatoShowResults}
            editingPorcionUid={editingPorcionUid}
            setEditingPorcionUid={setEditingPorcionUid}
            editingPorcionVal={editingPorcionVal}
            setEditingPorcionVal={setEditingPorcionVal}
            uid={uid}
            draftRecetaIds={allDraftIds}
            recipientesUsados={recipientesUsados}
            onCrearIdea={async (n) => { const idNueva = await crearIdeaReceta(n); setLocalDraftIds(prev => new Set(prev).add(idNueva)); return idNueva }}
          />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 2px 7px' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                Composición
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'monospace' }}>· {items.filter(i => i.nombre.trim()).length}</span>
              <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>{secciones.length} {secciones.length === 1 ? 'sección' : 'secciones'}</span>
              <button
                onClick={() => { nuevaSeccionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); nuevaSeccionRef.current?.focus() }}
                title="Agregar sección"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 7, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', flexShrink: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
              </button>
            </div>

            {/* Secciones + ítems */}
            {secciones.map((sec, secIdx) => {
              const rows = items.filter(it => it._seccion === sec)
              const isEditingSec = secEdit?.idx === secIdx
              const isDraggingThis = draggingSec === sec
              return (
                <div key={`${sec}-${secIdx}`}
                  ref={el => { seccionRefs.current[sec] = el }}
                  style={{
                    marginBottom: 12, background: 'var(--surface)',
                    border: isDraggingThis ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                    borderRadius: 14, overflow: 'hidden',
                    opacity: isDraggingThis ? .6 : 1,
                    boxShadow: isDraggingThis ? '0 4px 14px rgba(0,0,0,.12)' : 'none',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                    <span
                      onPointerDown={e => handleSecDragStart(e, sec)}
                      onPointerMove={handleSecDragMove}
                      onPointerUp={handleSecDragEnd}
                      onPointerCancel={handleSecDragEnd}
                      title="Arrastrar para reordenar"
                      className="material-symbols-outlined"
                      style={{ fontSize: 17, color: 'var(--text-3)', cursor: 'grab', touchAction: 'none', flexShrink: 0, marginLeft: -2 }}>
                      drag_indicator
                    </span>
                    {isEditingSec ? (
                      <input value={secEdit!.val} onChange={e => setSecEdit({ idx: secIdx, val: e.target.value })} onBlur={commitSecRename} onKeyDown={e => { if (e.key === 'Enter') commitSecRename() }} autoFocus
                        style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, fontWeight: 700, color: 'var(--text-1)', outline: 'none', textTransform: 'uppercase', letterSpacing: '.04em' }} />
                    ) : (
                      <button onClick={() => setSecEdit({ idx: secIdx, val: sec })} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {sec}<span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--text-3)', opacity: .6 }}>edit</span>
                      </button>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, fontFamily: 'monospace' }}>{rows.length}</span>
                    <button onClick={() => removeSeccion(sec)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-3)', display: 'flex' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                    </button>
                  </div>

                  {rows.map(it => (
                    <ItemRowInline key={it._uid} item={it}
                      expanded={expandedUid === it._uid}
                      onToggle={() => setExpandedUid(expandedUid === it._uid ? null : it._uid)}
                      onChange={patch => updateItem(it._uid, patch)}
                      onRemove={() => removeItem(it._uid)}
                      recetas={recetas} productos={productos} cartaItems={cartaItems}
                      variantes={variantes}
                      draftRecetaIds={allDraftIds}
                      recipientesUsados={recipientesUsados}
                    />
                  ))}

                  {activeSearch === sec ? (
                    <div style={{ borderTop: rows.length > 0 ? '1px solid var(--border)' : 'none', padding: '8px 10px' }}>
                      <div style={{ position: 'relative', marginBottom: 4 }}>
                        <span className="material-symbols-outlined" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--text-3)', pointerEvents: 'none' }}>search</span>
                        <input ref={searchRef} value={sectionQuery} onChange={e => setSectionQuery(e.target.value)}
                          placeholder="Buscar receta, producto o plato…"
                          style={{ width: '100%', paddingLeft: 30, paddingRight: 8, paddingTop: 7, paddingBottom: 7, border: '1px solid var(--border)', borderRadius: 9, fontSize: 13, background: 'var(--bg)', color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                        <button onClick={() => { setActiveSearch(null); setSectionQuery('') }}
                          style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 2 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                        </button>
                      </div>
                      <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                        {sectionQuery.trim().length < 2 ? (
                          <div style={{ padding: '8px 4px', fontSize: 12, color: 'var(--text-3)' }}>Escribí 2 letras para buscar…</div>
                        ) : searchResults.length === 0 ? (
                          <button
                            onClick={async () => {
                              const nombreIdea = sectionQuery.trim()
                              if (!nombreIdea || creandoIdeaSec) return
                              setCreandoIdeaSec(true)
                              try {
                                const idNueva = await crearIdeaReceta(nombreIdea)
                                setLocalDraftIds(prev => new Set(prev).add(idNueva))
                                addItemFromSearch(sec, 'receta', idNueva, nombreIdea)
                              } finally { setCreandoIdeaSec(false) }
                            }}
                            disabled={creandoIdeaSec}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 10px', borderRadius: 9, border: '1.5px dashed var(--accent)', background: 'rgba(67,97,160,.06)', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: creandoIdeaSec ? 'default' : 'pointer', fontFamily: 'inherit', opacity: creandoIdeaSec ? .6 : 1 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{creandoIdeaSec ? 'progress_activity' : 'add_circle'}</span>
                            {creandoIdeaSec ? 'Creando…' : `Crear "${sectionQuery.trim()}" como receta`}
                          </button>
                        ) : searchResults.map(r => (
                          <button key={r.id} onClick={() => addItemFromSearch(sec, r.tipo, r.id, r.nombre)}
                            style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', borderRadius: 8, padding: '7px 6px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: r.tipo === 'receta' ? 'rgba(67,97,160,.12)' : r.tipo === 'producto' ? 'rgba(16,185,129,.12)' : 'rgba(249,115,22,.12)', color: r.tipo === 'receta' ? 'var(--accent)' : r.tipo === 'producto' ? '#10b981' : '#f97316' }}>
                              {r.tipo === 'receta' ? 'Receta' : r.tipo === 'producto' ? 'Producto' : 'Plato'}
                            </span>
                            <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{r.nombre}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => openSectionSearch(sec)}
                      style={{ width: '100%', padding: '9px', background: 'none', border: 'none', borderTop: rows.length > 0 ? '1px solid var(--border)' : 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                      Agregar a {sec}
                    </button>
                  )}
                </div>
              )
            })}

            <div style={{ display: 'flex', gap: 6, marginTop: 4, padding: 8, borderRadius: 12, border: '1.5px dashed var(--accent)', background: 'rgba(67,97,160,.06)' }}>
              <input ref={nuevaSeccionRef} value={nuevaSeccion} onChange={e => setNuevaSeccion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSeccion() }} placeholder="Nueva sección (ej: Bebidas)" style={{ ...inp, flex: 1, border: 'none', background: 'var(--surface)' }} />
              <button onClick={addSeccion} disabled={!nuevaSeccion.trim()} style={{ padding: '10px 16px', borderRadius: 9, border: 'none', background: nuevaSeccion.trim() ? 'var(--navy)' : 'var(--border)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: nuevaSeccion.trim() ? 'pointer' : 'default', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                Agregar sección
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// PLATO RECETAS EDITOR — UI simplificada idéntica al detalle
// ════════════════════════════════════════════════════════════
export type PlatoItem = {
  _uid: number
  ref_id: string
  nombre: string
  porciones: number
  tipo: 'receta' | 'producto'
  // OPS mise (null = no configurado)
  opsPlaza?: string | null
  opsSeccion?: string | null
  opsCantidad?: number | null
  opsUnidad?: string | null
  opsRecipienteNombre?: string | null
  opsRecipienteCantidad?: number | null
  opsPesoPorcion?: number | null
  opsPesoPorcionUnidad?: string | null
}

function PlatoRecetasEditor({
  recetas, productos, platoRecetas, setPlatoRecetas, costoTotal,
  platoSearch, setPlatoSearch, platoShowResults, setPlatoShowResults,
  editingPorcionUid, setEditingPorcionUid, editingPorcionVal, setEditingPorcionVal, uid,
  draftRecetaIds, recipientesUsados, onCrearIdea,
}: {
  recetas: RefConCosto[]
  productos: RefConCosto[]
  platoRecetas: PlatoItem[]
  setPlatoRecetas: React.Dispatch<React.SetStateAction<PlatoItem[]>>
  costoTotal: number
  platoSearch: string
  setPlatoSearch: (v: string) => void
  platoShowResults: boolean
  setPlatoShowResults: (v: boolean) => void
  editingPorcionUid: number | null
  setEditingPorcionUid: (v: number | null) => void
  editingPorcionVal: string
  setEditingPorcionVal: (v: string) => void
  uid: () => number
  draftRecetaIds: Set<string>
  recipientesUsados: string[]
  onCrearIdea: (nombre: string) => Promise<string>
}) {
  const [creandoIdea, setCreandoIdea] = useState(false)
  // OPS panel local — abre/cierra por _uid de la fila (el panel es OpsPanel compartido)
  const [opsPanelUid, setOpsPanelUid] = useState<number | null>(null)
  // Vista rápida de receta — abre/cierra por _uid de la fila
  const [previewUid, setPreviewUid] = useState<number | null>(null)

  function openOps(pr: PlatoItem) {
    setOpsPanelUid(prev => prev === pr._uid ? null : pr._uid)
  }

  function saveOps(uid_: number, r: OpsResult) {
    setPlatoRecetas(prev => prev.map(pr =>
      pr._uid === uid_
        ? { ...pr, opsPlaza: r.plaza, opsSeccion: r.seccion, opsCantidad: r.cantidad, opsUnidad: r.unidad, opsRecipienteNombre: r.recipienteNombre, opsRecipienteCantidad: r.recipienteCantidad, opsPesoPorcion: r.pesoPorcion, opsPesoPorcionUnidad: r.pesoPorcionUnidad }
        : pr
    ))
    setOpsPanelUid(null)
  }

  function clearOps(uid_: number) {
    setPlatoRecetas(prev => prev.map(pr =>
      pr._uid === uid_
        ? { ...pr, opsPlaza: null, opsSeccion: null, opsCantidad: null, opsUnidad: null, opsRecipienteNombre: null, opsRecipienteCantidad: null, opsPesoPorcion: null, opsPesoPorcionUnidad: null }
        : pr
    ))
    setOpsPanelUid(null)
  }

  const linkedIds = new Set(platoRecetas.map(pr => pr.ref_id))

  // Solo recetas: `plato_recetas` (la tabla que persiste esta sección) no tiene
  // columna para producto_id — un producto de stock agregado acá se guardaba
  // en memoria pero se perdía sin aviso al tocar Guardar.
  type SearchResult = { tipo: 'receta'; id: string; nombre: string; costo: number }
  const searchResults = useMemo((): SearchResult[] => {
    if (!platoSearch.trim()) return []
    const q = platoSearch.toLowerCase()
    return recetas.filter(r => !linkedIds.has(r.id) && r.nombre.toLowerCase().includes(q)).slice(0, 12)
      .map(r => ({ tipo: 'receta' as const, id: r.id, nombre: r.nombre, costo: r.costo }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platoSearch, recetas, platoRecetas])

  function agregarItem(r: SearchResult) {
    setPlatoRecetas(prev => [...prev, { _uid: uid(), ref_id: r.id, nombre: r.nombre, porciones: 1, tipo: r.tipo }])
    setPlatoSearch('')
    setPlatoShowResults(false)
  }

  async function agregarIdea() {
    const nombre = platoSearch.trim()
    if (!nombre || creandoIdea) return
    setCreandoIdea(true)
    try {
      const id = await onCrearIdea(nombre)
      setPlatoRecetas(prev => [...prev, { _uid: uid(), ref_id: id, nombre, porciones: 1, tipo: 'receta' }])
      setPlatoSearch('')
      setPlatoShowResults(false)
    } finally {
      setCreandoIdea(false)
    }
  }

  // Gramaje por plato: escribe opsCantidad + opsUnidad SIEMPRE en gramos ('g').
  // No toca `porciones` (que sigue en 1 para el cálculo de costo por porción).
  // Solo gramos: 'pax'/'u' rompen el total del plato en el recetario.
  function saveStock(u: number) {
    const val = parseFloat(editingPorcionVal.replace(',', '.'))
    const ok = !isNaN(val) && val > 0
    setPlatoRecetas(prev => prev.map(pr => pr._uid === u
      ? { ...pr, opsCantidad: ok ? val : null, opsUnidad: ok ? 'g' : null }
      : pr))
    setEditingPorcionUid(null)
  }

  const headLbl: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase' as const, letterSpacing: '.07em' }

  return (
    <div>
      {/* Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 2px 8px' }}>
        <span style={headLbl}>Recetas y productos del plato</span>
        {platoRecetas.length > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'monospace' }}>· {platoRecetas.length}</span>
        )}
      </div>

      {/* Lista vinculada */}
      {platoRecetas.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
          {platoRecetas.map((pr, idx) => {
            const cfg = TIPO_CFG[pr.tipo]
            const fuente = pr.tipo === 'producto' ? productos : recetas
            const item = fuente.find(r => r.id === pr.ref_id)
            const opsActiva = opsPanelUid === pr._uid
            const opsConf = pr.opsPlaza && pr.opsSeccion
            const plazaCfg = PLAZAS_OPS.find(p => p.id === pr.opsPlaza)
            // Gramaje por plato: solo cuenta si está en gramos (pax/u rompen el total)
            const tieneG = pr.opsCantidad != null && pr.opsUnidad === 'g'

            return (
              <div key={pr._uid}>
                {/* Fila principal */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderBottom: (idx < platoRecetas.length - 1 || opsActiva) ? '1px solid var(--border)' : 'none', background: idx % 2 === 1 ? 'rgba(0,0,0,.01)' : 'transparent' }}>
                  {pr.tipo === 'receta' ? (
                    <button onClick={() => setPreviewUid(prev => prev === pr._uid ? null : pr._uid)} title="Ver receta" aria-label="Ver receta"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 17, color: cfg.color }}>{cfg.icon}</span>
                    </button>
                  ) : (
                    <span className="material-symbols-outlined" style={{ fontSize: 17, color: cfg.color, flexShrink: 0 }}>{cfg.icon}</span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: (pr.tipo === 'receta' && draftRecetaIds.has(pr.ref_id)) ? '#dc2626' : 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pr.nombre}
                      </div>
                      {pr.tipo === 'receta' && draftRecetaIds.has(pr.ref_id) && <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 99, background: 'rgba(220,38,38,.1)', color: '#dc2626', textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0 }}>a realizar</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 5, marginTop: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                      {item && item.costo > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtMoney(item.costo)}</span>
                      )}
                      {opsConf && plazaCfg && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: `${plazaCfg.color}18`, color: plazaCfg.color }}>
                          {pr.opsRecipienteNombre
                            ? `${pr.opsRecipienteNombre} ×${pr.opsCantidad ?? 1}porc${pr.opsPesoPorcion ? ` (${pr.opsPesoPorcion}${pr.opsPesoPorcionUnidad ?? 'g'} c/u)` : ''}${(pr.opsRecipienteCantidad ?? 1) > 1 ? ` · ${pr.opsRecipienteCantidad} recipientes` : ''}`
                            : `${pr.opsCantidad ?? 1} ${pr.opsUnidad ?? 'u'}`} · {plazaCfg.label}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Gramaje por plato */}
                  {editingPorcionUid === pr._uid ? (
                    <input autoFocus type="number" value={editingPorcionVal}
                      onChange={e => setEditingPorcionVal(e.target.value)}
                      onBlur={() => saveStock(pr._uid)}
                      onKeyDown={e => { if (e.key === 'Enter') saveStock(pr._uid); if (e.key === 'Escape') setEditingPorcionUid(null) }}
                      placeholder="30"
                      style={{ width: 64, textAlign: 'center', fontSize: 13, fontWeight: 700, border: '1.5px solid var(--accent)', borderRadius: 8, padding: '4px 6px', background: 'var(--surface)', color: 'var(--navy)', outline: 'none' }}
                    />
                  ) : (
                    <button onClick={() => { setEditingPorcionUid(pr._uid); setEditingPorcionVal(tieneG ? String(pr.opsCantidad) : '') }}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, border: `1px solid ${tieneG ? 'var(--border)' : 'rgba(249,115,22,.4)'}`, borderRadius: 8, background: tieneG ? 'var(--bg)' : 'rgba(249,115,22,.06)', padding: '4px 9px', cursor: 'pointer', minWidth: 46 }}>
                      {tieneG ? (
                        <>
                          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'monospace', lineHeight: 1 }}>
                            {pr.opsCantidad}<span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-3)', marginLeft: 1 }}>g</span>
                          </span>
                          <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, lineHeight: 1 }}>por plato</span>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#f97316', lineHeight: 1 }}>+ g</span>
                          <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, lineHeight: 1 }}>por plato</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Botón OPS */}
                  <button onClick={() => openOps(pr)}
                    title="Asignar a OPS / Mise"
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '4px 7px', background: opsActiva ? 'rgba(67,97,160,.10)' : opsConf ? `${plazaCfg?.color ?? 'var(--accent)'}15` : 'var(--bg)', color: opsActiva ? 'var(--accent)' : opsConf ? (plazaCfg?.color ?? 'var(--accent)') : 'var(--text-3)', cursor: 'pointer', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>restaurant_menu</span>
                    <span style={{ fontSize: 8, fontWeight: 800, lineHeight: 1 }}>OPS</span>
                  </button>

                  <button onClick={() => setPlatoRecetas(prev => prev.filter(x => x._uid !== pr._uid))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-3)', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                  </button>
                </div>

                {/* Panel OPS inline (componente compartido) */}
                {opsActiva && (
                  <div style={{ padding: '12px 14px', borderBottom: idx < platoRecetas.length - 1 ? '1px solid var(--border)' : 'none', background: 'var(--surface)' }}>
                    <OpsPanel
                      initial={{
                        plaza: pr.opsPlaza,
                        seccion: pr.opsSeccion,
                        recipienteNombre: pr.opsRecipienteNombre,
                        recipienteCantidad: pr.opsRecipienteCantidad ?? 1,
                        cantidad: pr.opsCantidad,
                        unidad: pr.opsUnidad,
                        pesoPorcion: pr.opsPesoPorcion,
                        pesoPorcionUnidad: pr.opsPesoPorcionUnidad,
                      }}
                      hasExisting={!!pr.opsPlaza}
                      defaultUnidad="g"
                      recipienteSugerencias={recipientesUsados}
                      onSave={r => saveOps(pr._uid, r)}
                      onRemove={() => clearOps(pr._uid)}
                      onCancel={() => setOpsPanelUid(null)}
                    />
                  </div>
                )}
              </div>
            )
          })}
          {costoTotal > 0 && (
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', background: 'var(--bg)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>Costo total</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)' }}>{fmtMoney(costoTotal)}</span>
            </div>
          )}
        </div>
      )}

      {/* Buscador — siempre visible */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ position: 'relative' }}>
          <span className="material-symbols-outlined" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'var(--text-3)', pointerEvents: 'none' }}>search</span>
          <input
            value={platoSearch}
            onChange={e => { setPlatoSearch(e.target.value); setPlatoShowResults(true) }}
            onFocus={() => setPlatoShowResults(true)}
            onBlur={() => setTimeout(() => setPlatoShowResults(false), 150)}
            placeholder="Buscar receta…"
            style={{ width: '100%', padding: '12px 12px 12px 40px', border: 'none', background: 'transparent', fontSize: 13, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>
        {!platoSearch.trim() && platoRecetas.length === 0 && recetas.length > 0 && (
          <div style={{ padding: '8px 14px 10px', fontSize: 11, color: 'var(--text-3)' }}>
            {recetas.length} recetas disponibles — escribí para buscar
          </div>
        )}
        {platoShowResults && searchResults.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {searchResults.map((r, idx) => {
              const cfg = TIPO_CFG[r.tipo]
              return (
                <button key={`${r.tipo}-${r.id}`} onMouseDown={e => { e.preventDefault(); agregarItem(r) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', textAlign: 'left', border: 'none', borderBottom: idx < searchResults.length - 1 ? '1px solid var(--border)' : 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: cfg.color, flexShrink: 0 }}>{cfg.icon}</span>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{r.nombre}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: cfg.bg, color: cfg.color, flexShrink: 0 }}>{cfg.label}</span>
                  {r.costo > 0 && <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>{fmtMoney(r.costo)}</span>}
                </button>
              )
            })}
          </div>
        )}
        {platoShowResults && platoSearch.trim().length > 0 && searchResults.length === 0 && (
          <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>
              Sin resultados para &quot;<b>{platoSearch}</b>&quot;
            </div>
            <button
              onMouseDown={e => { e.preventDefault(); agregarIdea() }}
              disabled={creandoIdea}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '9px 14px', borderRadius: 10, border: '1.5px dashed var(--accent)',
                background: 'rgba(67,97,160,.06)', color: 'var(--accent)', fontSize: 12, fontWeight: 700,
                cursor: creandoIdea ? 'default' : 'pointer', fontFamily: 'inherit', opacity: creandoIdea ? .6 : 1 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                {creandoIdea ? 'progress_activity' : 'add_circle'}
              </span>
              {creandoIdea ? 'Creando…' : `Crear "${platoSearch}" como idea en recetario`}
            </button>
          </div>
        )}
      </div>
      {previewUid != null && (() => {
        const pr = platoRecetas.find(x => x._uid === previewUid)
        if (!pr || pr.tipo !== 'receta') return null
        const receta = recetas.find(r => r.id === pr.ref_id)
        return <RecetaPreviewModal nombre={pr.nombre} ingredientes={receta?.ingredientes ?? []} onClose={() => setPreviewUid(null)} />
      })()}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// ITEM ROW — fila colapsada + editor inline expandible
// ════════════════════════════════════════════════════════════
function ItemRowInline({
  item, expanded, onToggle, onChange, onRemove, recetas, productos, cartaItems, variantes, draftRecetaIds, recipientesUsados,
}: {
  item: ItemRow
  expanded: boolean
  onToggle: () => void
  onChange: (patch: Partial<ItemRow>) => void
  onRemove: () => void
  recetas: RefConCosto[]
  productos: RefConCosto[]
  cartaItems: RefConCosto[]
  variantes: string[]
  draftRecetaIds: Set<string>
  recipientesUsados: string[]
}) {
  const [showResults, setShowResults] = useState(false)
  const [opsOpen, setOpsOpen] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  // Texto crudo del input de cantidad — desacoplado de item.cantidad (number)
  // para no perder la coma decimal ni el punto final mientras se escribe.
  const [cantidadText, setCantidadText] = useState(item.cantidad != null ? String(item.cantidad).replace('.', ',') : '')

  // Receta vinculada todavía sin realizar (idea/draft) → se pinta en rojo.
  const isDraft = item.tipo === 'receta' && !!item.ref_id && draftRecetaIds.has(item.ref_id)
  const recetaVinculada = item.tipo === 'receta' && item.ref_id ? recetas.find(r => r.id === item.ref_id) : null
  const plazaCfg = PLAZAS_OPS.find(p => p.id === item.plaza)
  // seccion_mise puede ser un id legacy de SECCIONES_OPS o un UUID real de
  // checklist_secciones (Sesión 2, B2) — sin el nombre cargado acá, mostrar
  // "Sección" en vez de filtrar el UUID crudo al chip.
  const seccionLabel = item.seccion_mise
    ? (SECCIONES_OPS.find(s => s.id === item.seccion_mise)?.label ?? (/^[0-9a-f-]{36}$/i.test(item.seccion_mise) ? 'Sección' : item.seccion_mise))
    : null
  const opsResumen = item.plaza
    ? `${plazaCfg?.label ?? item.plaza}${seccionLabel ? ' · ' + seccionLabel : ''}${item.cantidad_ops != null ? ' · ' + item.cantidad_ops + (item.unidad_ops ?? '') : ''}`
    : null

  // Sugerencias para vincular — buscan sobre el mismo texto que Nombre
  // (campo unificado: escribir es buscar; elegir un resultado vincula).
  const results = useMemo(() => {
    if (item.tipo || !item.nombre.trim()) return []
    const ql = item.nombre.toLowerCase()
    return [
      ...recetas.filter(r => r.nombre.toLowerCase().includes(ql)).slice(0, 5).map(r => ({ tipo: 'receta' as const, id: r.id, nombre: r.nombre })),
      ...cartaItems.filter(p => p.nombre.toLowerCase().includes(ql)).slice(0, 4).map(p => ({ tipo: 'plato' as const, id: p.id, nombre: p.nombre })),
      ...productos.filter(p => p.nombre.toLowerCase().includes(ql)).slice(0, 4).map(p => ({ tipo: 'producto' as const, id: p.id, nombre: p.nombre })),
    ].slice(0, 8)
  }, [item.tipo, item.nombre, recetas, productos, cartaItems])

  const tcfg = item.tipo ? TIPO_CFG[item.tipo] : null
  // Fuente vinculada (para saber si se puede costear por gramo)
  const fuenteLigada = item.tipo === 'receta' ? recetas : item.tipo === 'producto' ? productos : item.tipo === 'plato' ? cartaItems : null
  const refLigado = fuenteLigada && item.ref_id ? fuenteLigada.find(f => f.id === item.ref_id) : null
  const sinCostoPorGramo = !!refLigado && refLigado.costoPorGramo == null

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '5px 11px', borderRadius: 99, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'rgba(67,97,160,.12)' : 'var(--surface)', color: active ? 'var(--accent)' : 'var(--text-3)',
    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize', whiteSpace: 'nowrap',
  })
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 5px', display: 'block' }
  const fieldInp: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }

  return (
    <div style={{ borderTop: '1px solid var(--border)', background: expanded ? 'var(--bg)' : 'transparent' }}>
      {/* Fila colapsada */}
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer' }}>
        {tcfg && (
          recetaVinculada ? (
            <button onClick={e => { e.stopPropagation(); setShowPreview(true) }} title="Ver receta" aria-label="Ver receta"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: tcfg.color }}>{tcfg.icon}</span>
            </button>
          ) : (
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: tcfg.color, flexShrink: 0 }}>{tcfg.icon}</span>
          )
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: isDraft ? '#dc2626' : (item.nombre ? 'var(--text-1)' : 'var(--text-3)'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.nombre || 'Tocá para completar…'}
            </div>
            {isDraft && <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 99, background: 'rgba(220,38,38,.1)', color: '#dc2626', textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0 }}>a realizar</span>}
          </div>
          {!expanded && (item.plaza || item.seccion_mise || item.cantidad != null || item.variante) && (
            <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
              {item.variante && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'rgba(139,92,246,.12)', color: '#7c3aed' }}>{item.variante}</span>}
              {item.plaza && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'rgba(67,97,160,.1)', color: 'var(--accent)', textTransform: 'capitalize' }}>{plazaCfg?.label ?? item.plaza}</span>}
              {item.seccion_mise && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'rgba(14,116,144,.12)', color: '#0e7490' }}>{seccionLabel}</span>}
              {item.cantidad != null && <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'monospace' }}>{item.cantidad}{item.unidad ?? ''}</span>}
            </div>
          )}
        </div>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)', flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>expand_more</span>
        <button onClick={e => { e.stopPropagation(); onRemove() }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#ef4444', flexShrink: 0, display: 'flex' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
        </button>
      </div>

      {/* Editor inline */}
      {expanded && (
        <div style={{ padding: '0 12px 12px' }}>
          {/* Identidad — un solo campo con dos estados: vinculado (chip, con
              "Desvincular" para volver a texto libre) o sin vincular (texto +
              búsqueda en vivo). Antes eran dos campos separados ("Vincular…" y
              "Nombre") que se pisaban entre sí sin dejar claro cuál mandaba. */}
          <label style={lbl}>Nombre</label>
          {item.tipo && item.ref_id ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 9, border: `1px solid ${tcfg?.color ?? 'var(--border)'}55`, background: `${tcfg?.color ?? '#000'}0d`, marginBottom: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: tcfg?.color }}>{tcfg?.icon}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nombre}</span>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: tcfg?.bg, color: tcfg?.color, flexShrink: 0 }}>{tcfg?.label}</span>
              <button onClick={() => onChange({ tipo: null, ref_id: null })} title="Desvincular — pasa a texto libre" aria-label="Desvincular"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-3)', display: 'flex', flexShrink: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 17 }}>link_off</span>
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input value={item.nombre} onChange={e => { onChange({ nombre: e.target.value }); setShowResults(true) }} onFocus={() => setShowResults(true)} onBlur={() => setTimeout(() => setShowResults(false), 150)} placeholder="Escribí un nombre o buscá para vincular…" style={fieldInp} />
              {showResults && results.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, marginTop: 4, maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
                  {results.map(r => {
                    const cfg = TIPO_CFG[r.tipo]
                    return (
                      <button key={`${r.tipo}-${r.id}`} onMouseDown={e => { e.preventDefault(); onChange({ tipo: r.tipo, ref_id: r.id, nombre: r.nombre }); setShowResults(false) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 11px', textAlign: 'left', border: 'none', borderBottom: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: cfg.color }}>{cfg.icon}</span>
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{r.nombre}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
              {item.nombre.trim() && results.length === 0 && (
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>Sin vincular — queda como texto libre (no costea ni se puede ver como receta).</div>
              )}
            </div>
          )}

          {/* Producción — separa "qué es" (arriba) de "dónde/cuánto" (abajo);
              antes todo el bloque tenía el mismo peso visual gris. */}
          <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.08em', margin: '2px 2px 9px', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            Producción
          </div>

          {/* OPS / Mise — mismo panel compartido que ficha y plato */}
          <label style={lbl}>OPS / Mise</label>
          {!opsOpen ? (
            <button onClick={() => setOpsOpen(true)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 9, border: `1px solid ${item.plaza ? (plazaCfg?.color ?? 'var(--accent)') + '55' : 'var(--border)'}`, background: item.plaza ? (plazaCfg?.color ?? 'var(--accent)') + '10' : 'var(--bg)', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: item.plaza ? (plazaCfg?.color ?? 'var(--accent)') : 'var(--accent)' }}>restaurant_menu</span>
              <span style={{ flex: 1, textAlign: 'left', fontSize: 12, fontWeight: 600, color: item.plaza ? 'var(--text-1)' : 'var(--text-3)' }}>
                {opsResumen ?? 'Asignar plaza, sección, recipiente…'}
              </span>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>chevron_right</span>
            </button>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 10, background: 'var(--surface)' }}>
              <OpsPanel
                initial={{
                  plaza: item.plaza,
                  // seccion_mise ya guarda el id tal cual lo emitió OpsPanel
                  // (legacy o UUID real de checklist_secciones) — sin remapear.
                  seccion: item.seccion_mise ?? '',
                  recipienteNombre: item.recipiente_nombre,
                  cantidad: item.cantidad_ops,
                  unidad: item.unidad_ops,
                  pesoPorcion: item.peso_porcion,
                  pesoPorcionUnidad: item.peso_porcion_unidad,
                }}
                hasExisting={!!item.plaza}
                recipienteSugerencias={recipientesUsados}
                onSave={r => { onChange({ plaza: r.plaza, seccion_mise: r.seccion, cantidad_ops: r.cantidad, unidad_ops: r.unidad, recipiente_nombre: r.recipienteNombre, peso_porcion: r.pesoPorcion, peso_porcion_unidad: r.pesoPorcionUnidad }); setOpsOpen(false) }}
                onRemove={() => { onChange({ plaza: null, seccion_mise: null, cantidad_ops: null, unidad_ops: null, recipiente_nombre: null, peso_porcion: null, peso_porcion_unidad: null }); setOpsOpen(false) }}
                onCancel={() => setOpsOpen(false)}
              />
            </div>
          )}

          {/* Variante — a qué opción del menú pertenece (Común = todas) */}
          {variantes.length > 0 && (
            <>
              <label style={lbl}>Variante <span style={{ textTransform: 'none', fontWeight: 500, color: 'var(--text-3)' }}>(a qué opción pertenece)</span></label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                <button onClick={() => onChange({ variante: null })} style={chip(!item.variante)}>Común</button>
                {variantes.map(v => (
                  <button key={v} onClick={() => onChange({ variante: item.variante === v ? null : v })} style={chip(item.variante === v)}>{v}</button>
                ))}
              </div>
            </>
          )}

          {/* Cantidad — para receta/producto es peso en gramos (coincide con el
              costeo del recetario). Para un plato vinculado no hay "gramos": es
              simplemente cuántas veces entra ese plato acá (antes se forzaba 'g'
              igual, y el costo terminaba multiplicado como si fuera peso). */}
          {item.tipo === 'plato' ? (
            <div>
              <label style={lbl}>Cantidad <span style={{ textTransform: 'none', fontWeight: 500, color: 'var(--text-3)' }}>(cuántos platos)</span></label>
              <input value={cantidadText}
                onChange={e => {
                  const raw = e.target.value
                  setCantidadText(raw)
                  const parsed = raw.trim() ? parseFloat(raw.replace(',', '.')) : null
                  onChange({ cantidad: parsed != null && !isNaN(parsed) ? parsed : null, unidad: 'u' })
                }}
                onBlur={() => setCantidadText(item.cantidad != null ? String(item.cantidad).replace('.', ',') : '')}
                placeholder="1" inputMode="decimal" style={{ ...fieldInp, width: 90 }} />
            </div>
          ) : (
            <div>
              <label style={lbl}>Cantidad</label>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <input value={cantidadText}
                  onChange={e => {
                    const raw = e.target.value
                    setCantidadText(raw)
                    const parsed = raw.trim() ? parseFloat(raw.replace(',', '.')) : null
                    onChange({ cantidad: parsed != null && !isNaN(parsed) ? parsed : null, unidad: 'g' })
                  }}
                  onBlur={() => setCantidadText(item.cantidad != null ? String(item.cantidad).replace('.', ',') : '')}
                  placeholder="250" inputMode="decimal" style={{ ...fieldInp, flex: 1 }} />
                <span style={{ ...fieldInp, width: 40, textAlign: 'center', background: 'var(--surface)', color: 'var(--text-3)', fontWeight: 700 }}>g</span>
              </div>
              {sinCostoPorGramo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, padding: '5px 8px', background: 'rgba(217,119,6,.1)', borderRadius: 7 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#d97706' }}>warning</span>
                  <span style={{ fontSize: 10, color: '#d97706', fontWeight: 600 }}>
                    {item.tipo === 'receta' ? 'Esta receta no tiene peso total cargado — el costo usa la porción como aproximación. Cargá el peso en Recetario para costear exacto por gramo.' : 'No se pudo derivar el costo por gramo de este ítem — el costo total puede ser aproximado.'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {showPreview && recetaVinculada && (
        <RecetaPreviewModal nombre={recetaVinculada.nombre} ingredientes={recetaVinculada.ingredientes ?? []} onClose={() => setShowPreview(false)} />
      )}
    </div>
  )
}
