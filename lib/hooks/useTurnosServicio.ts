'use client'

import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { TurnoServicio } from '@/types'
import { useRestauranteId } from './useRestauranteId'
import { slugify } from '@/lib/utils'

// Turnos de servicio del restaurante — guardados en restaurantes.configuracion.turnos_servicio
// (JSONB ya existente, sin migración — mismo patrón que plazas_custom, ver
// usePlazasCustom.ts y hooks.md #13/#15a). Definen los bloques horarios
// (almuerzo/cena/...) que resuelven a qué turno pertenece cada registro del
// mise (ver lib/ops/turnos.ts: turnoActivo/encodeTurnoFase).
export const TURNOS_DEFAULT: TurnoServicio[] = [
  { id: 'almuerzo', nombre: 'Almuerzo', desde: '09:00', hasta: '17:00', orden: 1, activo: true },
  { id: 'cena', nombre: 'Cena', desde: '17:00', hasta: '01:30', orden: 2, activo: true },
]

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return fallback
}

async function fetchTurnosServicio(key: string): Promise<TurnoServicio[]> {
  const rid = key.slice('turnos-servicio-'.length)
  const supabase = createClient()
  const { data, error } = await supabase.from('restaurantes').select('configuracion').eq('id', rid).single()
  if (error) throw error
  const cfg = (data?.configuracion ?? {}) as { turnos_servicio?: TurnoServicio[] }
  // Sin clave todavía = restaurante nuevo: devolver los defaults SIN escribirlos
  // (se persisten recién cuando el usuario confirma el paso de onboarding).
  if (!cfg.turnos_servicio) return TURNOS_DEFAULT
  return cfg.turnos_servicio.slice().sort((a, b) => a.orden - b.orden)
}

export function useTurnosServicio() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])
  const swrKey = RESTAURANTE_ID ? `turnos-servicio-${RESTAURANTE_ID}` : null

  const { data: turnos = TURNOS_DEFAULT, isLoading: loading, mutate } = useSWR(swrKey, fetchTurnosServicio, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 300_000,
    keepPreviousData: true,
  })

  const turnosActivos = useMemo(() => turnos.filter(t => t.activo), [turnos])

  // Relee configuracion completa antes de escribir — evita pisar otras
  // claves (plazas_custom, nombres_excluidos, slug, onboarding_step, etc.)
  const leerConfiguracion = useCallback(async (): Promise<Record<string, unknown>> => {
    const { data } = await supabase.from('restaurantes').select('configuracion').eq('id', RESTAURANTE_ID).single()
    return (data?.configuracion ?? {}) as Record<string, unknown>
  }, [supabase, RESTAURANTE_ID])

  const guardarTurnos = useCallback(async (nuevos: TurnoServicio[]) => {
    if (!RESTAURANTE_ID) throw new Error('Sin restaurante')
    const cfg = await leerConfiguracion()
    const { error } = await supabase.from('restaurantes')
      .update({ configuracion: { ...cfg, turnos_servicio: nuevos } }).eq('id', RESTAURANTE_ID)
    if (error) throw error
    await mutate(nuevos, { revalidate: false })
  }, [RESTAURANTE_ID, supabase, leerConfiguracion, mutate])

  // Confirma los defaults tal cual (botón "así está bien" del onboarding) —
  // persiste explícitamente para que isDone() deje de depender del fallback.
  const confirmarDefaults = useCallback(async () => {
    await guardarTurnos(TURNOS_DEFAULT)
  }, [guardarTurnos])

  const agregarTurno = useCallback(async (datos: { nombre: string; desde: string; hasta: string }): Promise<TurnoServicio> => {
    if (!RESTAURANTE_ID) throw new Error('Sin restaurante')
    try {
      const actuales = turnos
      const base = slugify(datos.nombre, 'turno')
      const idsUsados = new Set(actuales.map(t => t.id))
      let id = base
      let i = 2
      while (idsUsados.has(id)) { id = `${base}-${i}`; i++ }
      const nuevo: TurnoServicio = {
        id, nombre: datos.nombre.trim(), desde: datos.desde, hasta: datos.hasta,
        orden: actuales.length, activo: true,
      }
      const nuevosTurnos = [...actuales, nuevo]
      await guardarTurnos(nuevosTurnos)
      return nuevo
    } catch (e) {
      const msg = errMsg(e, 'Error al crear turno')
      console.error('[useTurnosServicio] agregarTurno Error:', msg)
      throw new Error(msg)
    }
  }, [RESTAURANTE_ID, turnos, guardarTurnos])

  const actualizarTurno = useCallback(async (id: string, cambios: Partial<Pick<TurnoServicio, 'nombre' | 'desde' | 'hasta' | 'orden'>>) => {
    try {
      const nuevosTurnos = turnos.map(t => t.id === id ? { ...t, ...cambios } : t)
      await guardarTurnos(nuevosTurnos)
    } catch (e) {
      const msg = errMsg(e, 'Error al actualizar turno')
      console.error('[useTurnosServicio] actualizarTurno Error:', msg)
      throw new Error(msg)
    }
  }, [turnos, guardarTurnos])

  // Un turno NUNCA se borra — se desactiva. Borrarlo dejaría registros
  // históricos (checklist_registros.turno codificado) apuntando a un id
  // inexistente y volvería ilegibles los reportes viejos.
  const desactivarTurno = useCallback(async (id: string) => {
    try {
      const nuevosTurnos = turnos.map(t => t.id === id ? { ...t, activo: false } : t)
      await guardarTurnos(nuevosTurnos)
    } catch (e) {
      const msg = errMsg(e, 'Error al desactivar turno')
      console.error('[useTurnosServicio] desactivarTurno Error:', msg)
      throw new Error(msg)
    }
  }, [turnos, guardarTurnos])

  const reactivarTurno = useCallback(async (id: string) => {
    try {
      const nuevosTurnos = turnos.map(t => t.id === id ? { ...t, activo: true } : t)
      await guardarTurnos(nuevosTurnos)
    } catch (e) {
      const msg = errMsg(e, 'Error al reactivar turno')
      console.error('[useTurnosServicio] reactivarTurno Error:', msg)
      throw new Error(msg)
    }
  }, [turnos, guardarTurnos])

  return {
    turnos, turnosActivos, loading,
    agregarTurno, actualizarTurno, desactivarTurno, reactivarTurno, confirmarDefaults,
  }
}
