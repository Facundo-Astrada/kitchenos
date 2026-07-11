'use client'

import { useEffect, useMemo, useCallback } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { SalonElemento, ElementoTipo } from '@/types'
import { useRestauranteId } from './useRestauranteId'

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return fallback
}

async function fetchElementosData(key: string): Promise<SalonElemento[]> {
  const rid = key.slice('salon-elementos-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('salon_elementos')
    .select('*')
    .eq('restaurante_id', rid)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as SalonElemento[]
}

type ElementoDatos = { tipo: ElementoTipo; label: string | null; ancho: number; alto: number; rotacion: number; pos_x: number; pos_y: number; color?: string | null }

/** Elementos decorativos del plano del salón (barra, caja, parrilla, plantas, paredes) — no clickeables en servicio. */
export function useSalonElementos() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])
  const swrKey = RESTAURANTE_ID ? `salon-elementos-${RESTAURANTE_ID}` : null

  const { data: elementos = [], isLoading: loading, mutate } = useSWR(swrKey, fetchElementosData, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 60_000,
    keepPreviousData: true,
  })

  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const ch = supabase
      .channel(`salon-elementos-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'salon_elementos', filter: `restaurante_id=eq.${RESTAURANTE_ID}` }, () => mutate())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID, supabase, mutate])

  async function crearElemento(datos: ElementoDatos): Promise<string> {
    try {
      const { data, error } = await supabase.from('salon_elementos').insert({
        ...datos, restaurante_id: RESTAURANTE_ID,
      }).select('id').single()
      if (error) throw error
      await mutate()
      return data.id as string
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al crear el elemento'))
    }
  }

  async function actualizarElemento(id: string, datos: Partial<ElementoDatos>) {
    try {
      const { error } = await supabase.from('salon_elementos').update(datos).eq('id', id)
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al actualizar el elemento'))
    }
  }

  async function eliminarElemento(id: string) {
    try {
      const { error } = await supabase.from('salon_elementos').delete().eq('id', id)
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al eliminar el elemento'))
    }
  }

  return {
    elementos,
    loading,
    refetch: useCallback(() => { mutate() }, [mutate]),
    crearElemento,
    actualizarElemento,
    eliminarElemento,
  }
}
