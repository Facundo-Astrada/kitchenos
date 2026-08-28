'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useNotificaciones } from '@/lib/hooks/useNotificaciones'
import { SheetChrome } from '@/lib/ui/chrome'
import type { Notificacion } from '@/types'

function formatDesde(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const horas = Math.floor(mins / 60)
  if (horas < 24) return `hace ${horas}h`
  return `hace ${Math.floor(horas / 24)}d`
}

interface Props {
  /** sidebar = ícono chico sobre navy (footer de SidebarNav) · floating = botón flotante mobile */
  variant?: 'sidebar' | 'floating'
}

/** Campanita + feed de notificaciones in-app (solo in-app: sin push/email/WhatsApp). */
export function NotificacionesBell({ variant = 'floating' }: Props) {
  const router = useRouter()
  const { notificaciones, noLeidas, marcarLeida, marcarTodasLeidas } = useNotificaciones()
  const [open, setOpen] = useState(false)

  function abrir(n: Notificacion) {
    if (!n.leida) marcarLeida(n.id)
    setOpen(false)
    if (n.link) router.push(n.link)
  }

  return (
    <>
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
        aria-label="Notificaciones"
        title="Notificaciones"
        style={{
          position: variant === 'floating' ? 'fixed' : 'relative',
          top: variant === 'floating' ? 'max(12px, env(safe-area-inset-top))' : undefined,
          right: variant === 'floating' ? 12 : undefined,
          zIndex: variant === 'floating' ? 900 : undefined,
          width: variant === 'sidebar' ? 24 : 40,
          height: variant === 'sidebar' ? 24 : 40,
          borderRadius: variant === 'sidebar' ? 6 : '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, padding: 0,
          background: variant === 'sidebar' ? 'rgba(255,255,255,0.08)' : 'var(--surface)',
          border: variant === 'sidebar' ? '1px solid rgba(255,255,255,0.12)' : '1px solid var(--border)',
          color: variant === 'sidebar' ? 'rgba(255,255,255,0.75)' : 'var(--text-2)',
          boxShadow: variant === 'floating' ? '0 2px 10px rgba(0,0,0,.15)' : undefined,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: variant === 'sidebar' ? 14 : 20 }}>
          notifications
        </span>
        {noLeidas > 0 && (
          <span style={{
            position: 'absolute', top: variant === 'sidebar' ? -3 : 2, right: variant === 'sidebar' ? -3 : 2,
            minWidth: 15, height: 15, borderRadius: 8, background: '#ef4444', color: '#fff',
            fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', border: '1.5px solid var(--bg)', lineHeight: 1,
          }}>
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <SheetChrome>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          >
            <div
              onClick={e => e.stopPropagation()}
              className="toast-enter"
              style={{
                width: '100%', maxWidth: 420, maxHeight: '75vh', background: 'var(--bg)',
                borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column',
                boxShadow: '0 -8px 30px rgba(0,0,0,.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', flex: 1 }}>Notificaciones</span>
                {noLeidas > 0 && (
                  <button
                    onClick={marcarTodasLeidas}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--accent)', padding: 0 }}
                  >
                    Marcar todas leídas
                  </button>
                )}
                <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-3)' }}>close</span>
                </button>
              </div>

              <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0', paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
                {notificaciones.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                    Sin notificaciones todavía.
                  </div>
                ) : notificaciones.map(n => (
                  <button
                    key={n.id}
                    onClick={() => abrir(n)}
                    style={{
                      width: '100%', textAlign: 'left', display: 'flex', gap: 10, alignItems: 'flex-start',
                      padding: '12px 16px', background: n.leida ? 'transparent' : 'rgba(67,97,160,.06)',
                      border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.leida ? 'transparent' : 'var(--accent)', marginTop: 5, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: n.leida ? 500 : 700, color: 'var(--text-1)' }}>{n.titulo}</div>
                      {n.cuerpo && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{n.cuerpo}</div>}
                      <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 4 }}>{formatDesde(n.created_at)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SheetChrome>,
        document.body,
      )}
    </>
  )
}
