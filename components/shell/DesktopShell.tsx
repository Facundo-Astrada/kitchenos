'use client'

import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import ShortcutsHelp from '@/components/desktop/ShortcutsHelp'
import CommandPalette from '@/components/desktop/CommandPalette'
import DemoBanner from '@/components/shell/DemoBanner'
import SidebarNav from '@/components/shell/SidebarNav'
import { useDesktopShortcuts } from '@/lib/hooks/useDesktopShortcuts'
import { useState, useEffect, useCallback } from 'react'

// Rutas que necesitan ancho completo (tabla, mapa, gráficos)
const FULL_WIDTH_ROUTES = ['/stock', '/espacios', '/reportes']
const DOCK_WIDTH = 380

// Dynamic import: ImportadorUniversal carga xlsx (~500kB) y solo se abre a demanda.
// Estático acá lo metía en el chunk del shell, que se parsea en toda navegación desktop.
const ImportadorUniversal = dynamic(() => import('@/components/importador/ImportadorUniversal'), { ssr: false })

export default function DesktopShell({ children, sidePanel }: { children: React.ReactNode; sidePanel?: React.ReactNode }) {
  const pathname = usePathname()
  const [showImportador, setShowImportador] = useState(false)
  const [dockCollapsed, setDockCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('kc_dock_collapsed') === '1'
  })
  // Barra lateral izquierda (PLAN-ACCESO-Y-USO B7.1). Mismo patrón que el dock
  // del Coach de la derecha, que ya se plegaba desde antes.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('kc_sidebar_collapsed') === '1'
  })

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev
      localStorage.setItem('kc_sidebar_collapsed', next ? '1' : '0')
      return next
    })
  }, [])

  useEffect(() => {
    document.addEventListener('kos:toggle-sidebar', toggleSidebar)
    return () => document.removeEventListener('kos:toggle-sidebar', toggleSidebar)
  }, [toggleSidebar])

  useDesktopShortcuts()

  const isFullWidth = FULL_WIDTH_ROUTES.some(r => pathname.startsWith(r))

  function toggleDock() {
    setDockCollapsed(prev => {
      const next = !prev
      localStorage.setItem('kc_dock_collapsed', next ? '1' : '0')
      return next
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg)', overflow: 'hidden' }}>
      <DemoBanner />
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* height:100% — sin esto el wrapper (block, no flex) no le pasaba su
          propia altura estirada al <aside> hijo, que crecía a su altura de
          contenido natural y se salía de pantalla por abajo sin nada de qué
          scrollear (el perfil de usuario del fondo quedaba inalcanzable). */}
      <div style={{ position: 'relative', flexShrink: 0, height: '100%' }}>
        <SidebarNav onImportarClick={() => setShowImportador(true)} collapsed={sidebarCollapsed} />
        {/* Pestaña sobre el borde: visible siempre, sin robarle ancho al nav. */}
        <button
          onClick={toggleSidebar}
          title={`${sidebarCollapsed ? 'Mostrar' : 'Ocultar'} la barra lateral (Ctrl+B)`}
          aria-label={sidebarCollapsed ? 'Mostrar la barra lateral' : 'Ocultar la barra lateral'}
          style={{
            position: 'absolute', top: 34, right: -11, zIndex: 30,
            width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
            background: 'var(--surface)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 6px rgba(0,0,0,.18)', padding: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--text-2)' }}>
            {sidebarCollapsed ? 'chevron_right' : 'chevron_left'}
          </span>
        </button>
      </div>

      {/* ── Contenido principal ── */}
      <main className="hide-scrollbar" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minWidth: 0 }}>
        {isFullWidth ? children : (
          <div style={{ maxWidth: 1040, margin: '0 auto', height: '100%' }}>
            {children}
          </div>
        )}
      </main>

      {/* ── Panel lateral fijo (Kitchen Coach) — empuja el contenido, no lo tapa ── */}
      {sidePanel && !dockCollapsed && (
        <div style={{ width: DOCK_WIDTH, flexShrink: 0, height: '100%', borderLeft: '1px solid var(--border)', overflow: 'hidden' }}>
          {sidePanel}
        </div>
      )}

      {/* Botón para ocultar/mostrar el panel — se acomoda al borde según el estado */}
      {sidePanel && (
        <button
          onClick={toggleDock}
          title={dockCollapsed ? 'Mostrar Kitchen Coach' : 'Ocultar Kitchen Coach'}
          style={{
            position: 'fixed', top: '50%', transform: 'translateY(-50%)',
            right: dockCollapsed ? 16 : DOCK_WIDTH + 16,
            zIndex: 1001, width: dockCollapsed ? 52 : 36, height: dockCollapsed ? 52 : 36,
            borderRadius: '50%', cursor: 'pointer',
            background: dockCollapsed ? '#f97316' : 'var(--surface)',
            border: dockCollapsed ? 'none' : '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: dockCollapsed ? '0 4px 16px rgba(249,115,22,.4)' : '0 2px 10px rgba(0,0,0,.15)',
            transition: 'right .2s ease, width .2s ease, height .2s ease',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: dockCollapsed ? 22 : 18, color: dockCollapsed ? '#fff' : 'var(--text-2)' }}>
            {dockCollapsed ? 'chef_hat' : 'chevron_right'}
          </span>
        </button>
      )}

      {showImportador && (
        <ImportadorUniversal onClose={() => setShowImportador(false)} />
      )}

      <ShortcutsHelp />
      <CommandPalette />
      </div>
    </div>
  )
}
