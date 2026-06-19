'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { MODULO_CONFIG, MODULOS_POR_ROL, ROL_CONFIG } from '@/lib/constants'
import type { ModuloId } from '@/lib/constants'
import ImportadorUniversal from '@/components/importador/ImportadorUniversal'
import { useState } from 'react'

const SECCIONES: { label: string; items: ModuloId[] }[] = [
  { label: 'Operaciones', items: ['home', 'operaciones', 'tareas', 'pase', 'checklist'] },
  { label: 'Cocina', items: ['recetario', 'carta', 'produccion'] },
  { label: 'Insumos', items: ['stock', 'facturas', 'pedidos', 'proveedores', 'merma'] },
  { label: 'Gestión', items: ['reportes', 'ventas', 'haccp', 'calendario', 'turnos'] },
  { label: 'Sistema', items: ['equipo', 'configuracion'] },
]

export default function DesktopShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { perfil } = useAuth()
  const { puedeVer, isAdmin } = usePermisos()
  const [showImportador, setShowImportador] = useState(false)

  const rol = perfil?.rol ?? 'ayudante'
  const modulosDelRol = MODULOS_POR_ROL[rol]
  const rolConfig = perfil ? ROL_CONFIG[perfil.rol] : null

  const canSee = (id: ModuloId) =>
    id === 'home' || isAdmin || puedeVer(id)

  return (
    <div style={{ display: 'flex', height: '100dvh', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: 224,
        flexShrink: 0,
        background: 'var(--navy)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>

        {/* Logo */}
        <div style={{ padding: '28px 20px 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ color: 'white', fontSize: 24 }}>
              restaurant
            </span>
            <span style={{ color: 'white', fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em' }}>
              KitchenOS
            </span>
          </div>
        </div>

        {/* Importar datos — CTA destacado */}
        <div style={{ padding: '0 12px 16px', flexShrink: 0 }}>
          <button
            onClick={() => setShowImportador(true)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 12px', borderRadius: 10,
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'white', cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.16)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>upload_file</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Importar datos</span>
          </button>
        </div>

        {/* Divisor */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '0 16px 16px', flexShrink: 0 }} />

        {/* Módulos por sección */}
        <nav style={{ flex: 1, padding: '0 12px', overflowY: 'auto' }}>
          {SECCIONES.map(({ label, items }) => {
            const visibles = items.filter(
              id => MODULO_CONFIG[id] && (isAdmin || (modulosDelRol.includes(id) && canSee(id)))
            )
            if (visibles.length === 0) return null

            return (
              <div key={label} style={{ marginBottom: 20 }}>
                <p style={{
                  color: 'rgba(255,255,255,0.35)',
                  fontSize: 9, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                  padding: '0 8px', marginBottom: 4,
                }}>
                  {label}
                </p>

                {visibles.map(id => {
                  const mod = MODULO_CONFIG[id]
                  const isActive = id === 'home'
                    ? pathname === '/'
                    : pathname.startsWith(mod.href)

                  return (
                    <Link
                      key={id}
                      href={mod.href}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '7px 10px', borderRadius: 8, marginBottom: 1,
                        background: isActive ? 'rgba(255,255,255,0.13)' : 'transparent',
                        color: isActive ? 'white' : 'rgba(255,255,255,0.6)',
                        textDecoration: 'none',
                        fontWeight: isActive ? 600 : 400,
                        fontSize: 13,
                        transition: 'background 0.12s, color 0.12s',
                      }}
                      onMouseEnter={e => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                          e.currentTarget.style.color = 'rgba(255,255,255,0.85)'
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
                        }
                      }}
                    >
                      {isActive && (
                        <span style={{
                          position: 'absolute',
                          left: 0,
                          width: 3, height: 20, borderRadius: '0 3px 3px 0',
                          background: 'white',
                        }} />
                      )}
                      <span className="material-symbols-outlined" style={{ fontSize: 19, flexShrink: 0 }}>
                        {mod.icon}
                      </span>
                      <span>{mod.label}</span>
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Usuario */}
        {perfil && (
          <div style={{
            padding: '12px 16px 20px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}>
            <Link href="/perfil" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: rolConfig?.color ?? 'rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <span style={{ color: 'white', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' }}>
                  {perfil.initials}
                </span>
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ color: 'white', fontSize: 13, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {perfil.nombre}
                </p>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 1 }}>
                  {rolConfig?.label.split('·')[0].trim() ?? perfil.rol}
                </p>
              </div>
            </Link>
          </div>
        )}
      </aside>

      {/* ── Contenido principal ── */}
      <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minWidth: 0 }}>
        {children}
      </main>

      {showImportador && (
        <ImportadorUniversal onClose={() => setShowImportador(false)} />
      )}
    </div>
  )
}
