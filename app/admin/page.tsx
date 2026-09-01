'use client'

import { useAuth } from '@/lib/auth/context'
import { EmptyState } from '@/components/ui'
import { esAdminKOS } from '@/lib/admin/allowlist'
import { AdminDashboard } from '@/components/admin/AdminDashboard'

/**
 * Dashboard de control del ecosistema — fuera de `(app)`: no tiene
 * restaurante propio, así que no usa el shell/chrome pensado para una sola
 * cuenta (BottomNav, RouteGuard por módulo, Coach FAB).
 *
 * El chequeo de acá es solo UX (evita el parpadeo de la pantalla antes del
 * redirect). El gate real está en /api/admin/overview, del lado del
 * servidor — ver el comentario en esa ruta.
 */
export default function AdminPage() {
  const { user, loading } = useAuth()

  if (loading) return null
  if (!esAdminKOS(user?.email)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <EmptyState icon="lock" title="Sin acceso" subtitle="Esta pantalla no está disponible." />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--navy)', padding: '20px 20px 16px', color: '#fff' }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Control del ecosistema</div>
        <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>Vista interna — no es parte del producto</div>
      </div>
      <AdminDashboard />
    </div>
  )
}
