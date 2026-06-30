'use client'

import { useOnlineStatus } from '@/lib/offline/useOnlineStatus'

// Layout de la vista de servicio (Salón + KDS)
// Reglas: pantalla completa, fondo oscuro, sin BottomNav, sin Coach FAB.
// Ver .claude/docs/ui.md § "Vista de servicio"
export default function ServicioLayout({ children }: { children: React.ReactNode }) {
  const online = useOnlineStatus()
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#111',
        color: '#fff',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {!online && (
        <div
          style={{
            flexShrink: 0, background: '#c0392b', color: '#fff',
            textAlign: 'center', padding: '6px 12px', fontSize: 14, fontWeight: 700,
          }}
        >
          Sin conexión — los cambios se sincronizan al reconectar
        </div>
      )}
      {children}
    </div>
  )
}
