'use client'

import { useEffect, useCallback, useMemo } from 'react'
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

  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const ch = supabase
      .channel(`tareas-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tareas' }, () => mutate())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID, supabase, mutate])

  async function agregarTarea(datos: Omit<Tarea, 'id' | 'restaurante_id' | 'created_at' | 'completed_at'>) {
    try {
      const { data, error } = await supabase.from('tareas').insert({
        ...datos,
        checklist: JSON.stringify(datos.checklist || []),
        restaurante_id: RESTAURANTE_ID,
      }).select('id').single()
      if (error) throw error
      await mutate()
      return data.id as string
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al agregar tarea'
      console.error('[useTareas] agregarTarea Error:', msg)
      throw new Error(msg)
    }
  }

  async function actualizarTarea(id: string, datos: Partial<Omit<Tarea, 'id' | 'restaurante_id'>>) {
    const optimistic = (prev: Tarea[] | undefined) =>
      (prev ?? []).map(t => t.id === id ? { ...t, ...datos } : t)

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
  }

  async function cambiarStatus(id: string, status: Tarea['status']) {
    const completed_at = status === 'completada' ? new Date().toISOString() : null
    const optimistic = (prev: Tarea[] | undefined) =>
      (prev ?? []).map(t => t.id === id ? { ...t, status, completed_at } : t)

    await mutate(
      async (current) => {
        const { error } = await supabase.from('tareas').update({ status, completed_at }).eq('id', id)
        if (error) throw error
        return optimistic(current)
      },
      { optimisticData: optimistic, revalidate: false, rollbackOnError: true }
    )
  }

  async function cambiarEstado(id: string, estado: OpsEstado) {
    const optimistic = (prev: Tarea[] | undefined) =>
      (prev ?? []).map(t => t.id === id ? { ...t, estado } : t)

    await mutate(
      async (current) => {
        const { error } = await supabase.from('tareas').update({ estado }).eq('id', id)
        if (error) throw error
        return optimistic(current)
      },
      { optimisticData: optimistic, revalidate: false, rollbackOnError: true }
    )
  }

  async function toggleChecklistItem(id: string, checklist: ChecklistItemTarea[], itemIdx: number) {
    const updated = checklist.map((c, i) => i === itemIdx ? { ...c, completado: !c.completado } : c)
    await actualizarTarea(id, { checklist: updated })
  }

  async function eliminarTarea(id: string) {
    try {
      const { error } = await supabase.from('tareas').delete().eq('id', id)
      if (error) throw error
      mutate((prev) => prev?.filter(t => t.id !== id), { revalidate: false })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar tarea'
      console.error('[useTareas] eliminarTarea Error:', msg)
      throw new Error(msg)
    }
  }

  return {
    tareas,
    loading,
    error,
    refetch: useCallback(() => { mutate() }, [mutate]),
    agregarTarea,
    actualizarTarea,
    cambiarStatus,
    cambiarEstado,
    toggleChecklistItem,
    eliminarTarea,
  }
}
