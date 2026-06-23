'use client'

import { useState, useEffect } from 'react'
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
const UNIDADES = ['u', 'kg', 'g', 'l', 'ml', 'pax', 'porc', 'bandeja', 'gastro', 'tupper']
const PRIO_OPTS: { value: MisePrioridad; label: string; color: string; bg: string }[] = [
  { value: 'sp',  label: 'SP',  color: '#ef4444', bg: 'rgba(239,68,68,.12)' },
  { value: 'p',   label: 'P',   color: '#f97316', bg: 'rgba(249,115,22,.12)' },
  { value: 'ref', label: 'REF', color: '#3b82f6', bg: 'rgba(59,130,246,.12)' },
  { value: 'chk', label: 'OK',  color: '#22c55e', bg: 'rgba(34,197,94,.12)' },
]

interface Props {
  item: MisePlaceItem
  secciones: ChecklistSeccionConfig[]
  onClose: () => void
  onGuardar: (id: string, datos: {
    nombre: string; plaza: Plaza; seccion_id: string; cantidad: number; unidad: string; prioridad: MisePrioridad
  }) => Promise<void>
}

export default function ItemEditPanel({ item, secciones, onClose, onGuardar }: Props) {
  const [nombre, setNombre] = useState(item.nombre)
  const [plaza, setPlaza] = useState<Plaza>(item.plaza as Plaza)
  const [seccionId, setSeccionId] = useState(item.seccion_id ?? '')
  const [cantidad, setCantidad] = useState(String(item.cantidad ?? ''))
  const [unidad, setUnidad] = useState(item.unidad ?? 'u')
  const [prioridad, setPrioridad] = useState<MisePrioridad>((item.prioridad as MisePrioridad) ?? 'chk')
  const [saving, setSaving] = useState(false)

  // Secciones de la plaza seleccionada
  const seccionesPlaza = secciones.filter(s => s.plaza === plaza)

  // Si la sección actual no existe en la nueva plaza, resetear
  useEffect(() => {
    if (seccionesPlaza.length > 0 && !seccionesPlaza.find(s => s.id === seccionId)) {
      setSeccionId(seccionesPlaza[0]?.id ?? '')
    }
  }, [plaza, seccionesPlaza, seccionId])

  async function handleGuardar() {
    if (saving) return
    setSaving(true)
    try {
      await onGuardar(item.id, {
        nombre: nombre.trim() || item.nombre,
        plaza,
        seccion_id: seccionId,
        cantidad: parseFloat(cantidad) || 0,
        unidad,
        prioridad,
      })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        display: 'flex', justifyContent: 'flex-end',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Overlay semitransparente */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)' }} onClick={onClose} />

      {/* Panel deslizante derecho */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: 420, maxWidth: '90vw',
        background: 'var(--surface)',
        boxShadow: '-8px 0 32px rgba(0,0,0,.12)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideInRight 0.2s ease-out',
      }}>
        {/* Header */}
        <div style={{ background: 'var(--navy)', padding: '20px 20px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.6)', fontSize: 20, marginTop: 2 }}>tune</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                style={{
                  fontSize: 16, fontWeight: 700, color: '#fff',
                  background: 'transparent', border: 'none', outline: 'none',
                  width: '100%', fontFamily: 'inherit',
                  borderBottom: '1px solid rgba(255,255,255,.25)',
                  paddingBottom: 4,
                }}
              />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginTop: 4 }}>
                {item.plaza} · {secciones.find(s => s.id === item.seccion_id)?.nombre ?? '—'}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'rgba(255,255,255,.12)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', display: 'flex', padding: 6 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
            </button>
          </div>
        </div>

        {/* Cuerpo scrolleable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 0' }}>

          {/* Prioridad */}
          <Section label="Prioridad">
            <div style={{ display: 'flex', gap: 8 }}>
              {PRIO_OPTS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPrioridad(p.value)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 10, border: `1.5px solid ${prioridad === p.value ? p.color : 'var(--border)'}`,
                    background: prioridad === p.value ? p.bg : 'var(--bg)',
                    color: prioridad === p.value ? p.color : 'var(--text-3)',
                    fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.12s',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Plaza */}
          <Section label="Plaza de producción">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PLAZAS_OPS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPlaza(p.id as Plaza)}
                  style={{
                    padding: '6px 14px', borderRadius: 20,
                    border: `1.5px solid ${plaza === p.id ? p.color : 'var(--border)'}`,
                    background: plaza === p.id ? `${p.color}18` : 'var(--bg)',
                    color: plaza === p.id ? p.color : 'var(--text-2)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.12s',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Sección */}
          <Section label="Sección en apertura / cierre">
            {seccionesPlaza.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Esta plaza no tiene secciones. Creá una sección primero desde la mesa de trabajo.
              </p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {seccionesPlaza.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSeccionId(s.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', borderRadius: 20,
                      border: `1.5px solid ${seccionId === s.id ? 'var(--accent)' : 'var(--border)'}`,
                      background: seccionId === s.id ? 'rgba(67,97,160,.1)' : 'var(--bg)',
                      color: seccionId === s.id ? 'var(--accent)' : 'var(--text-2)',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'all 0.12s',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{s.icono}</span>
                    {s.nombre}
                  </button>
                ))}
              </div>
            )}
          </Section>

          {/* Cantidad */}
          <Section label="Cantidad para el mise">
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number"
                value={cantidad}
                onChange={e => setCantidad(e.target.value)}
                placeholder="0"
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text-1)', fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
              <select
                value={unidad}
                onChange={e => setUnidad(e.target.value)}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {UNIDADES.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
          </Section>
        </div>

        {/* Footer fijo */}
        <div style={{ padding: '16px 20px', paddingBottom: 24, borderTop: '1px solid var(--border)' }}>
          <button
            onClick={handleGuardar}
            disabled={saving}
            style={{
              width: '100%', padding: 14, borderRadius: 12,
              background: 'var(--navy)', color: '#fff',
              border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700,
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: saving ? 0.7 : 1,
              transition: 'opacity 0.12s',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>tune</span>
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
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)', marginBottom: 10 }}>
        {label}
      </p>
      {children}
    </div>
  )
}
