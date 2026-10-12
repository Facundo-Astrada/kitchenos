'use client'

// Notas del día — una línea por nota, enviable a Producción por plaza. Las
// usan el panel del día del Calendario y el de Turnos sobre la MISMA tabla
// (`calendario_nota_items`): lo que se anota planificando la semana se lee al
// armar los horarios, y al revés. Sin `onEnviar` no se ofrece mandarlas a
// Producción (Turnos), pero las que ya se mandaron muestran a qué plaza.

import { useState } from 'react'
import type { NotaItemCalendario } from '@/lib/hooks/useCalendario'
import { todasLasPlazas, plazaLabel, plazaColor } from '@/lib/constants'
import type { Plaza } from '@/types'

type PlazasCustom = Parameters<typeof todasLasPlazas>[0]

export function NotasDia({ notas, plazasCustom, placeholder = 'Pendiente, tema de reunión…', pie, onAgregar, onEliminar, onEnviar }: {
  notas: NotaItemCalendario[]
  plazasCustom: PlazasCustom
  placeholder?: string
  /** Línea chica debajo de la lista (de dónde más se ven estas notas). */
  pie?: string
  onAgregar: (texto: string) => Promise<void>
  onEliminar: (id: string) => void
  onEnviar?: (item: NotaItemCalendario, plaza: Plaza) => Promise<void>
}) {
  const [texto, setTexto] = useState('')
  const [agregando, setAgregando] = useState(false)
  const [eligiendo, setEligiendo] = useState<string | null>(null)
  const [enviando, setEnviando] = useState<string | null>(null)
  const plazas = todasLasPlazas(plazasCustom)

  const agregar = async () => {
    const t = texto.trim()
    if (!t) return
    setAgregando(true)
    try { await onAgregar(t); setTexto('') } finally { setAgregando(false) }
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>sticky_note_2</span>
        Notas del día
        {notas.length > 0 && <span style={{ fontWeight: 600, color: 'var(--text-3)' }}>· {notas.length}</span>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }}
          placeholder={placeholder}
          aria-label="Nueva nota del día"
          style={{
            flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--bg)', color: 'var(--text-1)', fontSize: 13.5, outline: 'none', fontFamily: 'inherit',
          }}
        />
        <button
          type="button"
          onClick={agregar}
          disabled={!texto.trim() || agregando}
          aria-label="Agregar nota"
          style={{
            width: 42, borderRadius: 10, border: 'none', flexShrink: 0,
            background: texto.trim() ? 'var(--navy)' : 'var(--border)', color: '#fff',
            cursor: texto.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
        </button>
      </div>
      {notas.map(item => {
        const color = item.plaza ? plazaColor(item.plaza as Plaza, plazasCustom) : null
        return (
          <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17, color: item.plaza ? 'var(--green)' : 'var(--text-3)', marginTop: 1, flexShrink: 0 }}>
              {item.plaza ? 'check_circle' : 'radio_button_unchecked'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: 'var(--text-1)', overflowWrap: 'anywhere' }}>{item.texto}</div>
              {item.plaza ? (
                <span style={{ display: 'inline-block', marginTop: 4, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: color + '18', color: color as string }}>
                  Enviado a {plazaLabel(item.plaza as Plaza, plazasCustom)}
                </span>
              ) : !onEnviar ? null : eligiendo === item.id ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {plazas.map(p => {
                    const c = plazaColor(p, plazasCustom)
                    return (
                      <button key={p} type="button"
                        onClick={async () => { setEligiendo(null); setEnviando(item.id); try { await onEnviar(item, p) } finally { setEnviando(null) } }}
                        style={{ padding: '6px 10px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, background: c + '18', color: c }}>
                        {plazaLabel(p, plazasCustom)}
                      </button>
                    )
                  })}
                  <button type="button" onClick={() => setEligiendo(null)} style={{ padding: '6px 10px', borderRadius: 99, border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, background: 'none', color: 'var(--text-3)' }}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setEligiendo(item.id)} disabled={enviando === item.id}
                  style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: 'var(--accent)', fontFamily: 'inherit' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>restaurant_menu</span>
                  {enviando === item.id ? 'Enviando…' : 'Enviar a Producción'}
                </button>
              )}
            </div>
            <button type="button" onClick={() => onEliminar(item.id)} aria-label="Eliminar nota" className="hit-slop"
              style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', padding: 2, flexShrink: 0, position: 'relative' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
            </button>
          </div>
        )
      })}
      {pie && <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.35 }}>{pie}</div>}
    </div>
  )
}
