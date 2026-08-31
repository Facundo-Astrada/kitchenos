'use client'

import { useState, useMemo } from 'react'
import type { CategoriaCartaItem, CartaCategoria, CartaItemEnriquecido } from '@/lib/hooks/useCarta'
import type { RecetaConCosto } from '@/lib/hooks/useRecetas'
import PhotoPicker from '@/components/ui/PhotoPicker'
import { fmtMoney, fcBadge } from './cards'

export interface FormPlato {
  nombre: string
  descripcion: string
  precio_venta: string
  categoria: CategoriaCartaItem
  receta_id: string
  foto_url: string
}

export function EditarPlato({
  initialData,
  recetas,
  categorias,
  onSave,
  onDelete,
  onCancel,
}: {
  initialData: CartaItemEnriquecido
  recetas: RecetaConCosto[]
  categorias: CartaCategoria[]
  onSave: (data: FormPlato) => Promise<void>
  onDelete?: () => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState<FormPlato>(() => ({
    nombre: initialData.nombre,
    descripcion: initialData.descripcion || '',
    precio_venta: String(initialData.precio_venta),
    categoria: initialData.categoria,
    receta_id: initialData.receta_id || '',
    foto_url: initialData.foto_url || '',
  }))
  const [recetaSearch, setRecetaSearch] = useState(
    initialData.receta ? initialData.receta.nombre : ''
  )
  const [showRecetas, setShowRecetas] = useState(false)
  const [saving, setSaving] = useState(false)

  const precioVenta = parseFloat(form.precio_venta) || 0

  const recetasFiltradas = useMemo(() => {
    if (!recetaSearch.trim()) return recetas.slice(0, 20)
    const q = recetaSearch.toLowerCase()
    return recetas.filter(r => r.nombre.toLowerCase().includes(q)).slice(0, 20)
  }, [recetas, recetaSearch])

  const selectedReceta = useMemo(() =>
    form.receta_id ? recetas.find(r => r.id === form.receta_id) : null
  , [recetas, form.receta_id])

  const fcPreview = useMemo(() => {
    if (!selectedReceta || precioVenta <= 0) return null
    const { food_cost } = selectedReceta
    const costo = food_cost.costo_porcion
    const pct = precioVenta > 0 ? (costo / precioVenta) * 100 : 0
    return { costo, pct, margen: precioVenta - costo }
  }, [selectedReceta, precioVenta])

  const selectReceta = (r: RecetaConCosto) => {
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
      await onSave(form)
    } finally { setSaving(false) }
  }

  return (
    <div style={{ paddingBottom: 100 }}>
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>
          Editar plato
        </span>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Foto */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <PhotoPicker
            currentUrl={form.foto_url || null}
            path={`carta/${initialData.id}`}
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

        {/* Vincular receta */}
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

        {/* Delete button */}
        {onDelete && (
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
            Guardar cambios
          </button>
        )}
      </div>
    </div>
  )
}
