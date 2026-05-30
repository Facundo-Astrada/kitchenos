'use client'

import { useState, useRef, useEffect } from 'react'
import { useKitchenCoach } from '@/lib/hooks/useKitchenCoach'

interface KitchenCoachFABProps {
  stockCritico?: Array<{ nombre: string; cantidad: number; minimo: number }>
  tareasPendientes?: Array<{ titulo: string; prioridad: string; plaza?: string }>
}

const QUICK_SUGGESTIONS = [
  '¿Qué me conviene pedir hoy?',
  'Analizá mi food cost',
  '¿Cómo optimizo el mise en place?',
  'Sugerí recetas con lo que tengo',
]

function formatTime(d: Date) {
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

// ── Spotlight component — glow naranja sobre el elemento destacado
function CoachSpotlight({ targetId }: { targetId: string | null }) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)

  useEffect(() => {
    if (!targetId) { setRect(null); return }
    const el = document.querySelector(`[data-coach-target="${targetId}"]`)
    if (!el) { setRect(null); return }
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [targetId])

  if (!rect || !targetId) return null

  return (
    <div
      onClick={() => setRect(null)}
      style={{
        position: 'fixed',
        top: rect.top - 6,
        left: rect.left - 6,
        width: rect.width + 12,
        height: rect.height + 12,
        borderRadius: 14,
        border: '2px solid #f97316',
        boxShadow: '0 0 0 4px rgba(249,115,22,.2), 0 0 24px rgba(249,115,22,.35)',
        pointerEvents: 'auto',
        zIndex: 1200,
        animation: 'kc-spotlight 1.4s ease-in-out 2',
      }}
    />
  )
}

// ── Main component ─────────────────────────────────────────────
export default function KitchenCoachFAB({ stockCritico, tareasPendientes }: KitchenCoachFABProps) {
  const {
    messages, loading, error, isOpen, highlight,
    toggle, close, sendMessage, clearMessages,
  } = useKitchenCoach()

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const hasUnread = messages.length > 0 && !isOpen

  // ── FAB drag state ──────────────────────────────────────────
  const [fabPos, setFabPos] = useState<{ bottom: number; right: number }>(() => {
    if (typeof window === 'undefined') return { bottom: 144, right: 16 }
    try {
      const s = JSON.parse(localStorage.getItem('kc_fab_pos') ?? 'null')
      if (s && typeof s.bottom === 'number' && typeof s.right === 'number') return s
    } catch { /* ignore */ }
    return { bottom: 144, right: 16 }
  })
  const fabDragRef = useRef<{
    startX: number; startY: number
    startBottom: number; startRight: number
    moved: boolean
    lastBottom: number; lastRight: number
  } | null>(null)

  // ── Auto-scroll messages ────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Welcome OPS event (first visit) ────────────────────────
  useEffect(() => {
    function handleWelcomeOps() {
      // Small delay to let the page render
      setTimeout(() => {
        toggle()
        setTimeout(() => {
          sendMessage('Estoy en el módulo Operaciones por primera vez. Hacé un recorrido rápido de las 3 secciones: Producción, Mise y Planificación.', { stockCritico, tareasPendientes })
        }, 350)
      }, 800)
    }
    window.addEventListener('kc-welcome-ops', handleWelcomeOps)
    return () => window.removeEventListener('kc-welcome-ops', handleWelcomeOps)
  }, [toggle, sendMessage, stockCritico, tareasPendientes]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Input handlers ──────────────────────────────────────────
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px'
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      doSend()
    }
  }

  async function doSend(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await sendMessage(msg, { stockCritico, tareasPendientes })
  }

  // ── FAB drag handlers (Pointer Events — touch + mouse) ──────
  function onFabPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    fabDragRef.current = {
      startX: e.clientX, startY: e.clientY,
      startBottom: fabPos.bottom, startRight: fabPos.right,
      moved: false,
      lastBottom: fabPos.bottom, lastRight: fabPos.right,
    }
  }

  function onFabPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const dr = fabDragRef.current
    if (!dr || !(e.buttons & 1)) return
    const dx = e.clientX - dr.startX
    const dy = e.clientY - dr.startY
    if (!dr.moved && Math.hypot(dx, dy) < 8) return
    dr.moved = true
    const BOTTOM_NAV = 84 // BottomNav height + gap
    const newBottom = Math.max(BOTTOM_NAV, Math.min(window.innerHeight - 58, dr.startBottom - dy))
    const newRight = Math.max(8, Math.min(window.innerWidth - 58, dr.startRight - dx))
    dr.lastBottom = newBottom
    dr.lastRight = newRight
    setFabPos({ bottom: newBottom, right: newRight })
  }

  function onFabPointerUp() {
    const dr = fabDragRef.current
    fabDragRef.current = null
    if (dr?.moved) {
      const pos = { bottom: dr.lastBottom, right: dr.lastRight }
      localStorage.setItem('kc_fab_pos', JSON.stringify(pos))
    } else {
      toggle()
    }
  }

  // Panel position: above FAB on desktop, full-screen bottom on mobile
  const panelBottomDesktop = fabPos.bottom + 60
  const panelRightDesktop = Math.min(fabPos.right, Math.max(8, (typeof window !== 'undefined' ? window.innerWidth : 400) - 396))

  return (
    <>
      {/* Spotlight overlay */}
      <CoachSpotlight targetId={highlight} />

      {/* Mobile overlay */}
      {isOpen && <div className="kc-overlay" onClick={close} />}

      {/* Chat panel */}
      <div
        className={`kc-panel${isOpen ? ' kc-panel-open' : ''}`}
        style={{ '--kc-panel-bottom': `${panelBottomDesktop}px`, '--kc-panel-right': `${panelRightDesktop}px` } as React.CSSProperties}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 14px 12px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: '#f97316',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fff' }}>restaurant</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Kitchen Coach</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Asistente IA de cocina</div>
          </div>
          {messages.length > 0 && (
            <button onClick={clearMessages} title="Limpiar conversación"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)' }}>delete_sweep</span>
            </button>
          )}
          <button onClick={close} title="Cerrar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)' }}>close</span>
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages.length === 0 && (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', margin: '8px 0 12px' }}>
                ¡Hola! Soy tu Kitchen Coach. ¿En qué te ayudo hoy?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {QUICK_SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => doSend(s)} style={{
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '8px 12px',
                    textAlign: 'left', fontSize: 12, color: 'var(--text-2)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}

          {messages.map(m => (
            <div key={m.id} style={{
              display: 'flex', flexDirection: 'column',
              alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 2,
            }}>
              {m.role === 'assistant' && (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', background: '#f97316',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>restaurant</span>
                  </div>
                  <div style={{
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: '4px 12px 12px 12px',
                    padding: '8px 12px', maxWidth: '85%',
                    fontSize: 13, color: 'var(--text-1)', lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {m.content === '' ? (
                      <div className="kc-typing"><span /><span /><span /></div>
                    ) : m.content}
                  </div>
                </div>
              )}
              {m.role === 'user' && (
                <div style={{
                  background: '#f97316', borderRadius: '12px 4px 12px 12px',
                  padding: '8px 12px', maxWidth: '85%',
                  fontSize: 13, color: '#fff', lineHeight: 1.5,
                }}>
                  {m.content}
                </div>
              )}
              <div style={{ fontSize: 10, color: 'var(--text-3)', paddingLeft: m.role === 'assistant' ? 30 : 0 }}>
                {formatTime(m.timestamp)}
              </div>
            </div>
          ))}

          {error && (
            <div style={{ fontSize: 12, color: '#ef4444', textAlign: 'center', padding: '4px 0' }}>{error}</div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{
          display: 'flex', gap: 8, padding: '10px 12px',
          borderTop: '1px solid var(--border)', flexShrink: 0,
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Preguntale algo a tu Coach..."
            rows={1}
            style={{
              flex: 1, resize: 'none',
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '8px 10px',
              fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)',
              outline: 'none', lineHeight: 1.4, maxHeight: 96, overflowY: 'auto',
            }}
          />
          <button
            onClick={() => doSend()}
            disabled={!input.trim() || loading}
            style={{
              background: input.trim() && !loading ? '#f97316' : 'var(--bg)',
              border: `1px solid ${input.trim() && !loading ? '#f97316' : 'var(--border)'}`,
              borderRadius: 10, width: 38, height: 38,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              flexShrink: 0, alignSelf: 'flex-end', transition: 'all .15s',
            }}
          >
            <span className="material-symbols-outlined" style={{
              fontSize: 18, color: input.trim() && !loading ? '#fff' : 'var(--text-3)',
            }}>send</span>
          </button>
        </div>
      </div>

      {/* FAB — draggable */}
      <button
        className="kc-fab"
        title="Kitchen Coach"
        aria-label="Kitchen Coach"
        style={{ bottom: fabPos.bottom, right: fabPos.right, touchAction: 'none' }}
        onPointerDown={onFabPointerDown}
        onPointerMove={onFabPointerMove}
        onPointerUp={onFabPointerUp}
      >
        <span className="material-symbols-outlined" style={{
          fontSize: 22, color: '#fff',
          transition: 'transform .2s',
          transform: isOpen ? 'rotate(90deg)' : 'none',
          pointerEvents: 'none',
        }}>
          {isOpen ? 'close' : 'chef_hat'}
        </span>
        {hasUnread && <div className="kc-badge" />}
      </button>

      <style>{`
        .kc-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,.4);
          z-index: 999;
          display: none;
        }
        .kc-fab {
          position: fixed;
          width: 3.25rem; height: 3.25rem;
          border-radius: 50%;
          background: #f97316;
          border: none; cursor: grab;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 16px rgba(249,115,22,.4);
          z-index: 1001;
          user-select: none;
          -webkit-user-select: none;
        }
        .kc-fab:active { cursor: grabbing; }
        .kc-badge {
          position: absolute; top: 6px; right: 6px;
          width: 10px; height: 10px;
          border-radius: 50%;
          background: #ef4444;
          border: 2px solid #f97316;
        }
        .kc-panel {
          position: fixed;
          bottom: var(--kc-panel-bottom, 5.5rem);
          right: var(--kc-panel-right, 1rem);
          width: 380px; height: 520px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          display: flex; flex-direction: column;
          z-index: 1000;
          box-shadow: 0 8px 40px rgba(0,0,0,.25);
          overflow: hidden;
          transform: translateY(20px);
          opacity: 0;
          pointer-events: none;
          transition: transform .25s ease, opacity .25s ease;
        }
        .kc-panel-open {
          transform: translateY(0);
          opacity: 1;
          pointer-events: all;
        }
        .kc-typing {
          display: flex; gap: 4px; align-items: center; padding: 2px 0;
        }
        .kc-typing span {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--text-3);
          animation: kc-pulse 1.2s ease-in-out infinite;
        }
        .kc-typing span:nth-child(2) { animation-delay: .2s; }
        .kc-typing span:nth-child(3) { animation-delay: .4s; }
        @keyframes kc-pulse {
          0%, 80%, 100% { transform: scale(.7); opacity: .5; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes kc-spotlight {
          0%, 100% { box-shadow: 0 0 0 4px rgba(249,115,22,.2), 0 0 24px rgba(249,115,22,.35); }
          50% { box-shadow: 0 0 0 8px rgba(249,115,22,.12), 0 0 40px rgba(249,115,22,.5); }
        }
        @media (max-width: 479px) {
          .kc-overlay { display: block; }
          .kc-panel {
            width: 100vw; height: 85vh;
            bottom: 0 !important; right: 0 !important;
            border-radius: 16px 16px 0 0;
            transform: translateY(100%);
          }
          .kc-panel-open { transform: translateY(0); }
        }
      `}</style>
    </>
  )
}
