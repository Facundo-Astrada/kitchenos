'use client'

import { useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import type { Cuenta, OrigenComanda } from '@/types'

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return fallback
}

export interface VentaCerrada extends Cuenta {
  mesa_numero: string | null
  mozo_nombre: string | null
  origen: OrigenComanda | null
  medios: { nombre: string; monto: number }[]
  caja_estado: 'abierta' | 'cerrada' | null
}

export interface AdicionItem { nombre: string; cantidad: number; precio_unitario: number; subtotal: number }

interface CuentaRow {
  id: string; restaurante_id: string; mesa_id: string | null; estado: 'abierta' | 'cerrada'
  total: number; mozo_id: string | null; abierta_at: string; cerrada_at: string | null
  created_at: string; cantidad_personas: number | null; cliente_nombre: string | null
  facturado: boolean; caja_turno_id: string | null
  mesa: { numero: string } | null
  mozo: { nombre: string; apellido: string | null } | null
  pagos: { monto: number; medio: { nombre: string } | null }[] | null
  caja: { estado: 'abierta' | 'cerrada' } | null
}

// Log transaccional de ventas cerradas — el equivalente real a la pestaña
// "Ventas" de Fudo (venta por mesa cerrada, no el resumen diario importado
// de `ventas`/`ventas_items`). Lee de `cuentas` (Salón) con sus joins.
export function useVentasCerradas() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const fetchPeriodo = useCallback(async (desde: string, hasta: string): Promise<VentaCerrada[]> => {
    if (!RESTAURANTE_ID) return []
    const { data, error } = await supabase
      .from('cuentas')
      .select('*, mesa:mesas(numero), mozo:equipo_miembros(nombre,apellido), pagos(monto, medio:medios_pago(nombre)), caja:cajas_turnos(estado)')
      .eq('restaurante_id', RESTAURANTE_ID)
      .gte('abierta_at', desde)
      .lte('abierta_at', hasta)
      .order('abierta_at', { ascending: false })
      .limit(1000)
    if (error) throw new Error(errMsg(error, 'Error al cargar ventas'))
    const rows = (data ?? []) as unknown as CuentaRow[]
    if (rows.length === 0) return []

    // Tipo de venta (origen) vía comandas — bulk, no N+1.
    const ids = rows.map(r => r.id)
    const origenMap = new Map<string, OrigenComanda>()
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const { data: comandas } = await supabase.from('comandas').select('cuenta_id, origen').in('cuenta_id', chunk)
      for (const c of (comandas ?? []) as { cuenta_id: string; origen: OrigenComanda }[]) {
        if (!origenMap.has(c.cuenta_id)) origenMap.set(c.cuenta_id, c.origen)
      }
    }

    return rows.map(r => ({
      ...r,
      mesa_numero: r.mesa?.numero ?? null,
      mozo_nombre: r.mozo ? `${r.mozo.nombre}${r.mozo.apellido ? ' ' + r.mozo.apellido : ''}` : null,
      origen: origenMap.get(r.id) ?? null,
      medios: (r.pagos ?? []).map(p => ({ nombre: p.medio?.nombre ?? '—', monto: p.monto })),
      caja_estado: r.caja?.estado ?? null,
    }))
  }, [RESTAURANTE_ID, supabase])

  // "Adiciones" (ítems) de una venta — on-demand, mismo patrón que fetchItems de facturas.
  const fetchAdiciones = useCallback(async (cuentaId: string): Promise<AdicionItem[]> => {
    const { data, error } = await supabase
      .from('comandas')
      .select('items:comanda_items(cantidad, carta_item:carta_items(nombre, precio_venta))')
      .eq('cuenta_id', cuentaId)
    if (error) throw new Error(errMsg(error, 'Error al cargar ítems de la venta'))
    const lineas: AdicionItem[] = []
    for (const c of (data ?? []) as unknown as { items: { cantidad: number; carta_item: { nombre: string; precio_venta: number | null } | null }[] }[]) {
      for (const it of c.items ?? []) {
        const precio = it.carta_item?.precio_venta ?? 0
        lineas.push({ nombre: it.carta_item?.nombre ?? 'Ítem', cantidad: it.cantidad, precio_unitario: precio, subtotal: precio * it.cantidad })
      }
    }
    return lineas
  }, [supabase])

  // Editar personas/cliente/facturación después del cobro (asignación rápida,
  // mismo patrón que categoria_gasto en Compras).
  const actualizarCuenta = useCallback(async (id: string, datos: Partial<Pick<Cuenta, 'cantidad_personas' | 'cliente_nombre' | 'facturado'>>) => {
    const { error } = await supabase.from('cuentas').update(datos).eq('id', id)
    if (error) throw new Error(errMsg(error, 'Error al actualizar la venta'))
  }, [supabase])

  return { fetchPeriodo, fetchAdiciones, actualizarCuenta }
}
