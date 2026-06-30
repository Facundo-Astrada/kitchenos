'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { Estacion } from '@/types'
import { useRestauranteId } from './useRestauranteId'

async function fetchEstacionesData(key: string): Promise<Estacion[]> {
  const rid = key.slice('estaciones-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('estaciones')
    .select('*')
    .eq('restaurante_id', rid)
    .order('nombre', { ascending: true })
  if (error) throw error
  return (data ?? []) as Estacion[]
}

export function useEstaciones() {
  const RESTAURANTE_ID = useRestauranteId()
  const swrKey = RESTAURANTE_ID ? `estaciones-${RESTAURANTE_ID}` : null
  const { data: estaciones = [], isLoading: loading } = useSWR(swrKey, fetchEstacionesData, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 300_000,
    keepPreviousData: true,
  })
  return { estaciones, loading }
}

export const KDS_ESTACION_STORAGE_KEY = 'kds_estacion_id'
