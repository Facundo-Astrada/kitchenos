'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { SheetChrome } from '@/lib/ui/chrome'
import { tap } from '@/lib/ui/motion'

// ── Hoja "Copiar pase" ───────────────────────────────────────────────────
//
// Al lado de "Entregar plaza". Muestra el texto que hoy el equipo tipea a
// mano en WhatsApp (ver lib/ops/textoPase.ts — la lista sale de las tareas
// reales, no de nada inventado acá) y lo manda por Web Share si el navegador
// lo soporta (un tap, WhatsApp incluido en el picker) o lo copia al portapapeles.
//
// El texto queda editable a propósito: es la red de contención para lo que la
// app todavía no captura estructurado. No se manda a ciegas.

const btnReset: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'inherit',
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    // Fallback para webviews que bloquean la Clipboard API (algunos Android
    // embebidos en apps de terceros).
    try {
      const ta = document.createElement('textarea')
      ta.value = texto
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}

interface PaseSheetProps {
  titulo: string
  textoInicial: string
  onClose: () => void
}

export function PaseSheet({ titulo, textoInicial, onClose }: PaseSheetProps) {
  const [texto, setTexto] = useState(textoInicial)
  const [estado, setEstado] = useState<'idle' | 'copiado'>('idle')

  async function handleCompartir() {
    tap()
    // navigator.share abre el picker nativo (WhatsApp entre las opciones) en
    // un solo tap — lo preferimos a copiar+abrir+pegar cuando existe.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text: texto })
        return
      } catch {
        // Cancelado por el usuario o no soportado en este momento — cae a copiar.
      }
    }
    const ok = await copiar(texto)
    if (ok) {
      setEstado('copiado')
      setTimeout(() => setEstado('idle'), 2000)
    }
  }

  async function handleCopiar() {
    tap()
    const ok = await copiar(texto)
    if (ok) {
      setEstado('copiado')
      setTimeout(() => setEstado('idle'), 2000)
    }
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <SheetChrome>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 0,
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          className="toast-enter"
          style={{
            width: '100%', maxWidth: 420, background: 'var(--bg)', borderRadius: '20px 20px 0 0',
            padding: '20px 20px max(18px, env(safe-area-inset-bottom, 18px))',
            boxShadow: '0 -8px 30px rgba(0,0,0,.25)', display: 'flex', flexDirection: 'column', gap: 12,
            maxHeight: '85vh',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--text-2)' }}>content_copy</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{titulo}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Revisá y mandalo como siempre</div>
            </div>
            <button onClick={onClose} title="Cerrar" style={{ ...btnReset, padding: 6, color: 'var(--text-3)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
            </button>
          </div>

          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            rows={12}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '12px 13px', borderRadius: 12,
              border: '1px solid var(--border)', background: 'var(--surface)',
              fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)', resize: 'vertical',
              outline: 'none', lineHeight: 1.5, flex: 1, minHeight: 180, overflowY: 'auto',
              whiteSpace: 'pre-wrap',
            }}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleCopiar}
              style={{
                ...btnReset, flex: 1, padding: '13px 0', borderRadius: 12,
                background: 'var(--surface)', border: '1px solid var(--border)',
                fontSize: 13, fontWeight: 700, color: 'var(--text-2)', gap: 6,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
                {estado === 'copiado' ? 'check' : 'content_copy'}
              </span>
              {estado === 'copiado' ? 'Copiado' : 'Copiar'}
            </button>
            <button
              onClick={handleCompartir}
              style={{
                ...btnReset, flex: 1.4, padding: '13px 0', borderRadius: 12, border: 'none',
                background: '#22c55e', color: '#fff', fontSize: 13, fontWeight: 700, gap: 6,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>share</span>
              Compartir
            </button>
          </div>
        </div>
      </div>
    </SheetChrome>,
    document.body,
  )
}
