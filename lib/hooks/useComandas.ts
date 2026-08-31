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
import { encolarBump, leerCola, quitarDeCola } from '@/lib/offline/bumpQueue'

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
    .select('*, items:comanda_items(*, modificadores:comanda_item_modificadores(*), carta_item:carta_items(nombre, precio_venta)), mesa:mesas(numero, sector), mozo:equipo_miembros(nombre, apellido)')
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

  /**
   * Sin catch — usado tanto por el bump online directo como por el reenvío de la
   * cola offline. No recalcula "¿está todo bumpeado?": el trigger
   * `trg_comanda_items_bump_actualiza_comanda` (Día 3 del plan consolidado) hace
   * ese chequeo en la misma transacción del UPDATE, contra el estado real en DB
   * en vez de la copia local de `comandasRaw` — evita que dos tablets bumpeando
   * ítems distintos de la misma comanda casi a la vez calculen "todosListos"
   * sobre un cache stale y ninguna dispare la transición a 'lista'.
   */
  async function bumpearItemEnDB(itemId: string) {
    const ts = new Date().toISOString()
    const { error } = await supabase.from('comanda_items').update({ estado: 'bumpeado', bumped_at: ts }).eq('id', itemId)
    if (error) throw error
    const { error: eventoError } = await supabase.from('eventos_cocina').insert({ comanda_item_id: itemId, evento: 'bumped' })
    if (eventoError) throw eventoError
  }

  async function bumpearComandaEnDB(itemIds: string[]) {
    const ts = new Date().toISOString()
    const { error } = await supabase.from('comanda_items').update({ estado: 'bumpeado', bumped_at: ts }).in('id', itemIds)
    if (error) throw error
    const { error: eventoError } = await supabase.from('eventos_cocina').insert(
      itemIds.map(id => ({ comanda_item_id: id, evento: 'bumped' as const }))
    )
    if (eventoError) throw eventoError
  }

  /** Marca local-optimista (sin red) — se confirma/reintenta al reconectar via la cola IndexedDB. */
  function marcarBumpeadosLocal(comandaId: string, itemIds: string[]) {
    const ts = new Date().toISOString()
    mutate((current: Comanda[] = []) => current.map(c => {
      if (c.id !== comandaId) return c
      const items = (c.items ?? []).map(i => itemIds.includes(i.id) ? { ...i, estado: 'bumpeado' as EstadoComandaItem, bumped_at: ts } : i)
      const estado = todosListos(items) && puedeTranicionarComanda(c.estado, 'lista') ? ('lista' as EstadoComanda) : c.estado
      return { ...c, items, estado }
    }), { revalidate: false })
  }

  /** Bump de un ítem individual: en_prep|listo → bumpeado. */
  async function bumpearItem(itemId: string) {
    const actual = comandasRaw.flatMap(c => c.items ?? []).find(i => i.id === itemId)
    if (!actual) return
    if (!puedeTranicionarItem(actual.estado, 'bumpeado')) {
      throw new Error(`Transición inválida de ítem: ${actual.estado} → bumpeado`)
    }
    try {
      await bumpearItemEnDB(itemId)
      await mutate()
    } catch (e: unknown) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        marcarBumpeadosLocal(actual.comanda_id, [itemId])
        await encolarBump({ tipo: 'item', targetId: itemId })
        return
      }
      throw new Error(errMsg(e, 'Error al bumpear ítem'))
    }
  }

  /** Bump de todos los ítems pendientes/en curso de una comanda + comanda → lista. */
  async function bumpearComanda(comandaId: string) {
    const comanda = comandasRaw.find(c => c.id === comandaId)
    if (!comanda) return
    const bumpeables = (comanda.items ?? []).filter(i => puedeTranicionarItem(i.estado, 'bumpeado'))
    if (bumpeables.length === 0) return
    const ids = bumpeables.map(i => i.id)
    try {
      await bumpearComandaEnDB(ids)
      await mutate()
    } catch (e: unknown) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        marcarBumpeadosLocal(comandaId, ids)
        await encolarBump({ tipo: 'comanda', targetId: comandaId, itemIds: ids })
        return
      }
      throw new Error(errMsg(e, 'Error al bumpear comanda'))
    }
  }

  /** Reenvía la cola de bumps offline al reconectar. Idempotente: para en el primer fallo (se reintenta en la próxima reconexión). */
  const sincronizarColaOffline = useCallback(async () => {
    let cola
    try {
      cola = await leerCola()
    } catch {
      return
    }
    for (const entry of cola) {
      try {
        if (entry.tipo === 'item') {
          await bumpearItemEnDB(entry.targetId)
        } else if (entry.itemIds?.length) {
          await bumpearComandaEnDB(entry.itemIds)
        }
        await quitarDeCola(entry.id)
      } catch {
        break
      }
    }
    await mutate()
  }, [comandasRaw, supabase, mutate])

  useEffect(() => {
    window.addEventListener('online', sincronizarColaOffline)
    if (navigator.onLine) sincronizarColaOffline()
    return () => window.removeEventListener('online', sincronizarColaOffline)
  }, [sincronizarColaOffline])

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

  /**
   * Recall: restaura una comanda completamente bumpeada (estado='lista') a 'enviada',
   * revierte sus ítems a 'pendiente' y registra eventos 'recalled'.
   */
  async function restaurarComanda(comandaId: string) {
    const comanda = comandasRaw.find(c => c.id === comandaId)
    if (!comanda) throw new Error('Comanda no encontrada')
    const itemsBumpeados = (comanda.items ?? []).filter(i => i.estado === 'bumpeado')
    if (itemsBumpeados.length === 0) return
    try {
      const ts = new Date().toISOString()
      const ids = itemsBumpeados.map(i => i.id)
      const { error: itemsError } = await supabase
        .from('comanda_items')
        .update({ estado: 'pendiente', bumped_at: null, fired_at: ts })
        .in('id', ids)
      if (itemsError) throw itemsError
      const { error: eventosError } = await supabase
        .from('eventos_cocina')
        .insert(ids.map(id => ({ comanda_item_id: id, evento: 'recalled' as const })))
      if (eventosError) throw eventosError
      const { error: comandaError } = await supabase
        .from('comandas')
        .update({ estado: 'enviada' })
        .eq('id', comandaId)
      if (comandaError) throw comandaError
      await mutate()
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al restaurar comanda'))
    }
  }

  /** Pone una comanda en hold (no se procesa hasta hacer fire). */
  async function holdComanda(comandaId: string) {
    try {
      const { error } = await supabase.from('comandas').update({ held: true }).eq('id', comandaId)
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al poner comanda en hold'))
    }
  }

  /** Quita el hold y avanza todos los ítems pendientes a en_prep (marchar). */
  async function fireComanda(comandaId: string) {
    try {
      const { error: holdError } = await supabase.from('comandas').update({ held: false }).eq('id', comandaId)
      if (holdError) throw holdError
      const comanda = comandasRaw.find(c => c.id === comandaId)
      const pendientes = (comanda?.items ?? []).filter(i => i.estado === 'pendiente').map(i => i.id)
      if (pendientes.length > 0) {
        const { error: itemsError } = await supabase.from('comanda_items').update({ estado: 'en_prep' }).in('id', pendientes)
        if (itemsError) throw itemsError
      }
      await mutate()
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al marchar comanda'))
    }
  }

  /** Comandas bumpeadas en los últimos 30 min disponibles para recall. */
  const comandasRecientes = useMemo(() => {
    const hace30min = Date.now() - 30 * 60_000
    return comandasRaw.filter(c => {
      if (c.estado !== 'lista') return false
      const bumps = (c.items ?? [])
        .map(i => i.bumped_at)
        .filter((b): b is string => !!b)
        .map(b => new Date(b).getTime())
      return bumps.length > 0 && Math.max(...bumps) >= hace30min
    })
  }, [comandasRaw])

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
    restaurarComanda,
    comandasRecientes,
    holdComanda,
    fireComanda,
  }
}

export type { Comanda, ComandaItem }
