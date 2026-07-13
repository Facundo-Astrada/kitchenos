'use client'

import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { StockEstante } from '@/types'
import { useRestauranteId } from './useRestauranteId'

async function fetchStockEstantesData(key: string): Promise<StockEstante[]> {
  const rid = key.slice('stock-estantes-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('stock_estantes')
    .select('*')
    .eq('restaurante_id', rid)
    .order('orden')
    .order('nombre')
  if (error) throw error
  return data ?? []
}

// Todos los estantes del restaurante (todos los sectores) — el board de Stock
// filtra por sector_id en memoria, evita una query por columna.
export function useStockEstantes() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID ? `stock-estantes-${RESTAURANTE_ID}` : null

  const { data: estantes = [], isLoading: loading, mutate } = useSWR(
    swrKey,
    fetchStockEstantesData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 300_000,
      keepPreviousData: true,
    }
  )

  async function agregarEstante(sectorId: string, nombre: string): Promise<StockEstante | undefined> {
    if (!RESTAURANTE_ID || !nombre.trim()) return
    const ordenBase = estantes.filter(e => e.sector_id === sectorId).length
    const { data, error } = await supabase
      .from('stock_estantes')
      .insert({ restaurante_id: RESTAURANTE_ID, sector_id: sectorId, nombre: nombre.trim(), orden: ordenBase })
      .select('*')
      .single()
    if (error) throw error
    await mutate()
    return data as StockEstante
  }

  async function renombrarEstante(id: string, nombre: string) {
    if (!nombre.trim()) return
    const { error } = await supabase.from('stock_estantes').update({ nombre: nombre.trim() }).eq('id', id)
    if (error) throw error
    mutate(prev => prev?.map(e => e.id === id ? { ...e, nombre: nombre.trim() } : e), { revalidate: false })
  }

  async function eliminarEstante(id: string) {
    const { error } = await supabase.from('stock_estantes').delete().eq('id', id)
    if (error) throw error
    mutate(prev => prev?.filter(e => e.id !== id), { revalidate: false })
  }

  // Reordena los estantes de UN sector (drag de la columna del estante en sí).
  async function reordenarEstantes(ordenIds: string[]) {
    mutate(prev => {
      if (!prev) return prev
      const idx = new Map(ordenIds.map((id, i) => [id, i]))
      return prev.map(e => idx.has(e.id) ? { ...e, orden: idx.get(e.id)! } : e)
    }, { revalidate: false })
    await Promise.all(ordenIds.map((id, i) => supabase.from('stock_estantes').update({ orden: i }).eq('id', id)))
  }

  return {
    estantes,
    loading,
    agregarEstante,
    renombrarEstante,
    eliminarEstante,
    reordenarEstantes,
    refetch: useCallback(() => { mutate() }, [mutate]),
  }
}
