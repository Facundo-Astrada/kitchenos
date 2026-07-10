'use client'

import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import type { CajaTurno, CajaMovimiento, MedioPago } from '@/types'

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return fallback
}

// El fondo de caja inicial (monto_inicial) es siempre efectivo — no hay "fondo" en una tarjeta.
// Heurística de nombre porque medios_pago no tiene un campo "tipo" — mismo patrón pragmático
// que otras heurísticas por nombre en el proyecto (ver importador.md).
export function inferMedioEfectivo(medios: MedioPago[]): MedioPago | null {
  return medios.find(m => /efectivo|cash/i.test(m.nombre)) ?? medios[0] ?? null
}

async function fetchCajaAbierta(key: string): Promise<CajaTurno | null> {
  const rid = key.slice('caja-abierta-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('cajas_turnos').select('*')
    .eq('restaurante_id', rid).eq('estado', 'abierta')
    .maybeSingle()
  if (error) throw error
  return data as CajaTurno | null
}

export function useCajaTurno() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])
  const swrKey = RESTAURANTE_ID ? `caja-abierta-${RESTAURANTE_ID}` : null
  const { data: cajaAbierta = null, isLoading: loading, mutate } = useSWR(swrKey, fetchCajaAbierta, {
    revalidateOnFocus: false,
    dedupingInterval: 10_000,
  })

  const abrirCaja = useCallback(async (montoInicial: number, abiertaPor: string | null): Promise<CajaTurno> => {
    if (!RESTAURANTE_ID) throw new Error('Sin restaurante')
    try {
      const { data, error } = await supabase
        .from('cajas_turnos')
        .insert({ restaurante_id: RESTAURANTE_ID, monto_inicial: montoInicial, abierta_por: abiertaPor })
        .select()
        .single()
      if (error) throw error
      await mutate()
      return data as CajaTurno
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al abrir la caja'))
    }
  }, [RESTAURANTE_ID, supabase, mutate])

  const fetchMovimientos = useCallback(async (cajaTurnoId: string): Promise<CajaMovimiento[]> => {
    const { data, error } = await supabase
      .from('caja_movimientos').select('*')
      .eq('caja_turno_id', cajaTurnoId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(errMsg(error, 'Error al cargar movimientos'))
    return (data ?? []) as CajaMovimiento[]
  }, [supabase])

  const registrarMovimiento = useCallback(async (params: {
    cajaTurnoId: string
    medioId: string
    tipo: 'retiro' | 'ingreso'
    monto: number
    motivo?: string | null
    creadoPor?: string | null
  }): Promise<void> => {
    try {
      const { error } = await supabase.from('caja_movimientos').insert({
        caja_turno_id: params.cajaTurnoId,
        medio_id: params.medioId,
        tipo: params.tipo,
        monto: params.monto,
        motivo: params.motivo ?? null,
        creado_por: params.creadoPor ?? null,
      })
      if (error) throw error
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al registrar el movimiento'))
    }
  }, [supabase])

  // Esperado por medio de pago = pagos (monto+propina) + ingresos - retiros, desde la apertura del turno.
  // El monto_inicial NO se incluye acá (ver inferMedioEfectivo) — la UI lo suma al medio efectivo.
  const calcularEsperado = useCallback(async (caja: CajaTurno): Promise<Record<string, number>> => {
    const esperado: Record<string, number> = {}

    // pagos no tiene restaurante_id propio (tabla hija de cuentas) — se filtra vía embed !inner,
    // que sí filtra la tabla principal (a diferencia de un embed sin !inner, ver feedback_postgrest_join).
    const { data: pagos, error: pagosErr } = await supabase
      .from('pagos')
      .select('medio_id, monto, propina, cuentas!inner(restaurante_id)')
      .eq('cuentas.restaurante_id', RESTAURANTE_ID)
      .gte('created_at', caja.fecha_apertura)
    if (pagosErr) throw new Error(errMsg(pagosErr, 'Error al calcular lo esperado'))

    for (const p of (pagos ?? []) as unknown as { medio_id: string; monto: number; propina: number }[]) {
      esperado[p.medio_id] = (esperado[p.medio_id] ?? 0) + p.monto + (p.propina ?? 0)
    }

    const movimientos = await fetchMovimientos(caja.id)
    for (const m of movimientos) {
      const signo = m.tipo === 'ingreso' ? 1 : -1
      esperado[m.medio_id] = (esperado[m.medio_id] ?? 0) + signo * m.monto
    }

    return esperado
  }, [RESTAURANTE_ID, supabase, fetchMovimientos])

  const cerrarCaja = useCallback(async (params: {
    cajaTurnoId: string
    montosEsperados: Record<string, number>
    montosDeclarados: Record<string, number>
    cerradaPor: string | null
    arqueoCiego: boolean
    notas?: string | null
  }): Promise<number> => {
    const diferenciaTotal = Object.keys(params.montosDeclarados).reduce((s, medioId) => {
      const declarado = params.montosDeclarados[medioId] ?? 0
      const esperado = params.montosEsperados[medioId] ?? 0
      return s + (declarado - esperado)
    }, 0)
    try {
      const { error } = await supabase.from('cajas_turnos').update({
        estado: 'cerrada',
        fecha_cierre: new Date().toISOString(),
        cerrada_por: params.cerradaPor,
        montos_esperados: params.montosEsperados,
        montos_declarados: params.montosDeclarados,
        diferencia_total: diferenciaTotal,
        arqueo_ciego: params.arqueoCiego,
        notas: params.notas ?? null,
      }).eq('id', params.cajaTurnoId)
      if (error) throw error
      await mutate()
      return diferenciaTotal
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al cerrar la caja'))
    }
  }, [supabase, mutate])

  const fetchHistorial = useCallback(async (limit = 30): Promise<CajaTurno[]> => {
    if (!RESTAURANTE_ID) return []
    const { data, error } = await supabase
      .from('cajas_turnos').select('*')
      .eq('restaurante_id', RESTAURANTE_ID)
      .eq('estado', 'cerrada')
      .order('fecha_cierre', { ascending: false })
      .limit(limit)
    if (error) throw new Error(errMsg(error, 'Error al cargar el historial de caja'))
    return (data ?? []) as CajaTurno[]
  }, [RESTAURANTE_ID, supabase])

  return {
    cajaAbierta, loading,
    abrirCaja, cerrarCaja,
    registrarMovimiento, fetchMovimientos,
    calcularEsperado, fetchHistorial,
    refetch: mutate,
  }
}
