'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/context'
import { useRestauranteId } from './useRestauranteId'

/**
 * Estado de cada paso. Un paso arranca en 'done' si ya se detecta data real.
 * (ej: ya hay plazas configuradas → el paso de plazas está done).
 */
export type StepState = 'pending' | 'done'
export type OnboardingProgress = Record<number, StepState>

/**
 * Métricas de interés que se muestran en cada card del onboarding.
 * Todas se calculan con counts/agregados livianos (head queries).
 */
export interface OnboardingStats {
  carta: number
  recetas: number
  foodCostPromedio: number | null   // % promedio sobre recetas con precio_venta + costo
  plazas: number
  miembros: number
  productos: number
  productosConPrecio: number
  pctProductosConPrecio: number     // 0..100
  rutinas: number
  miseConfigurados: number          // checklist_items con cantidad asignada
  turnosConfigurados: boolean       // existe restaurantes.configuracion.turnos_servicio
}

const STATS_VACIAS: OnboardingStats = {
  carta: 0, recetas: 0, foodCostPromedio: null, plazas: 0, miembros: 0,
  productos: 0, productosConPrecio: 0, pctProductosConPrecio: 0,
  rutinas: 0, miseConfigurados: 0, turnosConfigurados: false,
}

const SWR_OPTS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  dedupingInterval: 15_000,
} as const

async function fetchStats(key: string): Promise<OnboardingStats> {
  const restauranteId = key.slice('onboarding-progress-'.length)
  const supabase = createClient()
  const eq = (q: ReturnType<typeof supabase.from>) =>
    q.select('*', { count: 'exact', head: true }).eq('restaurante_id', restauranteId)

  const [
    cartaRes,
    recetasRes,
    miembrosRes,
    rutinasRes,
    productosRes,
    productosPrecioRes,
    seccionesRes,
    recetasCostoRes,
    miseRes,
    restauranteRes,
  ] = await Promise.all([
    eq(supabase.from('carta_items')),
    supabase.from('recetas').select('*', { count: 'exact', head: true }).eq('restaurante_id', restauranteId).eq('activa', true),
    supabase.from('equipo_miembros').select('*', { count: 'exact', head: true }).eq('restaurante_id', restauranteId).eq('activo', true),
    eq(supabase.from('checklist_rutina')),
    supabase.from('productos').select('*', { count: 'exact', head: true }).eq('restaurante_id', restauranteId).eq('activo', true),
    supabase.from('productos').select('*', { count: 'exact', head: true }).eq('restaurante_id', restauranteId).eq('activo', true).gt('precio_unitario', 0),
    // Plazas reales: distinct plaza desde checklist_secciones
    supabase.from('checklist_secciones').select('plaza').eq('restaurante_id', restauranteId),
    // Food cost promedio: recetas con precio_venta > 0 (aprox liviana)
    supabase.from('recetas').select('precio_venta').eq('restaurante_id', restauranteId).eq('activa', true).gt('precio_venta', 0),
    // Mise configurado: items con cantidad cargada
    supabase.from('checklist_items').select('*', { count: 'exact', head: true }).eq('restaurante_id', restauranteId).gt('cantidad', 0),
    // Turnos de servicio: confirmados cuando la clave existe en configuracion (ver useTurnosServicio)
    supabase.from('restaurantes').select('configuracion').eq('id', restauranteId).single(),
  ])

  const plazasSet = new Set<string>()
  for (const row of (seccionesRes.data ?? [])) {
    const p = (row as { plaza?: string | null }).plaza
    if (p) plazasSet.add(p)
  }

  // Food cost promedio: el cálculo fino (costo de ingredientes vs precio_venta)
  // vive en /recetario. Acá solo orientamos: dejamos null para no mostrar un
  // número que pueda confundir durante el setup. Hook listo para llenarlo si
  // se quiere computar el promedio real más adelante.
  void recetasCostoRes
  const foodCostPromedio: number | null = null

  const productos = productosRes.count ?? 0
  const productosConPrecio = productosPrecioRes.count ?? 0
  const cfg = (restauranteRes.data?.configuracion ?? {}) as { turnos_servicio?: unknown }

  return {
    carta: cartaRes.count ?? 0,
    recetas: recetasRes.count ?? 0,
    foodCostPromedio,
    plazas: plazasSet.size,
    miembros: miembrosRes.count ?? 0,
    productos,
    productosConPrecio,
    pctProductosConPrecio: productos > 0 ? Math.round((productosConPrecio / productos) * 100) : 0,
    rutinas: rutinasRes.count ?? 0,
    miseConfigurados: miseRes.count ?? 0,
    turnosConfigurados: Array.isArray(cfg.turnos_servicio),
  }
}

export function useOnboardingProgress() {
  const RESTAURANTE_ID = useRestauranteId()
  const { user } = useAuth()

  const { data, isLoading, mutate } = useSWR(
    RESTAURANTE_ID ? `onboarding-progress-${RESTAURANTE_ID}` : null,
    fetchStats,
    SWR_OPTS,
  )

  const refresh = useCallback(async () => { await mutate() }, [mutate])

  return {
    stats: data ?? STATS_VACIAS,
    loading: isLoading,
    refresh,
    userId: user?.id ?? null,
  }
}
