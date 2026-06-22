'use client'

import { useState } from 'react'
import type { ChecklistRutina, Plaza, RutinaFrecuencia } from '@/types'

// ISO 1=Lun..7=Dom (checklist_rutina.dias_semana usa este formato)
const DIAS = [
  { label: 'L', iso: 1 }, { label: 'M', iso: 2 }, { label: 'X', iso: 3 },
  { label: 'J', iso: 4 }, { label: 'V', iso: 5 }, { label: 'S', iso: 6 }, { label: 'D', iso: 7 },
]
const FRECS: { value: RutinaFrecuencia; label: string }[] = [
  { value: 'diaria', label: 'Diaria' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'mensual', label: 'Mensual' },
]

interface LimpiezaScope {
  type: 'espacio' | 'plaza' | 'seccion'
  plazas: Plaza[]
  nombre: string
}

interface Props {
  scope: LimpiezaScope
  rutinas: ChecklistRutina[]
  onClose: () => void
  onAgregarRutina: (datos: {
    nombre: string; plaza: Plaza; frecuencia: RutinaFrecuencia;
    dias_semana?: number[] | null; dia_mes?: number | null
  }) => Promise<void>
  onEliminarRutina: (id: string) => Promise<void>
}

export default function LimpiezaPanel({ scope, rutinas, onClose, onAgregarRutina, onEliminarRutina }: Props) {
  const [nombre, setNombre] = useState('')
  const [frecuencia, setFrecuencia] = useState<RutinaFrecuencia>('semanal')
  const [diasSel, setDiasSel] = useState<number[]>([])
  const [diaMes, setDiaMes] = useState(1)
  const [plazaSel, setPlazaSel] = useState<Plaza>(scope.plazas[0])
  const [guardando, setGuardando] = useState(false)

  // Filtrar rutinas que pertenecen a las plazas del scope
  const rutinasScope = rutinas.filter(r => scope.plazas.includes(r.plaza as Plaza))

  function toggleDia(iso: number) {
    setDiasSel(prev => prev.includes(iso) ? prev.filter(d => d !== iso) : [...prev, iso])
  }

  async function handleAgregar() {
    if (!nombre.trim()) return
    setGuardando(true)
    try {
      await onAgregarRutina({
        nombre: nombre.trim(),
        plaza: plazaSel,
        frecuencia,
        dias_semana: frecuencia === 'semanal' && diasSel.length > 0 ? diasSel : null,
        dia_mes: frecuencia === 'mensual' ? diaMes : null,
      })
      setNombre(''); setDiasSel([])
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--surface)',
        borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: 540,
        maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--accent)' }}>cleaning_services</span>
            <div>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Limpieza</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{scope.nombre}</p>
            </div>
            <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* Contenido scrolleable */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px' }}>

          {/* Rutinas existentes */}
          {rutinasScope.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Rutinas activas</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rutinasScope.map(r => (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'var(--bg)', borderRadius: 10, padding: '8px 12px',
                    border: '1px solid var(--border)',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>autorenew</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{r.nombre}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        {r.frecuencia}
                        {r.dias_semana?.length ? ` · ${r.dias_semana.map(d => DIAS.find(x => x.iso === d)?.label).join(' ')}` : ''}
                        {r.dia_mes ? ` · día ${r.dia_mes}` : ''}
                        {' · '}{r.plaza}
                      </p>
                    </div>
                    <button
                      onClick={() => onEliminarRutina(r.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 2 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {rutinasScope.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>Sin rutinas de limpieza todavía.</p>
          )}

          {/* Formulario nueva rutina */}
          <div style={{ background: 'var(--bg)', borderRadius: 12, padding: 14, border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 10 }}>Nueva rutina</p>

            <input
              placeholder="Ej: Limpiar heladera"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit',
                marginBottom: 10, boxSizing: 'border-box',
              }}
            />

            {/* Plaza (solo si el scope tiene varias) */}
            {scope.plazas.length > 1 && (
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Plaza</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {scope.plazas.map(p => (
                    <button
                      key={p}
                      onClick={() => setPlazaSel(p)}
                      style={{
                        fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                        border: `1px solid ${plazaSel === p ? 'var(--accent)' : 'var(--border)'}`,
                        background: plazaSel === p ? 'var(--accent)' : 'none',
                        color: plazaSel === p ? '#fff' : 'var(--text-2)',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >{p}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Frecuencia */}
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Frecuencia</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {FRECS.map(f => (
                  <button
                    key={f.value}
                    onClick={() => setFrecuencia(f.value)}
                    style={{
                      fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20,
                      border: `1px solid ${frecuencia === f.value ? 'var(--accent)' : 'var(--border)'}`,
                      background: frecuencia === f.value ? 'var(--accent)' : 'none',
                      color: frecuencia === f.value ? '#fff' : 'var(--text-2)',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >{f.label}</button>
                ))}
              </div>
            </div>

            {/* Días (semanal) */}
            {frecuencia === 'semanal' && (
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Días</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  {DIAS.map(d => (
                    <button
                      key={d.iso}
                      onClick={() => toggleDia(d.iso)}
                      style={{
                        width: 30, height: 30, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                        border: `1px solid ${diasSel.includes(d.iso) ? 'var(--accent)' : 'var(--border)'}`,
                        background: diasSel.includes(d.iso) ? 'var(--accent)' : 'none',
                        color: diasSel.includes(d.iso) ? '#fff' : 'var(--text-2)',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >{d.label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Día del mes (mensual) */}
            {frecuencia === 'mensual' && (
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Día del mes</p>
                <input
                  type="number" min={1} max={31} value={diaMes}
                  onChange={e => setDiaMes(Number(e.target.value))}
                  style={{
                    width: 70, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
                    background: 'var(--surface)', color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit',
                  }}
                />
              </div>
            )}

            <button
              onClick={handleAgregar}
              disabled={!nombre.trim() || guardando}
              style={{
                width: '100%', padding: 10, borderRadius: 10,
                background: 'var(--navy)', color: '#fff',
                border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                fontFamily: 'inherit', opacity: !nombre.trim() || guardando ? 0.5 : 1,
              }}
            >
              {guardando ? 'Guardando…' : 'Agregar rutina'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
