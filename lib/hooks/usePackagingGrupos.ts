'use client'

import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'

export interface PackagingGrupoItem {
  id: string
  grupo_id: string
  producto_id: string
  cantidad: number
  orden: number
  producto_nombre: string
  producto_unidad: string
  producto_precio_unitario: number
}

export interface PackagingGrupo {
  id: string
  nombre: string
  restaurante_id: string
  created_at: string
  items: PackagingGrupoItem[]
}

async function fetchGruposData(key: string): Promise<PackagingGrupo[]> {
  const rid = key.slice('packaging-grupos-'.length)
  const supabase = createClient()

  const { data: gData } = await supabase
    .from('packaging_grupos')
    .select('*')
    .eq('restaurante_id', rid)
    .order('created_at')

  const gs = (gData ?? []) as PackagingGrupo[]
  if (gs.length === 0) return []

  const { data: itemsData } = await supabase
    .from('packaging_grupo_items')
    .select('*')
    .in('grupo_id', gs.map(g => g.id))
    .order('orden')

  const rawItems = (itemsData ?? []) as PackagingGrupoItem[]
  const prodIds = [...new Set(rawItems.map(i => i.producto_id))]

  const prodMap: Record<string, { nombre: string; unidad: string; precio_unitario: number }> = {}
  if (prodIds.length > 0) {
    const { data: prods } = await supabase
      .from('productos')
      .select('id, nombre, unidad, precio_unitario')
      .in('id', prodIds)
    for (const p of (prods ?? []) as { id: string; nombre: string; unidad: string; precio_unitario: number }[]) {
      prodMap[p.id] = p
    }
  }

  const byGrupo: Record<string, PackagingGrupoItem[]> = {}
  for (const item of rawItems) {
    if (!byGrupo[item.grupo_id]) byGrupo[item.grupo_id] = []
    const prod = prodMap[item.producto_id]
    byGrupo[item.grupo_id].push({
      ...item,
      producto_nombre: prod?.nombre ?? '—',
      producto_unidad: prod?.unidad ?? 'u',
      producto_precio_unitario: prod?.precio_unitario ?? 0,
    })
  }

  return gs.map(g => ({ ...g, items: byGrupo[g.id] ?? [] }))
}

export function usePackagingGrupos() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID ? `packaging-grupos-${RESTAURANTE_ID}` : null

  const { data: grupos = [], isLoading: loading, mutate } = useSWR(
    swrKey,
    fetchGruposData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 300_000,
      keepPreviousData: true,
    }
  )

  const fetchGrupos = useCallback(async () => { await mutate() }, [mutate])

  const crearGrupo = useCallback(async (
    nombre: string,
    items: { productoId: string; cantidad: number }[]
  ): Promise<string> => {
    const { data, error } = await supabase
      .from('packaging_grupos')
      .insert({ nombre, restaurante_id: RESTAURANTE_ID })
      .select('id')
      .single()
    if (error) throw error
    const grupoId = data.id as string

    if (items.length > 0) {
      await supabase.from('packaging_grupo_items').insert(
        items.map((item, idx) => ({
          grupo_id: grupoId,
          producto_id: item.productoId,
          cantidad: item.cantidad,
          orden: idx,
        }))
      )
    }
    await mutate()
    return grupoId
  }, [RESTAURANTE_ID, supabase, mutate])

  const eliminarGrupo = useCallback(async (grupoId: string) => {
    await supabase.from('packaging_grupos').delete().eq('id', grupoId)
    await mutate()
  }, [supabase, mutate])

  const aplicarGrupoAPlatos = useCallback(async (grupoId: string, platoIds: string[]) => {
    const grupo = grupos.find(g => g.id === grupoId)
    if (!grupo || grupo.items.length === 0 || platoIds.length === 0) return

    const { data: existing } = await supabase
      .from('plato_packaging')
      .select('plato_id, producto_id, orden')
      .in('plato_id', platoIds)

    const existSet = new Set((existing ?? []).map((p: { plato_id: string; producto_id: string }) => `${p.plato_id}:${p.producto_id}`))

    const maxOrden: Record<string, number> = {}
    for (const row of (existing ?? []) as { plato_id: string; orden: number }[]) {
      maxOrden[row.plato_id] = Math.max(maxOrden[row.plato_id] ?? -1, row.orden)
    }

    const toInsert: Record<string, unknown>[] = []
    for (const platoId of platoIds) {
      let nextOrden = (maxOrden[platoId] ?? -1) + 1
      for (const item of grupo.items) {
        if (!existSet.has(`${platoId}:${item.producto_id}`)) {
          toInsert.push({ plato_id: platoId, producto_id: item.producto_id, cantidad: item.cantidad, orden: nextOrden++ })
        }
      }
    }

    if (toInsert.length > 0) {
      await supabase.from('plato_packaging').insert(toInsert)
    }
  }, [grupos, supabase])

  return { grupos, loading, fetchGrupos, crearGrupo, eliminarGrupo, aplicarGrupoAPlatos }
}
