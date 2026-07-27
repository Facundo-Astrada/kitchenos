'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth/context'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { RUTA_A_MODULO } from '@/lib/constants'

// En perfil emprendimiento, algunas rutas legacy deben resolver a su propio
// módulo real en vez del proxy hacia 'operaciones' (OPS, que este perfil no ve).
// Solo aplica cuando perfilRestaurante === 'emprendimiento' — no cambia nada
// para el resto de los restaurantes (evita regresar el proxy legacy que hoy
// usan sus permisos por rol/puesto).
const RUTA_A_MODULO_EMPRENDIMIENTO: Record<string, string> = {
  '/tareas': 'tareas',
  '/produccion': 'produccion',
}

const MODULO_LABEL: Record<string, string> = {
  facturas: 'Facturas',
  configuracion: 'Configuración',
  espacios: 'Espacios',
  reportes: 'Reportes',
  ventas: 'Ventas',
  carta: 'Carta',
  recetario: 'Recetario',
  stock: 'Stock',
  operaciones: 'OPS',
  pedidos: 'Pedidos',
  proveedores: 'Proveedores',
  merma: 'Merma',
  haccp: 'HACCP',
  equipo: 'Equipo',
  salon: 'Salón',
  kds: 'KDS',
  calendario: 'Calendario',
  pase: 'Pase',
}

export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { perfil, loading: authLoading } = useAuth()
  const { puedeVer, loading: permLoading, isAdmin, moduloEnPerfil, perfilRestaurante } = usePermisos()
  const [moduloBloqueado, setModuloBloqueado] = useState<string | null>(null)

  const stillLoading = authLoading || permLoading

  useEffect(() => {
    if (stillLoading) return
    if (!perfil) { setModuloBloqueado(null); return }

    const basePath = '/' + (pathname.split('/')[1] ?? '')
    const modulo = (perfilRestaurante === 'emprendimiento' && RUTA_A_MODULO_EMPRENDIMIENTO[basePath])
      || RUTA_A_MODULO[basePath]

    if (!modulo) { setModuloBloqueado(null); return }

    // El perfil del restaurante (ej. modo emprendimiento) bloquea incluso a admin.
    if (!moduloEnPerfil(modulo)) { setModuloBloqueado(modulo); return }

    if (isAdmin) { setModuloBloqueado(null); return }

    if (!puedeVer(modulo)) {
      setModuloBloqueado(modulo)
    } else {
      setModuloBloqueado(null)
    }
  }, [pathname, stillLoading, perfil, isAdmin, puedeVer, moduloEnPerfil, perfilRestaurante])

  if (stillLoading) return null

  if (moduloBloqueado) {
    const nombre = MODULO_LABEL[moduloBloqueado] ?? moduloBloqueado
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 10, padding: 32,
        background: 'var(--bg)',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 52, color: 'var(--text-3)' }}>lock</span>
        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0, textAlign: 'center' }}>
          Sin acceso a {nombre}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, textAlign: 'center', maxWidth: 260 }}>
          Pedile al administrador que habilite este módulo en tu perfil.
        </p>
        <button
          onClick={() => router.replace('/')}
          style={{
            marginTop: 8, padding: '10px 24px', borderRadius: 12, border: 'none',
            background: 'var(--navy)', color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Volver al inicio
        </button>
      </div>
    )
  }

  return <>{children}</>
}
