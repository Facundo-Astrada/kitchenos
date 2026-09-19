'use client'

// Carta de la casa — Fase 2 (PLAN-DESCRIPCION-PUESTO-2026-09.md § 6.1). Se
// escribe una vez por restaurante y aparece como página propia en el PDF de
// Organigrama, antes del manual de cada puesto — cultura, políticas,
// uniforme, el día tipo y los no negociables que valen para toda la casa, no
// para responderlos 14 veces en cada puesto.

import { useState } from 'react'
import { Modal } from '@/components/ui'
import { useCartaDeLaCasa, type DiaTipoCasaItem } from '@/lib/hooks/useCartaDeLaCasa'
import { fieldStyle, btnPrimary, btnSecondary } from './equipoShared'

const qLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)',
}

function ListaDeFrases({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [nueva, setNueva] = useState('')
  function agregar() {
    if (!nueva.trim()) return
    onChange([...items, nueva.trim()])
    setNueva('')
  }
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
        {items.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'var(--bg)' }}>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{t}</span>
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>close</span>
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ ...fieldStyle, flex: 1 }} value={nueva} placeholder={placeholder}
          onChange={e => setNueva(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }}
        />
        <button type="button" onClick={agregar} style={{ ...btnSecondary, width: 'auto', padding: '10px 16px' }}>+</button>
      </div>
    </div>
  )
}

function ListaDeMomentos({ items, onChange }: { items: DiaTipoCasaItem[]; onChange: (v: DiaTipoCasaItem[]) => void }) {
  const [hora, setHora] = useState('')
  const [queHace, setQueHace] = useState('')
  function agregar() {
    if (!queHace.trim()) return
    onChange([...items, { hora: hora.trim(), que_hace: queHace.trim() }])
    setHora(''); setQueHace('')
  }
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'var(--bg)' }}>
            {it.hora && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', fontFamily: "'DM Mono', monospace" }}>{it.hora}</span>}
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{it.que_hace}</span>
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>close</span>
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={{ ...fieldStyle, width: 80 }} value={hora} placeholder="09:00" onChange={e => setHora(e.target.value)} />
        <input
          style={{ ...fieldStyle, flex: 1 }} value={queHace} placeholder="Qué pasa a esa hora"
          onChange={e => setQueHace(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }}
        />
        <button type="button" onClick={agregar} style={{ ...btnSecondary, width: 'auto', padding: '10px 16px' }}>+</button>
      </div>
    </div>
  )
}

export function CartaDeLaCasaModal({ open, onClose, onToast }: { open: boolean; onClose: () => void; onToast: (msg: string) => void }) {
  return (
    <Modal open={open} onClose={onClose} maxWidth={620}>
      {open && <Cuerpo onClose={onClose} onToast={onToast} />}
    </Modal>
  )
}

function Cuerpo({ onClose, onToast }: { onClose: () => void; onToast: (msg: string) => void }) {
  const { carta, guardar } = useCartaDeLaCasa()
  const [cultura, setCultura] = useState(carta.cultura ?? '')
  const [politicas, setPoliticas] = useState<string[]>(carta.politicas ?? [])
  const [uniforme, setUniforme] = useState(carta.uniforme ?? '')
  const [diaTipo, setDiaTipo] = useState<DiaTipoCasaItem[]>(carta.dia_tipo ?? [])
  const [noNegociables, setNoNegociables] = useState<string[]>(carta.no_negociables ?? [])
  const [saving, setSaving] = useState(false)

  async function handleGuardar() {
    setSaving(true)
    try {
      await guardar({ cultura: cultura.trim() || undefined, politicas, uniforme: uniforme.trim() || undefined, dia_tipo: diaTipo, no_negociables: noNegociables })
      onToast('Carta de la casa guardada')
      onClose()
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '20px 20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>Carta de la casa</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)' }}>close</span>
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 18px', lineHeight: 1.5 }}>
        Se escribe una vez y vale para toda la cocina — aparece en el PDF de Organigrama antes del manual de cada puesto, así no hay que contestar esto 14 veces.
      </p>

      <div style={{ marginBottom: 18 }}>
        <label style={qLabel}>Cultura y valores</label>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '4px 0 8px' }}>¿Cómo se trabaja acá? Ej: cocina silenciosa, orden permanente, se escucha el pase.</p>
        <textarea style={{ ...fieldStyle, minHeight: 76, resize: 'vertical' }} value={cultura} onChange={e => setCultura(e.target.value)} placeholder="Contá cómo es trabajar en esta cocina" />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={qLabel}>Políticas de la casa</label>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '4px 0 8px' }}>Reglas que valen para todo el equipo, no de un puesto en particular.</p>
        <ListaDeFrases items={politicas} onChange={setPoliticas} placeholder="Ej: nada de celular en el piso de cocina" />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={qLabel}>Uniforme</label>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '4px 0 8px' }}>Lo que la casa exige, no lo que le prestó a cada persona (eso está en la ficha de cada uno).</p>
        <textarea style={{ ...fieldStyle, minHeight: 50, resize: 'vertical' }} value={uniforme} onChange={e => setUniforme(e.target.value)} placeholder="Ej: pantalón negro, chaqueta blanca, pelo recogido" />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={qLabel}>El día tipo de la casa</label>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '4px 0 8px' }}>La línea de tiempo de la cocina entera, de apertura a cierre.</p>
        <ListaDeMomentos items={diaTipo} onChange={setDiaTipo} />
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={qLabel}>No negociables de la casa</label>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '4px 0 8px' }}>Lo que no se discute, para todo el equipo.</p>
        <ListaDeFrases items={noNegociables} onChange={setNoNegociables} placeholder="Ej: nadie sale sin avisar al pase" />
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button onClick={onClose} style={btnSecondary}>Cancelar</button>
        <button onClick={handleGuardar} disabled={saving} style={btnPrimary}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </div>
  )
}
