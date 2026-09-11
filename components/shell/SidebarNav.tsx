'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { resetOnboardingDone } from '@/lib/hooks/useOnboardingProgress'
import { MODULO_CONFIG, MODULOS_POR_ROL, ROL_CONFIG, RUTA_A_MODULO } from '@/lib/constants'
import type { ModuloId } from '@/lib/constants'
import { NotificacionesBell } from '@/components/notificaciones/NotificacionesBell'

// 'tareas', 'checklist' y 'produccion' NO tienen ítem propio acá: son rutas
// viejas que redirigen a /operaciones (tabs Producción/Mise/Planificación,
// ver operaciones/page.tsx) — mostrarlas como accesos aparte era 3 entradas
// de sidebar para una sola pantalla. Excepción: perfil 'emprendimiento'
// (VOGLIO Farina), donde /tareas y /produccion SÍ son pantallas propias
// (no pasan por Ops — ver tareas/page.tsx y RUTA_A_MODULO_EMPRENDIMIENTO en
// RouteGuard.tsx), así que se agregan de vuelta solo para ese perfil.
// 'turnos' tampoco tiene ítem propio: comparte href literal con 'equipo'
// (mismo /turnos) — se deja un solo acceso, con el id 'equipo' porque esa es
// la clave de permiso real (ver el comentario en MODULO_CONFIG.equipo).
// Color por sección: categórico (var(--cat-*) en globals.css), no de estado
// — ver el comentario ahí. Solo tiñe el título y el indicador activo, nunca
// fondo ni ícono, para no subir el dial de "carácter" del registro Preparación.
function seccionesNav(esEmprendimiento: boolean): { label: string; color: string; items: ModuloId[] }[] {
  return [
    { label: 'Operaciones', color: 'var(--cat-operaciones)', items: ['home', 'operaciones', 'espacios', ...(esEmprendimiento ? (['tareas'] as ModuloId[]) : []), 'pase', 'equipo'] },
    { label: 'Cocina', color: 'var(--cat-cocina)', items: ['recetario', 'carta', ...(esEmprendimiento ? (['produccion'] as ModuloId[]) : [])] },
    { label: 'Servicio', color: 'var(--cat-servicio)', items: ['salon', 'kds', 'muro', 'reservas'] },
    { label: 'Insumos', color: 'var(--cat-insumos)', items: ['stock', 'facturas', 'merma'] },
    { label: 'Gestión', color: 'var(--cat-gestion)', items: ['reportes', 'presupuesto', 'ventas', 'clientes', 'haccp', 'calendario', 'bitacora'] },
    { label: 'Sistema', color: 'var(--cat-sistema)', items: ['organigrama', 'configuracion'] },
  ]
}

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
  const { perfil, user } = useAuth()
  const { puedeVer, isAdmin, moduloEnPerfil, perfilRestaurante } = usePermisos()

  const rol = perfil?.rol ?? 'ayudante'
  // Segundo cinturón, por si un rol se escapa de mapRol(): sin el fallback,
  // `modulosDelRol` queda undefined y el .includes() de abajo tira TypeError —
  // la navegación entera desaparece, no solo los módulos de ese rol.
  const modulosDelRol = MODULOS_POR_ROL[rol] ?? MODULOS_POR_ROL.ayudante
  const rolConfig = perfil ? ROL_CONFIG[perfil.rol] : null
  const SECCIONES = seccionesNav(perfilRestaurante === 'emprendimiento')

  // 'facturas' (Compras) acepta cualquiera de varios permisos desde la
  // consolidación de Pedidos/Proveedores (S6, sep 2026) — mismo OR-set que
  // RUTA_A_MODULO, para que el sidebar no esconda el acceso a alguien que
  // solo tiene 'pedidos' o solo 'proveedores' pero no 'facturas'.
  const canSee = (id: ModuloId) => {
    if (id === 'home' || isAdmin) return moduloEnPerfil(id)
    const gate = RUTA_A_MODULO[MODULO_CONFIG[id]?.href ?? '']
    const candidatos = Array.isArray(gate) ? gate : [id]
    return candidatos.some(m => puedeVer(m) && moduloEnPerfil(m))
  }

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
        {SECCIONES.map(({ label, color, items }) => {
          const visibles = items.filter(
            id => MODULO_CONFIG[id] && (isAdmin || (modulosDelRol.includes(id) && canSee(id))) && moduloEnPerfil(id)
          )
          if (visibles.length === 0) return null

          return (
            <div key={label} style={{ marginBottom: 20 }}>
              {collapsed ? (
                <div style={{ height: 2, borderRadius: 1, background: color, opacity: 0.8, margin: '0 6px 6px' }} />
              ) : (
                <p style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  color, fontSize: 11, fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  padding: '0 8px', marginBottom: 4,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
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
                      position: 'relative',
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
                        background: color,
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

        {/* Guía de inicio / Organización — solo admin, hardcodeado (no es un
            ModuloId: sumar uno no lo habilita para puestos ya creados en DB,
            ver feedback_modulo_nuevo_backfill). Único acceso a /onboarding y
            /implantacion fuera de Configuración (S7 sep 2026). */}
        {isAdmin && (
          <div style={{ marginBottom: 20 }}>
            <Link
              href="/onboarding"
              title={collapsed ? 'Guía de inicio' : undefined}
              onClick={() => resetOnboardingDone(user?.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: '7px 10px', borderRadius: 8, marginBottom: 1,
                color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: 13,
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.85)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 19, flexShrink: 0 }}>rocket_launch</span>
              {!collapsed && <span>Guía de inicio</span>}
            </Link>
            <Link
              href="/implantacion"
              title={collapsed ? 'Organización' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: '7px 10px', borderRadius: 8,
                background: pathname.startsWith('/implantacion') ? 'rgba(255,255,255,0.13)' : 'transparent',
                color: pathname.startsWith('/implantacion') ? 'white' : 'rgba(255,255,255,0.6)',
                textDecoration: 'none', fontSize: 13,
                fontWeight: pathname.startsWith('/implantacion') ? 600 : 400,
              }}
              onMouseEnter={e => { if (!pathname.startsWith('/implantacion')) e.currentTarget.style.color = 'rgba(255,255,255,0.85)' }}
              onMouseLeave={e => { if (!pathname.startsWith('/implantacion')) e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 19, flexShrink: 0 }}>landscape</span>
              {!collapsed && <span>Organización</span>}
            </Link>
          </div>
        )}
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
