'use client'

// ════════════════════════════════════════════════════════════
// RECETA EDIT SHEET — editor de ingredientes de una receta, en un panel
// centrado con fondo translúcido, sin salir de la pantalla que lo abrió
// (Carta hoy; cualquier lugar que ya muestre el ícono de "ver receta").
// Antes ese ícono no llevaba a ningún lado (o, en el mejor caso, solo
// mostraba un preview de solo lectura) — quien está armando un plato tenía
// que navegar a Recetario para corregir una cantidad y volver. Reusa
// CargaRapidaIngredientes (mismo componente que Recetario → Ideas) y el modo
// "enrich" de /api/recetas/save (reemplaza todos los ingredientes de la
// receta — ya usado por el import IA).
// ════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSheetOpen } from '@/lib/ui/chrome'
import type { RecetaConCosto } from '@/lib/hooks/useRecetas'
import {
  CargaRapidaIngredientes, TotalesRapidosBar, filasToIngredientesData,
  nuevaFilaRapida, type FilaIngredienteRapido,
} from './CargaRapidaIngredientes'

interface StockItem { id: string; nombre: string; unidad: string; precio_unitario: number }

export function RecetaEditSheet({
  recetaId, recetaNombre, stockProductos, recetasDisponibles, onClose, onSaved,
}: {
  recetaId: string
  recetaNombre: string
  stockProductos: StockItem[]
  recetasDisponibles: RecetaConCosto[]
  onClose: () => void
  onSaved: () => void
}) {
  useSheetOpen()
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filas, setFilas] = useState<FilaIngredienteRapido[]>([])
  const [porciones, setPorciones] = useState(1)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancel = false
    Promise.all([
      supabase.from('ingredientes').select('*').eq('receta_id', recetaId).order('created_at'),
      supabase.from('recetas').select('porciones').eq('id', recetaId).maybeSingle(),
    ]).then(([{ data: ings, error: ingErr }, { data: rec }]) => {
      if (cancel) return
      if (ingErr) { setError(ingErr.message); setLoading(false); return }
      const rows = (ings ?? []).map(i => ({
        id: nuevaFilaRapida().id,
        tipo: (i.tipo === 'subreceta' ? 'subreceta' : 'producto') as 'producto' | 'subreceta',
        nombre: i.nombre as string,
        cantidad: String(i.cantidad ?? '').replace('.', ','),
        unidad: (i.unidad_costo ?? i.unidad ?? 'kg') as string,
        costoUnitario: (i.costo_unitario as number) ?? 0,
        subrecetaId: i.subreceta_id as string | null,
      }))
      setFilas(rows.length > 0 ? rows : [nuevaFilaRapida()])
      setPorciones((rec?.porciones as number) || 1)
      setLoading(false)
    })
    return () => { cancel = true }
  }, [recetaId, supabase])

  async function handleGuardar() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/recetas/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrichRecetaId: recetaId, ingredientes: filasToIngredientesData(filas) }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al guardar')
      await onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, maxWidth: 480, width: '100%', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 32px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--accent)', fontSize: 20 }}>menu_book</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recetaNombre}</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Ingredientes de la receta</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 2 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 28, color: 'var(--text-3)', fontSize: 13 }}>Cargando…</div>
          ) : (
            <>
              <TotalesRapidosBar filas={filas} porciones={porciones} />
              <CargaRapidaIngredientes
                filas={filas}
                onChange={setFilas}
                stockProductos={stockProductos}
                recetasDisponibles={recetasDisponibles}
              />
            </>
          )}
        </div>

        <div style={{ padding: '10px 16px', paddingBottom: 'max(env(safe-area-inset-bottom),10px)', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {error && (
            <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>Error al guardar: {error}</div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} disabled={saving} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-2)', fontSize: 12, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit' }}>
              Cancelar
            </button>
            <button onClick={handleGuardar} disabled={saving || loading} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: 'var(--navy)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? .7 : 1 }}>
              {saving ? 'Guardando…' : 'Guardar receta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
