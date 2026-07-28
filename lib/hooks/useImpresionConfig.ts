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
const DEFAULT_VENCIMIENTOS = true

// Toggles de producción por establecimiento, en restaurantes.configuracion
// (mismo patrón JSONB merge que nombres_excluidos — ver .claude/docs/columnas.md):
// - impresion: etiqueta USB / Bluetooth / descargar .bin.
// - vencimientos_habilitados: si se ofrece "Caduca en X días" + "Crear
//   vencimiento en HACCP" al marcar un ítem del mise como listo. Muchos
//   restaurantes rotulan el producto físicamente y no llevan el registro
//   digital — con esto en false, ese bloque no aparece.
export function useImpresionConfig() {
  const RESTAURANTE_ID = useRestauranteId()
  const [impresion, setImpresion] = useState<ImpresionConfig>(DEFAULT_IMPRESION)
  const [vencimientosHabilitados, setVencimientosHabilitados] = useState(DEFAULT_VENCIMIENTOS)
  const [loading, setLoading] = useState(true)

  const fetchConfig = useCallback(async () => {
    if (!RESTAURANTE_ID) { setLoading(false); return }
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('restaurantes').select('configuracion').eq('id', RESTAURANTE_ID).maybeSingle()
    const cfg = (data?.configuracion ?? null) as { impresion?: Partial<ImpresionConfig>; vencimientos_habilitados?: boolean } | null
    setImpresion({ ...DEFAULT_IMPRESION, ...(cfg?.impresion ?? {}) })
    setVencimientosHabilitados(cfg?.vencimientos_habilitados ?? DEFAULT_VENCIMIENTOS)
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
    setImpresion(nextImpresion)
  }, [RESTAURANTE_ID])

  const guardarVencimientosHabilitados = useCallback(async (value: boolean) => {
    if (!RESTAURANTE_ID) return
    const supabase = createClient()
    const { data } = await supabase
      .from('restaurantes').select('configuracion').eq('id', RESTAURANTE_ID).maybeSingle()
    const cfg = (data?.configuracion ?? {}) as Record<string, unknown>
    const { error } = await supabase
      .from('restaurantes').update({ configuracion: { ...cfg, vencimientos_habilitados: value } }).eq('id', RESTAURANTE_ID)
    if (error) throw error
    setVencimientosHabilitados(value)
  }, [RESTAURANTE_ID])

  return { impresion, vencimientosHabilitados, loading, guardarImpresionConfig, guardarVencimientosHabilitados }
}
