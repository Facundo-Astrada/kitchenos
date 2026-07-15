'use client'

import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import type { CuentaCorrienteMovimiento, TipoMovimientoCC } from '@/types'

export interface MovimientoCCEnriquecido extends CuentaCorrienteMovimiento {
  cliente_nombre: string
  medio_nombre: string | null
}

interface MovRow {
  id: string; restaurante_id: string; cliente_id: string; cuenta_id: string | null
  tipo: TipoMovimientoCC; monto: number; medio_pago_id: string | null
  descripcion: string | null; creado_por: string | null; fecha_pago: string | null; created_at: string
  cliente: { nombre: string } | null
  medio: { nombre: string } | null
}

async function fetchMovimientosData(key: string): Promise<MovimientoCCEnriquecido[]> {
  const rid = key.slice('cc-mov-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('cuenta_corriente_movimientos')
    .select('*, cliente:clientes(nombre), medio:medios_pago(nombre)')
    .eq('restaurante_id', rid)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  return ((data ?? []) as unknown as MovRow[]).map(m => ({
    ...m, cliente_nombre: m.cliente?.nombre ?? '—', medio_nombre: m.medio?.nombre ?? null,
  }))
}

// signo: 'pago' reduce lo adeudado (+saldo), 'cargo' lo aumenta (−saldo) —
// mismo criterio que Fudo (saldo negativo = neto que deben los clientes).
function signo(m: { tipo: TipoMovimientoCC; monto: number }): number {
  return m.tipo === 'pago' ? m.monto : -m.monto
}

export function useCuentaCorriente() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID ? `cc-mov-${RESTAURANTE_ID}` : null
  const { data: movimientos = [], isLoading: loading, mutate } = useSWR(swrKey, fetchMovimientosData, {
    revalidateOnFocus: false, dedupingInterval: 30_000, keepPreviousData: true,
  })

  const saldoTotal = useMemo(() => movimientos.reduce((s, m) => s + signo(m), 0), [movimientos])

  const saldoPorCliente = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of movimientos) map.set(m.cliente_id, (map.get(m.cliente_id) ?? 0) + signo(m))
    return map
  }, [movimientos])

  const registrarMovimiento = useCallback(async (params: {
    clienteId: string; tipo: TipoMovimientoCC; monto: number
    cuentaId?: string | null; medioPagoId?: string | null; descripcion?: string | null
    creadoPor?: string | null; fechaPago?: string | null
  }) => {
    if (!RESTAURANTE_ID) throw new Error('Sesión no cargada')
    const { error } = await supabase.from('cuenta_corriente_movimientos').insert({
      restaurante_id: RESTAURANTE_ID,
      cliente_id: params.clienteId,
      cuenta_id: params.cuentaId ?? null,
      tipo: params.tipo,
      monto: params.monto,
      medio_pago_id: params.medioPagoId ?? null,
      descripcion: params.descripcion ?? null,
      creado_por: params.creadoPor ?? null,
      fecha_pago: params.fechaPago ?? null,
    })
    if (error) throw error
    await mutate()
  }, [RESTAURANTE_ID, supabase, mutate])

  const eliminarMovimiento = useCallback(async (id: string) => {
    const { error } = await supabase.from('cuenta_corriente_movimientos').delete().eq('id', id)
    if (error) throw error
    await mutate()
  }, [supabase, mutate])

  return {
    movimientos, loading, saldoTotal, saldoPorCliente,
    registrarMovimiento, eliminarMovimiento,
    refetch: useCallback(() => mutate(), [mutate]),
  }
}
