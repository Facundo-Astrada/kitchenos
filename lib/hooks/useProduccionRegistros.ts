'use client'

import { useCallback, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'

export interface ProduccionRegistro {
  id: string
  restaurante_id: string
  receta_id: string | null
  tarea_id: string | null
  fecha: string
  cantidad_planificada: number | null
  cantidad_real: number | null
  multiplicador_real: number
  usuario_id: string | null
  usuario_nombre: string | null
  notas: string | null
  created_at: string
}

export interface DesviacionSugerencia {
  sugerir: boolean
  promedioMultiplicador: number
  registrosConsecutivos: number
}

export function useProduccionRegistros() {
  const RESTAURANTE_ID = useRestauranteId()
  const [supabase] = useState(() => createClient())

  // rendimientoMap: receta_id → avg multiplicador_real (para checklist/mise)
  const [rendimientoMap, setRendimientoMap] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!RESTAURANTE_ID) return
    supabase
      .from('produccion_registros')
      .select('receta_id, multiplicador_real')
      .eq('restaurante_id', RESTAURANTE_ID)
      .not('receta_id', 'is', null)
      .then(({ data }) => {
        if (!data) return
        const sums: Record<string, { total: number; n: number }> = {}
        for (const r of data) {
          if (!r.receta_id) continue
          if (!sums[r.receta_id]) sums[r.receta_id] = { total: 0, n: 0 }
          sums[r.receta_id].total += r.multiplicador_real ?? 1
          sums[r.receta_id].n += 1
        }
        const map: Record<string, number> = {}
        for (const [rid, s] of Object.entries(sums)) {
          map[rid] = Math.round((s.total / s.n) * 100) / 100
        }
        setRendimientoMap(map)
      })
  }, [RESTAURANTE_ID, supabase])

  const registrar = useCallback(async (params: {
    receta_id: string
    tarea_id: string
    fecha: string
    cantidad_planificada: number | null
    multiplicador_real: number
    usuario_id: string | null
    usuario_nombre: string | null
    notas?: string
  }): Promise<DesviacionSugerencia | null> => {
    if (!RESTAURANTE_ID) return null

    const cantidad_real = params.cantidad_planificada != null
      ? params.cantidad_planificada * params.multiplicador_real
      : null

    await supabase.from('produccion_registros').insert({
      restaurante_id: RESTAURANTE_ID,
      receta_id: params.receta_id,
      tarea_id: params.tarea_id,
      fecha: params.fecha,
      cantidad_planificada: params.cantidad_planificada,
      cantidad_real,
      multiplicador_real: params.multiplicador_real,
      usuario_id: params.usuario_id,
      usuario_nombre: params.usuario_nombre,
      notas: params.notas ?? null,
    })

    // Check for 3 consecutive deviations >= 10%
    const { data: ultimos } = await supabase
      .from('produccion_registros')
      .select('multiplicador_real')
      .eq('receta_id', params.receta_id)
      .eq('restaurante_id', RESTAURANTE_ID)
      .order('created_at', { ascending: false })
      .limit(3)

    if (!ultimos || ultimos.length < 3) return null

    const allDeviated = ultimos.every(r => Math.abs((r.multiplicador_real ?? 1) - 1) >= 0.10)
    if (!allDeviated) return null

    const promedio = ultimos.reduce((s, r) => s + (r.multiplicador_real ?? 1), 0) / ultimos.length
    return {
      sugerir: true,
      promedioMultiplicador: Math.round(promedio * 100) / 100,
      registrosConsecutivos: ultimos.length,
    }
  }, [RESTAURANTE_ID, supabase])

  const getHistorial = useCallback(async (receta_id: string): Promise<ProduccionRegistro[]> => {
    const { data } = await supabase
      .from('produccion_registros')
      .select('*')
      .eq('receta_id', receta_id)
      .order('created_at', { ascending: false })
      .limit(10)
    return (data ?? []) as ProduccionRegistro[]
  }, [supabase])

  return { rendimientoMap, registrar, getHistorial }
}
