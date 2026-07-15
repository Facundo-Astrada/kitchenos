'use client'

import { useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Comanda } from '@/types'
import { useRestauranteId } from './useRestauranteId'

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return fallback
}

export interface LineaCuenta {
  nombre: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

export interface ResumenCuenta {
  lineas: LineaCuenta[]
  subtotal: number
}

/** Calcula el resumen de cuenta a partir de las comandas de la mesa. */
export function calcularResumen(comandas: Comanda[]): ResumenCuenta {
  const lineas: LineaCuenta[] = []
  for (const c of comandas) {
    for (const item of c.items ?? []) {
      const precio = (item.carta_item as unknown as { precio_venta?: number | null })?.precio_venta ?? 0
      const subtotal = precio * item.cantidad
      lineas.push({
        nombre: item.carta_item?.nombre ?? 'Ítem',
        cantidad: item.cantidad,
        precio_unitario: precio,
        subtotal,
      })
    }
  }
  const subtotal = lineas.reduce((s, l) => s + l.subtotal, 0)
  return { lineas, subtotal }
}

export interface PagoInput {
  medio_id: string
  monto: number
}

export interface ResultadoFiscal {
  estado:          'emitido' | 'pendiente' | 'rechazado'
  cae?:            string
  cae_vencimiento?: string
  numero?:         number
  qr_data?:        string
  error?:          string
  comprobante_id?: string
}

/**
 * Cierra una cuenta: registra pagos, propina, actualiza cuenta → cerrada,
 * actualiza mesa → libre. Luego dispara emisión fiscal en paralelo (fire-and-forget).
 */
export function useCuenta() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  async function cobrarCuenta(params: {
    cuentaId: string
    mesaId: string
    pagos: PagoInput[]
    propina: number
    total: number    // subtotal (sin propina)
    cajaTurnoId?: string | null
    cantidadPersonas?: number | null
  }): Promise<{ fiscal?: ResultadoFiscal }> {
    const { cuentaId, mesaId, pagos, propina, total, cajaTurnoId, cantidadPersonas } = params
    try {
      // 1. Registrar pagos
      if (pagos.length > 0) {
        const { error: pagosError } = await supabase.from('pagos').insert(
          pagos.map(p => ({
            cuenta_id: cuentaId,
            medio_id: p.medio_id,
            monto: p.monto,
            propina: propina / pagos.length,
          }))
        )
        if (pagosError) throw pagosError
      }

      // 2. Cerrar la cuenta
      const totalConPropina = total + propina
      const { error: cuentaError } = await supabase
        .from('cuentas')
        .update({
          estado: 'cerrada', total: totalConPropina, cerrada_at: new Date().toISOString(),
          caja_turno_id: cajaTurnoId ?? null,
          ...(cantidadPersonas != null ? { cantidad_personas: cantidadPersonas } : {}),
        })
        .eq('id', cuentaId)
      if (cuentaError) throw cuentaError

      // 3. Liberar la mesa
      const { error: mesaError } = await supabase.from('mesas').update({ estado: 'libre' }).eq('id', mesaId)
      if (mesaError) throw mesaError

      // 4. Merma automática (fire-and-forget — no bloquea)
      if (RESTAURANTE_ID) {
        fetch('/api/salon/merma-auto', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ cuenta_id: cuentaId, restaurante_id: RESTAURANTE_ID }),
        }).catch(() => {})
      }

      // 5. Emisión fiscal (no bloquea el cobro — si falla queda 'pendiente' en DB)
      let fiscal: ResultadoFiscal | undefined
      try {
        const resp = await fetch('/api/fiscal/emitir', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            cuenta_id: cuentaId,
            total:     totalConPropina,
            subtotal:  total,
            propina,
          }),
        })
        if (resp.ok) {
          fiscal = await resp.json() as ResultadoFiscal
        } else {
          fiscal = { estado: 'pendiente', error: `HTTP ${resp.status}` }
        }
      } catch (fe: unknown) {
        const msg = fe instanceof Error ? fe.message : 'Error fiscal'
        fiscal = { estado: 'pendiente', error: msg }
      }

      // 6. "Facturado" (pestaña Ventas) refleja la emisión fiscal real, no un
      // flag manual — si no hay fiscal configurado queda 'pendiente' → false.
      if (fiscal?.estado === 'emitido') {
        await supabase.from('cuentas').update({ facturado: true }).eq('id', cuentaId)
      }

      return { fiscal }
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al cobrar la cuenta'))
    }
  }

  async function pedirCuenta(mesaId: string) {
    try {
      const { error } = await supabase.from('mesas').update({ estado: 'cuenta_pedida' }).eq('id', mesaId)
      if (error) throw error
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al pedir la cuenta'))
    }
  }

  return { cobrarCuenta, pedirCuenta, RESTAURANTE_ID }
}
