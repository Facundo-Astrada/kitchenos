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
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <EmptyState icon="lock" title="Sin acceso" subtitle="Esta pantalla no está disponible." />
      </div>
    )
  }

  // `body{overflow:hidden}` en globals.css asume que toda pantalla vive
  // dentro del shell de (app), que scrollea con `.scroll-body` (flex:1 +
  // overflow-y:auto). Esta página está fuera de ese shell a propósito (no
  // tiene restaurante), así que arma su propio contenedor flex de altura
  // completa con el mismo patrón — sin esto, cualquier contenido más alto
  // que la pantalla queda cortado y no hay forma de bajar.
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--navy)', padding: '20px 20px 16px', color: '#fff', flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Control del ecosistema</div>
        <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>Vista interna — no es parte del producto</div>
      </div>
      <div className="scroll-body">
        <AdminDashboard />
      </div>
    </div>
  )
}
