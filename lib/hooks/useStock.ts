'use client'

import { useEffect, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { Producto } from '@/types'
import { useRestauranteId } from './useRestauranteId'

export type ProductoConEstado = Producto & {
  estado: 'ok' | 'bajo' | 'critico'
}

function calcEstado(p: Producto): 'ok' | 'bajo' | 'critico' {
  if (p.stock_actual <= p.stock_critico) return 'critico'
  if (p.stock_actual <= p.stock_minimo) return 'bajo'
  return 'ok'
}

async function fetchStockData(key: string): Promise<ProductoConEstado[]> {
  const rid = key.slice('stock-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('restaurante_id', rid)
    .eq('activo', true)
    .order('categoria')
    .order('nombre')
  if (error) throw error
  return (data ?? []).map((p) => ({ ...p, estado: calcEstado(p) }))
}

export function useStock() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID ? `stock-${RESTAURANTE_ID}` : null

  const { data: productos = [], isLoading: loading, error: swrError, mutate } = useSWR(
    swrKey,
    fetchStockData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 300_000,
      keepPreviousData: true,
    }
  )

  const error = (swrError as Error | null)?.message ?? null

  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const channel = supabase
      .channel(`stock-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, () => mutate())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [RESTAURANTE_ID, supabase, mutate])

  async function agregarProducto(
    datos: Omit<Producto, 'id' | 'restaurante_id' | 'created_at' | 'updated_at'>
  ) {
    try {
      const { error } = await supabase.from('productos').insert({
        ...datos,
        restaurante_id: RESTAURANTE_ID,
      })
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al agregar producto'
      console.error('[useStock] agregarProducto Error:', msg)
      throw new Error(msg)
    }
  }

  async function actualizarStock(id: string, nuevo_stock: number) {
    try {
      const { error } = await supabase
        .from('productos')
        .update({ stock_actual: nuevo_stock })
        .eq('id', id)
      if (error) throw error
      mutate(
        (prev) => prev?.map((p) =>
          p.id === id
            ? { ...p, stock_actual: nuevo_stock, estado: calcEstado({ ...p, stock_actual: nuevo_stock }) }
            : p
        ),
        { revalidate: false }
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar stock'
      console.error('[useStock] actualizarStock Error:', msg)
      throw new Error(msg)
    }
  }

  async function actualizarProducto(id: string, datos: Partial<Omit<Producto, 'id' | 'restaurante_id'>>) {
    try {
      const { error } = await supabase
        .from('productos')
        .update(datos)
        .eq('id', id)
      if (error) throw error
      await mutate()
      // Propagar nuevo precio a ingredientes vinculados
      if (datos.precio_unitario != null) {
        fetch('/api/stock/sync-precio', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ producto_id: id, precio: datos.precio_unitario }),
        }).catch(() => {})
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar producto'
      console.error('[useStock] actualizarProducto Error:', msg)
      throw new Error(msg)
    }
  }

  async function eliminarProducto(id: string) {
    try {
      const { error } = await supabase
        .from('productos')
        .update({ activo: false })
        .eq('id', id)
      if (error) throw error
      mutate((prev) => prev?.filter((p) => p.id !== id), { revalidate: false })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar producto'
      console.error('[useStock] eliminarProducto Error:', msg)
      throw new Error(msg)
    }
  }

  return {
    productos,
    loading,
    error,
    page: 0,
    hasMore: false,
    fetchMore: useCallback(() => {}, []),
    refetch: useCallback(() => { mutate() }, [mutate]),
    agregarProducto,
    actualizarStock,
    actualizarProducto,
    eliminarProducto,
  }
}
