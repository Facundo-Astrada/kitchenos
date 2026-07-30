'use client'

import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { PlazaCustom } from '@/types'
import { useRestauranteId } from './useRestauranteId'
import { slugify } from '@/lib/utils'

// Plazas custom del restaurante — guardadas en restaurantes.configuracion.plazas_custom
// (JSONB ya existente, sin migración) en vez de una tabla nueva: el acceso DDL
// (MCP + management token) está caído (ver hooks.md #13), y esta columna ya
// soporta lectura/escritura desde el browser client (mismo patrón que
// nombres_excluidos en facturas/page.tsx). Además de las 6 plazas fijas
// (PLAZAS_FIJAS en lib/constants.ts), el usuario puede crear plazas propias
// (ej. para un evento) que funcionan en Mesa de Trabajo, Mise, OPS Panel,
// Pase y Reportes — y borrarlas del todo cuando ya no las necesita.

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return fallback
}

async function fetchPlazasCustom(key: string): Promise<PlazaCustom[]> {
  const rid = key.slice('plazas-custom-'.length)
  const supabase = createClient()
  const { data, error } = await supabase.from('restaurantes').select('configuracion').eq('id', rid).single()
  if (error) throw error
  const cfg = (data?.configuracion ?? {}) as { plazas_custom?: PlazaCustom[] }
  return (cfg.plazas_custom ?? []).slice().sort((a, b) => a.orden - b.orden)
}

export function usePlazasCustom() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])
  const swrKey = RESTAURANTE_ID ? `plazas-custom-${RESTAURANTE_ID}` : null

  const { data: plazasCustom = [], isLoading: loading, mutate } = useSWR(swrKey, fetchPlazasCustom, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 300_000,
    keepPreviousData: true,
  })

  // Relee configuracion completa antes de escribir — evita pisar otras
  // claves (nombres_excluidos, slug, onboarding_step, etc.)
  const leerConfiguracion = useCallback(async (): Promise<Record<string, unknown>> => {
    const { data } = await supabase.from('restaurantes').select('configuracion').eq('id', RESTAURANTE_ID).single()
    return (data?.configuracion ?? {}) as Record<string, unknown>
  }, [supabase, RESTAURANTE_ID])

  const agregarPlazaCustom = useCallback(async (datos: { nombre: string; icono: string; color?: string }): Promise<PlazaCustom> => {
    if (!RESTAURANTE_ID) throw new Error('Sin restaurante')
    try {
      const cfg = await leerConfiguracion()
      const actuales = (cfg.plazas_custom as PlazaCustom[] | undefined) ?? []
      const base = slugify(datos.nombre, 'plaza')
      const keysUsadas = new Set(actuales.map(p => p.key))
      let key = base
      let i = 2
      while (keysUsadas.has(key)) { key = `${base}-${i}`; i++ }
      const nueva: PlazaCustom = {
        key, nombre: datos.nombre.trim(), icono: datos.icono,
        color: datos.color ?? '#6b7280', orden: actuales.length,
      }
      const nuevasPlazas = [...actuales, nueva]
      const { error } = await supabase.from('restaurantes')
        .update({ configuracion: { ...cfg, plazas_custom: nuevasPlazas } }).eq('id', RESTAURANTE_ID)
      if (error) throw error
      await mutate()
      return nueva
    } catch (e) {
      const msg = errMsg(e, 'Error al crear plaza')
      console.error('[usePlazasCustom] agregarPlazaCustom Error:', msg)
      throw new Error(msg)
    }
  }, [RESTAURANTE_ID, supabase, leerConfiguracion, mutate])

  // Borra la plaza custom por completo (a diferencia de "quitar" una plaza
  // fija de un espacio, que solo desvincula): secciones y producción del
  // mise que tenía, su vínculo con cualquier espacio, y la plaza en sí.
  const eliminarPlazaCustom = useCallback(async (key: string) => {
    if (!RESTAURANTE_ID) throw new Error('Sin restaurante')
    try {
      await supabase.from('checklist_items').delete().eq('restaurante_id', RESTAURANTE_ID).eq('plaza', key)
      await supabase.from('checklist_secciones').delete().eq('restaurante_id', RESTAURANTE_ID).eq('plaza', key)
      await supabase.from('espacio_plazas').delete().eq('restaurante_id', RESTAURANTE_ID).eq('plaza_key', key)
      const cfg = await leerConfiguracion()
      const actuales = (cfg.plazas_custom as PlazaCustom[] | undefined) ?? []
      const restantes = actuales.filter(p => p.key !== key)
      const { error } = await supabase.from('restaurantes')
        .update({ configuracion: { ...cfg, plazas_custom: restantes } }).eq('id', RESTAURANTE_ID)
      if (error) throw error
      await mutate()
    } catch (e) {
      const msg = errMsg(e, 'Error al eliminar plaza')
      console.error('[usePlazasCustom] eliminarPlazaCustom Error:', msg)
      throw new Error(msg)
    }
  }, [RESTAURANTE_ID, supabase, leerConfiguracion, mutate])

  return { plazasCustom, loading, agregarPlazaCustom, eliminarPlazaCustom }
}
