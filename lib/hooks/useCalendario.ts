'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'

/* ─── Types ─── */

export type TipoEvento =
  | 'entrega_proveedor'
  | 'reserva_especial'
  | 'evento_equipo'
  | 'mantenimiento'
  | 'capacitacion'
  | 'visita_bromatologia'
  | 'otro'

export interface EventoCalendario {
  id: string
  titulo: string
  descripcion: string | null
  tipo: TipoEvento
  fecha_inicio: string          // 'YYYY-MM-DD'
  fecha_fin: string | null
  hora_inicio: string           // 'HH:MM:SS'
  hora_fin: string              // 'HH:MM:SS'
  recurrente: boolean
  frecuencia: string | null
  color: string | null
  proveedor_id: string | null
  usuario_id: string | null
  restaurante_id: string
  created_at: string
  /* flag for auto-generated pedido events */
  _fromPedido?: boolean
}

export interface Proveedor {
  id: string
  nombre: string
  restaurante_id: string
}

interface PedidoRow {
  id: string
  proveedor_nombre: string
  fecha_entrega_esperada: string
  status: string
  restaurante_id: string
}

export const TIPO_CONFIG: Record<TipoEvento, { label: string; icon: string; color: string }> = {
  entrega_proveedor:   { label: 'Entrega',           icon: 'local_shipping',    color: '#f97316' },
  reserva_especial:    { label: 'Reserva especial',  icon: 'restaurant',        color: '#8b5cf6' },
  evento_equipo:       { label: 'Evento equipo',     icon: 'groups',            color: '#3b82f6' },
  mantenimiento:       { label: 'Mantenimiento',     icon: 'build',             color: '#ef4444' },
  capacitacion:        { label: 'Capacitación',      icon: 'school',            color: '#10b981' },
  visita_bromatologia: { label: 'Bromatología',      icon: 'verified_user',     color: '#ec4899' },
  otro:                { label: 'Otro',               icon: 'event',             color: '#6b7280' },
}

/* ─── Hook ─── */

export function useCalendario() {
  const RESTAURANTE_ID = useRestauranteId()
  const restIdRef = useRef(RESTAURANTE_ID)
  restIdRef.current = RESTAURANTE_ID
  const [eventos, setEventos] = useState<EventoCalendario[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  /* Fetch eventos for a given month + auto-gen from pedidos */
  const fetchEventos = useCallback(async (mes: number, anio: number) => {
    if (!restIdRef.current) { setLoading(false); return }
    setLoading(true)
    setError(null)

    try {
      const primerDia = `${anio}-${String(mes).padStart(2, '0')}-01`
      const ultimoDiaDt = new Date(anio, mes, 0) // last day of month
      const ultimoDia = `${anio}-${String(mes).padStart(2, '0')}-${String(ultimoDiaDt.getDate()).padStart(2, '0')}`

      // 1. Eventos from DB
      const { data: evts, error: evtsErr } = await supabase
        .from('eventos')
        .select('*')
        .eq('restaurante_id', restIdRef.current)
        .gte('fecha_inicio', primerDia)
        .lte('fecha_inicio', ultimoDia)
        .order('fecha_inicio', { ascending: true })

      if (evtsErr) throw evtsErr

      const eventosDb = (evts ?? []) as EventoCalendario[]

      // 2. Auto-generate from pedidos with fecha_entrega_esperada in range
      const { data: pedidos, error: pedErr } = await supabase
        .from('pedidos')
        .select('id, proveedor_nombre, fecha_entrega_esperada, status, restaurante_id')
        .eq('restaurante_id', restIdRef.current)
        .gte('fecha_entrega_esperada', primerDia)
        .lte('fecha_entrega_esperada', ultimoDia)

      if (pedErr) throw pedErr

      const pedidoEventos: EventoCalendario[] = (pedidos ?? []).map((p: PedidoRow) => ({
        id: `pedido-${p.id}`,
        titulo: `Entrega de ${p.proveedor_nombre}`,
        descripcion: `Pedido ${p.status}`,
        tipo: 'entrega_proveedor' as TipoEvento,
        fecha_inicio: p.fecha_entrega_esperada,
        fecha_fin: null,
        hora_inicio: '08:00:00',
        hora_fin: '09:00:00',
        recurrente: false,
        frecuencia: null,
        color: TIPO_CONFIG.entrega_proveedor.color,
        proveedor_id: null,
        usuario_id: null,
        restaurante_id: p.restaurante_id,
        created_at: '',
        _fromPedido: true,
      }))

      // 3. Auto-generate from produccion_diaria (OPS Planificación/Menú)
      const { data: prodDias } = await supabase
        .from('produccion_diaria')
        .select('fecha, menu_tag')
        .eq('restaurante_id', restIdRef.current)
        .gte('fecha', primerDia)
        .lte('fecha', ultimoDia)

      // Deduplicate by fecha+menu_tag
      const seenProd = new Set<string>()
      const prodEventos: EventoCalendario[] = []
      for (const row of (prodDias ?? [])) {
        const key = `${row.fecha}_${row.menu_tag ?? ''}`
        if (seenProd.has(key)) continue
        seenProd.add(key)
        prodEventos.push({
          id: `ops-${row.fecha}-${row.menu_tag ?? 'base'}`,
          titulo: row.menu_tag ? `OPS: ${row.menu_tag}` : 'OPS: Menú del día',
          descripcion: 'Producción planificada desde OPS',
          tipo: 'otro' as TipoEvento,
          fecha_inicio: row.fecha,
          fecha_fin: null,
          hora_inicio: '09:00:00',
          hora_fin: '17:00:00',
          recurrente: false,
          frecuencia: null,
          color: '#10b981',
          proveedor_id: null,
          usuario_id: null,
          restaurante_id: restIdRef.current,
          created_at: '',
        })
      }

      setEventos([...eventosDb, ...pedidoEventos, ...prodEventos])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar eventos del calendario'
      console.error('[useCalendario] fetchEventos Error:', msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  /* CRUD */
  const crearEvento = useCallback(async (datos: Omit<EventoCalendario, 'id' | 'created_at' | '_fromPedido'>) => {
    try {
      const { error } = await supabase.from('eventos').insert({
        ...datos,
        restaurante_id: restIdRef.current,
      })
      if (error) throw error
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al crear evento'
      console.error('[useCalendario] crearEvento Error:', msg)
      throw new Error(msg)
    }
  }, [supabase])

  const actualizarEvento = useCallback(async (id: string, datos: Partial<EventoCalendario>) => {
    try {
      const { _fromPedido, ...rest } = datos as Partial<EventoCalendario> & { _fromPedido?: boolean }
      void _fromPedido
      const { error } = await supabase.from('eventos').update(rest).eq('id', id)
      if (error) throw error
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar evento'
      console.error('[useCalendario] actualizarEvento Error:', msg)
      throw new Error(msg)
    }
  }, [supabase])

  const eliminarEvento = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('eventos').delete().eq('id', id)
      if (error) throw error
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar evento'
      console.error('[useCalendario] eliminarEvento Error:', msg)
      throw new Error(msg)
    }
  }, [supabase])

  /* Proveedores */
  const fetchProveedores = useCallback(async () => {
    if (!restIdRef.current) return
    try {
      const { data, error } = await supabase
        .from('proveedores')
        .select('id, nombre, restaurante_id')
        .eq('restaurante_id', restIdRef.current)
        .order('nombre')
      if (error) throw error
      setProveedores((data ?? []) as Proveedor[])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar proveedores'
      console.error('[useCalendario] fetchProveedores Error:', msg)
    }
  }, [supabase])

  /* Initial fetch + Realtime */
  useEffect(() => {
    const now = new Date()
    fetchEventos(now.getMonth() + 1, now.getFullYear())
    fetchProveedores()

    const ch = supabase
      .channel('eventos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos' }, () => {
        const n = new Date()
        fetchEventos(n.getMonth() + 1, n.getFullYear())
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID])

  return {
    eventos,
    proveedores,
    loading,
    error,
    fetchEventos,
    crearEvento,
    actualizarEvento,
    eliminarEvento,
  }
}
