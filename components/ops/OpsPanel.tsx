'use client'

import { useState } from 'react'
import { PLAZAS_OPS, SECCIONES_OPS } from '@/lib/ops/mise'

// ════════════════════════════════════════════════════════════
// OPS PANEL — panel único de asignación a OPS / mise.
// Campos: plaza → sección del mise → recipiente → cantidad+unidad →
// tamaño por porción (con cálculo de porciones auto).
// Fuente única reutilizada por: RecetaOpsSheet (ficha del recetario),
// PlatoRecetasEditor (carta → plato) y — desde Tanda C — el ítem de
// composición de menú/evento. NO duplicar esta UI en ningún otro lado.
// ════════════════════════════════════════════════════════════

export const UNIDADES_OPS = ['u', 'kg', 'g', 'l', 'ml', 'pax', 'porc', 'bandeja']
export const UNIDADES_PORCION = ['g', 'kg', 'u', 'porc', 'ml', 'l']

const toG = (v: number, u: string) => (u === 'kg' ? v * 1000 : u === 'g' ? v : null)

// Valor inicial para prefill (el caller mapea desde su fuente: checklist_items,
// PlatoItem, CompItemOut, etc.). `seccion` es el id de SECCIONES_OPS.
export interface OpsInitial {
  plaza?: string | null
  seccion?: string | null
  recipienteNombre?: string | null
  cantidad?: number | null
  unidad?: string | null
  pesoPorcion?: number | null
  pesoPorcionUnidad?: string | null
}

// Resultado normalizado que emite el panel al guardar.
export interface OpsResult {
  plaza: string
  seccion: string // id de SECCIONES_OPS
  cantidad: number // porciones finales (directo si porc/u/pax, calculado si peso)
  unidad: string
  recipienteNombre: string | null
  pesoPorcion: number | null
  pesoPorcionUnidad: string | null
}

const secTitle: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }

export default function OpsPanel({
  initial, hasExisting, saving, defaultUnidad = 'porc', onSave, onRemove, onCancel,
}: {
  initial?: OpsInitial
  hasExisting?: boolean
  saving?: boolean
  defaultUnidad?: string
  onSave: (result: OpsResult) => void
  onRemove?: () => void
  onCancel?: () => void
}) {
  const [plaza, setPlaza] = useState(initial?.plaza ?? '')
  const [seccion, setSeccion] = useState(initial?.seccion ?? '')
  const [recipiente, setRecipiente] = useState(initial?.recipienteNombre ?? '')
  const [cantidad, setCantidad] = useState(initial?.cantidad != null ? String(initial.cantidad) : '')
  const [unidad, setUnidad] = useState(initial?.unidad ?? defaultUnidad)
  const [pesoPorcion, setPesoPorcion] = useState(initial?.pesoPorcion != null ? String(initial.pesoPorcion) : '')
  const [pesoPorcionUnidad, setPesoPorcionUnidad] = useState(initial?.pesoPorcionUnidad ?? 'g')

  const capVal = parseFloat(cantidad) || 0
  const porVal = parseFloat(pesoPorcion) || 0
  const capG = toG(capVal, unidad)
  const porG = toG(porVal, pesoPorcionUnidad)
  const porcionesAuto = capG !== null && porG !== null && porG > 0 ? Math.round(capG / porG) : null

  function handleSave() {
    if (!plaza || !seccion) return
    const recipNombre = recipiente.trim() || null
    const pesoP = recipNombre && pesoPorcion ? parseFloat(pesoPorcion) || null : null
    const pesoPUnidad = pesoP ? pesoPorcionUnidad : null
    // Si la unidad es de porciones/unidades usamos el valor directo;
    // si es peso y hay tamaño de porción, guardamos las porciones calculadas.
    const cantidadFinal = ['porc', 'u', 'pax'].includes(unidad) ? capVal : (porcionesAuto ?? capVal)
    onSave({ plaza, seccion, cantidad: cantidadFinal, unidad, recipienteNombre: recipNombre, pesoPorcion: pesoP, pesoPorcionUnidad: pesoPUnidad })
  }

  const valido = !!plaza && !!seccion

  return (
    <div>
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

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        {hasExisting && onRemove && (
          <button onClick={onRemove} disabled={saving}
            style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', color: '#ef4444', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Quitar
          </button>
        )}
        {onCancel && (
          <button onClick={onCancel} disabled={saving}
            style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-3)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancelar
          </button>
        )}
        <button onClick={handleSave} disabled={saving || !valido}
          style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: valido ? 'var(--navy)' : 'var(--border)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: valido ? 'pointer' : 'default', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
          {saving ? '…' : 'Guardar OPS'}
        </button>
      </div>
    </div>
  )
}
