'use client'

import { useCallback, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { CierreTurno } from '@/types'
import { claveCierre, hoyOperativo, sumarDias } from '@/lib/ops/turnos'
import { useRestauranteId } from './useRestauranteId'

// Pase de turno explícito — la entrega de una plaza como hecho persistido.
// Una fila = "esta plaza entregó este turno de esta jornada", con autor y hora.
// Es lo que hace avanzar el turno al momento en vez de esperar al reloj (ver
// lib/ops/turnos.ts: turnoVigente).
//
// Ventana corta a propósito: la pantalla solo necesita saber si el turno en el
// que está parada ya fue entregado. El histórico largo (reporte de auditoría de
// pases) lo consulta Reportes por su cuenta, sin pasar por este hook.
const VENTANA_DIAS = 2

type CierresKey = readonly ['cierres-turno', string, string]

async function fetchCierres([, rid, desde]: CierresKey): Promise<CierreTurno[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('cierres_turno')
    .select('*')
    .eq('restaurante_id', rid)
    .gte('jornada', desde)
    .order('cerrado_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CierreTurno[]
}

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return fallback
}

export function useCierresTurno() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  // hoyOperativo en la key: al rodar la jornada la ventana se corre sola en vez
  // de quedar servida desde el cache del día anterior.
  const desde = sumarDias(hoyOperativo(), -VENTANA_DIAS)
  const swrKey: CierresKey | null = RESTAURANTE_ID ? ['cierres-turno', RESTAURANTE_ID, desde] : null

  const { data, isLoading: loading, mutate } = useSWR(swrKey, fetchCierres, {
    revalidateOnFocus: true,   // volver a la app tras el pase de otro debe reflejarlo
    revalidateOnReconnect: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  })

  const cierres = useMemo(() => data ?? [], [data])

  /** Set de claves entregadas — lo que consume turnoVigente(). */
  const entregados = useMemo(
    () => new Set(cierres.map(c => claveCierre(c.jornada, c.turno_id, c.plaza))),
    [cierres],
  )

  /** La entrega concreta, para mostrar quién y a qué hora entregó. */
  const entregaDe = useCallback(
    (jornada: string, turnoId: string, plaza: string): CierreTurno | undefined =>
      cierres.find(c => c.jornada === jornada && c.turno_id === turnoId && c.plaza === plaza),
    [cierres],
  )

  // Realtime — la tablet de cocina tiene que ver el pase sin recargar.
  // Filtrado por restaurante (ver hooks.md #18/#4): sin el filter llegan las
  // escrituras de todas las cuentas.
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const ch = supabase
      .channel(`cierres-turno-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'cierres_turno',
        filter: `restaurante_id=eq.${RESTAURANTE_ID}`,
      }, () => { mutate() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID, supabase, mutate])

  /**
   * Entregar la plaza. Idempotente por (restaurante, jornada, turno, plaza):
   * volver a tocar el botón no duplica la entrega ni le cambia el autor.
   */
  const entregarPlaza = useCallback(async (args: {
    jornada: string
    turnoId: string
    plaza: string
    cerradoPor?: string | null
    itemsTotal?: number | null
    itemsCompletados?: number | null
    // Relevo (ago 2026) — lectura del que entrega. Lo que debe saber el que
    // entra ya no viaja acá: son notas de plaza (pase_mensajes), ver
    // lib/ops/textoPase.ts.
    percepcion?: 'bien' | 'regular' | 'complicado' | null
  }): Promise<void> => {
    if (!RESTAURANTE_ID) throw new Error('Sin restaurante')
    const fila = {
      restaurante_id: RESTAURANTE_ID,
      jornada: args.jornada,
      turno_id: args.turnoId,
      plaza: args.plaza,
      cerrado_por: args.cerradoPor ?? null,
      cerrado_at: new Date().toISOString(),
      items_total: args.itemsTotal ?? null,
      items_completados: args.itemsCompletados ?? null,
      percepcion: args.percepcion ?? null,
    }
    try {
      const { error } = await supabase
        .from('cierres_turno')
        .upsert(fila, { onConflict: 'restaurante_id,jornada,turno_id,plaza', ignoreDuplicates: true })
      if (error) throw error
      await mutate()
    } catch (e) {
      const msg = errMsg(e, 'Error al entregar la plaza')
      console.error('[useCierresTurno] entregarPlaza Error:', msg)
      throw new Error(msg)
    }
  }, [RESTAURANTE_ID, supabase, mutate])

  /** Deshacer una entrega — el turno vuelve a resolverse por reloj. */
  const deshacerEntrega = useCallback(async (args: {
    jornada: string; turnoId: string; plaza: string
  }): Promise<void> => {
    if (!RESTAURANTE_ID) throw new Error('Sin restaurante')
    try {
      const { error } = await supabase
        .from('cierres_turno')
        .delete()
        .eq('restaurante_id', RESTAURANTE_ID)
        .eq('jornada', args.jornada)
        .eq('turno_id', args.turnoId)
        .eq('plaza', args.plaza)
      if (error) throw error
      await mutate()
    } catch (e) {
      const msg = errMsg(e, 'Error al deshacer la entrega')
      console.error('[useCierresTurno] deshacerEntrega Error:', msg)
      throw new Error(msg)
    }
  }, [RESTAURANTE_ID, supabase, mutate])

  return { cierres, entregados, entregaDe, loading, entregarPlaza, deshacerEntrega, mutate }
}
