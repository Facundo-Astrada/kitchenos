'use client'

import { useState } from 'react'
import { hoyOperativo } from '@/lib/ops/turnos'
import type { PaseMensaje } from '@/types'

// Anotaciones de una plaza — "chequear el orden, el servicio fue pesado", "hay
// mucha carne para revisar", "ingresó pescado". Es el pase de turno a nivel
// plaza: el contexto que no entra en una tarea ni en un tilde y que el que
// entra necesita leer antes de empezar.
//
// Los datos son `pase_mensajes` con plaza (ver useNotasPlaza): lo que se
// escribe acá se lee también en el Pase, y un mensaje del Pase con "#parrilla"
// aparece acá. Se muestran las de hoy y las del turno anterior.

const AMBAR = '#f59e0b'
const MAX_VISIBLES = 3

interface NotasPlazaProps {
  notas: PaseMensaje[]
  onAgregar: (texto: string, importante: boolean) => Promise<void>
  onEliminar: (id: string) => Promise<void>
}

export function NotasPlaza({ notas, onAgregar, onEliminar }: NotasPlazaProps) {
  const [escribiendo, setEscribiendo] = useState(false)
  const [texto, setTexto] = useState('')
  const [importante, setImportante] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [verTodas, setVerTodas] = useState(false)

  const visibles = verTodas ? notas : notas.slice(0, MAX_VISIBLES)
  const ocultas = notas.length - visibles.length

  async function guardar() {
    const limpio = texto.trim()
    if (!limpio || guardando) return
    setGuardando(true)
    try {
      await onAgregar(limpio, importante)
      setTexto('')
      setImportante(false)
      setEscribiendo(false)
    } catch (e) {
      console.error('[NotasPlaza] guardar', e)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: notas.length > 0 || escribiendo ? 6 : 2 }}>
      {visibles.map(n => (
        <Nota key={n.id} nota={n} onEliminar={onEliminar} />
      ))}

      {ocultas > 0 && (
        <button onClick={() => setVerTodas(true)} style={linkStyle}>
          +{ocultas} {ocultas === 1 ? 'nota más' : 'notas más'}
        </button>
      )}

      {escribiendo ? (
        <div style={{
          borderRadius: 10, padding: 8,
          background: 'rgba(245,158,11,.06)', border: `1px solid ${AMBAR}44`,
        }}>
          <textarea
            autoFocus
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); guardar() }
              if (e.key === 'Escape') { setEscribiendo(false); setTexto('') }
            }}
            placeholder="Nota para el que entra…"
            rows={2}
            style={{
              width: '100%', resize: 'none', boxSizing: 'border-box',
              padding: '6px 8px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text-1)', fontSize: 12.5, fontFamily: 'inherit',
              outline: 'none', lineHeight: 1.35,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <button
              onClick={() => setImportante(v => !v)}
              title="Subirla a los avisos del turno"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '3px 8px', borderRadius: 99, cursor: 'pointer',
                fontSize: 10, fontWeight: 700, fontFamily: 'inherit',
                background: importante ? 'rgba(239,68,68,.13)' : 'var(--bg)',
                border: `1px solid ${importante ? 'rgba(239,68,68,.45)' : 'var(--border)'}`,
                color: importante ? '#ef4444' : 'var(--text-3)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>priority_high</span>
              Importante
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={() => { setEscribiendo(false); setTexto('') }} style={linkStyle}>
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={!texto.trim() || guardando}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: 8, border: 'none', flexShrink: 0,
                background: texto.trim() ? AMBAR : 'var(--border)',
                cursor: texto.trim() ? 'pointer' : 'default',
                opacity: guardando ? .6 : 1, touchAction: 'manipulation',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#fff' }}>send</span>
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEscribiendo(true)}
          data-coach-target="plaza-nota"
          style={{
            display: 'flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
            padding: '3px 8px 3px 5px', borderRadius: 99,
            background: 'none', border: '1px dashed var(--border)', cursor: 'pointer',
            color: 'var(--text-3)', fontSize: 10.5, fontWeight: 600, fontFamily: 'inherit',
            touchAction: 'manipulation',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>sticky_note_2</span>
          Nota de plaza
        </button>
      )}
    </div>
  )
}

function Nota({ nota, onEliminar }: { nota: PaseMensaje; onEliminar: (id: string) => Promise<void> }) {
  const [borrando, setBorrando] = useState(false)
  const urgente = nota.prioridad === 'urgente' || nota.prioridad === 'importante'
  const color = nota.prioridad === 'urgente' ? '#ef4444' : AMBAR
  const deAyer = (nota.turno_fecha ?? nota.created_at.slice(0, 10)) !== hoyOperativo()

  return (
    <div style={{
      borderLeft: `3px solid ${color}`,
      background: urgente ? `${color}12` : 'rgba(245,158,11,.06)',
      borderRadius: 8, padding: '6px 8px',
      display: 'flex', alignItems: 'flex-start', gap: 6,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
          {nota.texto}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2, flexWrap: 'wrap' as const }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-2)' }}>
            {nota.usuario_nombre ?? 'Alguien'}
          </span>
          <span style={{ fontSize: 9.5, color: 'var(--text-3)' }}>
            {new Date(nota.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {deAyer && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '0 5px', borderRadius: 4,
              background: 'rgba(245,158,11,.15)', color: '#d97706',
            }}>
              turno ant.
            </span>
          )}
        </div>
      </div>
      <button
        onClick={async () => { setBorrando(true); try { await onEliminar(nota.id) } finally { setBorrando(false) } }}
        disabled={borrando}
        title="Borrar nota"
        style={{
          background: 'none', border: 'none', padding: 2, cursor: 'pointer',
          color: 'var(--text-3)', display: 'flex', flexShrink: 0, opacity: borrando ? .4 : 1,
          touchAction: 'manipulation',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
      </button>
    </div>
  )
}

const linkStyle: React.CSSProperties = {
  background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer',
  color: 'var(--text-3)', fontSize: 10.5, fontWeight: 600, fontFamily: 'inherit',
  alignSelf: 'flex-start', touchAction: 'manipulation',
}
