'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import type { MedioPago } from '@/types'

async function fetchMediosPago(key: string): Promise<MedioPago[]> {
  const rid = key.slice('medios-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('medios_pago')
    .select('*')
    .eq('restaurante_id', rid)
    .eq('activo', true)
    .order('nombre')
  if (error) throw error
  return (data ?? []) as MedioPago[]
}

export function useMediosPago() {
  const RESTAURANTE_ID = useRestauranteId()
  const swrKey = RESTAURANTE_ID ? `medios-${RESTAURANTE_ID}` : null
  const { data: medios = [], isLoading: loading } = useSWR(swrKey, fetchMediosPago, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  })
  return { medios, loading }
}
