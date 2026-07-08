'use client'

import { useState, useMemo, useRef, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useRecetas, calcFoodCost, unitConversionFactor, type RecetaConCosto } from '@/lib/hooks/useRecetas'
import { useStock } from '@/lib/hooks/useStock'
import { useCarta } from '@/lib/hooks/useCarta'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { useProduccionRegistros, type ProduccionRegistro } from '@/lib/hooks/useProduccionRegistros'
import { FC_ALERT_HIGH, FC_ALERT_OK } from '@/lib/constants'
import type { Ingrediente } from '@/types'
import PhotoPicker from '@/components/ui/PhotoPicker'
import RecetaOpsSheet from './RecetaOpsSheet'
import IngredienteOpsSheet from './IngredienteOpsSheet'
import { createClient } from '@/lib/supabase/client'
import { upsertMiseChecklistItem, PLAZAS_OPS } from '@/lib/ops/mise'
import type { OpsResult } from '@/components/ops/OpsPanel'

const UNIDADES = ['kg', 'g', 'L', 'ml', 'unidad', 'docena', 'caja']

// Convierte una cantidad+unidad a gramos (para calcular peso por porción)
function toGramos(cantidad: number, unidad: string): number {
  const u = (unidad || '').toLowerCase().trim()
  if (u === 'kg') return cantidad * 1000
  if (u === 'g') return cantidad
  if (u === 'l' || u === 'lt' || u === 'lts') return cantidad * 1000 // 1L ≈ 1kg
  if (u === 'ml') return cantidad
  return 0 // unidades sueltas (u, docena, caja) no suman peso
}

function calcPesoPorcion(ingredientes: { cantidad: number; unidad: string; merma_pct?: number | null }[], porciones: number): number | null {
  if (!porciones || porciones <= 0) return null
  const netoG = ingredientes.reduce((s, i) => {
    const bruto = toGramos(i.cantidad, i.unidad)
    return s + bruto * (1 - (i.merma_pct ?? 0) / 100)
  }, 0)
  if (netoG <= 0) return null
  return Math.round(netoG / porciones)
}

function calcPesoNetos(ingredientes: { cantidad: number; unidad: string; merma_pct?: number | null }[]) {
  let brutoG = 0
  let netoG = 0
  for (const i of ingredientes) {
    const g = toGramos(i.cantidad, i.unidad)
    brutoG += g
    netoG += g * (1 - (i.merma_pct ?? 0) / 100)
  }
  return { brutoG, netoG, hasMerma: brutoG > 0 && Math.abs(brutoG - netoG) > 0.01 }
}

function formatPeso(gramos: number): string {
  if (gramos >= 1000) return `${(gramos / 1000).toFixed(gramos % 1000 === 0 ? 0 : 1)}kg/u`
  return `${gramos}g/u`
}

// Smart display: siempre muestra la unidad más legible independiente de cómo está guardado.
// 0.005 kg → 5g | 1500 g → 1.5kg | 0.05 l → 50ml | 2000 ml → 2l
function smartQty(qty: number, unit: string): { qty: string; unit: string } {
  const u = (unit || '').toLowerCase().trim()
  if ((u === 'kg' || u === 'kgs' || u === 'kilo') && qty < 0.1 && qty > 0) {
    const g = qty * 1000
    return { qty: g % 1 === 0 ? String(g) : g.toFixed(1), unit: 'g' }
  }
  if (u === 'g' && qty >= 1000) {
    const kg = qty / 1000
    return { qty: kg % 1 === 0 ? String(kg) : kg.toFixed(2).replace(/\.?0+$/, ''), unit: 'kg' }
  }
  if ((u === 'l' || u === 'lt' || u === 'lts') && qty < 0.1 && qty > 0) {
    const ml = qty * 1000
    return { qty: ml % 1 === 0 ? String(ml) : ml.toFixed(1), unit: 'ml' }
  }
  if (u === 'ml' && qty >= 1000) {
    const l = qty / 1000
    return { qty: l % 1 === 0 ? String(l) : l.toFixed(2).replace(/\.?0+$/, ''), unit: 'l' }
  }
  // Default: format removing trailing zeros
  const fmtQty = qty % 1 === 0 ? String(qty) : qty.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  return { qty: fmtQty, unit }
}

function fcColor(pct: number) {
  if (pct >= FC_ALERT_HIGH) return '#ef4444'
  if (pct >= FC_ALERT_OK) return '#f59e0b'
  return '#4ade80'
}

interface FormIng {
  nombre: string
  cantidad: string
  unidad: string
  costo_unitario: string
  unidad_costo: string
  merma_pct: string
}
const ING_EMPTY: FormIng = { nombre: '', cantidad: '0', unidad: 'kg', costo_unitario: '0', unidad_costo: 'kg', merma_pct: '0' }

// ── PDF Export (lazy-loaded to avoid SSR issues with jsPDF) ──
async function handleExportPDF(receta: RecetaConCosto) {
  const { exportRecetaPDF } = await import('@/lib/exportPDF')
  await exportRecetaPDF({
    nombre: receta.nombre,
    categoria: receta.categoria,
    porciones: receta.porciones ?? 0,
    tiempo_min: receta.tiempo_min ?? 0,
    precio_venta: receta.precio_venta ?? 0,
    procedimiento: receta.procedimiento ?? '',
    ingredientes: (receta.ingredientes ?? []).map(i => ({
      nombre: i.nombre,
      cantidad: i.cantidad,
      unidad: i.unidad,
    })),
  })
}

export default function RecetaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { recetas, loading, agregarReceta, actualizarReceta, eliminarReceta, agregarIngrediente, actualizarIngrediente, eliminarIngrediente } = useRecetas()
  const { productos: stockProductos } = useStock()
  const { getHistorial } = useProduccionRegistros()
  const { items: cartaItems, crearItem, actualizarItem, eliminarItem, categorias: cartaCategorias } = useCarta()
  const { isAdmin, puedeEditar } = usePermisos()
  const RESTAURANTE_ID = useRestauranteId()
  const canEdit = isAdmin || puedeEditar('recetas')

  const [historial, setHistorial] = useState<ProduccionRegistro[]>([])
  const [historialOpen, setHistorialOpen] = useState(false)
  const [historialLoading, setHistorialLoading] = useState(false)
  const [actualizarSugerencia, setActualizarSugerencia] = useState<{ promedio: number } | null>(null)
  const [actualizandoReceta, setActualizandoReceta] = useState(false)

  // Convertir a plato / OPS
  const [opsOpen, setOpsOpen] = useState(false)
  const [opsIngId, setOpsIngId] = useState<string | null>(null)   // OPS por ingrediente (receta-plato)
  const [opsIngSaving, setOpsIngSaving] = useState(false)
  const [converting, setConverting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  // Receta buscada en la lista paginada — o fetcheada directo si no está aún
  const recetaEnLista = useMemo(() => recetas.find(r => r.id === id) ?? null, [recetas, id])
  const [recetaDirecta, setRecetaDirecta] = useState<RecetaConCosto | null>(null)
  const [fetchingDirect, setFetchingDirect] = useState(false)
  const receta = recetaEnLista ?? recetaDirecta

  // Plato de carta vinculado a esta receta (link 1:1 por receta_id)
  const linkedPlato = useMemo(
    () => (receta ? cartaItems.find(i => i.receta_id === receta.id) ?? null : null),
    [cartaItems, receta]
  )

  async function handleConvertir() {
    if (!receta || converting) return
    if (linkedPlato) { router.push('/carta'); return }
    setConverting(true)
    try {
      const catMatch = cartaCategorias.find(c => c.nombre.toLowerCase() === (receta.categoria ?? '').toLowerCase())
      await crearItem({
        nombre: receta.nombre,
        descripcion: null,
        precio_venta: receta.precio_venta ?? 0,
        categoria: catMatch?.nombre ?? cartaCategorias[0]?.nombre ?? 'Principales',
        receta_id: receta.id,
        foto_url: receta.foto_url ?? null,
      })
      setToast((receta.precio_venta ?? 0) > 0 ? 'Plato creado en la carta' : 'Plato creado — cargá un precio de venta')
    } catch (e: unknown) {
      setToast('Error: ' + (e instanceof Error ? e.message : 'desconocido'))
    } finally { setConverting(false) }
  }

  async function syncPrecioAPlato() {
    if (!linkedPlato || !receta) return
    await actualizarItem(linkedPlato.id, { precio_venta: receta.precio_venta ?? 0 })
    setToast('Precio del plato actualizado')
  }
  async function syncPrecioAReceta() {
    if (!linkedPlato || !receta) return
    await actualizarReceta(receta.id, { precio_venta: linkedPlato.precio_venta })
    setToast('Precio de la receta actualizado')
  }

  useEffect(() => {
    if (!loading && !recetaEnLista && !recetaDirecta && !fetchingDirect) {
      // La receta no está en la página paginada — puede ser nueva o estar en otra página
      setFetchingDirect(true)
      import('@/lib/supabase/client').then(({ createClient }) => {
        const supabase = createClient()
        Promise.all([
          supabase.from('recetas').select('*').eq('id', id).single(),
          supabase.from('ingredientes').select('*').eq('receta_id', id),
        ]).then(([{ data: r }, { data: ings }]) => {
          if (r) {
            const ingredientesData = ings ?? []
            setRecetaDirecta({
              ...r,
              status: r.status || 'published',
              ingredientes: ingredientesData,
              food_cost: calcFoodCost(ingredientesData, r.porciones ?? 0, r.precio_venta ?? 0),
            })
          }
          setFetchingDirect(false)
        })
      })
    }
  }, [loading, recetaEnLista, recetaDirecta, fetchingDirect, id])

  // ── Historial de producción ──
  useEffect(() => {
    if (!historialOpen || historial.length > 0) return
    setHistorialLoading(true)
    getHistorial(id).then(data => {
      setHistorial(data)
      // Check if 3 consecutive deviations >= 10%
      if (data.length >= 3) {
        const ultimos = data.slice(0, 3)
        const allDeviated = ultimos.every(r => Math.abs((r.multiplicador_real ?? 1) - 1) >= 0.10)
        if (allDeviated) {
          const promedio = ultimos.reduce((s, r) => s + (r.multiplicador_real ?? 1), 0) / ultimos.length
          setActualizarSugerencia({ promedio: Math.round(promedio * 100) / 100 })
        }
      }
      setHistorialLoading(false)
    })
  }, [historialOpen, historial.length, id, getHistorial])

  async function handleActualizarIngredientes(promedio: number) {
    if (!receta || actualizandoReceta) return
    setActualizandoReceta(true)
    try {
      for (const ing of receta.ingredientes ?? []) {
        await actualizarIngrediente(ing.id, { cantidad: Math.round(ing.cantidad * promedio * 100) / 100 })
      }
      setActualizarSugerencia(null)
    } finally {
      setActualizandoReceta(false)
    }
  }

  // ── Conversión proporcional (CAMBIO 3) ──
  const [scaleFactor, setScaleFactor] = useState(1)
  const [scaleRefIng, setScaleRefIng] = useState<string | null>(null) // nombre del ingrediente de referencia
  const [editingIngId, setEditingIngId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set())
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [unitToggleGlobal, setUnitToggleGlobal] = useState(false)
  const UNIT_PAIRS: Record<string, { target: string; factor: number }> = {
    kg: { target: 'g', factor: 1000 },
    l: { target: 'ml', factor: 1000 },
    lt: { target: 'ml', factor: 1000 },
    lts: { target: 'ml', factor: 1000 },
  }
  const editInputRef = useRef<HTMLInputElement>(null)
  const lastTapRef = useRef<{ id: string; time: number } | null>(null)

  // Modal ingrediente
  const [ingModal, setIngModal] = useState(false)
  const [editIng, setEditIng] = useState<Ingrediente | null>(null)
  const [ingForm, setIngForm] = useState<FormIng>(ING_EMPTY)
  const [ingSaving, setIngSaving] = useState(false)
  const [ingError, setIngError] = useState<string | null>(null)
  const [ingSuggestions, setIngSuggestions] = useState<typeof stockProductos>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [ingTipo, setIngTipo] = useState<'producto' | 'subreceta'>('producto')
  const [ingSubrecetaId, setIngSubrecetaId] = useState<string | null>(null)
  const [subrecetaSearch, setSubrecetaSearch] = useState('')
  const [mermaPesoInput, setMermaPesoInput] = useState('0')

  const CAT_RECETA = ['Entradas', 'Principales', 'Postres', 'Guarniciones', 'Bebidas', 'Pastelería', 'Panadería', 'Fondos', 'Salsas', 'Otros']

  // Edit receta modal
  const [editModal, setEditModal] = useState(false)
  const [editForm, setEditForm] = useState({ nombre: '', categoria: '', porciones: '', precio_venta: '', tiempo_min: '', procedimiento: '', es_plato: false })
  const [editPesoTotal, setEditPesoTotal] = useState('')
  const [editPesoEscurrido, setEditPesoEscurrido] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<'receta' | 'ingrediente' | null>(null)
  const [deleteIngId, setDeleteIngId] = useState<string | null>(null)

  // Food cost collapsible
  const [fcOpen, setFcOpen] = useState(false)

  // Escalado por porciones (Feature 1) + precio sugerido (Feature 3)
  const [prodPorc, setProdPorc] = useState('')
  const [targetFC, setTargetFC] = useState('30')
  useEffect(() => {
    if (receta && prodPorc === '') setProdPorc(String(receta.porciones ?? ''))
  }, [receta, prodPorc])

  // Focus edit input when editing
  useEffect(() => {
    if (editingIngId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingIngId])

  // Corrige el costo de ingredientes que son sub-recetas: usa datos live en vez del costo_unitario guardado
  function corregirSubreceta(i: Ingrediente): Ingrediente {
    if (i.tipo !== 'subreceta' || !i.subreceta_id) return i
    const subR = recetas.find(r => r.id === i.subreceta_id)
    if (!subR) return i
    const { netoG } = calcPesoNetos(subR.ingredientes ?? [])
    const porciones = subR.porciones ?? 1
    const pesoNetoPorcionG = porciones > 0 && netoG > 0 ? netoG / porciones : 0
    if (pesoNetoPorcionG > 0 && subR.food_cost.costo_porcion > 0) {
      const costoGNeto = subR.food_cost.costo_porcion / pesoNetoPorcionG
      const cantidadG = toGramos(i.cantidad, i.unidad)
      if (cantidadG > 0) return { ...i, cantidad: cantidadG, unidad: 'g', unidad_costo: 'g', costo_unitario: costoGNeto }
    }
    // Fallback por porción si no tiene peso medible
    return { ...i, costo_unitario: subR.food_cost.costo_porcion, unidad: 'unidad', unidad_costo: 'unidad' }
  }

  // Food cost con escala y sub-recetas corregidas
  const scaledFC = useMemo(() => {
    if (!receta) return null
    const ings = (receta.ingredientes ?? []).map(i => {
      const corr = corregirSubreceta(i)
      return { ...corr, cantidad: corr.cantidad * scaleFactor }
    })
    return calcFoodCost(ings, receta.porciones ?? 0, receta.precio_venta ?? 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receta, scaleFactor, recetas])

  if (loading || fetchingDirect) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Cargando…</p>
    </div>
  )

  if (!receta) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
      <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Receta no encontrada</p>
      <button onClick={() => router.push('/recetario')} style={{ background: 'var(--navy)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Volver al recetario</button>
    </div>
  )

  const fc = scaledFC ?? receta.food_cost
  const ings = receta.ingredientes ?? []
  // Sub-recetas con costos corregidos (para food cost card)
  const ingsEfectivos = ings.map(corregirSubreceta)
  const costoTotal = ingsEfectivos.reduce((s, i) => {
    const f = unitConversionFactor(i.unidad ?? '', i.unidad_costo ?? i.unidad ?? '')
    return s + i.cantidad * f * (i.costo_unitario ?? 0)
  }, 0)

  // ── Double-tap handler for proportional conversion ──
  function handleIngTap(ing: Ingrediente) {
    const now = Date.now()
    if (lastTapRef.current && lastTapRef.current.id === ing.id && now - lastTapRef.current.time < 400) {
      // Double tap detected
      lastTapRef.current = null
      setEditingIngId(ing.id)
      setEditingValue(String((ing.cantidad * scaleFactor).toFixed(3).replace(/\.?0+$/, '')))
    } else {
      lastTapRef.current = { id: ing.id, time: now }
    }
  }

  function handleScaleConfirm(ing: Ingrediente) {
    const newVal = parseFloat(editingValue.replace(',', '.'))
    if (isNaN(newVal) || newVal <= 0) {
      setEditingIngId(null)
      return
    }
    const originalVal = ing.cantidad * scaleFactor
    if (originalVal <= 0) {
      setEditingIngId(null)
      return
    }
    const ratio = newVal / (ing.cantidad) // ratio against original (unscaled)
    setScaleFactor(ratio)
    setScaleRefIng(ing.nombre)
    setProdPorc(String(Math.round((receta?.porciones ?? 0) * ratio * 100) / 100))
    setEditingIngId(null)

    // Highlight all ingredients
    const allIds = new Set(ings.map(i => i.id))
    setHighlightedIds(allIds)
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => setHighlightedIds(new Set()), 5000)
  }

  function resetScale() {
    setScaleFactor(1)
    setScaleRefIng(null)
    setHighlightedIds(new Set())
    setProdPorc(String(receta?.porciones ?? ''))
  }

  // Escalar a N porciones (Feature 1)
  function escalarAPorciones(valor: string) {
    setProdPorc(valor)
    const n = parseFloat(valor.replace(',', '.'))
    const base = receta?.porciones ?? 0
    if (n > 0 && base > 0) {
      setScaleFactor(n / base)
      setScaleRefIng(null) // usa el control de porciones, no el aviso de doble-tap
    }
  }

  // ── Ingrediente handlers ──
  function openAddIng() {
    setEditIng(null)
    setIngForm(ING_EMPTY)
    setIngError(null)
    setIngTipo('producto')
    setIngSubrecetaId(null)
    setSubrecetaSearch('')
    setMermaPesoInput('0')
    setIngModal(true)
  }
  function openEditIng(i: Ingrediente) {
    setEditIng(i)
    setIngError(null)
    const tipo: 'producto' | 'subreceta' = i.tipo === 'subreceta' ? 'subreceta' : 'producto'
    setIngTipo(tipo)
    setIngSubrecetaId(i.subreceta_id ?? null)
    setSubrecetaSearch(tipo === 'subreceta' ? i.nombre : '')
    if (tipo === 'subreceta') {
      // Recalcular desde datos live para corregir costo_unitario mal guardado
      const corr = corregirSubreceta(i)
      setIngForm({ nombre: i.nombre, cantidad: String(corr.cantidad), unidad: corr.unidad, costo_unitario: String(corr.costo_unitario?.toFixed(6) ?? 0), unidad_costo: corr.unidad, merma_pct: '0' })
      setMermaPesoInput('0')
    } else {
      setIngForm({ nombre: i.nombre, cantidad: String(i.cantidad), unidad: i.unidad, costo_unitario: String(i.costo_unitario ?? 0), unidad_costo: i.unidad_costo ?? '', merma_pct: String(i.merma_pct ?? 0) })
      const pct = i.merma_pct ?? 0
      if (pct > 0 && i.cantidad > 0) {
        const peso = i.cantidad * (pct / 100)
        setMermaPesoInput(peso.toFixed(3).replace(/\.?0+$/, ''))
      } else {
        setMermaPesoInput('0')
      }
    }
    setIngModal(true)
  }
  async function handleSaveIng() {
    if (!ingForm.nombre.trim()) { setIngError('Nombre obligatorio'); return }
    if (ingTipo === 'subreceta' && !ingSubrecetaId) { setIngError('Seleccioná una subreceta'); return }
    setIngSaving(true)
    setIngError(null)
    try {
      const datos = {
        nombre: ingForm.nombre.trim(),
        cantidad: parseFloat(ingForm.cantidad) || 0,
        unidad: ingForm.unidad,
        costo_unitario: parseFloat(ingForm.costo_unitario) || 0,
        unidad_costo: ingForm.unidad_costo,
        tipo: ingTipo,
        subreceta_id: ingTipo === 'subreceta' ? ingSubrecetaId : null,
        merma_pct: parseFloat(ingForm.merma_pct) || 0,
      }
      if (editIng) {
        await actualizarIngrediente(editIng.id, datos)
      } else {
        await agregarIngrediente(id, datos)
      }
      setIngModal(false)
    } catch (e: unknown) {
      setIngError(e instanceof Error ? e.message : 'Error')
    } finally { setIngSaving(false) }
  }

  async function handleDuplicar() {
    if (!receta) return
    const newId = await agregarReceta(
      {
        nombre: `Copia de ${receta.nombre}`,
        categoria: receta.categoria,
        porciones: receta.porciones,
        tiempo_min: receta.tiempo_min,
        precio_venta: receta.precio_venta,
        procedimiento: receta.procedimiento ?? null,
        status: 'draft',
        activa: true,
        created_at: new Date().toISOString(),
        updated_at: null,
      },
      (receta.ingredientes ?? []).map(({ nombre, cantidad, unidad, costo_unitario, unidad_costo, subreceta_id, tipo, merma_pct }) => ({
        nombre, cantidad, unidad,
        costo_unitario: costo_unitario ?? null,
        unidad_costo: unidad_costo ?? null,
        subreceta_id: subreceta_id ?? null,
        tipo: tipo ?? null,
        merma_pct: merma_pct ?? null,
      }))
    )
    router.push(`/recetario/${newId}`)
  }

  function openEditReceta() {
    if (!receta) return
    setEditForm({
      nombre: receta.nombre,
      categoria: receta.categoria || '',
      porciones: String(receta.porciones),
      precio_venta: String(receta.precio_venta),
      tiempo_min: String(receta.tiempo_min),
      procedimiento: receta.procedimiento ?? '',
      es_plato: receta.es_plato ?? false,
    })
    setEditPesoTotal(receta.peso_total_g != null ? String(receta.peso_total_g) : '')
    setEditPesoEscurrido(receta.peso_escurrido_g != null ? String(receta.peso_escurrido_g) : '')
    setEditModal(true)
  }
  async function handleSaveReceta() {
    setEditSaving(true)
    try {
      const pesoTotalV = parseFloat(editPesoTotal.replace(',', '.'))
      const pesoEscurridoV = parseFloat(editPesoEscurrido.replace(',', '.'))
      await actualizarReceta(id, {
        nombre: editForm.nombre.trim(),
        categoria: editForm.categoria.trim() || 'Otros',
        porciones: parseInt(editForm.porciones) || 1,
        precio_venta: parseFloat(editForm.precio_venta) || 0,
        tiempo_min: parseInt(editForm.tiempo_min) || 0,
        procedimiento: editForm.procedimiento,
        peso_total_g: isNaN(pesoTotalV) ? null : pesoTotalV,
        peso_escurrido_g: isNaN(pesoEscurridoV) ? null : pesoEscurridoV,
        es_plato: editForm.es_plato,
      })
      setEditModal(false)
    } catch { /* ignore */ }
    finally { setEditSaving(false) }
  }

  // OPS por ingrediente (receta-plato): guarda el ruteo en la fila del ingrediente
  // y, si es subreceta, alimenta el mise (mismo criterio que Carta).
  async function handleIngOpsSave(result: OpsResult) {
    const ing = ings.find(i => i.id === opsIngId)
    if (!ing) return
    setOpsIngSaving(true)
    try {
      await actualizarIngrediente(ing.id, {
        plaza: result.plaza,
        seccion_mise: result.seccion,
        cantidad_ops: result.cantidad,
        unidad_ops: result.unidad,
        recipiente_nombre: result.recipienteNombre,
        peso_porcion: result.pesoPorcion,
        peso_porcion_unidad: result.pesoPorcionUnidad,
      })
      if (ing.subreceta_id && RESTAURANTE_ID) {
        await upsertMiseChecklistItem({
          supabase: createClient(), restauranteId: RESTAURANTE_ID, recetaId: ing.subreceta_id,
          nombre: ing.nombre, plaza: result.plaza, seccionMiseId: result.seccion,
          cantidad: result.cantidad, unidad: result.unidad,
          recipienteNombre: result.recipienteNombre, pesoPorcion: result.pesoPorcion, pesoPorcionUnidad: result.pesoPorcionUnidad,
        })
      }
      setOpsIngId(null)
    } finally { setOpsIngSaving(false) }
  }

  async function handleIngOpsRemove() {
    const ing = ings.find(i => i.id === opsIngId)
    if (!ing) { setOpsIngId(null); return }
    setOpsIngSaving(true)
    try {
      await actualizarIngrediente(ing.id, {
        plaza: null, seccion_mise: null, cantidad_ops: null, unidad_ops: null,
        recipiente_nombre: null, peso_porcion: null, peso_porcion_unidad: null,
      })
      setOpsIngId(null)
    } finally { setOpsIngSaving(false) }
  }

  async function handleDelete() {
    if (deleteTarget === 'receta') {
      // Si la receta es un plato de la carta, quitar también el plato vinculado
      // (si no, quedaría huérfano en la carta apuntando a una receta inactiva)
      if (linkedPlato) await eliminarItem(linkedPlato.id)
      await eliminarReceta(id)
      router.push('/recetario')
    } else if (deleteTarget === 'ingrediente' && deleteIngId) {
      await eliminarIngrediente(deleteIngId)
    }
    setDeleteTarget(null)
    setDeleteIngId(null)
  }

  // Parse procedimiento into steps
  const pasos = (receta.procedimiento ?? '').split('\n').filter(l => l.trim())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Header compacto ── */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <button onClick={() => router.push('/recetario')} style={btnClear}>
              <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.7)', fontSize: 22 }}>arrow_back</span>
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{receta.nombre}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[
                  receta.categoria,
                  (receta.porciones ?? 0) > 1 ? `${receta.porciones} porc.${(() => { const p = calcPesoPorcion(receta.ingredientes ?? [], receta.porciones ?? 0); return p ? ` · ${formatPeso(p)}` : '' })()}` : null,
                  (receta.tiempo_min ?? 0) > 0 ? `${receta.tiempo_min} min` : null,
                ].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={() => handleExportPDF(receta)} style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>picture_as_pdf</span>
            </button>
            <button onClick={handleDuplicar} style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>content_copy</span>
            </button>
            <button onClick={openEditReceta} style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>edit</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Body: scroll continuo ── */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 0 80px' }}>

        {/* Foto de la receta */}
        {receta.foto_url && (
          <div style={{ position: 'relative', width: '100%', maxHeight: 220, overflow: 'hidden' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={receta.foto_url} alt={receta.nombre} style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }} />
          </div>
        )}

        {/* ── Convertir a plato (solo admin) + OPS ── */}
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, padding: '12px 14px 0' }}>
            {isAdmin && (
              <button
                onClick={handleConvertir}
                disabled={converting}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '11px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                  border: linkedPlato ? '1px solid rgba(67,97,160,.35)' : 'none',
                  background: linkedPlato ? 'rgba(67,97,160,.08)' : 'linear-gradient(135deg, var(--navy), #4361a0)',
                  color: linkedPlato ? 'var(--accent)' : '#fff', opacity: converting ? 0.6 : 1,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{linkedPlato ? 'restaurant_menu' : 'add_circle'}</span>
                {linkedPlato ? 'Ver en carta' : converting ? 'Creando…' : 'Convertir a plato'}
              </button>
            )}
            <button
              onClick={() => setOpsOpen(true)}
              title="Asignar a OPS / Mise (plaza, heladera, tupper)"
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                padding: '8px 14px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--accent)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>restaurant_menu</span>
              <span style={{ fontSize: 9, fontWeight: 800 }}>OPS</span>
            </button>
          </div>
        )}

        {/* (El banner de sync de precio receta ↔ plato se movió a la sección Food Cost —
            el precio de venta solo se ve dentro de Food Cost o del modal Editar) */}

        {/* Escalado por porciones (rendimiento dinámico) */}
        {(receta.porciones ?? 0) > 0 && (
          <div style={{ margin: '10px 14px 0', padding: '10px 12px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--accent)' }}>scale</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>Producir</span>
            <input
              type="text" inputMode="decimal"
              value={prodPorc}
              onChange={e => escalarAPorciones(e.target.value.replace(/[^0-9.,]/g, ''))}
              style={{ width: 64, border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 8, padding: '5px 8px', fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: 'var(--text-1)', textAlign: 'center', outline: 'none' }}
            />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>
              porciones {scaleFactor !== 1 && `· ×${scaleFactor.toFixed(2)}`}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>
              receta base: {receta.porciones} porc.
            </span>
            {scaleFactor !== 1 && (
              <button onClick={resetScale} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 10, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                Original
              </button>
            )}
          </div>
        )}

        {/* Aviso de escala ajustada */}
        {scaleFactor !== 1 && scaleRefIng && (
          <div style={{
            margin: '10px 14px 0', padding: '8px 12px', borderRadius: 10,
            background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}>
            <div style={{ fontSize: 11, color: '#92400e', lineHeight: 1.4 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: -2, marginRight: 4 }}>calculate</span>
              Receta ajustada a <b>{(ings.find(i => i.nombre === scaleRefIng)?.cantidad ?? 0 * scaleFactor).toFixed(2)}</b> de {scaleRefIng}
              <span style={{ opacity: .5, marginLeft: 4 }}>(×{scaleFactor.toFixed(2)})</span>
            </div>
            <button onClick={resetScale} style={{
              background: 'rgba(245,158,11,.2)', border: 'none', borderRadius: 6,
              padding: '4px 8px', fontSize: 10, fontWeight: 700, color: '#92400e',
              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}>
              Restaurar original
            </button>
          </div>
        )}

        {/* ═══ INGREDIENTES ═══ */}
        <div style={{ padding: '14px 14px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>restaurant</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Ingredientes</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)' }}>({ings.length})</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)', marginLeft: 6 }} />
            <button
              onClick={() => setUnitToggleGlobal(v => !v)}
              style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
                background: unitToggleGlobal ? '#64748b' : 'transparent',
                color: unitToggleGlobal ? '#fff' : '#94a3b8',
                border: '1.5px solid #cbd5e1',
                borderRadius: 6, padding: '3px 7px', cursor: 'pointer', lineHeight: 1.4,
                flexShrink: 0,
              }}
            >
              {unitToggleGlobal ? 'G / ML' : 'KG / L'}
            </button>
          </div>

          {ings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 16px', color: '#94a3b8' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>🧂</div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Sin ingredientes</div>
            </div>
          ) : (
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {ings.map((i, idx) => {
                const scaled = i.cantidad * scaleFactor
                const isHighlighted = highlightedIds.has(i.id)
                const isEditing = editingIngId === i.id
                const plazaOpsCfg = PLAZAS_OPS.find(p => p.id === i.plaza)
                return (
                  <div
                    key={i.id}
                    style={{
                      display: 'flex', alignItems: 'center',
                      padding: '10px 12px',
                      borderBottom: idx < ings.length - 1 ? '1px solid var(--border)' : 'none',
                      borderLeft: i.cantidad === 0 ? '3px solid #ef4444' : '3px solid transparent',
                      transition: 'background .3s',
                      background: isHighlighted ? 'rgba(245,158,11,.06)' : (i.cantidad === 0 ? '#fef2f2' : 'transparent'),
                    }}
                  >
                    {/* Nombre — toca para editar ingrediente */}
                    <button
                      onClick={() => openEditIng(i)}
                      style={{
                        flex: 1, minWidth: 0, background: 'none', border: 'none',
                        padding: 0, cursor: 'pointer', textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{i.nombre}</span>
                      {i.tipo === 'subreceta' && (
                        <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--accent)', flexShrink: 0 }}>settings</span>
                      )}
                      {i.tipo !== 'subreceta' && (
                        <span title={i.producto_id ? 'Vinculado al stock' : 'Sin vincular al stock'} style={{ width: 6, height: 6, borderRadius: '50%', background: i.producto_id ? '#10b981' : '#cbd5e1', flexShrink: 0, display: 'inline-block', marginLeft: 2 }} />
                      )}
                    </button>

                    {/* Cantidad — double tap para editar proporcionalmente */}
                    {isEditing ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <input
                          ref={editInputRef}
                          type="text"
                          inputMode="decimal"
                          value={editingValue}
                          onChange={e => setEditingValue(e.target.value.replace(/[^0-9.,]/g, ''))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); handleScaleConfirm(i) }
                            if (e.key === 'Escape') setEditingIngId(null)
                          }}
                          onBlur={() => handleScaleConfirm(i)}
                          style={{
                            width: 56, border: '1px solid #f59e0b', background: 'rgba(245,158,11,.08)',
                            borderRadius: 6, padding: '4px 6px', fontSize: 13, fontWeight: 700,
                            fontFamily: "'DM Mono', monospace", color: '#92400e',
                            textAlign: 'right', outline: 'none',
                          }}
                        />
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', minWidth: 20 }}>{i.unidad}</span>
                      </div>
                    ) : (() => {
                      const baseUnit = i.unidad?.toLowerCase() ?? ''
                      const pair = UNIT_PAIRS[baseUnit]
                      // Con el toggle global: fuerza conversión kg→g / l→ml
                      // Sin toggle: usa smart formatting (muestra la unidad más legible)
                      let displayQty: string
                      let displayUnit: string
                      if (unitToggleGlobal && pair) {
                        displayQty = (scaled * pair.factor).toFixed(0)
                        displayUnit = pair.target
                      } else {
                        const smart = smartQty(scaled, i.unidad ?? '')
                        displayQty = smart.qty
                        displayUnit = smart.unit
                      }
                      return (
                        <div
                          onClick={() => handleIngTap(i)}
                          style={{
                            flexShrink: 0, cursor: 'pointer', padding: '2px 0',
                            display: 'flex', alignItems: 'baseline', gap: 4,
                            userSelect: 'none', WebkitUserSelect: 'none',
                          }}
                        >
                          <span style={{
                            fontSize: 13, fontWeight: 700,
                            fontFamily: "'DM Mono', monospace",
                            color: isHighlighted ? '#d97706' : 'var(--text-1)',
                            transition: 'color .5s',
                          }}>
                            {displayQty}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>{displayUnit}</span>
                          {(i.merma_pct ?? 0) > 0 && (
                            <span style={{ fontSize: 9, color: 'var(--text-3)', opacity: .7 }}>↑{i.merma_pct}%</span>
                          )}
                        </div>
                      )
                    })()}

                    {/* Botón OPS por ingrediente — solo cuando la receta se trabaja como plato */}
                    {receta.es_plato && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpsIngId(i.id) }}
                        title="Asignar a OPS / Mise"
                        style={{
                          marginLeft: 10, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                          border: `1px solid ${i.plaza ? (plazaOpsCfg?.color ?? 'var(--accent)') + '55' : 'var(--border)'}`,
                          borderRadius: 8, padding: '4px 7px', cursor: 'pointer',
                          background: i.plaza ? (plazaOpsCfg?.color ?? 'var(--accent)') + '14' : 'var(--bg)',
                          color: i.plaza ? (plazaOpsCfg?.color ?? 'var(--accent)') : 'var(--text-3)',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>restaurant_menu</span>
                        <span style={{ fontSize: 8, fontWeight: 800, lineHeight: 1 }}>{i.plaza ? (plazaOpsCfg?.label ?? 'OPS') : 'OPS'}</span>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Agregar ingrediente */}
          <button
            onClick={openAddIng}
            style={{
              marginTop: 8, width: '100%', background: 'transparent',
              border: '1px dashed var(--border)', borderRadius: 10, padding: '9px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              cursor: 'pointer',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--text-3)' }}>add</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'inherit' }}>Agregar ingrediente</span>
          </button>

          {/* Hint double-tap */}
          {ings.length > 0 && scaleFactor === 1 && (
            <p style={{ fontSize: 9, color: 'var(--text-3)', textAlign: 'center', marginTop: 6, opacity: .6 }}>
              Doble tap en un peso para recalcular proporcionalmente
            </p>
          )}
        </div>

        {/* ═══ PROCEDIMIENTO ═══ */}
        <div style={{ padding: '18px 14px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>format_list_numbered</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Procedimiento</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)', marginLeft: 6 }} />
          </div>

          {pasos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 16px', color: '#94a3b8' }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Sin procedimiento</div>
              <p style={{ fontSize: 11, marginTop: 4, color: '#64748b' }}>Editá la receta para agregar pasos</p>
            </div>
          ) : (
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {pasos.map((paso, idx) => {
                // Strip leading number/dot prefix if present
                const text = paso.replace(/^\d+\.\s*/, '').trim()
                return (
                  <div key={idx} style={{
                    display: 'flex', gap: 10, padding: '10px 12px',
                    borderBottom: idx < pasos.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
                      width: 22, textAlign: 'center', flexShrink: 0, paddingTop: 1,
                    }}>{idx + 1}.</span>
                    <span style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.6 }}>{text}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ═══ HISTORIAL DE PRODUCCIÓN ═══ */}
        <HistorialProduccion
          historial={historial}
          open={historialOpen}
          loading={historialLoading}
          sugerencia={actualizarSugerencia}
          actualizando={actualizandoReceta}
          onToggle={() => setHistorialOpen(v => !v)}
          onActualizar={handleActualizarIngredientes}
          onIgnorar={() => setActualizarSugerencia(null)}
        />

        {/* ═══ FOOD COST (colapsable) ═══ */}
        <div style={{ padding: '18px 14px 0' }}>
          <button
            onClick={() => setFcOpen(!fcOpen)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
              background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 10px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>payments</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Food Cost</span>
            {(receta.precio_venta ?? 0) > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                color: fcColor(fc.food_cost_pct),
                fontFamily: "'DM Mono', monospace", marginLeft: 4,
              }}>{fc.food_cost_pct.toFixed(1)}%</span>
            )}
            {(() => {
              const prodIng = ings.filter(i => i.tipo !== 'subreceta')
              const vinculados = prodIng.filter(i => i.producto_id).length
              if (prodIng.length === 0) return null
              return (
                <span title={`${vinculados} de ${prodIng.length} ingredientes vinculados al stock`} style={{ fontSize: 9, fontWeight: 700, color: vinculados === prodIng.length ? '#10b981' : 'var(--text-3)', background: vinculados === prodIng.length ? 'rgba(16,185,129,.1)' : 'var(--bg)', border: `1px solid ${vinculados === prodIng.length ? 'rgba(16,185,129,.3)' : 'var(--border)'}`, borderRadius: 4, padding: '1px 5px', marginLeft: 4 }}>
                  {vinculados}/{prodIng.length}
                </span>
              )
            })()}
            <div style={{ flex: 1, height: 1, background: 'var(--border)', marginLeft: 6 }} />
            <span className="material-symbols-outlined" style={{
              fontSize: 18, color: 'var(--text-3)',
              transform: fcOpen ? 'rotate(180deg)' : 'rotate(0)',
              transition: 'transform .2s',
            }}>expand_more</span>
          </button>

          {fcOpen && (
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {/* Banner de sync de precio receta ↔ plato (movido acá desde el cuerpo) */}
              {linkedPlato && (receta.precio_venta ?? 0) !== (linkedPlato.precio_venta ?? 0) && (
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'rgba(245,158,11,.1)' }}>
                  <div style={{ fontSize: 11, color: '#92400e', lineHeight: 1.4, marginBottom: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: -2, marginRight: 4 }}>sync_problem</span>
                    El plato en carta figura a <b>${(linkedPlato.precio_venta ?? 0).toLocaleString('es-AR')}</b> y la receta a <b>${(receta.precio_venta ?? 0).toLocaleString('es-AR')}</b>.
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={syncPrecioAPlato} style={syncBtn}>Actualizar plato → ${(receta.precio_venta ?? 0).toLocaleString('es-AR')}</button>
                    <button onClick={syncPrecioAReceta} style={syncBtn}>Actualizar receta → ${(linkedPlato.precio_venta ?? 0).toLocaleString('es-AR')}</button>
                  </div>
                </div>
              )}
              {/* Sugerir precio de venta por food cost objetivo */}
              {receta.food_cost.costo_porcion > 0 && (() => {
                const tfc = parseFloat(targetFC.replace(',', '.'))
                const sugerido = tfc > 0 ? receta.food_cost.costo_porcion / (tfc / 100) : 0
                return (
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'rgba(67,97,160,.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>Precio sugerido para FC</span>
                      <input
                        type="text" inputMode="decimal"
                        value={targetFC}
                        onChange={e => setTargetFC(e.target.value.replace(/[^0-9.,]/g, ''))}
                        style={{ width: 48, border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 6, padding: '3px 6px', fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: 'var(--text-1)', textAlign: 'center', outline: 'none' }}
                      />
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>%</span>
                      <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)', fontFamily: "'DM Mono', monospace", marginLeft: 'auto' }}>
                        ${sugerido.toFixed(0)}
                      </span>
                    </div>
                    {sugerido > 0 && Math.abs(sugerido - (receta.precio_venta ?? 0)) >= 1 && (
                      <button
                        onClick={() => actualizarReceta(id, { precio_venta: Math.round(sugerido) })}
                        style={{ marginTop: 8, width: '100%', background: 'var(--navy)', border: 'none', borderRadius: 8, padding: '8px', fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        {(receta.precio_venta ?? 0) > 0 ? `Cambiar precio: $${(receta.precio_venta ?? 0).toFixed(0)} → $${sugerido.toFixed(0)}` : `Usar como precio de venta: $${sugerido.toFixed(0)}`}
                      </button>
                    )}
                  </div>
                )
              })()}
              {/* Summary row */}
              {(receta.precio_venta ?? 0) > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ padding: '10px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: fcColor(fc.food_cost_pct), fontFamily: "'DM Mono', monospace" }}>{fc.food_cost_pct.toFixed(1)}%</div>
                    <div style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>Food Cost</div>
                  </div>
                  <div style={{ padding: '10px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontFamily: "'DM Mono', monospace" }}>${fc.costo_porcion.toFixed(0)}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>Costo/porc</div>
                  </div>
                  <div style={{ padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: fc.margen_bruto > 0 ? '#4ade80' : '#ef4444', fontFamily: "'DM Mono', monospace" }}>${fc.margen_bruto.toFixed(0)}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>Margen</div>
                  </div>
                </div>
              )}
              {/* Peso por porción */}
              {(() => {
                const { brutoG, netoG, hasMerma } = calcPesoNetos(ingsEfectivos)
                if (brutoG <= 0) return null
                const porciones = receta.porciones ?? 0
                const pesoNetoG = porciones > 0 ? Math.round(netoG / porciones) : null
                const pesoBrutoG = porciones > 0 ? Math.round(brutoG / porciones) : null
                const formatG = (g: number) => g >= 1000 ? `${(g / 1000).toFixed(g % 1000 === 0 ? 0 : 1)}kg` : `${Math.round(g)}g`
                const costoKgNeto = (pesoNetoG && pesoNetoG > 0 && fc.costo_porcion > 0)
                  ? fc.costo_porcion / (pesoNetoG / 1000) : null
                const cols = hasMerma && costoKgNeto ? 3 : 2
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, borderBottom: '1px solid var(--border)' }}>
                    <div style={{ padding: '10px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontFamily: "'DM Mono', monospace" }}>
                        {pesoNetoG ? formatPeso(pesoNetoG) : '—'}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>
                        {hasMerma ? 'Neto/porción' : 'Peso/porción'}
                      </div>
                      {hasMerma && pesoBrutoG && (
                        <div style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>bruto {formatPeso(pesoBrutoG)}</div>
                      )}
                    </div>
                    <div style={{ padding: '10px', textAlign: 'center', borderRight: hasMerma && costoKgNeto ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontFamily: "'DM Mono', monospace" }}>
                        {formatG(hasMerma ? netoG : brutoG)}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>
                        {hasMerma ? 'Neto total' : 'Peso total'}
                      </div>
                      {hasMerma && (
                        <div style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>bruto {formatG(brutoG)}</div>
                      )}
                    </div>
                    {hasMerma && costoKgNeto && (
                      <div style={{ padding: '10px', textAlign: 'center' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontFamily: "'DM Mono', monospace" }}>
                          ${costoKgNeto >= 10000 ? `${(costoKgNeto / 1000).toFixed(1)}k` : costoKgNeto.toFixed(0)}/kg
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>
                          Costo/kg neto
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
              {/* Peso escurrido (si fue cargado manualmente) */}
              {receta.peso_escurrido_g != null && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ padding: '10px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: "'DM Mono', monospace" }}>
                      {receta.peso_total_g != null
                        ? (receta.peso_total_g >= 1000 ? `${(receta.peso_total_g / 1000).toFixed(1)}kg` : `${Math.round(receta.peso_total_g)}g`)
                        : '—'}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>Peso total</div>
                  </div>
                  <div style={{ padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', fontFamily: "'DM Mono', monospace" }}>
                      {receta.peso_escurrido_g >= 1000 ? `${(receta.peso_escurrido_g / 1000).toFixed(1)}kg` : `${Math.round(receta.peso_escurrido_g)}g`}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>Peso escurrido</div>
                  </div>
                </div>
              )}

              {/* Per-ingredient cost */}
              {ingsEfectivos.map((i, idx) => {
                const cu = i.costo_unitario ?? 0
                const convFactor = unitConversionFactor(i.unidad ?? '', i.unidad_costo ?? i.unidad ?? '')
                const costoEfectivo = cu * convFactor  // precio por unidad del ingrediente
                const subtotal = i.cantidad * costoEfectivo * scaleFactor
                const pct = costoTotal > 0 ? (i.cantidad * costoEfectivo / costoTotal) * 100 : 0
                // Para sub-recetas corregidas (unidad='g', costo=$/g) mostrar precio en $/kg
                const esSubrecetaEnGramos = i.tipo === 'subreceta' && i.unidad === 'g'
                const cantDisplay = esSubrecetaEnGramos
                  ? `${Math.round(i.cantidad * scaleFactor)}g`
                  : `${(i.cantidad * scaleFactor).toFixed(2)} ${i.unidad}`
                const precioDisplay = esSubrecetaEnGramos
                  ? `$${(cu * 1000).toFixed(0)}/kg`
                  : `$${Number.isInteger(costoEfectivo) ? costoEfectivo : costoEfectivo.toFixed(2)}`
                return (
                  <div key={i.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                    borderBottom: idx < ingsEfectivos.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{ width: 4, height: 24, borderRadius: 2, background: 'var(--border)', overflow: 'hidden', flexShrink: 0 }}>
                      <div style={{ width: '100%', height: `${pct}%`, background: '#4361a0', borderRadius: 2 }} />
                    </div>
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {i.nombre}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>
                      {cantDisplay} × {precioDisplay}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', fontFamily: "'DM Mono', monospace", flexShrink: 0, minWidth: 48, textAlign: 'right' }}>
                      ${subtotal.toFixed(0)}
                    </span>
                  </div>
                )
              })}

              {/* Total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,.02)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>Costo total{scaleFactor !== 1 ? ` (×${scaleFactor.toFixed(2)})` : ''}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', fontFamily: "'DM Mono', monospace" }}>${fc.costo_total.toFixed(0)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Ingrediente modal ── */}
      {ingModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 150, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} onClick={() => setIngModal(false)} />
          <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: '16px 16px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,.3)', maxHeight: '88dvh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            {/* Handle + header fijo */}
            <div style={{ padding: '14px 16px 12px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 12px' }} />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{editIng ? 'Editar ingrediente' : 'Nuevo ingrediente'}</h2>
            </div>
            {/* Área scrollable */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 0', WebkitOverflowScrolling: 'touch' }}>
            {/* Tab toggle */}
            <div style={{ display: 'flex', borderRadius: 10, background: 'var(--bg)', padding: 3, marginBottom: 14 }}>
              {(['producto', 'subreceta'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => { setIngTipo(tab); setIngSubrecetaId(null); setSubrecetaSearch('') }}
                  style={{
                    flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: ingTipo === tab ? 'var(--navy)' : 'transparent',
                    color: ingTipo === tab ? '#fff' : 'var(--text-3)',
                    fontSize: 12, fontWeight: 700, fontFamily: 'inherit', transition: 'all .15s',
                  }}
                >
                  {tab === 'producto' ? 'Producto' : 'Subreceta'}
                </button>
              ))}
            </div>
            {ingError && <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#ef4444' }}>{ingError}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ingTipo === 'producto' ? (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative' }}>
                  <span style={lbl}>Nombre *</span>
                  <input value={ingForm.nombre} onChange={e => {
                    const v = e.target.value
                    setIngForm(f => ({ ...f, nombre: v }))
                    if (v.length >= 2) {
                      const q = v.toLowerCase()
                      const matches = stockProductos.filter(p => p.nombre.toLowerCase().includes(q)).slice(0, 6)
                      setIngSuggestions(matches)
                      setShowSuggestions(matches.length > 0)
                    } else {
                      setShowSuggestions(false)
                    }
                  }} onFocus={() => {
                    if (ingForm.nombre.length >= 2) {
                      const q = ingForm.nombre.toLowerCase()
                      const matches = stockProductos.filter(p => p.nombre.toLowerCase().includes(q)).slice(0, 6)
                      setIngSuggestions(matches)
                      setShowSuggestions(matches.length > 0)
                    }
                  }} placeholder="Ej: Lomo, Manteca…" style={inp} autoComplete="off" />
                  {showSuggestions && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.15)', maxHeight: 200, overflowY: 'auto' }}>
                      {ingSuggestions.map(p => (
                        <button key={p.id} onMouseDown={e => {
                          e.preventDefault()
                          setIngForm(f => ({ ...f, nombre: p.nombre, unidad: p.unidad, costo_unitario: String(p.precio_unitario || 0), unidad_costo: p.unidad }))
                          setShowSuggestions(false)
                        }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', cursor: 'pointer', background: 'transparent', fontFamily: 'inherit', borderBottom: '1px solid var(--border)' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.nombre}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{p.unidad} · Stock: {p.stock_actual}</div>
                          </div>
                          {p.precio_unitario > 0 && (
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>
                              ${p.precio_unitario.toLocaleString('es-AR')}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {ingForm.nombre.length >= 2 && ingSuggestions.length === 0 && !editIng && (
                    <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 2, fontWeight: 600 }}>
                      Sin precio en stock — ingresá costo manualmente
                    </div>
                  )}
                </label>
              ) : (
                <div>
                  <span style={lbl}>Buscar receta</span>
                  <input
                    value={subrecetaSearch}
                    onChange={e => setSubrecetaSearch(e.target.value)}
                    placeholder="Ej: Salsa criolla…"
                    style={{ ...inp, marginTop: 4 }}
                    autoFocus
                  />
                  <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, marginTop: 4 }}>
                    {recetas
                      .filter(r =>
                        r.activa !== false && r.id !== id &&
                        !(r.ingredientes ?? []).some(ing => ing.subreceta_id === id) &&
                        r.nombre.toLowerCase().includes(subrecetaSearch.toLowerCase())
                      )
                      .slice(0, 8)
                      .map(r => {
                        const { netoG } = calcPesoNetos(r.ingredientes ?? [])
                        const porciones = r.porciones ?? 1
                        const pesoNetoPorcionG = porciones > 0 && netoG > 0 ? netoG / porciones : 0
                        const costoGNeto = pesoNetoPorcionG > 0 && r.food_cost.costo_porcion > 0
                          ? r.food_cost.costo_porcion / pesoNetoPorcionG : null
                        const costoKgNeto = costoGNeto ? costoGNeto * 1000 : null
                        return (
                          <button
                            key={r.id}
                            onMouseDown={() => {
                              setIngSubrecetaId(r.id)
                              if (costoGNeto) {
                                setIngForm(f => ({
                                  ...f,
                                  nombre: r.nombre,
                                  cantidad: '100',
                                  unidad: 'g',
                                  costo_unitario: costoGNeto.toFixed(6),
                                  unidad_costo: 'g',
                                }))
                              } else {
                                setIngForm(f => ({
                                  ...f,
                                  nombre: r.nombre,
                                  cantidad: '1',
                                  unidad: 'unidad',
                                  costo_unitario: String(r.food_cost.costo_porcion.toFixed(2)),
                                  unidad_costo: 'unidad',
                                }))
                              }
                            }}
                            style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              width: '100%', padding: '9px 12px', border: 'none', cursor: 'pointer',
                              background: ingSubrecetaId === r.id ? 'rgba(67,97,160,.1)' : 'transparent',
                              fontFamily: 'inherit', borderBottom: '1px solid var(--border)',
                            }}
                          >
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{r.nombre}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace", textAlign: 'right' }}>
                              {costoKgNeto
                                ? <>${costoKgNeto >= 10000 ? `${(costoKgNeto / 1000).toFixed(1)}k` : costoKgNeto.toFixed(0)}/kg</>
                                : r.food_cost.costo_porcion > 0 ? <>${r.food_cost.costo_porcion.toFixed(0)}/u</> : null
                              }
                            </span>
                          </button>
                        )
                      })}
                  </div>
                  {ingSubrecetaId && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#22c55e' }}>check_circle</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#22c55e' }}>
                        {recetas.find(r => r.id === ingSubrecetaId)?.nombre}
                      </span>
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={lbl}>Cantidad bruta</span>
                  <input type="text" inputMode="decimal" value={ingForm.cantidad} onChange={e => setIngForm(f => ({ ...f, cantidad: e.target.value.replace(',', '.') }))} style={inp} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={lbl}>Unidad</span>
                  <select value={ingForm.unidad} onChange={e => setIngForm(f => ({ ...f, unidad: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </label>
              </div>
              {ingTipo === 'producto' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={lbl}>Merma ({ingForm.unidad || 'unidad'})</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="text" inputMode="decimal"
                      value={mermaPesoInput}
                      onChange={e => {
                        const val = e.target.value.replace(',', '.')
                        setMermaPesoInput(val)
                        const peso = parseFloat(val) || 0
                        const cant = parseFloat(ingForm.cantidad) || 0
                        // cant es bruta → pct = merma / bruta
                        const pct = cant > 0 && peso > 0 ? (peso / cant) * 100 : 0
                        setIngForm(f => ({ ...f, merma_pct: pct.toFixed(4) }))
                      }}
                      placeholder="0"
                      style={{ ...inp, flex: 1 }}
                    />
                    {(() => {
                      const pct = parseFloat(ingForm.merma_pct) || 0
                      return (
                        <span style={{
                          fontSize: 13, fontWeight: 700, minWidth: 44, textAlign: 'right',
                          color: pct > 0 ? 'var(--accent)' : 'var(--text-3)',
                        }}>
                          {pct > 0 ? `${pct.toFixed(1)}%` : '—'}
                        </span>
                      )
                    })()}
                  </div>
                  {(() => {
                    const cant = parseFloat(ingForm.cantidad) || 0
                    const peso = parseFloat(mermaPesoInput) || 0
                    if (peso > 0 && cant > 0 && peso < cant) {
                      const neta = cant - peso
                      return <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Cantidad neta: {neta.toFixed(3).replace(/\.?0+$/, '')} {ingForm.unidad}</span>
                    }
                    return null
                  })()}
                </label>
              )}
              {ingTipo === 'producto' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={lbl}>Costo unitario $</span>
                    <input type="text" inputMode="decimal" value={ingForm.costo_unitario} onChange={e => setIngForm(f => ({ ...f, costo_unitario: e.target.value.replace(',', '.') }))} style={inp} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={lbl}>Por unidad de</span>
                    <select value={ingForm.unidad_costo} onChange={e => setIngForm(f => ({ ...f, unidad_costo: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </label>
                </div>
              ) : ingSubrecetaId && (
                <div style={{ background: 'rgba(67,97,160,.06)', border: '1px solid rgba(67,97,160,.2)', borderRadius: 8, padding: '7px 10px', fontSize: 11, color: 'var(--text-2)' }}>
                  Costo auto-calculado: ${parseFloat(ingForm.costo_unitario || '0').toFixed(4)}/{ingForm.unidad_costo || ingForm.unidad}
                </div>
              )}
            </div>
            </div>{/* fin área scrollable */}
            {/* Footer fijo — fuera del scroll */}
            <div style={{ padding: '12px 16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Preview de costo en tiempo real */}
              {ingTipo === 'producto' && (() => {
                const cantV = parseFloat(ingForm.cantidad.replace(',', '.')) || 0
                const costoV = parseFloat(ingForm.costo_unitario.replace(',', '.')) || 0
                const factor = unitConversionFactor(ingForm.unidad, ingForm.unidad_costo || ingForm.unidad)
                const subtotal = cantV * costoV * factor
                const mermaG = toGramos(cantV, ingForm.unidad)
                const netoG = mermaG > 0 ? mermaG * (1 - (parseFloat(ingForm.merma_pct) || 0) / 100) : 0
                if (cantV <= 0 || costoV <= 0) return null
                return (
                  <div style={{ background: 'rgba(67,97,160,.06)', border: '1px solid rgba(67,97,160,.15)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                      <span style={{ fontWeight: 700 }}>{cantV} {ingForm.unidad}</span>
                      {netoG > 0 && netoG < mermaG && <span style={{ color: 'var(--text-3)' }}> → {netoG >= 1000 ? `${(netoG / 1000).toFixed(2)}kg` : `${Math.round(netoG)}g`} neto</span>}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', fontFamily: "'DM Mono', monospace" }}>
                      ${subtotal.toFixed(0)}
                    </span>
                  </div>
                )
              })()}
              <button onClick={handleSaveIng} disabled={ingSaving} style={{ width: '100%', background: ingSaving ? 'var(--border)' : 'var(--navy)', border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, color: ingSaving ? 'var(--text-3)' : '#fff', cursor: ingSaving ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                {ingSaving ? 'Guardando…' : editIng ? 'Guardar cambios' : 'Agregar ingrediente'}
              </button>
              {editIng && (
                <button onClick={() => { setDeleteTarget('ingrediente'); setDeleteIngId(editIng.id) }} style={{ width: '100%', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 10, padding: '10px', fontSize: 13, fontWeight: 700, color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Eliminar ingrediente
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Edit receta modal ── */}
      {editModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 150, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} onClick={() => setEditModal(false)} />
          <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: '16px 16px 0 0', padding: '20px 16px 100px', maxHeight: '90%', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Editar receta</h2>
              <button onClick={() => setDeleteTarget('receta')} style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>Eliminar</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Foto */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <PhotoPicker
                  currentUrl={receta?.foto_url}
                  path={`recetas/${id}`}
                  size={80}
                  onUploaded={url => actualizarReceta(id, { foto_url: url })}
                  onRemoved={() => actualizarReceta(id, { foto_url: null })}
                />
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={lbl}>Nombre</span>
                    <input value={editForm.nombre} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))} style={inp} />
                  </label>
                </div>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={lbl}>Categoría</span>
                <select value={editForm.categoria} onChange={e => setEditForm(f => ({ ...f, categoria: e.target.value }))} style={{ ...inp, appearance: 'auto' as const }}>
                  <option value="">Elegir…</option>
                  {CAT_RECETA.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              {/* Trabajar como plato — habilita el botón OPS por ingrediente en la ficha */}
              <button
                type="button"
                onClick={() => setEditForm(f => ({ ...f, es_plato: !f.es_plato }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${editForm.es_plato ? 'rgba(67,97,160,.35)' : 'var(--border)'}`, background: editForm.es_plato ? 'rgba(67,97,160,.06)' : 'var(--bg)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: editForm.es_plato ? 'var(--accent)' : 'var(--text-3)' }}>restaurant</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Trabajar como plato</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>Cada ingrediente/subreceta puede rutearse a una plaza (botón OPS en la ficha).</span>
                </span>
                <span style={{ width: 40, height: 24, borderRadius: 99, background: editForm.es_plato ? 'var(--accent)' : 'var(--border)', position: 'relative', flexShrink: 0, transition: 'background .15s' }}>
                  <span style={{ position: 'absolute', top: 2, left: editForm.es_plato ? 18 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
                </span>
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={lbl}>Porciones</span>
                  <input type="number" min="1" value={editForm.porciones} onChange={e => setEditForm(f => ({ ...f, porciones: e.target.value }))} style={{ ...inp, textAlign: 'center' as const }} />
                  {(() => {
                    const p = calcPesoPorcion(receta?.ingredientes ?? [], parseInt(editForm.porciones) || 1)
                    return p ? <span style={{ fontSize: 9, color: 'var(--text-3)', textAlign: 'center' as const }}>{formatPeso(p)}</span> : null
                  })()}
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={lbl}>Tiempo (min)</span>
                  <input type="number" min="0" value={editForm.tiempo_min} onChange={e => setEditForm(f => ({ ...f, tiempo_min: e.target.value }))} style={inp} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={lbl}>Precio venta $</span>
                  <input type="number" min="0" value={editForm.precio_venta} onChange={e => setEditForm(f => ({ ...f, precio_venta: e.target.value }))} style={inp} />
                </label>
              </div>
              {/* Pesos manuales */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={lbl}>Peso total (g)</span>
                  <input
                    type="text" inputMode="decimal"
                    value={editPesoTotal}
                    onChange={e => setEditPesoTotal(e.target.value.replace(/[^0-9.,]/g, ''))}
                    placeholder="Ej: 850"
                    style={inp}
                  />
                  <span style={{ fontSize: 9, color: 'var(--text-3)' }}>Peso bruto de la receta completa</span>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={lbl}>Peso escurrido (g)</span>
                  <input
                    type="text" inputMode="decimal"
                    value={editPesoEscurrido}
                    onChange={e => setEditPesoEscurrido(e.target.value.replace(/[^0-9.,]/g, ''))}
                    placeholder="Ej: 620"
                    style={inp}
                  />
                  <span style={{ fontSize: 9, color: 'var(--text-3)' }}>Tras cocción / escurrido / moldeo</span>
                </label>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={lbl}>Procedimiento</span>
                <textarea
                  value={editForm.procedimiento}
                  onChange={e => setEditForm(f => ({ ...f, procedimiento: e.target.value }))}
                  rows={6}
                  placeholder={'Paso 1: …\nPaso 2: …'}
                  style={{ ...inp, resize: 'vertical', minHeight: 100 }}
                />
              </label>
            </div>
            <button onClick={handleSaveReceta} disabled={editSaving} style={{ marginTop: 20, width: '100%', background: 'var(--navy)', border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', opacity: editSaving ? .6 : 1, fontFamily: 'inherit' }}>
              {editSaving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }} onClick={() => { setDeleteTarget(null); setDeleteIngId(null) }} />
          <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 16, padding: 24, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,.4)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>
              {deleteTarget === 'receta' ? 'Eliminar receta' : 'Eliminar ingrediente'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 20px' }}>
              {deleteTarget === 'receta' && linkedPlato
                ? 'Esta receta es un plato de la carta. Al desactivarla también se quitará el plato de la carta. ¿Confirmás?'
                : '¿Confirmás?'}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setDeleteTarget(null); setDeleteIngId(null) }} style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 11, fontSize: 13, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={handleDelete} style={{ flex: 1, background: '#ef4444', border: 'none', borderRadius: 10, padding: 11, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sheet OPS / Mise ── */}
      {opsOpen && receta && RESTAURANTE_ID && (
        <RecetaOpsSheet
          recetaId={receta.id}
          recetaNombre={receta.nombre}
          restauranteId={RESTAURANTE_ID}
          onClose={() => setOpsOpen(false)}
          onSaved={() => setToast('Receta asignada al mise')}
        />
      )}

      {/* ── Sheet OPS por ingrediente (receta-plato) ── */}
      {opsIngId && (() => {
        const ing = ings.find(i => i.id === opsIngId)
        if (!ing) return null
        return (
          <IngredienteOpsSheet
            ing={ing}
            saving={opsIngSaving}
            onClose={() => setOpsIngId(null)}
            onSave={handleIngOpsSave}
            onRemove={handleIngOpsRemove}
          />
        )
      })()}

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 'calc(var(--fab-bottom) + 8px)', left: '50%', transform: 'translateX(-50%)', zIndex: 300, background: 'var(--navy)', color: '#fff', padding: '10px 18px', borderRadius: 99, fontSize: 12, fontWeight: 700, boxShadow: '0 6px 24px rgba(0,0,0,.3)', maxWidth: '90%', textAlign: 'center' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

const syncBtn: React.CSSProperties = { background: 'rgba(245,158,11,.2)', border: 'none', borderRadius: 7, padding: '5px 9px', fontSize: 10, fontWeight: 700, color: '#92400e', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }
const btnClear: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.06em' }
const inp: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', width: '100%', boxSizing: 'border-box' }

// ─────────────────────────────────────────────────────────────────
// Historial de Producción — sección colapsable
// ─────────────────────────────────────────────────────────────────
function HistorialProduccion({ historial, open, loading, sugerencia, actualizando, onToggle, onActualizar, onIgnorar }: {
  historial: ProduccionRegistro[]
  open: boolean
  loading: boolean
  sugerencia: { promedio: number } | null
  actualizando: boolean
  onToggle: () => void
  onActualizar: (promedio: number) => void
  onIgnorar: () => void
}) {
  const promedio = historial.length > 0
    ? historial.reduce((s, r) => s + (r.multiplicador_real ?? 1), 0) / historial.length
    : null

  const desactualizada = promedio != null && Math.abs(promedio - 1) > 0.10

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
  }
  function fmtDesv(mult: number) {
    const pct = Math.round((mult - 1) * 100)
    if (pct === 0) return '—'
    const color = pct > 0 ? '#22c55e' : '#f97316'
    return <span style={{ color, fontWeight: 700 }}>{pct > 0 ? `+${pct}%` : `${pct}%`}</span>
  }

  return (
    <div style={{ padding: '18px 14px 0' }}>
      <button
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 10px',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>
          history
        </span>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          Historial de Producción
        </span>
        {historial.length > 0 && (
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)' }}>({historial.length})</span>
        )}
        {desactualizada && !open && (
          <span style={{
            marginLeft: 4, fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 6,
            background: 'rgba(249,115,22,.12)', color: '#f97316', border: '1px solid rgba(249,115,22,.25)',
          }}>
            DESACTUALIZADA
          </span>
        )}
        <div style={{ flex: 1, height: 1, background: 'var(--border)', marginLeft: 6 }} />
        <span className="material-symbols-outlined" style={{
          fontSize: 18, color: 'var(--text-3)',
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform .2s',
        }}>expand_more</span>
      </button>

      {open && (
        <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {loading && (
            <div style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>
              Cargando…
            </div>
          )}

          {!loading && historial.length === 0 && (
            <div style={{ padding: '20px 14px', textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--border)', display: 'block', marginBottom: 6 }}>
                bar_chart
              </span>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Sin registros de producción todavía
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3, opacity: 0.7 }}>
                Los registros aparecen cuando se completa una tarea vinculada a esta receta
              </div>
            </div>
          )}

          {!loading && historial.length > 0 && (
            <>
              {/* Sugerencia de actualización */}
              {sugerencia && (
                <div style={{
                  padding: '10px 12px', borderBottom: '1px solid var(--border)',
                  background: 'rgba(249,115,22,.05)',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#c2410c', marginBottom: 6 }}>
                    Esta receta tuvo una desviación promedio de{' '}
                    <strong>
                      {sugerencia.promedio > 1 ? '+' : ''}{Math.round((sugerencia.promedio - 1) * 100)}%
                    </strong>{' '}
                    en los últimos 3 registros. ¿Querés actualizar las cantidades?
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => onActualizar(sugerencia.promedio)}
                      disabled={actualizando}
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: 9, border: 'none',
                        background: actualizando ? 'var(--border)' : 'var(--navy)',
                        color: actualizando ? 'var(--text-3)' : '#fff',
                        fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                        cursor: actualizando ? 'default' : 'pointer',
                      }}
                    >
                      {actualizando ? 'Actualizando…' : 'Actualizar receta'}
                    </button>
                    <button
                      onClick={onIgnorar}
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: 9, border: '1px solid var(--border)',
                        background: 'var(--bg)', color: 'var(--text-3)',
                        fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                      }}
                    >
                      Ignorar
                    </button>
                  </div>
                </div>
              )}

              {/* Resumen */}
              {promedio != null && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  borderBottom: '1px solid var(--border)',
                  background: desactualizada ? 'rgba(249,115,22,.04)' : 'rgba(34,197,94,.04)',
                }}>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      Rendimiento real promedio
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: desactualizada ? '#f97316' : '#22c55e', marginTop: 2 }}>
                      ×{promedio.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ flex: 1 }} />
                  {desactualizada && (
                    <span style={{
                      fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
                      background: 'rgba(249,115,22,.12)', color: '#f97316',
                      border: '1px solid rgba(249,115,22,.25)',
                    }}>
                      DESACTUALIZADA
                    </span>
                  )}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      Registros
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: "'DM Mono', monospace", marginTop: 2 }}>
                      {historial.length}
                    </div>
                  </div>
                </div>
              )}

              {/* Table */}
              {historial.map((r, idx) => {
                const desv = (r.multiplicador_real ?? 1)
                return (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                    borderBottom: idx < historial.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0, minWidth: 36, fontFamily: "'DM Mono', monospace" }}>
                      {fmtDate(r.created_at)}
                    </span>
                    <span style={{ flex: 1, fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.usuario_nombre ?? 'Sin usuario'}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>
                      {r.cantidad_planificada != null ? `${r.cantidad_planificada} pax` : '—'}
                    </span>
                    <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--text-3)' }}>arrow_forward</span>
                    <span style={{ fontSize: 10, color: 'var(--text-2)', flexShrink: 0 }}>
                      {r.cantidad_real != null ? `${Math.round(r.cantidad_real)} pax` : '—'}
                    </span>
                    <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", flexShrink: 0, minWidth: 36, textAlign: 'right' }}>
                      {fmtDesv(desv)}
                    </span>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
