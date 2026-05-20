'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { MOTIVOS_MERMA } from '@/types'
import type { MotivoMerma } from '@/types'

interface MermaBottomSheetProps {
  open: boolean
  onClose: () => void
  onRegistrar: (data: {
    producto_nombre: string
    producto_id?: string | null
    cantidad: number
    unidad: string
    motivo: MotivoMerma
    motivo_detalle?: string
    costo_estimado?: number
  }) => Promise<void>
  prefill?: {
    producto_nombre?: string
    producto_id?: string
    unidad?: string
    motivo?: MotivoMerma
  }
}

export default function MermaBottomSheet({ open, onClose, onRegistrar, prefill }: MermaBottomSheetProps) {
  const RESTAURANTE_ID = useRestauranteId()
  const [supabase] = useState(() => createClient())
  const [productos, setProductos] = useState<{ id: string; nombre: string; unidad: string; precio_unitario: number }[]>([])
  const [busqueda, setBusqueda] = useState(prefill?.producto_nombre ?? '')
  const [productoId, setProductoId] = useState<string | null>(prefill?.producto_id ?? null)
  const [cantidad, setCantidad] = useState('')
  const [unidad, setUnidad] = useState(prefill?.unidad ?? 'u')
  const [motivo, setMotivo] = useState<MotivoMerma | null>(prefill?.motivo ?? null)
  const [detalle, setDetalle] = useState('')
  const [saving, setSaving] = useState(false)
  const [showSearch, setShowSearch] = useState(!prefill?.producto_nombre)

  // Load productos for search
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    supabase
      .from('productos')
      .select('id, nombre, unidad, precio_unitario')
      .eq('restaurante_id', RESTAURANTE_ID)
      .order('nombre')
      .then(({ data }) => setProductos(data ?? []))
  }, [RESTAURANTE_ID, supabase])

  // Reset on prefill change
  useEffect(() => {
    if (open) {
      setBusqueda(prefill?.producto_nombre ?? '')
      setProductoId(prefill?.producto_id ?? null)
      setUnidad(prefill?.unidad ?? 'u')
      setMotivo(prefill?.motivo ?? null)
      setCantidad('')
      setDetalle('')
      setShowSearch(!prefill?.producto_nombre)
    }
  }, [open, prefill])

  const filtered = busqueda.length >= 1
    ? productos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase())).slice(0, 6)
    : []

  function selectProducto(p: { id: string; nombre: string; unidad: string }) {
    setBusqueda(p.nombre)
    setProductoId(p.id)
    setUnidad(p.unidad || 'u')
    setShowSearch(false)
  }

  async function handleSubmit() {
    if (!busqueda.trim() || !cantidad || !motivo) return
    setSaving(true)
    try {
      const prod = productos.find(p => p.id === productoId)
      const costoEstimado = prod ? prod.precio_unitario * parseFloat(cantidad) : 0
      await onRegistrar({
        producto_nombre: busqueda.trim(),
        producto_id: productoId,
        cantidad: parseFloat(cantidad),
        unidad,
        motivo,
        motivo_detalle: detalle.trim() || undefined,
        costo_estimado: costoEstimado,
      })
      onClose()
    } catch (e: any) {
      alert('Error: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-[300]" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-[301] rounded-t-[20px] max-h-[85vh] overflow-y-auto"
        style={{ background: 'var(--surface)' }}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 sticky top-0" style={{ background: 'var(--surface)' }}>
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
        </div>

        <div className="px-4 pb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold" style={{ color: 'var(--navy)' }}>Registrar merma</h3>
            <button onClick={onClose} className="bg-transparent border-none cursor-pointer p-1">
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-3)' }}>close</span>
            </button>
          </div>

          {/* Producto */}
          <div className="mb-3">
            <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Producto</label>
            <input
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setShowSearch(true); setProductoId(null) }}
              placeholder="Buscar producto..."
              className="w-full mt-1 rounded-xl px-3 py-2 text-sm"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            />
            {showSearch && filtered.length > 0 && (
              <div className="mt-1 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                {filtered.map(p => (
                  <button key={p.id} onClick={() => selectProducto(p)}
                    className="w-full text-left px-3 py-2 text-xs border-none cursor-pointer"
                    style={{ background: 'var(--surface)', color: 'var(--text-1)', borderBottom: '1px solid var(--border)' }}>
                    {p.nombre} <span style={{ color: 'var(--text-3)' }}>· {p.unidad}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cantidad + Unidad */}
          <div className="flex gap-2 mb-3">
            <div className="flex-1">
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Cantidad</label>
              <input
                type="number"
                inputMode="decimal"
                value={cantidad}
                onChange={e => setCantidad(e.target.value)}
                placeholder="0"
                className="w-full mt-1 rounded-xl px-3 py-2 text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
              />
            </div>
            <div className="w-20">
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Unidad</label>
              <select value={unidad} onChange={e => setUnidad(e.target.value)}
                className="w-full mt-1 rounded-xl px-2 py-2 text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }}>
                <option value="u">u</option>
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="l">l</option>
                <option value="ml">ml</option>
              </select>
            </div>
          </div>

          {/* Motivo */}
          <div className="mb-3">
            <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Motivo</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {MOTIVOS_MERMA.map(m => (
                <button key={m.value} onClick={() => setMotivo(m.value)}
                  className="flex items-center gap-1 px-2 py-[6px] rounded-full text-[11px] font-semibold cursor-pointer transition-all"
                  style={{
                    background: motivo === m.value ? m.color : 'var(--bg)',
                    color: motivo === m.value ? '#fff' : 'var(--text-2)',
                    border: `1px solid ${motivo === m.value ? m.color : 'var(--border)'}`,
                  }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Detalle */}
          <div className="mb-4">
            <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Detalle (opcional)</label>
            <input
              value={detalle}
              onChange={e => setDetalle(e.target.value)}
              placeholder="Ej: Se quemó en la plancha"
              className="w-full mt-1 rounded-xl px-3 py-2 text-sm"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={saving || !busqueda.trim() || !cantidad || !motivo}
            className="w-full py-3 rounded-xl text-sm font-bold text-white cursor-pointer border-none"
            style={{ background: '#ef4444', opacity: (saving || !busqueda.trim() || !cantidad || !motivo) ? 0.5 : 1 }}>
            {saving ? 'Registrando...' : `Registrar merma${cantidad ? `: ${cantidad}${unidad} ${busqueda}` : ''}`}
          </button>
        </div>
      </div>
    </>
  )
}
