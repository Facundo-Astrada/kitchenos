'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
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

export interface NotaCalendario {
  id: string
  restaurante_id: string
  fecha: string          // 'YYYY-MM-DD'
  contenido: string
  autor_id: string | null
  created_at: string
  updated_at: string
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
  const [notas, setNotas] = useState<Record<string, NotaCalendario>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])

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

      // 4. Notas del mes (vinculadas a la fecha, no al evento)
      const { data: notasData, error: notasErr } = await supabase
        .from('calendario_notas')
        .select('*')
        .eq('restaurante_id', restIdRef.current)
        .gte('fecha', primerDia)
        .lte('fecha', ultimoDia)

      if (notasErr) throw notasErr
      setNotas(prev => {
        const next = { ...prev }
        for (const n of (notasData ?? []) as NotaCalendario[]) next[n.fecha] = n
        return next
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar eventos del calendario'
      console.error('[useCalendario] fetchEventos Error:', msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  /* Guarda (o borra si queda vacía) la nota de un día — upsert por (restaurante_id, fecha) */
  const guardarNota = useCallback(async (fecha: string, contenido: string) => {
    if (!restIdRef.current) return
    const trimmed = contenido
    if (trimmed.trim() === '') {
      setNotas(prev => {
        const existente = prev[fecha]
        if (!existente) return prev
        const next = { ...prev }
        delete next[fecha]
        return next
      })
      const { error } = await supabase
        .from('calendario_notas')
        .delete()
        .eq('restaurante_id', restIdRef.current)
        .eq('fecha', fecha)
      if (error) console.error('[useCalendario] guardarNota (delete) Error:', error.message)
      return
    }

    try {
      const { data, error } = await supabase
        .from('calendario_notas')
        .upsert(
          { restaurante_id: restIdRef.current, fecha, contenido: trimmed, updated_at: new Date().toISOString() },
          { onConflict: 'restaurante_id,fecha' },
        )
        .select('*')
        .single()
      if (error) throw error
      setNotas(prev => ({ ...prev, [fecha]: data as NotaCalendario }))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al guardar la nota'
      console.error('[useCalendario] guardarNota Error:', msg)
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

  /* Mes actualmente pedido por la pantalla — el realtime debe refetchear ESE
     mes, no "hoy": si estás navegando septiembre y alguien crea un evento,
     un refetch de agosto te lo esconde. */
  const mesActualRef = useRef<{ mes: number; anio: number } | null>(null)
  const fetchEventosTracked = useCallback(async (mes: number, anio: number) => {
    mesActualRef.current = { mes, anio }
    await fetchEventos(mes, anio)
  }, [fetchEventos])

  /* Initial fetch + Realtime */
  useEffect(() => {
    const now = new Date()
    fetchEventosTracked(now.getMonth() + 1, now.getFullYear())
    fetchProveedores()

    const ch = supabase
      .channel('eventos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos' }, () => {
        const actual = mesActualRef.current ?? { mes: now.getMonth() + 1, anio: now.getFullYear() }
        fetchEventos(actual.mes, actual.anio)
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID])

  return {
    eventos,
    proveedores,
    notas,
    loading,
    error,
    fetchEventos: fetchEventosTracked,
    crearEvento,
    actualizarEvento,
    eliminarEvento,
    guardarNota,
  }
}
