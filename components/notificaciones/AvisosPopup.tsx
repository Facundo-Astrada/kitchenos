'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { useNotificaciones } from '@/lib/hooks/useNotificaciones'
import { agruparAvisos, resumenPopup } from '@/lib/notificaciones/agrupar'
import { SheetChrome } from '@/lib/ui/chrome'
import type { Notificacion } from '@/types'

/**
 * El aviso nuevo llega como una pastilla arriba ("2 avisos nuevos"), no como
 * una campana siempre presente. Abrirla los marca leídos y la pastilla se va;
 * lo leído queda en /avisos. Los del mismo tipo se muestran agrupados.
 */
export function AvisosPopup() {
  const pathname = usePathname()
  const router = useRouter()
  const { notificaciones, noLeidas, marcarTodasLeidas } = useNotificaciones()
  // Foto de lo que se abrió: al marcar leídas, la lista viva queda vacía y la
  // hoja tiene que seguir mostrando lo que el usuario vino a ver.
  const [vistos, setVistos] = useState<Notificacion[] | null>(null)

  const sinLeer = notificaciones.filter(n => !n.leida)
  // En /avisos la bandeja ya muestra lo no leído: la pastilla sería ruido.
  const mostrarPastilla = noLeidas > 0 && pathname !== '/avisos'

  function abrir() {
    setVistos(sinLeer)
    marcarTodasLeidas()
  }

  function ir(link: string | null) {
    setVistos(null)
    if (link) router.push(link)
  }

  return (
    <>
      {mostrarPastilla && (
        <button
          onClick={abrir}
          className="toast-enter"
          style={{
            position: 'fixed', top: 'max(12px, env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)',
            zIndex: 900, maxWidth: 'calc(100vw - 32px)', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
            background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-1)',
            boxShadow: '0 4px 16px rgba(0,0,0,.18)', fontSize: 13, fontWeight: 600,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>notifications_active</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resumenPopup(sinLeer)}</span>
        </button>
      )}

      {vistos && typeof document !== 'undefined' && createPortal(
        <SheetChrome>
          <div
            onClick={() => setVistos(null)}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px 12px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', flex: 1 }}>Avisos nuevos</span>
                <button onClick={() => ir('/avisos')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--accent)', padding: 0 }}>
                  Ver todos
                </button>
                <button onClick={() => setVistos(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-3)' }}>close</span>
                </button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1, paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
                {agruparAvisos(vistos).map(g => (
                  <button
                    key={g.tipo}
                    onClick={() => ir(g.avisos.length === 1 ? g.ultimo.link : '/avisos')}
                    style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 16px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)', marginTop: 1 }}>{g.icono}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' }}>{g.titulo}</div>
                      {g.avisos.length === 1 && g.ultimo.cuerpo && (
                        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{g.ultimo.cuerpo}</div>
                      )}
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
