'use client'

// Panel del día seleccionado: qué hay (eventos + reflejos, ordenados) y las
// notas del día (ítems sueltos enviables a Producción, sin cambios de lógica
// respecto de la versión anterior — solo se movieron acá).

import { useState } from 'react'
import { ordenarItemsDia, type ItemCalendario, type NotaItemCalendario } from '@/lib/hooks/useCalendario'
import { fechaLarga, fechaRelativa } from '@/lib/calendario/fechas'
import { todasLasPlazas, plazaLabel, plazaColor } from '@/lib/constants'
import type { Plaza } from '@/types'
import { ItemFila } from './shared'

type PlazasCustom = Parameters<typeof todasLasPlazas>[0]

export function DiaPanel({
  fecha, items, notas, plazasCustom, puedePlanificar,
  onAbrir, onCrear, onPlanificar, onAgregarNota, onEliminarNota, onEnviarNota,
}: {
  fecha: string
  items: ItemCalendario[]
  notas: NotaItemCalendario[]
  plazasCustom: PlazasCustom
  puedePlanificar: boolean
  onAbrir: (it: ItemCalendario) => void
  onCrear: () => void
  onPlanificar: () => void
  onAgregarNota: (texto: string) => Promise<void>
  onEliminarNota: (id: string) => void
  onEnviarNota: (item: NotaItemCalendario, plaza: Plaza) => Promise<void>
}) {
  const [texto, setTexto] = useState('')
  const [agregando, setAgregando] = useState(false)
  const [eligiendo, setEligiendo] = useState<string | null>(null)
  const [enviando, setEnviando] = useState<string | null>(null)
  const rel = fechaRelativa(fecha)
  const ordenados = ordenarItemsDia(items)
  const plazas = todasLasPlazas(plazasCustom)

  const agregar = async () => {
    const t = texto.trim()
    if (!t) return
    setAgregando(true)
    try { await onAgregarNota(t); setTexto('') } finally { setAgregando(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {rel && <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{rel}</div>}
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-1)' }}>{fechaLarga(fecha)}</h2>
        </div>
        {puedePlanificar && (
          <button type="button" onClick={onPlanificar} title="Planificar un evento del catálogo" aria-label="Planificar evento" style={{
            width: 40, height: 40, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>celebration</span>
          </button>
        )}
        <button type="button" onClick={onCrear} style={{
          height: 40, padding: '0 14px', borderRadius: 10, border: 'none', background: 'var(--navy)', color: '#fff',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
          Evento
        </button>
      </div>

      {ordenados.length === 0 ? (
        <div style={{ padding: '14px 12px', borderRadius: 12, border: '1px dashed var(--border)', fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
          Nada agendado este día.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ordenados.map(it => <ItemFila key={it.id} it={it} onClick={onAbrir} />)}
        </div>
      )}

      {/* Notas del día */}
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
            placeholder="Pendiente, tema de reunión…"
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
                <div style={{ fontSize: 13.5, color: 'var(--text-1)' }}>{item.texto}</div>
                {item.plaza ? (
                  <span style={{ display: 'inline-block', marginTop: 4, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: color + '18', color: color as string }}>
                    Enviado a {plazaLabel(item.plaza as Plaza, plazasCustom)}
                  </span>
                ) : eligiendo === item.id ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {plazas.map(p => {
                      const c = plazaColor(p, plazasCustom)
                      return (
                        <button key={p} type="button"
                          onClick={async () => { setEligiendo(null); setEnviando(item.id); try { await onEnviarNota(item, p) } finally { setEnviando(null) } }}
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
              <button type="button" onClick={() => onEliminarNota(item.id)} aria-label="Eliminar nota" className="hit-slop"
                style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', padding: 2, flexShrink: 0, position: 'relative' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
