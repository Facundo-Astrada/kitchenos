'use client'

import { useAuth } from '@/lib/auth/context'

/**
 * Returns the current restaurante_id from auth context.
 * Returns '' while auth is still loading — hooks should skip
 * fetching when the value is empty to avoid wasted queries.
 */
export function useRestauranteId(): string {
  try {
    const { restauranteId, loading } = useAuth()
    // Don't return a fake ID — wait for auth to resolve
    if (loading || !restauranteId) return ''
    return restauranteId
  } catch {
    // AuthProvider not mounted yet
    return ''
  }
}
