'use client'

import { useMemo, useState } from 'react'
import type { ChecklistSeccionConfig, ChecklistSeccionTipo, MisePlaceItem, Plaza } from '@/types'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { createClient } from '@/lib/supabase/client'
import { seccionTieneContenido } from '@/lib/checklist/secciones'

// Editor de secciones del mise (agregar/renombrar/reordenar/borrar/tipar,
// con sub-secciones de 1 nivel) — fuente única, usado por Mise
// (checklist/ClientView.tsx) y Mesa de Trabajo (espacios/ClientView.tsx).
// No duplicar esta UI en ningún otro lado.
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

// ── Una fila (raíz o hija) — icono/nombre/tipo/productos/mover/borrar ────
function SeccionEditorRow({
  row, canDelete, deleteTitle, onChangeIcono, onChangeNombre, onChangeTipo, onChangeProductoIds,
  onMoveUp, onMoveDown, canMoveUp, canMoveDown, onDelete, productos, productosLoading, onPickAlmacen,
}: {
  row: EditRow
  canDelete: boolean
  deleteTitle: string
  onChangeIcono: (v: string) => void
  onChangeNombre: (v: string) => void
  onChangeTipo: (t: ChecklistSeccionTipo) => void
  onChangeProductoIds: (ids: string[]) => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  onDelete: () => void
  productos: { id: string; nombre: string }[]
  productosLoading: boolean
  onPickAlmacen: () => void
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <select value={row.icono} onChange={e => onChangeIcono(e.target.value)} style={{ ...inp, width: 44, padding: '6px 2px', fontSize: 11 }}>
          {ICON_OPTIONS.map(ic => <option key={ic} value={ic}>{ic.slice(0, 8)}</option>)}
        </select>
        <input value={row.nombre} onChange={e => onChangeNombre(e.target.value)} style={{ ...inp, flex: 1, padding: '6px 8px', fontSize: 13 }} />
        <button onClick={onMoveUp} disabled={!canMoveUp} style={{ ...btnReset, opacity: canMoveUp ? 1 : 0.2 }}><span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>arrow_upward</span></button>
        <button onClick={onMoveDown} disabled={!canMoveDown} style={{ ...btnReset, opacity: canMoveDown ? 1 : 0.2 }}><span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>arrow_downward</span></button>
        <button onClick={onDelete} disabled={!canDelete} title={deleteTitle} style={{ ...btnReset, opacity: canDelete ? 1 : 0.15 }}><span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>delete</span></button>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6, marginLeft: 2 }}>
        {TIPO_CFG.map(t => (
          <button key={t.id}
            onClick={() => { onChangeTipo(t.id); if (t.id === 'almacen') onPickAlmacen() }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
              background: row.tipo === t.id ? 'rgba(67,97,160,.12)' : 'var(--bg)',
              color: row.tipo === t.id ? 'var(--accent)' : 'var(--text-3)',
              outline: row.tipo === t.id ? '1px solid rgba(67,97,160,.3)' : '1px solid var(--border)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{t.icono}</span>
            {t.label}
          </button>
        ))}
      </div>
      {row.tipo === 'almacen' && (
        <ProductoIdsPicker
          value={row.producto_ids ?? []}
          onChange={onChangeProductoIds}
          productos={productos}
          loading={productosLoading}
        />
      )}
    </div>
  )
}

export default function SectionEditor({ secciones, items, plaza, onAdd, onUpdate, onDelete, onReorder, onClose }: {
  secciones: ChecklistSeccionConfig[]; items: MisePlaceItem[]; plaza: Plaza
  onAdd: (d: { nombre: string; icono: string; orden: number; plaza: Plaza; tipo?: ChecklistSeccionTipo; producto_ids?: string[]; parent_id?: string | null }) => Promise<string>
  onUpdate: (id: string, d: Partial<{ nombre: string; icono: string; orden: number; tipo: ChecklistSeccionTipo; producto_ids: string[]; parent_id: string | null }>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReorder: (u: { id: string; orden: number }[]) => Promise<void>
  onClose: () => void
}) {
  const [editList, setEditList] = useState<EditRow[]>(secciones.map(s => ({ ...s })))
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('inventory_2')
  const [addingChildTo, setAddingChildTo] = useState<string | null>(null)
  const [newChildName, setNewChildName] = useState('')
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

  const tree = useMemo(() => {
    const roots = editList.filter(r => !r.parent_id).sort((a, b) => a.orden - b.orden)
    return roots.map(root => ({
      root,
      children: editList.filter(c => c.parent_id === root.id).sort((a, b) => a.orden - b.orden),
    }))
  }, [editList])

  function updateRow(id: string, patch: Partial<EditRow>) {
    setEditList(l => l.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  function removeRow(row: EditRow) {
    // Si es raíz, se lleva a sus hijos localmente (en DB lo hace el ON DELETE CASCADE).
    setEditList(l => l.filter(r => r.id !== row.id && r.parent_id !== row.id))
  }

  function moveWithinSiblings(row: EditRow, dir: -1 | 1) {
    const parentKey = row.parent_id ?? null
    const siblings = editList.filter(r => (r.parent_id ?? null) === parentKey).sort((a, b) => a.orden - b.orden)
    const idx = siblings.findIndex(r => r.id === row.id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= siblings.length) return
    const a = siblings[idx], b = siblings[swapIdx]
    setEditList(l => l.map(r => {
      if (r.id === a.id) return { ...r, orden: b.orden }
      if (r.id === b.id) return { ...r, orden: a.orden }
      return r
    }))
  }

  function addRoot() {
    if (!newName.trim()) return
    const roots = editList.filter(r => !r.parent_id)
    setEditList(l => [...l, {
      id: `new_${Date.now()}`, nombre: newName.trim(), icono: newIcon, orden: roots.length, plaza,
      restaurante_id: '', created_at: '', tipo: 'produccion', producto_ids: [], parent_id: null,
    }])
    setNewName('')
  }

  function addChild(rootId: string) {
    if (!newChildName.trim()) return
    const siblings = editList.filter(r => r.parent_id === rootId)
    setEditList(l => [...l, {
      id: `new_${Date.now()}_c`, nombre: newChildName.trim(), icono: 'inventory_2', orden: siblings.length, plaza,
      restaurante_id: '', created_at: '', tipo: 'produccion', producto_ids: [], parent_id: rootId,
    }])
    setNewChildName('')
    setAddingChildTo(null)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const currentIds = new Set(editList.map(s => s.id))
      // Borrados: solo raíces borradas explícitamente. Los hijos de una raíz
      // borrada ya no están en editList, pero no hace falta pedir su borrado
      // individual — el ON DELETE CASCADE de la FK ya se encarga.
      const deletedRootIds = new Set(secciones.filter(o => !o.parent_id && !currentIds.has(o.id)).map(o => o.id))
      for (const o of secciones) {
        if (currentIds.has(o.id)) continue
        if (o.parent_id && deletedRootIds.has(o.parent_id)) continue
        await onDelete(o.id)
      }

      // Inserts: raíces nuevas primero (para tener id real antes de insertar sus hijos).
      const tempToReal: Record<string, string> = {}
      const newRoots = editList.filter(s => s.id.startsWith('new_') && !s.parent_id)
      for (const s of newRoots) {
        const idx = editList.filter(r => !r.parent_id).findIndex(r => r.id === s.id)
        const realId = await onAdd({ nombre: s.nombre, icono: s.icono, orden: idx, plaza, tipo: s.tipo, producto_ids: s.producto_ids, parent_id: null })
        tempToReal[s.id] = realId
        s.id = realId
      }
      const newChildren = editList.filter(s => s.id.startsWith('new_') && !!s.parent_id)
      for (const s of newChildren) {
        const resolvedParentId = tempToReal[s.parent_id!] ?? s.parent_id!
        const siblingIdx = editList.filter(x => x.parent_id === s.parent_id).findIndex(x => x.id === s.id)
        const realId = await onAdd({ nombre: s.nombre, icono: s.icono, orden: siblingIdx, plaza, tipo: s.tipo, producto_ids: s.producto_ids, parent_id: resolvedParentId })
        s.id = realId
        s.parent_id = resolvedParentId
      }

      // Updates + reorder — orden se lee directo de cada fila (mantenido al
      // día por moveWithinSiblings), no se recalcula por índice de array.
      const updates: { id: string; orden: number }[] = []
      for (const s of editList) {
        const o = secciones.find(x => x.id === s.id)
        if (o && (o.nombre !== s.nombre || o.icono !== s.icono || o.tipo !== s.tipo || JSON.stringify(o.producto_ids) !== JSON.stringify(s.producto_ids))) {
          await onUpdate(s.id, { nombre: s.nombre, icono: s.icono, tipo: s.tipo, producto_ids: s.producto_ids })
        }
        updates.push({ id: s.id, orden: s.orden })
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
          {tree.map(({ root, children }) => {
            const rootDeletable = !seccionTieneContenido(root, editList, items)
            return (
              <div key={root.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <SeccionEditorRow
                  row={root}
                  canDelete={rootDeletable}
                  deleteTitle={rootDeletable ? 'Eliminar sección' : 'Vacía la sección (y sus subsecciones) antes de borrarla'}
                  onChangeIcono={v => updateRow(root.id, { icono: v })}
                  onChangeNombre={v => updateRow(root.id, { nombre: v })}
                  onChangeTipo={t => updateRow(root.id, { tipo: t })}
                  onChangeProductoIds={ids => updateRow(root.id, { producto_ids: ids })}
                  onMoveUp={() => moveWithinSiblings(root, -1)}
                  onMoveDown={() => moveWithinSiblings(root, 1)}
                  canMoveUp={tree.findIndex(t => t.root.id === root.id) > 0}
                  canMoveDown={tree.findIndex(t => t.root.id === root.id) < tree.length - 1}
                  onDelete={() => removeRow(root)}
                  productos={productos}
                  productosLoading={productosLoading}
                  onPickAlmacen={ensureProductosCargados}
                />

                {children.map((child, cIdx) => {
                  const childDeletable = !seccionTieneContenido(child, editList, items)
                  return (
                    <div key={child.id} style={{ marginLeft: 10, marginTop: 8, paddingLeft: 10, borderLeft: '2px solid var(--border)' }}>
                      <SeccionEditorRow
                        row={child}
                        canDelete={childDeletable}
                        deleteTitle={childDeletable ? 'Eliminar subsección' : 'Vacía la subsección antes de borrarla'}
                        onChangeIcono={v => updateRow(child.id, { icono: v })}
                        onChangeNombre={v => updateRow(child.id, { nombre: v })}
                        onChangeTipo={t => updateRow(child.id, { tipo: t })}
                        onChangeProductoIds={ids => updateRow(child.id, { producto_ids: ids })}
                        onMoveUp={() => moveWithinSiblings(child, -1)}
                        onMoveDown={() => moveWithinSiblings(child, 1)}
                        canMoveUp={cIdx > 0}
                        canMoveDown={cIdx < children.length - 1}
                        onDelete={() => removeRow(child)}
                        productos={productos}
                        productosLoading={productosLoading}
                        onPickAlmacen={ensureProductosCargados}
                      />
                    </div>
                  )
                })}

                <div style={{ marginLeft: 10, marginTop: 8, paddingLeft: 10 }}>
                  {addingChildTo === root.id ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        autoFocus value={newChildName} onChange={e => setNewChildName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addChild(root.id); if (e.key === 'Escape') { setAddingChildTo(null); setNewChildName('') } }}
                        placeholder="Nombre de la subsección…"
                        style={{ ...inp, flex: 1, padding: '6px 8px', fontSize: 12 }}
                      />
                      <button onClick={() => addChild(root.id)} disabled={!newChildName.trim()} style={{ ...btnReset, background: 'var(--accent)', borderRadius: 8, padding: '6px 10px', opacity: newChildName.trim() ? 1 : 0.3 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>add</span>
                      </button>
                      <button onClick={() => { setAddingChildTo(null); setNewChildName('') }} style={{ ...btnReset, padding: '6px 8px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>close</span>
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setAddingChildTo(root.id); setNewChildName('') }} style={{ ...btnReset, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-3)' }}>add</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>Agregar subsección</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0' }}>
            <select value={newIcon} onChange={e => setNewIcon(e.target.value)} style={{ ...inp, width: 44, padding: '6px 2px', fontSize: 11 }}>
              {ICON_OPTIONS.map(ic => <option key={ic} value={ic}>{ic.slice(0, 8)}</option>)}
            </select>
            <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addRoot() }} placeholder="Nueva sección..." style={{ ...inp, flex: 1, padding: '6px 8px', fontSize: 13 }} />
            <button onClick={addRoot} disabled={!newName.trim()} style={{ ...btnReset, background: 'var(--accent)', borderRadius: 8, padding: 6, opacity: newName.trim() ? 1 : 0.3 }}>
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
