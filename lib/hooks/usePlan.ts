'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import { PLAN_MODULOS, type Plan } from '@/lib/planes'
import type { ModuloId } from '@/lib/constants'

function planKey(rid: string) { return `restaurante-plan-${rid}` }

async function fetchPlan(key: string): Promise<Plan | null> {
  const rid = key.slice('restaurante-plan-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('restaurantes').select('plan').eq('id', rid).maybeSingle()
  if (error) throw error
  return (data?.plan as Plan | null) ?? null
}

interface PlanState {
  plan: Plan | null
  loading: boolean
  /**
   * true si el modulo esta incluido en el plan. Sin plan asignado (null,
   * el estado de TODAS las cuentas hoy — decision 003: nadie paga todavia)
   * no bloquea nada: mismo criterio que `moduloEnPerfil` en usePermisos.ts,
   * que devuelve true para todo cuando `perfilRestaurante` es null.
   */
  puedeUsar: (modulo: ModuloId) => boolean
}

/**
 * Plan comercial del restaurante — decision de negocio 006. Este hook expone
 * el dato y la pregunta "¿el plan incluye este modulo?"; no gatea ninguna
 * pantalla por si solo. Cablear `puedeUsar` a una ruta es un paso aparte
 * (ver PENDIENTES.md § Roadmap: Planes y cobro → Feature gating), a
 * propósito separado de este hook para poder introducirlo sin romper el
 * acceso de cuentas existentes el mismo día.
 */
export function usePlan(): PlanState {
  const restauranteId = useRestauranteId()
  const swrKey = restauranteId ? planKey(restauranteId) : null

  const { data, isLoading } = useSWR(swrKey, fetchPlan, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 300_000,
    keepPreviousData: true,
  })

  const plan = data ?? null

  const puedeUsar = useCallback((modulo: ModuloId): boolean => {
    if (plan === null) return true
    return PLAN_MODULOS[plan].includes(modulo)
  }, [plan])

  return { plan, loading: isLoading, puedeUsar }
}
