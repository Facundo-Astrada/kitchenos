'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import type { EstadoPlatoDesarrollo, FichaDesarrollo, PlatoDesarrollo } from '@/types'

// Platos en desarrollo (PLAN-DESARROLLO-PLATOS-2026-10). Sin realtime a
// propósito: es una pantalla de un chef a la vez, y cada ficha llega por la
// respuesta de /api/carta/desarrollo/ordenar — no hay otro escritor que haya
// que escuchar. Si algún día la edita más de una persona, sumarlo con filter
// por restaurante_id (hooks.md #18).

async function fetchPlatosDesarrollo(key: string): Promise<PlatoDesarrollo[]> {
  const rid = key.slice('platos-desarrollo-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('platos_desarrollo')
    .select('*')
    .eq('restaurante_id', rid)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return (data ?? []) as PlatoDesarrollo[]
}

export interface CambiosPlatoDesarrollo {
  nombre?: string
  descripcion?: string | null
  categoria?: string | null
  estado?: EstadoPlatoDesarrollo
  ficha?: FichaDesarrollo
  foto_url?: string | null
}

export function usePlatosDesarrollo() {
  const RESTAURANTE_ID = useRestauranteId()
  const swrKey = RESTAURANTE_ID ? `platos-desarrollo-${RESTAURANTE_ID}` : null
  const { data, isLoading: loading, mutate } = useSWR(swrKey, fetchPlatosDesarrollo, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 300_000,
    keepPreviousData: true,
  })
  // `data` sin default: un `= []` nuevo por render alimentaría deps de efectos ajenos (hooks.md, SWR #5).
  const platos = data

  /** Suma un plato que ya guardó el servidor (respuesta de /ordenar) sin refetchear. */
  const agregarLocal = useCallback((plato: PlatoDesarrollo) => {
    return mutate(actual => [plato, ...(actual ?? []).filter(p => p.id !== plato.id)], { revalidate: false })
  }, [mutate])

  /** Optimista: la ficha es un documento que se edita seguido, no esperamos el round-trip. */
  const actualizar = useCallback(async (id: string, cambios: CambiosPlatoDesarrollo) => {
    const supabase = createClient()
    const ahora = new Date().toISOString()
    await mutate(
      async actual => {
        const { error } = await supabase
          .from('platos_desarrollo')
          .update({ ...cambios, updated_at: ahora })
          .eq('id', id)
        if (error) throw error
        return (actual ?? []).map(p => p.id === id ? { ...p, ...cambios, updated_at: ahora } : p)
      },
      {
        optimisticData: actual => (actual ?? []).map(p => p.id === id ? { ...p, ...cambios, updated_at: ahora } : p),
        rollbackOnError: true,
        revalidate: false,
      },
    )
  }, [mutate])

  const eliminar = useCallback(async (id: string) => {
    const supabase = createClient()
    await mutate(
      async actual => {
        const { error } = await supabase.from('platos_desarrollo').delete().eq('id', id)
        if (error) throw error
        return (actual ?? []).filter(p => p.id !== id)
      },
      { optimisticData: actual => (actual ?? []).filter(p => p.id !== id), rollbackOnError: true, revalidate: false },
    )
  }, [mutate])

  return { platos, loading, agregarLocal, actualizar, eliminar, refetch: mutate }
}
