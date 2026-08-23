'use client'

import { useCallback, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import type { Reserva, EstadoReserva, OrigenReserva } from '@/types'

const SWR_OPTS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 30_000,
  keepPreviousData: true,
} as const

async function fetchReservas(key: string): Promise<Reserva[]> {
  const [, rid, desde, hasta] = key.split('|')
  const supabase = createClient()
  const { data, error } = await supabase
    .from('reservas')
    .select('*')
    .eq('restaurante_id', rid)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha')
    .order('hora')
  if (error) throw error
  return (data ?? []) as Reserva[]
}

export interface NuevaReservaInput {
  fecha: string
  hora: string
  pax: number
  nombre: string
  telefono?: string | null
  mesa_id?: string | null
  origen?: OrigenReserva
  nota?: string | null
}

/**
 * Reservas del rango [desde, hasta] (PLAN-4-CAPAS B8). Tabla aislada: sin
 * enganches a OPS/Salón/Calendario/Dashboard todavía (eso es B9).
 */
export function useReservas(desde: string, hasta: string) {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const key = RESTAURANTE_ID && desde && hasta ? `reservas|${RESTAURANTE_ID}|${desde}|${hasta}` : null
  const { data: reservas = [], isLoading: loading, mutate } = useSWR(key, fetchReservas, SWR_OPTS)

  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const ch = supabase
      .channel(`reservas-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'reservas',
        filter: `restaurante_id=eq.${RESTAURANTE_ID}`,
      }, () => mutate())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID, supabase, mutate])

  const crearReserva = useCallback(async (datos: NuevaReservaInput): Promise<string> => {
    if (!RESTAURANTE_ID) throw new Error('Sesión no cargada')
    const { data, error } = await supabase.from('reservas').insert({
      restaurante_id: RESTAURANTE_ID,
      fecha: datos.fecha,
      hora: datos.hora,
      pax: datos.pax,
      nombre: datos.nombre.trim(),
      telefono: datos.telefono || null,
      mesa_id: datos.mesa_id || null,
      origen: datos.origen ?? 'telefono',
      nota: datos.nota || null,
    }).select('id').single()
    if (error) throw error
    await mutate()
    return data.id as string
  }, [RESTAURANTE_ID, supabase, mutate])

  const actualizarReserva = useCallback(async (
    id: string,
    datos: Partial<Pick<Reserva, 'fecha' | 'hora' | 'pax' | 'nombre' | 'telefono' | 'mesa_id' | 'nota' | 'origen' | 'estado'>>
  ) => {
    await mutate(prev => prev?.map(r => r.id === id ? { ...r, ...datos } : r), { revalidate: false })
    const { error } = await supabase.from('reservas').update(datos).eq('id', id)
    if (error) {
      await mutate()
      throw error
    }
  }, [supabase, mutate])

  const cambiarEstado = useCallback(async (id: string, estado: EstadoReserva) => {
    await actualizarReserva(id, { estado })
  }, [actualizarReserva])

  const eliminarReserva = useCallback(async (id: string) => {
    await mutate(prev => prev?.filter(r => r.id !== id), { revalidate: false })
    const { error } = await supabase.from('reservas').delete().eq('id', id)
    if (error) {
      await mutate()
      throw error
    }
  }, [supabase, mutate])

  return {
    reservas,
    loading,
    crearReserva,
    actualizarReserva,
    cambiarEstado,
    eliminarReserva,
    refetch: useCallback(() => mutate(), [mutate]),
  }
}
