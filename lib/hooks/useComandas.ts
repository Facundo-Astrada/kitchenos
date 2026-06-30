'use client'

import { useEffect, useMemo, useCallback } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type {
  Comanda, ComandaItem, EstadoComanda, EstadoComandaItem,
  OrigenComanda, TipoModificador,
} from '@/types'
import { useRestauranteId } from './useRestauranteId'
import { puedeTranicionarComanda, puedeTranicionarItem, todosListos } from '@/lib/comanda/stateMachine'

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return fallback
}

async function fetchComandasData(key: string): Promise<Comanda[]> {
  const rid = key.slice('comandas-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('comandas')
    .select('*, items:comanda_items(*, modificadores:comanda_item_modificadores(*))')
    .eq('restaurante_id', rid)
    .not('estado', 'in', '(cerrada,cancelada)')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as Comanda[]
}

export interface NuevoComandaItem {
  carta_item_id?: string | null
  cantidad: number
  estacion_id?: string | null
  notas?: string | null
  modificadores?: { tipo: TipoModificador; texto: string; flag_alergeno?: boolean }[]
}

/**
 * `estacionId`: si se pasa, devuelve solo las comandas con al menos un ítem
 * de esa estación (para el KDS); cada comanda viene con `items` ya filtrados.
 */
export function useComandas(estacionId?: string) {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])
  const swrKey = RESTAURANTE_ID ? `comandas-${RESTAURANTE_ID}` : null

  const { data: comandasRaw = [], isLoading: loading, error: swrError, mutate } = useSWR(
    swrKey,
    fetchComandasData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 30_000,
      keepPreviousData: true,
    }
  )

  const error = (swrError as Error | null)?.message ?? null

  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const ch = supabase
      .channel(`comandas-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comandas', filter: `restaurante_id=eq.${RESTAURANTE_ID}` }, () => mutate())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comanda_items' }, () => mutate())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID, supabase, mutate])

  const comandas = useMemo(() => {
    if (!estacionId) return comandasRaw
    return comandasRaw
      .map(c => ({ ...c, items: (c.items ?? []).filter(i => i.estacion_id === estacionId) }))
      .filter(c => (c.items?.length ?? 0) > 0)
  }, [comandasRaw, estacionId])

  async function crearComanda(datos: {
    origen: OrigenComanda
    mesa_id?: string | null
    cuenta_id?: string | null
    mozo_id?: string | null
    course?: number | null
    marca?: string | null
  }): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('comandas')
        .insert({ ...datos, restaurante_id: RESTAURANTE_ID, estado: 'abierta' })
        .select('id')
        .single()
      if (error) throw error
      await mutate()
      return data.id as string
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al crear comanda'))
    }
  }

  async function agregarItems(comandaId: string, items: NuevoComandaItem[]) {
    try {
      for (const item of items) {
        const { data: itemRow, error } = await supabase
          .from('comanda_items')
          .insert({
            comanda_id: comandaId,
            carta_item_id: item.carta_item_id ?? null,
            cantidad: item.cantidad,
            estado: 'pendiente',
            estacion_id: item.estacion_id ?? null,
            notas: item.notas ?? null,
          })
          .select('id')
          .single()
        if (error) throw error
        if (item.modificadores?.length) {
          const { error: modError } = await supabase
            .from('comanda_item_modificadores')
            .insert(item.modificadores.map(m => ({
              comanda_item_id: itemRow.id,
              tipo: m.tipo,
              texto: m.texto,
              flag_alergeno: m.flag_alergeno ?? false,
            })))
          if (modError) throw modError
        }
      }
      await mutate()
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al agregar ítems'))
    }
  }

  /** abierta → enviada: dispara los ítems a cocina (fired_at + evento 'fired'). */
  async function enviarComanda(comandaId: string) {
    const actual = comandasRaw.find(c => c.id === comandaId)
    if (actual && !puedeTranicionarComanda(actual.estado, 'enviada')) {
      throw new Error(`Transición inválida: ${actual.estado} → enviada`)
    }
    try {
      const ts = new Date().toISOString()
      const { error: comandaError } = await supabase.from('comandas').update({ estado: 'enviada' }).eq('id', comandaId)
      if (comandaError) throw comandaError
      const items = actual?.items ?? []
      if (items.length > 0) {
        const { error: itemsError } = await supabase.from('comanda_items').update({ fired_at: ts }).eq('comanda_id', comandaId)
        if (itemsError) throw itemsError
        const { error: eventosError } = await supabase.from('eventos_cocina').insert(
          items.map(i => ({ comanda_item_id: i.id, evento: 'fired' as const }))
        )
        if (eventosError) throw eventosError
      }
      await mutate()
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al enviar comanda'))
    }
  }

  /** Avanza un ítem un paso: pendiente → en_prep → listo. */
  async function avanzarItem(itemId: string) {
    const actual = comandasRaw.flatMap(c => c.items ?? []).find(i => i.id === itemId)
    if (!actual) return
    const siguiente: EstadoComandaItem = actual.estado === 'pendiente' ? 'en_prep' : actual.estado === 'en_prep' ? 'listo' : actual.estado
    if (siguiente === actual.estado) return
    if (!puedeTranicionarItem(actual.estado, siguiente)) {
      throw new Error(`Transición inválida de ítem: ${actual.estado} → ${siguiente}`)
    }
    try {
      const { error } = await supabase.from('comanda_items').update({ estado: siguiente }).eq('id', itemId)
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al actualizar ítem'))
    }
  }

  async function bumpItemsYRevisarComanda(comandaId: string, itemIds: string[]) {
    const comanda = comandasRaw.find(c => c.id === comandaId)
    if (!comanda) return
    const items = (comanda.items ?? []).map(i => itemIds.includes(i.id) ? { ...i, estado: 'bumpeado' as EstadoComandaItem } : i)
    if (todosListos(items) && puedeTranicionarComanda(comanda.estado, 'lista')) {
      const { error } = await supabase.from('comandas').update({ estado: 'lista' }).eq('id', comandaId)
      if (error) throw error
    }
  }

  /** Bump de un ítem individual: en_prep|listo → bumpeado. */
  async function bumpearItem(itemId: string) {
    const actual = comandasRaw.flatMap(c => c.items ?? []).find(i => i.id === itemId)
    if (!actual) return
    if (!puedeTranicionarItem(actual.estado, 'bumpeado')) {
      throw new Error(`Transición inválida de ítem: ${actual.estado} → bumpeado`)
    }
    try {
      const ts = new Date().toISOString()
      const { error } = await supabase.from('comanda_items').update({ estado: 'bumpeado', bumped_at: ts }).eq('id', itemId)
      if (error) throw error
      const { error: eventoError } = await supabase.from('eventos_cocina').insert({ comanda_item_id: itemId, evento: 'bumped' })
      if (eventoError) throw eventoError
      await bumpItemsYRevisarComanda(actual.comanda_id, [itemId])
      await mutate()
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al bumpear ítem'))
    }
  }

  /** Bump de todos los ítems pendientes/en curso de una comanda + comanda → lista. */
  async function bumpearComanda(comandaId: string) {
    const comanda = comandasRaw.find(c => c.id === comandaId)
    if (!comanda) return
    const bumpeables = (comanda.items ?? []).filter(i => puedeTranicionarItem(i.estado, 'bumpeado'))
    if (bumpeables.length === 0) return
    try {
      const ts = new Date().toISOString()
      const ids = bumpeables.map(i => i.id)
      const { error } = await supabase.from('comanda_items').update({ estado: 'bumpeado', bumped_at: ts }).in('id', ids)
      if (error) throw error
      const { error: eventoError } = await supabase.from('eventos_cocina').insert(
        ids.map(id => ({ comanda_item_id: id, evento: 'bumped' as const }))
      )
      if (eventoError) throw eventoError
      await bumpItemsYRevisarComanda(comandaId, ids)
      await mutate()
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al bumpear comanda'))
    }
  }

  async function cambiarEstadoComanda(comandaId: string, hacia: EstadoComanda) {
    const actual = comandasRaw.find(c => c.id === comandaId)
    if (actual && !puedeTranicionarComanda(actual.estado, hacia)) {
      throw new Error(`Transición inválida: ${actual.estado} → ${hacia}`)
    }
    try {
      const { error } = await supabase.from('comandas').update({ estado: hacia }).eq('id', comandaId)
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al cambiar estado de comanda'))
    }
  }

  return {
    comandas,
    loading,
    error,
    refetch: useCallback(() => { mutate() }, [mutate]),
    crearComanda,
    agregarItems,
    enviarComanda,
    avanzarItem,
    bumpearItem,
    bumpearComanda,
    cambiarEstadoComanda,
  }
}

export type { Comanda, ComandaItem }
