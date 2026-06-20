'use client'

import { useState, useMemo, useEffect } from 'react'
import { useEquipo } from '@/lib/hooks/useEquipo'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { createClient } from '@/lib/supabase/client'

// ── Tipos públicos ──────────────────────────────────────────
export type CompModo = 'plato' | 'menu' | 'evento'
export type CompRefTipo = 'receta' | 'producto' | 'plato' | null
export type CompPrioridad = 'critica' | 'alta' | 'media' | 'baja'

export interface CompItemOut {
  tipo: CompRefTipo
  ref_id: string | null
  nombre: string
  prioridad: CompPrioridad
  plaza: string | null
  seccion_mise: string | null
  usuario_asignado: string | null
  cantidad: number | null
  unidad: string | null
}
export interface CompPayload {
  tipo: CompModo
  nombre: string
  descripcion: string | null
  precio: number
  categoria: string
  tags: string[]
  secciones: { nombre: string; items: CompItemOut[] }[]
}

// Fuente de datos con costo para el resumen vivo
export interface RefConCosto { id: string; nombre: string; costo: number }

// Datos para editar una composición existente
export interface CompInicial {
  modo: CompModo
  nombre: string
  descripcion: string | null
  precio: number
  categoria: string
  tags: string[]
  secciones: { nombre: string; items: (CompItemOut & { _uid?: number })[] }[]
}

// ── Constantes ──────────────────────────────────────────────
const PLAZAS_BASE = ['parrilla', 'fríos', 'calientes', 'pase', 'pastelería']
const DEFAULT_SECCIONES = ['Entradas', 'Principales', 'Postres']

const PRIORIDADES: { id: CompPrioridad; label: string; sublabel: string; color: string; bg: string }[] = [
  { id: 'critica', label: 'SP',    sublabel: 'Super Prior.', color: '#ef4444', bg: '#fef2f2' },
  { id: 'alta',    label: 'P',     sublabel: 'Prioridad',    color: '#f97316', bg: '#fff7ed' },
  { id: 'media',   label: 'REF',   sublabel: 'Refuerzo',     color: '#3b82f6', bg: '#eff6ff' },
  { id: 'baja',    label: 'Check', sublabel: 'Check',        color: '#64748b', bg: '#f8fafc' },
]
const PRIO_CFG: Record<CompPrioridad, { label: string; color: string }> = {
  critica: { label: 'SP', color: '#ef4444' }, alta: { label: 'P', color: '#f97316' },
  media: { label: 'REF', color: '#3b82f6' }, baja: { label: 'Check', color: '#64748b' },
}
const TIPO_CFG: Record<'receta' | 'producto' | 'plato', { icon: string; color: string; bg: string; label: string }> = {
  receta:   { icon: 'menu_book',   color: '#4361a0', bg: '#eef2ff', label: 'Receta' },
  producto: { icon: 'inventory_2', color: '#059669', bg: '#d1fae5', label: 'Ingrediente' },
  plato:    { icon: 'restaurant',  color: '#f97316', bg: '#ffedd5', label: 'Plato' },
}
const TAG_CFG: Record<string, { label: string; bg: string; color: string }> = {
  's/tacc':      { label: 'S/TACC',      bg: '#fef3c7', color: '#92400e' },
  'vegano':      { label: 'Vegano',      bg: '#d1fae5', color: '#065f46' },
  'vegetariano': { label: 'Vegetariano', bg: '#dcfce7', color: '#166534' },
  'keto':        { label: 'Keto',        bg: '#ede9fe', color: '#5b21b6' },
  'picante':     { label: '🌶 Picante',  bg: '#fee2e2', color: '#991b1b' },
  'sin lactosa': { label: 'Sin lactosa', bg: '#e0f2fe', color: '#075985' },
}
const fmtMoney = (n: number) => n > 0 ? `$${Math.round(n).toLocaleString('es-AR')}` : '—'

interface ItemRow extends CompItemOut { _uid: number; _seccion: string }
let _u = 0
const uid = () => ++_u

// ════════════════════════════════════════════════════════════
// COMPOSICION EDITOR — un solo editor para Plato / Menú / Evento
// ════════════════════════════════════════════════════════════
export default function ComposicionEditor({
  inicial, recetas, productos, cartaItems, categoriasCarta, onSave, onCancel,
}: {
  inicial?: CompInicial
  recetas: RefConCosto[]
  productos: RefConCosto[]
  cartaItems: RefConCosto[]
  categoriasCarta: string[]
  onSave: (payload: CompPayload) => Promise<void>
  onCancel: () => void
}) {
  const { miembros } = useEquipo()
  const safeMiembros = miembros ?? []
  const RESTAURANTE_ID = useRestauranteId()

  // Secciones de mise (checklist_secciones) para rutear cada preparación
  const [miseSecciones, setMiseSecciones] = useState<{ plaza: string; nombre: string }[]>([])
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    createClient().from('checklist_secciones').select('plaza, nombre').eq('restaurante_id', RESTAURANTE_ID)
      .then(({ data }) => {
        const seen = new Set<string>()
        const out: { plaza: string; nombre: string }[] = []
        for (const s of (data ?? []) as { plaza: string; nombre: string }[]) {
          const k = `${s.plaza}|${s.nombre}`
          if (!seen.has(k)) { seen.add(k); out.push(s) }
        }
        setMiseSecciones(out)
      })
  }, [RESTAURANTE_ID])

  const [modo, setModo] = useState<CompModo>(inicial?.modo ?? 'plato')
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '')
  const [precio, setPrecio] = useState(inicial?.precio ? String(inicial.precio) : '')
  const [categoria, setCategoria] = useState(inicial?.categoria ?? categoriasCarta[0] ?? 'Principales')
  const [tags, setTags] = useState<string[]>(inicial?.tags ?? [])

  // Secciones (para plato es una sola implícita)
  const [secciones, setSecciones] = useState<string[]>(() => {
    if (inicial && inicial.secciones.length > 0) return inicial.secciones.map(s => s.nombre)
    return inicial?.modo === 'plato' ? ['Componentes'] : [...DEFAULT_SECCIONES]
  })
  const [items, setItems] = useState<ItemRow[]>(() => {
    if (!inicial) return []
    return inicial.secciones.flatMap(s => s.items.map(it => ({ ...it, _uid: it._uid ?? uid(), _seccion: s.nombre })))
  })

  const [plazas, setPlazas] = useState<string[]>(() => {
    const fromItems = (inicial?.secciones ?? []).flatMap(s => s.items).map(i => i.plaza).filter((x): x is string => !!x)
    return Array.from(new Set([...PLAZAS_BASE, ...fromItems]))
  })

  const [expandedUid, setExpandedUid] = useState<number | null>(null)
  const [secEdit, setSecEdit] = useState<{ idx: number; val: string } | null>(null)
  const [nuevaSeccion, setNuevaSeccion] = useState('')
  const [saving, setSaving] = useState(false)

  // ── Estado exclusivo para modo plato (UI simplificada) ──
  const [platoRecetas, setPlatoRecetas] = useState<{ _uid: number; ref_id: string; nombre: string; porciones: number }[]>(() => {
    if (!inicial || inicial.modo !== 'plato') return []
    return inicial.secciones.flatMap(s =>
      s.items
        .filter(it => it.tipo === 'receta' && it.ref_id)
        .map(it => ({ _uid: it._uid ?? uid(), ref_id: it.ref_id!, nombre: it.nombre, porciones: it.cantidad ?? 1 }))
    )
  })
  const [platoSearch, setPlatoSearch] = useState('')
  const [platoShowResults, setPlatoShowResults] = useState(false)
  const [editingPorcionUid, setEditingPorcionUid] = useState<number | null>(null)
  const [editingPorcionVal, setEditingPorcionVal] = useState('')

  const esPlato = modo === 'plato'

  // Al cambiar a plato, colapsar secciones a una sola
  function cambiarModo(m: CompModo) {
    if (m === modo) return
    if (m === 'plato') {
      setSecciones(['Componentes'])
      setItems(prev => prev.map(it => ({ ...it, _seccion: 'Componentes' })))
    } else if (modo === 'plato') {
      // de plato a menú: si solo está la sección Componentes, sembrar cursos
      setSecciones(items.length > 0 ? ['Componentes'] : [...DEFAULT_SECCIONES])
    }
    setModo(m)
  }

  // Costo total vivo
  const costoTotal = useMemo(() => {
    if (esPlato) {
      return platoRecetas.reduce((s, pr) => {
        const costo = recetas.find(r => r.id === pr.ref_id)?.costo ?? 0
        return s + costo * pr.porciones
      }, 0)
    }
    return items.reduce((s, it) => {
      const fuente = it.tipo === 'receta' ? recetas : it.tipo === 'producto' ? productos : it.tipo === 'plato' ? cartaItems : null
      const costo = fuente && it.ref_id ? (fuente.find(f => f.id === it.ref_id)?.costo ?? 0) : 0
      return s + costo * (it.cantidad ?? 1)
    }, 0)
  }, [esPlato, platoRecetas, items, recetas, productos, cartaItems])

  const precioN = parseFloat(precio.replace(',', '.')) || 0
  const fcPct = esPlato && precioN > 0 ? (costoTotal / precioN) * 100 : null
  const fcColor = fcPct == null ? 'var(--text-3)' : fcPct < 30 ? '#16a34a' : fcPct <= 35 ? '#d97706' : '#dc2626'

  // ── Item ops ──
  function addItem(seccion: string) {
    const nuevo: ItemRow = { _uid: uid(), _seccion: seccion, tipo: null, ref_id: null, nombre: '', prioridad: 'media', plaza: null, seccion_mise: null, usuario_asignado: null, cantidad: null, unidad: null }
    setItems(prev => [...prev, nuevo])
    setExpandedUid(nuevo._uid)
  }
  function updateItem(u: number, patch: Partial<ItemRow>) {
    setItems(prev => prev.map(it => it._uid === u ? { ...it, ...patch } : it))
    if (patch.plaza && !plazas.includes(patch.plaza)) setPlazas(prev => [...prev, patch.plaza!])
  }
  function removeItem(u: number) { setItems(prev => prev.filter(it => it._uid !== u)); if (expandedUid === u) setExpandedUid(null) }

  // ── Sección ops ──
  function commitSecRename() {
    if (!secEdit) return
    const nuevo = secEdit.val.trim(); const viejo = secciones[secEdit.idx]
    if (nuevo && nuevo !== viejo) {
      setSecciones(prev => prev.map((s, i) => i === secEdit.idx ? nuevo : s))
      setItems(prev => prev.map(it => it._seccion === viejo ? { ...it, _seccion: nuevo } : it))
    }
    setSecEdit(null)
  }
  function removeSeccion(sec: string) {
    const n = items.filter(it => it._seccion === sec).length
    if (n > 0 && !confirm(`La sección “${sec}” tiene ${n} ítem(s). ¿Eliminarla?`)) return
    setSecciones(prev => prev.filter(s => s !== sec)); setItems(prev => prev.filter(it => it._seccion !== sec))
  }
  function addSeccion() {
    const n = nuevaSeccion.trim()
    if (!n || secciones.includes(n)) { setNuevaSeccion(''); return }
    setSecciones(prev => [...prev, n]); setNuevaSeccion('')
  }

  async function handleSave() {
    if (!nombre.trim()) return
    setSaving(true)
    let secs
    if (esPlato) {
      secs = [{
        nombre: 'Recetas',
        items: platoRecetas.map(pr => ({
          tipo: 'receta' as const,
          ref_id: pr.ref_id,
          nombre: pr.nombre,
          prioridad: 'media' as const,
          plaza: null,
          seccion_mise: null,
          usuario_asignado: null,
          cantidad: pr.porciones,
          unidad: null,
        })),
      }]
    } else {
      secs = secciones.map(nombreSec => ({
        nombre: nombreSec,
        items: items.filter(it => it._seccion === nombreSec && it.nombre.trim()).map(({ _uid, _seccion, ...rest }) => rest), // eslint-disable-line @typescript-eslint/no-unused-vars
      })).filter(s => s.items.length > 0 || secciones.length === 1)
    }
    try {
      await onSave({
        tipo: modo, nombre: nombre.trim(), descripcion: descripcion.trim() || null,
        precio: precioN, categoria, tags, secciones: secs,
      })
    } finally { setSaving(false) }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, color: 'var(--text-1)', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: '44px 12px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.8)', fontSize: 22 }}>close</span>
            </button>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{inicial ? 'Editar' : 'Nuevo'}</span>
          </div>
          <button onClick={handleSave} disabled={saving || !nombre.trim()}
            style={{ background: nombre.trim() ? '#22c55e' : 'rgba(255,255,255,.2)', border: 'none', borderRadius: 8, padding: '6px 16px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: nombre.trim() ? 'pointer' : 'default', fontFamily: 'inherit', opacity: saving ? .6 : 1 }}>
            {saving ? '…' : 'Guardar'}
          </button>
        </div>
        {/* Segmented: tipo */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,.1)', borderRadius: 10, padding: 3 }}>
          {([['plato', '🍽 Plato'], ['menu', '📋 Menú'], ['evento', '🎉 Evento']] as const).map(([id, label]) => (
            <button key={id} onClick={() => cambiarModo(id)}
              style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                background: modo === id ? '#fff' : 'transparent', color: modo === id ? 'var(--navy)' : 'rgba(255,255,255,.7)', transition: 'all .15s' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Resumen vivo pegajoso */}
      <div style={{ flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'stretch' }}>
        {(() => {
          const Metric = ({ label, value, color }: { label: string; value: string; color?: string }) => (
            <div style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: '5px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: color ?? 'var(--text-1)', fontFamily: 'monospace' }}>{value}</div>
            </div>
          )
          return (
            <>
              <Metric label="Ítems" value={String(esPlato ? platoRecetas.length : items.filter(i => i.nombre.trim()).length)} />
              <Metric label="Costo" value={fmtMoney(costoTotal)} />
              {fcPct != null && <Metric label="Food cost" value={`${fcPct.toFixed(0)}%`} color={fcColor} />}
              {esPlato && precioN > 0 && <Metric label="Margen" value={fmtMoney(precioN - costoTotal)} color={precioN - costoTotal > 0 ? '#16a34a' : '#dc2626'} />}
            </>
          )
        })()}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '14px 14px 32px' }}>
        {/* ── Bloque DATOS ── */}
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 2px 7px' }}>
          {esPlato ? 'Datos del plato' : modo === 'evento' ? 'Datos del evento' : 'Datos del menú'}
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, marginBottom: 18 }}>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder={esPlato ? 'Nombre del plato' : 'Nombre del menú'} style={{ ...inp, fontWeight: 700, marginBottom: 10 }} autoFocus />

          {/* Campos de Plato */}
          {esPlato && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: 14 }}>$</span>
                  <input value={precio} onChange={e => setPrecio(e.target.value)} placeholder="Precio" inputMode="decimal" style={{ ...inp, paddingLeft: 24 }} />
                </div>
                <select value={categoria} onChange={e => setCategoria(e.target.value)} style={{ ...inp, width: 150 }}>
                  {categoriasCarta.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {/* Tags dietarios */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {Object.entries(TAG_CFG).map(([id, cfg]) => {
                  const on = tags.includes(id)
                  return (
                    <button key={id} onClick={() => setTags(prev => on ? prev.filter(t => t !== id) : [...prev, id])}
                      style={{ padding: '4px 10px', borderRadius: 99, border: `1px solid ${on ? cfg.color : 'var(--border)'}`, background: on ? cfg.bg : 'var(--surface)', color: on ? cfg.color : 'var(--text-3)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
            </>
          )}
          <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Descripción (opcional)" style={{ ...inp }} />
        </div>

        {/* ── Bloque COMPOSICIÓN ── */}
        {esPlato ? (
          // ── UI simplificada para modo Plato (igual que la vista de detalle) ──
          <PlatoRecetasEditor
            recetas={recetas}
            platoRecetas={platoRecetas}
            setPlatoRecetas={setPlatoRecetas}
            costoTotal={costoTotal}
            platoSearch={platoSearch}
            setPlatoSearch={setPlatoSearch}
            platoShowResults={platoShowResults}
            setPlatoShowResults={setPlatoShowResults}
            editingPorcionUid={editingPorcionUid}
            setEditingPorcionUid={setEditingPorcionUid}
            editingPorcionVal={editingPorcionVal}
            setEditingPorcionVal={setEditingPorcionVal}
            uid={uid}
          />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 2px 7px' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                Composición
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'monospace' }}>· {items.filter(i => i.nombre.trim()).length}</span>
              <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>{secciones.length} {secciones.length === 1 ? 'sección' : 'secciones'}</span>
            </div>

            {/* Secciones + ítems */}
            {secciones.map((sec, secIdx) => {
              const rows = items.filter(it => it._seccion === sec)
              const isEditingSec = secEdit?.idx === secIdx
              return (
                <div key={`${sec}-${secIdx}`} style={{ marginBottom: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                    {isEditingSec ? (
                      <input value={secEdit!.val} onChange={e => setSecEdit({ idx: secIdx, val: e.target.value })} onBlur={commitSecRename} onKeyDown={e => { if (e.key === 'Enter') commitSecRename() }} autoFocus
                        style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, fontWeight: 700, color: 'var(--text-1)', outline: 'none', textTransform: 'uppercase', letterSpacing: '.04em' }} />
                    ) : (
                      <button onClick={() => setSecEdit({ idx: secIdx, val: sec })} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '.04em', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {sec}<span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-3)' }}>edit</span>
                      </button>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, fontFamily: 'monospace' }}>{rows.length}</span>
                    <button onClick={() => removeSeccion(sec)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-3)', display: 'flex' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                    </button>
                  </div>

                  {rows.map(it => (
                    <ItemRowInline key={it._uid} item={it}
                      expanded={expandedUid === it._uid}
                      onToggle={() => setExpandedUid(expandedUid === it._uid ? null : it._uid)}
                      onChange={patch => updateItem(it._uid, patch)}
                      onRemove={() => removeItem(it._uid)}
                      recetas={recetas} productos={productos} cartaItems={cartaItems}
                      miembros={safeMiembros} plazas={plazas} esPlato={false}
                      miseSecciones={miseSecciones}
                    />
                  ))}

                  <button onClick={() => addItem(sec)}
                    style={{ width: '100%', padding: '9px', background: 'none', border: 'none', borderTop: rows.length > 0 ? '1px solid var(--border)' : 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                    Agregar a {sec}
                  </button>
                </div>
              )
            })}

            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <input value={nuevaSeccion} onChange={e => setNuevaSeccion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSeccion() }} placeholder="Nueva sección (ej: Bebidas)" style={{ ...inp, flex: 1 }} />
              <button onClick={addSeccion} disabled={!nuevaSeccion.trim()} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: nuevaSeccion.trim() ? 'var(--navy)' : 'var(--border)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: nuevaSeccion.trim() ? 'pointer' : 'default', fontFamily: 'inherit', display: 'flex', alignItems: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// PLATO RECETAS EDITOR — UI simplificada idéntica al detalle
// ════════════════════════════════════════════════════════════
function PlatoRecetasEditor({
  recetas, platoRecetas, setPlatoRecetas, costoTotal,
  platoSearch, setPlatoSearch, platoShowResults, setPlatoShowResults,
  editingPorcionUid, setEditingPorcionUid, editingPorcionVal, setEditingPorcionVal, uid,
}: {
  recetas: RefConCosto[]
  platoRecetas: { _uid: number; ref_id: string; nombre: string; porciones: number }[]
  setPlatoRecetas: React.Dispatch<React.SetStateAction<{ _uid: number; ref_id: string; nombre: string; porciones: number }[]>>
  costoTotal: number
  platoSearch: string
  setPlatoSearch: (v: string) => void
  platoShowResults: boolean
  setPlatoShowResults: (v: boolean) => void
  editingPorcionUid: number | null
  setEditingPorcionUid: (v: number | null) => void
  editingPorcionVal: string
  setEditingPorcionVal: (v: string) => void
  uid: () => number
}) {
  const linkedIds = new Set(platoRecetas.map(pr => pr.ref_id))
  const searchResults = useMemo(() => {
    if (!platoSearch.trim()) return []
    const q = platoSearch.toLowerCase()
    return recetas.filter(r => !linkedIds.has(r.id) && r.nombre.toLowerCase().includes(q)).slice(0, 12)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platoSearch, recetas, platoRecetas])

  function agregarReceta(r: RefConCosto) {
    setPlatoRecetas(prev => [...prev, { _uid: uid(), ref_id: r.id, nombre: r.nombre, porciones: 1 }])
    setPlatoSearch('')
    setPlatoShowResults(false)
  }

  function savePorcion(u: number) {
    const val = parseFloat(editingPorcionVal.replace(',', '.'))
    if (!isNaN(val) && val > 0) {
      setPlatoRecetas(prev => prev.map(pr => pr._uid === u ? { ...pr, porciones: val } : pr))
    }
    setEditingPorcionUid(null)
  }

  const headLbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.06em' }

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <span style={headLbl}>Recetas del plato</span>
      </div>

      {/* Lista de recetas vinculadas */}
      {platoRecetas.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
          {platoRecetas.map((pr, idx) => {
            const rec = recetas.find(r => r.id === pr.ref_id)
            return (
              <div key={pr._uid} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: idx < platoRecetas.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)', flexShrink: 0 }}>menu_book</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pr.nombre}
                  </div>
                  {rec && rec.costo > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtMoney(rec.costo)}</div>
                  )}
                </div>
                {/* Porciones editable */}
                {editingPorcionUid === pr._uid ? (
                  <input
                    autoFocus
                    type="number"
                    value={editingPorcionVal}
                    onChange={e => setEditingPorcionVal(e.target.value)}
                    onBlur={() => savePorcion(pr._uid)}
                    onKeyDown={e => { if (e.key === 'Enter') savePorcion(pr._uid); if (e.key === 'Escape') setEditingPorcionUid(null) }}
                    style={{ width: 52, textAlign: 'center', fontSize: 13, fontWeight: 700, border: '1.5px solid var(--accent)', borderRadius: 8, padding: '3px 4px', background: 'var(--surface)', color: 'var(--navy)', outline: 'none' }}
                  />
                ) : (
                  <button
                    onClick={() => { setEditingPorcionUid(pr._uid); setEditingPorcionVal(String(pr.porciones)) }}
                    title="Tap para editar porciones"
                    style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', padding: '4px 8px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}
                  >
                    {pr.porciones % 1 === 0 ? pr.porciones : pr.porciones.toFixed(1)}
                    <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--text-3)' }}>edit</span>
                  </button>
                )}
                <button
                  onClick={() => setPlatoRecetas(prev => prev.filter(x => x._uid !== pr._uid))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-3)', flexShrink: 0 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                </button>
              </div>
            )
          })}
          {costoTotal > 0 && (
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,.02)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>Costo recetas</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{fmtMoney(costoTotal)}</span>
            </div>
          )}
        </div>
      )}

      {/* Buscador — siempre visible */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ position: 'relative' }}>
          <span className="material-symbols-outlined" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'var(--text-3)', pointerEvents: 'none' }}>search</span>
          <input
            value={platoSearch}
            onChange={e => { setPlatoSearch(e.target.value); setPlatoShowResults(true) }}
            onFocus={() => setPlatoShowResults(true)}
            onBlur={() => setTimeout(() => setPlatoShowResults(false), 150)}
            placeholder="Buscar receta o insumo de stock..."
            style={{ width: '100%', padding: '12px 12px 12px 40px', border: 'none', background: 'transparent', fontSize: 13, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>
        {platoShowResults && searchResults.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {searchResults.map(r => (
              <button
                key={r.id}
                onMouseDown={e => { e.preventDefault(); agregarReceta(r) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', textAlign: 'left', border: 'none', borderBottom: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)', flexShrink: 0 }}>menu_book</span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{r.nombre}</span>
                {r.costo > 0 && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtMoney(r.costo)}</span>}
              </button>
            ))}
          </div>
        )}
        {platoShowResults && platoSearch.trim().length > 0 && searchResults.length === 0 && (
          <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
            Sin resultados para &quot;{platoSearch}&quot;
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// ITEM ROW — fila colapsada + editor inline expandible
// ════════════════════════════════════════════════════════════
function ItemRowInline({
  item, expanded, onToggle, onChange, onRemove, recetas, productos, cartaItems, miembros, plazas, esPlato, miseSecciones,
}: {
  item: ItemRow
  expanded: boolean
  onToggle: () => void
  onChange: (patch: Partial<ItemRow>) => void
  onRemove: () => void
  recetas: RefConCosto[]
  productos: RefConCosto[]
  cartaItems: RefConCosto[]
  miembros: { id: string; nombre: string; apellido: string }[]
  plazas: string[]
  esPlato: boolean
  miseSecciones: { plaza: string; nombre: string }[]
}) {
  const [search, setSearch] = useState('')
  const [showResults, setShowResults] = useState(false)
  const [nuevaPlaza, setNuevaPlaza] = useState('')
  const [nuevaSecMise, setNuevaSecMise] = useState('')

  // Secciones de mise disponibles para la plaza elegida (si no hay plaza, todas las distintas)
  // Incluye la sección recién creada (item.seccion_mise) aunque todavía no exista en la base,
  // así el chip aparece seleccionado y el usuario ve que se creó.
  const seccionesParaPlaza = useMemo(() => {
    const rel = item.plaza ? miseSecciones.filter(s => s.plaza === item.plaza) : miseSecciones
    const base = rel.map(s => s.nombre)
    if (item.seccion_mise && !base.includes(item.seccion_mise)) base.push(item.seccion_mise)
    return Array.from(new Set(base))
  }, [miseSecciones, item.plaza, item.seccion_mise])

  const results = useMemo(() => {
    if (!search.trim()) return []
    const ql = search.toLowerCase()
    const base = [
      ...recetas.filter(r => r.nombre.toLowerCase().includes(ql)).slice(0, 5).map(r => ({ tipo: 'receta' as const, id: r.id, nombre: r.nombre })),
      ...(!esPlato ? cartaItems.filter(p => p.nombre.toLowerCase().includes(ql)).slice(0, 4).map(p => ({ tipo: 'plato' as const, id: p.id, nombre: p.nombre })) : []),
      ...(!esPlato ? productos.filter(p => p.nombre.toLowerCase().includes(ql)).slice(0, 4).map(p => ({ tipo: 'producto' as const, id: p.id, nombre: p.nombre })) : []),
    ]
    return base.slice(0, 8)
  }, [search, recetas, productos, cartaItems, esPlato])

  const tcfg = item.tipo ? TIPO_CFG[item.tipo] : null
  const pcfg = PRIO_CFG[item.prioridad]
  const miembro = miembros.find(m => m.id === item.usuario_asignado)

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '5px 11px', borderRadius: 99, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'rgba(67,97,160,.12)' : 'var(--surface)', color: active ? 'var(--accent)' : 'var(--text-3)',
    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize', whiteSpace: 'nowrap',
  })
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 5px', display: 'block' }
  const fieldInp: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }

  return (
    <div style={{ borderTop: '1px solid var(--border)', background: expanded ? 'var(--bg)' : 'transparent' }}>
      {/* Fila colapsada */}
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer' }}>
        {tcfg && <span className="material-symbols-outlined" style={{ fontSize: 18, color: tcfg.color, flexShrink: 0 }}>{tcfg.icon}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: item.nombre ? 'var(--text-1)' : 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.nombre || 'Tocá para completar…'}
          </div>
          {!expanded && (item.plaza || item.seccion_mise || miembro || item.cantidad != null) && (
            <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
              {item.plaza && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'rgba(67,97,160,.1)', color: 'var(--accent)', textTransform: 'capitalize' }}>{item.plaza}</span>}
              {item.seccion_mise && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#ecfeff', color: '#0e7490' }}>{item.seccion_mise}</span>}
              {miembro && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#f1f5f9', color: '#475569' }}>{miembro.nombre}</span>}
              {item.cantidad != null && <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'monospace' }}>{item.cantidad}{item.unidad ?? ''}</span>}
            </div>
          )}
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, color: pcfg.color, flexShrink: 0 }}>{pcfg.label}</span>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)', flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>expand_more</span>
        <button onClick={e => { e.stopPropagation(); onRemove() }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#ef4444', flexShrink: 0, display: 'flex' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
        </button>
      </div>

      {/* Editor inline */}
      {expanded && (
        <div style={{ padding: '0 12px 12px' }}>
          {/* Buscador unificado */}
          <label style={lbl}>Vincular {esPlato ? 'receta' : 'receta, plato o ingrediente'}</label>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <input value={search} onChange={e => { setSearch(e.target.value); setShowResults(true) }} onFocus={() => setShowResults(true)} onBlur={() => setTimeout(() => setShowResults(false), 150)} placeholder="Buscar para vincular…" style={fieldInp} />
            {showResults && results.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, marginTop: 4, maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
                {results.map(r => {
                  const cfg = TIPO_CFG[r.tipo]
                  return (
                    <button key={`${r.tipo}-${r.id}`} onMouseDown={e => { e.preventDefault(); onChange({ tipo: r.tipo, ref_id: r.id, nombre: r.nombre }); setSearch(''); setShowResults(false) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 11px', textAlign: 'left', border: 'none', borderBottom: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: cfg.color }}>{cfg.icon}</span>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{r.nombre}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Nombre */}
          <label style={lbl}>Nombre</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <input value={item.nombre} onChange={e => onChange({ nombre: e.target.value, ...(item.tipo ? { tipo: null, ref_id: null } : {}) })} placeholder="Ej: Salsa criolla" style={fieldInp} />
            {tcfg && <span style={{ fontSize: 9, fontWeight: 700, padding: '4px 8px', borderRadius: 99, background: tcfg.bg, color: tcfg.color, flexShrink: 0 }}>{tcfg.label}</span>}
          </div>

          {/* Prioridad */}
          <label style={lbl}>Prioridad</label>
          <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
            {PRIORIDADES.map(p => (
              <button key={p.id} onClick={() => onChange({ prioridad: p.id })}
                style={{ flex: 1, padding: '6px 2px', borderRadius: 8, border: `1.5px solid ${item.prioridad === p.id ? p.color : 'var(--border)'}`, background: item.prioridad === p.id ? p.bg : 'var(--surface)', color: item.prioridad === p.id ? p.color : 'var(--text-3)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 800 }}>{p.label}</span>
                <span style={{ fontSize: 7, opacity: .8 }}>{p.sublabel}</span>
              </button>
            ))}
          </div>

          {/* Plaza */}
          <label style={lbl}>Plaza</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 7 }}>
            {plazas.map(pz => <button key={pz} onClick={() => onChange({ plaza: item.plaza === pz ? null : pz })} style={chip(item.plaza === pz)}>{pz}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input value={nuevaPlaza} onChange={e => setNuevaPlaza(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && nuevaPlaza.trim()) { e.preventDefault(); onChange({ plaza: nuevaPlaza.trim().toLowerCase() }); setNuevaPlaza('') } }} placeholder="Crear plaza…" style={{ ...fieldInp, flex: 1 }} />
            <button onClick={() => { if (nuevaPlaza.trim()) { onChange({ plaza: nuevaPlaza.trim().toLowerCase() }); setNuevaPlaza('') } }} disabled={!nuevaPlaza.trim()} style={{ padding: '0 13px', borderRadius: 9, border: 'none', background: nuevaPlaza.trim() ? 'var(--accent)' : 'var(--border)', color: '#fff', cursor: nuevaPlaza.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            </button>
          </div>

          {/* Sección de mise — dónde aparece en el checklist de Mise (solo menú/evento) */}
          {!esPlato && (
            <>
              <label style={lbl}>Sección de mise <span style={{ textTransform: 'none', fontWeight: 500, color: 'var(--text-3)' }}>(en qué parte del checklist va)</span></label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 7 }}>
                {seccionesParaPlaza.map(sn => <button key={sn} onClick={() => onChange({ seccion_mise: item.seccion_mise === sn ? null : sn })} style={chip(item.seccion_mise === sn)}>{sn}</button>)}
                {seccionesParaPlaza.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>{item.plaza ? 'Sin secciones cargadas para esta plaza' : 'Elegí una plaza o creá una sección abajo'}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <input value={nuevaSecMise} onChange={e => setNuevaSecMise(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && nuevaSecMise.trim()) { e.preventDefault(); onChange({ seccion_mise: nuevaSecMise.trim() }); setNuevaSecMise('') } }} placeholder="Crear sección de mise…" style={{ ...fieldInp, flex: 1 }} />
                <button onClick={() => { if (nuevaSecMise.trim()) { onChange({ seccion_mise: nuevaSecMise.trim() }); setNuevaSecMise('') } }} disabled={!nuevaSecMise.trim()} style={{ padding: '0 13px', borderRadius: 9, border: 'none', background: nuevaSecMise.trim() ? 'var(--accent)' : 'var(--border)', color: '#fff', cursor: nuevaSecMise.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                </button>
              </div>
            </>
          )}

          {/* Asignar + cantidad */}
          <div style={{ display: 'flex', gap: 8 }}>
            {miembros.length > 0 && (
              <div style={{ flex: 1 }}>
                <label style={lbl}>Asignar a</label>
                <select value={item.usuario_asignado ?? ''} onChange={e => onChange({ usuario_asignado: e.target.value || null })} style={fieldInp}>
                  <option value="">Sin asignar</option>
                  {miembros.map(m => <option key={m.id} value={m.id}>{m.nombre} {m.apellido}</option>)}
                </select>
              </div>
            )}
            <div style={{ width: 130 }}>
              <label style={lbl}>{esPlato ? 'Porciones' : 'Cantidad'}</label>
              <div style={{ display: 'flex', gap: 5 }}>
                <input value={item.cantidad != null ? String(item.cantidad) : ''} onChange={e => onChange({ cantidad: e.target.value.trim() ? parseFloat(e.target.value.replace(',', '.')) : null })} placeholder={esPlato ? 'pax' : '250'} inputMode="decimal" style={{ ...fieldInp, flex: 1 }} />
                {!esPlato && <input value={item.unidad ?? ''} onChange={e => onChange({ unidad: e.target.value || null })} placeholder="u" style={{ ...fieldInp, width: 50 }} />}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
