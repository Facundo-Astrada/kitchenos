'use client'

import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import { useAuth } from '@/lib/auth/context'
import { hoyOperativo } from '@/lib/ops/turnos'
import type { Merma, MotivoMerma, TurnoMerma } from '@/types'

async function fetchMermaData(key: string): Promise<Merma[]> {
  const rid = key.slice('merma-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('merma')
    .select('*')
    .eq('restaurante_id', rid)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export function useMerma() {
  const RESTAURANTE_ID = useRestauranteId()
  const { perfil } = useAuth()
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID ? `merma-${RESTAURANTE_ID}` : null

  const { data: registros = [], isLoading: loading, error: swrError, mutate } = useSWR(
    swrKey,
    fetchMermaData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 300_000,
      keepPreviousData: true,
    }
  )

  const error = (swrError as Error | null)?.message ?? null

  // Filtro imperativo por rango de fechas. Sin params revalida la lista base (cache).
  const fetchMerma = useCallback(async (desde?: string, hasta?: string) => {
    if (!RESTAURANTE_ID) return
    if (!desde && !hasta) { await mutate(); return }
    let query = supabase
      .from('merma')
      .select('*')
      .eq('restaurante_id', RESTAURANTE_ID)
      .order('created_at', { ascending: false })
    if (desde) query = query.gte('fecha', desde)
    if (hasta) query = query.lte('fecha', hasta)
    const { data } = await query
    await mutate(data ?? [], { revalidate: false })
  }, [RESTAURANTE_ID, supabase, mutate])

  const registrarMerma = useCallback(async (data: {
    producto_nombre: string
    producto_id?: string | null
    cantidad: number
    unidad: string
    motivo: MotivoMerma
    motivo_detalle?: string
    costo_estimado?: number
  }) => {
    if (!RESTAURANTE_ID) throw new Error('Sin restaurante')

    try {
      // Determine turno based on current hour
      // TurnoMerma (apertura/servicio/cierre) es un enum propio, distinto del
      // turno de servicio (Fase 2) — deuda anotada en el plan, no se unifica acá.
      const hour = new Date().getHours()
      const turno: TurnoMerma = hour < 12 ? 'apertura' : hour < 18 ? 'servicio' : 'cierre'

      const { error: err } = await supabase.from('merma').insert({
        producto_nombre: data.producto_nombre,
        producto_id: data.producto_id ?? null,
        cantidad: data.cantidad,
        unidad: data.unidad,
        motivo: data.motivo,
        motivo_detalle: data.motivo_detalle ?? null,
        plaza: perfil?.rol && !['admin', 'chef'].includes(perfil.rol) ? perfil.rol : null,
        usuario_id: perfil?.miembro_id ?? null,
        usuario_nombre: perfil ? `${perfil.nombre} ${perfil.apellido}`.trim() : null,
        fecha: hoyOperativo(),
        turno,
        costo_estimado: data.costo_estimado ?? 0,
        restaurante_id: RESTAURANTE_ID,
      })

      if (err) throw err

      // Subtract from stock if producto_id provided
      if (data.producto_id) {
        const { data: prod, error: prodErr } = await supabase
          .from('productos')
          .select('stock_actual')
          .eq('id', data.producto_id)
          .single()

        if (prodErr && prodErr.code !== 'PGRST116') throw prodErr

        if (prod) {
          const newStock = Math.max(0, (prod.stock_actual ?? 0) - data.cantidad)
          const { error: updErr } = await supabase.from('productos').update({ stock_actual: newStock }).eq('id', data.producto_id)
          if (updErr) throw updErr
        }
      }
      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al registrar merma'
      console.error('[useMerma] registrarMerma Error:', msg)
      throw new Error(msg)
    }
  }, [RESTAURANTE_ID, supabase, perfil, mutate])

  const eliminarMerma = useCallback(async (id: string) => {
    try {
      const { error: err } = await supabase.from('merma').delete().eq('id', id)
      if (err) throw err
      mutate(prev => prev?.filter(m => m.id !== id), { revalidate: false })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar registro de merma'
      console.error('[useMerma] eliminarMerma Error:', msg)
      throw new Error(msg)
    }
  }, [supabase, mutate])

  return { registros, loading, error, fetchMerma, registrarMerma, eliminarMerma }
}
