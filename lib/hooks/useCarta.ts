'use client'

import { useEffect, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { Receta, Ingrediente } from '@/types'
import { calcFoodCost } from './useRecetas'
import { useRestauranteId } from './useRestauranteId'

const SWR_OPTS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 300_000,
  keepPreviousData: true,
} as const

// Legacy union type — mantenida para compatibilidad; las categorías ahora son dinámicas
export type CategoriaCartaItem = string

export const CATEGORIAS_DEFAULT = [
  { nombre: 'Entradas',     icono: 'tapas' },
  { nombre: 'Principales',  icono: 'restaurant' },
  { nombre: 'Postres',      icono: 'cake' },
  { nombre: 'Bebidas',      icono: 'local_bar' },
  { nombre: 'Guarniciones', icono: 'dining' },
  { nombre: 'Brunch',       icono: 'brunch_dining' },
  { nombre: 'Cafetería',    icono: 'coffee' },
]

export interface CartaCategoria {
  id: string
  nombre: string
  icono: string
  orden: number
  restaurante_id: string
}

export interface CartaItemDB {
  id: string
  nombre: string
  descripcion: string | null
  procedimiento: string | null
  precio_venta: number
  categoria: string
  receta_id: string | null
  disponible: boolean
  foto_url: string | null
  orden: number
  tags: string[]
  restaurante_id: string
  created_at: string
}

interface PlatoRecetaDB {
  id: string
  plato_id: string
  receta_id: string
  porciones: number
  orden: number
  plaza?: string | null
  cantidad_ops?: number | null
  unidad_ops?: string | null
}

export interface PlatoRecetaEnriquecido extends PlatoRecetaDB {
  receta?: Receta & { ingredientes: Ingrediente[] }
  costo_calculado: number
}

export interface PlatoPackagingDB {
  id: string
  plato_id: string
  producto_id: string
  cantidad: number
  orden: number
}

export interface PlatoPackagingEnriquecido extends PlatoPackagingDB {
  producto_nombre: string
  producto_unidad: string
  producto_precio_unitario: number
}

export interface CartaItemEnriquecido extends CartaItemDB {
  receta?: Receta & { ingredientes: Ingrediente[] }
  food_cost_pct?: number
  costo_porcion?: number
  margen_bruto?: number
  plato_recetas: PlatoRecetaEnriquecido[]
  plato_packaging: PlatoPackagingEnriquecido[]
  margen_pct_computed?: number
  costo_total_plato?: number
  costo_packaging: number
}

async function fetchCartaCategoriasData(key: string): Promise<CartaCategoria[]> {
  const rid = key.slice('carta-cat-'.length)
  const supabase = createClient()
  const { data } = await supabase
    .from('carta_categorias')
    .select('id, nombre, icono, orden, restaurante_id')
    .eq('restaurante_id', rid)
    .order('orden')
  if (data && data.length > 0) return data as CartaCategoria[]
  // Primera vez: sembrar categorías por defecto
  const inserts = CATEGORIAS_DEFAULT.map((c, i) => ({
    nombre: c.nombre, icono: c.icono, orden: i, restaurante_id: rid,
  }))
  const { data: seeded } = await supabase
    .from('carta_categorias')
    .insert(inserts)
    .select('id, nombre, icono, orden, restaurante_id')
  return (seeded ?? []) as CartaCategoria[]
}

async function fetchCartaItemsData(key: string): Promise<CartaItemEnriquecido[]> {
  const rid = key.slice('carta-items-'.length)
  const supabase = createClient()

  const { data: cartaData, error: cartaErr } = await supabase
    .from('carta_items')
    .select('*')
    .eq('restaurante_id', rid)
    .order('categoria')
    .order('orden')
    .order('nombre')

  if (cartaErr) throw cartaErr
  const cartaItems = (cartaData ?? []) as CartaItemDB[]

  const recetaMap: Record<string, Receta & { ingredientes: Ingrediente[] }> = {}
  const platoRecetasMap: Record<string, PlatoRecetaEnriquecido[]> = {}
  const platoPackagingMap: Record<string, PlatoPackagingEnriquecido[]> = {}

  if (cartaItems.length > 0) {
    const platoIds = cartaItems.map(c => c.id)

    // Fetch plato_recetas
    const { data: prData } = await supabase
      .from('plato_recetas')
      .select('*')
      .in('plato_id', platoIds)
      .order('orden')

    const prItems = (prData ?? []) as PlatoRecetaDB[]
    const prRecetaIds = [...new Set(prItems.map(pr => pr.receta_id))]
    const legacyRecetaIds = cartaItems.map(c => c.receta_id).filter(Boolean) as string[]
    const allRecetaIds = [...new Set([...prRecetaIds, ...legacyRecetaIds])]

    if (allRecetaIds.length > 0) {
      const { data: recetasData, error: recErr } = await supabase
        .from('recetas')
        .select('*')
        .in('id', allRecetaIds)
      if (recErr) throw recErr

      const { data: ingData, error: ingErr } = await supabase
        .from('ingredientes')
        .select('*')
        .in('receta_id', allRecetaIds)
      if (ingErr) throw ingErr

      const ingMap: Record<string, Ingrediente[]> = {}
      for (const ing of (ingData ?? []) as Ingrediente[]) {
        if (!ingMap[ing.receta_id]) ingMap[ing.receta_id] = []
        ingMap[ing.receta_id].push(ing)
      }
      for (const r of (recetasData ?? []) as Receta[]) {
        recetaMap[r.id] = { ...r, ingredientes: ingMap[r.id] ?? [] }
      }
    }

    for (const pr of prItems) {
      if (!platoRecetasMap[pr.plato_id]) platoRecetasMap[pr.plato_id] = []
      const r = recetaMap[pr.receta_id]
      const costo_calculado = r
        ? calcFoodCost(r.ingredientes, r.porciones ?? 1, 0).costo_porcion * pr.porciones
        : 0
      platoRecetasMap[pr.plato_id].push({ ...pr, receta: r, costo_calculado })
    }

    // Fetch plato_packaging + productos
    const { data: pkgData } = await supabase
      .from('plato_packaging')
      .select('*')
      .in('plato_id', platoIds)
      .order('orden')

    const pkgItems = (pkgData ?? []) as PlatoPackagingDB[]
    const pkgProductoIds = [...new Set(pkgItems.map(p => p.producto_id))]

    if (pkgProductoIds.length > 0) {
      const { data: prodData } = await supabase
        .from('productos')
        .select('id, nombre, unidad, precio_unitario')
        .in('id', pkgProductoIds)

      const prodMap: Record<string, { nombre: string; unidad: string; precio_unitario: number }> = {}
      for (const p of (prodData ?? []) as { id: string; nombre: string; unidad: string; precio_unitario: number }[]) {
        prodMap[p.id] = p
      }

      for (const pkg of pkgItems) {
        if (!platoPackagingMap[pkg.plato_id]) platoPackagingMap[pkg.plato_id] = []
        const prod = prodMap[pkg.producto_id]
        platoPackagingMap[pkg.plato_id].push({
          ...pkg,
          producto_nombre: prod?.nombre ?? '—',
          producto_unidad: prod?.unidad ?? 'u',
          producto_precio_unitario: prod?.precio_unitario ?? 0,
        })
      }
    }
  }

  return cartaItems.map(item => {
    const receta = item.receta_id ? recetaMap[item.receta_id] : undefined
    const platoRecetas = platoRecetasMap[item.id] ?? []
    const platoPackaging = platoPackagingMap[item.id] ?? []

    // Costo de packaging para 1 porción del plato
    const costo_packaging = platoPackaging.reduce(
      (sum, p) => sum + p.producto_precio_unitario * p.cantidad, 0
    )

    let food_cost_pct: number | undefined
    let costo_porcion: number | undefined
    let margen_bruto: number | undefined
    let margen_pct_computed: number | undefined
    let costo_total_plato: number | undefined

    if (platoRecetas.length > 0) {
      costo_total_plato = platoRecetas.reduce((sum, pr) => sum + pr.costo_calculado, 0)
      const costo_con_pkg = costo_total_plato + costo_packaging
      const precio = item.precio_venta ?? 0
      if (precio > 0 && costo_con_pkg > 0) {
        costo_porcion = costo_con_pkg
        margen_bruto = precio - costo_con_pkg
        food_cost_pct = (costo_con_pkg / precio) * 100
        margen_pct_computed = ((precio - costo_con_pkg) / precio) * 100
      }
    } else if (receta && receta.ingredientes.length > 0) {
      const fc = calcFoodCost(receta.ingredientes, receta.porciones ?? 0, item.precio_venta ?? 0)
      const costo_con_pkg = (fc.costo_porcion ?? 0) + costo_packaging
      food_cost_pct = item.precio_venta > 0 ? (costo_con_pkg / item.precio_venta) * 100 : fc.food_cost_pct
      costo_porcion = costo_con_pkg > 0 ? costo_con_pkg : fc.costo_porcion
      margen_bruto = item.precio_venta > 0 ? item.precio_venta - costo_con_pkg : fc.margen_bruto
      if (item.precio_venta > 0 && costo_porcion != null) {
        margen_pct_computed = ((item.precio_venta - costo_con_pkg) / item.precio_venta) * 100
      }
    }

    return {
      ...item,
      tags: (item.tags ?? []) as string[],
      receta, plato_recetas: platoRecetas,
      plato_packaging: platoPackaging, costo_packaging,
      food_cost_pct, costo_porcion, margen_bruto, margen_pct_computed, costo_total_plato,
    }
  })
}

export function useCarta() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const { data: categorias = [], mutate: mutateCategorias } = useSWR(
    RESTAURANTE_ID ? `carta-cat-${RESTAURANTE_ID}` : null,
    fetchCartaCategoriasData,
    SWR_OPTS,
  )

  const { data: items = [], isLoading: loading, error: swrError, mutate: mutateItems } = useSWR(
    RESTAURANTE_ID ? `carta-items-${RESTAURANTE_ID}` : null,
    fetchCartaItemsData,
    SWR_OPTS,
  )

  const error = (swrError as Error | null)?.message ?? null

  const fetchCategorias = useCallback(async () => { await mutateCategorias() }, [mutateCategorias])
  const fetchItems = useCallback(async () => { await mutateItems() }, [mutateItems])

  const crearCategoria = useCallback(async (nombre: string, icono = 'restaurant') => {
    if (!RESTAURANTE_ID) return
    const nextOrden = categorias.length
    await supabase.from('carta_categorias').insert({
      nombre, icono, orden: nextOrden, restaurante_id: RESTAURANTE_ID,
    })
    await fetchCategorias()
  }, [RESTAURANTE_ID, supabase, categorias.length, fetchCategorias])

  const eliminarCategoria = useCallback(async (id: string) => {
    await supabase.from('carta_categorias').delete().eq('id', id)
    await fetchCategorias()
  }, [supabase, fetchCategorias])

  const crearItem = useCallback(async (datos: {
    nombre: string
    descripcion?: string | null
    precio_venta: number
    categoria: CategoriaCartaItem
    receta_id?: string | null
    foto_url?: string | null
  }) => {
    try {
      const { data: maxData } = await supabase
        .from('carta_items')
        .select('orden')
        .eq('restaurante_id', RESTAURANTE_ID)
        .eq('categoria', datos.categoria)
        .order('orden', { ascending: false })
        .limit(1)
        .single()

      const nextOrden = (maxData?.orden ?? -1) + 1

      const { data, error } = await supabase.from('carta_items').insert({
        nombre: datos.nombre,
        descripcion: datos.descripcion || null,
        precio_venta: datos.precio_venta,
        categoria: datos.categoria,
        receta_id: datos.receta_id || null,
        disponible: true,
        foto_url: datos.foto_url || null,
        orden: nextOrden,
        restaurante_id: RESTAURANTE_ID,
      }).select('id').single()

      if (error) throw error
      await fetchItems()
      return data.id as string
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al crear item de carta'
      console.error('[useCarta] crearItem Error:', msg)
      throw new Error(msg)
    }
  }, [fetchItems, RESTAURANTE_ID, supabase])

  const actualizarItem = useCallback(async (id: string, datos: Partial<Omit<CartaItemDB, 'id' | 'restaurante_id' | 'created_at'>>) => {
    try {
      const { error } = await supabase.from('carta_items').update(datos).eq('id', id)
      if (error) throw error
      await fetchItems()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar item de carta'
      console.error('[useCarta] actualizarItem Error:', msg)
      throw new Error(msg)
    }
  }, [fetchItems, supabase])

  const toggleDisponible = useCallback(async (id: string, disponible: boolean) => {
    try {
      const { error } = await supabase.from('carta_items').update({ disponible }).eq('id', id)
      if (error) throw error
      await fetchItems()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cambiar disponibilidad'
      console.error('[useCarta] toggleDisponible Error:', msg)
      throw new Error(msg)
    }
  }, [fetchItems, supabase])

  const duplicarItem = useCallback(async (platoId: string): Promise<string> => {
    try {
      const original = items.find(i => i.id === platoId)
      if (!original) throw new Error('Plato no encontrado')

      const { data: maxData } = await supabase
        .from('carta_items')
        .select('orden')
        .eq('restaurante_id', RESTAURANTE_ID)
        .eq('categoria', original.categoria)
        .order('orden', { ascending: false })
        .limit(1)
        .single()
      const nextOrden = (maxData?.orden ?? -1) + 1

      const { data: newItem, error: itemErr } = await supabase
        .from('carta_items')
        .insert({
          nombre: `Copia de ${original.nombre}`,
          descripcion: original.descripcion,
          precio_venta: original.precio_venta,
          categoria: original.categoria,
          receta_id: original.receta_id,
          disponible: false,
          foto_url: original.foto_url,
          orden: nextOrden,
          restaurante_id: RESTAURANTE_ID,
        })
        .select('id')
        .single()
      if (itemErr) throw itemErr
      const newId = newItem.id as string

      if (original.plato_recetas.length > 0) {
        await supabase.from('plato_recetas').insert(
          original.plato_recetas.map(pr => ({
            plato_id: newId, receta_id: pr.receta_id,
            porciones: pr.porciones, orden: pr.orden,
          }))
        )
      }

      if (original.plato_packaging.length > 0) {
        await supabase.from('plato_packaging').insert(
          original.plato_packaging.map(pkg => ({
            plato_id: newId, producto_id: pkg.producto_id,
            cantidad: pkg.cantidad, orden: pkg.orden,
          }))
        )
      }

      await fetchItems()
      return newId
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al duplicar plato'
      console.error('[useCarta] duplicarItem Error:', msg)
      throw new Error(msg)
    }
  }, [RESTAURANTE_ID, supabase, fetchItems, items])

  const eliminarItem = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('carta_items').delete().eq('id', id)
      if (error) throw error
      await fetchItems()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar item de carta'
      console.error('[useCarta] eliminarItem Error:', msg)
      throw new Error(msg)
    }
  }, [fetchItems, supabase])

  const marcar86PorNombre = useCallback(async (nombre: string) => {
    try {
      const { error } = await supabase.from('carta_items')
        .update({ disponible: false })
        .eq('restaurante_id', RESTAURANTE_ID)
        .ilike('nombre', nombre)
      if (error) throw error
      await fetchItems()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al marcar plato como 86'
      console.error('[useCarta] marcar86PorNombre Error:', msg)
      throw new Error(msg)
    }
  }, [fetchItems, RESTAURANTE_ID, supabase])

  const agregarPlatoReceta = useCallback(async (platoId: string, recetaId: string, porciones: number) => {
    try {
      const { data: maxData } = await supabase
        .from('plato_recetas')
        .select('orden')
        .eq('plato_id', platoId)
        .order('orden', { ascending: false })
        .limit(1)
        .single()
      const nextOrden = (maxData?.orden ?? -1) + 1
      const { error } = await supabase.from('plato_recetas').insert({
        plato_id: platoId,
        receta_id: recetaId,
        porciones,
        orden: nextOrden,
      })
      if (error) throw error
      await fetchItems()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al vincular receta'
      console.error('[useCarta] agregarPlatoReceta Error:', msg)
      throw new Error(msg)
    }
  }, [fetchItems, supabase])

  const actualizarPlatoReceta = useCallback(async (platoRecetaId: string, porciones: number) => {
    try {
      const { error } = await supabase.from('plato_recetas').update({ porciones }).eq('id', platoRecetaId)
      if (error) throw error
      await fetchItems()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar porciones'
      console.error('[useCarta] actualizarPlatoReceta Error:', msg)
      throw new Error(msg)
    }
  }, [fetchItems, supabase])

  // Gramaje (u otra unidad) de una receta dentro del plato → plato_recetas.cantidad_ops/unidad_ops.
  // Es el "cuántos gramos de esta receta van al plato" que se ve en la ficha derivada del recetario.
  const actualizarPlatoRecetaOps = useCallback(async (platoRecetaId: string, datos: { cantidad_ops: number | null; unidad_ops: string | null }) => {
    try {
      const { error } = await supabase.from('plato_recetas').update(datos).eq('id', platoRecetaId)
      if (error) throw error
      await fetchItems()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar gramaje'
      console.error('[useCarta] actualizarPlatoRecetaOps Error:', msg)
      throw new Error(msg)
    }
  }, [fetchItems, supabase])

  const eliminarPlatoReceta = useCallback(async (platoRecetaId: string) => {
    try {
      const { error } = await supabase.from('plato_recetas').delete().eq('id', platoRecetaId)
      if (error) throw error
      await fetchItems()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al desvincular receta'
      console.error('[useCarta] eliminarPlatoReceta Error:', msg)
      throw new Error(msg)
    }
  }, [fetchItems, supabase])

  const agregarPlatoPackaging = useCallback(async (platoId: string, productoId: string, cantidad: number) => {
    try {
      const { data: maxData } = await supabase
        .from('plato_packaging')
        .select('orden')
        .eq('plato_id', platoId)
        .order('orden', { ascending: false })
        .limit(1)
        .single()
      const nextOrden = (maxData?.orden ?? -1) + 1
      const { error } = await supabase.from('plato_packaging').insert({
        plato_id: platoId,
        producto_id: productoId,
        cantidad,
        orden: nextOrden,
      })
      if (error) throw error
      await fetchItems()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al agregar packaging'
      console.error('[useCarta] agregarPlatoPackaging Error:', msg)
      throw new Error(msg)
    }
  }, [fetchItems, supabase])

  const actualizarTags = useCallback(async (id: string, tags: string[]) => {
    try {
      const { error } = await supabase.from('carta_items').update({ tags }).eq('id', id)
      if (error) throw error
      await fetchItems()
    } catch (e: unknown) {
      console.error('[useCarta] actualizarTags Error:', e instanceof Error ? e.message : e)
      throw e
    }
  }, [fetchItems, RESTAURANTE_ID, supabase])

  const eliminarPlatoPackaging = useCallback(async (packagingId: string) => {
    try {
      const { error } = await supabase.from('plato_packaging').delete().eq('id', packagingId)
      if (error) throw error
      await fetchItems()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar packaging'
      console.error('[useCarta] eliminarPlatoPackaging Error:', msg)
      throw new Error(msg)
    }
  }, [fetchItems, supabase])

  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const ch = supabase.channel(`carta-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carta_items' }, () => mutateItems())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plato_recetas' }, () => mutateItems())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plato_packaging' }, () => mutateItems())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carta_categorias' }, () => mutateCategorias())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID, supabase, mutateItems, mutateCategorias])

  return {
    items, loading, error,
    categorias, fetchCategorias, crearCategoria, eliminarCategoria,
    fetchItems, crearItem, actualizarItem, actualizarTags,
    toggleDisponible, eliminarItem, marcar86PorNombre,
    duplicarItem,
    agregarPlatoReceta, actualizarPlatoReceta, actualizarPlatoRecetaOps, eliminarPlatoReceta,
    agregarPlatoPackaging, eliminarPlatoPackaging,
  }
}
