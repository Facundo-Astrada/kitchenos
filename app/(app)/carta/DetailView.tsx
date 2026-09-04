'use client'

import { useState, useMemo } from 'react'
import type { CartaItemEnriquecido } from '@/lib/hooks/useCarta'
import type { RecetaConCosto } from '@/lib/hooks/useRecetas'
import type { ProductoConEstado } from '@/lib/hooks/useStock'
import { createClient } from '@/lib/supabase/client'
import {
  upsertMiseChecklistItem, PLAZAS_OPS, SECCIONES_OPS,
  sumPlatoRecetaCantidad, shrinkOrPruneMise, porcionesDesdeCapacidad,
} from '@/lib/ops/mise'
import { useTareas } from '@/lib/hooks/useTareas'
import { fmtMoney, fcBadge, marginBadge } from './cards'

// ── Detail View ─────────────────────────────────────────
const TAG_DEFS = [
  { key: 's/tacc',      label: 'S/TACC',       bg: '#fef3c7', color: '#92400e' },
  { key: 'vegano',      label: 'Vegano',        bg: '#d1fae5', color: '#065f46' },
  { key: 'vegetariano', label: 'Vegetariano',   bg: '#dcfce7', color: '#166534' },
  { key: 'keto',        label: 'Keto',          bg: '#ede9fe', color: '#5b21b6' },
  { key: 'picante',     label: '🌶 Picante',    bg: '#fee2e2', color: '#991b1b' },
  { key: 'sin lactosa', label: 'Sin lactosa',   bg: '#e0f2fe', color: '#075985' },
]

export function DetailView({
  item,
  recetas,
  productos,
  onBack,
  onEdit,
  onDuplicar,
  onVincular,
  onAgregarReceta,
  onEliminarReceta,
  onActualizarReceta,
  onAgregarPackaging,
  onEliminarPackaging,
  onShowGrupos,
  onActualizarTags,
  onActualizarPlatoRecetaOpsCompleta,
  restauranteId,
}: {
  item: CartaItemEnriquecido
  recetas: RecetaConCosto[]
  productos: ProductoConEstado[]
  onBack: () => void
  onEdit: () => void
  onDuplicar: () => Promise<void>
  onVincular: (recetaId: string) => Promise<void>
  onAgregarReceta: (recetaId: string, porciones: number) => Promise<void>
  onEliminarReceta: (platoRecetaId: string) => Promise<void>
  onActualizarReceta: (platoRecetaId: string, porciones: number) => Promise<void>
  onAgregarPackaging: (productoId: string, cantidad: number) => Promise<void>
  onEliminarPackaging: (packagingId: string) => Promise<void>
  onShowGrupos: () => void
  onActualizarTags: (tags: string[]) => Promise<void>
  onActualizarPlatoRecetaOpsCompleta: (platoRecetaId: string, datos: { plaza: string | null; cantidad_ops: number | null; unidad_ops: string | null }) => Promise<void>
  restauranteId: string
}) {
  const [search, setSearch] = useState('')
  const [vinculando, setVinculando] = useState(false)
  const [pendingReceta, setPendingReceta] = useState<RecetaConCosto | null>(null)
  const [porciones, setPorciones] = useState('1')
  // porciones editables inline por plato_receta
  const [editingPorcionId, setEditingPorcionId] = useState<string | null>(null)
  const [editingPorcionVal, setEditingPorcionVal] = useState('')
  const [savingTags, setSavingTags] = useState(false)
  // OPS destination panel
  const [opsPanel, setOpsPanel] = useState<string | null>(null) // plato_receta_id
  const [opsPlaza, setOpsPlaza] = useState('')
  const [opsSeccion, setOpsSeccion] = useState('')
  const [opsCantidad, setOpsCantidad] = useState('')
  const [opsUnidad, setOpsUnidad] = useState('g')
  const [opsRecipienteNombre, setOpsRecipienteNombre] = useState('')
  const [opsPesoPorcion, setOpsPesoPorcion] = useState('')
  const [opsPesoPorcionUnidad, setOpsPesoPorcionUnidad] = useState('g')
  const [opsSaving, setOpsSaving] = useState(false)
  const [opsError, setOpsError] = useState('')
  // Draft recipe creation
  const [creatingDraft, setCreatingDraft] = useState(false)
  const [creatingTarea, setCreatingTarea] = useState(false)

  // 'menu' es la plaza de control de un menú activado en el mise (ver
  // lib/ops/menuMise.ts) — no es una plaza física de cocina, así que no
  // corresponde como destino de un componente de plato (mismo criterio que
  // PLAZAS_FIJAS/todasLasPlazas en lib/constants.ts, que tampoco la incluye).
  const PLAZAS_OPS_PLATO = PLAZAS_OPS.filter(p => p.id !== 'menu')
  const UNIDADES_OPS = ['u', 'kg', 'g', 'l', 'ml', 'pax', 'porc', 'bandeja']

  const supabaseDV = useMemo(() => createClient(), [])
  const { agregarTarea } = useTareas({ soloEscritura: true })

  const handleCrearBorrador = async () => {
    if (!search.trim() || creatingDraft) return
    setCreatingDraft(true)
    try {
      const { data: receta, error } = await supabaseDV
        .from('recetas')
        .insert({ nombre: search.trim(), categoria: 'Sin categoría', status: 'draft', activa: true, restaurante_id: restauranteId })
        .select('id')
        .single()
      if (error) throw error
      await onAgregarReceta(receta.id, 1)
      setSearch('')
    } finally { setCreatingDraft(false) }
  }

  const handleCrearTarea = async () => {
    if (!search.trim() || creatingTarea) return
    setCreatingTarea(true)
    try {
      await agregarTarea({
        titulo: `Crear receta: ${search.trim()}`,
        descripcion: `Receta pendiente para el plato "${item.nombre}"`,
        status: 'pendiente',
        prioridad: 'media',
      })
      setSearch('')
    } finally { setCreatingTarea(false) }
  }

  const handleGuardarOPS = async (pr: { id: string; receta_id: string; plaza?: string | null; receta?: { nombre: string } }) => {
    if (!opsPlaza || !opsSeccion || opsSaving) return
    setOpsSaving(true)
    setOpsError('')
    try {
      const oldPlaza = pr.plaza ?? null
      const capVal = parseFloat(opsCantidad) || 0

      // Calcular porciones finales (si capacidad está en peso → dividir por tamaño porción)
      const porVal = parseFloat(opsPesoPorcion) || 0
      const porcionesCalculadas = porcionesDesdeCapacidad(capVal, opsUnidad, porVal, opsPesoPorcionUnidad)
      const miCantidad = (['porc', 'u', 'pax'].includes(opsUnidad)) ? capVal : (porcionesCalculadas ?? capVal)

      const recipienteNombre = opsRecipienteNombre.trim() || null
      const pesoPorcion = recipienteNombre && opsPesoPorcion ? parseFloat(opsPesoPorcion) || null : null
      const pesoPorcionUnidad = pesoPorcion ? opsPesoPorcionUnidad : null

      // 1. Guardar plaza + contribución de ESTE plato en plato_recetas
      await onActualizarPlatoRecetaOpsCompleta(pr.id, { plaza: opsPlaza, cantidad_ops: miCantidad, unidad_ops: opsUnidad })

      // 2. Sumar TODAS las contribuciones de esta receta en esta plaza y hacer
      // upsert del checklist_item (busca/crea la sección, con recipiente/peso)
      const { total } = await sumPlatoRecetaCantidad(supabaseDV, pr.receta_id, opsPlaza)
      const nombre = pr.receta?.nombre ?? search
      await upsertMiseChecklistItem({
        supabase: supabaseDV, restauranteId, recetaId: pr.receta_id, nombre,
        plaza: opsPlaza, seccionMiseId: opsSeccion, cantidad: total, unidad: opsUnidad,
        recipienteNombre, pesoPorcion, pesoPorcionUnidad,
      })

      // 3. Si cambió de plaza, achicar (o borrar) el checklist_item de la plaza
      // vieja — antes esto no se hacía y el mise quedaba con un ítem fantasma.
      if (oldPlaza && oldPlaza !== opsPlaza) {
        await shrinkOrPruneMise({ supabase: supabaseDV, restauranteId, recetaId: pr.receta_id, plaza: oldPlaza })
      }

      setOpsPanel(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message) : 'desconocido'
      console.error('[Carta] handleGuardarOPS error:', e)
      setOpsError(msg)
    } finally { setOpsSaving(false) }
  }

  const handleToggleTag = async (tag: string) => {
    if (savingTags) return
    setSavingTags(true)
    const current = item.tags ?? []
    const next = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
    try { await onActualizarTags(next) } finally { setSavingTags(false) }
  }

  const handleSavePorcion = async (pr: { id: string; porciones: number }) => {
    const val = parseFloat(editingPorcionVal)
    if (!isNaN(val) && val > 0 && val !== pr.porciones) {
      await onActualizarReceta(pr.id, Math.round(val * 10) / 10)
    }
    setEditingPorcionId(null)
  }

  // Packaging state
  const [pkgSearch, setPkgSearch] = useState('')
  const [showPkgSearch, setShowPkgSearch] = useState(false)
  const [pendingProducto, setPendingProducto] = useState<ProductoConEstado | null>(null)
  const [pkgCantidad, setPkgCantidad] = useState('1')
  const [savingPkg, setSavingPkg] = useState(false)

  const pkgLinkedIds = useMemo(() => new Set(item.plato_packaging.map(p => p.producto_id)), [item.plato_packaging])
  const pkgFiltrados = useMemo(() => {
    const base = productos.filter(p => !pkgLinkedIds.has(p.id))
    if (!pkgSearch.trim()) return base.slice(0, 15)
    const q = pkgSearch.toLowerCase()
    return base.filter(p => p.nombre.toLowerCase().includes(q)).slice(0, 15)
  }, [productos, pkgSearch, pkgLinkedIds])

  const handleAgregarPackaging = async () => {
    if (!pendingProducto) return
    setSavingPkg(true)
    try {
      await onAgregarPackaging(pendingProducto.id, parseFloat(pkgCantidad) || 1)
      setPendingProducto(null)
      setPkgSearch('')
      setShowPkgSearch(false)
    } finally { setSavingPkg(false) }
  }

  const filtradas = useMemo(() => {
    const linkedIds = new Set(item.plato_recetas.map(pr => pr.receta_id))
    const base = recetas.filter(r => !linkedIds.has(r.id))
    if (!search.trim()) return base.slice(0, 15)
    const q = search.toLowerCase()
    return base.filter(r => r.nombre.toLowerCase().includes(q)).slice(0, 15)
  }, [recetas, search, item.plato_recetas])

  const filtradosProductos = useMemo(() => {
    if (!search.trim() || search.trim().length < 2) return []
    const q = search.toLowerCase()
    return productos.filter(p => p.nombre.toLowerCase().includes(q)).slice(0, 8)
  }, [productos, search])

  async function handleVincularProducto(producto: ProductoConEstado) {
    setVinculando(true)
    try {
      const res = await fetch('/api/recetas/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receta: {
            nombre: producto.nombre,
            categoria: producto.categoria || 'Insumo',
            porciones: 1,
            status: 'draft',
            restaurante_id: restauranteId,
          },
          ingredientes: [{
            nombre: producto.nombre,
            cantidad: 1,
            unidad: producto.unidad,
            costo_unitario: producto.precio_unitario || 0,
            unidad_costo: producto.unidad,
            producto_id: producto.id,
          }],
        }),
      })
      const json = await res.json()
      if (json.id) {
        await onAgregarReceta(json.id, 1)
        setSearch('')
      }
    } finally { setVinculando(false) }
  }

  const handleVincular = async (recetaId: string) => {
    setVinculando(true)
    try { await onVincular(recetaId) } finally { setVinculando(false) }
  }

  const handleAgregarReceta = async () => {
    if (!pendingReceta) return
    setVinculando(true)
    try {
      await onAgregarReceta(pendingReceta.id, parseFloat(porciones) || 1)
      setPendingReceta(null)
      setSearch('')
    } finally { setVinculando(false) }
  }

  const linkedReceta = item.receta_id ? recetas.find(r => r.id === item.receta_id) : null
  const hasFc = item.food_cost_pct != null && item.food_cost_pct > 0
  const hasMrg = item.margen_pct_computed != null

  return (
    <div>
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>{item.nombre}</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{item.categoria}</div>
        </div>
        <button onClick={onDuplicar} style={{
          background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
          width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>content_copy</span>
        </button>
        <button onClick={onEdit} style={{
          background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
          padding: '6px 12px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          Editar
        </button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Info card */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 14,
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)' }}>{fmtMoney(item.precio_venta)}</div>
          {item.descripcion && (
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.5 }}>
              {item.descripcion}
            </div>
          )}
          <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {!item.disponible && (
              <span style={{
                background: '#ef4444', color: '#fff',
                padding: '2px 8px', borderRadius: 6,
                fontSize: 12, fontWeight: 800,
              }}>86</span>
            )}
            {hasMrg && (() => {
              const mb = marginBadge(item.margen_pct_computed ?? 0)
              return (
                <span style={{ fontSize: 11, fontWeight: 700, background: mb.bg, color: mb.text, padding: '2px 8px', borderRadius: 6 }}>
                  Margen {(item.margen_pct_computed ?? 0).toFixed(1)}%
                </span>
              )
            })()}
            {!hasMrg && hasFc && (
              <span style={{
                fontSize: 11, fontWeight: 700,
                background: fcBadge(item.food_cost_pct ?? 0).bg,
                color: fcBadge(item.food_cost_pct ?? 0).text,
                padding: '2px 8px', borderRadius: 6,
              }}>
                FC {(item.food_cost_pct ?? 0).toFixed(1)}%
              </span>
            )}
            {item.costo_porcion != null && item.costo_porcion > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                Costo: {fmtMoney(item.costo_porcion)}
              </span>
            )}
          </div>

          {/* Tags dietarios — toggleables directamente */}
          <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TAG_DEFS.map(t => {
              const active = (item.tags ?? []).includes(t.key)
              return (
                <button
                  key={t.key}
                  onClick={() => handleToggleTag(t.key)}
                  disabled={savingTags}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                    border: `1.5px solid ${active ? t.color + '60' : 'var(--border)'}`,
                    background: active ? t.bg : 'transparent',
                    color: active ? t.color : 'var(--text-3)',
                    cursor: 'pointer', transition: 'all .15s',
                    opacity: savingTags ? 0.6 : 1,
                  }}
                >{t.label}</button>
              )
            })}
          </div>

          {/* Donut chart — sólo si hay datos de costo */}
          {item.precio_venta > 0 && item.costo_porcion != null && item.costo_porcion > 0 && (() => {
            const precio = item.precio_venta
            const costoRecetas = item.costo_total_plato
              ?? (item.costo_porcion != null ? item.costo_porcion - item.costo_packaging : 0)
            const costoPkg = item.costo_packaging
            const fcReal = item.food_cost_pct ?? 0
            // Si el costo supera el precio (margen negativo), el donut se llena de "costo"
            // y no hay segmento de margen. Clampeamos los stops a 0–100 para que conic-gradient
            // sea válido aunque el FC real sea > 100% (se muestra el número real aparte).
            const rawRecetas = (costoRecetas / precio) * 100
            const rawPkg = (costoPkg / precio) * 100
            const sobrecosto = rawRecetas + rawPkg > 100
            const pctRecetas = Math.round(Math.min(rawRecetas, 100))
            const pctPkg = Math.round(Math.min(rawPkg, Math.max(0, 100 - pctRecetas)))
            const pctMargen = Math.max(0, 100 - pctRecetas - pctPkg)

            const segs = [
              { pct: pctRecetas, color: '#4361a0', label: 'Recetas' },
              { pct: pctPkg, color: '#ea580c', label: 'Packaging' },
              { pct: pctMargen, color: sobrecosto ? '#ef4444' : '#10b981', label: sobrecosto ? 'Pérdida' : 'Margen' },
            ].filter(s => s.pct > 0)

            let cum = 0
            const gradient = segs.map(s => {
              const stop = `${s.color} ${cum}% ${cum + s.pct}%`
              cum += s.pct
              return stop
            }).join(', ')

            return (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
                {/* Donut */}
                <div style={{ position: 'relative', width: 72, height: 72, borderRadius: '50%', background: `conic-gradient(${gradient})`, flexShrink: 0 }}>
                  <div style={{
                    position: 'absolute', inset: 15, borderRadius: '50%',
                    background: 'var(--surface)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', textAlign: 'center',
                  }}>
                    <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-3)', lineHeight: 1 }}>FC</span>
                    <span style={{ fontSize: fcReal >= 1000 ? 8 : 10, fontWeight: 800, color: sobrecosto ? '#ef4444' : 'var(--text-2)', lineHeight: 1.1 }}>
                      {fcReal.toFixed(0)}%
                    </span>
                  </div>
                </div>
                {/* Leyenda */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                  {segs.map(s => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: 'var(--text-2)', flex: 1 }}>{s.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{s.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Recetas del plato */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Recetas del plato
            </span>
          </div>

          {/* Lista de recetas vinculadas */}
          {item.plato_recetas.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
              {item.plato_recetas.map((pr, idx) => (
                <div key={pr.id} style={{ borderBottom: idx < item.plato_recetas.length - 1 || opsPanel === pr.id ? '1px solid var(--border)' : 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)', flexShrink: 0 }}>menu_book</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pr.receta?.nombre ?? pr.receta_id}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                      {pr.costo_calculado != null && pr.costo_calculado > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtMoney(pr.costo_calculado)}</span>
                      )}
                      {pr.plaza && pr.cantidad_ops != null && (() => {
                        const plazaCfg = PLAZAS_OPS.find(p => p.id === pr.plaza)
                        return (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: `${plazaCfg?.color ?? '#4361a0'}18`, color: plazaCfg?.color ?? 'var(--accent)' }}>
                            {pr.cantidad_ops} {pr.unidad_ops ?? 'u'} · {plazaCfg?.label ?? pr.plaza}
                          </span>
                        )
                      })()}
                    </div>
                  </div>
                  {/* Porciones: click para editar directo */}
                  {editingPorcionId === pr.id ? (
                    <input
                      autoFocus
                      type="number"
                      value={editingPorcionVal}
                      onChange={e => setEditingPorcionVal(e.target.value)}
                      onBlur={() => handleSavePorcion(pr)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSavePorcion(pr); if (e.key === 'Escape') setEditingPorcionId(null) }}
                      style={{
                        width: 52, textAlign: 'center', fontSize: 13, fontWeight: 700,
                        border: '1.5px solid var(--accent)', borderRadius: 8, padding: '3px 4px',
                        background: 'var(--surface)', color: 'var(--navy)', outline: 'none',
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => { setEditingPorcionId(pr.id); setEditingPorcionVal(String(pr.porciones)) }}
                      title="Tap para editar porciones"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        border: '1px solid var(--border)', borderRadius: 8,
                        background: 'var(--bg)', padding: '4px 8px', cursor: 'pointer',
                        fontSize: 13, fontWeight: 700, color: 'var(--text-1)',
                      }}
                    >
                      {pr.porciones % 1 === 0 ? pr.porciones : pr.porciones.toFixed(1)}
                      <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--text-3)' }}>edit</span>
                    </button>
                  )}
                  {/* → OPS button */}
                  <button
                    onClick={async () => {
                      if (opsPanel === pr.id) { setOpsPanel(null); return }
                      setOpsPanel(pr.id)
                      setOpsError('')
                      setOpsPlaza(pr.plaza ?? '')
                      setOpsSeccion('')
                      setOpsCantidad(pr.cantidad_ops != null ? String(pr.cantidad_ops) : '')
                      setOpsUnidad(pr.unidad_ops ?? 'g')
                      setOpsRecipienteNombre('')
                      setOpsPesoPorcion('')
                      setOpsPesoPorcionUnidad('g')
                      // Prefill recipiente/peso/sección desde checklist_items si ya existe
                      if (pr.receta_id && pr.plaza) {
                        const { data } = await supabaseDV.from('checklist_items')
                          .select('recipiente_nombre, recipiente_capacidad, peso_porcion, peso_porcion_unidad, unidad, seccion')
                          .eq('receta_id', pr.receta_id).eq('plaza', pr.plaza).limit(1)
                        if (data?.[0]) {
                          setOpsRecipienteNombre(data[0].recipiente_nombre ?? '')
                          setOpsPesoPorcion(data[0].peso_porcion != null ? String(data[0].peso_porcion) : '')
                          setOpsPesoPorcionUnidad(data[0].peso_porcion_unidad ?? 'g')
                          const secMatch = SECCIONES_OPS.find(s => s.label === data[0].seccion)
                          setOpsSeccion(secMatch?.id ?? '')
                        }
                      }
                    }}
                    title="Asignar a OPS"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 3,
                      padding: '3px 7px', borderRadius: 7, border: 'none', cursor: 'pointer',
                      fontSize: 10, fontWeight: 700,
                      background: opsPanel === pr.id ? '#eef2ff' : 'var(--bg)',
                      color: opsPanel === pr.id ? 'var(--accent)' : 'var(--text-3)',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>store</span>
                    OPS
                  </button>
                  <button
                    onClick={() => onEliminarReceta(pr.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-3)', flexShrink: 0 }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                  </button>
                </div>
                {/* OPS panel inline */}
                {opsPanel === pr.id && (
                  <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', background: '#f8faff' }}>
                    {/* Plaza */}
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 7 }}>Plaza de producción</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
                      {PLAZAS_OPS_PLATO.map(p => (
                        <button key={p.id} onClick={() => { setOpsPlaza(opsPlaza === p.id ? '' : p.id); setOpsSeccion('') }}
                          style={{ padding: '5px 11px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                            background: opsPlaza === p.id ? `${p.color}18` : 'var(--surface)', color: opsPlaza === p.id ? p.color : 'var(--text-3)',
                            outline: opsPlaza === p.id ? `1.5px solid ${p.color}50` : '1px solid var(--border)' }}>
                          {p.label}
                        </button>
                      ))}
                    </div>

                    {opsPlaza && (
                      <>
                        {/* Sección mise */}
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 7 }}>Sección del mise</div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
                          {SECCIONES_OPS.map(s => (
                            <button key={s.id} onClick={() => setOpsSeccion(opsSeccion === s.id ? '' : s.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                                background: opsSeccion === s.id ? 'rgba(67,97,160,.12)' : 'var(--surface)', color: opsSeccion === s.id ? 'var(--accent)' : 'var(--text-3)',
                                outline: opsSeccion === s.id ? '1.5px solid rgba(67,97,160,.3)' : '1px solid var(--border)' }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{s.icono}</span>
                              {s.label}
                            </button>
                          ))}
                        </div>

                        {/* Recipiente */}
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 7 }}>Recipiente (opcional)</div>
                        <input type="text" value={opsRecipienteNombre}
                          onChange={e => { setOpsRecipienteNombre(e.target.value); if (!e.target.value.trim()) setOpsPesoPorcion('') }}
                          placeholder="ej: tupper, cubeta GN, bandeja"
                          style={{ width: '100%', padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: 'var(--text-1)', boxSizing: 'border-box', marginBottom: 12 }} />

                        {/* Porciones/peso recipiente lleno */}
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 7 }}>
                          {opsRecipienteNombre.trim() ? 'Porciones/peso recipiente lleno' : 'Cantidad en mise'}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                          <input type="number" value={opsCantidad} onChange={e => setOpsCantidad(e.target.value)} inputMode="decimal" placeholder="0"
                            style={{ width: 70, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, fontWeight: 700, textAlign: 'center', fontFamily: 'inherit', outline: 'none', color: 'var(--text-1)' }} />
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {UNIDADES_OPS.map(u => (
                              <button key={u} onClick={() => setOpsUnidad(u)}
                                style={{ padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                                  background: opsUnidad === u ? 'var(--navy)' : 'var(--surface)', color: opsUnidad === u ? '#fff' : 'var(--text-3)',
                                  outline: opsUnidad === u ? 'none' : '1px solid var(--border)' }}>
                                {u}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Tamaño por porción — solo cuando hay recipiente */}
                        {opsRecipienteNombre.trim() && (() => {
                          const capVal = parseFloat(opsCantidad) || 0
                          const porVal = parseFloat(opsPesoPorcion) || 0
                          const porcionesAuto = porcionesDesdeCapacidad(capVal, opsUnidad, porVal, opsPesoPorcionUnidad)
                          const UNIDADES_PORCION = ['g', 'kg', 'u', 'porc', 'ml', 'l']
                          return (
                            <>
                              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 7 }}>Tamaño por porción</div>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                                <input type="number" value={opsPesoPorcion} onChange={e => setOpsPesoPorcion(e.target.value)} inputMode="decimal" placeholder="ej: 110"
                                  style={{ width: 70, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, fontWeight: 700, textAlign: 'center', fontFamily: 'inherit', outline: 'none', color: 'var(--text-1)' }} />
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {UNIDADES_PORCION.map(u => (
                                    <button key={u} onClick={() => setOpsPesoPorcionUnidad(u)}
                                      style={{ padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                                        background: opsPesoPorcionUnidad === u ? '#4361a0' : 'var(--surface)', color: opsPesoPorcionUnidad === u ? '#fff' : 'var(--text-3)',
                                        outline: opsPesoPorcionUnidad === u ? 'none' : '1px solid var(--border)' }}>
                                      {u}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {porcionesAuto !== null && opsCantidad && opsPesoPorcion ? (
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 12, paddingLeft: 2 }}>
                                  = {porcionesAuto} porciones por recipiente
                                </div>
                              ) : opsCantidad && opsPesoPorcion ? (
                                <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 12, paddingLeft: 2 }}>
                                  {capVal} {opsUnidad} · {porVal} {opsPesoPorcionUnidad} / porción
                                </div>
                              ) : <div style={{ marginBottom: 12 }} />}
                            </>
                          )
                        })()}

                        {/* Indicador de suma si hay otras contribuciones */}
                        {(() => {
                          const otrasCantidad = item.plato_recetas
                            .filter(otro => otro.receta_id === pr.receta_id && otro.id !== pr.id && otro.plaza === opsPlaza && otro.cantidad_ops != null)
                            .reduce((s, o) => s + (o.cantidad_ops ?? 0), 0)
                          const miVal = parseFloat(opsCantidad) || 0
                          if (otrasCantidad > 0) return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#eef2ff', borderRadius: 8, marginBottom: 10 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--accent)' }}>functions</span>
                              <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                                Total OPS: <b>{otrasCantidad + miVal} {opsUnidad}</b> ({otrasCantidad} otros + {miVal} este)
                              </span>
                            </div>
                          )
                          return null
                        })()}
                      </>
                    )}

                    {/* Guardar / Quitar */}
                    {opsError && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'rgba(239,68,68,.1)', borderRadius: 8, marginBottom: 8 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#ef4444' }}>error</span>
                        <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>Error al guardar: {opsError}</span>
                      </div>
                    )}
                    {opsPlaza && !opsSeccion && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8, paddingLeft: 2 }}>
                        Elegí una sección del mise para poder guardar.
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleGuardarOPS(pr)} disabled={!opsPlaza || !opsSeccion || opsSaving}
                        style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                          background: opsPlaza && opsSeccion && !opsSaving ? 'var(--navy)' : 'var(--border)',
                          color: '#fff', fontWeight: 700, fontSize: 12, cursor: opsPlaza && opsSeccion ? 'pointer' : 'default',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                          {opsSaving ? 'progress_activity' : 'checklist'}
                        </span>
                        {opsSaving ? 'Guardando…' : 'Guardar en mise'}
                      </button>
                      {pr.plaza && (
                        <button onClick={async () => {
                          const oldPlaza = pr.plaza!
                          await onActualizarPlatoRecetaOpsCompleta(pr.id, { plaza: null, cantidad_ops: null, unidad_ops: null })
                          await shrinkOrPruneMise({ supabase: supabaseDV, restauranteId, recetaId: pr.receta_id, plaza: oldPlaza })
                          setOpsPanel(null)
                        }} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Quitar
                        </button>
                      )}
                      <button onClick={() => setOpsPanel(null)}
                        style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-3)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
                </div>
              ))}
              {item.costo_total_plato != null && item.costo_total_plato > 0 && (
                <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,.02)' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>Costo recetas</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{fmtMoney(item.costo_total_plato)}</span>
                </div>
              )}
            </div>
          )}

          {/* Legacy single receta (if no plato_recetas) */}
          {item.plato_recetas.length === 0 && linkedReceta && (
            <a href={`/recetario/${linkedReceta.id}`} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 14px', borderRadius: 12,
              border: '1px solid var(--accent)', background: '#eef2ff',
              textDecoration: 'none', marginBottom: 10,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--accent)' }}>menu_book</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#4338ca' }}>{linkedReceta.nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--accent)' }}>
                  {linkedReceta.categoria} · Costo: {fmtMoney(linkedReceta.food_cost.costo_porcion)}
                </div>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>chevron_right</span>
            </a>
          )}

          {/* Search siempre visible — selección instantánea */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ position: 'relative' }}>
              <span className="material-symbols-outlined" style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                fontSize: 16, color: 'var(--text-3)', pointerEvents: 'none',
              }}>search</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar receta o insumo de stock..."
                style={{
                  width: '100%', padding: '10px 12px 10px 34px', border: 'none',
                  background: 'transparent', fontSize: 13, color: 'var(--text-1)',
                  boxSizing: 'border-box', outline: 'none',
                }}
              />
            </div>
            {search.trim().length > 0 && (filtradas.length > 0 || filtradosProductos.length > 0) && (
              <div style={{ borderTop: '1px solid var(--border)', maxHeight: 260, overflowY: 'auto' }}>
                {/* Recetas */}
                {filtradas.length > 0 && (
                  <>
                    {filtradosProductos.length > 0 && (
                      <div style={{ padding: '5px 12px 3px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', background: 'var(--bg)' }}>
                        Recetas
                      </div>
                    )}
                    {filtradas.map(r => (
                      <button
                        key={r.id}
                        onClick={async () => {
                          setVinculando(true)
                          try { await onAgregarReceta(r.id, 1) } finally { setVinculando(false) }
                          setSearch('')
                        }}
                        disabled={vinculando}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                          padding: '9px 12px', textAlign: 'left', border: 'none',
                          background: 'none', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                          fontFamily: 'inherit', opacity: vinculando ? .5 : 1,
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--accent)', flexShrink: 0 }}>menu_book</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{r.nombre}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            {r.categoria} · {fmtMoney(r.food_cost.costo_porcion)} por porción
                          </div>
                        </div>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>add_circle</span>
                      </button>
                    ))}
                  </>
                )}
                {/* Productos de stock */}
                {filtradosProductos.length > 0 && (
                  <>
                    <div style={{ padding: '5px 12px 3px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', background: 'var(--bg)' }}>
                      Insumos de stock
                    </div>
                    {filtradosProductos.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleVincularProducto(p)}
                        disabled={vinculando}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                          padding: '9px 12px', textAlign: 'left', border: 'none',
                          background: 'none', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                          fontFamily: 'inherit', opacity: vinculando ? .5 : 1,
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#10b981', flexShrink: 0 }}>inventory_2</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{p.nombre}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            {p.categoria} · {p.stock_actual} {p.unidad} en stock
                          </div>
                        </div>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#10b981' }}>add_circle</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
            {search.trim().length > 0 && filtradas.length === 0 && (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                <div style={{ padding: '8px 12px 4px', fontSize: 11, color: 'var(--text-3)' }}>
                  Sin recetas para &ldquo;{search}&rdquo;
                </div>
                {/* Crear receta borrador */}
                <button
                  onClick={handleCrearBorrador}
                  disabled={creatingDraft}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '9px 12px', background: 'none', border: 'none',
                    borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--accent)' }}>
                    {creatingDraft ? 'progress_activity' : 'add_circle'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                      {creatingDraft ? 'Creando…' : `Crear receta "${search}"`}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                      Se agrega como borrador (draft) y queda vinculada al plato
                    </div>
                  </div>
                </button>
                {/* Agregar como tarea */}
                <button
                  onClick={handleCrearTarea}
                  disabled={creatingTarea}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '9px 12px', background: 'none', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#f59e0b' }}>
                    {creatingTarea ? 'progress_activity' : 'task_alt'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>
                      {creatingTarea ? 'Creando tarea…' : `Agregar como tarea pendiente`}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                      Crea una tarea: &ldquo;Crear receta: {search}&rdquo;
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Packaging */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Packaging
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={onShowGrupos}
                style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 8, background: 'rgba(67,97,160,.1)', color: 'var(--accent)' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>folder_copy</span>
                <span style={{ fontSize: 11, fontWeight: 700 }}>Grupos</span>
              </button>
              <button
                onClick={() => { setPkgSearch(''); setPendingProducto(null); setShowPkgSearch(s => !s) }}
                style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 8, background: 'rgba(234,88,12,.1)', color: '#ea580c' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                <span style={{ fontSize: 11, fontWeight: 700 }}>Agregar</span>
              </button>
            </div>
          </div>

          {item.plato_packaging.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
              {item.plato_packaging.map((pkg, idx) => {
                const costoPkg = pkg.producto_precio_unitario * pkg.cantidad
                return (
                  <div key={pkg.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ea580c', flexShrink: 0 }}>inventory_2</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pkg.producto_nombre}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        {pkg.cantidad} {pkg.producto_unidad}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {costoPkg > 0 && (
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                          {fmtMoney(costoPkg)}
                        </span>
                      )}
                      <button
                        onClick={() => onEliminarPackaging(pkg.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-3)' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                      </button>
                    </div>
                  </div>
                )
              })}
              {item.costo_packaging > 0 && (
                <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,.02)' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>Costo packaging</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#ea580c' }}>{fmtMoney(item.costo_packaging)}</span>
                </div>
              )}
            </div>
          )}

          {showPkgSearch && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
              {pendingProducto ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ea580c' }}>inventory_2</span>
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1, color: 'var(--text-1)' }}>{pendingProducto.nombre}</span>
                    <button onClick={() => setPendingProducto(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700, flexShrink: 0 }}>Cantidad:</label>
                    <input
                      type="number" min="0.1" step="1"
                      value={pkgCantidad}
                      onChange={e => setPkgCantidad(e.target.value)}
                      style={{ width: 64, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)', background: 'var(--bg)' }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{pendingProducto.unidad}</span>
                    <button
                      onClick={handleAgregarPackaging}
                      disabled={savingPkg}
                      style={{ flex: 1, background: '#ea580c', border: 'none', borderRadius: 8, padding: '8px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', opacity: savingPkg ? .6 : 1 }}
                    >
                      {savingPkg ? 'Guardando…' : 'Agregar'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <input
                    value={pkgSearch}
                    onChange={e => setPkgSearch(e.target.value)}
                    autoFocus
                    placeholder="Buscar artículo de stock..."
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: 10,
                      border: '1px solid var(--border)', background: 'var(--bg)',
                      fontSize: 13, color: 'var(--text-1)',
                    }}
                  />
                  {pkgFiltrados.length > 0 && (
                    <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 4, border: '1px solid var(--border)', borderRadius: 10 }}>
                      {pkgFiltrados.map(p => (
                        <button
                          key={p.id}
                          onClick={() => { setPendingProducto(p); setPkgCantidad('1') }}
                          style={{
                            display: 'block', width: '100%', padding: '10px 12px',
                            textAlign: 'left', border: 'none', background: 'none',
                            fontSize: 13, color: 'var(--text-1)', cursor: 'pointer',
                            borderBottom: '1px solid var(--border)', fontFamily: 'inherit',
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            {p.categoria} · {p.unidad}
                            {p.precio_unitario > 0 && ` · ${fmtMoney(p.precio_unitario)}`}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {pkgFiltrados.length === 0 && pkgSearch.trim() && (
                    <div style={{ padding: '10px 0', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
                      No se encontraron artículos
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {item.plato_packaging.length === 0 && !showPkgSearch && (
            <button
              onClick={() => setShowPkgSearch(true)}
              style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1px dashed var(--border)', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-3)', fontFamily: 'inherit' }}
            >
              + Agregar packaging (bolsas, cajas, descartables…)
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
