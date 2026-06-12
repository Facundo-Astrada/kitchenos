'use client'

import { useEffect, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HaccpEquipo {
  id: string
  nombre: string
  tipo: 'camara' | 'freezer' | 'heladera' | 'horno' | 'baño_maria'
  temp_min: number
  temp_max: number
  ubicacion: string
  plaza: string
  activo: boolean
  restaurante_id: string
  created_at: string
}

export interface HaccpTemperatura {
  id: string
  equipo_id: string
  temperatura: number
  dentro_rango: boolean
  observacion: string | null
  accion_correctiva: string | null
  usuario_id: string | null
  restaurante_id: string
  created_at: string
}

export interface HaccpVencimiento {
  id: string
  producto_nombre: string
  producto_id: string | null
  fecha_vencimiento: string
  fecha_apertura: string | null
  lote: string | null
  ubicacion: string | null
  status: 'vigente' | 'por_vencer' | 'vencido' | 'descartado'
  usuario_id: string | null
  restaurante_id: string
  created_at: string
}

export interface HaccpLimpieza {
  id: string
  area: string
  tarea_limpieza: string
  frecuencia: 'cada_turno' | 'diaria' | 'semanal' | 'mensual'
  ultimo_registro: string | null
  usuario_id: string | null
  restaurante_id: string
  created_at: string
  dia_semana: number | null
  dia_mes: number | null
  sync_ops: boolean
  checklist_item_id: string | null
}

export interface HaccpLimpiezaRegistro {
  id: string
  limpieza_id: string
  fecha: string
  completado: boolean
  observacion: string | null
  usuario_id: string | null
  created_at: string
}

interface HaccpData {
  equipos: HaccpEquipo[]
  temperaturas: HaccpTemperatura[]
  vencimientos: HaccpVencimiento[]
  limpieza: HaccpLimpieza[]
  limpiezaRegistros: HaccpLimpiezaRegistro[]
}

const EMPTY: HaccpData = { equipos: [], temperaturas: [], vencimientos: [], limpieza: [], limpiezaRegistros: [] }

// ---------------------------------------------------------------------------
// Fetcher combinado (1 sola carga para los 5 datasets)
// ---------------------------------------------------------------------------

async function fetchHaccpData(key: string): Promise<HaccpData> {
  const rid = key.slice('haccp-'.length)
  const supabase = createClient()

  const [equiposRes, tempsRes, vencRes, limpRes] = await Promise.all([
    supabase.from('haccp_equipos').select('*').eq('restaurante_id', rid).eq('activo', true).order('nombre'),
    supabase.from('haccp_temperaturas').select('*').eq('restaurante_id', rid).order('created_at', { ascending: false }).limit(200),
    supabase.from('haccp_vencimientos').select('*').eq('restaurante_id', rid).order('fecha_vencimiento', { ascending: true }),
    supabase.from('haccp_limpieza').select('*').eq('restaurante_id', rid).order('area').order('tarea_limpieza'),
  ])

  if (equiposRes.error) throw equiposRes.error

  // haccp_limpieza_registros no tiene restaurante_id — scope vía limpieza_id
  const limpieza = (limpRes.data ?? []) as HaccpLimpieza[]
  const limpiezaIds = limpieza.map(l => l.id)
  let limpiezaRegistros: HaccpLimpiezaRegistro[] = []
  if (limpiezaIds.length > 0) {
    const { data } = await supabase
      .from('haccp_limpieza_registros')
      .select('*')
      .in('limpieza_id', limpiezaIds)
      .order('fecha', { ascending: false })
      .limit(200)
    limpiezaRegistros = (data ?? []) as HaccpLimpiezaRegistro[]
  }

  return {
    equipos: (equiposRes.data ?? []) as HaccpEquipo[],
    temperaturas: (tempsRes.data ?? []) as HaccpTemperatura[],
    vencimientos: (vencRes.data ?? []) as HaccpVencimiento[],
    limpieza,
    limpiezaRegistros,
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useHaccp() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID ? `haccp-${RESTAURANTE_ID}` : null

  const { data = EMPTY, isLoading: loading, error: swrError, mutate } = useSWR(
    swrKey,
    fetchHaccpData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 300_000,
      keepPreviousData: true,
    }
  )

  const { equipos, temperaturas, vencimientos, limpieza, limpiezaRegistros } = data
  const error = (swrError as Error | null)?.message ?? null

  const refetch = useCallback(async () => { await mutate() }, [mutate])

  // Realtime — un único canal revalida la cache combinada
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const channel = supabase
      .channel(`haccp-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'haccp_equipos' }, () => mutate())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'haccp_temperaturas' }, () => mutate())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'haccp_vencimientos' }, () => mutate())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [RESTAURANTE_ID, supabase, mutate])

  // -------------------------------------------------------------------------
  // EQUIPOS
  // -------------------------------------------------------------------------

  async function crearEquipo(
    datos: Omit<HaccpEquipo, 'id' | 'restaurante_id' | 'created_at' | 'activo'>
  ) {
    try {
      const { error } = await supabase.from('haccp_equipos').insert({ ...datos, activo: true, restaurante_id: RESTAURANTE_ID })
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al crear equipo'
      console.error('[useHaccp] crearEquipo Error:', msg)
      throw new Error(msg)
    }
  }

  async function actualizarEquipo(id: string, datos: Partial<HaccpEquipo>) {
    try {
      const { error } = await supabase.from('haccp_equipos').update(datos).eq('id', id)
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar equipo'
      console.error('[useHaccp] actualizarEquipo Error:', msg)
      throw new Error(msg)
    }
  }

  async function eliminarEquipo(id: string) {
    try {
      const { error } = await supabase.from('haccp_equipos').update({ activo: false }).eq('id', id)
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar equipo'
      console.error('[useHaccp] eliminarEquipo Error:', msg)
      throw new Error(msg)
    }
  }

  // -------------------------------------------------------------------------
  // TEMPERATURAS
  // -------------------------------------------------------------------------

  async function fetchUltimaTemperatura(equipoId: string): Promise<HaccpTemperatura | null> {
    try {
      const { data, error } = await supabase
        .from('haccp_temperaturas')
        .select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .eq('equipo_id', equipoId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') throw error
      return (data as HaccpTemperatura) ?? null
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar última temperatura'
      console.error('[useHaccp] fetchUltimaTemperatura Error:', msg)
      return null
    }
  }

  async function registrarTemperaturas(
    registros: { equipo_id: string; temperatura: number; observacion?: string; accion_correctiva?: string }[]
  ) {
    try {
      const equipoMap = new Map<string, HaccpEquipo>()
      for (const eq of equipos) equipoMap.set(eq.id, eq)

      const rows = registros.map((r) => {
        const equipo = equipoMap.get(r.equipo_id)
        const dentro_rango = equipo ? r.temperatura >= equipo.temp_min && r.temperatura <= equipo.temp_max : false
        return {
          equipo_id: r.equipo_id,
          temperatura: r.temperatura,
          dentro_rango,
          observacion: r.observacion ?? null,
          accion_correctiva: r.accion_correctiva ?? null,
          restaurante_id: RESTAURANTE_ID,
        }
      })

      const { error } = await supabase.from('haccp_temperaturas').insert(rows)
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al registrar temperaturas'
      console.error('[useHaccp] registrarTemperaturas Error:', msg)
      throw new Error(msg)
    }
  }

  // -------------------------------------------------------------------------
  // VENCIMIENTOS
  // -------------------------------------------------------------------------

  async function crearVencimiento(datos: Omit<HaccpVencimiento, 'id' | 'restaurante_id' | 'created_at'>) {
    try {
      const { error } = await supabase.from('haccp_vencimientos').insert({ ...datos, restaurante_id: RESTAURANTE_ID })
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al crear vencimiento'
      console.error('[useHaccp] crearVencimiento Error:', msg)
      throw new Error(msg)
    }
  }

  async function actualizarVencimiento(id: string, datos: Partial<HaccpVencimiento>) {
    try {
      const { error } = await supabase.from('haccp_vencimientos').update(datos).eq('id', id)
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar vencimiento'
      console.error('[useHaccp] actualizarVencimiento Error:', msg)
      throw new Error(msg)
    }
  }

  async function descartarVencimiento(id: string) {
    try {
      const { error } = await supabase.from('haccp_vencimientos').update({ status: 'descartado' }).eq('id', id)
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al descartar vencimiento'
      console.error('[useHaccp] descartarVencimiento Error:', msg)
      throw new Error(msg)
    }
  }

  // -------------------------------------------------------------------------
  // LIMPIEZA
  // -------------------------------------------------------------------------

  // Crea (o reusa) el checklist_item de OPS en plaza 'general' sección 'Limpieza'
  async function syncLimpiezaToOps(nombre: string, frecuencia: string): Promise<string | null> {
    try {
      const { data: secExist } = await supabase
        .from('checklist_secciones')
        .select('id')
        .eq('restaurante_id', RESTAURANTE_ID)
        .eq('plaza', 'general')
        .ilike('nombre', 'Limpieza')
        .limit(1)
      let seccionId: string | null = secExist?.[0]?.id ?? null
      if (!seccionId) {
        const { data: newSec } = await supabase
          .from('checklist_secciones')
          .insert({ nombre: 'Limpieza', icono: 'cleaning_services', plaza: 'general', orden: 90, restaurante_id: RESTAURANTE_ID })
          .select('id').single()
        seccionId = newSec?.id ?? null
      }

      const { data: newItem } = await supabase
        .from('checklist_items')
        .insert({
          nombre,
          plaza: 'general',
          cantidad: 1,
          unidad: 'vez',
          prioridad: 'chk',
          seccion_id: seccionId,
          seccion: 'Limpieza',
          observacion: `Limpieza · ${frecuencia}`,
          restaurante_id: RESTAURANTE_ID,
          orden: 0,
        })
        .select('id').single()
      return newItem?.id ?? null
    } catch (e) {
      console.error('[useHaccp] syncLimpiezaToOps Error:', e)
      return null
    }
  }

  async function crearTareaLimpieza(
    datos: Omit<HaccpLimpieza, 'id' | 'restaurante_id' | 'created_at' | 'ultimo_registro' | 'checklist_item_id'>
  ) {
    try {
      let checklistItemId: string | null = null
      if (datos.sync_ops) {
        checklistItemId = await syncLimpiezaToOps(`${datos.area}: ${datos.tarea_limpieza}`, datos.frecuencia)
      }

      const { error } = await supabase.from('haccp_limpieza').insert({
        ...datos,
        ultimo_registro: null,
        checklist_item_id: checklistItemId,
        restaurante_id: RESTAURANTE_ID,
      })
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al crear tarea de limpieza'
      console.error('[useHaccp] crearTareaLimpieza Error:', msg)
      throw new Error(msg)
    }
  }

  async function registrarLimpieza(limpiezaId: string, observacion?: string) {
    try {
      const ahora = new Date().toISOString()

      const { error: errRegistro } = await supabase
        .from('haccp_limpieza_registros')
        .insert({ limpieza_id: limpiezaId, fecha: ahora, completado: true, observacion: observacion ?? null })
      if (errRegistro) throw errRegistro

      const { error: errUpdate } = await supabase
        .from('haccp_limpieza')
        .update({ ultimo_registro: ahora })
        .eq('id', limpiezaId)
      if (errUpdate) throw errUpdate

      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al registrar limpieza'
      console.error('[useHaccp] registrarLimpieza Error:', msg)
      throw new Error(msg)
    }
  }

  async function eliminarTareaLimpieza(id: string) {
    try {
      const tarea = limpieza.find(l => l.id === id)
      if (tarea?.checklist_item_id) {
        await supabase.from('checklist_items').delete().eq('id', tarea.checklist_item_id)
      }
      const { error } = await supabase.from('haccp_limpieza').delete().eq('id', id)
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar tarea de limpieza'
      console.error('[useHaccp] eliminarTareaLimpieza Error:', msg)
      throw new Error(msg)
    }
  }

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    // State
    equipos,
    temperaturas,
    vencimientos,
    limpieza,
    limpiezaRegistros,
    loading,
    error,

    // Equipos
    fetchEquipos: refetch,
    crearEquipo,
    actualizarEquipo,
    eliminarEquipo,

    // Temperaturas
    fetchTemperaturas: refetch,
    fetchUltimaTemperatura,
    registrarTemperaturas,

    // Vencimientos
    fetchVencimientos: refetch,
    crearVencimiento,
    actualizarVencimiento,
    descartarVencimiento,

    // Limpieza
    fetchLimpieza: refetch,
    fetchLimpiezaRegistros: refetch,
    crearTareaLimpieza,
    registrarLimpieza,
    eliminarTareaLimpieza,
  }
}
