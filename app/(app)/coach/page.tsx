'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useKitchenCoach } from '@/lib/hooks/useKitchenCoach'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { createClient } from '@/lib/supabase/client'
import { listConvos, archiveConvo, deleteConvo, toMessages, type ArchivedConvo } from '@/lib/coach/history'
import { CoachActionCard } from '@/components/coach/CoachActionCard'

const NARANJA = '#f97316'

// ── Sugerencias del hogar del Coach ─────────────────────────────
// Preguntas que un dueño/encargado realmente haría, apuntadas a las
// tools de consulta reales (stock, precio, gasto, ventas).
const SUGERENCIAS: string[] = [
  '¿Cuánto gasté en mercadería los últimos 2 días?',
  '¿Cuál fue el último precio de la carne?',
  '¿Qué productos están en crítico?',
  '¿Cuánto vendí esta semana?',
  '¿Qué me conviene producir mañana?',
  '¿Por dónde empiezo a cargar mi restaurante?',
]

function fmtARS(n: number) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

// ── Datos clave del día (cards del hero) ────────────────────────
interface DatosClave {
  criticos: number
  vencen: number
  gastoHoy: number
}

function useDatosClave(): DatosClave | null {
  const RESTAURANTE_ID = useRestauranteId()
  const [datos, setDatos] = useState<DatosClave | null>(null)

  useEffect(() => {
    if (!RESTAURANTE_ID) return
    let cancel = false
    const supabase = createClient()
    const hoy = new Date().toISOString().split('T')[0]
    const en3 = new Date(Date.now() + 3 * 86_400_000).toISOString().split('T')[0]

    ;(async () => {
      const [prodRes, vencRes, factRes] = await Promise.all([
        supabase.from('productos')
          .select('stock_actual, stock_critico')
          .eq('restaurante_id', RESTAURANTE_ID).eq('activo', true).limit(1000),
        supabase.from('haccp_vencimientos')
          .select('id', { count: 'exact', head: true })
          .eq('restaurante_id', RESTAURANTE_ID)
          .in('status', ['vigente', 'por_vencer'])
          .lte('fecha_vencimiento', en3),
        supabase.from('facturas')
          .select('total')
          .eq('restaurante_id', RESTAURANTE_ID)
          .eq('fecha_factura', hoy),
      ])
      if (cancel) return
      const prods = (prodRes.data ?? []) as Array<{ stock_actual: number; stock_critico: number | null }>
      const criticos = prods.filter(p => p.stock_actual <= (p.stock_critico ?? 0)).length
      const gastoHoy = ((factRes.data ?? []) as Array<{ total: number | null }>)
        .reduce((s, f) => s + (Number(f.total) || 0), 0)
      setDatos({ criticos, vencen: vencRes.count ?? 0, gastoHoy })
    })()
    return () => { cancel = true }
  }, [RESTAURANTE_ID])

  return datos
}

function formatTime(d: Date) {
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export default function CoachPage() {
  const RESTAURANTE_ID = useRestauranteId()
  const storageKey = RESTAURANTE_ID ? `kc_active_${RESTAURANTE_ID}` : null
  const {
    messages, loading, error, sendMessage, clearMessages, replaceMessages,
    pendingAction, confirmingDraftId, confirmAction, cancelAction,
  } = useKitchenCoach({ storageKey })
  const datos = useDatosClave()

  const [input, setInput] = useState('')
  const [historialOpen, setHistorialOpen] = useState(false)
  const [convos, setConvos] = useState<ArchivedConvo[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Contexto de pantalla para la API (screen 'coach' → snapshot base liviano)
  useEffect(() => {
    localStorage.setItem('kc_screen_context', JSON.stringify({ screen: 'coach' }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [])

  const refreshConvos = useCallback(() => {
    if (RESTAURANTE_ID) setConvos(listConvos(RESTAURANTE_ID))
  }, [RESTAURANTE_ID])

  // Nueva conversación: archiva la actual (si tiene contenido) y limpia.
  const nuevaConversacion = useCallback(() => {
    if (RESTAURANTE_ID) archiveConvo(RESTAURANTE_ID, messages)
    clearMessages()
    setHistorialOpen(false)
  }, [RESTAURANTE_ID, messages, clearMessages])

  // Abre una conversación archivada: guarda la actual y carga la elegida.
  const abrirConvo = useCallback((c: ArchivedConvo) => {
    if (!RESTAURANTE_ID) return
    archiveConvo(RESTAURANTE_ID, messages)   // no perder la actual
    deleteConvo(RESTAURANTE_ID, c.id)        // la elegida pasa a ser la activa
    replaceMessages(toMessages(c))
    setHistorialOpen(false)
  }, [RESTAURANTE_ID, messages, replaceMessages])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const doSend = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await sendMessage(msg)
  }, [input, loading, sendMessage])

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend() }
  }

  const hasConversation = messages.length > 0
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && m.content && m.options?.length)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* Header navy */}
      <div style={{ background: 'var(--navy)', padding: '46px 16px 14px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: NARANJA, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#fff' }}>chef_hat</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 18, lineHeight: 1.1 }}>Kitchen Coach</div>
          <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 12 }}>Tu asistente de cocina con IA</div>
        </div>
        <button
          onClick={() => { refreshConvos(); setHistorialOpen(true) }}
          title="Historial"
          style={{ background: 'rgba(255,255,255,.12)', border: 'none', borderRadius: 10, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fff' }}>history</span>
        </button>
        {hasConversation && (
          <button
            onClick={nuevaConversacion}
            title="Nueva conversación"
            style={{ background: 'rgba(255,255,255,.12)', border: 'none', borderRadius: 10, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fff' }}>edit_square</span>
          </button>
        )}
      </div>

      {/* Drawer de historial */}
      {historialOpen && (
        <div
          onClick={() => setHistorialOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.45)', display: 'flex', justifyContent: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: 'min(360px, 88vw)', height: '100%', background: 'var(--surface)', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 30px rgba(0,0,0,.25)' }}
          >
            <div style={{ background: 'var(--navy)', padding: '46px 16px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 22 }}>history</span>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 17, flex: 1 }}>Historial</span>
              <button onClick={() => setHistorialOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 22 }}>close</span>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              <button
                onClick={nuevaConversacion}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(249,115,22,.08)', border: '1px solid rgba(249,115,22,.3)', borderRadius: 12, padding: '11px 14px', fontSize: 13.5, fontWeight: 700, color: NARANJA, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                Nueva conversación
              </button>
              {convos.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: '32px 12px' }}>
                  Todavía no hay conversaciones guardadas.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {convos.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '2px 2px 2px 12px' }}>
                      <button
                        onClick={() => abrirConvo(c)}
                        style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '8px 0' }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{new Date(c.updatedAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {c.messages.length} mensajes</div>
                      </button>
                      <button
                        onClick={() => { if (RESTAURANTE_ID) { deleteConvo(RESTAURANTE_ID, c.id); refreshConvos() } }}
                        title="Eliminar"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, display: 'flex', flexShrink: 0 }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Zona de mensajes / bienvenida */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!hasConversation ? (
          <div style={{ maxWidth: 640, width: '100%', margin: '0 auto', paddingTop: 8 }}>
            {/* Saludo */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', marginBottom: 6 }}>
                Hola, ¿en qué te ayudo?
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
                Preguntame lo que quieras sobre tu cocina: stock, precios, gastos, ventas,
                cómo usar la app o qué producir hoy. Puedo consultar tus datos reales y ejecutar acciones.
              </div>
            </div>

            {/* Datos clave del día */}
            {datos && (datos.criticos > 0 || datos.vencen > 0 || datos.gastoHoy > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
                <DatoCard
                  icon="warning" color="#dc2626"
                  valor={String(datos.criticos)} label="en crítico"
                  onClick={() => doSend('¿Qué productos están en crítico y qué me conviene reponer primero?')}
                />
                <DatoCard
                  icon="schedule" color="#d97706"
                  valor={String(datos.vencen)} label="vencen pronto"
                  onClick={() => doSend('¿Qué productos vencen en los próximos días?')}
                />
                <DatoCard
                  icon="payments" color="#4361a0"
                  valor={datos.gastoHoy > 0 ? fmtARS(datos.gastoHoy) : '$0'} label="gasto hoy"
                  onClick={() => doSend('¿Cuánto gasté en mercadería hoy?')}
                />
              </div>
            )}

            {/* Sugerencias */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SUGERENCIAS.map(s => (
                <button
                  key={s}
                  onClick={() => doSend(s)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 12, padding: '12px 14px', fontSize: 13.5,
                    color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: NARANJA, flexShrink: 0 }}>arrow_outward</span>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 720, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map(m => {
              const isLastAssistant = m.role === 'assistant' && m === lastAssistant
              if (m.role === 'user') {
                return (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                    <div style={{ background: NARANJA, borderRadius: '14px 4px 14px 14px', padding: '10px 14px', maxWidth: '85%', fontSize: 14, color: '#fff', lineHeight: 1.5, userSelect: 'text', WebkitUserSelect: 'text' }}>
                      {m.content}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{formatTime(m.timestamp)}</div>
                  </div>
                )
              }
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, maxWidth: '92%' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: NARANJA, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>chef_hat</span>
                    </div>
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px 14px 14px 14px', padding: '10px 14px', fontSize: 14, color: 'var(--text-1)', lineHeight: 1.6, whiteSpace: 'pre-wrap', userSelect: 'text', WebkitUserSelect: 'text' }}>
                      {m.content === '' ? <TypingDots /> : m.content}
                    </div>
                  </div>
                  {isLastAssistant && m.options && !loading && (
                    <div style={{ marginLeft: 36, marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {m.options.map((opt, oi) => (
                        <button key={oi} onClick={() => doSend(opt)} style={{ background: 'rgba(249,115,22,.1)', border: '1px solid rgba(249,115,22,.35)', borderRadius: 20, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, color: NARANJA, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--text-3)', paddingLeft: 36 }}>{formatTime(m.timestamp)}</div>
                </div>
              )
            })}
            {pendingAction && (
              <CoachActionCard
                action={pendingAction}
                onConfirm={confirmAction}
                onCancel={cancelAction}
                busy={confirmingDraftId === pendingAction.draft_id}
              />
            )}
            {error && <div style={{ fontSize: 13, color: '#ef4444', textAlign: 'center', padding: '4px 0' }}>{error}</div>}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Barra de prompt */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', background: 'var(--bg)', padding: '10px 12px', paddingBottom: 'max(env(safe-area-inset-bottom), 10px)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Escribí tu pregunta…"
            rows={1}
            style={{ flex: 1, resize: 'none', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', lineHeight: 1.4, maxHeight: 140, overflowY: 'auto' }}
          />
          <button
            onClick={() => doSend()}
            disabled={!input.trim() || loading}
            style={{ background: input.trim() && !loading ? NARANJA : 'var(--surface)', border: `1px solid ${input.trim() && !loading ? NARANJA : 'var(--border)'}`, borderRadius: 14, width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() && !loading ? 'pointer' : 'default', flexShrink: 0, transition: 'all .15s' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: input.trim() && !loading ? '#fff' : 'var(--text-3)' }}>
              {loading ? 'more_horiz' : 'arrow_upward'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-componentes (nivel módulo — referencia estable, no remonta) ──
function DatoCard({ icon, color, valor, label, onClick }: { icon: string; color: string; valor: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', fontFamily: 'inherit' }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 20, color }}>{icon}</span>
      <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
      <span style={{ fontSize: 10.5, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
    </button>
  )
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 0' }}>
      <span className="kc-dot" /><span className="kc-dot" /><span className="kc-dot" />
      <style>{`
        .kc-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-3); animation: kcp 1.2s ease-in-out infinite; }
        .kc-dot:nth-child(2) { animation-delay: .2s; }
        .kc-dot:nth-child(3) { animation-delay: .4s; }
        @keyframes kcp { 0%,80%,100% { transform: scale(.7); opacity: .5; } 40% { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  )
}
