'use client'

import { useCallback, useEffect, useState } from 'react'
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

/**
 * ── Persistencia ──────────────────────────────────────────────
 * Enfoque simple para empezar: localStorage por usuario.
 *
 * CAMINO DE MIGRACIÓN a server-side (ver supabase/migrations/onboarding_completed_at.sql):
 *   1. Correr la migración (agrega user_restaurantes.onboarding_completed_at + NOTIFY pgrst).
 *   2. En markDone(): además del localStorage, hacer
 *        await supabase.from('user_restaurantes')
 *          .update({ onboarding_completed_at: new Date().toISOString() })
 *          .eq('user_id', userId).eq('restaurante_id', RESTAURANTE_ID)
 *   3. En isDone(): leer la columna en vez del localStorage (con localStorage como cache opcional).
 */
function doneKey(userId: string) {
  return `onboarding_done_${userId}`
}

export function isOnboardingDone(userId: string | undefined | null): boolean {
  if (!userId || typeof window === 'undefined') return false
  return window.localStorage.getItem(doneKey(userId)) === '1'
}

export function markOnboardingDone(userId: string | undefined | null) {
  if (!userId || typeof window === 'undefined') return
  window.localStorage.setItem(doneKey(userId), '1')
}

export function resetOnboardingDone(userId: string | undefined | null) {
  if (!userId || typeof window === 'undefined') return
  window.localStorage.removeItem(doneKey(userId))
}

export function useOnboardingProgress() {
  const RESTAURANTE_ID = useRestauranteId()
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [stats, setStats] = useState<OnboardingStats>(STATS_VACIAS)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!RESTAURANTE_ID) return
    setLoading(true)
    try {
      const eq = (q: ReturnType<typeof supabase.from>) =>
        q.select('*', { count: 'exact', head: true }).eq('restaurante_id', RESTAURANTE_ID)

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
        supabase.from('recetas').select('*', { count: 'exact', head: true }).eq('restaurante_id', RESTAURANTE_ID).eq('activa', true),
        supabase.from('equipo_miembros').select('*', { count: 'exact', head: true }).eq('restaurante_id', RESTAURANTE_ID).eq('activo', true),
        eq(supabase.from('checklist_rutina')),
        supabase.from('productos').select('*', { count: 'exact', head: true }).eq('restaurante_id', RESTAURANTE_ID).eq('activo', true),
        supabase.from('productos').select('*', { count: 'exact', head: true }).eq('restaurante_id', RESTAURANTE_ID).eq('activo', true).gt('precio_unitario', 0),
        // Plazas reales: distinct plaza desde checklist_secciones
        supabase.from('checklist_secciones').select('plaza').eq('restaurante_id', RESTAURANTE_ID),
        // Food cost promedio: recetas con precio_venta > 0 (aprox liviana)
        supabase.from('recetas').select('precio_venta').eq('restaurante_id', RESTAURANTE_ID).eq('activa', true).gt('precio_venta', 0),
        // Mise configurado: items con cantidad cargada
        supabase.from('checklist_items').select('*', { count: 'exact', head: true }).eq('restaurante_id', RESTAURANTE_ID).gt('cantidad', 0),
        // Turnos de servicio: confirmados cuando la clave existe en configuracion (ver useTurnosServicio)
        supabase.from('restaurantes').select('configuracion').eq('id', RESTAURANTE_ID).single(),
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

      setStats({
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
      })
    } catch {
      setStats(STATS_VACIAS)
    } finally {
      setLoading(false)
    }
  }, [RESTAURANTE_ID, supabase])

  useEffect(() => { refresh() }, [refresh])

  return {
    stats,
    loading,
    refresh,
    userId: user?.id ?? null,
  }
}
