'use client'

import { useEffect, useMemo, useCallback } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { Mesa } from '@/types'
import { useRestauranteId } from './useRestauranteId'
import { useAuth } from '@/lib/auth/context'

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return fallback
}

async function fetchMesasData(key: string): Promise<Mesa[]> {
  const rid = key.slice('mesas-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('mesas')
    .select('*')
    .eq('restaurante_id', rid)
    .order('sector', { ascending: true })
    .order('numero', { ascending: true })
  if (error) throw error
  return (data ?? []) as Mesa[]
}

export function useMesas() {
  const RESTAURANTE_ID = useRestauranteId()
  const { perfil } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const swrKey = RESTAURANTE_ID ? `mesas-${RESTAURANTE_ID}` : null

  const { data: mesas = [], isLoading: loading, error: swrError, mutate } = useSWR(
    swrKey,
    fetchMesasData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 60_000,
      keepPreviousData: true,
    }
  )

  const error = (swrError as Error | null)?.message ?? null

  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const ch = supabase
      .channel(`mesas-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mesas', filter: `restaurante_id=eq.${RESTAURANTE_ID}` }, () => mutate())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID, supabase, mutate])

  /** Devuelve la cuenta abierta de la mesa, o crea una nueva (y marca la mesa 'ocupada'). */
  async function abrirCuenta(mesaId: string): Promise<string> {
    try {
      const { data: existente, error: findError } = await supabase
        .from('cuentas')
        .select('id')
        .eq('mesa_id', mesaId)
        .eq('estado', 'abierta')
        .maybeSingle()
      if (findError) throw findError

      let cuentaId = existente?.id as string | undefined

      if (!cuentaId) {
        const { data, error } = await supabase
          .from('cuentas')
          .insert({
            restaurante_id: RESTAURANTE_ID,
            mesa_id: mesaId,
            estado: 'abierta',
            mozo_id: perfil?.miembro_id ?? null,
          })
          .select('id')
          .single()

        if (error?.code === '23505') {
          // Candado UNIQUE en DB (migración 20260831b): otra apertura ganó
          // la carrera entre el SELECT y el INSERT (doble tap, dos
          // dispositivos en la misma mesa) — usar la cuenta ganadora en vez
          // de duplicar.
          const { data: ganadora, error: refindError } = await supabase
            .from('cuentas')
            .select('id')
            .eq('mesa_id', mesaId)
            .eq('estado', 'abierta')
            .single()
          if (refindError) throw refindError
          cuentaId = ganadora.id as string
        } else if (error) {
          throw error
        } else {
          cuentaId = data.id as string
        }
      }

      const { error: mesaError } = await supabase.from('mesas').update({ estado: 'ocupada' }).eq('id', mesaId)
      if (mesaError) throw mesaError

      await mutate()
      return cuentaId as string
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al abrir cuenta'))
    }
  }

  async function liberarMesa(mesaId: string) {
    try {
      const { error } = await supabase.from('mesas').update({ estado: 'libre' }).eq('id', mesaId)
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al liberar mesa'))
    }
  }

  // ── Editor de mesas tipo canvas (jul 2026, Sesión 3 C3) ──
  type MesaDatos = { numero: string; sector: string | null; capacidad: number | null; forma: string; ancho: number; alto: number; rotacion: number; pos_x: number; pos_y: number; color?: string | null }

  async function crearMesa(datos: MesaDatos): Promise<string> {
    try {
      const { data, error } = await supabase.from('mesas').insert({
        ...datos, restaurante_id: RESTAURANTE_ID, estado: 'libre',
      }).select('id').single()
      if (error) throw error
      await mutate()
      return data.id as string
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al crear mesa'))
    }
  }

  async function actualizarMesa(id: string, datos: Partial<MesaDatos>) {
    // Optimista: pinta el cambio en el cache SWR antes de ir a DB (evita el "snap-back" al soltar)
    mutate(prev => (prev ?? []).map(m => m.id === id ? { ...m, ...datos } as Mesa : m), { revalidate: false })
    try {
      const { error } = await supabase.from('mesas').update(datos).eq('id', id)
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      await mutate() // revert al estado real de DB
      throw new Error(errMsg(e, 'Error al actualizar mesa'))
    }
  }

  async function eliminarMesa(id: string) {
    try {
      const { error } = await supabase.from('mesas').delete().eq('id', id)
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al eliminar mesa'))
    }
  }

  /** Guardado batch de posición/tamaño/rotación al soltar en el canvas — sin modal por drag. */
  async function guardarLayout(cambios: { id: string; pos_x: number; pos_y: number; ancho?: number; alto?: number; rotacion?: number }[]) {
    // Optimista: aplica los cambios al cache antes del round-trip (drag fluido, sin snap-back)
    const porId = new Map(cambios.map(c => [c.id, c]))
    mutate(prev => (prev ?? []).map(m => {
      const c = porId.get(m.id)
      return c ? { ...m, ...c } as Mesa : m
    }), { revalidate: false })
    try {
      await Promise.all(cambios.map(({ id, ...datos }) =>
        supabase.from('mesas').update(datos).eq('id', id).then(({ error }) => { if (error) throw error })
      ))
      await mutate()
    } catch (e: unknown) {
      await mutate() // revert al estado real de DB
      throw new Error(errMsg(e, 'Error al guardar la posición de las mesas'))
    }
  }

  return {
    mesas,
    loading,
    error,
    refetch: useCallback(() => { mutate() }, [mutate]),
    abrirCuenta,
    liberarMesa,
    crearMesa,
    actualizarMesa,
    eliminarMesa,
    guardarLayout,
  }
}
