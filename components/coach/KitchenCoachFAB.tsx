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

export default function KitchenCoachFAB({ stockCritico, tareasPendientes }: KitchenCoachFABProps) {
  const { messages, loading, error, isOpen, toggle, close, sendMessage, clearMessages } = useKitchenCoach()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const hasUnread = messages.length > 0 && !isOpen

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && <div className="kc-overlay" onClick={close} />}

      {/* Chat panel */}
      <div className={`kc-panel${isOpen ? ' kc-panel-open' : ''}`}>
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

      {/* FAB */}
      <button onClick={toggle} className="kc-fab" title="Kitchen Coach" aria-label="Kitchen Coach">
        <span className="material-symbols-outlined" style={{
          fontSize: 22, color: '#fff',
          transition: 'transform .2s',
          transform: isOpen ? 'rotate(90deg)' : 'none',
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
          bottom: 9rem; right: 1rem;
          width: 3.25rem; height: 3.25rem;
          border-radius: 50%;
          background: #f97316;
          border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 16px rgba(249,115,22,.4);
          z-index: 1001;
          transition: transform .2s;
        }
        .kc-fab:hover { transform: scale(1.05); }
        .kc-badge {
          position: absolute; top: 6px; right: 6px;
          width: 10px; height: 10px;
          border-radius: 50%;
          background: #ef4444;
          border: 2px solid #f97316;
        }
        .kc-panel {
          position: fixed;
          bottom: 5.5rem; right: 1rem;
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
        @media (max-width: 479px) {
          .kc-overlay { display: block; }
          .kc-panel {
            width: 100vw; height: 85vh;
            bottom: 0; right: 0;
            border-radius: 16px 16px 0 0;
            transform: translateY(100%);
          }
          .kc-panel-open { transform: translateY(0); }
        }
        @media (min-width: 480px) {
          .kc-fab { bottom: 1.5rem; }
        }
      `}</style>
    </>
  )
}
