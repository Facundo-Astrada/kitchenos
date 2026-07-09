'use client'

import { useState } from 'react'
import { useStock } from '@/lib/hooks/useStock'
import { EmptyState } from '@/components/ui'
import type { ChecklistSeccionConfig } from '@/types'

// Overlay de conteo para secciones tipo "almacén" — mismo patrón visual que
// el modo Stockear de /stock (header navy, zIndex 1000), pero acotado SOLO a
// los productos elegidos en `seccion.producto_ids`.
export default function StockearSeccionOverlay({ seccion, onClose }: {
  seccion: ChecklistSeccionConfig
  onClose: () => void
}) {
  const { productos, loading, actualizarStock } = useStock()
  const [valores, setValores] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const productosSeccion = productos.filter(p => (seccion.producto_ids ?? []).includes(p.id))

  async function handleGuardar() {
    setSaving(true)
    try {
      const cambios = Object.entries(valores).filter(([, v]) => v.trim() !== '')
      await Promise.all(cambios.map(([id, v]) => {
        const n = parseFloat(v.replace(',', '.'))
        return isNaN(n) ? Promise.resolve() : actualizarStock(id, n)
      }))
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--navy)', padding: '20px 16px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.7)', fontSize: 22 }}>close</span>
          </button>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Stockear {seccion.nombre}</div>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>{productosSeccion.length} productos</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {loading && <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Cargando productos…</p>}
        {!loading && productosSeccion.length === 0 && (
          <EmptyState
            icon="inventory_2"
            title="Sin productos asignados"
            subtitle="Editá esta sección desde el editor de secciones para sumarle productos del stock."
          />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {productosSeccion.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Actual: {p.stock_actual} {p.unidad_uso ?? p.unidad}</div>
              </div>
              <input
                type="number" inputMode="decimal"
                placeholder={String(p.stock_actual)}
                value={valores[p.id] ?? ''}
                onChange={e => setValores(v => ({ ...v, [p.id]: e.target.value }))}
                style={{ width: 84, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, fontWeight: 700, textAlign: 'center', fontFamily: "'DM Mono', monospace", outline: 'none', color: 'var(--text-1)' }}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: 16, paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', flexShrink: 0 }}>
        <button
          onClick={handleGuardar}
          disabled={saving || Object.values(valores).every(v => v.trim() === '')}
          style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: 'var(--navy)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
