'use client'

import { useOnlineStatus } from '@/lib/offline/useOnlineStatus'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import SidebarNav from '@/components/shell/SidebarNav'

// Layout de la vista de servicio (Salón + KDS)
// Reglas: fondo oscuro, sin BottomNav, sin Coach FAB en KDS (sí en Salón, ver salon/page.tsx).
// Desktop (≥1024px, Sesión 3 C1): convive con el sidebar de gestión, en vez de tapar toda la pantalla.
// Tablet/mobile: full-screen como antes (KDS sigue siendo tablet-first).
// Ver .claude/docs/ui.md § "Vista de servicio"
export default function ServicioLayout({ children }: { children: React.ReactNode }) {
  const online = useOnlineStatus()
  const isDesktop = useIsDesktop()

  const contenido = (
    <div
      style={{
        position: isDesktop ? 'relative' : 'fixed',
        inset: isDesktop ? undefined : 0,
        flex: isDesktop ? 1 : undefined,
        minHeight: isDesktop ? 0 : undefined,
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

  if (!isDesktop) return contenido

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
      <SidebarNav dark />
      {contenido}
    </div>
  )
}
