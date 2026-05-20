'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type {
  MisePlaceItem, MisePlaceRegistro, ChecklistSeccionConfig,
  ChecklistRutina, ChecklistRutinaRegistro,
  Plaza, MisePrioridad, RutinaFrecuencia,
} from '@/types'
import { useRestauranteId } from './useRestauranteId'

interface ChecklistConfig {
  secciones: ChecklistSeccionConfig[]
  items: MisePlaceItem[]
  rutinas: ChecklistRutina[]
}

async function fetchChecklistConfig(key: string): Promise<ChecklistConfig> {
  const rid = key.slice('checklist-config-'.length)
  const supabase = createClient()
  const [secRes, itemRes, rutRes] = await Promise.all([
    supabase.from('checklist_secciones').select('*').eq('restaurante_id', rid).order('orden', { ascending: true }),
    supabase.from('checklist_items').select('*').eq('restaurante_id', rid).order('orden', { ascending: true }),
    supabase.from('checklist_rutina').select('*').eq('restaurante_id', rid).order('orden', { ascending: true }),
  ])
  if (secRes.error) throw secRes.error
  if (itemRes.error) throw itemRes.error
  if (rutRes.error) throw rutRes.error
  return {
    secciones: (secRes.data ?? []) as ChecklistSeccionConfig[],
    items: (itemRes.data ?? []) as MisePlaceItem[],
    rutinas: (rutRes.data ?? []) as ChecklistRutina[],
  }
}

export function useChecklist() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  // ── SWR: datos estáticos (secciones, items, rutinas) ──
  const swrKey = RESTAURANTE_ID ? `checklist-config-${RESTAURANTE_ID}` : null

  const { data: config, isLoading: configLoading, mutate: mutateConfig } = useSWR(
    swrKey,
    fetchChecklistConfig,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 300_000,
      keepPreviousData: true,
    }
  )

  const secciones = config?.secciones ?? []
  const items = config?.items ?? []
  const rutinas = config?.rutinas ?? []

  // ── Estado dinámico (registros dependen de fecha/turno) ──
  const [registros, setRegistros] = useState<MisePlaceRegistro[]>([])
  const [rutinaRegistros, setRutinaRegistros] = useState<ChecklistRutinaRegistro[]>([])
  const [dynamicLoading, setDynamicLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loading = configLoading || dynamicLoading

  // Realtime para datos estáticos
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const ch = supabase.channel(`checklist-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_secciones' }, () => mutateConfig())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_items' }, () => mutateConfig())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_rutina' }, () => mutateConfig())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID, supabase, mutateConfig])

  const fetchRegistros = useCallback(async (fecha: string, turno: string) => {
    if (!RESTAURANTE_ID) { setRegistros([]); return }
    try {
      const { data: itemsData, error: itemsErr } = await supabase.from('checklist_items').select('id')
        .eq('restaurante_id', RESTAURANTE_ID)
      if (itemsErr) throw itemsErr
      const itemIds = (itemsData ?? []).map((i: { id: string }) => i.id)
      if (itemIds.length === 0) { setRegistros([]); return }
      const { data, error: regErr } = await supabase.from('checklist_registros').select('*')
        .eq('fecha', fecha).eq('turno', turno)
        .in('checklist_item_id', itemIds)
      if (regErr) throw regErr
      setRegistros((data ?? []) as MisePlaceRegistro[])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar registros del checklist'
      console.error('[useChecklist] fetchRegistros Error:', msg)
      setError(msg)
    }
  }, [RESTAURANTE_ID, supabase])

  const fetchRutinaRegistros = useCallback(async (fecha: string) => {
    if (!RESTAURANTE_ID) { setRutinaRegistros([]); return }
    try {
      const { data: rutinasData, error: rutErr } = await supabase.from('checklist_rutina').select('id')
        .eq('restaurante_id', RESTAURANTE_ID)
      if (rutErr) throw rutErr
      const rutinaIds = (rutinasData ?? []).map((r: { id: string }) => r.id)
      if (rutinaIds.length === 0) { setRutinaRegistros([]); return }
      const { data, error: regErr } = await supabase.from('checklist_rutina_registros').select('*')
        .eq('fecha', fecha)
        .in('rutina_id', rutinaIds)
      if (regErr) throw regErr
      setRutinaRegistros((data ?? []) as ChecklistRutinaRegistro[])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar registros de rutinas'
      console.error('[useChecklist] fetchRutinaRegistros Error:', msg)
      setError(msg)
    }
  }, [RESTAURANTE_ID, supabase])

  const fetchAll = useCallback(async (fecha: string, turno: string) => {
    setDynamicLoading(true)
    setError(null)
    try {
      await Promise.all([
        mutateConfig(),       // SWR: usa caché si está vigente, revalida si no
        fetchRegistros(fecha, turno),
        fetchRutinaRegistros(fecha),
      ])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar datos del checklist'
      console.error('[useChecklist] fetchAll Error:', msg)
      setError(msg)
    } finally {
      setDynamicLoading(false)
    }
  }, [mutateConfig, fetchRegistros, fetchRutinaRegistros])

  // ── Secciones CRUD ──
  async function agregarSeccion(datos: { nombre: string; icono: string; orden: number; plaza: Plaza }) {
    try {
      const { data, error } = await supabase.from('checklist_secciones').insert({
        ...datos, restaurante_id: RESTAURANTE_ID,
      }).select('id').single()
      if (error) throw error
      await mutateConfig()
      return data.id as string
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al agregar sección'
      console.error('[useChecklist] agregarSeccion Error:', msg)
      throw new Error(msg)
    }
  }

  async function actualizarSeccion(id: string, datos: Partial<{ nombre: string; icono: string; orden: number }>) {
    try {
      const { error } = await supabase.from('checklist_secciones').update(datos).eq('id', id)
      if (error) throw error
      await mutateConfig()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar sección'
      console.error('[useChecklist] actualizarSeccion Error:', msg)
      throw new Error(msg)
    }
  }

  async function eliminarSeccion(id: string) {
    try {
      const { error } = await supabase.from('checklist_secciones').delete().eq('id', id)
      if (error) throw error
      await mutateConfig()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar sección'
      console.error('[useChecklist] eliminarSeccion Error:', msg)
      throw new Error(msg)
    }
  }

  async function reordenarSecciones(updates: { id: string; orden: number }[]) {
    try {
      for (const u of updates) {
        const { error } = await supabase.from('checklist_secciones').update({ orden: u.orden }).eq('id', u.id)
        if (error) throw error
      }
      await mutateConfig()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al reordenar secciones'
      console.error('[useChecklist] reordenarSecciones Error:', msg)
      throw new Error(msg)
    }
  }

  // ── Items CRUD ──
  async function agregarItem(datos: {
    plaza: Plaza; seccion_id: string; nombre: string; cantidad: number
    unidad: string; prioridad: MisePrioridad; ubicacion?: string; receta_id?: string; orden?: number
  }) {
    try {
      const { data, error } = await supabase.from('checklist_items').insert({
        ...datos, ubicacion: datos.ubicacion || null, receta_id: datos.receta_id || null,
        orden: datos.orden ?? 0, restaurante_id: RESTAURANTE_ID,
      }).select('id').single()
      if (error) throw error
      await mutateConfig()
      return data.id as string
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al agregar item'
      console.error('[useChecklist] agregarItem Error:', msg)
      throw new Error(msg)
    }
  }

  async function actualizarItem(id: string, datos: Partial<{ prioridad: MisePrioridad; nombre: string; cantidad: number; unidad: string; ubicacion: string | null }>) {
    mutateConfig(
      (prev) => prev ? { ...prev, items: prev.items.map(i => i.id === id ? { ...i, ...datos } : i) } : prev,
      { revalidate: false }
    )
    try {
      const { error } = await supabase.from('checklist_items').update(datos).eq('id', id)
      if (error) throw error
    } catch (e: unknown) {
      await mutateConfig() // rollback via re-fetch
      const msg = e instanceof Error ? e.message : 'Error al actualizar item'
      console.error('[useChecklist] actualizarItem Error:', msg)
      throw new Error(msg)
    }
  }

  async function eliminarItem(id: string) {
    try {
      const { error } = await supabase.from('checklist_items').delete().eq('id', id)
      if (error) throw error
      await mutateConfig()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar item'
      console.error('[useChecklist] eliminarItem Error:', msg)
      throw new Error(msg)
    }
  }

  // ── Registros ──
  async function upsertRegistro(itemId: string, fecha: string, turno: string, datos: { completado?: boolean; cantidad_actual?: number | null }) {
    try {
      const { error } = await supabase.from('checklist_registros').upsert({
        checklist_item_id: itemId, fecha, turno, ...datos,
      }, { onConflict: 'checklist_item_id,fecha,turno' })
      if (error) throw error
      await fetchRegistros(fecha, turno)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al guardar registro'
      console.error('[useChecklist] upsertRegistro Error:', msg)
      throw new Error(msg)
    }
  }

  // ── Rutinas CRUD ──
  async function agregarRutina(datos: { nombre: string; plaza: Plaza; frecuencia: RutinaFrecuencia; orden?: number }) {
    try {
      const { error } = await supabase.from('checklist_rutina').insert({
        ...datos, orden: datos.orden ?? 0, restaurante_id: RESTAURANTE_ID,
      })
      if (error) throw error
      await mutateConfig()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al agregar rutina'
      console.error('[useChecklist] agregarRutina Error:', msg)
      throw new Error(msg)
    }
  }

  async function eliminarRutina(id: string) {
    try {
      const { error } = await supabase.from('checklist_rutina').delete().eq('id', id)
      if (error) throw error
      await mutateConfig()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar rutina'
      console.error('[useChecklist] eliminarRutina Error:', msg)
      throw new Error(msg)
    }
  }

  async function toggleRutina(rutinaId: string, fecha: string, completado: boolean) {
    try {
      if (completado) {
        const { error: upsErr } = await supabase.from('checklist_rutina_registros').upsert({
          rutina_id: rutinaId, fecha, completado: true,
        }, { onConflict: 'rutina_id,fecha' })
        if (upsErr) throw upsErr
        const { error: updErr } = await supabase.from('checklist_rutina').update({ ultima_vez: new Date().toISOString() }).eq('id', rutinaId)
        if (updErr) throw updErr
      } else {
        const { error: delErr } = await supabase.from('checklist_rutina_registros').delete()
          .eq('rutina_id', rutinaId).eq('fecha', fecha)
        if (delErr) throw delErr
      }
      await Promise.all([fetchRutinaRegistros(fecha), mutateConfig()])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cambiar estado de rutina'
      console.error('[useChecklist] toggleRutina Error:', msg)
      throw new Error(msg)
    }
  }

  return {
    secciones, items, registros, rutinas, rutinaRegistros, loading, error,
    fetchAll, fetchRegistros, fetchRutinaRegistros,
    agregarSeccion, actualizarSeccion, eliminarSeccion, reordenarSecciones,
    agregarItem, actualizarItem, eliminarItem, upsertRegistro,
    agregarRutina, eliminarRutina, toggleRutina,
  }
}
