'use client'

import { useMemo, useState } from 'react'
import type { ChecklistSeccionConfig, ChecklistSeccionTipo, MisePlaceItem, Plaza } from '@/types'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { createClient } from '@/lib/supabase/client'

// Editor de secciones del mise (agregar/renombrar/reordenar/borrar/tipar) —
// fuente única, usado por Mise (checklist/ClientView.tsx) y Mesa de Trabajo
// (espacios/ClientView.tsx). No duplicar esta UI en ningún otro lado.
export const ICON_OPTIONS = ['kitchen', 'inventory_2', 'severe_cold', 'countertops', 'local_bar', 'cake', 'thermostat', 'shelves', 'water_drop', 'local_fire_department', 'blender', 'grocery']

const TIPO_CFG: { id: ChecklistSeccionTipo; label: string; icono: string }[] = [
  { id: 'produccion', label: 'Producción', icono: 'countertops' },
  { id: 'almacen',    label: 'Almacén',    icono: 'inventory_2' },
  { id: 'heladera',   label: 'Heladera',   icono: 'kitchen' },
  { id: 'freezer',    label: 'Freezer',    icono: 'severe_cold' },
  { id: 'estacion',   label: 'Estación',   icono: 'workspaces' },
]

type EditRow = ChecklistSeccionConfig

// ── Picker de productos del stock para secciones tipo "almacén" ──────────
function ProductoIdsPicker({ value, onChange, productos, loading }: {
  value: string[]
  onChange: (ids: string[]) => void
  productos: { id: string; nombre: string }[]
  loading: boolean
}) {
  const [busqueda, setBusqueda] = useState('')
  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const base = q ? productos.filter(p => p.nombre.toLowerCase().includes(q)) : productos
    return base.slice(0, 60)
  }, [productos, busqueda])

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])
  }

  return (
    <div style={{ marginTop: 6, padding: 8, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>
        Productos de esta sección ({value.length})
      </div>
      <input
        value={busqueda} onChange={e => setBusqueda(e.target.value)}
        placeholder="Buscar producto…"
        style={{ ...inp, padding: '5px 8px', fontSize: 12, marginBottom: 6 }}
      />
      {loading ? (
        <div style={{ fontSize: 11, color: 'var(--text-3)', padding: 4 }}>Cargando productos…</div>
      ) : (
        <div style={{ maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filtrados.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-3)', padding: 4 }}>Sin resultados</div>}
          {filtrados.map(p => (
            <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', fontSize: 12, color: 'var(--text-1)', cursor: 'pointer' }}>
              <input type="checkbox" checked={value.includes(p.id)} onChange={() => toggle(p.id)} />
              {p.nombre}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SectionEditor({ secciones, items, plaza, onAdd, onUpdate, onDelete, onReorder, onClose }: {
  secciones: ChecklistSeccionConfig[]; items: MisePlaceItem[]; plaza: Plaza
  onAdd: (d: { nombre: string; icono: string; orden: number; plaza: Plaza; tipo?: ChecklistSeccionTipo; producto_ids?: string[] }) => Promise<string>
  onUpdate: (id: string, d: Partial<{ nombre: string; icono: string; orden: number; tipo: ChecklistSeccionTipo; producto_ids: string[] }>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReorder: (u: { id: string; orden: number }[]) => Promise<void>
  onClose: () => void
}) {
  const [editList, setEditList] = useState<EditRow[]>(secciones.map(s => ({ ...s })))
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('inventory_2')
  const [saving, setSaving] = useState(false)

  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])
  const [productos, setProductos] = useState<{ id: string; nombre: string }[]>([])
  const [productosLoading, setProductosLoading] = useState(false)
  const [productosLoaded, setProductosLoaded] = useState(false)

  function ensureProductosCargados() {
    if (productosLoaded || productosLoading || !RESTAURANTE_ID) return
    setProductosLoading(true)
    supabase.from('productos').select('id, nombre').eq('restaurante_id', RESTAURANTE_ID).order('nombre', { ascending: true })
      .then(({ data }) => { setProductos(data ?? []); setProductosLoaded(true); setProductosLoading(false) })
  }

  const moveUp = (idx: number) => { if (idx === 0) return; const l = [...editList]; [l[idx - 1], l[idx]] = [l[idx], l[idx - 1]]; setEditList(l) }
  const moveDown = (idx: number) => { if (idx >= editList.length - 1) return; const l = [...editList]; [l[idx], l[idx + 1]] = [l[idx + 1], l[idx]]; setEditList(l) }

  const handleSave = async () => {
    setSaving(true)
    try {
      const currentIds = new Set(editList.map(s => s.id))
      for (const o of secciones) { if (!currentIds.has(o.id)) await onDelete(o.id) }
      for (const s of editList.filter(s => s.id.startsWith('new_'))) {
        const idx = editList.indexOf(s)
        s.id = await onAdd({ nombre: s.nombre, icono: s.icono, orden: idx, plaza, tipo: s.tipo, producto_ids: s.producto_ids })
      }
      const updates: { id: string; orden: number }[] = []
      for (let i = 0; i < editList.length; i++) {
        const s = editList[i]
        if (s.id.startsWith('new_')) continue
        const o = secciones.find(x => x.id === s.id)
        if (o && (o.nombre !== s.nombre || o.icono !== s.icono || o.tipo !== s.tipo || JSON.stringify(o.producto_ids) !== JSON.stringify(s.producto_ids))) {
          await onUpdate(s.id, { nombre: s.nombre, icono: s.icono, tipo: s.tipo, producto_ids: s.producto_ids })
        }
        updates.push({ id: s.id, orden: i })
      }
      if (updates.length) await onReorder(updates)
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border)' }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 14 }}>Editar secciones</div>
          {editList.map((sec, idx) => {
            const hasItems = items.some(i => i.seccion_id === sec.id) || (sec.tipo === 'almacen' && (sec.producto_ids?.length ?? 0) > 0)
            return (
              <div key={sec.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <select value={sec.icono} onChange={e => { const l = [...editList]; l[idx] = { ...l[idx], icono: e.target.value }; setEditList(l) }} style={{ ...inp, width: 44, padding: '6px 2px', fontSize: 11 }}>
                    {ICON_OPTIONS.map(ic => <option key={ic} value={ic}>{ic.slice(0, 8)}</option>)}
                  </select>
                  <input value={sec.nombre} onChange={e => { const l = [...editList]; l[idx] = { ...l[idx], nombre: e.target.value }; setEditList(l) }} style={{ ...inp, flex: 1, padding: '6px 8px', fontSize: 13 }} />
                  <button onClick={() => moveUp(idx)} disabled={idx === 0} style={{ ...btnReset, opacity: idx === 0 ? 0.2 : 1 }}><span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>arrow_upward</span></button>
                  <button onClick={() => moveDown(idx)} disabled={idx >= editList.length - 1} style={{ ...btnReset, opacity: idx >= editList.length - 1 ? 0.2 : 1 }}><span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>arrow_downward</span></button>
                  <button onClick={() => { if (!hasItems) setEditList(editList.filter((_, i) => i !== idx)) }} disabled={hasItems} title={hasItems ? 'Vacía la sección (producciones o productos asignados) antes de borrarla' : 'Eliminar sección'} style={{ ...btnReset, opacity: hasItems ? 0.15 : 1 }}><span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>delete</span></button>
                </div>
                {/* Tipo de sección */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6, marginLeft: 2 }}>
                  {TIPO_CFG.map(t => (
                    <button key={t.id}
                      onClick={() => {
                        const l = [...editList]; l[idx] = { ...l[idx], tipo: t.id }; setEditList(l)
                        if (t.id === 'almacen') ensureProductosCargados()
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                        background: sec.tipo === t.id ? 'rgba(67,97,160,.12)' : 'var(--bg)',
                        color: sec.tipo === t.id ? 'var(--accent)' : 'var(--text-3)',
                        outline: sec.tipo === t.id ? '1px solid rgba(67,97,160,.3)' : '1px solid var(--border)',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{t.icono}</span>
                      {t.label}
                    </button>
                  ))}
                </div>
                {/* Productos — solo secciones tipo Almacén */}
                {sec.tipo === 'almacen' && (
                  <ProductoIdsPicker
                    value={sec.producto_ids ?? []}
                    onChange={(ids) => { const l = [...editList]; l[idx] = { ...l[idx], producto_ids: ids }; setEditList(l) }}
                    productos={productos}
                    loading={productosLoading}
                  />
                )}
              </div>
            )
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0' }}>
            <select value={newIcon} onChange={e => setNewIcon(e.target.value)} style={{ ...inp, width: 44, padding: '6px 2px', fontSize: 11 }}>
              {ICON_OPTIONS.map(ic => <option key={ic} value={ic}>{ic.slice(0, 8)}</option>)}
            </select>
            <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) { setEditList([...editList, { id: `new_${Date.now()}`, nombre: newName.trim(), icono: newIcon, orden: editList.length, plaza, restaurante_id: '', created_at: '', tipo: 'produccion', producto_ids: [] }]); setNewName('') } }} placeholder="Nueva sección..." style={{ ...inp, flex: 1, padding: '6px 8px', fontSize: 13 }} />
            <button onClick={() => { if (!newName.trim()) return; setEditList([...editList, { id: `new_${Date.now()}`, nombre: newName.trim(), icono: newIcon, orden: editList.length, plaza, restaurante_id: '', created_at: '', tipo: 'produccion', producto_ids: [] }]); setNewName('') }} disabled={!newName.trim()} style={{ ...btnReset, background: 'var(--accent)', borderRadius: 8, padding: 6, opacity: newName.trim() ? 1 : 0.3 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>add</span>
            </button>
          </div>
        </div>
        <div style={{ padding: '12px 16px', paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))', borderTop: '1px solid var(--border)' }}>
          <button onClick={handleSave} disabled={saving} style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, var(--navy), var(--accent))', color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inp: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', width: '100%', boxSizing: 'border-box' }
const btnReset: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'inherit',
}
