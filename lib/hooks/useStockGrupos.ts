'use client'

import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { StockGrupo } from '@/types'
import { useRestauranteId } from './useRestauranteId'

async function fetchStockGruposData(key: string): Promise<StockGrupo[]> {
  const rid = key.slice('stock-grupos-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('stock_grupos')
    .select('*')
    .eq('restaurante_id', rid)
    .order('orden')
    .order('nombre')
  if (error) throw error
  return data ?? []
}

// Todos los grupos del restaurante — el board y el recorrido de Stockear
// filtran por sector/estante en memoria, como useStockEstantes.
export function useStockGrupos() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID ? `stock-grupos-${RESTAURANTE_ID}` : null

  const { data: grupos = [], isLoading: loading, mutate } = useSWR(
    swrKey,
    fetchStockGruposData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 300_000,
      keepPreviousData: true,
    }
  )

  // El grupo nuevo va al final de su estante (o de lo suelto del sector).
  async function agregarGrupo(sectorId: string, estanteId: string | null, nombre: string): Promise<StockGrupo | undefined> {
    if (!RESTAURANTE_ID || !nombre.trim()) return
    const hermanos = grupos.filter(g => g.sector_id === sectorId && (g.estante_id ?? null) === estanteId)
    const orden = hermanos.reduce((m, g) => Math.max(m, g.orden + 1), 0)
    const { data, error } = await supabase
      .from('stock_grupos')
      .insert({ restaurante_id: RESTAURANTE_ID, sector_id: sectorId, estante_id: estanteId, nombre: nombre.trim(), orden })
      .select('*')
      .single()
    if (error) throw error
    await mutate()
    return data as StockGrupo
  }

  async function renombrarGrupo(id: string, nombre: string) {
    if (!nombre.trim()) return
    const { error } = await supabase.from('stock_grupos').update({ nombre: nombre.trim() }).eq('id', id)
    if (error) throw error
    mutate(prev => prev?.map(g => g.id === id ? { ...g, nombre: nombre.trim() } : g), { revalidate: false })
  }

  // Los productos del grupo quedan sueltos en su estante (FK ON DELETE SET NULL);
  // el caller refresca productos.
  async function eliminarGrupo(id: string) {
    const { error } = await supabase.from('stock_grupos').delete().eq('id', id)
    if (error) throw error
    mutate(prev => prev?.filter(g => g.id !== id), { revalidate: false })
  }

  // Reordena los grupos de UN estante (o de lo suelto de un sector).
  async function reordenarGrupos(ordenIds: string[]) {
    mutate(prev => {
      if (!prev) return prev
      const idx = new Map(ordenIds.map((id, i) => [id, i]))
      return prev.map(g => idx.has(g.id) ? { ...g, orden: idx.get(g.id)! } : g)
    }, { revalidate: false })
    const results = await Promise.all(ordenIds.map((id, i) => supabase.from('stock_grupos').update({ orden: i }).eq('id', id)))
    if (results.some(r => r.error)) { mutate(); throw results.find(r => r.error)!.error }
  }

  return {
    grupos,
    loading,
    agregarGrupo,
    renombrarGrupo,
    eliminarGrupo,
    reordenarGrupos,
    refetch: useCallback(() => { mutate() }, [mutate]),
  }
}
