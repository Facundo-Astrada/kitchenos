'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type {
  Factura, FacturaItem, FacturaStatus, TipoFactura,
  CondicionPago, PrecioHistorial,
} from '@/types'
import { useRestauranteId } from './useRestauranteId'
import { resolverProductosDeItems, aplicarEfectosDeFactura, type ItemFacturaInput } from '@/lib/facturas/matching'

const PAGE_SIZE = 20

export function useFacturas() {
  const RESTAURANTE_ID = useRestauranteId()
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pageRef = useRef(0)
  const [hasMore, setHasMore] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const supabase = useMemo(() => createClient(), [])

  const fetchFacturas = useCallback(async (reset = true, showLoading = true) => {
    if (!RESTAURANTE_ID) { setLoading(false); return }
    if (showLoading) setLoading(true)
    setError(null)

    const currentPage = reset ? 0 : pageRef.current
    const from = currentPage * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    try {
      const { data, error, count } = await supabase.from('facturas').select('*', { count: 'exact' })
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error

      if (reset) {
        setFacturas((data ?? []) as Factura[])
      } else {
        setFacturas(prev => [...prev, ...((data ?? []) as Factura[])])
      }
      if (count != null) setTotalCount(count)
      setHasMore((data?.length ?? 0) === PAGE_SIZE)
      pageRef.current = currentPage + 1
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar facturas'
      console.error('[useFacturas] Error:', msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [RESTAURANTE_ID, supabase])

  const fetchMore = useCallback(() => {
    if (hasMore && !loading) fetchFacturas(false, false)
  }, [hasMore, loading, fetchFacturas])

  const fetchItems = useCallback(async (facturaId: string): Promise<FacturaItem[]> => {
    try {
      const { data, error } = await supabase.from('factura_items').select('*')
        .eq('factura_id', facturaId)
      if (error) throw error
      return (data ?? []) as FacturaItem[]
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar items de factura'
      console.error('[useFacturas] fetchItems Error:', msg)
      throw new Error(msg)
    }
  }, [supabase])

  const crearFactura = useCallback(async (datos: {
    proveedor_nombre: string
    proveedor_cuit?: string | null
    fecha_factura?: string | null
    tipo_factura: TipoFactura
    numero_factura?: string | null
    subtotal: number
    iva_total: number
    total: number
    condicion_pago: CondicionPago
    imagen_url?: string | null
    notas?: string | null
    categoria_gasto_id?: string | null
    medio_pago_id?: string | null
    fecha_vencimiento?: string | null
    items: ItemFacturaInput[]
  }) => {
    try {
      if (!RESTAURANTE_ID) throw new Error('Restaurante no cargado todavía — reintentá en un segundo')

      // 1. Resolver producto_id de cada ítem (match contra el stock existente,
      // o crear el producto ahora) — no depende de que la factura ya exista.
      const { items: itemsResueltos, productosCreados } = await resolverProductosDeItems({
        supabase, restauranteId: RESTAURANTE_ID, items: datos.items,
      })

      // 2. Núcleo transaccional: factura + items, en una sola rpc (Postgres
      // los inserta en una única transacción — o entran los dos o no entra
      // ninguno; antes eran dos inserts separados sin nada que los uniera).
      const { data: facturaId, error } = await supabase.rpc('crear_factura_con_items', {
        p_proveedor_nombre: datos.proveedor_nombre,
        p_proveedor_cuit: datos.proveedor_cuit || null,
        p_fecha_factura: datos.fecha_factura || null,
        p_tipo_factura: datos.tipo_factura,
        p_numero_factura: datos.numero_factura || null,
        p_subtotal: datos.subtotal,
        p_iva_total: datos.iva_total,
        p_total: datos.total,
        p_condicion_pago: datos.condicion_pago,
        p_imagen_url: datos.imagen_url || null,
        p_notas: datos.notas || null,
        p_categoria_gasto_id: datos.categoria_gasto_id || null,
        p_medio_pago_id: datos.medio_pago_id || null,
        p_fecha_vencimiento: datos.fecha_vencimiento || null,
        p_items: itemsResueltos.map(it => ({
          producto_nombre: it.producto_nombre,
          producto_id: it.producto_id,
          cantidad: it.cantidad,
          unidad: it.unidad,
          precio_unitario: it.precio_unitario,
          alicuota_iva: it.alicuota_iva,
          subtotal: it.subtotal,
          precio_anterior: it.precio_anterior,
        })),
      })

      if (error || !facturaId) throw new Error(error?.message || 'Error al crear factura')

      // 3. Efectos idempotentes sobre Stock (aparte, dominio-kos.md §4.1): si
      // esto falla, la factura+items ya quedaron escritos enteros — lo que
      // falta es "faltan estos efectos", no un documento roto.
      const { preciosActualizados } = await aplicarEfectosDeFactura({
        supabase, restauranteId: RESTAURANTE_ID, facturaId,
        proveedorNombre: datos.proveedor_nombre, items: itemsResueltos,
      })

      await fetchFacturas(true)
      return { facturaId, preciosActualizados, productosCreados }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al crear factura'
      console.error('[useFacturas] crearFactura Error:', msg)
      throw new Error(msg)
    }
  }, [fetchFacturas, RESTAURANTE_ID, supabase])

  const actualizarFactura = useCallback(async (
    id: string,
    datos: Partial<Omit<Factura, 'id' | 'restaurante_id'>>,
    items?: { producto_nombre: string; producto_id?: string | null; cantidad: number; unidad: string; precio_unitario: number; alicuota_iva: number; subtotal: number; precio_anterior?: number | null }[]
  ) => {
    try {
      const { error } = await supabase.from('facturas').update(datos).eq('id', id)
      if (error) throw error
      if (items !== undefined) {
        await supabase.from('factura_items').delete().eq('factura_id', id)
        if (items.length > 0) {
          const { error: itemsError } = await supabase.from('factura_items').insert(
            items.map(it => ({
              factura_id: id,
              producto_nombre: it.producto_nombre,
              producto_id: it.producto_id || null,
              cantidad: it.cantidad,
              unidad: it.unidad,
              precio_unitario: it.precio_unitario,
              alicuota_iva: it.alicuota_iva,
              subtotal: it.subtotal,
              precio_anterior: it.precio_anterior || null,
            }))
          )
          if (itemsError) throw itemsError
        }
      }
      await fetchFacturas(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar factura'
      console.error('[useFacturas] actualizarFactura Error:', msg)
      throw new Error(msg)
    }
  }, [fetchFacturas, supabase])

  const actualizarStatus = useCallback(async (id: string, status: FacturaStatus) => {
    try {
      const { error } = await supabase.from('facturas').update({ status }).eq('id', id)
      if (error) throw error
      await fetchFacturas(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar estado de factura'
      console.error('[useFacturas] actualizarStatus Error:', msg)
      throw new Error(msg)
    }
  }, [fetchFacturas, supabase])

  const eliminarFactura = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('facturas').delete().eq('id', id)
      if (error) throw error
      await fetchFacturas(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar factura'
      console.error('[useFacturas] eliminarFactura Error:', msg)
      throw new Error(msg)
    }
  }, [fetchFacturas, supabase])

  // Todas las facturas a crédito todavía no pagadas (sin paginar — para "Cuentas por pagar")
  const fetchPorPagar = useCallback(async (): Promise<Factura[]> => {
    if (!RESTAURANTE_ID) return []
    try {
      const { data, error } = await supabase.from('facturas').select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .in('condicion_pago', ['cuenta_corriente', '30dias', '60dias'])
        .neq('status', 'pagada')
        .order('fecha_factura', { ascending: true })
      if (error) throw error
      return (data ?? []) as Factura[]
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar cuentas por pagar'
      console.error('[useFacturas] fetchPorPagar Error:', msg)
      return []
    }
  }, [RESTAURANTE_ID, supabase])

  // Vincular (o desvincular) una factura con un pedido — reconciliación
  const vincularPedido = useCallback(async (facturaId: string, pedidoId: string | null) => {
    try {
      const { error } = await supabase.from('facturas').update({ pedido_id: pedidoId }).eq('id', facturaId)
      if (error) throw error
      await fetchFacturas(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message
        : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
        : 'Error al vincular pedido'
      console.error('[useFacturas] vincularPedido Error:', msg)
      throw new Error(msg)
    }
  }, [fetchFacturas, supabase])

  const fetchHistorialPrecios = useCallback(async (productoId: string): Promise<PrecioHistorial[]> => {
    try {
      const { data, error } = await supabase.from('precio_historial').select('*')
        .eq('producto_id', productoId)
        .order('fecha', { ascending: true })
        .limit(20)
      if (error) throw error
      return (data ?? []) as PrecioHistorial[]
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar historial de precios'
      console.error('[useFacturas] fetchHistorialPrecios Error:', msg)
      throw new Error(msg)
    }
  }, [supabase])

  useEffect(() => {
    fetchFacturas(true)
    const ch = supabase.channel('facturas-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'facturas', filter: `restaurante_id=eq.${RESTAURANTE_ID}` }, () => fetchFacturas(true, false))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchFacturas, RESTAURANTE_ID])

  return {
    facturas, loading, error,
    hasMore, fetchMore, totalCount,
    fetchFacturas, fetchItems, crearFactura,
    actualizarFactura, actualizarStatus, eliminarFactura, fetchHistorialPrecios,
    fetchPorPagar, vincularPedido,
  }
}
