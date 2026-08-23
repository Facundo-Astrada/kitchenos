'use client'

import { useCallback, useEffect, useMemo } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import type { ControlCartaEstado, ControlCartaRegistro } from '@/types'

const SWR_OPTS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 60_000,
  keepPreviousData: true,
} as const

// Pseudo-plaza para platos sin plaza cargada en plato_recetas — no entra a
// PLAZAS_FIJAS, es solo el bucket "no sabemos dónde agrupar esto" de esta pantalla.
export const SIN_PLAZA = '__sin_plaza__'

export interface ControlCartaItem {
  id: string
  nombre: string
  categoria: string
  receta_id: string | null
  disponible: boolean
  plaza: string
}

interface CartaItemRow {
  id: string
  nombre: string
  categoria: string
  receta_id: string | null
  disponible: boolean
}

async function fetchItems(key: string): Promise<ControlCartaItem[]> {
  const rid = key.slice('control-carta-items-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('carta_items')
    .select('id, nombre, categoria, receta_id, disponible')
    .eq('restaurante_id', rid)
    .order('categoria').order('orden').order('nombre')
  if (error) throw error
  const items = (data ?? []) as CartaItemRow[]

  // Plaza real del plato: `plato_recetas.plaza`, keyed por carta_item.id (no
  // por receta_id — esa es `plato_plazas`, que en la práctica está vacía en
  // cuentas reales: 0 filas en El Rescoldo contra 18/32 cubiertos acá). Un
  // plato compuesto por varias recetas puede tener más de una fila; se toma
  // la primera por orden, mismo criterio que `primaryPlaza` en el mise. Sin
  // fila con plaza cargada, cae en SIN_PLAZA — dato real ("no asignado a
  // ninguna estación todavía"), no un error de carga.
  const platoIds = items.map(i => i.id)
  const plazaPorPlato = new Map<string, string>()
  if (platoIds.length > 0) {
    const { data: prData, error: prErr } = await supabase
      .from('plato_recetas')
      .select('plato_id, plaza, orden')
      .in('plato_id', platoIds)
      .order('orden')
    if (prErr) throw prErr
    for (const pr of (prData ?? []) as { plato_id: string; plaza: string | null }[]) {
      if (pr.plaza && !plazaPorPlato.has(pr.plato_id)) plazaPorPlato.set(pr.plato_id, pr.plaza)
    }
  }

  return items.map(i => ({
    ...i,
    plaza: plazaPorPlato.get(i.id) || SIN_PLAZA,
  }))
}

async function fetchRegistros(key: string): Promise<ControlCartaRegistro[]> {
  const [, rid, fecha, turno] = key.split('|')
  const supabase = createClient()
  const { data, error } = await supabase
    .from('control_carta_registros')
    .select('*')
    .eq('restaurante_id', rid)
    .eq('fecha', fecha)
    .eq('turno', turno)
  if (error) throw error
  return (data ?? []) as ControlCartaRegistro[]
}

/**
 * Checklist de la carta pre-servicio (PLAN-4-CAPAS B7). Contesta "¿está
 * bueno?" — distinto del mise, que contesta "¿está hecho?".
 */
export function useControlCarta(fecha: string, turno: string) {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])
  const { mutate: mutateGlobal } = useSWRConfig()

  const itemsKey = RESTAURANTE_ID ? `control-carta-items-${RESTAURANTE_ID}` : null
  const { data: items = [], isLoading: itemsLoading } = useSWR(itemsKey, fetchItems, SWR_OPTS)

  const regKey = RESTAURANTE_ID && fecha && turno ? `control-carta-reg|${RESTAURANTE_ID}|${fecha}|${turno}` : null
  const { data: registros = [], isLoading: regLoading, mutate } = useSWR(regKey, fetchRegistros, SWR_OPTS)

  // Realtime — otro dispositivo controlando la misma carta (chef en la
  // tablet, sous chef en el celular). Volumen bajo (una pasada por servicio),
  // no hace falta debounce.
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const ch = supabase
      .channel(`control-carta-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'control_carta_registros',
        filter: `restaurante_id=eq.${RESTAURANTE_ID}`,
      }, () => mutate())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID, supabase, mutate])

  const registroMap = useMemo(() => {
    const m = new Map<string, ControlCartaRegistro>()
    for (const r of registros) m.set(r.carta_item_id, r)
    return m
  }, [registros])

  // Tres decisiones y ningún número: ok | ajustar | no_sale. `no_sale` marca
  // el 86 automático en carta_items.disponible — es la conexión que hace que
  // valga la pena, ver PLAN-4-CAPAS.md bloque 7. Salir de `no_sale` hacia
  // cualquier otro estado lo levanta: dejarlo 86'd después de corregirlo
  // obligaría a ir a Carta a mano para deshacer lo que este mismo control hizo.
  const setEstado = useCallback(async (cartaItemId: string, estado: ControlCartaEstado, usuarioId: string | null) => {
    if (!RESTAURANTE_ID) return
    const previa = registroMap.get(cartaItemId)
    const optimista: ControlCartaRegistro = {
      id: previa?.id ?? `optimistic-${cartaItemId}`,
      restaurante_id: RESTAURANTE_ID, carta_item_id: cartaItemId, fecha, turno,
      estado, nota: previa?.nota ?? null, usuario_id: usuarioId,
      created_at: previa?.created_at ?? new Date().toISOString(),
    }
    await mutate(prev => [...(prev ?? []).filter(r => r.carta_item_id !== cartaItemId), optimista], { revalidate: false })

    const { error } = await supabase.from('control_carta_registros').upsert({
      restaurante_id: RESTAURANTE_ID, carta_item_id: cartaItemId, fecha, turno,
      estado, usuario_id: usuarioId,
    }, { onConflict: 'carta_item_id,fecha,turno' })
    if (error) {
      await mutate()
      throw error
    }

    const eraNoSale = previa?.estado === 'no_sale'
    if (estado === 'no_sale' || eraNoSale) {
      const disponible = estado !== 'no_sale'
      const { error: dispErr } = await supabase.from('carta_items').update({ disponible }).eq('id', cartaItemId)
      if (dispErr) {
        console.error('[useControlCarta] no se pudo actualizar disponible:', dispErr.message)
      } else if (itemsKey) {
        mutateGlobal(itemsKey, (prev: ControlCartaItem[] | undefined) =>
          prev?.map(i => i.id === cartaItemId ? { ...i, disponible } : i), { revalidate: false })
      }
    }
  }, [RESTAURANTE_ID, fecha, turno, supabase, mutate, mutateGlobal, itemsKey, registroMap])

  return {
    items,
    registroMap,
    loading: itemsLoading || regLoading,
    setEstado,
  }
}
