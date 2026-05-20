'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import { useAuth } from '@/lib/auth/context'
import type { Merma, MotivoMerma, TurnoMerma } from '@/types'

export function useMerma() {
  const RESTAURANTE_ID = useRestauranteId()
  const ridRef = useRef(RESTAURANTE_ID)
  ridRef.current = RESTAURANTE_ID
  const { perfil } = useAuth()
  const [supabase] = useState(() => createClient())
  const [registros, setRegistros] = useState<Merma[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMerma = useCallback(async (desde?: string, hasta?: string) => {
    const rid = ridRef.current
    if (!rid) { setLoading(false); return }
    setLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('merma')
        .select('*')
        .eq('restaurante_id', rid)
        .order('created_at', { ascending: false })

      if (desde) query = query.gte('fecha', desde)
      if (hasta) query = query.lte('fecha', hasta)

      const { data, error: err } = await query
      if (err) throw err
      setRegistros(data ?? [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar registros de merma'
      console.error('[useMerma] Error:', msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const registrarMerma = useCallback(async (data: {
    producto_nombre: string
    producto_id?: string | null
    cantidad: number
    unidad: string
    motivo: MotivoMerma
    motivo_detalle?: string
    costo_estimado?: number
  }) => {
    const rid = ridRef.current
    if (!rid) throw new Error('Sin restaurante')

    try {
      // Determine turno based on current hour
      const hour = new Date().getHours()
      const turno: TurnoMerma = hour < 12 ? 'apertura' : hour < 18 ? 'servicio' : 'cierre'

      const { error: err } = await supabase.from('merma').insert({
        producto_nombre: data.producto_nombre,
        producto_id: data.producto_id ?? null,
        cantidad: data.cantidad,
        unidad: data.unidad,
        motivo: data.motivo,
        motivo_detalle: data.motivo_detalle ?? null,
        plaza: perfil?.rol && !['admin', 'chef'].includes(perfil.rol) ? perfil.rol : null,
        usuario_id: perfil?.miembro_id ?? null,
        usuario_nombre: perfil ? `${perfil.nombre} ${perfil.apellido}`.trim() : null,
        fecha: new Date().toISOString().split('T')[0],
        turno,
        costo_estimado: data.costo_estimado ?? 0,
        restaurante_id: rid,
      })

      if (err) throw err

      // Subtract from stock if producto_id provided
      if (data.producto_id) {
        const { data: prod, error: prodErr } = await supabase
          .from('productos')
          .select('stock_actual')
          .eq('id', data.producto_id)
          .single()

        if (prodErr && prodErr.code !== 'PGRST116') throw prodErr

        if (prod) {
          const newStock = Math.max(0, (prod.stock_actual ?? 0) - data.cantidad)
          const { error: updErr } = await supabase.from('productos').update({ stock_actual: newStock }).eq('id', data.producto_id)
          if (updErr) throw updErr
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al registrar merma'
      console.error('[useMerma] registrarMerma Error:', msg)
      throw new Error(msg)
    }
  }, [supabase, perfil])

  const eliminarMerma = useCallback(async (id: string) => {
    try {
      const { error: err } = await supabase.from('merma').delete().eq('id', id)
      if (err) throw err
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar registro de merma'
      console.error('[useMerma] eliminarMerma Error:', msg)
      throw new Error(msg)
    }
  }, [supabase])

  useEffect(() => {
    fetchMerma()
  }, [fetchMerma, RESTAURANTE_ID])

  return { registros, loading, error, fetchMerma, registrarMerma, eliminarMerma }
}
