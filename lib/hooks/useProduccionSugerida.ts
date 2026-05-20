'use client'

import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import { useAuth } from '@/lib/auth/context'

export interface SugerenciaProduccion {
  ventas_prom: number
  cantidad_actual: number
  sugerido: number
}

export function useProduccionSugerida() {
  const RESTAURANTE_ID = useRestauranteId()
  const { perfil } = useAuth()
  const [supabase] = useState(() => createClient())

  const getSugerencia = useCallback(async (
    cantidadActual: number,
  ): Promise<SugerenciaProduccion | null> => {
    if (!RESTAURANTE_ID) return null
    const rol = perfil?.rol
    if (rol !== 'admin' && rol !== 'chef') return null

    // Días similares (mismo día semana) en últimos 21 días
    const today = new Date()
    const diaSemana = today.getDay()
    const fechasSimilares: string[] = []
    for (let d = 1; d <= 21; d++) {
      const date = new Date(today)
      date.setDate(today.getDate() - d)
      if (date.getDay() === diaSemana) {
        fechasSimilares.push(date.toISOString().split('T')[0])
      }
    }

    if (fechasSimilares.length < 3) return null

    const { data: ventas } = await supabase
      .from('ventas')
      .select('cantidad_cubiertos')
      .eq('restaurante_id', RESTAURANTE_ID)
      .in('fecha', fechasSimilares)
      .not('cantidad_cubiertos', 'is', null)

    if (!ventas || ventas.length < 3) return null

    const ventasProm = Math.round(
      ventas.reduce((s, v) => s + (v.cantidad_cubiertos ?? 0), 0) / ventas.length,
    )

    return {
      ventas_prom: ventasProm,
      cantidad_actual: cantidadActual,
      sugerido: Math.max(0, ventasProm - cantidadActual),
    }
  }, [RESTAURANTE_ID, perfil, supabase])

  return { getSugerencia }
}
