'use client'

// "Mi puesto" — el cocinero ve su propia Ficha del puesto en modo lectura.
// /perfil/puesto no necesita permiso de módulo propio: RouteGuard resuelve
// por el primer segmento de la ruta (/perfil), que no está en RUTA_A_MODULO,
// así que es accesible sin importar el puesto/rol de quien entra.

import { useRouter } from 'next/navigation'
import PageTransition from '@/components/PageTransition'
import { useAuth } from '@/lib/auth/context'
import { useEquipo } from '@/lib/hooks/useEquipo'
import { EmptyState, Skeleton, SkeletonHeader } from '@/components/ui'
import { FichaPuesto } from '@/components/organigrama/FichaPuesto'

export default function MiPuestoPage() {
  const router = useRouter()
  const { perfil } = useAuth()
  const { miembros, puestos, loading } = useEquipo()

  const miembroPropio = miembros.find(m => m.id === perfil?.miembro_id)
  const miPuesto = puestos.find(p => p.id === miembroPropio?.puesto_id)

  return (
    <PageTransition>
      <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 32 }}>
        <div style={{
          background: 'var(--navy)', padding: 'var(--header-top) 16px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <button onClick={() => router.push('/perfil')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#fff' }}>arrow_back</span>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>Mi puesto</h1>
        </div>

        {loading ? (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SkeletonHeader />
            <Skeleton height={140} radius={16} />
            <Skeleton height={80} radius={12} />
            <Skeleton height={200} radius={12} />
          </div>
        ) : !miPuesto ? (
          <EmptyState
            icon="badge"
            title="Todavía no tenés un puesto asignado"
            subtitle="Pedíselo al chef."
          />
        ) : (
          <div style={{ padding: 16 }}>
            <FichaPuesto puesto={miPuesto} modo="lectura" miembroPropioId={perfil?.miembro_id ?? null} />
          </div>
        )}
      </div>
    </PageTransition>
  )
}
