'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth/context'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { RUTA_A_MODULO } from '@/lib/constants'

export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { perfil, loading: authLoading } = useAuth()
  const { puedeVer, loading: permLoading, isAdmin } = usePermisos()
  const [allowed, setAllowed] = useState(true)

  // Wait for auth to finish loading
  const stillLoading = authLoading || permLoading

  useEffect(() => {
    if (stillLoading) return
    // No perfil means user has no restaurant link — let them through
    // (the dashboard will show empty state, not a lock screen)
    if (!perfil) { setAllowed(true); return }

    // Admin always has access
    if (isAdmin) { setAllowed(true); return }

    // Find the module for this route
    const basePath = '/' + (pathname.split('/')[1] ?? '')
    const modulo = RUTA_A_MODULO[basePath]

    // Unknown routes or always-accessible routes
    if (!modulo) { setAllowed(true); return }

    if (!puedeVer(modulo)) {
      setAllowed(false)
      router.replace('/')
    } else {
      setAllowed(true)
    }
  }, [pathname, stillLoading, perfil, isAdmin, puedeVer, router])

  if (stillLoading) return null // parent layout already shows spinner
  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8" style={{ background: 'var(--bg)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-3)' }}>lock</span>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>No tenés acceso a este módulo</p>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>Contactá al administrador para cambiar tus permisos</p>
      </div>
    )
  }

  return <>{children}</>
}
