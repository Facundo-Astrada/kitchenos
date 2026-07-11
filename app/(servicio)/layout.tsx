'use client'

import { usePathname } from 'next/navigation'
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import SidebarNav from '@/components/shell/SidebarNav'

// Layout de la vista de servicio (Salón + KDS)
// KDS: fondo oscuro fijo (regla inamovible de despacho — alto contraste, pantallas grasientas).
// Salón: sigue el tema de la app (var(--bg)/var(--text-1)) como el resto de las pantallas (jul 2026).
// Desktop (≥1024px, Sesión 3 C1): convive con el sidebar de gestión, en vez de tapar toda la pantalla.
// Tablet/mobile: full-screen como antes (KDS sigue siendo tablet-first).
// Ver .claude/docs/ui.md § "Vista de servicio"
export default function ServicioLayout({ children }: { children: React.ReactNode }) {
  const online = useOnlineStatus()
  const isDesktop = useIsDesktop()
  const pathname = usePathname()
  const esKds = pathname?.startsWith('/kds') ?? false

  const contenido = (
    <div
      style={{
        position: isDesktop ? 'relative' : 'fixed',
        inset: isDesktop ? undefined : 0,
        flex: isDesktop ? 1 : undefined,
        minHeight: isDesktop ? 0 : undefined,
        background: esKds ? '#111' : 'var(--bg)',
        color: esKds ? '#fff' : 'var(--text-1)',
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
      <SidebarNav dark={esKds} />
      {contenido}
    </div>
  )
}
