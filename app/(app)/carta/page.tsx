'use client'

import PageTransition from '@/components/PageTransition'
import { useState, useMemo, useEffect } from 'react'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { useCarta, type CategoriaCartaItem, type CartaCategoria, type CartaItemEnriquecido } from '@/lib/hooks/useCarta'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { useRecetas, type RecetaConCosto } from '@/lib/hooks/useRecetas'
import { useStock, type ProductoConEstado } from '@/lib/hooks/useStock'
import { useVentas } from '@/lib/hooks/useVentas'
import { usePackagingGrupos, type PackagingGrupo } from '@/lib/hooks/usePackagingGrupos'
import { exportarExcel, fechaArchivo } from '@/lib/exportar'
import { createClient } from '@/lib/supabase/client'
import { useMenus, type MenuConPreparaciones } from '@/lib/hooks/useMenus'
import MenusView from './MenusView'
import ComposicionEditor, { type CompPayload, type CompInicial } from './ComposicionEditor'
import { upsertMiseChecklistItem } from '@/lib/ops/mise'
import PhotoPicker from '@/components/ui/PhotoPicker'
// ── Helpers ─────────────────────────────────────────────
const fmtMoney = (n: number) =>
  n > 0 ? `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—'

const CATEGORIAS: CategoriaCartaItem[] = [
  'Entradas', 'Principales', 'Postres', 'Bebidas', 'Guarniciones', 'Brunch', 'Cafetería',
]

const CAT_ICONS: Record<CategoriaCartaItem, string> = {
  Entradas: 'tapas',
  Principales: 'restaurant',
  Postres: 'cake',
  Bebidas: 'local_bar',
  Guarniciones: 'dining',
  Brunch: 'brunch_dining',
  Cafetería: 'coffee',
}

function fcBadge(pct: number): { bg: string; text: string } {
  if (pct < 30) return { bg: '#d1fae5', text: '#065f46' }
  if (pct <= 35) return { bg: '#fef3c7', text: '#92400e' }
  return { bg: '#fee2e2', text: '#991b1b' }
}

function marginBadge(pct: number): { bg: string; text: string } {
  if (pct > 30) return { bg: '#d1fae5', text: '#065f46' }
  if (pct >= 15) return { bg: '#fef3c7', text: '#92400e' }
  return { bg: '#fee2e2', text: '#991b1b' }
}

// ── PDF Export ──────────────────────────────────────────
async function exportCartaPDF(items: CartaItemEnriquecido[]) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()

  // Header
  doc.setFillColor(30, 41, 59)
  doc.rect(0, 0, 210, 32, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.text('Carta', 14, 22)

  doc.setTextColor(0, 0, 0)

  const disponibles = items.filter(i => i.disponible)
  const categorias = [...new Set(disponibles.map(i => i.categoria))]
  let y = 40

  for (const cat of categorias) {
    const catItems = disponibles.filter(i => i.categoria === cat)
    if (catItems.length === 0) continue

    // Check if we need a new page
    if (y > 250) { doc.addPage(); y = 20 }

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text(cat, 14, y)
    y += 2
    doc.setDrawColor(30, 41, 59)
    doc.setLineWidth(0.5)
    doc.line(14, y, 196, y)
    y += 8

    for (const item of catItems) {
      if (y > 270) { doc.addPage(); y = 20 }

      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text(item.nombre, 14, y)

      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 100, 100)
      const precio = fmtMoney(item.precio_venta)
      doc.text(precio, 196, y, { align: 'right' })

      if (item.descripcion) {
        y += 5
        doc.setFontSize(9)
        doc.setTextColor(130, 130, 130)
        const lines = doc.splitTextToSize(item.descripcion, 150)
        doc.text(lines, 14, y)
        y += lines.length * 4
      }

      y += 8
    }

    y += 4
  }

  // Footer
  doc.setFontSize(7)
  doc.setTextColor(150, 150, 150)
  doc.text('Generado por KitchenOS', 14, 285)

  doc.save('carta.pdf')
}

// ── Rentabilidad PDF ────────────────────────────────────
async function exportRentabilidadPDF(items: CartaItemEnriquecido[], isAdmin = false) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF()

  doc.setFillColor(30, 41, 59)
  doc.rect(0, 0, 210, 32, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.text('Rentabilidad de Carta', 14, 22)
  doc.setTextColor(0, 0, 0)

  const conReceta = items
    .filter(i => i.food_cost_pct != null)
    .sort((a, b) => (a.food_cost_pct ?? 0) - (b.food_cost_pct ?? 0))

  autoTable(doc, {
    startY: 38,
    head: [isAdmin ? ['Plato', 'Precio', 'Costo', 'FC%', 'Margen'] : ['Plato']],
    body: conReceta.map(it => isAdmin
      ? [it.nombre, fmtMoney(it.precio_venta), fmtMoney(it.costo_porcion ?? 0), `${(it.food_cost_pct ?? 0).toFixed(1)}%`, fmtMoney(it.margen_bruto ?? 0)]
      : [it.nombre]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 41, 59] },
  })

  doc.setFontSize(7)
  doc.setTextColor(150)
  doc.text('Generado por KitchenOS', 14, 285)

  doc.save('rentabilidad-carta.pdf')
}

// ── Toast ───────────────────────────────────────────────
function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t) }, [onDone])
  return (
    <div style={{
      position: 'fixed', bottom: 'var(--toast-bottom)', left: '50%', transform: 'translateX(-50%)',
      background: '#1e293b', color: '#fff', padding: '10px 20px',
      borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 100,
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    }}>
      {msg}
    </div>
  )
}

// ── Plato Card ──────────────────────────────────────────
function PlatoCard({
  item,
  onClick,
  onToggle,
  isAdmin = false,
}: {
  item: CartaItemEnriquecido
  onClick: () => void
  onToggle: () => void
  isAdmin?: boolean
}) {
  const hasFc = item.food_cost_pct != null && item.food_cost_pct > 0
  const fc = fcBadge(item.food_cost_pct ?? 0)
  const hasMrg = item.margen_pct_computed != null
  const mrg = marginBadge(item.margen_pct_computed ?? 0)

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Grey overlay + large 86 badge when not disponible */}
      {!item.disponible && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2,
          background: 'rgba(148,163,184,0.5)',
          borderRadius: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            background: '#dc2626', color: '#fff',
            padding: '6px 18px', borderRadius: 10,
            fontSize: 22, fontWeight: 900, letterSpacing: 2,
            boxShadow: '0 2px 8px rgba(220,38,38,0.4)',
          }}>
            86
          </div>
        </div>
      )}

      {/* Clickable area */}
      <button onClick={onClick} style={{
        display: 'block', width: '100%', textAlign: 'left',
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '14px 14px 8px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          {item.foto_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.foto_url} alt="" style={{
              width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0,
            }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-1)', lineHeight: 1.3 }}>
              {item.nombre}
            </div>
            {item.descripcion && (
              <div style={{
                fontSize: 12, color: 'var(--text-3)', marginTop: 3,
                lineHeight: 1.4,
                overflow: 'hidden', textOverflow: 'ellipsis',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {item.descripcion}
              </div>
            )}
          </div>
          {isAdmin && (
          <div style={{
            fontSize: 18, fontWeight: 700, color: 'var(--navy)',
            whiteSpace: 'nowrap', paddingTop: 1,
          }}>
            {fmtMoney(item.precio_venta)}
          </div>
          )}
        </div>

        {/* Badges row */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{
            fontSize: 11, color: 'var(--text-3)',
            background: 'var(--bg)', padding: '2px 8px', borderRadius: 6,
            opacity: 0.75,
          }}>
            {item.categoria}
          </span>
          {isAdmin && hasMrg && (
            <span style={{
              fontSize: 11, fontWeight: 700,
              background: mrg.bg, color: mrg.text,
              padding: '2px 8px', borderRadius: 6,
            }}>
              Mrg {(item.margen_pct_computed ?? 0).toFixed(1)}%
            </span>
          )}
          {isAdmin && !hasMrg && hasFc && (
            <span style={{
              fontSize: 11, fontWeight: 700,
              background: fc.bg, color: fc.text,
              padding: '2px 8px', borderRadius: 6,
            }}>
              FC {(item.food_cost_pct ?? 0).toFixed(1)}%
            </span>
          )}
          {item.plato_recetas.length > 0 && (
            <span style={{
              fontSize: 11, color: 'var(--accent)',
              background: '#eef2ff', padding: '2px 8px', borderRadius: 6,
            }}>
              {item.plato_recetas.length} receta{item.plato_recetas.length > 1 ? 's' : ''}
            </span>
          )}
          {item.plato_recetas.length === 0 && item.receta && (
            <span style={{
              fontSize: 11, color: 'var(--accent)',
              background: '#eef2ff', padding: '2px 8px', borderRadius: 6,
            }}>
              Receta vinculada
            </span>
          )}
        </div>
      </button>

      {/* Toggle disponible */}
      <div style={{
        padding: '8px 14px 12px', display: 'flex', justifyContent: 'flex-end',
        borderTop: '1px solid var(--border)',
        position: 'relative', zIndex: 3,
      }}>
        <button onClick={e => { e.stopPropagation(); onToggle() }} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 12, color: item.disponible ? '#059669' : '#ef4444',
          fontWeight: 600,
        }}>
          <div style={{
            width: 36, height: 20, borderRadius: 10,
            background: item.disponible ? '#059669' : '#d1d5db',
            position: 'relative', transition: 'background 0.2s',
          }}>
            <div style={{
              width: 16, height: 16, borderRadius: 8,
              background: '#fff', position: 'absolute', top: 2,
              left: item.disponible ? 18 : 2,
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </div>
          {item.disponible ? 'Disponible' : 'No disponible'}
        </button>
      </div>
    </div>
  )
}

// ── Crear / Editar Plato ────────────────────────────────
interface FormPlato {
  nombre: string
  descripcion: string
  precio_venta: string
  categoria: CategoriaCartaItem
  receta_id: string
  foto_url: string
  pendingRecetas: Array<{ recetaId: string; porciones: number }>
}

const FORM_EMPTY: FormPlato = {
  nombre: '', descripcion: '', precio_venta: '',
  categoria: 'Principales', receta_id: '',
  foto_url: '',
  pendingRecetas: [],
}

function FormView({
  initialData,
  recetas,
  categorias,
  onSave,
  onDelete,
  onCancel,
}: {
  initialData?: CartaItemEnriquecido | null
  recetas: RecetaConCosto[]
  categorias: CartaCategoria[]
  onSave: (data: FormPlato) => Promise<void>
  onDelete?: () => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState<FormPlato>(() => {
    if (initialData) return {
      nombre: initialData.nombre,
      descripcion: initialData.descripcion || '',
      precio_venta: String(initialData.precio_venta),
      categoria: initialData.categoria,
      receta_id: initialData.receta_id || '',
      foto_url: initialData.foto_url || '',
      pendingRecetas: [],
    }
    return { ...FORM_EMPTY }
  })
  const isCreate = !initialData
  const [recetasAgregadas, setRecetasAgregadas] = useState<Array<{ receta: RecetaConCosto; porciones: string }>>([])
  const [recetaSearch, setRecetaSearch] = useState(
    initialData?.receta ? initialData.receta.nombre : ''
  )
  const [showRecetas, setShowRecetas] = useState(false)
  const [saving, setSaving] = useState(false)

  const precioVenta = parseFloat(form.precio_venta) || 0

  const recetasFiltradas = useMemo(() => {
    if (isCreate) {
      const linkedIds = new Set(recetasAgregadas.map(ra => ra.receta.id))
      const base = recetas.filter(r => !linkedIds.has(r.id))
      if (!recetaSearch.trim()) return base.slice(0, 20)
      const q = recetaSearch.toLowerCase()
      return base.filter(r => r.nombre.toLowerCase().includes(q)).slice(0, 20)
    }
    if (!recetaSearch.trim()) return recetas.slice(0, 20)
    const q = recetaSearch.toLowerCase()
    return recetas.filter(r => r.nombre.toLowerCase().includes(q)).slice(0, 20)
  }, [recetas, recetaSearch, recetasAgregadas, isCreate])

  const selectedReceta = useMemo(() =>
    form.receta_id ? recetas.find(r => r.id === form.receta_id) : null
  , [recetas, form.receta_id])

  const fcMultiPreview = useMemo(() => {
    if (!isCreate || recetasAgregadas.length === 0 || precioVenta <= 0) return null
    const costo = recetasAgregadas.reduce((sum, ra) =>
      sum + ra.receta.food_cost.costo_porcion * (parseFloat(ra.porciones) || 1), 0)
    const pct = (costo / precioVenta) * 100
    return { costo, pct, margen: precioVenta - costo }
  }, [recetasAgregadas, precioVenta, isCreate])

  const fcPreview = useMemo(() => {
    if (isCreate || !selectedReceta || precioVenta <= 0) return null
    const { food_cost } = selectedReceta
    const costo = food_cost.costo_porcion
    const pct = precioVenta > 0 ? (costo / precioVenta) * 100 : 0
    return { costo, pct, margen: precioVenta - costo }
  }, [selectedReceta, precioVenta, isCreate])

  const addReceta = (r: RecetaConCosto) => {
    setRecetasAgregadas(prev => [...prev, { receta: r, porciones: '1' }])
    setRecetaSearch('')
    setShowRecetas(false)
  }

  const removeReceta = (recetaId: string) => {
    setRecetasAgregadas(prev => prev.filter(ra => ra.receta.id !== recetaId))
  }

  const updatePorciones = (recetaId: string, porciones: string) => {
    setRecetasAgregadas(prev => prev.map(ra =>
      ra.receta.id === recetaId ? { ...ra, porciones } : ra
    ))
  }

  const selectReceta = (r: RecetaConCosto) => {
    if (isCreate) { addReceta(r); return }
    setForm(prev => {
      const updated = { ...prev, receta_id: r.id }
      if (!prev.nombre.trim()) updated.nombre = r.nombre
      if (!prev.descripcion.trim()) updated.descripcion = `Receta: ${r.nombre}`
      if (!prev.precio_venta && (r.precio_venta ?? 0) > 0) updated.precio_venta = String(r.precio_venta)
      return updated
    })
    setRecetaSearch(r.nombre)
    setShowRecetas(false)
  }

  const clearReceta = () => {
    setForm(prev => ({ ...prev, receta_id: '' }))
    setRecetaSearch('')
  }

  const [confirming, setConfirming] = useState(false)

  const canSave = form.nombre.trim() && precioVenta > 0

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave({
        ...form,
        pendingRecetas: isCreate ? recetasAgregadas.map(ra => ({
          recetaId: ra.receta.id,
          porciones: parseFloat(ra.porciones) || 1,
        })) : [],
      })
    } finally { setSaving(false) }
  }

  return (
    <div style={{ paddingBottom: 100 }}>
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>
          {initialData ? 'Editar plato' : 'Nuevo plato'}
        </span>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Foto */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <PhotoPicker
            currentUrl={form.foto_url || null}
            path={`carta/${initialData?.id ?? 'new-' + Date.now()}`}
            size={90}
            onUploaded={url => setForm(prev => ({ ...prev, foto_url: url }))}
            onRemoved={() => setForm(prev => ({ ...prev, foto_url: '' }))}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>Foto del plato</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Se muestra en la carta digital y en la lista</div>
          </div>
        </div>

        {/* Nombre */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, display: 'block' }}>
            Nombre del plato
          </label>
          <input
            value={form.nombre}
            onChange={e => setForm(prev => ({ ...prev, nombre: e.target.value }))}
            placeholder="Ej: Bife de chorizo"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface)',
              fontSize: 14, color: 'var(--text-1)',
            }}
          />
        </div>

        {/* Descripción */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, display: 'block' }}>
            Descripción
          </label>
          <textarea
            value={form.descripcion}
            onChange={e => setForm(prev => ({ ...prev, descripcion: e.target.value }))}
            rows={2}
            placeholder="Descripción corta del plato..."
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface)',
              fontSize: 13, color: 'var(--text-1)', resize: 'vertical',
            }}
          />
        </div>

        {/* Precio */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, display: 'block' }}>
            Precio de venta
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text-3)' }}>$</span>
            <input
              type="number"
              inputMode="decimal"
              value={form.precio_venta}
              onChange={e => setForm(prev => ({ ...prev, precio_venta: e.target.value }))}
              placeholder="0"
              style={{
                width: '100%', padding: '10px 12px 10px 24px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--surface)',
                fontSize: 14, color: 'var(--text-1)',
              }}
            />
          </div>
        </div>

        {/* Categoria pills */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>
            Categoria
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(categorias.length > 0 ? categorias : [{ nombre: 'Principales', icono: 'restaurant', id: '', orden: 0, restaurante_id: '' }]).map(cat => (
              <button
                key={cat.nombre}
                onClick={() => setForm(prev => ({ ...prev, categoria: cat.nombre }))}
                style={{
                  padding: '7px 14px', borderRadius: 20, border: 'none',
                  background: form.categoria === cat.nombre ? 'var(--navy)' : 'var(--bg)',
                  color: form.categoria === cat.nombre ? '#fff' : 'var(--text-2)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {cat.icono || 'restaurant'}
                </span>
                {cat.nombre}
              </button>
            ))}
          </div>
        </div>

        {/* Vincular receta(s) */}
        {isCreate ? (
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, display: 'block' }}>
              Recetas del plato (opcional)
            </label>

            {recetasAgregadas.length > 0 && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, overflow: 'hidden', marginBottom: 8,
              }}>
                {recetasAgregadas.map((ra, idx) => (
                  <div key={ra.receta.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                    borderBottom: idx < recetasAgregadas.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--accent)', flexShrink: 0 }}>menu_book</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ra.receta.nombre}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <label style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>Porc.:</label>
                        <input
                          type="number" min="0.1" step="0.5"
                          value={ra.porciones}
                          onChange={e => updatePorciones(ra.receta.id, e.target.value)}
                          style={{ width: 52, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-1)', background: 'var(--bg)' }}
                        />
                      </div>
                    </div>
                    <button onClick={() => removeReceta(ra.receta.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-3)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              value={recetaSearch}
              onChange={e => { setRecetaSearch(e.target.value); setShowRecetas(true) }}
              onFocus={() => setShowRecetas(true)}
              onBlur={() => setTimeout(() => setShowRecetas(false), 150)}
              placeholder="Buscar y agregar receta..."
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--surface)',
                fontSize: 13, color: 'var(--text-1)',
              }}
            />
            {showRecetas && recetasFiltradas.length > 0 && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, marginTop: 4, maxHeight: 200, overflowY: 'auto',
              }}>
                {recetasFiltradas.map(r => (
                  <button key={r.id} onMouseDown={e => { e.preventDefault(); selectReceta(r) }} style={{
                    display: 'block', width: '100%', padding: '10px 12px',
                    textAlign: 'left', border: 'none', background: 'none',
                    fontSize: 13, color: 'var(--text-1)', cursor: 'pointer',
                    borderBottom: '1px solid var(--border)', fontFamily: 'inherit',
                  }}>
                    <div style={{ fontWeight: 600 }}>{r.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', gap: 8 }}>
                      <span>{r.categoria}</span>
                      <span>FC: {r.food_cost.food_cost_pct.toFixed(1)}%</span>
                      <span>Costo: {fmtMoney(r.food_cost.costo_porcion)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {fcMultiPreview && (() => {
              const badge = fcBadge(fcMultiPreview.pct)
              return (
                <div style={{
                  background: 'var(--surface)', border: `2px solid ${badge.text}33`,
                  borderRadius: 14, padding: 0, overflow: 'hidden', marginTop: 8,
                }}>
                  <div style={{ background: badge.bg, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: badge.text }}>monitoring</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: badge.text }}>Análisis de rentabilidad</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, background: badge.text, color: '#fff', padding: '2px 10px', borderRadius: 20 }}>
                      {fcMultiPreview.pct < 30 ? 'Excelente' : fcMultiPreview.pct <= 35 ? 'Aceptable' : 'Alto'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
                    <div style={{ padding: '14px 12px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Costo porción</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)' }}>{fmtMoney(fcMultiPreview.costo)}</div>
                    </div>
                    <div style={{ padding: '14px 12px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Food Cost %</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: badge.text }}>{fcMultiPreview.pct.toFixed(1)}%</div>
                    </div>
                    <div style={{ padding: '14px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Margen</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#059669' }}>{fmtMoney(fcMultiPreview.margen)}</div>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        ) : (
          <>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, display: 'block' }}>
                Vincular receta (opcional)
              </label>
              {form.receta_id && selectedReceta ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 10,
                  border: '1px solid var(--accent)', background: '#eef2ff',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)' }}>menu_book</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#4338ca' }}>{selectedReceta.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--accent)' }}>{selectedReceta.categoria}</div>
                  </div>
                  <button onClick={clearReceta} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>close</span>
                  </button>
                </div>
              ) : (
                <>
                  <input
                    value={recetaSearch}
                    onChange={e => { setRecetaSearch(e.target.value); setShowRecetas(true) }}
                    onFocus={() => setShowRecetas(true)}
                    placeholder="Buscar receta..."
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 10,
                      border: '1px solid var(--border)', background: 'var(--surface)',
                      fontSize: 13, color: 'var(--text-1)',
                    }}
                  />
                  {showRecetas && recetasFiltradas.length > 0 && (
                    <div style={{
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 10, marginTop: 4, maxHeight: 200, overflowY: 'auto',
                    }}>
                      {recetasFiltradas.map(r => (
                        <button key={r.id} onClick={() => selectReceta(r)} style={{
                          display: 'block', width: '100%', padding: '10px 12px',
                          textAlign: 'left', border: 'none', background: 'none',
                          fontSize: 13, color: 'var(--text-1)', cursor: 'pointer',
                          borderBottom: '1px solid var(--border)',
                        }}>
                          <div style={{ fontWeight: 600 }}>{r.nombre}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', gap: 8 }}>
                            <span>{r.categoria}</span>
                            <span>FC: {r.food_cost.food_cost_pct.toFixed(1)}%</span>
                            <span>Costo: {fmtMoney(r.food_cost.costo_porcion)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {fcPreview && (() => {
              const badge = fcBadge(fcPreview.pct)
              return (
                <div style={{
                  background: 'var(--surface)',
                  border: `2px solid ${badge.text}33`,
                  borderRadius: 14, padding: 0, overflow: 'hidden',
                }}>
                  <div style={{
                    background: badge.bg, padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: badge.text }}>monitoring</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: badge.text }}>
                      Análisis de rentabilidad
                    </span>
                    <span style={{
                      marginLeft: 'auto', fontSize: 11, fontWeight: 700,
                      background: badge.text, color: '#fff',
                      padding: '2px 10px', borderRadius: 20,
                    }}>
                      {fcPreview.pct < 30 ? 'Excelente' : fcPreview.pct <= 35 ? 'Aceptable' : 'Alto'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
                    <div style={{ padding: '14px 12px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Costo porcion</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)' }}>{fmtMoney(fcPreview.costo)}</div>
                    </div>
                    <div style={{ padding: '14px 12px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Food Cost %</div>
                      <div style={{
                        fontSize: 20, fontWeight: 800, color: badge.text,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        {fcPreview.pct.toFixed(1)}%
                      </div>
                    </div>
                    <div style={{ padding: '14px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Margen</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#059669' }}>{fmtMoney(fcPreview.margen)}</div>
                    </div>
                  </div>
                </div>
              )
            })()}
          </>
        )}

        {/* Delete button for edit mode */}
        {initialData && onDelete && (
          <button onClick={onDelete} style={{
            padding: '10px', borderRadius: 10, marginTop: 8,
            background: 'none', color: '#ef4444',
            border: '1px solid #fecaca',
            fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>
            Eliminar plato
          </button>
        )}
      </div>

      {/* Save bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 'var(--sidebar-w)', right: 0,
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        padding: '12px 16px', zIndex: 110,
      }}>
        {confirming ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setConfirming(false)}
              style={{
                flex: 1, padding: '13px', borderRadius: 10,
                background: 'var(--bg)', border: '1px solid var(--border)',
                color: 'var(--text-2)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              disabled={saving}
              onClick={handleSave}
              style={{
                flex: 2, padding: '13px', borderRadius: 10,
                background: 'var(--navy)', border: 'none',
                color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Guardando...' : 'Confirmar'}
            </button>
          </div>
        ) : (
          <button
            disabled={!canSave}
            onClick={() => setConfirming(true)}
            style={{
              width: '100%', padding: '13px', borderRadius: 10,
              background: canSave ? 'var(--navy)' : '#ccc',
              color: '#fff', border: 'none', fontWeight: 700,
              fontSize: 14, cursor: canSave ? 'pointer' : 'default',
            }}
          >
            {initialData ? 'Guardar cambios' : 'Crear plato'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Packaging Grupos Drawer ──────────────────────────────
function PackagingGruposDrawer({
  grupos,
  productos,
  platoActual,
  todosLosPlatos,
  onCrearGrupo,
  onEliminarGrupo,
  onAplicarGrupo,
  onClose,
  onAfterApply,
}: {
  grupos: PackagingGrupo[]
  productos: ProductoConEstado[]
  platoActual: CartaItemEnriquecido
  todosLosPlatos: CartaItemEnriquecido[]
  onCrearGrupo: (nombre: string, items: { productoId: string; cantidad: number }[]) => Promise<string>
  onEliminarGrupo: (id: string) => Promise<void>
  onAplicarGrupo: (grupoId: string, platoIds: string[]) => Promise<void>
  onClose: () => void
  onAfterApply: () => Promise<void>
}) {
  type Step = 'list' | 'create' | 'replicate'
  const [step, setStep] = useState<Step>('list')
  const [saving, setSaving] = useState(false)

  // Create state
  const [crearNombre, setCrearNombre] = useState('')
  const [crearItems, setCrearItems] = useState<{ productoId: string; cantidad: number; nombre: string; unidad: string }[]>([])
  const [crearSearch, setCrearSearch] = useState('')
  const [pendingProd, setPendingProd] = useState<ProductoConEstado | null>(null)
  const [pendingCantidad, setPendingCantidad] = useState('1')

  // Replicate state
  const [replicarGrupoId, setReplicarGrupoId] = useState<string | null>(null)
  const [replicarSelected, setReplicarSelected] = useState<Set<string>>(new Set())

  const linkedProdIds = useMemo(() => new Set(crearItems.map(i => i.productoId)), [crearItems])
  const crearFiltrados = useMemo(() => {
    const base = productos.filter(p => !linkedProdIds.has(p.id))
    if (!crearSearch.trim()) return base.slice(0, 15)
    const q = crearSearch.toLowerCase()
    return base.filter(p => p.nombre.toLowerCase().includes(q)).slice(0, 15)
  }, [productos, crearSearch, linkedProdIds])

  const handleAgregarAGrupo = () => {
    if (!pendingProd) return
    setCrearItems(prev => [...prev, {
      productoId: pendingProd.id,
      cantidad: parseFloat(pendingCantidad) || 1,
      nombre: pendingProd.nombre,
      unidad: pendingProd.unidad,
    }])
    setPendingProd(null)
    setCrearSearch('')
    setPendingCantidad('1')
  }

  const handleGuardarGrupo = async () => {
    if (!crearNombre.trim() || crearItems.length === 0) return
    setSaving(true)
    try {
      await onCrearGrupo(crearNombre.trim(), crearItems.map(i => ({ productoId: i.productoId, cantidad: i.cantidad })))
      setStep('list')
      setCrearNombre('')
      setCrearItems([])
    } finally { setSaving(false) }
  }

  const handleUsarAqui = async (grupoId: string) => {
    setSaving(true)
    try {
      await onAplicarGrupo(grupoId, [platoActual.id])
      await onAfterApply()
    } finally { setSaving(false) }
  }

  const handleIniciarReplica = (grupoId: string) => {
    setReplicarGrupoId(grupoId)
    setReplicarSelected(new Set([platoActual.id]))
    setStep('replicate')
  }

  const toggleReplica = (platoId: string) => {
    setReplicarSelected(prev => {
      const next = new Set(prev)
      if (next.has(platoId)) next.delete(platoId)
      else next.add(platoId)
      return next
    })
  }

  const handleReplicar = async () => {
    if (!replicarGrupoId || replicarSelected.size === 0) return
    setSaving(true)
    try {
      await onAplicarGrupo(replicarGrupoId, [...replicarSelected])
      await onAfterApply()
    } finally { setSaving(false) }
  }

  const grupoReplicar = grupos.find(g => g.id === replicarGrupoId)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button
          onClick={step === 'list' ? onClose : () => setStep('list')}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 17, flex: 1 }}>
          {step === 'list' ? 'Grupos de packaging' : step === 'create' ? 'Nuevo grupo' : `Replicar "${grupoReplicar?.nombre ?? ''}"`}
        </span>
        {step === 'list' && (
          <button
            onClick={() => setStep('create')}
            style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 8, padding: '6px 12px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            Crear grupo
          </button>
        )}
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>

        {/* ── STEP: list ── */}
        {step === 'list' && (
          <>
            {grupos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)', fontSize: 13 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 40, display: 'block', marginBottom: 8 }}>inventory_2</span>
                No hay grupos creados aún
                <br />
                <button onClick={() => setStep('create')} style={{ marginTop: 12, padding: '8px 20px', borderRadius: 10, background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Crear primer grupo
                </button>
              </div>
            ) : (
              grupos.map(g => (
                <div key={g.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#ea580c', flexShrink: 0 }}>inventory_2</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{g.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{g.items.length} artículo{g.items.length !== 1 ? 's' : ''}</div>
                    </div>
                    <button
                      onClick={() => { if (confirm(`Eliminar grupo "${g.nombre}"?`)) onEliminarGrupo(g.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                    </button>
                  </div>
                  {g.items.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '8px 14px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {g.items.map(item => (
                        <span key={item.id} style={{ fontSize: 11, background: 'rgba(234,88,12,.08)', color: '#ea580c', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
                          {item.producto_nombre} × {item.cantidad}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                    <button
                      disabled={saving}
                      onClick={() => handleUsarAqui(g.id)}
                      style={{ padding: '10px', border: 'none', background: 'none', color: 'var(--accent)', fontWeight: 700, fontSize: 12, cursor: 'pointer', borderRight: '1px solid var(--border)', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add_circle</span>
                      Usar en este plato
                    </button>
                    <button
                      onClick={() => handleIniciarReplica(g.id)}
                      style={{ padding: '10px', border: 'none', background: 'none', color: 'var(--text-2)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>content_copy</span>
                      Replicar en platos
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* ── STEP: create ── */}
        {step === 'create' && (
          <>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Nombre del grupo</label>
              <input
                autoFocus
                value={crearNombre}
                onChange={e => setCrearNombre(e.target.value)}
                placeholder="Ej: Delivery básico, Take away premium…"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, color: 'var(--text-1)', fontFamily: 'inherit' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Artículos del grupo</label>
              {crearItems.length > 0 && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
                  {crearItems.map((item, idx) => (
                    <div key={item.productoId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: idx < crearItems.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#ea580c', flexShrink: 0 }}>inventory_2</span>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{item.nombre}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{item.cantidad} {item.unidad}</span>
                      <button onClick={() => setCrearItems(prev => prev.filter(i => i.productoId !== item.productoId))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                {pendingProd ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-1)', flex: 1 }}>{pendingProd.nombre}</span>
                    <input
                      type="number" min="0.1" step="1"
                      value={pendingCantidad}
                      onChange={e => setPendingCantidad(e.target.value)}
                      style={{ width: 56, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text-1)' }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{pendingProd.unidad}</span>
                    <button onClick={handleAgregarAGrupo} style={{ background: 'var(--navy)', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                      + Agregar
                    </button>
                    <button onClick={() => { setPendingProd(null); setCrearSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      value={crearSearch}
                      onChange={e => setCrearSearch(e.target.value)}
                      placeholder="Buscar artículo de stock…"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit' }}
                    />
                    {crearFiltrados.length > 0 && (
                      <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 6, border: '1px solid var(--border)', borderRadius: 8 }}>
                        {crearFiltrados.map(p => (
                          <button
                            key={p.id}
                            onClick={() => { setPendingProd(p); setPendingCantidad('1') }}
                            style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', border: 'none', background: 'none', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-3)' }}>{p.unidad}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <button
              disabled={saving || !crearNombre.trim() || crearItems.length === 0}
              onClick={handleGuardarGrupo}
              style={{ padding: '13px', borderRadius: 12, background: (crearNombre.trim() && crearItems.length > 0) ? 'var(--navy)' : '#ccc', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? .6 : 1 }}
            >
              {saving ? 'Guardando…' : 'Guardar grupo'}
            </button>
          </>
        )}

        {/* ── STEP: replicate ── */}
        {step === 'replicate' && grupoReplicar && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
              Seleccioná los platos donde aplicar <strong>{grupoReplicar.nombre}</strong>:
            </p>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {todosLosPlatos.map((plato, idx) => {
                const checked = replicarSelected.has(plato.id)
                const esCurrent = plato.id === platoActual.id
                return (
                  <button
                    key={plato.id}
                    onClick={() => toggleReplica(plato.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                      padding: '12px 14px', textAlign: 'left', border: 'none',
                      background: checked ? 'rgba(67,97,160,.07)' : 'none',
                      borderBottom: idx < todosLosPlatos.length - 1 ? '1px solid var(--border)' : 'none',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 6, border: `2px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                      background: checked ? 'var(--accent)' : 'transparent', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {checked && <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#fff' }}>check</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                        {plato.nombre}
                        {esCurrent && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>este plato</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{plato.categoria}</div>
                    </div>
                  </button>
                )
              })}
            </div>

            <button
              disabled={saving || replicarSelected.size === 0}
              onClick={handleReplicar}
              style={{ padding: '13px', borderRadius: 12, background: replicarSelected.size > 0 ? 'var(--navy)' : '#ccc', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? .6 : 1 }}
            >
              {saving ? 'Aplicando…' : `Aplicar a ${replicarSelected.size} plato${replicarSelected.size !== 1 ? 's' : ''}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Detail View ─────────────────────────────────────────
const TAG_DEFS = [
  { key: 's/tacc',      label: 'S/TACC',       bg: '#fef3c7', color: '#92400e' },
  { key: 'vegano',      label: 'Vegano',        bg: '#d1fae5', color: '#065f46' },
  { key: 'vegetariano', label: 'Vegetariano',   bg: '#dcfce7', color: '#166534' },
  { key: 'keto',        label: 'Keto',          bg: '#ede9fe', color: '#5b21b6' },
  { key: 'picante',     label: '🌶 Picante',    bg: '#fee2e2', color: '#991b1b' },
  { key: 'sin lactosa', label: 'Sin lactosa',   bg: '#e0f2fe', color: '#075985' },
]

function DetailView({
  item,
  recetas,
  productos,
  onBack,
  onEdit,
  onDuplicar,
  onVincular,
  onAgregarReceta,
  onActualizarReceta,
  onEliminarReceta,
  onAgregarPackaging,
  onEliminarPackaging,
  onShowGrupos,
  onActualizarTags,
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
  // Draft recipe creation
  const [creatingDraft, setCreatingDraft] = useState(false)
  const [creatingTarea, setCreatingTarea] = useState(false)

  const PLAZAS_OPS = [
    { id: 'general',    label: 'General',     color: '#6b7280' },
    { id: 'parrilla',   label: 'Parrilla',    color: '#ef4444' },
    { id: 'frios',      label: 'Fríos',       color: '#0ea5e9' },
    { id: 'calientes',  label: 'Calientes',   color: '#f97316' },
    { id: 'pase',       label: 'Pase',        color: '#8b5cf6' },
    { id: 'pasteleria', label: 'Pastelería',  color: '#ec4899' },
    { id: 'panaderia',  label: 'Panadería',   color: '#84cc16' },
  ]
  const SECCIONES_OPS = [
    { id: 'heladera',   label: 'Heladera',        icono: 'kitchen' },
    { id: 'secos',      label: 'Secos / Tuppers',  icono: 'inventory_2' },
    { id: 'congelados', label: 'Congelados',       icono: 'severe_cold' },
    { id: 'estacion',   label: 'Estación',         icono: 'countertops' },
  ]
  const UNIDADES_OPS = ['u', 'kg', 'g', 'l', 'ml', 'pax', 'porc', 'bandeja']

  const supabaseDV = useMemo(() => createClient(), [])

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
      await supabaseDV.from('tareas').insert({
        nombre: `Crear receta: ${search.trim()}`,
        descripcion: `Receta pendiente para el plato "${item.nombre}"`,
        status: 'pendiente',
        restaurante_id: restauranteId,
      })
      setSearch('')
    } finally { setCreatingTarea(false) }
  }

  const handleGuardarOPS = async (pr: { id: string; receta_id: string; receta?: { nombre: string } }) => {
    if (!opsPlaza || !opsSeccion || opsSaving) return
    setOpsSaving(true)
    try {
      const capVal = parseFloat(opsCantidad) || 0

      // Calcular porciones finales (si capacidad está en peso → dividir por tamaño porción)
      const porVal = parseFloat(opsPesoPorcion) || 0
      const toG = (v: number, u: string) => u === 'kg' ? v * 1000 : u === 'g' ? v : null
      const capG = toG(capVal, opsUnidad)
      const porG = toG(porVal, opsPesoPorcionUnidad)
      const porcionesCalculadas = capG !== null && porG !== null && porG > 0 ? Math.round(capG / porG) : null
      const miCantidad = (['porc', 'u', 'pax'].includes(opsUnidad)) ? capVal : (porcionesCalculadas ?? capVal)

      const recipienteNombre = opsRecipienteNombre.trim() || null
      const pesoPorcion = recipienteNombre && opsPesoPorcion ? parseFloat(opsPesoPorcion) || null : null
      const pesoPorcionUnidad = pesoPorcion ? opsPesoPorcionUnidad : null
      const recipienteCapacidad = recipienteNombre ? miCantidad : null

      // 1. Guardar plaza + contribución de ESTE plato en plato_recetas
      await supabaseDV.from('plato_recetas')
        .update({ plaza: opsPlaza, cantidad_ops: miCantidad, unidad_ops: opsUnidad })
        .eq('id', pr.id)

      // 2. Sumar TODAS las contribuciones de esta receta en esta plaza
      const { data: todasContribuciones } = await supabaseDV
        .from('plato_recetas')
        .select('cantidad_ops')
        .eq('receta_id', pr.receta_id)
        .eq('plaza', opsPlaza)
        .not('cantidad_ops', 'is', null)

      const cantidadTotal = (todasContribuciones ?? []).reduce(
        (sum, r) => sum + (r.cantidad_ops ?? 0), 0
      )

      // 3. Buscar o crear sección del checklist para esta plaza + sección elegida
      const secNombre = SECCIONES_OPS.find(s => s.id === opsSeccion)?.label ?? opsSeccion
      const secIcono = SECCIONES_OPS.find(s => s.id === opsSeccion)?.icono ?? 'inventory_2'
      const secOrden = SECCIONES_OPS.findIndex(s => s.id === opsSeccion)
      const { data: secExistente } = await supabaseDV
        .from('checklist_secciones')
        .select('id')
        .eq('restaurante_id', restauranteId)
        .eq('plaza', opsPlaza)
        .ilike('nombre', secNombre)
        .limit(1)
      let seccionId: string | null = secExistente?.[0]?.id ?? null
      if (!seccionId) {
        const { data: newSec } = await supabaseDV
          .from('checklist_secciones')
          .insert({ nombre: secNombre, icono: secIcono, plaza: opsPlaza, orden: secOrden, restaurante_id: restauranteId })
          .select('id').single()
        seccionId = newSec?.id ?? null
      }

      // 4. Upsert checklist_item con la SUMA de contribuciones + recipiente/peso
      const nombre = pr.receta?.nombre ?? search
      const { data: existente } = await supabaseDV
        .from('checklist_items')
        .select('id')
        .eq('restaurante_id', restauranteId)
        .eq('receta_id', pr.receta_id)
        .eq('plaza', opsPlaza)
        .limit(1)

      if (existente?.[0]) {
        await supabaseDV.from('checklist_items').update({
          cantidad: cantidadTotal,
          unidad: opsUnidad,
          seccion_id: seccionId,
          seccion: secNombre,
          recipiente_nombre: recipienteNombre,
          recipiente_capacidad: recipienteCapacidad,
          peso_porcion: pesoPorcion,
          peso_porcion_unidad: pesoPorcionUnidad,
        }).eq('id', existente[0].id)
      } else {
        await supabaseDV.from('checklist_items').insert({
          nombre,
          plaza: opsPlaza,
          receta_id: pr.receta_id,
          cantidad: cantidadTotal,
          unidad: opsUnidad,
          prioridad: 'sp',
          seccion_id: seccionId,
          seccion: secNombre,
          restaurante_id: restauranteId,
          orden: 0,
          recipiente_nombre: recipienteNombre,
          recipiente_capacidad: recipienteCapacidad,
          peso_porcion: pesoPorcion,
          peso_porcion_unidad: pesoPorcionUnidad,
        })
      }
      setOpsPanel(null)
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
                      {pr.costo_calculado > 0 && (
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
                      setOpsPlaza(pr.plaza ?? '')
                      setOpsSeccion('')
                      setOpsCantidad(pr.cantidad_ops != null ? String(pr.cantidad_ops) : '')
                      setOpsUnidad(pr.unidad_ops ?? 'g')
                      setOpsRecipienteNombre('')
                      setOpsPesoPorcion('')
                      setOpsPesoPorcionUnidad('g')
                      // Prefill recipiente/peso desde checklist_items si ya existe
                      if (pr.receta_id && pr.plaza) {
                        const { data } = await supabaseDV.from('checklist_items')
                          .select('recipiente_nombre, recipiente_capacidad, peso_porcion, peso_porcion_unidad, unidad')
                          .eq('receta_id', pr.receta_id).eq('plaza', pr.plaza).limit(1)
                        if (data?.[0]) {
                          setOpsRecipienteNombre(data[0].recipiente_nombre ?? '')
                          setOpsPesoPorcion(data[0].peso_porcion != null ? String(data[0].peso_porcion) : '')
                          setOpsPesoPorcionUnidad(data[0].peso_porcion_unidad ?? 'g')
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
                      {PLAZAS_OPS.map(p => (
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
                          const toG2 = (v: number, u: string) => u === 'kg' ? v * 1000 : u === 'g' ? v : null
                          const capG = toG2(capVal, opsUnidad)
                          const porG = toG2(porVal, opsPesoPorcionUnidad)
                          const porcionesAuto = capG !== null && porG !== null && porG > 0 ? Math.round(capG / porG) : null
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
                          await supabaseDV.from('plato_recetas').update({ plaza: null, cantidad_ops: null, unidad_ops: null }).eq('id', pr.id)
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

// ── Rentabilidad View ───────────────────────────────────
type RentTab = 'lista' | 'ingenieria' | 'reprecio' | 'salud'

function RentabilidadView({
  items,
  ventas,
  onBack,
  isAdmin = false,
  actualizarItem,
  onOpenPlato,
  showToast,
}: {
  items: CartaItemEnriquecido[]
  ventas: { items?: { nombre_plato: string; cantidad: number }[] | null }[]
  onBack: () => void
  isAdmin?: boolean
  actualizarItem: (id: string, datos: { precio_venta?: number }) => Promise<void>
  onOpenPlato: (id: string) => void
  showToast: (msg: string) => void
}) {
  const [tab, setTab] = useState<RentTab>('lista')

  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')

  const sorted = useMemo(() =>
    items.filter(i => i.food_cost_pct != null).sort((a, b) => (a.food_cost_pct ?? 0) - (b.food_cost_pct ?? 0))
  , [items])

  // Popularidad por plato desde ventas
  const ventasMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const v of ventas) for (const it of (v.items ?? [])) {
      m.set(norm(it.nombre_plato), (m.get(norm(it.nombre_plato)) ?? 0) + (it.cantidad ?? 0))
    }
    return m
  }, [ventas])

  // ── Feature 1: Ingeniería de menú ──
  const ing = useMemo(() => {
    const base = items
      .filter(i => i.food_cost_pct != null && i.margen_bruto != null)
      .map(i => ({ item: i, pop: ventasMap.get(norm(i.nombre)) ?? 0, margin: i.margen_bruto ?? 0 }))
    const conVentas = base.some(x => x.pop > 0)
    const avgPop = base.length ? base.reduce((s, x) => s + x.pop, 0) / base.length : 0
    const avgMargin = base.length ? base.reduce((s, x) => s + x.margin, 0) / base.length : 0
    const estrella: typeof base = [], caballo: typeof base = [], puzzle: typeof base = [], perro: typeof base = []
    for (const x of base) {
      const ph = x.pop >= avgPop, mh = x.margin >= avgMargin
      if (ph && mh) estrella.push(x)
      else if (ph && !mh) caballo.push(x)
      else if (!ph && mh) puzzle.push(x)
      else perro.push(x)
    }
    return { conVentas, hayDatos: base.length > 0, estrella, caballo, puzzle, perro }
  }, [items, ventasMap])

  // ── Feature 2: Reprecio por inflación ──
  const [targetFC, setTargetFC] = useState('32')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [aplicando, setAplicando] = useState(false)
  const reprecio = useMemo(() => {
    const t = parseFloat(targetFC.replace(',', '.'))
    if (!(t > 0)) return []
    return items
      .filter(i => i.food_cost_pct != null && (i.food_cost_pct ?? 0) > t && (i.costo_porcion ?? 0) > 0)
      .map(i => ({ item: i, sugerido: Math.round((i.costo_porcion ?? 0) / (t / 100)) }))
      .sort((a, b) => (b.item.food_cost_pct ?? 0) - (a.item.food_cost_pct ?? 0))
  }, [items, targetFC])
  const reprecioKey = reprecio.map(r => r.item.id).join(',')
  useEffect(() => { setSel(new Set(reprecio.map(r => r.item.id))) }, [reprecioKey]) // eslint-disable-line react-hooks/exhaustive-deps
  async function aplicarReprecio() {
    const elegidos = reprecio.filter(r => sel.has(r.item.id))
    if (elegidos.length === 0) return
    setAplicando(true)
    try {
      for (const r of elegidos) await actualizarItem(r.item.id, { precio_venta: r.sugerido })
      showToast(`${elegidos.length} precio${elegidos.length !== 1 ? 's' : ''} actualizado${elegidos.length !== 1 ? 's' : ''}`)
    } catch { showToast('Error al aplicar precios') }
    setAplicando(false)
  }

  // ── Feature 3: Salud de la carta ──
  const salud = useMemo(() => {
    const sinReceta = items.filter(i => !i.receta_id && i.plato_recetas.length === 0)
    const margenNeg = items.filter(i => i.margen_bruto != null && (i.margen_bruto ?? 0) < 0)
    const en86 = items.filter(i => !i.disponible)
    const sinCategoria = items.filter(i => !i.categoria || !i.categoria.trim())
    return { sinReceta, margenNeg, en86, sinCategoria, total: sinReceta.length + margenNeg.length + en86.length + sinCategoria.length }
  }, [items])

  const QUAD = {
    estrella: { label: 'Estrellas', color: '#16a34a', icon: 'star', rec: 'Populares y rentables — destacalas en la carta' },
    caballo: { label: 'Caballos', color: '#f59e0b', icon: 'trending_up', rec: 'Se venden mucho pero rinden poco — subí precio o bajá costo' },
    puzzle: { label: 'Puzzles', color: '#3b82f6', icon: 'extension', rec: 'Rentables pero poco vendidos — promocioná o reubicá' },
    perro: { label: 'Perros', color: '#ef4444', icon: 'trending_down', rec: 'Ni populares ni rentables — considerá sacarlos' },
  } as const

  const TABS: { id: RentTab; label: string }[] = [
    { id: 'lista', label: 'Lista' },
    { id: 'ingenieria', label: 'Ingeniería' },
    { id: 'reprecio', label: 'Reprecio' },
    { id: 'salud', label: `Salud${salud.total > 0 ? ` (${salud.total})` : ''}` },
  ]

  return (
    <div>
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 12 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>Rentabilidad</span>
          <div style={{ flex: 1 }} />
          {isAdmin && tab === 'lista' && (
            <button onClick={() => exportRentabilidadPDF(items, isAdmin)} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
              padding: '6px 12px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>picture_as_pdf</span>
              PDF
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap',
              color: tab === t.id ? '#fff' : 'rgba(255,255,255,.5)',
              borderBottom: tab === t.id ? '2px solid #fff' : '2px solid transparent',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* ── Tab: Lista ── */}
      {tab === 'lista' && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
              Vinculá recetas a los platos para ver rentabilidad
            </div>
          ) : sorted.map((item, i) => {
            const fc = fcBadge(item.food_cost_pct ?? 0)
            return (
              <div key={item.id} onClick={() => onOpenPlato(item.id)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: fc.bg, color: fc.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{item.nombre}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', gap: 8 }}>
                    <span>Venta: {fmtMoney(item.precio_venta)}</span>
                    <span>Costo: {fmtMoney(item.costo_porcion ?? 0)}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: fc.text }}>{(item.food_cost_pct ?? 0).toFixed(1)}%</div>
                  <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>{fmtMoney(item.margen_bruto ?? 0)}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Tab: Ingeniería de menú ── */}
      {tab === 'ingenieria' && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!ing.hayDatos ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
              Vinculá recetas (para el margen) y cargá ventas (para la popularidad) para clasificar tu carta.
            </div>
          ) : (
            <>
              {!ing.conVentas && (
                <div style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 10, padding: '10px 12px', fontSize: 11.5, color: '#92400e', lineHeight: 1.5 }}>
                  Sin ventas cargadas: la clasificación es solo por rentabilidad. Cargá ventas para cruzar con popularidad.
                </div>
              )}
              {(['estrella', 'caballo', 'puzzle', 'perro'] as const).map(q => {
                const meta = QUAD[q]
                const lista = ing[q]
                if (lista.length === 0) return null
                return (
                  <div key={q} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: meta.color }}>{meta.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{meta.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>({lista.length})</span>
                    </div>
                    <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>{meta.rec}</div>
                    {lista.sort((a, b) => b.pop - a.pop).map(x => (
                      <button key={x.item.id} onClick={() => onOpenPlato(x.item.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.item.nombre}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{x.pop} vend.</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#059669', fontFamily: "'DM Mono', monospace" }}>{fmtMoney(x.margin)}</span>
                      </button>
                    ))}
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

      {/* ── Tab: Reprecio por inflación ── */}
      {tab === 'reprecio' && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>Food cost objetivo</span>
            <input type="text" inputMode="decimal" value={targetFC} onChange={e => setTargetFC(e.target.value.replace(/[^0-9.,]/g, ''))}
              style={{ width: 56, border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 8, padding: '6px 8px', fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: 'var(--text-1)', textAlign: 'center', outline: 'none' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}>%</span>
          </div>
          {reprecio.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
              Ningún plato supera el food cost objetivo. 👌
            </div>
          ) : (
            <>
              {reprecio.map(r => {
                const checked = sel.has(r.item.id)
                return (
                  <button key={r.item.id} onClick={() => setSel(p => { const n = new Set(p); if (n.has(r.item.id)) n.delete(r.item.id); else n.add(r.item.id); return n })}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <input type="checkbox" checked={checked} readOnly style={{ width: 16, height: 16, accentColor: 'var(--navy)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.item.nombre}</div>
                      <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>FC {(r.item.food_cost_pct ?? 0).toFixed(0)}%</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', fontFamily: "'DM Mono', monospace" }}>{fmtMoney(r.item.precio_venta)} → {fmtMoney(r.sugerido)}</div>
                    </div>
                  </button>
                )
              })}
              <button onClick={aplicarReprecio} disabled={aplicando || sel.size === 0}
                style={{ width: '100%', background: 'var(--navy)', border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', opacity: (aplicando || sel.size === 0) ? 0.6 : 1, fontFamily: 'inherit' }}>
                {aplicando ? 'Aplicando…' : `Aplicar a ${sel.size} plato${sel.size !== 1 ? 's' : ''}`}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Tab: Salud de la carta ── */}
      {tab === 'salud' && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {salud.total === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
              Tu carta está sana. 🎉
            </div>
          ) : ([
            { key: 'sinReceta', label: 'Sin receta vinculada', hint: 'food cost desconocido — vinculá una receta', color: 'var(--text-3)', list: salud.sinReceta },
            { key: 'margenNeg', label: 'Margen negativo', hint: 'el costo supera al precio — perdés plata', color: '#ef4444', list: salud.margenNeg },
            { key: 'en86', label: 'En 86 (no disponible)', hint: 'revisá si vuelve a la carta o se saca', color: '#f59e0b', list: salud.en86 },
            { key: 'sinCategoria', label: 'Sin categoría', hint: 'asignale una para que aparezca agrupado', color: 'var(--text-3)', list: salud.sinCategoria },
          ] as const).filter(g => g.list.length > 0).map(g => (
            <div key={g.key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{g.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>({g.list.length})</span>
              </div>
              <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-3)' }}>{g.hint}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 12px 12px' }}>
                {g.list.slice(0, 16).map(it => (
                  <button key={it.id} onClick={() => onOpenPlato(it.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {it.nombre}
                  </button>
                ))}
                {g.list.length > 16 && <span style={{ fontSize: 10, color: 'var(--text-3)', alignSelf: 'center' }}>+{g.list.length - 16} más</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Import Carta Modal ──────────────────────────────────
interface ComponenteImportado {
  nombre: string
  tipo: 'receta' | 'producto' | 'plato' | null
  ref_id: string | null
  ref_nombre: string | null
}

interface ItemImportado {
  nombre: string
  categoria: string
  descripcion: string
  componentes: ComponenteImportado[]
  precio_venta: number | null
  porciones: number
  tags: string[]
  _sel: boolean
}

function ImportCartaModal({
  categorias,
  restauranteId,
  recetas,
  productos,
  onClose,
  onDone,
}: {
  categorias: CartaCategoria[]
  restauranteId: string
  recetas: RecetaConCosto[]
  productos: ProductoConEstado[]
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [step, setStep] = useState<'upload' | 'preview'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [items, setItems] = useState<ItemImportado[]>([])
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [platos, setPlatos] = useState<{ id: string; nombre: string }[]>([])
  const [linkSearch, setLinkSearch] = useState<{ key: string; q: string } | null>(null)

  useEffect(() => {
    if (!restauranteId) return
    createClient()
      .from('platos_compuestos')
      .select('id, nombre')
      .eq('restaurante_id', restauranteId)
      .eq('activo', true)
      .then(({ data }) => setPlatos((data ?? []) as { id: string; nombre: string }[]))
  }, [restauranteId])

  const catNombres = categorias.length > 0
    ? categorias.map(c => c.nombre)
    : ['Entradas', 'Principales', 'Postres', 'Bebidas', 'Guarniciones']

  const TAG_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
    's/tacc':       { label: 'S/TACC',        bg: '#fef3c7', color: '#92400e' },
    'vegano':       { label: 'Vegano',         bg: '#d1fae5', color: '#065f46' },
    'vegetariano':  { label: 'Vegetariano',    bg: '#dcfce7', color: '#166534' },
    'keto':         { label: 'Keto',           bg: '#ede9fe', color: '#5b21b6' },
    'picante':      { label: '🌶 Picante',     bg: '#fee2e2', color: '#991b1b' },
    'sin lactosa':  { label: 'Sin lactosa',    bg: '#e0f2fe', color: '#075985' },
  }

  const TIPO_CFG = {
    receta:   { icon: 'menu_book',    color: '#4361a0', bg: '#eef2ff', label: 'Receta' },
    producto: { icon: 'inventory_2',  color: '#059669', bg: '#d1fae5', label: 'Producto' },
    plato:    { icon: 'restaurant',   color: '#f97316', bg: '#ffedd5', label: 'Producción' },
  }

  // Auto-match: busca el candidato más cercano en las tres fuentes
  function autoMatch(nombre: string): ComponenteImportado {
    const q = nombre.toLowerCase().trim()
    function score(n: string) {
      n = n.toLowerCase()
      if (n === q) return 4
      if (n.startsWith(q) || q.startsWith(n)) return 3
      if (n.includes(q) || q.includes(n)) return 2
      // palabras comunes
      const qw = q.split(/\s+/)
      const nw = n.split(/\s+/)
      const shared = qw.filter(w => w.length > 2 && nw.some(v => v.includes(w) || w.includes(v))).length
      return shared > 0 ? 1 : 0
    }
    const best = (arr: { id: string; nombre: string }[], tipo: ComponenteImportado['tipo']) => {
      const hit = arr.map(x => ({ x, s: score(x.nombre) })).filter(r => r.s > 0).sort((a, b) => b.s - a.s)[0]
      return hit ? { nombre, tipo, ref_id: hit.x.id, ref_nombre: hit.x.nombre } : null
    }
    return (
      best(recetas, 'receta') ??
      best(productos, 'producto') ??
      best(platos, 'plato') ??
      { nombre, tipo: null, ref_id: null, ref_nombre: null }
    )
  }

  function searchResults(q: string) {
    if (!q.trim()) return []
    const ql = q.toLowerCase()
    const results: { tipo: ComponenteImportado['tipo']; id: string; nombre: string }[] = [
      ...recetas.filter(r => r.nombre.toLowerCase().includes(ql)).slice(0, 5).map(r => ({ tipo: 'receta' as const, id: r.id, nombre: r.nombre })),
      ...productos.filter(p => p.nombre.toLowerCase().includes(ql)).slice(0, 5).map(p => ({ tipo: 'producto' as const, id: p.id, nombre: p.nombre })),
      ...platos.filter(p => p.nombre.toLowerCase().includes(ql)).slice(0, 5).map(p => ({ tipo: 'plato' as const, id: p.id, nombre: p.nombre })),
    ]
    return results.slice(0, 8)
  }

  const handleFile = (f: File) => { setFile(f); setError('') }

  const handleParse = async () => {
    if (!file) return
    setParsing(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('modo', 'preview')
      const res = await fetch('/api/carta/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al parsear')
      type RawItem = { nombre: string; categoria: string; descripcion: string; componentes: string[]; precio_venta: number | null; porciones: number; tags: string[] }
      setItems((data.items as RawItem[]).map(i => ({
        ...i,
        componentes: (i.componentes ?? []).map((c: string | ComponenteImportado) =>
          autoMatch(typeof c === 'string' ? c : c.nombre)
        ),
        porciones: i.porciones ?? 1,
        tags: i.tags ?? [],
        _sel: true,
      })))
      setStep('preview')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al parsear archivo')
    } finally { setParsing(false) }
  }

  const handleApply = async () => {
    const selected = items.filter(i => i._sel)
    if (selected.length === 0) return
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('modo', 'apply')
      fd.append('restaurante_id', restauranteId)
      fd.append('items', JSON.stringify(selected.map(({ _sel: _, ...rest }) => rest)))
      const res = await fetch('/api/carta/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      onDone(`${data.insertados} platos importados`)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally { setSaving(false) }
  }

  const updateItem = <K extends keyof ItemImportado>(idx: number, key: K, val: ItemImportado[K]) =>
    setItems(prev => prev.map((p, i) => i === idx ? { ...p, [key]: val } : p))

  const updateComp = (itemIdx: number, compIdx: number, patch: Partial<ComponenteImportado>) =>
    setItems(prev => prev.map((p, i) => {
      if (i !== itemIdx) return p
      const comps = p.componentes.map((c, ci) => ci === compIdx ? { ...c, ...patch } : c)
      return { ...p, componentes: comps }
    }))

  const linkComp = (itemIdx: number, compIdx: number, tipo: ComponenteImportado['tipo'], id: string, nombre: string) => {
    updateComp(itemIdx, compIdx, { tipo, ref_id: id, ref_nombre: nombre })
    setLinkSearch(null)
  }

  const removeComp = (itemIdx: number, compIdx: number) =>
    setItems(prev => prev.map((p, i) => i === itemIdx
      ? { ...p, componentes: p.componentes.filter((_, ci) => ci !== compIdx) }
      : p
    ))

  const addComp = (itemIdx: number) =>
    setItems(prev => prev.map((p, i) => i === itemIdx
      ? { ...p, componentes: [...p.componentes, { nombre: '', tipo: null, ref_id: null, ref_nombre: null }] }
      : p
    ))

  const toggleTag = (idx: number, tag: string) =>
    setItems(prev => prev.map((p, i) => {
      if (i !== idx) return p
      const has = p.tags.includes(tag)
      return { ...p, tags: has ? p.tags.filter(t => t !== tag) : [...p.tags, tag] }
    }))

  const allSel = items.every(i => i._sel)
  const selCount = items.filter(i => i._sel).length

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end',
    }}>
      <div style={{
        width: '100%', maxHeight: '92vh', background: 'var(--surface)',
        borderRadius: '20px 20px 0 0', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ background: 'var(--navy)', padding: '20px 16px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Importar carta</div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 }}>
              {step === 'upload' ? 'PDF · imagen · Excel · texto' : `${items.length} platos detectados · ${selCount} seleccionados`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

          {/* ── Upload step ── */}
          {step === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 10, padding: 32,
                border: `2px dashed ${file ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 14, cursor: 'pointer',
                background: file ? '#eef2ff' : 'var(--bg)',
              }}>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.csv,.txt" style={{ display: 'none' }}
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                <span className="material-symbols-outlined" style={{ fontSize: 40, color: file ? 'var(--accent)' : 'var(--text-3)' }}>
                  {file ? 'description' : 'upload_file'}
                </span>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: file ? 'var(--accent)' : 'var(--text-1)' }}>
                    {file ? file.name : 'Tocá para subir un archivo'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                    Foto de la carta, PDF, Excel o texto plano
                  </div>
                </div>
              </label>

              <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>La IA extrae automáticamente</div>
                {[
                  ['restaurant', 'Nombre del plato y sus componentes/sub-recetas'],
                  ['sell', 'Precio de venta'],
                  ['restaurant_menu', 'Categoría (Entradas, Principales, Postres…)'],
                  ['fiber_manual_record', 'Porciones (individual / para compartir)'],
                  ['eco', 'Tags dietarios: S/TACC, Vegano, Vegetariano, Keto'],
                ].map(([icon, text]) => (
                  <div key={icon} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--accent)' }}>{icon}</span>
                    {text}
                  </div>
                ))}
              </div>

              {error && <div style={{ color: '#dc2626', fontSize: 13, padding: '8px 12px', background: '#fee2e2', borderRadius: 8 }}>{error}</div>}
            </div>
          )}

          {/* ── Preview step ── */}
          {step === 'preview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Sel global */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  Revisá y editá antes de importar
                </div>
                <button onClick={() => setItems(prev => prev.map(i => ({ ...i, _sel: !allSel })))}
                  style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  {allSel ? 'Deseleccionar todo' : 'Seleccionar todo'}
                </button>
              </div>

              {items.map((item, idx) => (
                <div key={idx} style={{
                  background: 'var(--bg)', borderRadius: 12,
                  border: `1.5px solid ${item._sel ? 'var(--accent)' : 'var(--border)'}`,
                  overflow: 'hidden', opacity: item._sel ? 1 : 0.45,
                }}>
                  {/* Card header: checkbox + nombre + precio */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px 8px' }}>
                    <input type="checkbox" checked={item._sel}
                      onChange={e => updateItem(idx, '_sel', e.target.checked)}
                      style={{ marginTop: 4, accentColor: 'var(--accent)', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Nombre editable */}
                      <input
                        value={item.nombre}
                        onChange={e => updateItem(idx, 'nombre', e.target.value)}
                        style={{
                          width: '100%', fontWeight: 700, fontSize: 14, color: 'var(--text-1)',
                          border: 'none', background: 'transparent', padding: 0, outline: 'none',
                        }}
                      />
                      {/* Fila: categoría + porciones + precio */}
                      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                          value={item.categoria}
                          onChange={e => updateItem(idx, 'categoria', e.target.value)}
                          style={{
                            fontSize: 11, padding: '3px 6px', borderRadius: 6,
                            border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--accent)',
                          }}
                        >
                          {catNombres.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>

                        {/* Porciones */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--text-3)' }}>group</span>
                          <select
                            value={item.porciones}
                            onChange={e => updateItem(idx, 'porciones', Number(e.target.value))}
                            style={{
                              fontSize: 11, padding: '3px 6px', borderRadius: 6,
                              border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)',
                            }}
                          >
                            {[1, 2, 3, 4].map(n => (
                              <option key={n} value={n}>{n === 1 ? 'Individual' : `Para ${n}`}</option>
                            ))}
                          </select>
                        </div>

                        {/* Precio */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 'auto' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>$</span>
                          <input
                            type="number"
                            placeholder="Precio"
                            value={item.precio_venta ?? ''}
                            onChange={e => updateItem(idx, 'precio_venta', e.target.value ? parseFloat(e.target.value) : null)}
                            style={{
                              width: 75, fontSize: 13, fontWeight: 700, color: 'var(--navy)',
                              border: '1px solid var(--border)', borderRadius: 6,
                              padding: '2px 6px', background: 'var(--surface)', textAlign: 'right',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Componentes */}
                  <div style={{ padding: '0 12px 10px 34px' }}>
                    {item.componentes.length > 0 && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                        Componentes
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {item.componentes.map((comp, ci) => {
                        const key = `${idx}-${ci}`
                        const isSearching = linkSearch?.key === key
                        const tipoCfg = comp.tipo ? TIPO_CFG[comp.tipo] : null
                        const results = isSearching ? searchResults(linkSearch.q) : []
                        return (
                          <div key={ci}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              {/* Nombre editable */}
                              <input
                                value={comp.nombre}
                                onChange={e => updateComp(idx, ci, { nombre: e.target.value })}
                                placeholder="nombre..."
                                style={{
                                  flex: 1, fontSize: 12, padding: '4px 8px', borderRadius: 8,
                                  border: '1px solid var(--border)', background: 'var(--surface)',
                                  color: 'var(--text-1)', outline: 'none',
                                }}
                              />
                              {/* Badge de tipo / botón vincular */}
                              <button
                                onClick={() => setLinkSearch(isSearching ? null : { key, q: comp.nombre })}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 3,
                                  padding: '3px 7px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                  fontSize: 10, fontWeight: 700,
                                  background: tipoCfg ? tipoCfg.bg : 'var(--bg)',
                                  color: tipoCfg ? tipoCfg.color : 'var(--text-3)',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                                  {tipoCfg ? tipoCfg.icon : 'link'}
                                </span>
                                {tipoCfg ? tipoCfg.label : 'vincular'}
                              </button>
                              {/* Desvincular */}
                              {comp.tipo && (
                                <button
                                  onClick={() => updateComp(idx, ci, { tipo: null, ref_id: null, ref_nombre: null })}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 3px', color: 'var(--text-3)', fontSize: 14, lineHeight: 1 }}
                                  title="Quitar vínculo"
                                >×</button>
                              )}
                              {/* Eliminar componente */}
                              <button
                                onClick={() => removeComp(idx, ci)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 3px', color: '#ef4444', fontSize: 14, lineHeight: 1 }}
                                title="Eliminar"
                              >🗑</button>
                            </div>
                            {/* Nombre del vinculo */}
                            {comp.ref_nombre && (
                              <div style={{ fontSize: 10, color: tipoCfg?.color, marginLeft: 8, marginTop: 1 }}>
                                → {comp.ref_nombre}
                              </div>
                            )}
                            {/* Dropdown de búsqueda */}
                            {isSearching && (
                              <div style={{ marginTop: 3, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,.12)' }}>
                                <input
                                  autoFocus
                                  value={linkSearch.q}
                                  onChange={e => setLinkSearch({ key, q: e.target.value })}
                                  placeholder="Buscar receta, producto o producción..."
                                  style={{ width: '100%', padding: '8px 10px', border: 'none', borderBottom: '1px solid var(--border)', fontSize: 12, outline: 'none', boxSizing: 'border-box', background: 'var(--bg)' }}
                                />
                                {results.length === 0 ? (
                                  <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-3)' }}>
                                    {linkSearch.q.length < 1 ? 'Escribí para buscar' : 'Sin resultados'}
                                  </div>
                                ) : (
                                  results.map(r => {
                                    const tc = TIPO_CFG[r.tipo!]
                                    return (
                                      <button
                                        key={`${r.tipo}-${r.id}`}
                                        onMouseDown={e => { e.preventDefault(); linkComp(idx, ci, r.tipo, r.id, r.nombre) }}
                                        style={{
                                          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                          padding: '8px 10px', background: 'none', border: 'none',
                                          borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left',
                                        }}
                                      >
                                        <span className="material-symbols-outlined" style={{ fontSize: 13, color: tc.color }}>{tc.icon}</span>
                                        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-1)' }}>{r.nombre}</span>
                                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: tc.bg, color: tc.color }}>{tc.label}</span>
                                      </button>
                                    )
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                      <button
                        onClick={() => addComp(idx)}
                        style={{
                          alignSelf: 'flex-start', fontSize: 11, padding: '3px 10px', borderRadius: 8,
                          border: '1px dashed var(--accent)', background: 'transparent',
                          color: 'var(--accent)', cursor: 'pointer', fontWeight: 600,
                        }}
                      >+ componente</button>
                    </div>
                  </div>

                  {/* Tags dietarios */}
                  <div style={{ padding: '0 12px 10px 34px', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {Object.entries(TAG_CONFIG).map(([key, cfg]) => {
                      const active = item.tags.includes(key)
                      return (
                        <button
                          key={key}
                          onClick={() => toggleTag(idx, key)}
                          style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            border: `1px solid ${active ? cfg.color + '50' : 'var(--border)'}`,
                            background: active ? cfg.bg : 'var(--surface)',
                            color: active ? cfg.color : 'var(--text-3)',
                            cursor: 'pointer',
                          }}
                        >{cfg.label}</button>
                      )
                    })}
                  </div>
                </div>
              ))}

              {error && <div style={{ color: '#dc2626', fontSize: 13, padding: '8px 12px', background: '#fee2e2', borderRadius: 8 }}>{error}</div>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
          {step === 'upload' ? (
            <>
              <button onClick={onClose} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleParse} disabled={!file || parsing} style={{
                flex: 2, padding: '12px', borderRadius: 12, border: 'none',
                background: file && !parsing ? 'var(--navy)' : 'var(--border)',
                color: '#fff', fontWeight: 700, cursor: file && !parsing ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                {parsing
                  ? <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>progress_activity</span> Analizando...</>
                  : <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>psychology</span> Analizar con IA</>
                }
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setStep('upload')} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontWeight: 600, cursor: 'pointer' }}>
                Volver
              </button>
              <button onClick={handleApply} disabled={selCount === 0 || saving} style={{
                flex: 2, padding: '12px', borderRadius: 12, border: 'none',
                background: selCount > 0 && !saving ? 'var(--navy)' : 'var(--border)',
                color: '#fff', fontWeight: 700, cursor: selCount > 0 && !saving ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                {saving
                  ? <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>progress_activity</span> Guardando...</>
                  : <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span> Agregar {selCount} plato{selCount !== 1 ? 's' : ''}</>
                }
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── MAIN PAGE ───────────────────────────────────────────
type View = 'list' | 'nuevo' | 'detail' | 'edit' | 'rentabilidad' | 'menus'

export default function CartaPage() {
  const { items, loading, fetchItems, crearItem, actualizarItem, actualizarTags, toggleDisponible, eliminarItem, duplicarItem, agregarPlatoReceta, actualizarPlatoReceta, eliminarPlatoReceta, agregarPlatoPackaging, eliminarPlatoPackaging, categorias } = useCarta()
  const { recetas } = useRecetas()
  const { productos } = useStock()
  const { ventas } = useVentas()
  const { grupos, crearGrupo, eliminarGrupo, aplicarGrupoAPlatos } = usePackagingGrupos()
  const { crearMenu, actualizarMenu } = useMenus()

  const RESTAURANTE_ID = useRestauranteId()
  const { puedeEditar, isAdmin } = usePermisos()
  const canEdit = isAdmin || puedeEditar('carta')
  const isDesktop = useIsDesktop()

  const [view, setView] = useState<View>('list')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('Todas')
  const [toast, setToast] = useState('')
  const [showGrupos, setShowGrupos] = useState(false)
  const [showImport, setShowImport] = useState(false)
  // Editor unificado de composición (Plato / Menú / Evento)
  const [composing, setComposing] = useState<null | { inicial?: CompInicial; menuEditId?: string }>(null)

  // Derive selectedItem from fresh items (stays current after plato_recetas changes)
  const selectedItem = useMemo(
    () => items.find(i => i.id === selectedItemId) ?? null,
    [items, selectedItemId]
  )

  const filtered = useMemo(() => {
    if (filter === 'Todas') return items
    return items.filter(i => i.categoria === filter)
  }, [items, filter])

  const stats = useMemo(() => ({
    total: items.length,
    disponibles: items.filter(i => i.disponible).length,
    conReceta: items.filter(i => i.receta_id || i.plato_recetas.length > 0).length,
    noDisponibles: items.filter(i => !i.disponible).length,
  }), [items])

  // Contexto para KitchenCoach
  useEffect(() => {
    if (!items.length) return
    const itemsConFC = items.filter(i => i.food_cost_pct != null)
    const fcPromedio = itemsConFC.length
      ? Math.round(itemsConFC.reduce((s, i) => s + (i.food_cost_pct ?? 0), 0) / itemsConFC.length)
      : null
    const sinReceta = items.filter(i => !i.receta_id && i.plato_recetas.length === 0)
    const fcAlto = items
      .filter(i => (i.food_cost_pct ?? 0) > 35)
      .map(i => ({ nombre: i.nombre, fc: Math.round(i.food_cost_pct ?? 0), precio: i.precio_venta }))
      .sort((a, b) => b.fc - a.fc)
      .slice(0, 5)
    const margenNeg = items
      .filter(i => (i.margen_pct_computed ?? 0) < 0)
      .map(i => ({ nombre: i.nombre, margen: Math.round(i.margen_pct_computed ?? 0) }))
      .slice(0, 5)

    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'carta',
      total: items.length,
      disponibles: stats.disponibles,
      marcados86: stats.noDisponibles,
      sinReceta: sinReceta.length,
      sinRecetaNombres: sinReceta.map(i => i.nombre).slice(0, 5),
      fcPromedio,
      fcAlto,
      margenNegativo: margenNeg,
      categorias: [...new Set(items.map(i => i.categoria))],
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [items, stats])

  function exportXLSX() {
    exportarExcel(`carta_${fechaArchivo()}.xlsx`, [{
      nombre: 'Carta',
      filas: items.map(i => ({
        'Nombre': i.nombre,
        'Categoría': i.categoria,
        'Descripción': i.descripcion ?? '',
        'Precio venta': i.precio_venta,
        'Costo porción': i.costo_porcion ?? '',
        'Food cost %': i.food_cost_pct != null ? Number(i.food_cost_pct.toFixed(1)) : '',
        'Disponible': i.disponible ? 'Sí' : 'No',
      })),
    }])
  }

  const handleCardClick = (item: CartaItemEnriquecido) => {
    setSelectedItemId(item.id)
    if (!isDesktop) setView('detail')
  }

  // ── Editor unificado: guardar Plato / Menú / Evento ──
  const handleComposicionSave = async (payload: CompPayload) => {
    try {
      if (payload.tipo === 'plato') {
        const newId = await crearItem({
          nombre: payload.nombre,
          descripcion: payload.descripcion,
          precio_venta: payload.precio,
          categoria: payload.categoria as CategoriaCartaItem,
          receta_id: null,
        })
        if (payload.tags.length > 0) await actualizarTags(newId, payload.tags)
        const compItems = payload.secciones.flatMap(s => s.items)
        const supa = createClient()
        for (const it of compItems) {
          if ((it.tipo === 'receta' || it.tipo === 'producto') && it.ref_id) {
            if (it.tipo === 'receta') await agregarPlatoReceta(newId, it.ref_id, it.cantidad ?? 1)
            // Guardar plaza + OPS en plato_recetas
            if (it.plaza || it.cantidad_ops != null) {
              await supa.from('plato_recetas')
                .update({ plaza: it.plaza ?? null, cantidad_ops: it.cantidad_ops ?? null, unidad_ops: it.unidad_ops ?? null })
                .eq('plato_id', newId).eq('receta_id', it.ref_id)
            }
            // Si tiene OPS configurado: upsert checklist_items (helper compartido)
            if (it.plaza && it.seccion_mise && it.ref_id && RESTAURANTE_ID) {
              await upsertMiseChecklistItem({
                supabase: supa,
                restauranteId: RESTAURANTE_ID,
                recetaId: it.ref_id,
                nombre: it.nombre,
                plaza: it.plaza,
                seccionMiseId: it.seccion_mise,
                cantidad: it.cantidad_ops ?? 1,
                unidad: it.unidad_ops ?? 'u',
                recipienteNombre: it.recipiente_nombre ?? null,
                pesoPorcion: it.peso_porcion ?? null,
                pesoPorcionUnidad: it.peso_porcion_unidad ?? null,
              })
            }
          }
        }
        setToast('Plato creado')
        setComposing(null)
        setView('list')
        return
      }
      // Menú / Evento
      const preps = payload.secciones.flatMap(s => s.items.map(it => ({
        paso: s.nombre,
        tipo: it.tipo,
        ref_id: it.ref_id,
        nombre: it.nombre,
        prioridad: it.prioridad,
        plaza: it.plaza,
        seccion_mise: it.seccion_mise,
        usuario_asignado: it.usuario_asignado,
        cantidad: it.cantidad,
        unidad: it.unidad,
      })))
      const data = {
        nombre: payload.nombre,
        tipo: (payload.tipo === 'evento' ? 'evento' : 'fijo') as 'fijo' | 'evento',
        descripcion: payload.descripcion,
      }
      if (composing?.menuEditId) {
        await actualizarMenu(composing.menuEditId, data, preps)
      } else {
        const newId = await crearMenu(data, preps)
        if (!newId) throw new Error('No se pudo crear el menú (sin restaurante activo)')
      }
      setToast(payload.tipo === 'evento' ? 'Evento guardado' : 'Menú guardado')
      setComposing(null)
    } catch (e) {
      console.error('[Carta] handleComposicionSave error:', e)
      setToast('Error al guardar: ' + (e instanceof Error ? e.message : 'desconocido'))
    }
  }

  // Mapear un menú existente al formato del editor unificado
  const menuToInicial = (menu: MenuConPreparaciones): CompInicial => {
    const secOrden: string[] = []
    for (const p of menu.preparaciones) if (!secOrden.includes(p.paso)) secOrden.push(p.paso)
    return {
      modo: menu.tipo === 'evento' ? 'evento' : 'menu',
      nombre: menu.nombre,
      descripcion: menu.descripcion,
      precio: 0,
      categoria: '',
      tags: [],
      secciones: secOrden.map(sec => ({
        nombre: sec,
        items: menu.preparaciones.filter(p => p.paso === sec).map(p => ({
          tipo: p.tipo,
          ref_id: p.ref_id,
          nombre: p.nombre,
          prioridad: p.prioridad,
          plaza: p.plaza,
          seccion_mise: p.seccion_mise,
          usuario_asignado: p.usuario_asignado,
          cantidad: p.cantidad,
          unidad: p.unidad,
        })),
      })),
    }
  }

  const handleCrear = async (form: FormPlato) => {
    const newId = await crearItem({
      nombre: form.nombre.trim(),
      descripcion: form.descripcion || null,
      precio_venta: parseFloat(form.precio_venta),
      categoria: form.categoria,
      receta_id: null,
      foto_url: form.foto_url || null,
    })
    for (const pr of form.pendingRecetas) {
      await agregarPlatoReceta(newId, pr.recetaId, pr.porciones)
    }
    setToast('Plato creado')
    setView('list')
  }

  const handleEditar = async (form: FormPlato) => {
    if (!selectedItemId) return
    await actualizarItem(selectedItemId, {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion || null,
      precio_venta: parseFloat(form.precio_venta),
      categoria: form.categoria,
      receta_id: form.receta_id || null,
      foto_url: form.foto_url || null,
    })
    setToast('Plato actualizado')
    setView('detail')
  }

  const handleEliminar = async () => {
    if (!selectedItemId) return
    if (!confirm('Eliminar este plato de la carta?')) return
    await eliminarItem(selectedItemId)
    setToast('Plato eliminado')
    setView('list')
  }

  const handleVincular = async (recetaId: string) => {
    if (!selectedItemId) return
    await actualizarItem(selectedItemId, { receta_id: recetaId })
    setToast('Receta vinculada')
  }

  const handleAgregarReceta = async (recetaId: string, porciones: number) => {
    if (!selectedItemId) return
    await agregarPlatoReceta(selectedItemId, recetaId, porciones)
    setToast('Receta agregada al plato')
  }

  const handleActualizarReceta = async (platoRecetaId: string, porciones: number) => {
    await actualizarPlatoReceta(platoRecetaId, porciones)
  }

  const handleEliminarReceta = async (platoRecetaId: string) => {
    await eliminarPlatoReceta(platoRecetaId)
    setToast('Receta desvinculada')
  }

  const handleAgregarPackaging = async (productoId: string, cantidad: number) => {
    if (!selectedItemId) return
    await agregarPlatoPackaging(selectedItemId, productoId, cantidad)
    setToast('Packaging agregado')
  }

  const handleEliminarPackaging = async (packagingId: string) => {
    await eliminarPlatoPackaging(packagingId)
    setToast('Packaging eliminado')
  }

  const handleDuplicarPlato = async () => {
    if (!selectedItemId) return
    const newId = await duplicarItem(selectedItemId)
    setSelectedItemId(newId)
    setToast('Plato duplicado')
  }

  const handleAplicarGrupo = async (grupoId: string, platoIds: string[]) => {
    await aplicarGrupoAPlatos(grupoId, platoIds)
  }

  // ── Rentabilidad ──
  if (view === 'rentabilidad') {
    return (
      <>
        <RentabilidadView
          items={items}
          ventas={ventas}
          onBack={() => setView('list')}
          isAdmin={isAdmin}
          actualizarItem={actualizarItem}
          onOpenPlato={(pid) => { setSelectedItemId(pid); setView('detail') }}
          showToast={setToast}
        />
        {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      </>
    )
  }

  // ── Editor unificado (Plato / Menú / Evento) ──
  if (composing) {
    return (
      <>
        <ComposicionEditor
          inicial={composing.inicial}
          recetas={recetas.map(r => ({ id: r.id, nombre: r.nombre, costo: r.food_cost.costo_porcion }))}
          productos={productos.map(p => ({ id: p.id, nombre: p.nombre, costo: p.precio_unitario }))}
          cartaItems={items.map(i => ({ id: i.id, nombre: i.nombre, costo: i.costo_porcion ?? 0 }))}
          categoriasCarta={categorias.length > 0 ? categorias.map(c => c.nombre) : CATEGORIAS}
          onSave={handleComposicionSave}
          onCancel={() => setComposing(null)}
        />
        {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      </>
    )
  }

  // ── Menús ──
  if (view === 'menus') {
    return (
      <>
        <MenusView
          onBack={() => setView('list')}
          onNuevo={() => setComposing({ inicial: { modo: 'menu', nombre: '', descripcion: null, precio: 0, categoria: '', tags: [], secciones: [] } })}
          onEditar={(menu) => setComposing({ inicial: menuToInicial(menu), menuEditId: menu.id })}
          onToast={setToast}
        />
        {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      </>
    )
  }

  // ── Detail ──
  if (view === 'detail' && selectedItem) {
    return (
      <>
        <DetailView
          item={selectedItem}
          recetas={recetas}
          productos={productos}
          onBack={() => setView('list')}
          onEdit={() => setView('edit')}
          onDuplicar={handleDuplicarPlato}
          onVincular={handleVincular}
          onAgregarReceta={handleAgregarReceta}
          onActualizarReceta={handleActualizarReceta}
          onEliminarReceta={handleEliminarReceta}
          onAgregarPackaging={handleAgregarPackaging}
          onEliminarPackaging={handleEliminarPackaging}
          onShowGrupos={() => setShowGrupos(true)}
          onActualizarTags={tags => actualizarTags(selectedItem.id, tags)}
          restauranteId={RESTAURANTE_ID}
        />
        {showGrupos && (
          <PackagingGruposDrawer
            grupos={grupos}
            productos={productos}
            platoActual={selectedItem}
            todosLosPlatos={items}
            onCrearGrupo={crearGrupo}
            onEliminarGrupo={eliminarGrupo}
            onAplicarGrupo={handleAplicarGrupo}
            onClose={() => setShowGrupos(false)}
            onAfterApply={async () => { await fetchItems(); setShowGrupos(false); setToast('Grupo aplicado') }}
          />
        )}
        {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      </>
    )
  }

  // ── Edit ──
  if (view === 'edit' && selectedItem) {
    return (
      <>
        <FormView
          initialData={selectedItem}
          recetas={recetas}
          categorias={categorias}
          onSave={handleEditar}
          onDelete={handleEliminar}
          onCancel={() => setView('detail')}
        />
        {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      </>
    )
  }

  // ── Nuevo ──
  if (view === 'nuevo') {
    return (
      <>
        <FormView
          recetas={recetas}
          categorias={categorias}
          onSave={handleCrear}
          onCancel={() => setView('list')}
        />
        {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      </>
    )
  }

  // ── List ──
  return (
    <PageTransition>
    <div className="scroll-body">
      {/* Header */}
      <div data-coach-target="carta-header" style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 20 }}>Carta</span>
          {canEdit && (
            <button data-coach-target="carta-nuevo" onClick={() => setComposing({})} style={{
              background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,.3)',
              borderRadius: 10, padding: '7px 14px', color: '#fff',
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
              Nuevo
            </button>
          )}
        </div>
        {/* Navegación primaria — Platos | Menús (segmentado, mismo peso visual) */}
        <div style={{
          display: 'flex', gap: 4, background: 'rgba(255,255,255,0.1)',
          borderRadius: 13, padding: 4,
        }}>
          <button onClick={() => setView('list')} style={{
            flex: 1, border: 'none', borderRadius: 10, padding: '9px 0', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            background: '#fff', color: 'var(--navy)',
            boxShadow: '0 1px 3px rgba(0,0,0,.15)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>restaurant_menu</span>
            Platos
          </button>
          <button data-coach-target="carta-menus" onClick={() => setView('menus')} style={{
            flex: 1, border: 'none', borderRadius: 10, padding: '9px 0', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            background: 'transparent', color: 'rgba(255,255,255,0.75)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>menu_book</span>
            Menús
          </button>
        </div>

        {/* Utilidades — secundarias, discretas */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', marginTop: 8 }}>
          <button data-coach-target="carta-importar" onClick={() => setShowImport(true)} style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,.15)',
            borderRadius: 18, padding: '4px 11px', color: 'rgba(255,255,255,0.85)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>upload_file</span>
            Importar
          </button>
          <button onClick={() => exportCartaPDF(items)} style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,.15)',
            borderRadius: 18, padding: '4px 11px', color: 'rgba(255,255,255,0.85)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>picture_as_pdf</span>
            PDF
          </button>
          <button onClick={exportXLSX} style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,.15)',
            borderRadius: 18, padding: '4px 11px', color: 'rgba(255,255,255,0.85)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>table_view</span>
            Excel
          </button>
        </div>

        {/* Stats row */}
        {items.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
              {stats.total} platos
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
              {stats.disponibles} disponibles
            </span>
            {stats.noDisponibles > 0 && (
              <span style={{ fontSize: 11, color: '#fca5a5' }}>
                {stats.noDisponibles} 86&apos;d
              </span>
            )}
          </div>
        )}

        {/* Filters */}
        <div data-coach-target="carta-filtros" style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
          {(['Todas', ...categorias.map(c => c.nombre)]).map(cat => {
            const catObj = categorias.find(c => c.nombre === cat)
            return (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                style={{
                  padding: '5px 12px', borderRadius: 20, border: 'none',
                  background: filter === cat ? '#fff' : 'rgba(255,255,255,0.12)',
                  color: filter === cat ? 'var(--navy)' : 'rgba(255,255,255,0.8)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {catObj && (
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                    {catObj.icono || 'restaurant'}
                  </span>
                )}
                {cat}
              </button>
            )
          })}
        </div>
      </div>

      {/* Rentabilidad shortcut */}
      {items.some(i => i.food_cost_pct != null) && (
        <div style={{ padding: '12px 16px 0' }}>
          <button data-coach-target="carta-rentabilidad" onClick={() => setView('rentabilidad')} style={{
            width: '100%', padding: '10px 14px', borderRadius: 10,
            background: '#eef2ff', border: '1px solid var(--accent)',
            display: 'flex', alignItems: 'center', gap: 8,
            cursor: 'pointer', color: '#4338ca',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>analytics</span>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Ver rentabilidad</div>
              <div style={{ fontSize: 11, color: 'var(--accent)' }}>
                Platos ordenados por food cost %
              </div>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
          </button>
        </div>
      )}

      {/* Content — en desktop: grid lista + panel detalle */}
      <div style={isDesktop && selectedItem ? { display: 'grid', gridTemplateColumns: '1fr 380px', gap: 0, alignItems: 'start', minHeight: 0 } : undefined}>
        {/* Lista de platos */}
        <div data-coach-target="carta-lista" style={{ padding: 16, display: 'grid', gridTemplateColumns: isDesktop && !selectedItem ? 'repeat(2, 1fr)' : isDesktop ? '1fr' : '1fr', gap: 10 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13, gridColumn: '1/-1' }}>
              Cargando...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, gridColumn: '1/-1' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--text-3)' }}>receipt_long</span>
              <p style={{ color: 'var(--text-3)', fontSize: 13 }}>
                {filter === 'Todas' ? 'No hay platos en la carta' : `No hay platos en ${filter}`}
              </p>
              <button onClick={() => setComposing({})} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--navy)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', marginTop: 4 }}>
                Agregar primer plato
              </button>
            </div>
          ) : (
            filtered.map(item => (
              <div key={item.id} style={isDesktop && selectedItemId === item.id ? { outline: '2px solid var(--accent)', borderRadius: 14 } : undefined}>
                <PlatoCard
                  item={item}
                  onClick={() => handleCardClick(item)}
                  onToggle={() => toggleDisponible(item.id, !item.disponible)}
                  isAdmin={isAdmin}
                />
              </div>
            ))
          )}
        </div>

        {/* Panel de detalle — solo desktop, cuando hay item seleccionado */}
        {isDesktop && selectedItem && (
          <div style={{
            borderLeft: '1px solid var(--border)',
            position: 'sticky', top: 0,
            maxHeight: 'calc(100dvh - 0px)', overflowY: 'auto',
            background: 'var(--surface)',
          }}>
            {/* Header del panel */}
            <div style={{ background: 'var(--navy)', padding: '16px 16px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedItem.nombre}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {canEdit && (
                  <button onClick={() => setView('edit')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '6px 10px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>edit</span>
                    Editar
                  </button>
                )}
                <button onClick={() => setSelectedItemId(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: '6px 8px', color: '#fff', cursor: 'pointer' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                </button>
              </div>
            </div>
            {/* Contenido del panel */}
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Precio + FC */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {isAdmin && (
                  <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 14px', flex: '1 1 120px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 3 }}>Precio venta</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy)' }}>${selectedItem.precio_venta.toLocaleString('es-AR')}</div>
                  </div>
                )}
                {isAdmin && selectedItem.food_cost_pct != null && (
                  <div style={{ background: fcBadge(selectedItem.food_cost_pct).bg, borderRadius: 10, padding: '10px 14px', flex: '1 1 100px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 3 }}>Food Cost</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: fcBadge(selectedItem.food_cost_pct).text }}>{selectedItem.food_cost_pct.toFixed(1)}%</div>
                  </div>
                )}
              </div>
              {/* Descripción */}
              {selectedItem.descripcion && (
                <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>{selectedItem.descripcion}</p>
              )}
              {/* Categoría + Tags */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, background: 'var(--bg)', color: 'var(--text-3)', padding: '3px 10px', borderRadius: 20 }}>{selectedItem.categoria}</span>
                {(selectedItem.tags ?? []).map(tag => (
                  <span key={tag} style={{ fontSize: 11, background: '#eef2ff', color: 'var(--accent)', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>{tag}</span>
                ))}
              </div>
              {/* Estado */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: selectedItem.disponible ? '#16a34a' : '#dc2626' }} />
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{selectedItem.disponible ? 'Disponible' : 'No disponible (86\'d)'}</span>
                <button onClick={() => toggleDisponible(selectedItem.id, !selectedItem.disponible)} style={{ marginLeft: 'auto', fontSize: 11, background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', color: 'var(--text-2)' }}>
                  Cambiar
                </button>
              </div>
              {/* Recetas vinculadas */}
              {(selectedItem.plato_recetas.length > 0 || selectedItem.receta) && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>Recetas</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selectedItem.plato_recetas.map(pr => (
                      <div key={pr.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', borderRadius: 8, padding: '8px 10px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--accent)', flexShrink: 0 }}>menu_book</span>
                        <span style={{ fontSize: 13, color: 'var(--text-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pr.receta?.nombre ?? '—'}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>{pr.porciones} porc.</span>
                      </div>
                    ))}
                    {selectedItem.receta && selectedItem.plato_recetas.length === 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', borderRadius: 8, padding: '8px 10px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--accent)' }}>menu_book</span>
                        <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{selectedItem.receta.nombre}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* Botón ver detalle completo */}
              <button onClick={() => setView('detail')} style={{ width: '100%', padding: '10px', borderRadius: 10, background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 17 }}>open_in_full</span>
                Ver y gestionar completo
              </button>
            </div>
          </div>
        )}
      </div>

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}

      {showImport && RESTAURANTE_ID && (
        <ImportCartaModal
          categorias={categorias}
          restauranteId={RESTAURANTE_ID}
          recetas={recetas}
          productos={productos}
          onClose={() => setShowImport(false)}
          onDone={msg => { setToast(msg); fetchItems() }}
        />
      )}
    </div>
    </PageTransition>
  )
}
