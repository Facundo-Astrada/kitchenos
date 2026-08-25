'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/context'

/**
 * Qué vio ya esta persona: la carta de bienvenida y qué recorridos recorrió.
 *
 * Vive en `equipo_miembros` y no en localStorage (PLAN-ACCESO-Y-USO B4). Los
 * dos disparadores que había — `kc_app_welcomed` y `kc_ops_welcomed` — eran
 * localStorage, así que el cocinero volvía a ver todo en la tablet de la cocina
 * después de haberlo visto en su celular. Además solo cubrían dos pantallas.
 *
 * Sin `miembro_id` no hay nada que mostrar ni dónde guardarlo: la bienvenida
 * habla del puesto asignado, y alguien sin ficha de equipo no tiene puesto.
 * En ese caso el hook queda inerte en vez de caer a localStorage — media
 * persistencia sería peor que ninguna.
 */

const SWR_OPTS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  dedupingInterval: 300_000,
} as const

interface OnboardingRow {
  onboarding_visto_at: string | null
  tours_vistos: string[] | null
}

const SIN_TOURS: string[] = []

async function fetchOnboarding(key: string): Promise<OnboardingRow> {
  const miembroId = key.slice('onboarding-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('equipo_miembros')
    .select('onboarding_visto_at, tours_vistos')
    .eq('id', miembroId)
    .maybeSingle()
  if (error) throw error
  return {
    onboarding_visto_at: data?.onboarding_visto_at ?? null,
    tours_vistos: data?.tours_vistos ?? [],
  }
}

export interface OnboardingPersonal {
  loading: boolean
  /** true = todavía no vio la carta de bienvenida y hay dónde registrarlo. */
  bienvenidaPendiente: boolean
  toursVistos: string[]
  tourVisto: (tour: string) => boolean
  marcarBienvenidaVista: () => Promise<void>
  marcarTourVisto: (tour: string) => Promise<void>
  /** Borra los recorridos vistos (botón "ver de nuevo" en Perfil). */
  resetTours: () => Promise<void>
}

export function useOnboardingPersonal(): OnboardingPersonal {
  const { perfil } = useAuth()
  const miembroId = perfil?.miembro_id ?? null

  const { data, isLoading, mutate } = useSWR(
    miembroId ? `onboarding-${miembroId}` : null,
    fetchOnboarding,
    SWR_OPTS,
  )

  const toursVistos = data?.tours_vistos ?? SIN_TOURS

  const tourVisto = useCallback(
    (tour: string) => toursVistos.includes(tour),
    [toursVistos],
  )

  const marcarBienvenidaVista = useCallback(async () => {
    if (!miembroId) return
    const ahora = new Date().toISOString()
    // Optimista: la carta se cierra en el mismo frame del tap. Si la escritura
    // falla, el próximo login la vuelve a mostrar — es el error barato.
    await mutate(async prev => {
      const supabase = createClient()
      await supabase.from('equipo_miembros')
        .update({ onboarding_visto_at: ahora }).eq('id', miembroId)
      return { ...(prev ?? { tours_vistos: [] }), onboarding_visto_at: ahora } as OnboardingRow
    }, {
      optimisticData: (prev?: OnboardingRow) =>
        ({ ...(prev ?? { tours_vistos: [] }), onboarding_visto_at: ahora }) as OnboardingRow,
      revalidate: false,
    })
  }, [miembroId, mutate])

  const marcarTourVisto = useCallback(async (tour: string) => {
    if (!miembroId || toursVistos.includes(tour)) return
    const next = [...toursVistos, tour]
    await mutate(async prev => {
      const supabase = createClient()
      await supabase.from('equipo_miembros')
        .update({ tours_vistos: next }).eq('id', miembroId)
      return { ...(prev ?? { onboarding_visto_at: null }), tours_vistos: next } as OnboardingRow
    }, {
      optimisticData: (prev?: OnboardingRow) =>
        ({ ...(prev ?? { onboarding_visto_at: null }), tours_vistos: next }) as OnboardingRow,
      revalidate: false,
    })
  }, [miembroId, toursVistos, mutate])

  const resetTours = useCallback(async () => {
    if (!miembroId) return
    await mutate(async prev => {
      const supabase = createClient()
      await supabase.from('equipo_miembros')
        .update({ tours_vistos: [] }).eq('id', miembroId)
      return { ...(prev ?? { onboarding_visto_at: null }), tours_vistos: [] } as OnboardingRow
    }, {
      optimisticData: (prev?: OnboardingRow) =>
        ({ ...(prev ?? { onboarding_visto_at: null }), tours_vistos: [] }) as OnboardingRow,
      revalidate: false,
    })
  }, [miembroId, mutate])

  return {
    loading: isLoading,
    // Sin miembro_id nunca está pendiente: no hay puesto del que hablar.
    bienvenidaPendiente: !!miembroId && !isLoading && !data?.onboarding_visto_at,
    toursVistos,
    tourVisto,
    marcarBienvenidaVista,
    marcarTourVisto,
    resetTours,
  }
}
