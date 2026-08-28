'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { MODULO_CONFIG, MODULOS_POR_ROL, ROL_CONFIG } from '@/lib/constants'
import type { ModuloId } from '@/lib/constants'
import { NotificacionesBell } from '@/components/notificaciones/NotificacionesBell'

const SECCIONES: { label: string; items: ModuloId[] }[] = [
  { label: 'Operaciones', items: ['home', 'operaciones', 'espacios', 'tareas', 'pase', 'checklist'] },
  { label: 'Cocina', items: ['recetario', 'carta', 'produccion'] },
  { label: 'Servicio', items: ['salon', 'kds', 'muro', 'reservas'] },
  { label: 'Insumos', items: ['stock', 'facturas', 'pedidos', 'proveedores', 'merma'] },
  { label: 'Gestión', items: ['reportes', 'presupuesto', 'ventas', 'clientes', 'haccp', 'calendario', 'turnos', 'bitacora'] },
  { label: 'Sistema', items: ['equipo', 'organigrama', 'configuracion'] },
]

interface Props {
  onImportarClick?: () => void
  /** Vista de servicio (Salón/KDS) usa fondo #111 en vez de var(--navy) — ver ui.md § Vista de servicio */
  dark?: boolean
  /**
   * Colapsada a iconos (PLAN-ACCESO-Y-USO B7.1). No se colapsa a cero a
   * propósito: a cero se pierde la navegación entera y hay que descubrir un
   * botón flotante para recuperarla. Con iconos el destino sigue estando a un
   * clic y el contenido igual recupera ~150px.
   */
  collapsed?: boolean
}

export const SIDEBAR_ANCHO = 224
export const SIDEBAR_ANCHO_COLAPSADO = 68

export default function SidebarNav({ onImportarClick, dark = false, collapsed = false }: Props) {
  const pathname = usePathname()
  const { perfil } = useAuth()
  const { puedeVer, isAdmin, moduloEnPerfil } = usePermisos()

  const rol = perfil?.rol ?? 'ayudante'
  const modulosDelRol = MODULOS_POR_ROL[rol]
  const rolConfig = perfil ? ROL_CONFIG[perfil.rol] : null

  const canSee = (id: ModuloId) =>
    (id === 'home' || isAdmin || puedeVer(id)) && moduloEnPerfil(id)

  return (
    <aside style={{
      width: collapsed ? SIDEBAR_ANCHO_COLAPSADO : SIDEBAR_ANCHO,
      height: '100%',
      transition: 'width .18s ease',
      flexShrink: 0,
      background: dark ? '#161616' : 'var(--navy)',
      borderRight: dark ? '1px solid #2a2a2a' : 'none',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>

      {/* Logo */}
      <div style={{ padding: collapsed ? '28px 0 16px' : '28px 20px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <span className="material-symbols-outlined" style={{ color: 'white', fontSize: 24 }}>
            restaurant
          </span>
          {!collapsed && (
            <span style={{ color: 'white', fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em' }}>
              KitchenOS
            </span>
          )}
        </div>
      </div>

      {/* Importar datos — CTA destacado (solo gestión, no en servicio) */}
      {onImportarClick && (
        <div style={{ padding: collapsed ? '0 10px 16px' : '0 12px 16px', flexShrink: 0 }}>
          <button
            onClick={onImportarClick}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? '9px 0' : '9px 12px', borderRadius: 10,
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'white', cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.16)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>upload_file</span>
            {!collapsed && <span style={{ fontSize: 13, fontWeight: 600 }}>Importar datos</span>}
          </button>
        </div>
      )}

      {/* Divisor */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '0 16px 16px', flexShrink: 0 }} />

      {/* Módulos por sección — minHeight:0 es lo que hace que ESTE nav
          scrollee y no el <aside> entero (que se arrastraba el perfil de
          abajo con él): un flex item con overflow:auto pero sin minHeight:0
          no se achica, empuja al padre a desbordarse en vez de scrollear. */}
      <nav className="hide-scrollbar" style={{ flex: 1, minHeight: 0, padding: '0 12px', overflowY: 'auto' }}>
        {SECCIONES.map(({ label, items }) => {
          const visibles = items.filter(
            id => MODULO_CONFIG[id] && (isAdmin || (modulosDelRol.includes(id) && canSee(id))) && moduloEnPerfil(id)
          )
          if (visibles.length === 0) return null

          return (
            <div key={label} style={{ marginBottom: 20 }}>
              {collapsed ? (
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '0 6px 6px' }} />
              ) : (
                <p style={{
                  color: 'rgba(255,255,255,0.35)',
                  fontSize: 9, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                  padding: '0 8px', marginBottom: 4,
                }}>
                  {label}
                </p>
              )}

              {visibles.map(id => {
                const mod = MODULO_CONFIG[id]
                const isActive = id === 'home'
                  ? pathname === '/'
                  : pathname.startsWith(mod.href)

                return (
                  <Link
                    key={id}
                    href={mod.href}
                    // Colapsada, el title es la única pista del destino.
                    title={collapsed ? mod.label : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      justifyContent: collapsed ? 'center' : 'flex-start',
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
                    {!collapsed && <span>{mod.label}</span>}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* Usuario + atajo ? */}
      {perfil && (
        <div style={{
          padding: collapsed ? '12px 0 20px' : '12px 16px 20px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}>
          <Link
            href="/perfil"
            title={collapsed ? perfil.nombre : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', justifyContent: collapsed ? 'center' : 'flex-start' }}
          >
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
            {!collapsed && (
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ color: 'white', fontSize: 13, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {perfil.nombre}
                </p>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 1 }}>
                  {rolConfig?.label.split('·')[0].trim() ?? perfil.rol}
                </p>
              </div>
            )}
            {!collapsed && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <NotificacionesBell variant="sidebar" />
                <button
                  onClick={e => { e.preventDefault(); document.dispatchEvent(new CustomEvent('kos:shortcuts-help')) }}
                  title="Atajos de teclado (?)"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}
                >
                  ?
                </button>
              </div>
            )}
          </Link>
        </div>
      )}
    </aside>
  )
}
