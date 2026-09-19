'use client'
/**
 * Carta de la casa — Fase 2 (PLAN-DESCRIPCION-PUESTO-2026-09.md § 6.1).
 *
 * Una por restaurante, sin tabla nueva: vive en `restaurantes.configuracion.
 * carta_de_la_casa` (mismo patrón que las plazas custom, ver `usePlazasCustom.ts`).
 * Cultura, políticas, uniforme, el día tipo y no negociables de LA CASA — no
 * se repiten por puesto, y son lo que la Fase 1 hereda para el atajo de
 * 3 tandas del segundo puesto en adelante (plan § 10.1 A, todavía sin construir).
 */
import { useCallback, useMemo } from 'react'
import { useRestauranteConfig, useGuardarRestauranteConfig } from './useRestauranteConfig'

export interface DiaTipoCasaItem {
  hora: string
  que_hace: string
}

export interface CartaDeLaCasa {
  cultura?: string
  politicas?: string[]
  uniforme?: string
  dia_tipo?: DiaTipoCasaItem[]
  no_negociables?: string[]
}

const VACIA: CartaDeLaCasa = {}

export function useCartaDeLaCasa() {
  const { configuracion, loading } = useRestauranteConfig()
  const guardarConfig = useGuardarRestauranteConfig()

  const carta = useMemo(
    () => (configuracion.carta_de_la_casa as CartaDeLaCasa | undefined) ?? VACIA,
    [configuracion],
  )

  const guardar = useCallback(async (patch: CartaDeLaCasa) => {
    await guardarConfig({ carta_de_la_casa: { ...carta, ...patch } })
  }, [guardarConfig, carta])

  return { carta, loading, guardar }
}
