'use client'

import { useState, useEffect } from 'react'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { createClient } from '@/lib/supabase/client'

// ── Datos clave del día (cards del hero) ────────────────────────
export interface DatosClave {
  bajoMinimo: number
  vencen: number
  gastoHoy: number
}

export function useDatosClave(): DatosClave | null {
  const RESTAURANTE_ID = useRestauranteId()
  const [datos, setDatos] = useState<DatosClave | null>(null)

  useEffect(() => {
    if (!RESTAURANTE_ID) return
    let cancel = false
    const supabase = createClient()
    const hoy = new Date().toISOString().split('T')[0]
    const en3 = new Date(Date.now() + 3 * 86_400_000).toISOString().split('T')[0]

    ;(async () => {
      const [bajoMinRes, vencRes, factRes] = await Promise.all([
        // Count server-side (RPC): stock_actual <= stock_minimo compara dos
        // columnas, PostgREST no lo soporta como filtro — antes bajaba hasta
        // 1000 filas de productos solo para contar en el cliente.
        supabase.rpc('productos_bajo_minimo_count', { p_restaurante_id: RESTAURANTE_ID }),
        supabase.from('haccp_vencimientos')
          .select('id', { count: 'exact', head: true })
          .eq('restaurante_id', RESTAURANTE_ID)
          .in('status', ['vigente', 'por_vencer'])
          .lte('fecha_vencimiento', en3),
        supabase.from('facturas')
          .select('total')
          .eq('restaurante_id', RESTAURANTE_ID)
          .eq('fecha_factura', hoy),
      ])
      if (cancel) return
      const gastoHoy = ((factRes.data ?? []) as Array<{ total: number | null }>)
        .reduce((s, f) => s + (Number(f.total) || 0), 0)
      setDatos({ bajoMinimo: (bajoMinRes.data as number | null) ?? 0, vencen: vencRes.count ?? 0, gastoHoy })
    })()
    return () => { cancel = true }
  }, [RESTAURANTE_ID])

  return datos
}
