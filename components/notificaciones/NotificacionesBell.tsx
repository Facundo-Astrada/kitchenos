'use client'

import Link from 'next/link'
import { useNotificaciones } from '@/lib/hooks/useNotificaciones'

/**
 * Acceso a la bandeja (/avisos) desde el footer del sidebar. Ya no abre un
 * sheet: el aviso nuevo llega por el popup (AvisosPopup) y el historial vive
 * en /avisos. La campana mobile flotante se sacó — sin avisos sin leer no hay
 * nada que mostrar, y la bandeja se abre desde Perfil.
 */
export function NotificacionesBell() {
  const { noLeidas } = useNotificaciones()
  return (
    <Link
      href="/avisos"
      onClick={e => e.stopPropagation()}
      aria-label="Avisos"
      title="Avisos"
      style={{
        position: 'relative', width: 24, height: 24, borderRadius: 6, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
        color: 'rgba(255,255,255,0.75)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>notifications</span>
      {noLeidas > 0 && (
        <span style={{
          position: 'absolute', top: -3, right: -3, minWidth: 15, height: 15, borderRadius: 8,
          background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 800, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
          border: '1.5px solid var(--bg)',
        }}>
          {noLeidas > 9 ? '9+' : noLeidas}
        </span>
      )}
    </Link>
  )
}
