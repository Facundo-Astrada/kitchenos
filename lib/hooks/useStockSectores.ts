'use client'

import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { StockSector } from '@/types'
import { useRestauranteId } from './useRestauranteId'

async function fetchStockSectoresData(key: string): Promise<StockSector[]> {
  const rid = key.slice('stock-sectores-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('stock_sectores')
    .select('*')
    .eq('restaurante_id', rid)
    .order('orden')
    .order('nombre')
  if (error) throw error
  return data ?? []
}

export function useStockSectores() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID ? `stock-sectores-${RESTAURANTE_ID}` : null

  const { data: sectores = [], isLoading: loading, mutate } = useSWR(
    swrKey,
    fetchStockSectoresData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 300_000,
      keepPreviousData: true,
    }
  )

  async function agregarSector(nombre: string, icono: string) {
    if (!RESTAURANTE_ID || !nombre.trim()) return
    const { error } = await supabase
      .from('stock_sectores')
      .insert({ restaurante_id: RESTAURANTE_ID, nombre: nombre.trim(), icono, orden: sectores.length })
    if (error) throw error
    await mutate()
  }

  async function eliminarSector(id: string) {
    const { error } = await supabase.from('stock_sectores').delete().eq('id', id)
    if (error) throw error
    mutate(prev => prev?.filter(s => s.id !== id), { revalidate: false })
  }

  return {
    sectores,
    loading,
    agregarSector,
    eliminarSector,
    refetch: useCallback(() => { mutate() }, [mutate]),
  }
}
