'use client'

import dynamic from 'next/dynamic'
import ShortcutsHelp from '@/components/desktop/ShortcutsHelp'
import CommandPalette from '@/components/desktop/CommandPalette'
import DemoBanner from '@/components/shell/DemoBanner'
import SidebarNav from '@/components/shell/SidebarNav'
import { useDesktopShortcuts } from '@/lib/hooks/useDesktopShortcuts'
import { useState, useEffect, useCallback } from 'react'

const DOCK_WIDTH = 380

// Dynamic import: ImportadorUniversal carga xlsx (~500kB) y solo se abre a demanda.
// Estático acá lo metía en el chunk del shell, que se parsea en toda navegación desktop.
const ImportadorUniversal = dynamic(() => import('@/components/importador/ImportadorUniversal'), { ssr: false })

export default function DesktopShell({ children, sidePanel }: { children: React.ReactNode; sidePanel?: React.ReactNode }) {
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

      {/* ── Contenido principal — ancho completo por default (S6, sep 2026).
          Antes tenía un maxWidth:1040 salvo 3 rutas en una lista blanca;
          se invirtió: cada pantalla decide su propio ancho interno si lo
          necesita, en vez de perder ~40% del monitor por default. ── */}
      <main className="hide-scrollbar" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minWidth: 0, height: '100%' }}>
        {children}
      </main>

      {/* ── Panel lateral fijo (Kitchen Coach) — empuja el contenido, no lo tapa.
          El botón de plegar vive en un carril propio, siempre presente en el
          flex row — no en `position:fixed` sobre el viewport (tapaba lo que
          hubiera a media altura de cualquier pantalla) ni pegado al borde de
          `main` (cada pantalla arma su propio header ahí, sin uno compartido:
          en Reportes tapaba el botón "Personal"). Con un carril propio,
          `main` nunca se extiende debajo del botón — no hay con qué chocar,
          en ninguna pantalla, sin tener que adivinar la altura de cada header. ── */}
      {sidePanel && (
        <div style={{ width: 60, flexShrink: 0, height: '100%', position: 'relative' }}>
          <button
            onClick={toggleDock}
            title={dockCollapsed ? 'Mostrar Kitchen Coach' : 'Ocultar Kitchen Coach'}
            style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 30, width: dockCollapsed ? 52 : 36, height: dockCollapsed ? 52 : 36,
              borderRadius: '50%', cursor: 'pointer',
              background: dockCollapsed ? '#f97316' : 'var(--surface)',
              border: dockCollapsed ? 'none' : '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: dockCollapsed ? '0 4px 16px rgba(249,115,22,.4)' : '0 2px 10px rgba(0,0,0,.15)',
              transition: 'width .2s ease, height .2s ease',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: dockCollapsed ? 22 : 18, color: dockCollapsed ? '#fff' : 'var(--text-2)' }}>
              {dockCollapsed ? 'chef_hat' : 'chevron_right'}
            </span>
          </button>
        </div>
      )}

      {sidePanel && !dockCollapsed && (
        <div style={{ width: DOCK_WIDTH, flexShrink: 0, height: '100%', borderLeft: '1px solid var(--border)', overflow: 'hidden' }}>
          {sidePanel}
        </div>
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
