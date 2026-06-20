'use client'

import { useState, useMemo, useEffect } from 'react'
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
  // OPS mise
  cantidad_ops?: number | null
  unidad_ops?: string | null
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
export const PLAZAS_OPS = [
  { id: 'general',    label: 'General',     color: '#6b7280' },
  { id: 'parrilla',   label: 'Parrilla',    color: '#ef4444' },
  { id: 'frios',      label: 'Fríos',       color: '#0ea5e9' },
  { id: 'calientes',  label: 'Calientes',   color: '#f97316' },
  { id: 'pase',       label: 'Pase',        color: '#8b5cf6' },
  { id: 'pasteleria', label: 'Pastelería',  color: '#ec4899' },
  { id: 'panaderia',  label: 'Panadería',   color: '#84cc16' },
]
export const SECCIONES_OPS = [
  { id: 'heladera',   label: 'Heladera',       icono: 'kitchen' },
  { id: 'secos',      label: 'Secos / Tuppers', icono: 'inventory_2' },
  { id: 'congelados', label: 'Congelados',      icono: 'severe_cold' },
  { id: 'estacion',   label: 'Estación',        icono: 'countertops' },
]
const UNIDADES_OPS = ['u', 'kg', 'g', 'l', 'ml', 'pax', 'porc', 'bandeja']
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
  const [platoRecetas, setPlatoRecetas] = useState<PlatoItem[]>(() => {
    if (!inicial || inicial.modo !== 'plato') return []
    return inicial.secciones.flatMap(s =>
      s.items
        .filter(it => (it.tipo === 'receta' || it.tipo === 'producto') && it.ref_id)
        .map(it => ({
          _uid: it._uid ?? uid(),
          ref_id: it.ref_id!,
          nombre: it.nombre,
          porciones: it.cantidad ?? 1,
          tipo: it.tipo as 'receta' | 'producto',
          opsPlaza: it.plaza ?? null,
          opsSeccion: it.seccion_mise ?? null,
          opsCantidad: it.cantidad_ops ?? null,
          opsUnidad: it.unidad_ops ?? null,
        }))
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
        const fuente = pr.tipo === 'producto' ? productos : recetas
        const costo = fuente.find(r => r.id === pr.ref_id)?.costo ?? 0
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
          tipo: pr.tipo,
          ref_id: pr.ref_id,
          nombre: pr.nombre,
          prioridad: 'media' as const,
          plaza: pr.opsPlaza ?? null,
          seccion_mise: pr.opsSeccion ?? null,
          usuario_asignado: null,
          cantidad: pr.porciones,
          unidad: null,
          cantidad_ops: pr.opsCantidad ?? null,
          unidad_ops: pr.opsUnidad ?? null,
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
      <div style={{ background: 'var(--navy)', padding: '46px 12px 10px', flexShrink: 0 }}>
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
          {([
            ['plato',  'restaurant',  'Plato'],
            ['menu',   'menu_book',   'Menú'],
            ['evento', 'celebration', 'Evento'],
          ] as const).map(([id, icon, label]) => (
            <button key={id} onClick={() => cambiarModo(id)}
              style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                background: modo === id ? '#fff' : 'transparent', color: modo === id ? 'var(--navy)' : 'rgba(255,255,255,.7)', transition: 'all .15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Resumen vivo pegajoso */}
      <div style={{ flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'stretch' }}>
        {(() => {
          const Metric = ({ label, value, color, big }: { label: string; value: string; color?: string; big?: boolean }) => (
            <div style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: '5px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
              <div style={{ fontSize: big ? 15 : 13, fontWeight: 800, color: color ?? 'var(--text-1)', fontFamily: 'monospace' }}>{value}</div>
            </div>
          )
          return (
            <>
              <Metric label="Ítems" value={String(esPlato ? platoRecetas.length : items.filter(i => i.nombre.trim()).length)} />
              <Metric label="Costo" value={fmtMoney(costoTotal)} />
              {fcPct != null && <Metric label="Food cost" value={`${fcPct.toFixed(0)}%`} color={fcColor} big />}
              {esPlato && precioN > 0 && <Metric label="Margen" value={fmtMoney(precioN - costoTotal)} color={precioN - costoTotal > 0 ? '#16a34a' : '#dc2626'} />}
            </>
          )
        })()}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '14px 14px 100px' }}>
        {/* ── Bloque DATOS ── */}
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 2px 7px' }}>
          {esPlato ? 'Datos del plato' : modo === 'evento' ? 'Datos del evento' : 'Datos del menú'}
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, marginBottom: 18 }}>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder={esPlato ? 'Nombre del plato' : 'Nombre del menú'} style={{ ...inp, fontWeight: 800, fontSize: 18, marginBottom: 10 }} autoFocus />

          {/* Campos de Plato */}
          {esPlato && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: 14 }}>$</span>
                  <input value={precio} onChange={e => setPrecio(e.target.value)} placeholder="Precio" inputMode="decimal" style={{ ...inp, paddingLeft: 24 }} />
                </div>
                <select value={categoria} onChange={e => setCategoria(e.target.value)} style={{ ...inp, flex: 1, minWidth: 110 }}>
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
            productos={productos}
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
                      plazas={plazas}
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
export type PlatoItem = {
  _uid: number
  ref_id: string
  nombre: string
  porciones: number
  tipo: 'receta' | 'producto'
  // OPS mise (null = no configurado)
  opsPlaza?: string | null
  opsSeccion?: string | null
  opsCantidad?: number | null
  opsUnidad?: string | null
}

function PlatoRecetasEditor({
  recetas, productos, platoRecetas, setPlatoRecetas, costoTotal,
  platoSearch, setPlatoSearch, platoShowResults, setPlatoShowResults,
  editingPorcionUid, setEditingPorcionUid, editingPorcionVal, setEditingPorcionVal, uid,
}: {
  recetas: RefConCosto[]
  productos: RefConCosto[]
  platoRecetas: PlatoItem[]
  setPlatoRecetas: React.Dispatch<React.SetStateAction<PlatoItem[]>>
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
  // OPS panel local — abre/cierra por _uid de la fila
  const [opsPanelUid, setOpsPanelUid] = useState<number | null>(null)
  const [opsPlaza, setOpsPlaza] = useState('')
  const [opsSeccion, setOpsSeccion] = useState('')
  const [opsCantidad, setOpsCantidad] = useState('1')
  const [opsUnidad, setOpsUnidad] = useState('u')

  function openOps(pr: PlatoItem) {
    if (opsPanelUid === pr._uid) { setOpsPanelUid(null); return }
    setOpsPanelUid(pr._uid)
    setOpsPlaza(pr.opsPlaza ?? '')
    setOpsSeccion(pr.opsSeccion ?? '')
    setOpsCantidad(pr.opsCantidad != null ? String(pr.opsCantidad) : '1')
    setOpsUnidad(pr.opsUnidad ?? 'u')
  }

  function saveOps(uid_: number) {
    if (!opsPlaza || !opsSeccion) return
    setPlatoRecetas(prev => prev.map(pr =>
      pr._uid === uid_ ? { ...pr, opsPlaza, opsSeccion, opsCantidad: parseFloat(opsCantidad) || 1, opsUnidad } : pr
    ))
    setOpsPanelUid(null)
  }

  const linkedIds = new Set(platoRecetas.map(pr => pr.ref_id))

  type SearchResult = { tipo: 'receta' | 'producto'; id: string; nombre: string; costo: number }
  const searchResults = useMemo((): SearchResult[] => {
    if (!platoSearch.trim()) return []
    const q = platoSearch.toLowerCase()
    return [
      ...recetas.filter(r => !linkedIds.has(r.id) && r.nombre.toLowerCase().includes(q)).slice(0, 8).map(r => ({ tipo: 'receta' as const, id: r.id, nombre: r.nombre, costo: r.costo })),
      ...productos.filter(p => !linkedIds.has(p.id) && p.nombre.toLowerCase().includes(q)).slice(0, 6).map(p => ({ tipo: 'producto' as const, id: p.id, nombre: p.nombre, costo: p.costo })),
    ].slice(0, 12)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platoSearch, recetas, productos, platoRecetas])

  function agregarItem(r: SearchResult) {
    setPlatoRecetas(prev => [...prev, { _uid: uid(), ref_id: r.id, nombre: r.nombre, porciones: 1, tipo: r.tipo }])
    setPlatoSearch('')
    setPlatoShowResults(false)
  }

  function saveStock(u: number) {
    const val = parseFloat(editingPorcionVal.replace(',', '.'))
    if (!isNaN(val) && val > 0) {
      setPlatoRecetas(prev => prev.map(pr => pr._uid === u ? { ...pr, porciones: val } : pr))
    }
    setEditingPorcionUid(null)
  }

  const headLbl: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase' as const, letterSpacing: '.07em' }
  const totalItems = recetas.length + productos.length

  return (
    <div>
      {/* Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 2px 8px' }}>
        <span style={headLbl}>Recetas y productos del plato</span>
        {platoRecetas.length > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'monospace' }}>· {platoRecetas.length}</span>
        )}
      </div>

      {/* Lista vinculada */}
      {platoRecetas.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
          {platoRecetas.map((pr, idx) => {
            const cfg = TIPO_CFG[pr.tipo]
            const fuente = pr.tipo === 'producto' ? productos : recetas
            const item = fuente.find(r => r.id === pr.ref_id)
            const opsActiva = opsPanelUid === pr._uid
            const opsConf = pr.opsPlaza && pr.opsSeccion
            const plazaCfg = PLAZAS_OPS.find(p => p.id === pr.opsPlaza)

            return (
              <div key={pr._uid}>
                {/* Fila principal */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderBottom: (idx < platoRecetas.length - 1 || opsActiva) ? '1px solid var(--border)' : 'none', background: idx % 2 === 1 ? 'rgba(0,0,0,.01)' : 'transparent' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 17, color: cfg.color, flexShrink: 0 }}>{cfg.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pr.nombre}
                    </div>
                    <div style={{ display: 'flex', gap: 5, marginTop: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                      {item && item.costo > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtMoney(item.costo)}</span>
                      )}
                      {opsConf && plazaCfg && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: `${plazaCfg.color}18`, color: plazaCfg.color }}>
                          OPS {plazaCfg.label} · {pr.opsCantidad ?? 1} {pr.opsUnidad ?? 'u'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stock estándar */}
                  {editingPorcionUid === pr._uid ? (
                    <input autoFocus type="number" value={editingPorcionVal}
                      onChange={e => setEditingPorcionVal(e.target.value)}
                      onBlur={() => saveStock(pr._uid)}
                      onKeyDown={e => { if (e.key === 'Enter') saveStock(pr._uid); if (e.key === 'Escape') setEditingPorcionUid(null) }}
                      style={{ width: 64, textAlign: 'center', fontSize: 13, fontWeight: 700, border: '1.5px solid var(--accent)', borderRadius: 8, padding: '4px 6px', background: 'var(--surface)', color: 'var(--navy)', outline: 'none' }}
                    />
                  ) : (
                    <button onClick={() => { setEditingPorcionUid(pr._uid); setEditingPorcionVal(String(pr.porciones)) }}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', padding: '4px 9px', cursor: 'pointer', minWidth: 42 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'monospace', lineHeight: 1 }}>
                        {pr.porciones % 1 === 0 ? pr.porciones : pr.porciones.toFixed(1)}
                      </span>
                      <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, lineHeight: 1 }}>stock est.</span>
                    </button>
                  )}

                  {/* Botón OPS */}
                  <button onClick={() => openOps(pr)}
                    title="Asignar a OPS / Mise"
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '4px 7px', background: opsActiva ? '#eef2ff' : opsConf ? `${plazaCfg?.color ?? 'var(--accent)'}15` : 'var(--bg)', color: opsActiva ? 'var(--accent)' : opsConf ? (plazaCfg?.color ?? 'var(--accent)') : 'var(--text-3)', cursor: 'pointer', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>restaurant_menu</span>
                    <span style={{ fontSize: 8, fontWeight: 800, lineHeight: 1 }}>OPS</span>
                  </button>

                  <button onClick={() => setPlatoRecetas(prev => prev.filter(x => x._uid !== pr._uid))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-3)', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                  </button>
                </div>

                {/* Panel OPS inline */}
                {opsActiva && (
                  <div style={{ padding: '12px 14px', borderBottom: idx < platoRecetas.length - 1 ? '1px solid var(--border)' : 'none', background: '#f8faff' }}>
                    {/* Plazas */}
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 7 }}>Plaza de producción</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
                      {PLAZAS_OPS.map(p => (
                        <button key={p.id} onClick={() => { setOpsPlaza(opsPlaza === p.id ? '' : p.id); setOpsSeccion('') }}
                          style={{ padding: '5px 11px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                            background: opsPlaza === p.id ? `${p.color}18` : 'var(--surface)',
                            color: opsPlaza === p.id ? p.color : 'var(--text-3)',
                            outline: opsPlaza === p.id ? `1.5px solid ${p.color}50` : '1px solid var(--border)' }}>
                          {p.label}
                        </button>
                      ))}
                    </div>

                    {opsPlaza && (
                      <>
                        {/* Secciones mise */}
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 7 }}>Sección del mise</div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
                          {SECCIONES_OPS.map(s => (
                            <button key={s.id} onClick={() => setOpsSeccion(opsSeccion === s.id ? '' : s.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                                background: opsSeccion === s.id ? 'rgba(67,97,160,.12)' : 'var(--surface)',
                                color: opsSeccion === s.id ? 'var(--accent)' : 'var(--text-3)',
                                outline: opsSeccion === s.id ? '1.5px solid rgba(67,97,160,.3)' : '1px solid var(--border)' }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{s.icono}</span>
                              {s.label}
                            </button>
                          ))}
                        </div>

                        {/* Cantidad + unidad */}
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 7 }}>Cantidad en mise</div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                          <input type="number" value={opsCantidad} onChange={e => setOpsCantidad(e.target.value)} inputMode="decimal"
                            style={{ width: 70, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, fontWeight: 700, textAlign: 'center', fontFamily: 'inherit', outline: 'none', color: 'var(--text-1)' }} />
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {UNIDADES_OPS.map(u => (
                              <button key={u} onClick={() => setOpsUnidad(u)}
                                style={{ padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                                  background: opsUnidad === u ? 'var(--navy)' : 'var(--surface)',
                                  color: opsUnidad === u ? '#fff' : 'var(--text-3)',
                                  outline: opsUnidad === u ? 'none' : '1px solid var(--border)' }}>
                                {u}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Guardar / cancelar */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => saveOps(pr._uid)} disabled={!opsPlaza || !opsSeccion}
                        style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: opsPlaza && opsSeccion ? 'var(--navy)' : 'var(--border)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: opsPlaza && opsSeccion ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                        Guardar OPS
                      </button>
                      {pr.opsPlaza && (
                        <button onClick={() => { setPlatoRecetas(prev => prev.map(x => x._uid === pr._uid ? { ...x, opsPlaza: null, opsSeccion: null, opsCantidad: null, opsUnidad: null } : x)); setOpsPanelUid(null) }}
                          style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Quitar
                        </button>
                      )}
                      <button onClick={() => setOpsPanelUid(null)}
                        style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-3)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {costoTotal > 0 && (
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', background: 'var(--bg)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>Costo total</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)' }}>{fmtMoney(costoTotal)}</span>
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
            placeholder="Buscar receta o producto de stock…"
            style={{ width: '100%', padding: '12px 12px 12px 40px', border: 'none', background: 'transparent', fontSize: 13, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>
        {!platoSearch.trim() && platoRecetas.length === 0 && totalItems > 0 && (
          <div style={{ padding: '8px 14px 10px', fontSize: 11, color: 'var(--text-3)' }}>
            {totalItems} recetas y productos disponibles — escribí para buscar
          </div>
        )}
        {platoShowResults && searchResults.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {searchResults.map((r, idx) => {
              const cfg = TIPO_CFG[r.tipo]
              return (
                <button key={`${r.tipo}-${r.id}`} onMouseDown={e => { e.preventDefault(); agregarItem(r) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', textAlign: 'left', border: 'none', borderBottom: idx < searchResults.length - 1 ? '1px solid var(--border)' : 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: cfg.color, flexShrink: 0 }}>{cfg.icon}</span>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{r.nombre}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: cfg.bg, color: cfg.color, flexShrink: 0 }}>{cfg.label}</span>
                  {r.costo > 0 && <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>{fmtMoney(r.costo)}</span>}
                </button>
              )
            })}
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
  item, expanded, onToggle, onChange, onRemove, recetas, productos, cartaItems, plazas, miseSecciones,
}: {
  item: ItemRow
  expanded: boolean
  onToggle: () => void
  onChange: (patch: Partial<ItemRow>) => void
  onRemove: () => void
  recetas: RefConCosto[]
  productos: RefConCosto[]
  cartaItems: RefConCosto[]
  plazas: string[]
  miseSecciones: { plaza: string; nombre: string }[]
}) {
  const [search, setSearch] = useState('')
  const [showResults, setShowResults] = useState(false)
  const [nuevaPlaza, setNuevaPlaza] = useState('')
  const [nuevaSecMise, setNuevaSecMise] = useState('')

  const seccionesParaPlaza = useMemo(() => {
    const rel = item.plaza ? miseSecciones.filter(s => s.plaza === item.plaza) : miseSecciones
    const base = rel.map(s => s.nombre)
    if (item.seccion_mise && !base.includes(item.seccion_mise)) base.push(item.seccion_mise)
    return Array.from(new Set(base))
  }, [miseSecciones, item.plaza, item.seccion_mise])

  const results = useMemo(() => {
    if (!search.trim()) return []
    const ql = search.toLowerCase()
    return [
      ...recetas.filter(r => r.nombre.toLowerCase().includes(ql)).slice(0, 5).map(r => ({ tipo: 'receta' as const, id: r.id, nombre: r.nombre })),
      ...cartaItems.filter(p => p.nombre.toLowerCase().includes(ql)).slice(0, 4).map(p => ({ tipo: 'plato' as const, id: p.id, nombre: p.nombre })),
      ...productos.filter(p => p.nombre.toLowerCase().includes(ql)).slice(0, 4).map(p => ({ tipo: 'producto' as const, id: p.id, nombre: p.nombre })),
    ].slice(0, 8)
  }, [search, recetas, productos, cartaItems])

  const tcfg = item.tipo ? TIPO_CFG[item.tipo] : null

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
          {!expanded && (item.plaza || item.seccion_mise || item.cantidad != null) && (
            <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
              {item.plaza && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'rgba(67,97,160,.1)', color: 'var(--accent)', textTransform: 'capitalize' }}>{item.plaza}</span>}
              {item.seccion_mise && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#ecfeff', color: '#0e7490' }}>{item.seccion_mise}</span>}
              {item.cantidad != null && <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'monospace' }}>{item.cantidad}{item.unidad ?? ''}</span>}
            </div>
          )}
        </div>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)', flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>expand_more</span>
        <button onClick={e => { e.stopPropagation(); onRemove() }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#ef4444', flexShrink: 0, display: 'flex' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
        </button>
      </div>

      {/* Editor inline */}
      {expanded && (
        <div style={{ padding: '0 12px 12px' }}>
          {/* Buscador unificado */}
          <label style={lbl}>Vincular receta, plato o ingrediente</label>
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

          {/* Sección de mise — dónde aparece en el checklist de Mise */}
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

          {/* Cantidad */}
          <div>
            <label style={lbl}>Cantidad</label>
            <div style={{ display: 'flex', gap: 5 }}>
              <input value={item.cantidad != null ? String(item.cantidad) : ''} onChange={e => onChange({ cantidad: e.target.value.trim() ? parseFloat(e.target.value.replace(',', '.')) : null })} placeholder="250" inputMode="decimal" style={{ ...fieldInp, flex: 1 }} />
              <input value={item.unidad ?? ''} onChange={e => onChange({ unidad: e.target.value || null })} placeholder="u" style={{ ...fieldInp, width: 50 }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
