'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import type { EventoItem, EventoItemStatus } from '@/types'

export function useEventoItems() {
  const RESTAURANTE_ID = useRestauranteId()
  const [supabase] = useState(() => createClient())
  const [items, setItems] = useState<EventoItem[]>([])
  const [loading, setLoading] = useState(true)

  // ── Fetch items del día ──────────────────────────────────
  const fetchEventoItems = useCallback(async (fecha: string) => {
    if (!RESTAURANTE_ID) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('evento_items')
        .select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .eq('fecha', fecha)
        .order('evento_nombre')
        .order('created_at', { ascending: true })
      if (error) throw error
      setItems(data ?? [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar eventos'
      console.error('[useEventoItems] fetchEventoItems Error:', msg)
    } finally {
      setLoading(false)
    }
  }, [RESTAURANTE_ID, supabase])

  // ── Crear item ───────────────────────────────────────────
  const crearEventoItem = useCallback(async (
    item: Omit<EventoItem, 'id' | 'restaurante_id' | 'created_at'>
  ) => {
    if (!RESTAURANTE_ID) return
    try {
      const { error } = await supabase
        .from('evento_items')
        .insert({ ...item, restaurante_id: RESTAURANTE_ID })
      if (error) throw error
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al crear evento'
      console.error('[useEventoItems] crearEventoItem Error:', msg)
      throw new Error(msg)
    }
  }, [RESTAURANTE_ID, supabase])

  // ── Update status ────────────────────────────────────────
  const updateStatus = useCallback(async (id: string, status: EventoItemStatus) => {
    try {
      const { error } = await supabase
        .from('evento_items')
        .update({ status })
        .eq('id', id)
      if (error) throw error
      // Optimistic update
      setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar estado'
      console.error('[useEventoItems] updateStatus Error:', msg)
      throw new Error(msg)
    }
  }, [supabase])

  // ── Eliminar item ────────────────────────────────────────
  const eliminarEventoItem = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('evento_items')
        .delete()
        .eq('id', id)
      if (error) throw error
      setItems(prev => prev.filter(i => i.id !== id))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar evento'
      console.error('[useEventoItems] eliminarEventoItem Error:', msg)
      throw new Error(msg)
    }
  }, [supabase])

  // ── Cargar el día de hoy al montar ───────────────────────
  const hoy = new Date().toISOString().split('T')[0]
  useEffect(() => {
    fetchEventoItems(hoy)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [RESTAURANTE_ID])

  return {
    items,
    loading,
    fetchEventoItems,
    crearEventoItem,
    updateStatus,
    eliminarEventoItem,
  }
}
