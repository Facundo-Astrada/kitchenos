'use client'

import { useEffect, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { Proveedor, Factura } from '@/types'
import { useRestauranteId } from './useRestauranteId'

async function fetchProveedoresData(key: string): Promise<Proveedor[]> {
  const rid = key.slice('proveedores-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('proveedores')
    .select('*')
    .eq('restaurante_id', rid)
    .eq('activo', true)
    .order('nombre')
  if (error) throw error
  return data ?? []
}

export function useProveedores() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID ? `proveedores-${RESTAURANTE_ID}` : null

  const { data: proveedores = [], isLoading: loading, error: swrError, mutate } = useSWR(
    swrKey,
    fetchProveedoresData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 300_000,
      keepPreviousData: true,
    }
  )

  const error = (swrError as Error | null)?.message ?? null

  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const channel = supabase
      .channel(`proveedores-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proveedores' }, () => mutate())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [RESTAURANTE_ID, supabase, mutate])

  async function agregarProveedor(
    datos: Omit<Proveedor, 'id' | 'restaurante_id' | 'activo'>
  ) {
    try {
      const { error } = await supabase.from('proveedores').insert({
        ...datos,
        restaurante_id: RESTAURANTE_ID,
      })
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al agregar proveedor'
      console.error('[useProveedores] agregarProveedor Error:', msg)
      throw new Error(msg)
    }
  }

  async function actualizarProveedor(id: string, datos: Partial<Omit<Proveedor, 'id' | 'restaurante_id'>>) {
    try {
      const { error } = await supabase
        .from('proveedores')
        .update(datos)
        .eq('id', id)
      if (error) throw error
      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar proveedor'
      console.error('[useProveedores] actualizarProveedor Error:', msg)
      throw new Error(msg)
    }
  }

  async function eliminarProveedor(id: string) {
    try {
      const { error } = await supabase
        .from('proveedores')
        .update({ activo: false })
        .eq('id', id)
      if (error) throw error
      mutate((prev) => prev?.filter(p => p.id !== id), { revalidate: false })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar proveedor'
      console.error('[useProveedores] eliminarProveedor Error:', msg)
      throw new Error(msg)
    }
  }

  // ── Facturas por proveedor ──
  async function fetchFacturas(proveedorId: string): Promise<Factura[]> {
    try {
      const { data, error } = await supabase
        .from('facturas')
        .select('*')
        .eq('proveedor_id', proveedorId)
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error
      return data ?? []
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar facturas del proveedor'
      console.error('[useProveedores] fetchFacturas Error:', msg)
      throw new Error(msg)
    }
  }

  async function guardarFactura(factura: Record<string, unknown>) {
    try {
      const { error } = await supabase.from('facturas').insert({
        ...factura,
        restaurante_id: RESTAURANTE_ID,
      })
      if (error) throw error
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al guardar factura'
      console.error('[useProveedores] guardarFactura Error:', msg)
      throw new Error(msg)
    }
  }

  return {
    proveedores,
    loading,
    error,
    refetch: useCallback(() => { mutate() }, [mutate]),
    agregarProveedor,
    actualizarProveedor,
    eliminarProveedor,
    fetchFacturas,
    guardarFactura,
  }
}
