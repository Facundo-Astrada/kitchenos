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
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSheetOpen } from '@/lib/ui/chrome'
import type { RecetaConCosto } from '@/lib/hooks/useRecetas'
import { fileToBase64, callRecetaImport, matchPorNombre, type RecetaIAResult } from '@/lib/recetas/iaImport'
import {
  CargaRapidaIngredientes, TotalesRapidosBar, filasToIngredientesData,
  nuevaFilaRapida, type FilaIngredienteRapido,
} from './CargaRapidaIngredientes'

interface StockItem { id: string; nombre: string; unidad: string; precio_unitario: number }

const iaMiniBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, flex: 1, padding: '7px 8px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-2)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }

// Convierte lo que devuelve la IA (foto/texto) en filas de
// CargaRapidaIngredientes, matcheando contra el stock ya cargado — mismo
// criterio que el import de un plato/menú nuevo (ver ComposicionEditor).
function iaIngredientesAFilas(ingredientes: RecetaIAResult['ingredientes'], stockProductos: StockItem[]): FilaIngredienteRapido[] {
  return ingredientes.filter(i => i.nombre?.trim()).map(i => {
    const match = matchPorNombre(i.nombre, stockProductos)
    return {
      ...nuevaFilaRapida(),
      nombre: i.nombre.trim(),
      cantidad: String(i.cantidad ?? '').replace('.', ','),
      unidad: match?.unidad || i.unidad || 'kg',
      costoUnitario: match?.precio_unitario ?? 0,
    }
  })
}

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

  // Cargar ingredientes con IA (foto/texto) — antes solo se podía tipear fila
  // por fila con "+ Agregar fila"; el mismo atajo que ya existe al crear una
  // receta nueva desde el buscador de Carta faltaba acá, para completar una
  // que ya existe pero llegó vacía (idea/draft).
  const [iaBusy, setIaBusy] = useState(false)
  const [iaError, setIaError] = useState('')
  const [iaTextOpen, setIaTextOpen] = useState(false)
  const [iaText, setIaText] = useState('')
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  function aplicarResultadoIA(r: RecetaIAResult) {
    const nuevas = iaIngredientesAFilas(r.ingredientes, stockProductos)
    if (nuevas.length > 0) {
      setFilas(prev => {
        const conNombre = prev.filter(f => f.nombre.trim())
        return [...conNombre, ...nuevas]
      })
    }
    if (r.porciones && r.porciones > 0) setPorciones(r.porciones)
  }

  async function runIaImage(file: File) {
    setIaBusy(true); setIaError('')
    try {
      const { base64, media_type } = await fileToBase64(file)
      const r = await callRecetaImport('image', { image_base64: base64, media_type })
      aplicarResultadoIA(r)
    } catch (e) {
      setIaError(e instanceof Error ? e.message : 'Error al analizar la imagen')
    } finally {
      setIaBusy(false)
    }
  }

  async function runIaText() {
    if (!iaText.trim()) return
    setIaBusy(true); setIaError('')
    try {
      const r = await callRecetaImport('text', { text: iaText.trim() })
      aplicarResultadoIA(r)
      setIaText(''); setIaTextOpen(false)
    } catch (e) {
      setIaError(e instanceof Error ? e.message : 'Error al analizar el texto')
    } finally {
      setIaBusy(false)
    }
  }

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

              {/* Cargar con IA — foto de la receta anotada/libro/pantalla, o
                  texto pegado. Suma filas a las que ya haya, no las pisa. */}
              <div style={{ display: 'flex', gap: 6, marginBottom: iaTextOpen || iaError ? 8 : 10 }}>
                <button onClick={() => cameraRef.current?.click()} disabled={iaBusy} style={{ ...iaMiniBtn, opacity: iaBusy ? .6 : 1 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{iaBusy ? 'progress_activity' : 'photo_camera'}</span>
                  Foto
                </button>
                <button onClick={() => galleryRef.current?.click()} disabled={iaBusy} style={{ ...iaMiniBtn, opacity: iaBusy ? .6 : 1 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>image</span>
                  Galería
                </button>
                <button onClick={() => setIaTextOpen(v => !v)} disabled={iaBusy} style={{ ...iaMiniBtn, opacity: iaBusy ? .6 : 1, ...(iaTextOpen ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}) }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>content_paste</span>
                  Texto
                </button>
              </div>
              {iaTextOpen && (
                <div style={{ marginBottom: 10 }}>
                  <textarea autoFocus value={iaText} onChange={e => setIaText(e.target.value)}
                    placeholder="Pegá la lista de ingredientes (de una nota, Instagram, etc.)"
                    rows={3} style={{ width: '100%', padding: 9, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12, color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 6 }} />
                  <button onClick={runIaText} disabled={iaBusy || !iaText.trim()}
                    style={{ width: '100%', padding: '8px', borderRadius: 9, border: 'none', background: 'var(--navy)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: iaBusy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: iaBusy || !iaText.trim() ? .6 : 1 }}>
                    {iaBusy ? 'Analizando…' : 'Analizar con IA'}
                  </button>
                </div>
              )}
              {iaError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 9, background: 'rgba(220,38,38,.08)', color: 'var(--red-fg)', fontSize: 11, marginBottom: 10 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>error</span>
                  {iaError}
                </div>
              )}
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) runIaImage(f) }} />
              <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) runIaImage(f) }} />

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
