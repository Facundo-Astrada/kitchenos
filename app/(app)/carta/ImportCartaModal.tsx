'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CartaCategoria } from '@/lib/hooks/useCarta'
import type { RecetaConCosto } from '@/lib/hooks/useRecetas'
import type { ProductoConEstado } from '@/lib/hooks/useStock'

export interface ComponenteImportado {
  nombre: string
  tipo: 'receta' | 'producto' | 'plato' | null
  ref_id: string | null
  ref_nombre: string | null
}

export interface ItemImportado {
  nombre: string
  categoria: string
  descripcion: string
  componentes: ComponenteImportado[]
  precio_venta: number | null
  porciones: number
  tags: string[]
  _sel: boolean
}

export function ImportCartaModal({
  categorias,
  restauranteId,
  recetas,
  productos,
  onClose,
  onDone,
}: {
  categorias: CartaCategoria[]
  restauranteId: string
  recetas: RecetaConCosto[]
  productos: ProductoConEstado[]
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [step, setStep] = useState<'upload' | 'preview'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [items, setItems] = useState<ItemImportado[]>([])
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [platos, setPlatos] = useState<{ id: string; nombre: string }[]>([])
  const [linkSearch, setLinkSearch] = useState<{ key: string; q: string } | null>(null)

  useEffect(() => {
    if (!restauranteId) return
    createClient()
      .from('platos_compuestos')
      .select('id, nombre')
      .eq('restaurante_id', restauranteId)
      .eq('activo', true)
      .then(({ data }) => setPlatos((data ?? []) as { id: string; nombre: string }[]))
  }, [restauranteId])

  const catNombres = categorias.length > 0
    ? categorias.map(c => c.nombre)
    : ['Entradas', 'Principales', 'Postres', 'Bebidas', 'Guarniciones']

  const TAG_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
    's/tacc':       { label: 'S/TACC',        bg: '#fef3c7', color: '#92400e' },
    'vegano':       { label: 'Vegano',         bg: '#d1fae5', color: '#065f46' },
    'vegetariano':  { label: 'Vegetariano',    bg: '#dcfce7', color: '#166534' },
    'keto':         { label: 'Keto',           bg: '#ede9fe', color: '#5b21b6' },
    'picante':      { label: '🌶 Picante',     bg: '#fee2e2', color: '#991b1b' },
    'sin lactosa':  { label: 'Sin lactosa',    bg: '#e0f2fe', color: '#075985' },
  }

  const TIPO_CFG = {
    receta:   { icon: 'menu_book',    color: '#4361a0', bg: '#eef2ff', label: 'Receta' },
    producto: { icon: 'inventory_2',  color: '#059669', bg: '#d1fae5', label: 'Producto' },
    plato:    { icon: 'restaurant',   color: '#f97316', bg: '#ffedd5', label: 'Producción' },
  }

  // Auto-match: busca el candidato más cercano en las tres fuentes
  function autoMatch(nombre: string): ComponenteImportado {
    const q = nombre.toLowerCase().trim()
    function score(n: string) {
      n = n.toLowerCase()
      if (n === q) return 4
      if (n.startsWith(q) || q.startsWith(n)) return 3
      if (n.includes(q) || q.includes(n)) return 2
      // palabras comunes
      const qw = q.split(/\s+/)
      const nw = n.split(/\s+/)
      const shared = qw.filter(w => w.length > 2 && nw.some(v => v.includes(w) || w.includes(v))).length
      return shared > 0 ? 1 : 0
    }
    const best = (arr: { id: string; nombre: string }[], tipo: ComponenteImportado['tipo']) => {
      const hit = arr.map(x => ({ x, s: score(x.nombre) })).filter(r => r.s > 0).sort((a, b) => b.s - a.s)[0]
      return hit ? { nombre, tipo, ref_id: hit.x.id, ref_nombre: hit.x.nombre } : null
    }
    return (
      best(recetas, 'receta') ??
      best(productos, 'producto') ??
      best(platos, 'plato') ??
      { nombre, tipo: null, ref_id: null, ref_nombre: null }
    )
  }

  function searchResults(q: string) {
    if (!q.trim()) return []
    const ql = q.toLowerCase()
    const results: { tipo: ComponenteImportado['tipo']; id: string; nombre: string }[] = [
      ...recetas.filter(r => r.nombre.toLowerCase().includes(ql)).slice(0, 5).map(r => ({ tipo: 'receta' as const, id: r.id, nombre: r.nombre })),
      ...productos.filter(p => p.nombre.toLowerCase().includes(ql)).slice(0, 5).map(p => ({ tipo: 'producto' as const, id: p.id, nombre: p.nombre })),
      ...platos.filter(p => p.nombre.toLowerCase().includes(ql)).slice(0, 5).map(p => ({ tipo: 'plato' as const, id: p.id, nombre: p.nombre })),
    ]
    return results.slice(0, 8)
  }

  const handleFile = (f: File) => { setFile(f); setError('') }

  const handleParse = async () => {
    if (!file) return
    setParsing(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('modo', 'preview')
      const res = await fetch('/api/carta/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al parsear')
      type RawItem = { nombre: string; categoria: string; descripcion: string; componentes: string[]; precio_venta: number | null; porciones: number; tags: string[] }
      setItems((data.items as RawItem[]).map(i => ({
        ...i,
        componentes: (i.componentes ?? []).map((c: string | ComponenteImportado) =>
          autoMatch(typeof c === 'string' ? c : c.nombre)
        ),
        porciones: i.porciones ?? 1,
        tags: i.tags ?? [],
        _sel: true,
      })))
      setStep('preview')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al parsear archivo')
    } finally { setParsing(false) }
  }

  const handleApply = async () => {
    const selected = items.filter(i => i._sel)
    if (selected.length === 0) return
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('modo', 'apply')
      fd.append('restaurante_id', restauranteId)
      fd.append('items', JSON.stringify(selected.map(({ _sel: _, ...rest }) => rest)))
      const res = await fetch('/api/carta/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      onDone(`${data.insertados} platos importados`)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally { setSaving(false) }
  }

  const updateItem = <K extends keyof ItemImportado>(idx: number, key: K, val: ItemImportado[K]) =>
    setItems(prev => prev.map((p, i) => i === idx ? { ...p, [key]: val } : p))

  const updateComp = (itemIdx: number, compIdx: number, patch: Partial<ComponenteImportado>) =>
    setItems(prev => prev.map((p, i) => {
      if (i !== itemIdx) return p
      const comps = p.componentes.map((c, ci) => ci === compIdx ? { ...c, ...patch } : c)
      return { ...p, componentes: comps }
    }))

  const linkComp = (itemIdx: number, compIdx: number, tipo: ComponenteImportado['tipo'], id: string, nombre: string) => {
    updateComp(itemIdx, compIdx, { tipo, ref_id: id, ref_nombre: nombre })
    setLinkSearch(null)
  }

  const removeComp = (itemIdx: number, compIdx: number) =>
    setItems(prev => prev.map((p, i) => i === itemIdx
      ? { ...p, componentes: p.componentes.filter((_, ci) => ci !== compIdx) }
      : p
    ))

  const addComp = (itemIdx: number) =>
    setItems(prev => prev.map((p, i) => i === itemIdx
      ? { ...p, componentes: [...p.componentes, { nombre: '', tipo: null, ref_id: null, ref_nombre: null }] }
      : p
    ))

  const toggleTag = (idx: number, tag: string) =>
    setItems(prev => prev.map((p, i) => {
      if (i !== idx) return p
      const has = p.tags.includes(tag)
      return { ...p, tags: has ? p.tags.filter(t => t !== tag) : [...p.tags, tag] }
    }))

  const allSel = items.every(i => i._sel)
  const selCount = items.filter(i => i._sel).length

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end',
    }}>
      <div style={{
        width: '100%', maxHeight: '92vh', background: 'var(--surface)',
        borderRadius: '20px 20px 0 0', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ background: 'var(--navy)', padding: '20px 16px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Importar carta</div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 }}>
              {step === 'upload' ? 'PDF · imagen · Excel · texto' : `${items.length} platos detectados · ${selCount} seleccionados`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

          {/* ── Upload step ── */}
          {step === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 10, padding: 32,
                border: `2px dashed ${file ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 14, cursor: 'pointer',
                background: file ? '#eef2ff' : 'var(--bg)',
              }}>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.csv,.txt" style={{ display: 'none' }}
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                <span className="material-symbols-outlined" style={{ fontSize: 40, color: file ? 'var(--accent)' : 'var(--text-3)' }}>
                  {file ? 'description' : 'upload_file'}
                </span>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: file ? 'var(--accent)' : 'var(--text-1)' }}>
                    {file ? file.name : 'Tocá para subir un archivo'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                    Foto de la carta, PDF, Excel o texto plano
                  </div>
                </div>
              </label>

              <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>La IA extrae automáticamente</div>
                {[
                  ['restaurant', 'Nombre del plato y sus componentes/sub-recetas'],
                  ['sell', 'Precio de venta'],
                  ['restaurant_menu', 'Categoría (Entradas, Principales, Postres…)'],
                  ['fiber_manual_record', 'Porciones (individual / para compartir)'],
                  ['eco', 'Tags dietarios: S/TACC, Vegano, Vegetariano, Keto'],
                ].map(([icon, text]) => (
                  <div key={icon} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--accent)' }}>{icon}</span>
                    {text}
                  </div>
                ))}
              </div>

              {error && <div style={{ color: '#dc2626', fontSize: 13, padding: '8px 12px', background: '#fee2e2', borderRadius: 8 }}>{error}</div>}
            </div>
          )}

          {/* ── Preview step ── */}
          {step === 'preview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Sel global */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  Revisá y editá antes de importar
                </div>
                <button onClick={() => setItems(prev => prev.map(i => ({ ...i, _sel: !allSel })))}
                  style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  {allSel ? 'Deseleccionar todo' : 'Seleccionar todo'}
                </button>
              </div>

              {items.map((item, idx) => (
                <div key={idx} style={{
                  background: 'var(--bg)', borderRadius: 12,
                  border: `1.5px solid ${item._sel ? 'var(--accent)' : 'var(--border)'}`,
                  overflow: 'hidden', opacity: item._sel ? 1 : 0.45,
                }}>
                  {/* Card header: checkbox + nombre + precio */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px 8px' }}>
                    <input type="checkbox" checked={item._sel}
                      onChange={e => updateItem(idx, '_sel', e.target.checked)}
                      style={{ marginTop: 4, accentColor: 'var(--accent)', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Nombre editable */}
                      <input
                        value={item.nombre}
                        onChange={e => updateItem(idx, 'nombre', e.target.value)}
                        style={{
                          width: '100%', fontWeight: 700, fontSize: 14, color: 'var(--text-1)',
                          border: 'none', background: 'transparent', padding: 0, outline: 'none',
                        }}
                      />
                      {/* Fila: categoría + porciones + precio */}
                      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                          value={item.categoria}
                          onChange={e => updateItem(idx, 'categoria', e.target.value)}
                          style={{
                            fontSize: 11, padding: '3px 6px', borderRadius: 6,
                            border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--accent)',
                          }}
                        >
                          {catNombres.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>

                        {/* Porciones */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--text-3)' }}>group</span>
                          <select
                            value={item.porciones}
                            onChange={e => updateItem(idx, 'porciones', Number(e.target.value))}
                            style={{
                              fontSize: 11, padding: '3px 6px', borderRadius: 6,
                              border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)',
                            }}
                          >
                            {[1, 2, 3, 4].map(n => (
                              <option key={n} value={n}>{n === 1 ? 'Individual' : `Para ${n}`}</option>
                            ))}
                          </select>
                        </div>

                        {/* Precio */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 'auto' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>$</span>
                          <input
                            type="number"
                            placeholder="Precio"
                            value={item.precio_venta ?? ''}
                            onChange={e => updateItem(idx, 'precio_venta', e.target.value ? parseFloat(e.target.value) : null)}
                            style={{
                              width: 75, fontSize: 13, fontWeight: 700, color: 'var(--navy)',
                              border: '1px solid var(--border)', borderRadius: 6,
                              padding: '2px 6px', background: 'var(--surface)', textAlign: 'right',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Componentes */}
                  <div style={{ padding: '0 12px 10px 34px' }}>
                    {item.componentes.length > 0 && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                        Componentes
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {item.componentes.map((comp, ci) => {
                        const key = `${idx}-${ci}`
                        const isSearching = linkSearch?.key === key
                        const tipoCfg = comp.tipo ? TIPO_CFG[comp.tipo] : null
                        const results = isSearching ? searchResults(linkSearch.q) : []
                        return (
                          <div key={ci}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              {/* Nombre editable */}
                              <input
                                value={comp.nombre}
                                onChange={e => updateComp(idx, ci, { nombre: e.target.value })}
                                placeholder="nombre..."
                                style={{
                                  flex: 1, fontSize: 12, padding: '4px 8px', borderRadius: 8,
                                  border: '1px solid var(--border)', background: 'var(--surface)',
                                  color: 'var(--text-1)', outline: 'none',
                                }}
                              />
                              {/* Badge de tipo / botón vincular */}
                              <button
                                onClick={() => setLinkSearch(isSearching ? null : { key, q: comp.nombre })}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 3,
                                  padding: '3px 7px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                  fontSize: 10, fontWeight: 700,
                                  background: tipoCfg ? tipoCfg.bg : 'var(--bg)',
                                  color: tipoCfg ? tipoCfg.color : 'var(--text-3)',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                                  {tipoCfg ? tipoCfg.icon : 'link'}
                                </span>
                                {tipoCfg ? tipoCfg.label : 'vincular'}
                              </button>
                              {/* Desvincular */}
                              {comp.tipo && (
                                <button
                                  onClick={() => updateComp(idx, ci, { tipo: null, ref_id: null, ref_nombre: null })}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 3px', color: 'var(--text-3)', fontSize: 14, lineHeight: 1 }}
                                  title="Quitar vínculo"
                                >×</button>
                              )}
                              {/* Eliminar componente */}
                              <button
                                onClick={() => removeComp(idx, ci)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 3px', color: '#ef4444', fontSize: 14, lineHeight: 1 }}
                                title="Eliminar"
                              >🗑</button>
                            </div>
                            {/* Nombre del vinculo */}
                            {comp.ref_nombre && (
                              <div style={{ fontSize: 10, color: tipoCfg?.color, marginLeft: 8, marginTop: 1 }}>
                                → {comp.ref_nombre}
                              </div>
                            )}
                            {/* Dropdown de búsqueda */}
                            {isSearching && (
                              <div style={{ marginTop: 3, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,.12)' }}>
                                <input
                                  autoFocus
                                  value={linkSearch.q}
                                  onChange={e => setLinkSearch({ key, q: e.target.value })}
                                  placeholder="Buscar receta, producto o producción..."
                                  style={{ width: '100%', padding: '8px 10px', border: 'none', borderBottom: '1px solid var(--border)', fontSize: 12, outline: 'none', boxSizing: 'border-box', background: 'var(--bg)' }}
                                />
                                {results.length === 0 ? (
                                  <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-3)' }}>
                                    {linkSearch.q.length < 1 ? 'Escribí para buscar' : 'Sin resultados'}
                                  </div>
                                ) : (
                                  results.map(r => {
                                    const tc = TIPO_CFG[r.tipo!]
                                    return (
                                      <button
                                        key={`${r.tipo}-${r.id}`}
                                        onMouseDown={e => { e.preventDefault(); linkComp(idx, ci, r.tipo, r.id, r.nombre) }}
                                        style={{
                                          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                          padding: '8px 10px', background: 'none', border: 'none',
                                          borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left',
                                        }}
                                      >
                                        <span className="material-symbols-outlined" style={{ fontSize: 13, color: tc.color }}>{tc.icon}</span>
                                        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-1)' }}>{r.nombre}</span>
                                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: tc.bg, color: tc.color }}>{tc.label}</span>
                                      </button>
                                    )
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                      <button
                        onClick={() => addComp(idx)}
                        style={{
                          alignSelf: 'flex-start', fontSize: 11, padding: '3px 10px', borderRadius: 8,
                          border: '1px dashed var(--accent)', background: 'transparent',
                          color: 'var(--accent)', cursor: 'pointer', fontWeight: 600,
                        }}
                      >+ componente</button>
                    </div>
                  </div>

                  {/* Tags dietarios */}
                  <div style={{ padding: '0 12px 10px 34px', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {Object.entries(TAG_CONFIG).map(([key, cfg]) => {
                      const active = item.tags.includes(key)
                      return (
                        <button
                          key={key}
                          onClick={() => toggleTag(idx, key)}
                          style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            border: `1px solid ${active ? cfg.color + '50' : 'var(--border)'}`,
                            background: active ? cfg.bg : 'var(--surface)',
                            color: active ? cfg.color : 'var(--text-3)',
                            cursor: 'pointer',
                          }}
                        >{cfg.label}</button>
                      )
                    })}
                  </div>
                </div>
              ))}

              {error && <div style={{ color: '#dc2626', fontSize: 13, padding: '8px 12px', background: '#fee2e2', borderRadius: 8 }}>{error}</div>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
          {step === 'upload' ? (
            <>
              <button onClick={onClose} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleParse} disabled={!file || parsing} style={{
                flex: 2, padding: '12px', borderRadius: 12, border: 'none',
                background: file && !parsing ? 'var(--navy)' : 'var(--border)',
                color: '#fff', fontWeight: 700, cursor: file && !parsing ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                {parsing
                  ? <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>progress_activity</span> Analizando...</>
                  : <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>psychology</span> Analizar con IA</>
                }
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setStep('upload')} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontWeight: 600, cursor: 'pointer' }}>
                Volver
              </button>
              <button onClick={handleApply} disabled={selCount === 0 || saving} style={{
                flex: 2, padding: '12px', borderRadius: 12, border: 'none',
                background: selCount > 0 && !saving ? 'var(--navy)' : 'var(--border)',
                color: '#fff', fontWeight: 700, cursor: selCount > 0 && !saving ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                {saving
                  ? <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>progress_activity</span> Guardando...</>
                  : <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span> Agregar {selCount} plato{selCount !== 1 ? 's' : ''}</>
                }
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
