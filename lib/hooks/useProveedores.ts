'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Proveedor, Factura } from '@/types'
import { useRestauranteId } from './useRestauranteId'

const _cache = new Map<string, Proveedor[]>()

export function useProveedores() {
  const RESTAURANTE_ID = useRestauranteId()
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const fetchProveedores = useCallback(async (showLoading = true) => {
    if (!RESTAURANTE_ID) { setLoading(false); return }

    const cached = _cache.get(RESTAURANTE_ID)
    if (cached) {
      setProveedores(cached)
      setLoading(false)
    } else if (showLoading) {
      setLoading(true)
    }
    setError(null)

    try {
      const { data, error } = await supabase
        .from('proveedores')
        .select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .eq('activo', true)
        .order('nombre')

      if (error) throw error
      const result = data ?? []
      _cache.set(RESTAURANTE_ID, result)
      setProveedores(result)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar proveedores'
      console.error('[useProveedores] Error:', msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [RESTAURANTE_ID, supabase])

  useEffect(() => {
    fetchProveedores()

    const channel = supabase
      .channel('proveedores-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'proveedores' },
        () => fetchProveedores(false)
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchProveedores])

  async function agregarProveedor(
    datos: Omit<Proveedor, 'id' | 'restaurante_id' | 'activo'>
  ) {
    try {
      const { error } = await supabase.from('proveedores').insert({
        ...datos,
        restaurante_id: RESTAURANTE_ID,
      })
      if (error) throw error
      await fetchProveedores()
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
      await fetchProveedores()
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
      setProveedores(prev => prev.filter(p => p.id !== id))
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
    refetch: fetchProveedores,
    agregarProveedor,
    actualizarProveedor,
    eliminarProveedor,
    fetchFacturas,
    guardarFactura,
  }
}
