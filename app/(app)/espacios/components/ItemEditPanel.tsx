'use client'

import { useState, useEffect, useMemo } from 'react'
import type { MisePlaceItem, ChecklistSeccionConfig, Plaza, MisePrioridad } from '@/types'

const PLAZAS_OPS = [
  { id: 'general',    label: 'General',    color: '#6b7280' },
  { id: 'parrilla',   label: 'Parrilla',   color: '#ef4444' },
  { id: 'frios',      label: 'Fríos',      color: '#0ea5e9' },
  { id: 'calientes',  label: 'Calientes',  color: '#f97316' },
  { id: 'pase',       label: 'Pase',       color: '#8b5cf6' },
  { id: 'pasteleria', label: 'Pastelería', color: '#ec4899' },
  { id: 'panaderia',  label: 'Panadería',  color: '#84cc16' },
]
const UNIDADES_MISE   = ['u', 'kg', 'g', 'l', 'ml', 'pax', 'porc', 'bandeja', 'gastro', 'tupper']
const UNIDADES_PORCION = ['g', 'kg', 'ml', 'l', 'u', 'porc']
const PRIO_OPTS: { value: MisePrioridad; label: string; color: string; bg: string }[] = [
  { value: 'sp',  label: 'SP',  color: '#ef4444', bg: 'rgba(239,68,68,.12)' },
  { value: 'p',   label: 'P',   color: '#f97316', bg: 'rgba(249,115,22,.12)' },
  { value: 'ref', label: 'REF', color: '#3b82f6', bg: 'rgba(59,130,246,.12)' },
  { value: 'chk', label: 'OK',  color: '#22c55e', bg: 'rgba(34,197,94,.12)' },
]

// Convierte a gramos/ml para calcular porciones por recipiente
const toG = (v: number, u: string): number | null =>
  u === 'kg' ? v * 1000 : u === 'g' ? v : u === 'l' ? v * 1000 : u === 'ml' ? v : null

interface GuardarDatos {
  nombre: string
  plaza: Plaza
  seccion_id: string
  cantidad: number
  unidad: string
  prioridad: MisePrioridad
  recipiente_nombre: string | null
  recipiente_capacidad: number | null
  peso_porcion: number | null
  peso_porcion_unidad: string | null
}

interface Props {
  item: MisePlaceItem
  secciones: ChecklistSeccionConfig[]
  onClose: () => void
  onGuardar: (id: string, datos: GuardarDatos) => Promise<void>
}

export default function ItemEditPanel({ item, secciones, onClose, onGuardar }: Props) {
  const [nombre,    setNombre]    = useState(item.nombre)
  const [plaza,     setPlaza]     = useState<Plaza>(item.plaza as Plaza)
  const [seccionId, setSeccionId] = useState(item.seccion_id ?? '')
  const [cantidad,  setCantidad]  = useState(String(item.cantidad ?? ''))
  const [unidad,    setUnidad]    = useState(item.unidad ?? 'u')
  const [prioridad, setPrioridad] = useState<MisePrioridad>((item.prioridad as MisePrioridad) ?? 'chk')

  // Recipiente
  const [recipienteNombre,    setRecipienteNombre]    = useState(item.recipiente_nombre ?? '')
  const [pesoPorcion,         setPesoPorcion]         = useState(item.peso_porcion != null ? String(item.peso_porcion) : '')
  const [pesoPorcionUnidad,   setPesoPorcionUnidad]   = useState(item.peso_porcion_unidad ?? 'g')

  const [saving, setSaving] = useState(false)

  const seccionesPlaza = secciones.filter(s => s.plaza === plaza)

  useEffect(() => {
    if (seccionesPlaza.length > 0 && !seccionesPlaza.find(s => s.id === seccionId)) {
      setSeccionId(seccionesPlaza[0]?.id ?? '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plaza])

  // Cálculo reactivo de porciones
  const porcionesAuto = useMemo(() => {
    if (!recipienteNombre.trim()) return null
    const capVal = parseFloat(cantidad) || 0
    const porVal = parseFloat(pesoPorcion) || 0
    const capG = toG(capVal, unidad)
    const porG = toG(porVal, pesoPorcionUnidad)
    if (capG !== null && porG !== null && porG > 0) return Math.round(capG / porG)
    return null
  }, [recipienteNombre, cantidad, unidad, pesoPorcion, pesoPorcionUnidad])

  async function handleGuardar() {
    if (saving) return
    setSaving(true)
    try {
      const capVal = parseFloat(cantidad) || 0
      const porVal = parseFloat(pesoPorcion) || 0
      const capG   = toG(capVal, unidad)
      const porG   = toG(porVal, pesoPorcionUnidad)
      const porcionesCalculadas = capG !== null && porG !== null && porG > 0 ? Math.round(capG / porG) : null
      const recipiente = recipienteNombre.trim() || null

      // recipiente_capacidad siempre en porciones
      const miCantidad = (['porc', 'u', 'pax'].includes(unidad)) ? capVal : (porcionesCalculadas ?? capVal)

      await onGuardar(item.id, {
        nombre: nombre.trim() || item.nombre,
        plaza,
        seccion_id: seccionId,
        cantidad: capVal,
        unidad,
        prioridad,
        recipiente_nombre:    recipiente,
        recipiente_capacidad: recipiente ? miCantidad : null,
        peso_porcion:         recipiente && porVal ? porVal : null,
        peso_porcion_unidad:  recipiente && porVal ? pesoPorcionUnidad : null,
      })
      onClose()
    } finally { setSaving(false) }
  }

  const tieneRecipiente = recipienteNombre.trim().length > 0

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)' }} onClick={onClose} />

      <div style={{
        position: 'relative', zIndex: 1,
        width: 440, maxWidth: '92vw',
        background: 'var(--surface)',
        boxShadow: '-8px 0 40px rgba(0,0,0,.14)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideInRight 0.18s ease-out',
      }}>
        {/* Header navy */}
        <div style={{ background: 'var(--navy)', padding: '20px 20px 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.55)', fontSize: 20, marginTop: 3 }}>tune</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                style={{
                  fontSize: 16, fontWeight: 700, color: '#fff',
                  background: 'transparent', border: 'none', outline: 'none',
                  width: '100%', fontFamily: 'inherit',
                  borderBottom: '1px solid rgba(255,255,255,.2)',
                  paddingBottom: 4,
                }}
              />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 5 }}>
                {item.plaza} · {secciones.find(s => s.id === item.seccion_id)?.nombre ?? 'Sin sección'}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', display: 'flex', padding: 6 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
            </button>
          </div>
        </div>

        {/* Body scrolleable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 0' }}>

          {/* Prioridad */}
          <Section label="Prioridad">
            <div style={{ display: 'flex', gap: 7 }}>
              {PRIO_OPTS.map(p => (
                <button key={p.value} onClick={() => setPrioridad(p.value)} style={{
                  flex: 1, padding: '8px 0', borderRadius: 10,
                  border: `1.5px solid ${prioridad === p.value ? p.color : 'var(--border)'}`,
                  background: prioridad === p.value ? p.bg : 'var(--bg)',
                  color: prioridad === p.value ? p.color : 'var(--text-3)',
                  fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  {p.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Plaza */}
          <Section label="Plaza de producción">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PLAZAS_OPS.map(p => (
                <button key={p.id} onClick={() => setPlaza(p.id as Plaza)} style={{
                  padding: '6px 14px', borderRadius: 20,
                  border: `1.5px solid ${plaza === p.id ? p.color : 'var(--border)'}`,
                  background: plaza === p.id ? `${p.color}18` : 'var(--bg)',
                  color: plaza === p.id ? p.color : 'var(--text-2)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  {p.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Sección */}
          <Section label="Sección del mise">
            {seccionesPlaza.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Esta plaza no tiene secciones todavía.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {seccionesPlaza.map(s => (
                  <button key={s.id} onClick={() => setSeccionId(s.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', borderRadius: 20,
                    border: `1.5px solid ${seccionId === s.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: seccionId === s.id ? 'rgba(67,97,160,.1)' : 'var(--bg)',
                    color: seccionId === s.id ? 'var(--accent)' : 'var(--text-2)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{s.icono}</span>
                    {s.nombre}
                  </button>
                ))}
              </div>
            )}
          </Section>

          {/* Recipiente */}
          <Section label="Recipiente (opcional)">
            <input
              value={recipienteNombre}
              onChange={e => setRecipienteNombre(e.target.value)}
              placeholder="ej: tupper, cubeta GN 1/2, bandeja…"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </Section>

          {/* Cantidad / Porciones por recipiente */}
          <Section label={tieneRecipiente ? 'Porciones / peso recipiente lleno' : 'Cantidad en mise'}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number"
                value={cantidad}
                onChange={e => setCantidad(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text-1)', fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', flex: 1 }}>
                {UNIDADES_MISE.map(u => (
                  <button key={u} onClick={() => setUnidad(u)} style={{
                    padding: '5px 10px', borderRadius: 8,
                    border: `1.5px solid ${unidad === u ? 'var(--navy)' : 'var(--border)'}`,
                    background: unidad === u ? 'var(--navy)' : 'var(--bg)',
                    color: unidad === u ? '#fff' : 'var(--text-2)',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          {/* Tamaño por porción — solo cuando hay recipiente */}
          {tieneRecipiente && (
            <Section label="Tamaño por porción">
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  type="number"
                  value={pesoPorcion}
                  onChange={e => setPesoPorcion(e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: 10,
                    border: '1px solid var(--border)', background: 'var(--bg)',
                    color: 'var(--text-1)', fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
                    outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', flex: 1 }}>
                  {UNIDADES_PORCION.map(u => (
                    <button key={u} onClick={() => setPesoPorcionUnidad(u)} style={{
                      padding: '5px 10px', borderRadius: 8,
                      border: `1.5px solid ${pesoPorcionUnidad === u ? 'var(--navy)' : 'var(--border)'}`,
                      background: pesoPorcionUnidad === u ? 'var(--navy)' : 'var(--bg)',
                      color: pesoPorcionUnidad === u ? '#fff' : 'var(--text-2)',
                      fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              {/* Resultado calculado */}
              {porcionesAuto !== null && cantidad && pesoPorcion ? (
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', paddingLeft: 2 }}>
                  = {porcionesAuto} porciones por recipiente
                </div>
              ) : cantidad && pesoPorcion ? (
                <div style={{ fontSize: 11, color: 'var(--text-3)', paddingLeft: 2 }}>
                  {parseFloat(cantidad)} {unidad} · {parseFloat(pesoPorcion)} {pesoPorcionUnidad} / porción
                </div>
              ) : null}
            </Section>
          )}
        </div>

        {/* Footer fijo */}
        <div style={{ padding: '16px 20px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            onClick={handleGuardar}
            disabled={saving}
            style={{
              width: '100%', padding: 14, borderRadius: 12,
              background: 'var(--navy)', color: '#fff',
              border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700,
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: saving ? 0.7 : 1,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span>
            {saving ? 'Guardando…' : 'Guardar en mise en place'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(40px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)', marginBottom: 10 }}>
        {label}
      </p>
      {children}
    </div>
  )
}
