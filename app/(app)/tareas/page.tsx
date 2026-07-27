'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePermisos } from '@/lib/hooks/usePermisos'
import TareasSimpleClientView from './TareasSimpleClientView'

// Perfil 'emprendimiento': lista de tareas simple, propia (no toca OPS).
// Resto de restaurantes: ruta vieja — la vista de Producción vive en OPS
// (/operaciones, tab Producción). Redirigimos para una sola puerta de entrada.
export default function TareasPage() {
  const router = useRouter()
  const { perfilRestaurante, loading } = usePermisos()

  useEffect(() => {
    if (!loading && perfilRestaurante !== 'emprendimiento') {
      router.replace('/operaciones?tab=produccion')
    }
  }, [loading, perfilRestaurante, router])

  if (loading || perfilRestaurante !== 'emprendimiento') return null

  return <TareasSimpleClientView />
}
