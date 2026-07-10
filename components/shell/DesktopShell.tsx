'use client'

import { usePathname } from 'next/navigation'
import ImportadorUniversal from '@/components/importador/ImportadorUniversal'
import ShortcutsHelp from '@/components/desktop/ShortcutsHelp'
import DemoBanner from '@/components/shell/DemoBanner'
import SidebarNav from '@/components/shell/SidebarNav'
import { useDesktopShortcuts } from '@/lib/hooks/useDesktopShortcuts'
import { useState } from 'react'

// Rutas que necesitan ancho completo (tabla, mapa, gráficos)
const FULL_WIDTH_ROUTES = ['/stock', '/espacios', '/reportes']

export default function DesktopShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [showImportador, setShowImportador] = useState(false)

  useDesktopShortcuts()

  const isFullWidth = FULL_WIDTH_ROUTES.some(r => pathname.startsWith(r))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg)', overflow: 'hidden' }}>
      <DemoBanner />
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      <SidebarNav onImportarClick={() => setShowImportador(true)} />

      {/* ── Contenido principal ── */}
      <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minWidth: 0 }}>
        {isFullWidth ? children : (
          <div style={{ maxWidth: 1040, margin: '0 auto', height: '100%' }}>
            {children}
          </div>
        )}
      </main>

      {showImportador && (
        <ImportadorUniversal onClose={() => setShowImportador(false)} />
      )}

      <ShortcutsHelp />
      </div>
    </div>
  )
}
