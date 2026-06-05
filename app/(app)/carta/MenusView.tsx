'use client'

import { useState, useMemo } from 'react'
import { useMenus, type MenuConPreparaciones, type MenuTipo, type PrepTipo, type PrepPrioridad, type PrepInput } from '@/lib/hooks/useMenus'
import { useEquipo } from '@/lib/hooks/useEquipo'

// ── Constantes ──────────────────────────────────────────────
const PASOS = ['Apetizer', 'Entrada', 'Principal', 'Guarnición', 'Postre', 'Bebida', 'Otro']
const PLAZAS = ['parrilla', 'fríos', 'calientes', 'pase', 'pastelería', 'otro']

const PRIORIDADES: { id: PrepPrioridad; label: string; sublabel: string; color: string; bg: string }[] = [
  { id: 'critica', label: 'SP',    sublabel: 'Super Prior.', color: '#ef4444', bg: '#fef2f2' },
  { id: 'alta',    label: 'P',     sublabel: 'Prioridad',    color: '#f97316', bg: '#fff7ed' },
  { id: 'media',   label: 'REF',   sublabel: 'Refuerzo',     color: '#3b82f6', bg: '#eff6ff' },
  { id: 'baja',    label: 'Check', sublabel: 'Check',        color: '#64748b', bg: '#f8fafc' },
]
const PRIO_CFG: Record<PrepPrioridad, { label: string; color: string }> = {
  critica: { label: 'SP', color: '#ef4444' },
  alta:    { label: 'P', color: '#f97316' },
  media:   { label: 'REF', color: '#3b82f6' },
  baja:    { label: 'Check', color: '#64748b' },
}
const TIPO_CFG: Record<'receta' | 'producto' | 'plato', { icon: string; color: string; bg: string; label: string }> = {
  receta:   { icon: 'menu_book',   color: '#4361a0', bg: '#eef2ff', label: 'Receta' },
  producto: { icon: 'inventory_2', color: '#059669', bg: '#d1fae5', label: 'Ingrediente' },
  plato:    { icon: 'restaurant',  color: '#f97316', bg: '#ffedd5', label: 'Plato' },
}

// PrepRow = PrepInput + uid local para keys de React
interface PrepRow extends PrepInput {
  _uid: number
}
let _puid = 0
const puid = () => ++_puid

interface RefItem { id: string; nombre: string }

// ════════════════════════════════════════════════════════════
// MENUS VIEW — lista + constructor
// ════════════════════════════════════════════════════════════
export default function MenusView({
  recetas, productos, cartaItems, onBack, onToast,
}: {
  recetas: RefItem[]
  productos: RefItem[]
  cartaItems: RefItem[]
  onBack: () => void
  onToast: (msg: string) => void
}) {
  const { menus, loading, crearMenu, actualizarMenu, eliminarMenu } = useMenus()
  const [mode, setMode] = useState<'list' | 'builder'>('list')
  const [editing, setEditing] = useState<MenuConPreparaciones | null>(null)
  const [tipoFilter, setTipoFilter] = useState<MenuTipo | 'todos'>('todos')

  const filtered = useMemo(
    () => tipoFilter === 'todos' ? menus : menus.filter(m => m.tipo === tipoFilter),
    [menus, tipoFilter],
  )

  if (mode === 'builder') {
    return (
      <MenuBuilder
        menu={editing}
        recetas={recetas}
        productos={productos}
        cartaItems={cartaItems}
        onSave={async (data, preps) => {
          try {
            if (editing) await actualizarMenu(editing.id, data, preps)
            else await crearMenu(data, preps)
            onToast(editing ? 'Menú actualizado' : 'Menú creado')
            setMode('list'); setEditing(null)
          } catch (e) { onToast('Error: ' + (e instanceof Error ? e.message : 'desconocido')) }
        }}
        onCancel={() => { setMode('list'); setEditing(null) }}
      />
    )
  }

  return (
    <div className="scroll-body">
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: '46px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 22 }}>arrow_back</span>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Menús</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Fijos y de evento</div>
          </div>
          <button
            onClick={() => { setEditing(null); setMode('builder') }}
            style={{ background: 'rgba(255,255,255,.18)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 10, padding: '7px 14px', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            Nuevo
          </button>
        </div>
        {/* Tipo filter */}
        <div style={{ display: 'flex', gap: 6 }}>
          {([['todos', 'Todos'], ['fijo', 'Fijos'], ['evento', 'Eventos']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTipoFilter(id)}
              style={{
                padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: tipoFilter === id ? '#fff' : 'rgba(255,255,255,.12)',
                color: tipoFilter === id ? 'var(--navy)' : 'rgba(255,255,255,.8)',
                fontSize: 12, fontWeight: 600,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div style={{ padding: '12px 14px 100px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-3)', fontSize: 13 }}>Cargando menús…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 24px', color: 'var(--text-3)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 44, opacity: .5 }}>menu_book</span>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginTop: 8 }}>
              {menus.length === 0 ? 'Sin menús todavía' : 'Sin menús de este tipo'}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Tocá “Nuevo” para armar uno por pasos</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(menu => (
              <MenuCard key={menu.id} menu={menu}
                onEdit={() => { setEditing(menu); setMode('builder') }}
                onDelete={async () => {
                  if (!confirm(`¿Eliminar el menú “${menu.nombre}”?`)) return
                  try { await eliminarMenu(menu.id); onToast('Menú eliminado') }
                  catch (e) { onToast('Error: ' + (e instanceof Error ? e.message : 'desconocido')) }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Card de menú en la lista ──
function MenuCard({ menu, onEdit, onDelete }: { menu: MenuConPreparaciones; onEdit: () => void; onDelete: () => void }) {
  const porPaso = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of menu.preparaciones) m.set(p.paso, (m.get(p.paso) ?? 0) + 1)
    return [...m.entries()]
  }, [menu.preparaciones])

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <div onClick={onEdit} style={{ padding: '12px 14px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '.04em',
            background: menu.tipo === 'evento' ? '#ede9fe' : '#e0f2fe',
            color: menu.tipo === 'evento' ? '#6d28d9' : '#075985',
          }}>
            {menu.tipo === 'evento' ? 'Evento' : 'Fijo'}
          </span>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{menu.nombre}</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{menu.preparaciones.length} prep.</span>
        </div>
        {menu.descripcion && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{menu.descripcion}</div>
        )}
        {porPaso.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
            {porPaso.map(([paso, n]) => (
              <span key={paso} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'var(--bg)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                {paso} · {n}
              </span>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
        <button onClick={onEdit} style={{ flex: 1, padding: '8px', background: 'none', border: 'none', borderRight: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--accent)', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span> Editar
        </button>
        <button onClick={onDelete} style={{ padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#ef4444', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// MENU BUILDER — crear / editar un menú por pasos
// ════════════════════════════════════════════════════════════
function MenuBuilder({
  menu, recetas, productos, cartaItems, onSave, onCancel,
}: {
  menu: MenuConPreparaciones | null
  recetas: RefItem[]
  productos: RefItem[]
  cartaItems: RefItem[]
  onSave: (data: { nombre: string; tipo: MenuTipo; descripcion: string | null }, preps: PrepInput[]) => void
  onCancel: () => void
}) {
  const { miembros } = useEquipo()
  const [nombre, setNombre] = useState(menu?.nombre ?? '')
  const [tipo, setTipo] = useState<MenuTipo>(menu?.tipo ?? 'fijo')
  const [descripcion, setDescripcion] = useState(menu?.descripcion ?? '')
  const [preps, setPreps] = useState<PrepRow[]>(
    menu?.preparaciones.map(p => ({
      _uid: puid(), paso: p.paso, tipo: p.tipo, ref_id: p.ref_id, nombre: p.nombre,
      prioridad: p.prioridad, plaza: p.plaza, usuario_asignado: p.usuario_asignado,
      cantidad: p.cantidad, unidad: p.unidad,
    })) ?? [],
  )
  const [editorIdx, setEditorIdx] = useState<number | null>(null) // índice de prep en edición; -1 = nueva
  const [saving, setSaving] = useState(false)

  // Agrupar preparaciones por paso, en el orden de PASOS
  const grouped = useMemo(() => {
    const m = new Map<string, { row: PrepRow; idx: number }[]>()
    preps.forEach((row, idx) => {
      const list = m.get(row.paso) ?? []
      list.push({ row, idx })
      m.set(row.paso, list)
    })
    const ordered = [...PASOS.filter(p => m.has(p)), ...[...m.keys()].filter(p => !PASOS.includes(p))]
    return ordered.map(paso => [paso, m.get(paso)!] as [string, { row: PrepRow; idx: number }[]])
  }, [preps])

  function upsertPrep(data: PrepInput, idx: number | null) {
    if (idx === null || idx < 0) {
      setPreps(prev => [...prev, { ...data, _uid: puid() }])
    } else {
      setPreps(prev => prev.map((p, i) => i === idx ? { ...data, _uid: p._uid } : p))
    }
    setEditorIdx(null)
  }

  function removePrep(idx: number) {
    setPreps(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!nombre.trim()) return
    setSaving(true)
    const clean: PrepInput[] = preps.map(({ _uid, ...rest }) => rest) // eslint-disable-line @typescript-eslint/no-unused-vars
    await onSave({ nombre: nombre.trim(), tipo, descripcion: descripcion.trim() || null }, clean)
    setSaving(false)
  }

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, color: 'var(--text-1)', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: '44px 12px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.8)', fontSize: 22 }}>close</span>
            </button>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{menu ? 'Editar menú' : 'Nuevo menú'}</span>
          </div>
          <button onClick={handleSave} disabled={saving || !nombre.trim()}
            style={{ background: nombre.trim() ? '#22c55e' : 'rgba(255,255,255,.2)', border: 'none', borderRadius: 8, padding: '6px 16px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: nombre.trim() ? 'pointer' : 'default', fontFamily: 'inherit', opacity: saving ? .6 : 1 }}>
            {saving ? '…' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '14px 14px 32px' }}>
        {/* Nombre + tipo + descripción */}
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del menú (ej: Menú ejecutivo semana 23)" style={{ ...inp, fontWeight: 700, marginBottom: 10 }} autoFocus />
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {([['fijo', 'Fijo'], ['evento', 'Evento']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTipo(id)}
              style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: `1.5px solid ${tipo === id ? 'var(--accent)' : 'var(--border)'}`, background: tipo === id ? 'rgba(67,97,160,.1)' : 'var(--surface)', color: tipo === id ? 'var(--accent)' : 'var(--text-3)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {label}
            </button>
          ))}
        </div>
        <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Descripción (opcional)" style={{ ...inp, marginBottom: 16 }} />

        {/* Preparaciones por paso */}
        {grouped.map(([paso, rows]) => (
          <div key={paso} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{paso}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rows.map(({ row, idx }) => {
                const tcfg = row.tipo ? TIPO_CFG[row.tipo] : null
                const pcfg = PRIO_CFG[row.prioridad]
                const miembro = miembros.find(m => m.id === row.usuario_asignado)
                return (
                  <div key={row._uid} onClick={() => setEditorIdx(idx)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer' }}>
                    {tcfg && (
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: tcfg.color, flexShrink: 0 }}>{tcfg.icon}</span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.nombre}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                        {row.plaza && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'rgba(67,97,160,.1)', color: 'var(--accent)', textTransform: 'capitalize' }}>{row.plaza}</span>}
                        {miembro && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#f1f5f9', color: '#475569' }}>{miembro.nombre}</span>}
                        {row.cantidad != null && <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'monospace' }}>{row.cantidad}{row.unidad ?? ''}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 800, color: pcfg.color, flexShrink: 0 }}>{pcfg.label}</span>
                    <button onClick={e => { e.stopPropagation(); removePrep(idx) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#ef4444', flexShrink: 0, display: 'flex' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Agregar preparación */}
        <button onClick={() => setEditorIdx(-1)}
          style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1.5px dashed var(--accent)', background: 'rgba(67,97,160,.05)', color: 'var(--accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
          Agregar preparación
        </button>
      </div>

      {/* Editor de preparación (bottom sheet) */}
      {editorIdx !== null && (
        <PrepEditor
          initial={editorIdx >= 0 ? preps[editorIdx] : null}
          recetas={recetas}
          productos={productos}
          cartaItems={cartaItems}
          miembros={miembros}
          onSave={(data) => upsertPrep(data, editorIdx)}
          onClose={() => setEditorIdx(null)}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// PREP EDITOR — bottom sheet para agregar/editar una preparación
// ════════════════════════════════════════════════════════════
function PrepEditor({
  initial, recetas, productos, cartaItems, miembros, onSave, onClose,
}: {
  initial: PrepRow | null
  recetas: RefItem[]
  productos: RefItem[]
  cartaItems: RefItem[]
  miembros: { id: string; nombre: string; apellido: string }[]
  onSave: (data: PrepInput) => void
  onClose: () => void
}) {
  const [nombre, setNombre] = useState(initial?.nombre ?? '')
  const [tipo, setTipo] = useState<PrepTipo>(initial?.tipo ?? null)
  const [refId, setRefId] = useState<string | null>(initial?.ref_id ?? null)
  const [paso, setPaso] = useState(initial?.paso ?? 'Principal')
  const [prioridad, setPrioridad] = useState<PrepPrioridad>(initial?.prioridad ?? 'media')
  const [plaza, setPlaza] = useState<string | null>(initial?.plaza ?? null)
  const [usuario, setUsuario] = useState<string | null>(initial?.usuario_asignado ?? null)
  const [cantidad, setCantidad] = useState(initial?.cantidad != null ? String(initial.cantidad) : '')
  const [unidad, setUnidad] = useState(initial?.unidad ?? '')
  const [search, setSearch] = useState('')
  const [showResults, setShowResults] = useState(false)

  const results = useMemo(() => {
    if (!search.trim()) return []
    const ql = search.toLowerCase()
    return [
      ...recetas.filter(r => r.nombre.toLowerCase().includes(ql)).slice(0, 5).map(r => ({ tipo: 'receta' as const, id: r.id, nombre: r.nombre })),
      ...cartaItems.filter(p => p.nombre.toLowerCase().includes(ql)).slice(0, 5).map(p => ({ tipo: 'plato' as const, id: p.id, nombre: p.nombre })),
      ...productos.filter(p => p.nombre.toLowerCase().includes(ql)).slice(0, 5).map(p => ({ tipo: 'producto' as const, id: p.id, nombre: p.nombre })),
    ].slice(0, 8)
  }, [search, recetas, productos, cartaItems])

  function pick(r: { tipo: 'receta' | 'producto' | 'plato'; id: string; nombre: string }) {
    setNombre(r.nombre); setTipo(r.tipo); setRefId(r.id)
    setSearch(''); setShowResults(false)
  }

  function handleSave() {
    if (!nombre.trim()) return
    onSave({
      paso, tipo, ref_id: refId, nombre: nombre.trim(), prioridad,
      plaza, usuario_asignado: usuario,
      cantidad: cantidad.trim() ? parseFloat(cantidad.replace(',', '.')) : null,
      unidad: unidad.trim() || null,
    })
  }

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '5px 11px', borderRadius: 99, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'rgba(67,97,160,.12)' : 'var(--surface)', color: active ? 'var(--accent)' : 'var(--text-3)',
    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize', whiteSpace: 'nowrap',
  })
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6, display: 'block' }
  const fieldInp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, color: 'var(--text-1)', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 400 }} onClick={onClose} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401, background: 'var(--surface)', borderRadius: '20px 20px 0 0', maxHeight: '90vh', display: 'flex', flexDirection: 'column', maxWidth: 520, margin: '0 auto' }}>
        {/* Título fijo */}
        <div style={{ padding: '16px 16px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{initial ? 'Editar preparación' : 'Nueva preparación'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-3)' }}>close</span>
          </button>
        </div>

        {/* Scroll */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '14px 16px' }}>
          {/* Buscador unificado */}
          <label style={lbl}>Vincular receta, plato o ingrediente</label>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setShowResults(true) }}
              onFocus={() => setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 150)}
              placeholder="Buscar para vincular…"
              style={fieldInp}
            />
            {showResults && results.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, marginTop: 4, maxHeight: 240, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
                {results.map(r => {
                  const cfg = TIPO_CFG[r.tipo]
                  return (
                    <button key={`${r.tipo}-${r.id}`} onMouseDown={e => { e.preventDefault(); pick(r) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', textAlign: 'left', border: 'none', borderBottom: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: cfg.color }}>{cfg.icon}</span>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{r.nombre}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Nombre (editable; o libre si no se vincula) */}
          <label style={lbl}>Nombre de la preparación</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <input value={nombre} onChange={e => { setNombre(e.target.value); if (tipo) { setTipo(null); setRefId(null) } }} placeholder="Ej: Salsa criolla" style={fieldInp} />
            {tipo && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '4px 8px', borderRadius: 99, background: TIPO_CFG[tipo].bg, color: TIPO_CFG[tipo].color, flexShrink: 0 }}>{TIPO_CFG[tipo].label}</span>
            )}
          </div>

          {/* Paso */}
          <label style={lbl}>Paso (curso)</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {PASOS.map(p => <button key={p} onClick={() => setPaso(p)} style={chip(paso === p)}>{p}</button>)}
          </div>

          {/* Prioridad */}
          <label style={lbl}>Prioridad</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {PRIORIDADES.map(p => (
              <button key={p.id} onClick={() => setPrioridad(p.id)}
                style={{ flex: 1, padding: '7px 4px', borderRadius: 8, border: `1.5px solid ${prioridad === p.id ? p.color : 'var(--border)'}`, background: prioridad === p.id ? p.bg : 'var(--surface)', color: prioridad === p.id ? p.color : 'var(--text-3)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 800 }}>{p.label}</span>
                <span style={{ fontSize: 8, opacity: .8 }}>{p.sublabel}</span>
              </button>
            ))}
          </div>

          {/* Plaza */}
          <label style={lbl}>Plaza (delegar)</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {PLAZAS.map(pz => <button key={pz} onClick={() => setPlaza(plaza === pz ? null : pz)} style={chip(plaza === pz)}>{pz}</button>)}
          </div>

          {/* Usuario */}
          {miembros.length > 0 && (
            <>
              <label style={lbl}>Asignar a (opcional)</label>
              <select value={usuario ?? ''} onChange={e => setUsuario(e.target.value || null)}
                style={{ ...fieldInp, marginBottom: 12, appearance: 'auto' as React.CSSProperties['appearance'] }}>
                <option value="">Sin asignar</option>
                {miembros.map(m => <option key={m.id} value={m.id}>{m.nombre} {m.apellido}</option>)}
              </select>
            </>
          )}

          {/* Cantidad + unidad (opcional, útil para ingredientes brutos) */}
          <label style={lbl}>Cantidad (opcional)</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input value={cantidad} onChange={e => setCantidad(e.target.value)} placeholder="Ej: 250" inputMode="decimal" style={{ ...fieldInp, flex: 1 }} />
            <input value={unidad} onChange={e => setUnidad(e.target.value)} placeholder="g / u / l" style={{ ...fieldInp, width: 90 }} />
          </div>
        </div>

        {/* Botón guardar fijo */}
        <div style={{ padding: '10px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', flexShrink: 0, borderTop: '1px solid var(--border)' }}>
          <button onClick={handleSave} disabled={!nombre.trim()}
            style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: nombre.trim() ? 'var(--navy)' : 'var(--border)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: nombre.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>
            {initial ? 'Guardar cambios' : 'Agregar al menú'}
          </button>
        </div>
      </div>
    </>
  )
}
