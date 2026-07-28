'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'

export interface ImpresionConfig {
  usb: boolean
  bluetooth: boolean
  bin: boolean
}

const DEFAULT_IMPRESION: ImpresionConfig = { usb: true, bluetooth: true, bin: true }

// Toggles de impresión (etiqueta USB / Bluetooth / descargar .bin) por
// establecimiento, en restaurantes.configuracion.impresion (mismo patrón JSONB
// merge que nombres_excluidos — ver .claude/docs/columnas.md).
export function useImpresionConfig() {
  const RESTAURANTE_ID = useRestauranteId()
  const [config, setConfig] = useState<ImpresionConfig>(DEFAULT_IMPRESION)
  const [loading, setLoading] = useState(true)

  const fetchConfig = useCallback(async () => {
    if (!RESTAURANTE_ID) { setLoading(false); return }
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('restaurantes').select('configuracion').eq('id', RESTAURANTE_ID).maybeSingle()
    const cfg = (data?.configuracion ?? null) as { impresion?: Partial<ImpresionConfig> } | null
    setConfig({ ...DEFAULT_IMPRESION, ...(cfg?.impresion ?? {}) })
    setLoading(false)
  }, [RESTAURANTE_ID])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  const guardarImpresionConfig = useCallback(async (updates: Partial<ImpresionConfig>) => {
    if (!RESTAURANTE_ID) return
    const supabase = createClient()
    const { data } = await supabase
      .from('restaurantes').select('configuracion').eq('id', RESTAURANTE_ID).maybeSingle()
    const cfg = (data?.configuracion ?? {}) as Record<string, unknown>
    const nextImpresion = { ...DEFAULT_IMPRESION, ...(cfg.impresion as Partial<ImpresionConfig> ?? {}), ...updates }
    const { error } = await supabase
      .from('restaurantes').update({ configuracion: { ...cfg, impresion: nextImpresion } }).eq('id', RESTAURANTE_ID)
    if (error) throw error
    setConfig(nextImpresion)
  }, [RESTAURANTE_ID])

  return { config, loading, guardarImpresionConfig }
}
