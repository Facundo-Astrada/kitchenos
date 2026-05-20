'use client'

import { useEffect, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { Receta, Ingrediente, FoodCostCalc } from '@/types'
import { useRestauranteId } from './useRestauranteId'

export type RecetaConCosto = Receta & {
  food_cost: FoodCostCalc
}

// Factor de conversión para cuando unidad del ingrediente ≠ unidad del costo.
// Ej: cantidad en 'g', precio en 'kg' → factor = 0.001 (g a kg)
export function unitConversionFactor(ingredientUnit: string, costUnit: string): number {
  const u = (ingredientUnit || '').toLowerCase().trim()
  const c = (costUnit || '').toLowerCase().trim()
  if (!u || !c || u === c) return 1
  if (u === 'g' && c === 'kg') return 0.001
  if (u === 'kg' && c === 'g') return 1000
  if (u === 'ml' && (c === 'l' || c === 'lt' || c === 'lts')) return 0.001
  if ((u === 'l' || u === 'lt' || u === 'lts') && c === 'ml') return 1000
  return 1
}

export function calcFoodCost(ingredientes: Ingrediente[], porciones: number, precioVenta: number): FoodCostCalc {
  // `cantidad` es la cantidad bruta (lo que se compra). El costo = bruta × precio.
  // merma_pct no se re-aplica acá porque ya está incorporado en la cantidad bruta ingresada.
  // unitConversionFactor corrige cuando unidad del ingrediente ≠ unidad del precio (ej: g vs kg).
  const costo_total = ingredientes.reduce((sum, i) => {
    const factor = unitConversionFactor(i.unidad ?? '', i.unidad_costo ?? i.unidad ?? '')
    return sum + i.cantidad * factor * (i.costo_unitario ?? 0)
  }, 0)
  const costo_porcion = porciones > 0 ? costo_total / porciones : 0
  const food_cost_pct = precioVenta > 0 ? (costo_porcion / precioVenta) * 100 : 0
  const margen_bruto = precioVenta - costo_porcion
  return { costo_total, costo_porcion, food_cost_pct, margen_bruto }
}

function mapReceta(r: Record<string, unknown>): RecetaConCosto {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ings = ((r.ingredientes as any[]) ?? []) as Ingrediente[]
  return {
    ...(r as unknown as Receta),
    status: (r.status as string) || 'published',
    ingredientes: ings,
    food_cost: calcFoodCost(ings, (r.porciones as number) ?? 1, (r.precio_venta as number) ?? 0),
  }
}

async function fetchRecetasData(key: string): Promise<RecetaConCosto[]> {
  const rid = key.slice('recetas-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('recetas')
    .select('*, ingredientes!ingredientes_receta_id_fkey(*)')
    .eq('restaurante_id', rid)
    .eq('activa', true)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(r => mapReceta(r as Record<string, unknown>))
}

export function useRecetas() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID ? `recetas-${RESTAURANTE_ID}` : null

  const { data: recetas = [], isLoading: loading, error: swrError, mutate } = useSWR(
    swrKey,
    fetchRecetasData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 300_000,
      keepPreviousData: true,
    }
  )

  const error = (swrError as Error | null)?.message ?? null

  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const ch1 = supabase
      .channel(`recetas-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recetas' }, () => mutate())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredientes' }, () => mutate())
      .subscribe()
    return () => { supabase.removeChannel(ch1) }
  }, [RESTAURANTE_ID, supabase, mutate])

  async function agregarReceta(datos: Omit<Receta, 'id' | 'restaurante_id' | 'ingredientes'>, ingredientesData?: Omit<Ingrediente, 'id' | 'receta_id'>[]) {
    if (!RESTAURANTE_ID) throw new Error('Sesión no cargada. Esperá un momento y volvé a intentarlo.')
    try {
      const res = await fetch('/api/recetas/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receta: { ...datos, status: datos.status || 'published', restaurante_id: RESTAURANTE_ID },
          ingredientes: ingredientesData,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al guardar receta')
      const newId = json.id as string
      // Optimistic: agregar a la lista antes de revalidar
      const ings = (ingredientesData || []).map(i => ({ ...i, id: '', receta_id: newId })) as Ingrediente[]
      const nueva: RecetaConCosto = {
        id: newId,
        ...datos,
        restaurante_id: RESTAURANTE_ID,
        created_at: new Date().toISOString(),
        ingredientes: ings,
        food_cost: calcFoodCost(ings, datos.porciones ?? 1, datos.precio_venta ?? 0),
        status: datos.status || 'published',
        activa: true,
      }
      mutate((prev) => {
        if (prev?.find(r => r.id === newId)) return prev
        return [nueva, ...(prev ?? [])]
      }, { revalidate: false })
      mutate() // background sync
      return newId
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al agregar receta'
      console.error('[useRecetas] agregarReceta Error:', msg)
      throw new Error(msg)
    }
  }

  async function publicarReceta(id: string) {
    try {
      const { error } = await supabase.from('recetas').update({ status: 'published' }).eq('id', id)
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al publicar receta'
      console.error('[useRecetas] publicarReceta Error:', msg)
      throw new Error(msg)
    }
  }

  async function actualizarReceta(id: string, datos: Partial<Omit<Receta, 'id' | 'restaurante_id' | 'ingredientes'>>) {
    try {
      const { error } = await supabase.from('recetas').update(datos).eq('id', id)
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar receta'
      console.error('[useRecetas] actualizarReceta Error:', msg)
      throw new Error(msg)
    }
  }

  async function eliminarReceta(id: string) {
    try {
      const { error } = await supabase.from('recetas').update({ activa: false }).eq('id', id)
      if (error) throw error
      mutate((prev) => prev?.filter(r => r.id !== id), { revalidate: false })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar receta'
      console.error('[useRecetas] eliminarReceta Error:', msg)
      throw new Error(msg)
    }
  }

  async function agregarIngrediente(recetaId: string, datos: Omit<Ingrediente, 'id' | 'receta_id'>) {
    try {
      const res = await fetch('/api/recetas/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receta: null, ingredientes: [{ ...datos, receta_id: recetaId }], addIngredientsOnly: true }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Error al agregar ingrediente')
      }
      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al agregar ingrediente'
      console.error('[useRecetas] agregarIngrediente Error:', msg)
      throw new Error(msg)
    }
  }

  async function actualizarIngrediente(id: string, datos: Partial<Omit<Ingrediente, 'id' | 'receta_id'>>) {
    try {
      const { error } = await supabase.from('ingredientes').update(datos).eq('id', id)
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar ingrediente'
      console.error('[useRecetas] actualizarIngrediente Error:', msg)
      throw new Error(msg)
    }
  }

  async function eliminarIngrediente(id: string) {
    try {
      const { error } = await supabase.from('ingredientes').delete().eq('id', id)
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar ingrediente'
      console.error('[useRecetas] eliminarIngrediente Error:', msg)
      throw new Error(msg)
    }
  }

  return {
    recetas,
    loading,
    error,
    page: 0,
    hasMore: false,
    fetchMore: useCallback(() => {}, []),
    refetch: useCallback(() => { mutate() }, [mutate]),
    agregarReceta,
    actualizarReceta,
    eliminarReceta,
    publicarReceta,
    agregarIngrediente,
    actualizarIngrediente,
    eliminarIngrediente,
  }
}
