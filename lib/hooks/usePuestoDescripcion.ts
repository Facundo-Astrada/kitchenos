'use client'
/**
 * Descripción de puesto — Fase 1 (PLAN-DESCRIPCION-PUESTO-2026-09.md § 5.1).
 *
 * Borrador vivo por puesto (`puesto_descripciones`, 1:1 con `puestos`). El
 * cuestionario de 6 tandas escribe acá de a pedazos (`guardarBorrador`, un
 * upsert parcial por tanda) y "Dejar vigente" (`publicar`) marca el estado
 * sin tocar el resto del documento.
 *
 * Todavía NO existen las tablas de versión inmutable + acuse de lectura
 * (Fase 3, plan § 5.1.b) — `version` acá es solo un contador del borrador,
 * no tiene valor probatorio.
 */
import { useMemo, useCallback } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'

export interface ResponsabilidadBloque {
  titulo: string
  items: string[]
}

export interface DiaTipoItem {
  momento: string
  hora: string | null
  que_hace: string
}

export interface IndicadorItem {
  nombre: string
  meta: string
  modulo?: string | null
}

export interface CondicionesPuesto {
  beneficios?: string[]
  capacitacion?: string
  carrera?: string
}

export interface PuestoDescripcion {
  id: string
  restaurante_id: string
  puesto_id: string
  mision: string | null
  responsabilidades: ResponsabilidadBloque[]
  dia_tipo: DiaTipoItem[]
  jornada: Record<string, unknown> | null
  expectativas: string[]
  no_negociables: string[]
  indicadores: IndicadorItem[]
  capacidades_requeridas: Record<string, unknown> | null
  requisitos: Record<string, unknown> | null
  condiciones: CondicionesPuesto | null
  estado: 'borrador' | 'vigente' | 'archivado'
  version: number
  revisado_por: string | null
  revisado_at: string | null
  created_at: string
  updated_at: string
}

type PatchDescripcion = Partial<Omit<PuestoDescripcion, 'id' | 'restaurante_id' | 'puesto_id' | 'created_at'>>

const SIN_DESCRIPCIONES: PuestoDescripcion[] = []

async function fetchDescripciones(key: string): Promise<PuestoDescripcion[]> {
  const rid = key.slice('puesto-descripciones-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('puesto_descripciones')
    .select('*')
    .eq('restaurante_id', rid)
  if (error) throw error
  return (data ?? []) as PuestoDescripcion[]
}

export function usePuestoDescripcion() {
  const RESTAURANTE_ID = useRestauranteId()
  const swrKey = RESTAURANTE_ID ? `puesto-descripciones-${RESTAURANTE_ID}` : null

  const { data = SIN_DESCRIPCIONES, isLoading: loading, mutate } = useSWR(
    swrKey, fetchDescripciones,
    { revalidateOnFocus: false, revalidateOnReconnect: true, dedupingInterval: 60_000, keepPreviousData: true },
  )

  const indice = useMemo(() => {
    const m = new Map<string, PuestoDescripcion>()
    for (const d of data) m.set(d.puesto_id, d)
    return m
  }, [data])

  const descripcionDe = useCallback(
    (puestoId: string): PuestoDescripcion | undefined => indice.get(puestoId),
    [indice],
  )

  /** Upsert parcial — cada tanda guarda solo lo suyo, el resto queda como está. */
  const guardarBorrador = useCallback(async (
    puestoId: string, patch: PatchDescripcion,
  ): Promise<void> => {
    if (!RESTAURANTE_ID) return
    const supabase = createClient()
    const ahora = new Date().toISOString()

    const previa = data.find(d => d.puesto_id === puestoId)
    const base: PuestoDescripcion = previa ?? {
      id: `tmp-${puestoId}`, restaurante_id: RESTAURANTE_ID, puesto_id: puestoId,
      mision: null, responsabilidades: [], dia_tipo: [], jornada: null,
      expectativas: [], no_negociables: [], indicadores: [],
      capacidades_requeridas: null, requisitos: null, condiciones: null,
      estado: 'borrador', version: 1, revisado_por: null, revisado_at: null,
      created_at: ahora, updated_at: ahora,
    }
    const optimista: PuestoDescripcion = { ...base, ...patch, updated_at: ahora }
    const siguientes = previa
      ? data.map(d => (d.puesto_id === puestoId ? optimista : d))
      : [...data, optimista]
    mutate(siguientes, { revalidate: false })

    const { data: row, error } = await supabase
      .from('puesto_descripciones')
      .upsert(
        { restaurante_id: RESTAURANTE_ID, puesto_id: puestoId, ...patch, updated_at: ahora },
        { onConflict: 'puesto_id' },
      )
      .select('*')
      .single()

    if (error) {
      console.error('[usePuestoDescripcion] guardarBorrador Error:', error.message)
      mutate()
      throw new Error(error.message)
    }
    mutate(prev => (prev ?? []).map(d => (d.puesto_id === puestoId ? (row as PuestoDescripcion) : d)), { revalidate: false })
  }, [RESTAURANTE_ID, data, mutate])

  /** "Dejar vigente" — no toca el contenido, solo el estado y quién/cuándo lo revisó. */
  const publicar = useCallback(async (puestoId: string, miembroId: string | null): Promise<void> => {
    if (!RESTAURANTE_ID) return
    const supabase = createClient()
    const previa = data.find(d => d.puesto_id === puestoId)
    const ahora = new Date().toISOString()
    const nuevaVersion = (previa?.version ?? 0) + 1

    const { error } = await supabase
      .from('puesto_descripciones')
      .update({ estado: 'vigente', version: nuevaVersion, revisado_por: miembroId, revisado_at: ahora, updated_at: ahora })
      .eq('restaurante_id', RESTAURANTE_ID)
      .eq('puesto_id', puestoId)
    if (error) {
      console.error('[usePuestoDescripcion] publicar Error:', error.message)
      throw new Error(error.message)
    }
    mutate()
  }, [RESTAURANTE_ID, data, mutate])

  return { descripciones: data, loading, descripcionDe, guardarBorrador, publicar, refetch: mutate }
}
