'use client'

import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import type { Venta, OrigenVenta } from '@/types'

export interface NuevaVenta {
  fecha: string
  origen: OrigenVenta
  total_ventas: number
  cantidad_cubiertos?: number | null
  notas?: string | null
  items?: Array<{
    nombre_plato: string
    cantidad: number
    precio_unitario: number
  }>
}

async function fetchVentasData(key: string): Promise<Venta[]> {
  const rid = key.slice('ventas-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('ventas')
    .select('*, items:ventas_items(*)')
    .eq('restaurante_id', rid)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Venta[]
}

export function useVentas() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID ? `ventas-${RESTAURANTE_ID}` : null

  const { data: ventas = [], isLoading: loading, error: swrError, mutate } = useSWR(
    swrKey,
    fetchVentasData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 300_000,
      keepPreviousData: true,
    }
  )

  const error = (swrError as Error | null)?.message ?? null

  // Sin params revalida la lista base (cache); con rango filtra imperativamente.
  const fetchVentas = useCallback(async (desde?: string, hasta?: string) => {
    if (!RESTAURANTE_ID) return
    if (!desde && !hasta) { await mutate(); return }
    let query = supabase
      .from('ventas')
      .select('*, items:ventas_items(*)')
      .eq('restaurante_id', RESTAURANTE_ID)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    if (desde) query = query.gte('fecha', desde)
    if (hasta) query = query.lte('fecha', hasta)
    const { data } = await query
    await mutate((data ?? []) as Venta[], { revalidate: false })
  }, [RESTAURANTE_ID, supabase, mutate])

  const agregarVenta = useCallback(async (datos: NuevaVenta): Promise<string> => {
    if (!RESTAURANTE_ID) throw new Error('Sin restaurante')

    const { data: ventaData, error: ventaErr } = await supabase
      .from('ventas')
      .insert({
        restaurante_id: RESTAURANTE_ID,
        fecha: datos.fecha,
        origen: datos.origen,
        total_ventas: datos.total_ventas,
        cantidad_cubiertos: datos.cantidad_cubiertos ?? null,
        notas: datos.notas ?? null,
      })
      .select('id')
      .single()

    if (ventaErr) throw ventaErr
    const ventaId: string = ventaData.id

    if (datos.items && datos.items.length > 0) {
      const rows = datos.items.map(item => ({
        venta_id: ventaId,
        nombre_plato: item.nombre_plato,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
      }))

      const { error: itemsErr } = await supabase.from('ventas_items').insert(rows)
      if (itemsErr) throw itemsErr
    }

    await mutate()
    return ventaId
  }, [RESTAURANTE_ID, supabase, mutate])

  const eliminarVenta = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('ventas').delete().eq('id', id)
    if (err) throw err
    mutate(prev => prev?.filter(v => v.id !== id), { revalidate: false })
  }, [supabase, mutate])

  return { ventas, loading, error, agregarVenta, eliminarVenta, fetchVentas }
}
