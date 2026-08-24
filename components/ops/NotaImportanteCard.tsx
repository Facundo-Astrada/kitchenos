'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePase } from '@/lib/hooks/usePase'
import { useEquipo } from '@/lib/hooks/useEquipo'
import { useAuth } from '@/lib/auth/context'
import { hoyOperativo, sumarDias } from '@/lib/ops/turnos'
import {
  MentionDropdown, RenderTexto, detectarMencion, mencionaA, plazaDesdeTexto, PLAZA_LABELS_HASH,
} from '@/components/pase/menciones'
import type { PaseMensaje } from '@/types'

// Columna "Importante" de la banda Otros (OPS Producción → Todo).
//
// NO usa una tabla propia: escribe y lee `pase_mensajes` con prioridad
// importante/urgente. Así un aviso escrito acá aparece en Pase y uno escrito en
// Pase aparece acá — un solo lugar donde viven los avisos del turno, en vez de
// un cuarto silo de notas (ya existen Pedidos y Limpieza en esta misma banda).
// Muestra hoy + los sin resolver de ayer, igual que el carryover de las tareas.

const COLOR = '#f59e0b'

export function NotaImportanteCard() {
  const { mensajes, fetchMensajes, enviarMensaje } = usePase()
  const { miembros } = useEquipo()
  const { perfil } = useAuth()

  // Colapsada por default cuando no hay avisos (PLAN-SUPERFICIE S4.4) — el
  // trabajo real de la banda Otros no tiene que competir con una tarjeta
  // vacía. `null` = sin elección manual todavía, sigue al conteo en vivo (así
  // no queda colapsada para siempre si el fetch todavía no trajo los avisos
  // reales); una vez que el usuario toca el header, su elección manda.
  const [manualOverride, setManualOverride] = useState<boolean | null>(null)
  const [texto, setTexto] = useState('')
  const [urgente, setUrgente] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [mencion, setMencion] = useState<{ type: '@' | '#'; filter: string; startIdx: number } | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { fetchMensajes() }, [fetchMensajes])

  const usuariosMencion = useMemo(
    () => miembros.map(m => ({
      id: m.id,
      nombre: `${m.nombre}${m.apellido ? ` ${m.apellido[0]}.` : ''}`,
    })),
    [miembros],
  )

  const miNombre = perfil ? `${perfil.nombre ?? ''} ${perfil.apellido ?? ''}`.trim() : null

  const avisos = useMemo(() => {
    const hoy = hoyOperativo()
    const ayer = sumarDias(hoy, -1)
    return mensajes
      .filter(m => {
        const prio = m.prioridad ?? 'normal'
        if (prio !== 'importante' && prio !== 'urgente') return false
        const fecha = m.turno_fecha ?? m.created_at.slice(0, 10)
        return fecha === hoy || fecha === ayer
      })
      .slice()
      .reverse() // usePase devuelve ascendente; acá el más nuevo va arriba
  }, [mensajes])

  const cerrada = manualOverride ?? avisos.length === 0
  // No auto-focus del textarea al expandir: mounta recién en el render
  // siguiente, fuera del gesto de touch síncrono — no abre el teclado en
  // iOS/Android (ver ui.md § Input editable inline). Un tap más para escribir.
  function toggle() {
    setManualOverride(!cerrada)
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.target
    setTexto(el.value)
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 110) + 'px'
    setMencion(detectarMencion(el.value, el.selectionStart))
  }

  function insertarMencion(valor: string) {
    if (!mencion) return
    const antes = texto.slice(0, mencion.startIdx)
    const despues = texto.slice(mencion.startIdx + mencion.filter.length + 1)
    const nuevo = `${antes}${mencion.type}${valor} ${despues}`
    setTexto(nuevo)
    setMencion(null)
    inputRef.current?.focus()
  }

  async function handleEnviar() {
    const limpio = texto.trim()
    if (!limpio || enviando) return
    setEnviando(true)
    try {
      await enviarMensaje({
        texto: limpio,
        prioridad: urgente ? 'urgente' : 'importante',
        plaza: plazaDesdeTexto(limpio),
      })
      setTexto('')
      setUrgente(false)
      setMencion(null)
      if (inputRef.current) inputRef.current.style.height = 'auto'
      await fetchMensajes()
    } catch (e) {
      console.error('[NotaImportanteCard] enviar', e)
    }
    setEnviando(false)
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, overflow: 'hidden', marginBottom: 8,
    }}>
      <button
        onClick={toggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 15, color: COLOR, flexShrink: 0 }}>
          campaign
        </span>
        <span style={{
          flex: 1, textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-1)',
          textTransform: 'uppercase', letterSpacing: '.06em',
        }}>
          Importante
        </span>
        {avisos.length > 0 && (
          <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: 'var(--text-3)', fontWeight: 700 }}>
            {avisos.length}
          </span>
        )}
        <span className="material-symbols-outlined" style={{
          fontSize: 18, color: 'var(--text-3)',
          transform: cerrada && avisos.length > 0 ? 'rotate(-90deg)' : 'none', transition: 'transform .15s',
        }}>
          {cerrada && avisos.length === 0 ? 'add' : 'expand_more'}
        </span>
      </button>
      <div style={{ height: 2, background: COLOR }} />

      {!cerrada && (
        <div style={{ padding: '6px 10px 10px', position: 'relative' }}>
          {avisos.map(m => (
            <Aviso key={m.id} msg={m} paraMi={mencionaA(m.texto, miNombre)} />
          ))}
          {avisos.length === 0 && (
            <div style={{ padding: '8px 2px', fontSize: 12, color: 'var(--text-3)' }}>
              Sin avisos del turno
            </div>
          )}

          {mencion && (
            <MentionDropdown
              type={mencion.type}
              filter={mencion.filter}
              usuarios={usuariosMencion}
              onSelect={insertarMencion}
              // Por encima del textarea (~34px) + la fila de Urgente/enviar
              // (~38px) + el padding del contenedor: si no, el dropdown tapa
              // justo lo que estás escribiendo.
              position={{ bottom: 88, left: 4, right: 4 }}
            />
          )}

          <div style={{ marginTop: 6 }}>
            <textarea
              ref={inputRef}
              value={texto}
              onChange={handleInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar() }
                if (e.key === 'Escape') setMencion(null)
              }}
              placeholder="Aviso para el turno… usá @ para mencionar"
              rows={1}
              style={{
                width: '100%', resize: 'none', padding: '8px 10px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <button
                onClick={() => setUrgente(v => !v)}
                title="Marcar como urgente"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 99, cursor: 'pointer',
                  fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                  background: urgente ? 'rgba(239,68,68,.14)' : 'var(--bg)',
                  border: `1px solid ${urgente ? 'rgba(239,68,68,.45)' : 'var(--border)'}`,
                  color: urgente ? '#ef4444' : 'var(--text-3)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>priority_high</span>
                Urgente
              </button>
              <div style={{ flex: 1 }} />
              <button
                onClick={handleEnviar}
                disabled={!texto.trim() || enviando}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, borderRadius: 10, border: 'none',
                  background: texto.trim() ? COLOR : 'var(--border)',
                  cursor: texto.trim() ? 'pointer' : 'default',
                  opacity: enviando ? .6 : 1, touchAction: 'manipulation',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 17, color: '#fff' }}>send</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Aviso({ msg, paraMi }: { msg: PaseMensaje; paraMi: boolean }) {
  const urgente = msg.prioridad === 'urgente'
  const color = urgente ? '#ef4444' : COLOR
  const deAyer = (msg.turno_fecha ?? msg.created_at.slice(0, 10)) !== hoyOperativo()

  return (
    <div style={{
      borderLeft: `3px solid ${color}`,
      background: paraMi ? 'rgba(67,97,160,.07)' : 'transparent',
      borderRadius: 8, padding: '7px 9px', marginBottom: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)' }}>
          {msg.usuario_nombre ?? 'Alguien'}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-3)' }}>
          {new Date(msg.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
        </span>
        {urgente && (
          <span style={{
            fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4,
            background: 'rgba(239,68,68,.14)', color: '#ef4444',
          }}>
            URGENTE
          </span>
        )}
        {deAyer && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
            background: 'rgba(245,158,11,.15)', color: '#d97706',
          }}>
            turno ant.
          </span>
        )}
        {paraMi && (
          <span style={{
            fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4,
            background: 'rgba(67,97,160,.14)', color: 'var(--accent)',
          }}>
            PARA VOS
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.4 }}>
        <RenderTexto texto={msg.texto} />
        {msg.plaza && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', padding: '1px 5px', borderRadius: 4,
            fontSize: 10, fontWeight: 700, marginLeft: 6,
            background: 'rgba(67,97,160,.12)', color: 'var(--accent)',
          }}>
            {PLAZA_LABELS_HASH[msg.plaza] ?? `#${msg.plaza}`}
          </span>
        )}
      </div>
    </div>
  )
}
