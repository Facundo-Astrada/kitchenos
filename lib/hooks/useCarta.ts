'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Receta, Ingrediente } from '@/types'
import { calcFoodCost } from './useRecetas'
import { useRestauranteId } from './useRestauranteId'

export type CategoriaCartaItem = 'Entradas' | 'Principales' | 'Postres' | 'Bebidas' | 'Guarniciones' | 'Brunch' | 'Cafetería'

export interface CartaItemDB {
  id: string
  nombre: string
  descripcion: string | null
  precio_venta: number
  categoria: CategoriaCartaItem
  receta_id: string | null
  disponible: boolean
  foto_url: string | null
  orden: number
  restaurante_id: string
  created_at: string
}

interface PlatoRecetaDB {
  id: string
  plato_id: string
  receta_id: string
  porciones: number
  orden: number
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

const _cartaCache = new Map<string, CartaItemEnriquecido[]>()

export function useCarta() {
  const RESTAURANTE_ID = useRestauranteId()
  const [items, setItems] = useState<CartaItemEnriquecido[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const fetchItems = useCallback(async () => {
    if (!RESTAURANTE_ID) { setLoading(false); return }

    const cached = _cartaCache.get(RESTAURANTE_ID)
    if (cached) {
      setItems(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      const { data: cartaData, error: cartaErr } = await supabase
        .from('carta_items')
        .select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
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

      const enriched: CartaItemEnriquecido[] = cartaItems.map(item => {
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
          ...item, receta, plato_recetas: platoRecetas,
          plato_packaging: platoPackaging, costo_packaging,
          food_cost_pct, costo_porcion, margen_bruto, margen_pct_computed, costo_total_plato,
        }
      })

      _cartaCache.set(RESTAURANTE_ID, enriched)
      setItems(enriched)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar la carta'
      console.error('[useCarta] fetchItems Error:', msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [RESTAURANTE_ID, supabase])

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
      const original = _cartaCache.get(RESTAURANTE_ID)?.find(i => i.id === platoId)
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
  }, [RESTAURANTE_ID, supabase, fetchItems])

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
    fetchItems()
    const ch = supabase.channel('carta-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carta_items' }, () => fetchItems())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plato_recetas' }, () => fetchItems())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plato_packaging' }, () => fetchItems())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchItems])

  return {
    items, loading, error,
    fetchItems, crearItem, actualizarItem,
    toggleDisponible, eliminarItem, marcar86PorNombre,
    duplicarItem,
    agregarPlatoReceta, actualizarPlatoReceta, eliminarPlatoReceta,
    agregarPlatoPackaging, eliminarPlatoPackaging,
  }
}
