'use client'

import { useCallback, useMemo } from 'react'
import { useRestauranteConfig, useGuardarRestauranteConfig } from './useRestauranteConfig'

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
//
// Lee de la cache compartida de `configuracion` (useRestauranteConfig): este
// hook vive dentro de CADA tarjeta del mise y antes hacía su propio fetch, así
// que abrir una plaza disparaba una request a `restaurantes` por ítem.
export function useImpresionConfig() {
  const { configuracion, loading } = useRestauranteConfig()
  const guardarConfig = useGuardarRestauranteConfig()

  const impresion = useMemo<ImpresionConfig>(() => ({
    ...DEFAULT_IMPRESION,
    ...((configuracion.impresion as Partial<ImpresionConfig> | undefined) ?? {}),
  }), [configuracion])

  const vencimientosHabilitados =
    (configuracion.vencimientos_habilitados as boolean | undefined) ?? DEFAULT_VENCIMIENTOS

  const guardarImpresionConfig = useCallback(async (updates: Partial<ImpresionConfig>) => {
    await guardarConfig({ impresion: { ...impresion, ...updates } })
  }, [guardarConfig, impresion])

  const guardarVencimientosHabilitados = useCallback(async (value: boolean) => {
    await guardarConfig({ vencimientos_habilitados: value })
  }, [guardarConfig])

  return { impresion, vencimientosHabilitados, loading, guardarImpresionConfig, guardarVencimientosHabilitados }
}
