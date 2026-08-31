'use client'

import { useState, useMemo } from 'react'
import type { CartaItemEnriquecido } from '@/lib/hooks/useCarta'
import type { ProductoConEstado } from '@/lib/hooks/useStock'
import type { PackagingGrupo } from '@/lib/hooks/usePackagingGrupos'

export function PackagingGruposDrawer({
  grupos,
  productos,
  platoActual,
  todosLosPlatos,
  onCrearGrupo,
  onEliminarGrupo,
  onAplicarGrupo,
  onClose,
  onAfterApply,
}: {
  grupos: PackagingGrupo[]
  productos: ProductoConEstado[]
  platoActual: CartaItemEnriquecido
  todosLosPlatos: CartaItemEnriquecido[]
  onCrearGrupo: (nombre: string, items: { productoId: string; cantidad: number }[]) => Promise<string>
  onEliminarGrupo: (id: string) => Promise<void>
  onAplicarGrupo: (grupoId: string, platoIds: string[]) => Promise<void>
  onClose: () => void
  onAfterApply: () => Promise<void>
}) {
  type Step = 'list' | 'create' | 'replicate'
  const [step, setStep] = useState<Step>('list')
  const [saving, setSaving] = useState(false)

  // Create state
  const [crearNombre, setCrearNombre] = useState('')
  const [crearItems, setCrearItems] = useState<{ productoId: string; cantidad: number; nombre: string; unidad: string }[]>([])
  const [crearSearch, setCrearSearch] = useState('')
  const [pendingProd, setPendingProd] = useState<ProductoConEstado | null>(null)
  const [pendingCantidad, setPendingCantidad] = useState('1')

  // Replicate state
  const [replicarGrupoId, setReplicarGrupoId] = useState<string | null>(null)
  const [replicarSelected, setReplicarSelected] = useState<Set<string>>(new Set())

  const linkedProdIds = useMemo(() => new Set(crearItems.map(i => i.productoId)), [crearItems])
  const crearFiltrados = useMemo(() => {
    const base = productos.filter(p => !linkedProdIds.has(p.id))
    if (!crearSearch.trim()) return base.slice(0, 15)
    const q = crearSearch.toLowerCase()
    return base.filter(p => p.nombre.toLowerCase().includes(q)).slice(0, 15)
  }, [productos, crearSearch, linkedProdIds])

  const handleAgregarAGrupo = () => {
    if (!pendingProd) return
    setCrearItems(prev => [...prev, {
      productoId: pendingProd.id,
      cantidad: parseFloat(pendingCantidad) || 1,
      nombre: pendingProd.nombre,
      unidad: pendingProd.unidad,
    }])
    setPendingProd(null)
    setCrearSearch('')
    setPendingCantidad('1')
  }

  const handleGuardarGrupo = async () => {
    if (!crearNombre.trim() || crearItems.length === 0) return
    setSaving(true)
    try {
      await onCrearGrupo(crearNombre.trim(), crearItems.map(i => ({ productoId: i.productoId, cantidad: i.cantidad })))
      setStep('list')
      setCrearNombre('')
      setCrearItems([])
    } finally { setSaving(false) }
  }

  const handleUsarAqui = async (grupoId: string) => {
    setSaving(true)
    try {
      await onAplicarGrupo(grupoId, [platoActual.id])
      await onAfterApply()
    } finally { setSaving(false) }
  }

  const handleIniciarReplica = (grupoId: string) => {
    setReplicarGrupoId(grupoId)
    setReplicarSelected(new Set([platoActual.id]))
    setStep('replicate')
  }

  const toggleReplica = (platoId: string) => {
    setReplicarSelected(prev => {
      const next = new Set(prev)
      if (next.has(platoId)) next.delete(platoId)
      else next.add(platoId)
      return next
    })
  }

  const handleReplicar = async () => {
    if (!replicarGrupoId || replicarSelected.size === 0) return
    setSaving(true)
    try {
      await onAplicarGrupo(replicarGrupoId, [...replicarSelected])
      await onAfterApply()
    } finally { setSaving(false) }
  }

  const grupoReplicar = grupos.find(g => g.id === replicarGrupoId)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button
          onClick={step === 'list' ? onClose : () => setStep('list')}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 17, flex: 1 }}>
          {step === 'list' ? 'Grupos de packaging' : step === 'create' ? 'Nuevo grupo' : `Replicar "${grupoReplicar?.nombre ?? ''}"`}
        </span>
        {step === 'list' && (
          <button
            onClick={() => setStep('create')}
            style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 8, padding: '6px 12px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            Crear grupo
          </button>
        )}
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>

        {/* ── STEP: list ── */}
        {step === 'list' && (
          <>
            {grupos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)', fontSize: 13 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 40, display: 'block', marginBottom: 8 }}>inventory_2</span>
                No hay grupos creados aún
                <br />
                <button onClick={() => setStep('create')} style={{ marginTop: 12, padding: '8px 20px', borderRadius: 10, background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Crear primer grupo
                </button>
              </div>
            ) : (
              grupos.map(g => (
                <div key={g.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#ea580c', flexShrink: 0 }}>inventory_2</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{g.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{g.items.length} artículo{g.items.length !== 1 ? 's' : ''}</div>
                    </div>
                    <button
                      onClick={() => { if (confirm(`Eliminar grupo "${g.nombre}"?`)) onEliminarGrupo(g.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                    </button>
                  </div>
                  {g.items.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '8px 14px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {g.items.map(item => (
                        <span key={item.id} style={{ fontSize: 11, background: 'rgba(234,88,12,.08)', color: '#ea580c', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
                          {item.producto_nombre} × {item.cantidad}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                    <button
                      disabled={saving}
                      onClick={() => handleUsarAqui(g.id)}
                      style={{ padding: '10px', border: 'none', background: 'none', color: 'var(--accent)', fontWeight: 700, fontSize: 12, cursor: 'pointer', borderRight: '1px solid var(--border)', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add_circle</span>
                      Usar en este plato
                    </button>
                    <button
                      onClick={() => handleIniciarReplica(g.id)}
                      style={{ padding: '10px', border: 'none', background: 'none', color: 'var(--text-2)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>content_copy</span>
                      Replicar en platos
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* ── STEP: create ── */}
        {step === 'create' && (
          <>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Nombre del grupo</label>
              <input
                autoFocus
                value={crearNombre}
                onChange={e => setCrearNombre(e.target.value)}
                placeholder="Ej: Delivery básico, Take away premium…"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, color: 'var(--text-1)', fontFamily: 'inherit' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Artículos del grupo</label>
              {crearItems.length > 0 && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
                  {crearItems.map((item, idx) => (
                    <div key={item.productoId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: idx < crearItems.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#ea580c', flexShrink: 0 }}>inventory_2</span>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{item.nombre}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{item.cantidad} {item.unidad}</span>
                      <button onClick={() => setCrearItems(prev => prev.filter(i => i.productoId !== item.productoId))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                {pendingProd ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-1)', flex: 1 }}>{pendingProd.nombre}</span>
                    <input
                      type="number" min="0.1" step="1"
                      value={pendingCantidad}
                      onChange={e => setPendingCantidad(e.target.value)}
                      style={{ width: 56, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text-1)' }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{pendingProd.unidad}</span>
                    <button onClick={handleAgregarAGrupo} style={{ background: 'var(--navy)', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                      + Agregar
                    </button>
                    <button onClick={() => { setPendingProd(null); setCrearSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      value={crearSearch}
                      onChange={e => setCrearSearch(e.target.value)}
                      placeholder="Buscar artículo de stock…"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit' }}
                    />
                    {crearFiltrados.length > 0 && (
                      <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 6, border: '1px solid var(--border)', borderRadius: 8 }}>
                        {crearFiltrados.map(p => (
                          <button
                            key={p.id}
                            onClick={() => { setPendingProd(p); setPendingCantidad('1') }}
                            style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', border: 'none', background: 'none', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-3)' }}>{p.unidad}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <button
              disabled={saving || !crearNombre.trim() || crearItems.length === 0}
              onClick={handleGuardarGrupo}
              style={{ padding: '13px', borderRadius: 12, background: (crearNombre.trim() && crearItems.length > 0) ? 'var(--navy)' : '#ccc', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? .6 : 1 }}
            >
              {saving ? 'Guardando…' : 'Guardar grupo'}
            </button>
          </>
        )}

        {/* ── STEP: replicate ── */}
        {step === 'replicate' && grupoReplicar && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
              Seleccioná los platos donde aplicar <strong>{grupoReplicar.nombre}</strong>:
            </p>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {todosLosPlatos.map((plato, idx) => {
                const checked = replicarSelected.has(plato.id)
                const esCurrent = plato.id === platoActual.id
                return (
                  <button
                    key={plato.id}
                    onClick={() => toggleReplica(plato.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                      padding: '12px 14px', textAlign: 'left', border: 'none',
                      background: checked ? 'rgba(67,97,160,.07)' : 'none',
                      borderBottom: idx < todosLosPlatos.length - 1 ? '1px solid var(--border)' : 'none',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 6, border: `2px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                      background: checked ? 'var(--accent)' : 'transparent', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {checked && <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#fff' }}>check</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                        {plato.nombre}
                        {esCurrent && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>este plato</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{plato.categoria}</div>
                    </div>
                  </button>
                )
              })}
            </div>

            <button
              disabled={saving || replicarSelected.size === 0}
              onClick={handleReplicar}
              style={{ padding: '13px', borderRadius: 12, background: replicarSelected.size > 0 ? 'var(--navy)' : '#ccc', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? .6 : 1 }}
            >
              {saving ? 'Aplicando…' : `Aplicar a ${replicarSelected.size} plato${replicarSelected.size !== 1 ? 's' : ''}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
