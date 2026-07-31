'use client'

import { useEffect, useCallback, useMemo, useRef } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { Tarea, ChecklistItemTarea, OpsEstado } from '@/types'
import { useRestauranteId } from './useRestauranteId'

function parseTarea(t: Record<string, unknown>): Tarea {
  return {
    ...(t as unknown as Tarea),
    checklist: Array.isArray(t.checklist)
      ? t.checklist as ChecklistItemTarea[]
      : typeof t.checklist === 'string' ? JSON.parse(t.checklist as string) : [],
  }
}

// Ventana durante la cual un evento de realtime con un id que acabamos de
// escribir se considera el eco de nuestra propia escritura y se ignora.
const ECO_REALTIME_MS = 5_000

async function fetchTareasData(key: string): Promise<Tarea[]> {
  const rid = key.slice('tareas-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tareas')
    .select('*')
    .eq('restaurante_id', rid)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(t => parseTarea(t as Record<string, unknown>))
}

export function useTareas() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID ? `tareas-${RESTAURANTE_ID}` : null

  const { data: tareas = [], isLoading: loading, error: swrError, mutate } = useSWR(
    swrKey,
    fetchTareasData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 300_000,
      keepPreviousData: true,
    }
  )

  const error = (swrError as Error | null)?.message ?? null

  // Ids escritos por ESTE cliente hace poco. Cada update propio vuelve por
  // realtime, y refetchear ahí solo pisa el optimistic con un round-trip de la
  // tabla entera (cientos de filas) — es lo que se percibía como demora al
  // tildar. Los cambios de OTROS dispositivos sí refetchean (con debounce).
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
    let timer: ReturnType<typeof setTimeout> | null = null
    const ch = supabase
      .channel(`tareas-rt-${RESTAURANTE_ID}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tareas',
          filter: `restaurante_id=eq.${RESTAURANTE_ID}`,
        },
        (payload) => {
          const fila = (payload.new ?? payload.old) as { id?: string } | null
          const id = fila?.id
          if (id) {
            const ts = escriturasPropias.current.get(id)
            if (ts != null && Date.now() - ts < ECO_REALTIME_MS) return
          }
          // Debounce: activar un menú inserta 20+ filas de una → un solo refetch.
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => mutate(), 400)
        },
      )
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(ch)
    }
  }, [RESTAURANTE_ID, supabase, mutate])

  // Todas las funciones CRUD van en useCallback: bajan como props hasta ItemOps,
  // que está memoizado — una referencia nueva por render lo re-renderizaría igual
  // (ver .claude/docs/hooks.md #10).
  const agregarTarea = useCallback(async (datos: Omit<Tarea, 'id' | 'restaurante_id' | 'created_at' | 'completed_at'>) => {
    try {
      const { data, error } = await supabase.from('tareas').insert({
        ...datos,
        checklist: JSON.stringify(datos.checklist || []),
        restaurante_id: RESTAURANTE_ID,
      }).select('id').single()
      if (error) throw error
      marcarEscrituraPropia(data.id as string)
      await mutate()
      return data.id as string
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al agregar tarea'
      console.error('[useTareas] agregarTarea Error:', msg)
      throw new Error(msg)
    }
  }, [supabase, RESTAURANTE_ID, mutate, marcarEscrituraPropia])

  const actualizarTarea = useCallback(async (id: string, datos: Partial<Omit<Tarea, 'id' | 'restaurante_id'>>) => {
    const optimistic = (prev: Tarea[] | undefined) =>
      (prev ?? []).map(t => t.id === id ? { ...t, ...datos } : t)

    marcarEscrituraPropia(id)
    await mutate(
      async (current) => {
        const updateData: Record<string, unknown> = { ...datos }
        if (datos.checklist) updateData.checklist = JSON.stringify(datos.checklist)
        const { error } = await supabase.from('tareas').update(updateData).eq('id', id)
        if (error) throw error
        return optimistic(current)
      },
      { optimisticData: optimistic, revalidate: false, rollbackOnError: true }
    )
  }, [supabase, mutate, marcarEscrituraPropia])

  // `estado` (OpsEstado) es la única fuente de verdad del avance de la tarea.
  // `status` (legacy) y `completed_at` se derivan acá para que cualquier lector
  // legacy (Reportes) quede consistente sin una segunda forma de escribir status.
  const cambiarEstado = useCallback(async (id: string, estado: OpsEstado) => {
    const status = estado === 'listo' ? 'completada' : 'pendiente'
    const completed_at = estado === 'listo' ? new Date().toISOString() : null
    const optimistic = (prev: Tarea[] | undefined) =>
      (prev ?? []).map(t => t.id === id ? { ...t, estado, status, completed_at } : t)

    marcarEscrituraPropia(id)
    await mutate(
      async (current) => {
        const { error } = await supabase.from('tareas').update({ estado, status, completed_at }).eq('id', id)
        if (error) throw error
        return optimistic(current)
      },
      { optimisticData: optimistic, revalidate: false, rollbackOnError: true }
    )
  }, [supabase, mutate, marcarEscrituraPropia])

  const toggleChecklistItem = useCallback(async (id: string, checklist: ChecklistItemTarea[], itemIdx: number) => {
    const updated = checklist.map((c, i) => i === itemIdx ? { ...c, completado: !c.completado } : c)
    await actualizarTarea(id, { checklist: updated })
  }, [actualizarTarea])

  const eliminarTarea = useCallback(async (id: string) => {
    try {
      marcarEscrituraPropia(id)
      const { error } = await supabase.from('tareas').delete().eq('id', id)
      if (error) throw error
      mutate((prev) => prev?.filter(t => t.id !== id), { revalidate: false })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar tarea'
      console.error('[useTareas] eliminarTarea Error:', msg)
      throw new Error(msg)
    }
  }, [supabase, mutate, marcarEscrituraPropia])

  return {
    tareas,
    loading,
    error,
    refetch: useCallback(() => { mutate() }, [mutate]),
    agregarTarea,
    actualizarTarea,
    cambiarEstado,
    toggleChecklistItem,
    eliminarTarea,
  }
}
