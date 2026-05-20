'use client'

import PageTransition from '@/components/PageTransition'
import { useState, useMemo, useEffect } from 'react'
import { useCarta, type CategoriaCartaItem, type CartaItemEnriquecido } from '@/lib/hooks/useCarta'
import { useRecetas, type RecetaConCosto } from '@/lib/hooks/useRecetas'
import { useStock, type ProductoConEstado } from '@/lib/hooks/useStock'
import { usePackagingGrupos, type PackagingGrupo } from '@/lib/hooks/usePackagingGrupos'
import { exportarExcel, fechaArchivo } from '@/lib/exportar'
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
async function exportRentabilidadPDF(items: CartaItemEnriquecido[]) {
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
    head: [['Plato', 'Precio', 'Costo', 'FC%', 'Margen']],
    body: conReceta.map(it => [
      it.nombre,
      fmtMoney(it.precio_venta),
      fmtMoney(it.costo_porcion ?? 0),
      `${(it.food_cost_pct ?? 0).toFixed(1)}%`,
      fmtMoney(it.margen_bruto ?? 0),
    ]),
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
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
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
}: {
  item: CartaItemEnriquecido
  onClick: () => void
  onToggle: () => void
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
          <div style={{
            fontSize: 18, fontWeight: 700, color: 'var(--navy)',
            whiteSpace: 'nowrap', paddingTop: 1,
          }}>
            {fmtMoney(item.precio_venta)}
          </div>
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
          {hasMrg && (
            <span style={{
              fontSize: 11, fontWeight: 700,
              background: mrg.bg, color: mrg.text,
              padding: '2px 8px', borderRadius: 6,
            }}>
              Mrg {(item.margen_pct_computed ?? 0).toFixed(1)}%
            </span>
          )}
          {!hasMrg && hasFc && (
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
  pendingRecetas: Array<{ recetaId: string; porciones: number }>
}

const FORM_EMPTY: FormPlato = {
  nombre: '', descripcion: '', precio_venta: '',
  categoria: 'Principales', receta_id: '',
  pendingRecetas: [],
}

function FormView({
  initialData,
  recetas,
  onSave,
  onDelete,
  onCancel,
}: {
  initialData?: CartaItemEnriquecido | null
  recetas: RecetaConCosto[]
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
      <div style={{ background: 'var(--navy)', padding: '46px 16px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>
          {initialData ? 'Editar plato' : 'Nuevo plato'}
        </span>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
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
            {CATEGORIAS.map(cat => (
              <button
                key={cat}
                onClick={() => setForm(prev => ({ ...prev, categoria: cat }))}
                style={{
                  padding: '7px 14px', borderRadius: 20, border: 'none',
                  background: form.categoria === cat ? 'var(--navy)' : 'var(--bg)',
                  color: form.categoria === cat ? '#fff' : 'var(--text-2)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {CAT_ICONS[cat]}
                </span>
                {cat}
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
        position: 'fixed', bottom: 82, left: 0, right: 0,
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
      <div style={{ background: 'var(--navy)', padding: '46px 16px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
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
}) {
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [vinculando, setVinculando] = useState(false)
  const [pendingReceta, setPendingReceta] = useState<RecetaConCosto | null>(null)
  const [porciones, setPorciones] = useState('1')

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
      setShowSearch(false)
    } finally { setVinculando(false) }
  }

  const linkedReceta = item.receta_id ? recetas.find(r => r.id === item.receta_id) : null
  const hasFc = item.food_cost_pct != null && item.food_cost_pct > 0
  const hasMrg = item.margen_pct_computed != null

  return (
    <div>
      <div style={{ background: 'var(--navy)', padding: '46px 16px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
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

          {/* Donut chart — sólo si hay datos de costo */}
          {item.precio_venta > 0 && item.costo_porcion != null && item.costo_porcion > 0 && (() => {
            const precio = item.precio_venta
            const costoRecetas = item.costo_total_plato
              ?? (item.costo_porcion != null ? item.costo_porcion - item.costo_packaging : 0)
            const costoPkg = item.costo_packaging
            const pctRecetas = Math.round((costoRecetas / precio) * 100)
            const pctPkg = Math.round((costoPkg / precio) * 100)
            const pctMargen = Math.max(0, 100 - pctRecetas - pctPkg)

            const segs = [
              { pct: pctRecetas, color: '#4361a0', label: 'Recetas' },
              { pct: pctPkg, color: '#ea580c', label: 'Packaging' },
              { pct: pctMargen, color: '#10b981', label: 'Margen' },
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
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-2)', lineHeight: 1 }}>
                      FC{'\n'}{(item.food_cost_pct ?? 0).toFixed(0)}%
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
            <button
              onClick={() => { setSearch(''); setPendingReceta(null); setShowSearch(s => !s) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, border: 'none',
                cursor: 'pointer', padding: '4px 8px', borderRadius: 8,
                background: 'rgba(67,97,160,.1)', color: 'var(--accent)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
              <span style={{ fontSize: 11, fontWeight: 700 }}>Vincular</span>
            </button>
          </div>

          {/* Plato_recetas list */}
          {item.plato_recetas.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
              {item.plato_recetas.map((pr, idx) => (
                <div key={pr.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                  borderBottom: idx < item.plato_recetas.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)', flexShrink: 0 }}>menu_book</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pr.receta?.nombre ?? pr.receta_id}
                    </div>
                    {pr.costo_calculado > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtMoney(pr.costo_calculado)}</div>
                    )}
                  </div>
                  {/* Stepper porciones */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                    <button
                      onClick={() => { if (pr.porciones > 0.5) onActualizarReceta(pr.id, Math.round((pr.porciones - 0.5) * 10) / 10) }}
                      disabled={pr.porciones <= 0.5}
                      style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: pr.porciones > 0.5 ? 'pointer' : 'default', color: pr.porciones > 0.5 ? 'var(--text-1)' : 'var(--border)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}
                    >−</button>
                    <span style={{ minWidth: 28, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--text-1)', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', padding: '0 4px', lineHeight: '28px' }}>
                      {pr.porciones % 1 === 0 ? pr.porciones : pr.porciones.toFixed(1)}
                    </span>
                    <button
                      onClick={() => onActualizarReceta(pr.id, Math.round((pr.porciones + 0.5) * 10) / 10)}
                      style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}
                    >+</button>
                  </div>
                  <button
                    onClick={() => onEliminarReceta(pr.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-3)', flexShrink: 0 }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                  </button>
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

          {/* Add recipe search */}
          {showSearch && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
              {pendingReceta ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>menu_book</span>
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1, color: 'var(--text-1)' }}>{pendingReceta.nombre}</span>
                    <button onClick={() => setPendingReceta(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700, flexShrink: 0 }}>Porciones:</label>
                    <input
                      type="number" min="0.1" step="0.5"
                      value={porciones}
                      onChange={e => setPorciones(e.target.value)}
                      style={{ width: 64, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)', background: 'var(--bg)' }}
                    />
                    <button
                      onClick={handleAgregarReceta}
                      disabled={vinculando}
                      style={{ flex: 1, background: 'var(--navy)', border: 'none', borderRadius: 8, padding: '8px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', opacity: vinculando ? .6 : 1 }}
                    >
                      {vinculando ? 'Guardando…' : 'Agregar'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    autoFocus
                    placeholder="Buscar receta para vincular..."
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: 10,
                      border: '1px solid var(--border)', background: 'var(--bg)',
                      fontSize: 13, color: 'var(--text-1)',
                    }}
                  />
                  {filtradas.length > 0 && (
                    <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 4, border: '1px solid var(--border)', borderRadius: 10 }}>
                      {filtradas.map(r => (
                        <button
                          key={r.id}
                          onClick={() => { setPendingReceta(r); setPorciones('1') }}
                          style={{
                            display: 'block', width: '100%', padding: '10px 12px',
                            textAlign: 'left', border: 'none', background: 'none',
                            fontSize: 13, color: 'var(--text-1)', cursor: 'pointer',
                            borderBottom: '1px solid var(--border)', fontFamily: 'inherit',
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{r.nombre}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            {r.categoria} · Costo: {fmtMoney(r.food_cost.costo_porcion)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Legacy vincular (fallback for items with no plato_recetas and no receta_id) */}
          {item.plato_recetas.length === 0 && !linkedReceta && !showSearch && (
            <button
              onClick={() => { setSearch(''); setShowSearch(true) }}
              style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1px dashed var(--border)', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-3)', fontFamily: 'inherit' }}
            >
              + Vincular receta para calcular costos
            </button>
          )}
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
function RentabilidadView({
  items,
  onBack,
}: {
  items: CartaItemEnriquecido[]
  onBack: () => void
}) {
  const sorted = useMemo(() =>
    items
      .filter(i => i.food_cost_pct != null)
      .sort((a, b) => (a.food_cost_pct ?? 0) - (b.food_cost_pct ?? 0))
  , [items])

  return (
    <div>
      <div style={{ background: 'var(--navy)', padding: '46px 16px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>Rentabilidad</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => exportRentabilidadPDF(items)} style={{
          background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
          padding: '6px 12px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>picture_as_pdf</span>
          PDF
        </button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
            Vincula recetas a los platos para ver rentabilidad
          </div>
        ) : (
          sorted.map((item, i) => {
            const fc = fcBadge(item.food_cost_pct ?? 0)
            return (
              <div key={item.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '12px 14px',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: fc.bg, color: fc.text,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{item.nombre}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', gap: 8 }}>
                    <span>Venta: {fmtMoney(item.precio_venta)}</span>
                    <span>Costo: {fmtMoney(item.costo_porcion ?? 0)}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: 14, fontWeight: 700, color: fc.text,
                  }}>
                    {(item.food_cost_pct ?? 0).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
                    {fmtMoney(item.margen_bruto ?? 0)}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── MAIN PAGE ───────────────────────────────────────────
type View = 'list' | 'nuevo' | 'detail' | 'edit' | 'rentabilidad'

export default function CartaPage() {
  const { items, loading, fetchItems, crearItem, actualizarItem, toggleDisponible, eliminarItem, duplicarItem, agregarPlatoReceta, actualizarPlatoReceta, eliminarPlatoReceta, agregarPlatoPackaging, eliminarPlatoPackaging } = useCarta()
  const { recetas } = useRecetas()
  const { productos } = useStock()
  const { grupos, crearGrupo, eliminarGrupo, aplicarGrupoAPlatos } = usePackagingGrupos()

  const [view, setView] = useState<View>('list')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'Todas' | CategoriaCartaItem>('Todas')
  const [toast, setToast] = useState('')
  const [showGrupos, setShowGrupos] = useState(false)

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
    setView('detail')
  }

  const handleCrear = async (form: FormPlato) => {
    const newId = await crearItem({
      nombre: form.nombre.trim(),
      descripcion: form.descripcion || null,
      precio_venta: parseFloat(form.precio_venta),
      categoria: form.categoria,
      receta_id: null,
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
        <RentabilidadView items={items} onBack={() => setView('list')} />
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
      <div style={{ background: 'var(--navy)', padding: '46px 16px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 20 }}>Carta</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportXLSX} style={{
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,.25)',
              borderRadius: 10, padding: '8px 12px', color: '#fff',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 12, fontWeight: 600,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>table_view</span>
              Excel
            </button>
            <button onClick={() => exportCartaPDF(items)} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none',
              borderRadius: 10, padding: '8px 12px', color: '#fff',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 12, fontWeight: 600,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
              Exportar menú
            </button>
            <button onClick={() => setView('nuevo')} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none',
              borderRadius: 10, padding: '8px 14px', color: '#fff',
              fontWeight: 600, fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
              Nuevo
            </button>
          </div>
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
        <div style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
          {(['Todas', ...CATEGORIAS] as const).map(cat => (
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
              {cat !== 'Todas' && (
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  {CAT_ICONS[cat as CategoriaCartaItem]}
                </span>
              )}
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Rentabilidad shortcut */}
      {items.some(i => i.food_cost_pct != null) && (
        <div style={{ padding: '12px 16px 0' }}>
          <button onClick={() => setView('rentabilidad')} style={{
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

      {/* Content */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
            Cargando...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 40,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--text-3)' }}>
              receipt_long
            </span>
            <p style={{ color: 'var(--text-3)', fontSize: 13 }}>
              {filter === 'Todas' ? 'No hay platos en la carta' : `No hay platos en ${filter}`}
            </p>
            <button onClick={() => setView('nuevo')} style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: 'var(--navy)', color: '#fff', fontWeight: 600,
              fontSize: 13, cursor: 'pointer', marginTop: 4,
            }}>
              Agregar primer plato
            </button>
          </div>
        ) : (
          filtered.map(item => (
            <PlatoCard
              key={item.id}
              item={item}
              onClick={() => handleCardClick(item)}
              onToggle={() => toggleDisponible(item.id, !item.disponible)}
            />
          ))
        )}
      </div>

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
    </PageTransition>
  )
}
