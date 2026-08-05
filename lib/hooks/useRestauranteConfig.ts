'use client'

import useSWR, { useSWRConfig } from 'swr'
import { useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'

// ══════════════════════════════════════════════════════════════
// restaurantes.configuracion — una sola lectura para toda la app.
//
// Tres hooks distintos (plazas custom, turnos de servicio, impresión) leían la
// MISMA columna con tres queries, y useImpresionConfig ni siquiera usaba SWR:
// se monta dentro de cada tarjeta del mise, así que abrir una plaza disparaba
// una request a `restaurantes` por ítem de la lista.
//
// Con una key SWR única, todas las instancias comparten una sola descarga y el
// dedupe de SWR se encarga del resto.
// ══════════════════════════════════════════════════════════════

export type RestauranteConfig = Record<string, unknown>

export function configKey(rid: string) { return `restaurante-config-${rid}` }

async function fetchConfig(key: string): Promise<RestauranteConfig> {
  const rid = key.slice('restaurante-config-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('restaurantes').select('configuracion').eq('id', rid).maybeSingle()
  if (error) throw error
  return (data?.configuracion ?? {}) as RestauranteConfig
}

export function useRestauranteConfig() {
  const RESTAURANTE_ID = useRestauranteId()
  const swrKey = RESTAURANTE_ID ? configKey(RESTAURANTE_ID) : null

  const { data: configuracion = EMPTY, isLoading: loading, mutate } = useSWR(swrKey, fetchConfig, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 300_000,
    keepPreviousData: true,
  })

  return { configuracion, loading, mutate, restauranteId: RESTAURANTE_ID }
}

const EMPTY: RestauranteConfig = {}

/**
 * Escritura sobre `configuracion` sin pisar las claves de los demás:
 * relee la versión actual, mergea y revalida la key compartida.
 */
export function useGuardarRestauranteConfig() {
  const RESTAURANTE_ID = useRestauranteId()
  const { mutate: mutateGlobal } = useSWRConfig()

  return useCallback(async (patch: RestauranteConfig) => {
    if (!RESTAURANTE_ID) throw new Error('Sin restaurante')
    const supabase = createClient()
    const { data } = await supabase
      .from('restaurantes').select('configuracion').eq('id', RESTAURANTE_ID).single()
    const actual = (data?.configuracion ?? {}) as RestauranteConfig
    const merged = { ...actual, ...patch }
    const { error } = await supabase
      .from('restaurantes').update({ configuracion: merged }).eq('id', RESTAURANTE_ID)
    if (error) throw error
    await mutateGlobal(configKey(RESTAURANTE_ID), merged, { revalidate: false })
    return merged
  }, [RESTAURANTE_ID, mutateGlobal])
}
