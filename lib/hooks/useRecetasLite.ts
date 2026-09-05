'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'

// ══════════════════════════════════════════════════════════════
// RECETAS — versión liviana para OPS.
//
// useRecetas() trae la receta completa con TODOS sus ingredientes y calcula el
// food cost de cada una: en una cuenta real son ~470 recetas + ~2.500
// ingredientes (medio mega de JSON) que Mise y Producción bajaban solo para
// autocompletar un nombre y saber las porciones. Es la descarga más pesada de
// entrar a OPS desde un celular.
//
// Acá se piden únicamente las columnas que OPS usa. De ingredientes solo
// cantidad y unidad, que es lo que necesita el peso por porción que muestra la
// tarjeta del mise cuando la receta no lo tiene cargado en el ítem.
//
// La key SWR es propia (`recetas-lite-…`), así que Mise y Producción comparten
// una sola descarga entre los dos tabs; y no pisa el cache de useRecetas, que
// sigue sirviendo al Recetario y a Carta, donde el food cost sí hace falta.
// ══════════════════════════════════════════════════════════════

export interface RecetaLite {
  id: string
  nombre: string
  porciones: number | null
  vida_util_dias: number | null
  // Solo para detectar receta incompleta (sin texto cargado) — nunca se
  // muestra completo acá, así que un procedimiento largo no pesa lo que
  // pesaría bajar ingredientes+food cost de las ~470 recetas de una cuenta.
  procedimiento: string | null
  ingredientes: { cantidad: number | null; unidad: string | null }[]
}

async function fetchRecetasLite(key: string): Promise<RecetaLite[]> {
  const rid = key.slice('recetas-lite-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('recetas')
    .select('id, nombre, porciones, vida_util_dias, procedimiento, ingredientes!ingredientes_receta_id_fkey(cantidad, unidad)')
    .eq('restaurante_id', rid)
    .eq('activa', true)
    .order('nombre', { ascending: true })
  if (error) throw error
  return (data ?? []).map(r => {
    const row = r as Record<string, unknown>
    return {
      id: row.id as string,
      nombre: (row.nombre as string) ?? '',
      porciones: (row.porciones as number | null) ?? null,
      vida_util_dias: (row.vida_util_dias as number | null) ?? null,
      procedimiento: (row.procedimiento as string | null) ?? null,
      ingredientes: Array.isArray(row.ingredientes)
        ? (row.ingredientes as { cantidad: number | null; unidad: string | null }[])
        : [],
    }
  })
}

export function useRecetasLite() {
  const RESTAURANTE_ID = useRestauranteId()
  const swrKey = RESTAURANTE_ID ? `recetas-lite-${RESTAURANTE_ID}` : null

  const { data: recetas = [], isLoading: loading, error } = useSWR(swrKey, fetchRecetasLite, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 300_000,
    keepPreviousData: true,
  })

  return { recetas, loading, error: (error as Error | null)?.message ?? null }
}
