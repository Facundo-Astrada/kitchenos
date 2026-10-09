'use client'

import { useCallback, useMemo } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { Producto } from '@/types'
import { useRestauranteId } from './useRestauranteId'
import { useProveedores } from './useProveedores'
import { usePedidos } from './usePedidos'
import { useStockSectores } from './useStockSectores'
import { useStockEstantes } from './useStockEstantes'
import { useStockGrupos } from './useStockGrupos'
import { useRestauranteConfig, useGuardarRestauranteConfig } from './useRestauranteConfig'

// Pantalla /pedido-diario (PLAN-PEDIDO-DIARIO-2026-10.md). Productos marcados
// con `pedido_diario`, más lo que hace falta para decidir: última cantidad
// pedida y fecha del último precio. Al cerrar crea un pedido real.

export const CLAVE_CONTEO = 'pedido_diario_conteo'

export interface DatosPedidoDiario {
  productos: Producto[]
  /** producto_id → última cantidad pedida */
  ultimaPedida: Record<string, number>
  /** producto_id → fecha (YYYY-MM-DD) del último cambio de precio */
  fechaPrecio: Record<string, string>
}

async function fetchPedidoDiario(key: string): Promise<DatosPedidoDiario> {
  const rid = key.slice('pedido-diario-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('restaurante_id', rid)
    .eq('activo', true)
    .eq('pedido_diario', true)
    .order('nombre')
  if (error) throw error
  const productos = ((data ?? []) as Producto[]).filter(p => !p.fuera_de_uso)
  const ids = productos.map(p => p.id)
  if (ids.length === 0) return { productos, ultimaPedida: {}, fechaPrecio: {} }

  const [items, precios] = await Promise.all([
    supabase.from('pedido_items')
      .select('producto_id, cantidad, pedidos!inner(restaurante_id, created_at)')
      .eq('pedidos.restaurante_id', rid)
      .in('producto_id', ids)
      .order('created_at', { referencedTable: 'pedidos', ascending: false })
      .limit(600),
    supabase.from('precio_historial')
      .select('producto_id, fecha')
      .eq('restaurante_id', rid)
      .in('producto_id', ids)
      .order('fecha', { ascending: false })
      .limit(600),
  ])
  if (items.error) throw items.error
  if (precios.error) throw precios.error

  // Ya vienen del más nuevo al más viejo: el primero de cada producto gana.
  const ultimaPedida: Record<string, number> = {}
  for (const it of (items.data ?? []) as { producto_id: string | null; cantidad: number }[]) {
    if (it.producto_id && !(it.producto_id in ultimaPedida)) ultimaPedida[it.producto_id] = Number(it.cantidad)
  }
  const fechaPrecio: Record<string, string> = {}
  for (const h of (precios.data ?? []) as { producto_id: string; fecha: string | null }[]) {
    if (h.fecha && !(h.producto_id in fechaPrecio)) fechaPrecio[h.producto_id] = h.fecha
  }
  return { productos, ultimaPedida, fechaPrecio }
}

export interface ItemParaPedir {
  producto_id: string
  producto_nombre: string
  cantidad: number
  unidad: string
  precio_estimado: number
}

export function usePedidoDiario() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])
  const { mutate: mutateGlobal } = useSWRConfig()
  const swrKey = RESTAURANTE_ID ? `pedido-diario-${RESTAURANTE_ID}` : null

  const { data, isLoading, error, mutate } = useSWR(swrKey, fetchPedidoDiario, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    keepPreviousData: true,
  })

  const { proveedores, loading: cargandoProv } = useProveedores()
  const { crearPedido, enviarPedido } = usePedidos()
  const { sectores } = useStockSectores()
  const { estantes } = useStockEstantes()
  const { grupos } = useStockGrupos()
  const { configuracion } = useRestauranteConfig()
  const guardarConfig = useGuardarRestauranteConfig()

  const conteoActivo = configuracion[CLAVE_CONTEO] === true
  const setConteoActivo = useCallback(
    (v: boolean) => guardarConfig({ [CLAVE_CONTEO]: v }),
    [guardarConfig],
  )

  /**
   * Crea el pedido real (queda 'enviado', se recibe desde Compras → Recepción)
   * y, si hubo conteo, pisa `stock_actual` con lo contado.
   */
  const registrarPedido = useCallback(async (opts: {
    proveedorId: string | null
    proveedorNombre: string
    items: ItemParaPedir[]
    nota?: string
    conteos?: Record<string, number>
  }): Promise<string> => {
    if (!RESTAURANTE_ID) throw new Error('Sin restaurante')
    const id = await crearPedido({
      proveedor_id: opts.proveedorId,
      proveedor_nombre: opts.proveedorNombre,
      notas: opts.nota?.trim() || null,
      items: opts.items,
    })
    await enviarPedido(id, null, null)

    const conteos = Object.entries(opts.conteos ?? {})
    if (conteos.length > 0) {
      const resultados = await Promise.all(conteos.map(([productoId, hay]) =>
        supabase.from('productos').update({ stock_actual: hay }).eq('id', productoId).eq('restaurante_id', RESTAURANTE_ID)))
      const fallo = resultados.find(r => r.error)
      if (fallo?.error) console.error('[usePedidoDiario] no se pudo actualizar el stock contado:', fallo.error.message)
      await Promise.all([mutate(), mutateGlobal(`stock-${RESTAURANTE_ID}`)])
    } else {
      await mutate()
    }
    return id
  }, [RESTAURANTE_ID, crearPedido, enviarPedido, supabase, mutate, mutateGlobal])

  return {
    productos: data?.productos ?? [],
    ultimaPedida: data?.ultimaPedida ?? {},
    fechaPrecio: data?.fechaPrecio ?? {},
    proveedores,
    sectores, estantes, grupos,
    loading: !RESTAURANTE_ID || isLoading || cargandoProv,
    error: (error as Error | null)?.message ?? null,
    conteoActivo, setConteoActivo,
    registrarPedido,
    refetch: mutate,
  }
}
