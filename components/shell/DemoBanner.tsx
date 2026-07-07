'use client'

// Banner persistente de sesión demo (Q2). Solo se muestra cuando el restaurante
// activo es el clon demo — nunca en cuentas reales. Lleva a /register.
// No puede ser un <Link> plano: con sesión demo activa, proxy.ts redirige
// cualquier visita a /register de vuelta a '/' (regla "ya logueado → home").
// Por eso primero cierra la sesión demo y recién ahí navega.
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { useAuth } from '@/lib/auth/context'
import { DEMO_RESTAURANTE_ID } from '@/lib/demo'

export default function DemoBanner() {
  const restauranteId = useRestauranteId()
  const { signOut } = useAuth()
  if (restauranteId !== DEMO_RESTAURANTE_ID) return null

  return (
    <button
      onClick={() => signOut('/register')}
      style={{
        border: 'none',
        cursor: 'pointer',
        width: '100%',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        background: '#f97316',
        color: '#fff',
        padding: '8px 12px',
        fontSize: 12.5,
        fontWeight: 700,
        fontFamily: 'inherit',
        textAlign: 'center',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>visibility</span>
      Estás viendo la demo — Crear mi restaurante
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
    </button>
  )
}
