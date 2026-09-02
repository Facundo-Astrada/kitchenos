'use client'

import { useEffect, useCallback, useMemo, useRef } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { Receta, Ingrediente, FoodCostCalc } from '@/types'
import { useRestauranteId } from './useRestauranteId'
import { canonUnit, unitConversionFactor } from '@/lib/unidades'

export type RecetaConCosto = Receta & {
  food_cost: FoodCostCalc
  en_carta?: boolean   // derivado: existe un carta_item con receta_id = esta receta (publicada en carta)
  // `es_plato` es columna real de Receta (modo "trabajar como plato") — no confundir con en_carta
}

// canonUnit/unitConversionFactor viven en lib/unidades.ts (día 10 de
// plan-consolidado.md §2 — antes triplicadas acá y en consumoTeorico.ts, con
// 'use client' arrastrando la copia al bundle del servidor). Se re-exportan
// para no tocar a los consumidores existentes (mismo criterio que
// PLAZAS_OPS/SECCIONES_OPS en carta/ComposicionEditor.tsx).
export { canonUnit, unitConversionFactor }

// Ventana durante la cual un evento de realtime con un id que acabamos de
// escribir se considera el eco de nuestra propia escritura y se ignora —
// mismo criterio que useTareas.ts. Sin esto, cada mutación optimista de acá
// abajo queda pisada por el refetch completo que dispara su propio eco.
const ECO_REALTIME_MS = 5_000

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

// Recalcula food_cost de una receta ya mapeada tras tocar sus ingredientes o
// sus propios campos (porciones/precio_venta) — usado por las mutaciones
// optimistas de acá abajo, no solo por el fetch inicial.
function conFoodCostRecalculado(r: RecetaConCosto): RecetaConCosto {
  return { ...r, food_cost: calcFoodCost(r.ingredientes ?? [], r.porciones ?? 1, r.precio_venta ?? 0) }
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

  // Recetas que son platos: existe un carta_item vinculado por receta_id.
  // Derivado (no columna) → si se borra el plato en Carta, el flag desaparece solo.
  const { data: cartaLinks } = await supabase
    .from('carta_items')
    .select('receta_id')
    .eq('restaurante_id', rid)
    .not('receta_id', 'is', null)
  const platoIds = new Set((cartaLinks ?? []).map(c => (c as { receta_id: string }).receta_id))

  return (data ?? []).map(r => {
    const mapped = mapReceta(r as Record<string, unknown>)
    return { ...mapped, en_carta: platoIds.has(mapped.id) }
  })
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

  // Ids escritos por ESTE cliente hace poco (recetas o ingredientes). Cada
  // mutación de acá abajo marca el id que tocó; cuando el eco de esa misma
  // escritura vuelve por realtime se ignora — si no, el refetch completo que
  // dispara el canal pisa el optimistic de inmediato y toda la ganancia de
  // no esperar un round-trip por edición se pierde igual.
  const escriturasPropias = useRef<Map<string, number>>(new Map())
  const marcarEscrituraPropia = useCallback((id: string) => {
    const ahora = Date.now()
    for (const [k, ts] of escriturasPropias.current) {
      if (ahora - ts > ECO_REALTIME_MS) escriturasPropias.current.delete(k)
    }
    escriturasPropias.current.set(id, ahora)
  }, [])

  useEffect(() => {
    if (!RESTAURANTE_ID) return
    // recetas y carta_items se filtran por restaurante — sin filter, cualquier
    // escritura de otra cuenta hacía refetchear medio mega de recetas acá.
    // `ingredientes` no tiene restaurante_id (cuelga de la receta), así que ese
    // canal no se puede filtrar; se deja para no perder frescura al editar
    // ingredientes desde otro dispositivo.
    const filter = `restaurante_id=eq.${RESTAURANTE_ID}`
    let timer: ReturnType<typeof setTimeout> | null = null
    const revalidar = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => mutate(), 400)
    }
    const esEco = (payload: { new: unknown; old: unknown }) => {
      const fila = (payload.new ?? payload.old) as { id?: string } | null
      const id = fila?.id
      if (!id) return false
      const ts = escriturasPropias.current.get(id)
      return ts != null && Date.now() - ts < ECO_REALTIME_MS
    }
    const ch1 = supabase
      .channel(`recetas-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recetas', filter }, (payload) => { if (!esEco(payload)) revalidar() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredientes' }, (payload) => { if (!esEco(payload)) revalidar() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carta_items', filter }, (payload) => { if (!esEco(payload)) revalidar() })
      .subscribe()
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(ch1) }
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
      marcarEscrituraPropia(newId)
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
      mutate() // background sync — una sola vez al crear, no por cada edición

      // Auto-link ingredientes al stock (exacto + parcial) en background
      if (ingredientesData && ingredientesData.length > 0) {
        fetch('/api/recetas/auto-link-ingredientes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
          .then(r => r.json())
          .then(({ matches = [] }) => {
            const toApply = matches.filter((m: { confianza: string }) =>
              m.confianza === 'exacto' || m.confianza === 'parcial'
            )
            if (!toApply.length) return
            return fetch('/api/recetas/auto-link-ingredientes', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                links: toApply.map((m: { ingrediente_ids: string[]; producto_id: string }) => ({
                  ingrediente_ids: m.ingrediente_ids,
                  producto_id: m.producto_id,
                })),
              }),
            })
          })
          .then(() => mutate())
          .catch(e => console.warn('[useRecetas] auto-link silencioso:', e))
      }

      return newId
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al agregar receta'
      console.error('[useRecetas] agregarReceta Error:', msg)
      throw new Error(msg)
    }
  }

  async function publicarReceta(id: string) {
    const optimistic = (prev: RecetaConCosto[] | undefined) =>
      (prev ?? []).map(r => r.id === id ? { ...r, status: 'published' } : r)
    try {
      marcarEscrituraPropia(id)
      await mutate(
        async (current) => {
          const { error } = await supabase.from('recetas').update({ status: 'published' }).eq('id', id)
          if (error) throw error
          return optimistic(current)
        },
        { optimisticData: optimistic, revalidate: false, rollbackOnError: true }
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al publicar receta'
      console.error('[useRecetas] publicarReceta Error:', msg)
      throw new Error(msg)
    }
  }

  async function actualizarReceta(id: string, datos: Partial<Omit<Receta, 'id' | 'restaurante_id' | 'ingredientes'>>) {
    const optimistic = (prev: RecetaConCosto[] | undefined) =>
      (prev ?? []).map(r => r.id === id ? conFoodCostRecalculado({ ...r, ...datos }) : r)
    try {
      marcarEscrituraPropia(id)
      await mutate(
        async (current) => {
          const { error } = await supabase.from('recetas').update(datos).eq('id', id)
          if (error) throw error
          return optimistic(current)
        },
        { optimisticData: optimistic, revalidate: false, rollbackOnError: true }
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar receta'
      console.error('[useRecetas] actualizarReceta Error:', msg)
      throw new Error(msg)
    }
  }

  async function eliminarReceta(id: string) {
    const optimistic = (prev: RecetaConCosto[] | undefined) => (prev ?? []).filter(r => r.id !== id)
    try {
      marcarEscrituraPropia(id)
      await mutate(
        async (current) => {
          const { error } = await supabase.from('recetas').update({ activa: false }).eq('id', id)
          if (error) throw error
          return optimistic(current)
        },
        { optimisticData: optimistic, revalidate: false, rollbackOnError: true }
      )
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
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al agregar ingrediente')
      // El endpoint devuelve la fila insertada (con su id real) — evita el
      // refetch completo del recetario que antes hacía falta para enterarse.
      const nuevo = (json.ingredientes?.[0] as Ingrediente | undefined) ?? { ...datos, id: '', receta_id: recetaId } as Ingrediente
      marcarEscrituraPropia(nuevo.id)
      mutate((prev) => (prev ?? []).map(r => {
        if (r.id !== recetaId) return r
        return conFoodCostRecalculado({ ...r, ingredientes: [...(r.ingredientes ?? []), nuevo] })
      }), { revalidate: false })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al agregar ingrediente'
      console.error('[useRecetas] agregarIngrediente Error:', msg)
      throw new Error(msg)
    }
  }

  async function actualizarIngrediente(id: string, datos: Partial<Omit<Ingrediente, 'id' | 'receta_id'>>) {
    const optimistic = (prev: RecetaConCosto[] | undefined) =>
      (prev ?? []).map(r => {
        if (!r.ingredientes?.some(i => i.id === id)) return r
        return conFoodCostRecalculado({ ...r, ingredientes: r.ingredientes.map(i => i.id === id ? { ...i, ...datos } : i) })
      })
    try {
      marcarEscrituraPropia(id)
      await mutate(
        async (current) => {
          const { error } = await supabase.from('ingredientes').update(datos).eq('id', id)
          if (error) throw error
          return optimistic(current)
        },
        { optimisticData: optimistic, revalidate: false, rollbackOnError: true }
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar ingrediente'
      console.error('[useRecetas] actualizarIngrediente Error:', msg)
      throw new Error(msg)
    }
  }

  async function eliminarIngrediente(id: string) {
    const optimistic = (prev: RecetaConCosto[] | undefined) =>
      (prev ?? []).map(r => {
        if (!r.ingredientes?.some(i => i.id === id)) return r
        return conFoodCostRecalculado({ ...r, ingredientes: r.ingredientes.filter(i => i.id !== id) })
      })
    try {
      marcarEscrituraPropia(id)
      await mutate(
        async (current) => {
          const { error } = await supabase.from('ingredientes').delete().eq('id', id)
          if (error) throw error
          return optimistic(current)
        },
        { optimisticData: optimistic, revalidate: false, rollbackOnError: true }
      )
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
