'use client'

// "Mi puesto" — el cocinero ve su propia Ficha del puesto en modo lectura.
// /perfil/puesto no necesita permiso de módulo propio: RouteGuard resuelve
// por el primer segmento de la ruta (/perfil), que no está en RUTA_A_MODULO,
// así que es accesible sin importar el puesto/rol de quien entra.

import { useState } from 'react'
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
  // Puestos que además cubre: se leen en la misma pantalla, uno a la vez.
  const tambienCubre = (miembroPropio?.puestos_extra ?? [])
    .filter(id => id !== miembroPropio?.puesto_id)
    .map(id => puestos.find(p => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p)
  const [verId, setVerId] = useState<string | null>(null)
  const puestoMostrado = tambienCubre.find(p => p.id === verId) ?? miPuesto

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
        ) : !puestoMostrado ? (
          <EmptyState
            icon="badge"
            title="Todavía no tenés un puesto asignado"
            subtitle="Pedíselo al chef."
          />
        ) : (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {puestoMostrado !== miPuesto && miPuesto && (
              <button
                onClick={() => setVerId(null)}
                style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 13, fontWeight: 600, padding: 0 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
                Volver a {miPuesto.nombre}
              </button>
            )}
            <FichaPuesto key={puestoMostrado.id} puesto={puestoMostrado} modo="lectura" miembroPropioId={perfil?.miembro_id ?? null} />
            {puestoMostrado === miPuesto && tambienCubre.length > 0 && (
              <div>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>También cubrís</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {tambienCubre.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setVerId(p.id); window.scrollTo({ top: 0 }) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', textAlign: 'left',
                        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-2)' }}>work</span>
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{p.nombre}</span>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>chevron_right</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </PageTransition>
  )
}
