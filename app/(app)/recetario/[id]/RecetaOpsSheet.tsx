'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PLAZAS_OPS, SECCIONES_OPS, upsertMiseChecklistItem } from '@/lib/ops/mise'

const UNIDADES_OPS = ['u', 'kg', 'g', 'l', 'ml', 'pax', 'porc', 'bandeja']
const UNIDADES_PORCION = ['g', 'kg', 'u', 'porc', 'ml', 'l']

const toG = (v: number, u: string) => (u === 'kg' ? v * 1000 : u === 'g' ? v : null)

// ════════════════════════════════════════════════════════════
// RECETA OPS SHEET — asignar una receta al mise (plaza / sección /
// recipiente / peso por porción). Escribe checklist_items keyed por
// (restaurante_id, receta_id, plaza) vía el helper compartido.
// ════════════════════════════════════════════════════════════
export default function RecetaOpsSheet({
  recetaId, recetaNombre, restauranteId, onClose, onSaved,
}: {
  recetaId: string
  recetaNombre: string
  restauranteId: string
  onClose: () => void
  onSaved?: () => void
}) {
  const [plaza, setPlaza] = useState('')
  const [seccion, setSeccion] = useState('')
  const [recipiente, setRecipiente] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [unidad, setUnidad] = useState('porc')
  const [pesoPorcion, setPesoPorcion] = useState('')
  const [pesoPorcionUnidad, setPesoPorcionUnidad] = useState('g')
  const [saving, setSaving] = useState(false)
  const [existingId, setExistingId] = useState<string | null>(null)

  // Prefill desde el checklist_item existente (si ya tiene OPS asignado)
  useEffect(() => {
    let cancel = false
    createClient()
      .from('checklist_items')
      .select('id, plaza, seccion, cantidad, unidad, recipiente_nombre, recipiente_capacidad, peso_porcion, peso_porcion_unidad')
      .eq('restaurante_id', restauranteId)
      .eq('receta_id', recetaId)
      .limit(1)
      .then(({ data }) => {
        if (cancel) return
        const row = data?.[0] as {
          id: string; plaza: string; seccion: string | null; cantidad: number | null; unidad: string | null
          recipiente_nombre: string | null; recipiente_capacidad: number | null
          peso_porcion: number | null; peso_porcion_unidad: string | null
        } | undefined
        if (!row) return
        setExistingId(row.id)
        setPlaza(row.plaza ?? '')
        const secCfg = SECCIONES_OPS.find(s => s.label === row.seccion)
        setSeccion(secCfg?.id ?? '')
        setRecipiente(row.recipiente_nombre ?? '')
        const cap = row.recipiente_capacidad ?? row.cantidad
        setCantidad(cap != null ? String(cap) : '')
        setUnidad(row.unidad ?? 'porc')
        setPesoPorcion(row.peso_porcion != null ? String(row.peso_porcion) : '')
        setPesoPorcionUnidad(row.peso_porcion_unidad ?? 'g')
      })
    return () => { cancel = true }
  }, [recetaId, restauranteId])

  const capVal = parseFloat(cantidad) || 0
  const porVal = parseFloat(pesoPorcion) || 0
  const capG = toG(capVal, unidad)
  const porG = toG(porVal, pesoPorcionUnidad)
  const porcionesAuto = capG !== null && porG !== null && porG > 0 ? Math.round(capG / porG) : null

  async function handleSave() {
    if (!plaza || !seccion) return
    setSaving(true)
    try {
      const supabase = createClient()
      const recipNombre = recipiente.trim() || null
      const pesoP = recipNombre && pesoPorcion ? parseFloat(pesoPorcion) || null : null
      const pesoPUnidad = pesoP ? pesoPorcionUnidad : null
      // Si la unidad es de porciones/unidades usamos el valor directo;
      // si es peso y hay tamaño de porción, guardamos las porciones calculadas.
      const cantidadFinal = ['porc', 'u', 'pax'].includes(unidad)
        ? capVal
        : (porcionesAuto ?? capVal)
      await upsertMiseChecklistItem({
        supabase,
        restauranteId,
        recetaId,
        nombre: recetaNombre,
        plaza,
        seccionMiseId: seccion,
        cantidad: cantidadFinal,
        unidad,
        recipienteNombre: recipNombre,
        pesoPorcion: pesoP,
        pesoPorcionUnidad: pesoPUnidad,
      })
      onSaved?.()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleQuitar() {
    if (!existingId) { onClose(); return }
    setSaving(true)
    try {
      await createClient().from('checklist_items').delete().eq('id', existingId)
      onSaved?.()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[200]" style={{ background: 'rgba(0,0,0,.45)' }} onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[201]"
        style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', maxHeight: '88dvh', display: 'flex', flexDirection: 'column', maxWidth: 520, margin: '0 auto' }}
      >
        {/* Título fijo */}
        <div style={{ padding: '18px 16px 10px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--accent)' }}>restaurant_menu</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Asignar a OPS / Mise</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recetaNombre}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-3)', display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
          </button>
        </div>

        {/* Cuerpo scrolleable */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '14px 16px' }}>
          {/* Plaza */}
          <div style={secTitle}>Plaza de producción</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
            {PLAZAS_OPS.map(p => (
              <button key={p.id} onClick={() => { setPlaza(plaza === p.id ? '' : p.id); setSeccion('') }}
                style={{ padding: '6px 12px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                  background: plaza === p.id ? `${p.color}18` : 'var(--bg)',
                  color: plaza === p.id ? p.color : 'var(--text-3)',
                  outline: plaza === p.id ? `1.5px solid ${p.color}50` : '1px solid var(--border)' }}>
                {p.label}
              </button>
            ))}
          </div>

          {plaza && (
            <>
              {/* Sección del mise */}
              <div style={secTitle}>Sección del mise</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
                {SECCIONES_OPS.map(s => (
                  <button key={s.id} onClick={() => setSeccion(seccion === s.id ? '' : s.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                      background: seccion === s.id ? 'rgba(67,97,160,.12)' : 'var(--bg)',
                      color: seccion === s.id ? 'var(--accent)' : 'var(--text-3)',
                      outline: seccion === s.id ? '1.5px solid rgba(67,97,160,.3)' : '1px solid var(--border)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{s.icono}</span>
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Recipiente */}
              <div style={secTitle}>Recipiente (opcional)</div>
              <input type="text" value={recipiente} onChange={e => { setRecipiente(e.target.value); if (!e.target.value.trim()) setPesoPorcion('') }}
                placeholder="ej: tupper, cubeta GN, bandeja"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: 'var(--text-1)', boxSizing: 'border-box', marginBottom: 14 }} />

              {/* Cantidad + unidad */}
              <div style={secTitle}>{recipiente.trim() ? 'Porciones/peso recipiente lleno' : 'Cantidad en mise'}</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <input type="number" value={cantidad} onChange={e => setCantidad(e.target.value)} inputMode="decimal" placeholder="0"
                  style={{ width: 74, padding: '9px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, fontWeight: 700, textAlign: 'center', fontFamily: 'inherit', outline: 'none', color: 'var(--text-1)' }} />
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {UNIDADES_OPS.map(u => (
                    <button key={u} onClick={() => setUnidad(u)}
                      style={{ padding: '7px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                        background: unidad === u ? 'var(--navy)' : 'var(--bg)', color: unidad === u ? '#fff' : 'var(--text-3)',
                        outline: unidad === u ? 'none' : '1px solid var(--border)' }}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tamaño por porción — solo con recipiente */}
              {recipiente.trim() && (
                <>
                  <div style={secTitle}>Tamaño por porción</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4, flexWrap: 'wrap' }}>
                    <input type="number" value={pesoPorcion} onChange={e => setPesoPorcion(e.target.value)} inputMode="decimal" placeholder="ej: 110"
                      style={{ width: 74, padding: '9px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, fontWeight: 700, textAlign: 'center', fontFamily: 'inherit', outline: 'none', color: 'var(--text-1)' }} />
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {UNIDADES_PORCION.map(u => (
                        <button key={u} onClick={() => setPesoPorcionUnidad(u)}
                          style={{ padding: '7px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                            background: pesoPorcionUnidad === u ? 'var(--accent)' : 'var(--bg)', color: pesoPorcionUnidad === u ? '#fff' : 'var(--text-3)',
                            outline: pesoPorcionUnidad === u ? 'none' : '1px solid var(--border)' }}>
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                  {porcionesAuto !== null && cantidad && pesoPorcion ? (
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 8, paddingLeft: 2 }}>
                      = {porcionesAuto} porciones por recipiente
                    </div>
                  ) : <div style={{ marginBottom: 8 }} />}
                </>
              )}
            </>
          )}
        </div>

        {/* Acciones fijas */}
        <div style={{ padding: '10px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', flexShrink: 0, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          {existingId && (
            <button onClick={handleQuitar} disabled={saving}
              style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', color: '#ef4444', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Quitar
            </button>
          )}
          <button onClick={handleSave} disabled={saving || !plaza || !seccion}
            style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: plaza && seccion ? 'var(--navy)' : 'var(--border)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: plaza && seccion ? 'pointer' : 'default', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
            {saving ? '…' : 'Guardar OPS'}
          </button>
        </div>
      </div>
    </>
  )
}

const secTitle: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }
