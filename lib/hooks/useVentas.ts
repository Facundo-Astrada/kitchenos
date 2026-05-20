'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import type { Venta, VentaItem, OrigenVenta } from '@/types'

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

export function useVentas() {
  const RESTAURANTE_ID = useRestauranteId()
  const ridRef = useRef(RESTAURANTE_ID)
  ridRef.current = RESTAURANTE_ID

  const [supabase] = useState(() => createClient())
  const [ventas, setVentas] = useState<Venta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchVentas = useCallback(async (desde?: string, hasta?: string) => {
    const rid = ridRef.current
    if (!rid) { setLoading(false); return }
    setLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('ventas')
        .select('*, items:ventas_items(*)')
        .eq('restaurante_id', rid)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })

      if (desde) query = query.gte('fecha', desde)
      if (hasta) query = query.lte('fecha', hasta)

      const { data, error: err } = await query
      if (err) throw err
      setVentas((data ?? []) as Venta[])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar ventas'
      console.error('[useVentas] fetchVentas Error:', msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const agregarVenta = useCallback(async (datos: NuevaVenta): Promise<string> => {
    const rid = ridRef.current
    if (!rid) throw new Error('Sin restaurante')

    const { data: ventaData, error: ventaErr } = await supabase
      .from('ventas')
      .insert({
        restaurante_id: rid,
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

    await fetchVentas()
    return ventaId
  }, [supabase, fetchVentas])

  const eliminarVenta = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('ventas').delete().eq('id', id)
    if (err) throw err
    await fetchVentas()
  }, [supabase, fetchVentas])

  useEffect(() => {
    fetchVentas()
  }, [fetchVentas, RESTAURANTE_ID])

  return { ventas, loading, error, agregarVenta, eliminarVenta, fetchVentas }
}
