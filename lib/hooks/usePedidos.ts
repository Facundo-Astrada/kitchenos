'use client'

import { useEffect, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { Pedido, PedidoItem, EstadoPedido } from '@/types'
import { useRestauranteId } from './useRestauranteId'

async function fetchPedidosData(key: string): Promise<Pedido[]> {
  const rid = key.slice('pedidos-'.length)
  const supabase = createClient()
  const { data, error } = await supabase.from('pedidos').select('*')
    .eq('restaurante_id', rid)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Pedido[]
}

export function usePedidos() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID ? `pedidos-${RESTAURANTE_ID}` : null

  const { data: pedidos = [], isLoading: loading, error: swrError, mutate } = useSWR(
    swrKey,
    fetchPedidosData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 300_000,
      keepPreviousData: true,
    }
  )

  const error = (swrError as Error | null)?.message ?? null

  const fetchPedidos = useCallback(async () => { await mutate() }, [mutate])

  const fetchItems = useCallback(async (pedidoId: string): Promise<PedidoItem[]> => {
    try {
      const { data, error } = await supabase.from('pedido_items').select('*')
        .eq('pedido_id', pedidoId)
      if (error) throw error
      return (data ?? []) as PedidoItem[]
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar items del pedido'
      console.error('[usePedidos] fetchItems Error:', msg)
      throw new Error(msg)
    }
  }, [supabase])

  // Fetch products previously bought from this proveedor (via factura_items)
  const fetchProductosProveedor = useCallback(async (proveedorNombre: string) => {
    try {
      // Get facturas from this proveedor
      const { data: facturas, error: facError } = await supabase.from('facturas').select('id')
        .eq('restaurante_id', RESTAURANTE_ID)
        .ilike('proveedor_nombre', proveedorNombre)
      if (facError) throw facError
      if (!facturas?.length) return []

      const facturaIds = facturas.map(f => f.id)
      const { data: items, error: itemsError } = await supabase.from('factura_items').select('producto_nombre, unidad, precio_unitario')
        .in('factura_id', facturaIds)
      if (itemsError) throw itemsError
      if (!items?.length) return []

      // Deduplicate by nombre, keep latest price
      const map = new Map<string, { producto_nombre: string; unidad: string; precio_unitario: number }>()
      for (const item of items) {
        map.set(item.producto_nombre.toLowerCase(), {
          producto_nombre: item.producto_nombre,
          unidad: item.unidad,
          precio_unitario: item.precio_unitario,
        })
      }
      return Array.from(map.values())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar productos del proveedor'
      console.error('[usePedidos] fetchProductosProveedor Error:', msg)
      return []
    }
  }, [RESTAURANTE_ID, supabase])

  const crearPedido = useCallback(async (datos: {
    proveedor_id: string | null
    proveedor_nombre: string
    fecha_entrega_esperada?: string | null
    notas?: string | null
    items: { producto_nombre: string; producto_id?: string | null; cantidad: number; unidad: string; precio_estimado: number }[]
  }) => {
    try {
      const total = datos.items.reduce((s, it) => s + it.cantidad * it.precio_estimado, 0)

      const { data: pedido, error } = await supabase.from('pedidos').insert({
        proveedor_id: datos.proveedor_id,
        proveedor_nombre: datos.proveedor_nombre,
        fecha_pedido: new Date().toISOString().slice(0, 10),
        fecha_entrega_esperada: datos.fecha_entrega_esperada || null,
        status: 'borrador',
        notas: datos.notas || null,
        total_estimado: total,
        restaurante_id: RESTAURANTE_ID,
      }).select('id').single()

      if (error || !pedido) throw new Error(error?.message || 'Error al crear pedido')

      // Insert items
      const itemsToInsert = datos.items.map(it => ({
        pedido_id: pedido.id,
        producto_id: it.producto_id || null,
        producto_nombre: it.producto_nombre,
        cantidad: it.cantidad,
        unidad: it.unidad,
        precio_estimado: it.precio_estimado,
        recibido: false,
        cantidad_recibida: null,
      }))

      const { error: itemsErr } = await supabase.from('pedido_items').insert(itemsToInsert)
      if (itemsErr) throw itemsErr

      await fetchPedidos()
      return pedido.id
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al crear pedido'
      console.error('[usePedidos] crearPedido Error:', msg)
      throw new Error(msg)
    }
  }, [fetchPedidos, RESTAURANTE_ID, supabase])

  const actualizarStatus = useCallback(async (id: string, status: EstadoPedido) => {
    try {
      const { error } = await supabase.from('pedidos').update({ status }).eq('id', id)
      if (error) throw error
      await fetchPedidos()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar estado del pedido'
      console.error('[usePedidos] actualizarStatus Error:', msg)
      throw new Error(msg)
    }
  }, [fetchPedidos, supabase])

  const marcarItemRecibido = useCallback(async (itemId: string, recibido: boolean, cantidadRecibida?: number) => {
    try {
      const { error } = await supabase.from('pedido_items').update({
        recibido,
        cantidad_recibida: cantidadRecibida ?? null,
      }).eq('id', itemId)
      if (error) throw error
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al marcar item como recibido'
      console.error('[usePedidos] marcarItemRecibido Error:', msg)
      throw new Error(msg)
    }
  }, [supabase])

  // Receive full order: update stock for all received items
  const recibirPedido = useCallback(async (pedidoId: string, items: PedidoItem[]) => {
    try {
      const todosRecibidos = items.every(it => it.recibido)
      const algunoRecibido = items.some(it => it.recibido)
      const nuevoStatus: EstadoPedido = todosRecibidos ? 'recibido' : algunoRecibido ? 'parcial' : 'enviado'

      // Update each item
      for (const item of items) {
        const { error: itemErr } = await supabase.from('pedido_items').update({
          recibido: item.recibido,
          cantidad_recibida: item.cantidad_recibida,
        }).eq('id', item.id)
        if (itemErr) throw itemErr

        // Add received quantity to stock
        if (item.recibido) {
          const cantRecibida = item.cantidad_recibida ?? item.cantidad
          if (cantRecibida > 0) {
            // Find product in stock
            const { data: prod } = await supabase.from('productos')
              .select('id, stock_actual')
              .eq('restaurante_id', RESTAURANTE_ID)
              .ilike('nombre', item.producto_nombre)
              .limit(1)
              .single()

            if (prod) {
              const { error: stockErr } = await supabase.from('productos').update({
                stock_actual: (prod.stock_actual || 0) + cantRecibida,
              }).eq('id', prod.id)
              if (stockErr) throw stockErr
            }
          }
        }
      }

      const { error: statusErr } = await supabase.from('pedidos').update({ status: nuevoStatus }).eq('id', pedidoId)
      if (statusErr) throw statusErr
      await fetchPedidos()
      return nuevoStatus
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al recibir pedido'
      console.error('[usePedidos] recibirPedido Error:', msg)
      throw new Error(msg)
    }
  }, [fetchPedidos, RESTAURANTE_ID, supabase])

  const eliminarPedido = useCallback(async (id: string) => {
    try {
      const { error: itemsErr } = await supabase.from('pedido_items').delete().eq('pedido_id', id)
      if (itemsErr) throw itemsErr
      const { error } = await supabase.from('pedidos').delete().eq('id', id)
      if (error) throw error
      await fetchPedidos()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar pedido'
      console.error('[usePedidos] eliminarPedido Error:', msg)
      throw new Error(msg)
    }
  }, [fetchPedidos, supabase])

  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const ch = supabase.channel(`pedidos-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => mutate())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID, supabase, mutate])

  return {
    pedidos, loading, error,
    fetchPedidos, fetchItems, fetchProductosProveedor,
    crearPedido, actualizarStatus, marcarItemRecibido,
    recibirPedido, eliminarPedido,
  }
}
