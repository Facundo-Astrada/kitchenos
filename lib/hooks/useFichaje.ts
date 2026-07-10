'use client'

import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import { useAuth } from '@/lib/auth/context'

export interface FichajeDia {
  id: string
  restaurante_id: string
  usuario_id: string
  fecha: string
  entrada: string | null
  salida: string | null
  horas_total: number | null
  editado_por: string | null
  editado_at: string | null
}

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return fallback
}

function hoyISO(): string { return new Date().toISOString().slice(0, 10) }

async function fetchFichajeAbierto([, restauranteId, userId, fecha]: [string, string, string, string]): Promise<FichajeDia | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('turnos_personal').select('*')
    .eq('restaurante_id', restauranteId)
    .eq('usuario_id', userId)
    .eq('fecha', fecha)
    .is('salida', null)
    .order('entrada', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as FichajeDia | null
}

export function useFichaje() {
  const RESTAURANTE_ID = useRestauranteId()
  const { user, perfil } = useAuth()
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID && user?.id ? ['fichaje-abierto', RESTAURANTE_ID, user.id, hoyISO()] as const : null
  const { data: fichajeAbierto = null, isLoading: loading, mutate } = useSWR(swrKey, fetchFichajeAbierto, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  })

  const marcarEntrada = useCallback(async (): Promise<FichajeDia> => {
    if (!RESTAURANTE_ID || !user?.id) throw new Error('Sesión no cargada')
    try {
      const { data, error } = await supabase.from('turnos_personal').insert({
        restaurante_id: RESTAURANTE_ID,
        usuario_id: user.id,
        fecha: hoyISO(),
        entrada: new Date().toISOString(),
      }).select().single()
      if (error) throw error
      await mutate(data as FichajeDia)
      return data as FichajeDia
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al fichar entrada'))
    }
  }, [RESTAURANTE_ID, user?.id, supabase, mutate])

  const marcarSalida = useCallback(async (fichaje: FichajeDia): Promise<void> => {
    try {
      // horas_total es columna GENERATED ALWAYS (salida - entrada) — no se manda en el payload
      const { error } = await supabase.from('turnos_personal').update({
        salida: new Date().toISOString(),
      }).eq('id', fichaje.id)
      if (error) throw error
      await mutate(null)
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al fichar salida'))
    }
  }, [supabase, mutate])

  // ── Admin: quién está adentro ahora mismo, en todo el restaurante ──
  const fetchQuienEstaAdentro = useCallback(async (): Promise<(FichajeDia & { nombre: string })[]> => {
    if (!RESTAURANTE_ID) return []
    const { data: abiertos, error } = await supabase
      .from('turnos_personal').select('*')
      .eq('restaurante_id', RESTAURANTE_ID)
      .eq('fecha', hoyISO())
      .is('salida', null)
      .not('entrada', 'is', null)
    if (error) throw new Error(errMsg(error, 'Error al cargar quién está adentro'))
    const rows = (abiertos ?? []) as FichajeDia[]
    if (!rows.length) return []

    const { data: miembros } = await supabase
      .from('equipo_miembros').select('auth_user_id, nombre, apellido')
      .eq('restaurante_id', RESTAURANTE_ID)
      .in('auth_user_id', rows.map(r => r.usuario_id))
    const nombreMap = new Map((miembros ?? []).map((m: { auth_user_id: string | null; nombre: string; apellido: string }) => [m.auth_user_id, `${m.nombre} ${m.apellido}`.trim()]))

    return rows.map(r => ({ ...r, nombre: nombreMap.get(r.usuario_id) ?? 'Desconocido' }))
  }, [RESTAURANTE_ID, supabase])

  // ── Historial de fichajes de un usuario en un rango de fechas ──
  const fetchHistorial = useCallback(async (usuarioId: string, desde: string, hasta: string): Promise<FichajeDia[]> => {
    if (!RESTAURANTE_ID) return []
    const { data, error } = await supabase
      .from('turnos_personal').select('*')
      .eq('restaurante_id', RESTAURANTE_ID)
      .eq('usuario_id', usuarioId)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })
    if (error) throw new Error(errMsg(error, 'Error al cargar el historial de fichajes'))
    return (data ?? []) as FichajeDia[]
  }, [RESTAURANTE_ID, supabase])

  // ── Edición manual (solo admin, con auditoría) ──
  const guardarFichajeManual = useCallback(async (params: {
    id?: string
    usuarioId: string
    fecha: string
    entrada: string | null   // ISO datetime completo
    salida: string | null
  }): Promise<void> => {
    if (!RESTAURANTE_ID) throw new Error('Sin restaurante')
    // horas_total es columna GENERATED ALWAYS (salida - entrada) — no se manda en el payload
    const editado_por = perfil?.miembro_id ?? null
    const editado_at = new Date().toISOString()
    try {
      if (params.id) {
        const { error } = await supabase.from('turnos_personal').update({
          entrada: params.entrada, salida: params.salida, editado_por, editado_at,
        }).eq('id', params.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('turnos_personal').insert({
          restaurante_id: RESTAURANTE_ID, usuario_id: params.usuarioId, fecha: params.fecha,
          entrada: params.entrada, salida: params.salida, editado_por, editado_at,
        })
        if (error) throw error
      }
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al guardar el fichaje'))
    }
  }, [RESTAURANTE_ID, perfil, supabase])

  return {
    fichajeAbierto, loading,
    marcarEntrada, marcarSalida,
    fetchQuienEstaAdentro, fetchHistorial, guardarFichajeManual,
    refetch: mutate,
  }
}
