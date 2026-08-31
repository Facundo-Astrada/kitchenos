'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import { tieneCarga } from '@/lib/reservas/helpers'

/* ─── Types ─── */

export type TipoEvento =
  | 'entrega_proveedor'
  | 'reserva_especial'
  | 'reservas_dia'
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
  /* flag for auto-generated menú-activado events */
  _fromMenu?: boolean
  /* flag for auto-generated reservas-del-día events (PLAN-4-CAPAS B9) */
  _fromReserva?: boolean
}

export interface Proveedor {
  id: string
  nombre: string
  restaurante_id: string
}

export interface NotaItemCalendario {
  id: string
  restaurante_id: string
  fecha: string          // 'YYYY-MM-DD'
  texto: string
  orden: number
  plaza: string | null
  tarea_id: string | null
  created_at: string
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
  reservas_dia:        { label: 'Reservas',          icon: 'event_seat',       color: '#14b8a6' },
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
  const [notaItems, setNotaItems] = useState<Record<string, NotaItemCalendario[]>>({})
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

      // 4. Auto-generate from menús activados (tareas con menu_id, turno_fecha) —
      // el sistema real de Planificación/Producción. Un evento por (menú, día).
      const { data: tareasMenu } = await supabase
        .from('tareas')
        .select('turno_fecha, menu_id')
        .eq('restaurante_id', restIdRef.current)
        .not('menu_id', 'is', null)
        .gte('turno_fecha', primerDia)
        .lte('turno_fecha', ultimoDia)

      const menuEventos: EventoCalendario[] = []
      const menuIdsDelMes = [...new Set((tareasMenu ?? []).map(t => t.menu_id as string))]
      if (menuIdsDelMes.length > 0) {
        const { data: menusData } = await supabase
          .from('menus')
          .select('id, nombre, tipo')
          .in('id', menuIdsDelMes)
        const menusPorId = new Map((menusData ?? []).map(m => [m.id as string, m as { id: string; nombre: string; tipo: string }]))

        const seenMenuDia = new Set<string>()
        for (const row of (tareasMenu ?? [])) {
          const fecha = row.turno_fecha as string
          const menuId = row.menu_id as string
          const key = `${menuId}_${fecha}`
          if (seenMenuDia.has(key)) continue
          seenMenuDia.add(key)
          const menu = menusPorId.get(menuId)
          if (!menu) continue
          menuEventos.push({
            id: `menu-${menuId}-${fecha}`,
            titulo: `Menú: ${menu.nombre}`,
            descripcion: 'Activado desde Planificación / Calendario',
            tipo: 'otro' as TipoEvento,
            fecha_inicio: fecha,
            fecha_fin: null,
            hora_inicio: '00:00:00',
            hora_fin: '23:59:00',
            recurrente: false,
            frecuencia: null,
            color: menu.tipo === 'evento' ? '#8b5cf6' : '#0ea5e9',
            proveedor_id: null,
            usuario_id: null,
            restaurante_id: restIdRef.current,
            created_at: '',
            _fromMenu: true,
          })
        }
      }

      // 5. Auto-generate from reservas (PLAN-4-CAPAS B9) — reflejo de solo
      // lectura, un evento por día con el resumen (no uno por reserva, para
      // no saturar la grilla del mes).
      const { data: reservasMes } = await supabase
        .from('reservas')
        .select('fecha, pax, estado')
        .eq('restaurante_id', restIdRef.current)
        .gte('fecha', primerDia)
        .lte('fecha', ultimoDia)

      const porFechaReservas = new Map<string, { count: number; pax: number }>()
      for (const row of (reservasMes ?? [])) {
        if (!tieneCarga(row.estado)) continue
        const acc = porFechaReservas.get(row.fecha) ?? { count: 0, pax: 0 }
        acc.count += 1
        acc.pax += row.pax as number
        porFechaReservas.set(row.fecha, acc)
      }
      const reservaEventos: EventoCalendario[] = [...porFechaReservas.entries()].map(([fecha, { count, pax }]) => ({
        id: `reservas-${fecha}`,
        titulo: `${count} reserva${count > 1 ? 's' : ''} · ${pax} cubiertos`,
        descripcion: 'Reflejo de solo lectura desde /reservas',
        tipo: 'reservas_dia' as TipoEvento,
        fecha_inicio: fecha,
        fecha_fin: null,
        hora_inicio: '00:00:00',
        hora_fin: '23:59:00',
        recurrente: false,
        frecuencia: null,
        color: TIPO_CONFIG.reservas_dia.color,
        proveedor_id: null,
        usuario_id: null,
        restaurante_id: restIdRef.current,
        created_at: '',
        _fromReserva: true,
      }))

      setEventos([...eventosDb, ...pedidoEventos, ...prodEventos, ...menuEventos, ...reservaEventos])

      // 5. Ítems de nota del mes (vinculados a la fecha, uno por línea escrita)
      const { data: itemsData, error: itemsErr } = await supabase
        .from('calendario_nota_items')
        .select('*')
        .eq('restaurante_id', restIdRef.current)
        .gte('fecha', primerDia)
        .lte('fecha', ultimoDia)
        .order('created_at', { ascending: true })

      if (itemsErr) throw itemsErr
      // Se re-inicializan TODOS los días del rango pedido (no solo los que
      // trajeron filas) para que un día que se quedó sin ítems no arrastre
      // el estado local viejo.
      const porFecha: Record<string, NotaItemCalendario[]> = {}
      for (let d = new Date(primerDia + 'T12:00:00'); d <= new Date(ultimoDia + 'T12:00:00'); d.setDate(d.getDate() + 1)) {
        porFecha[d.toISOString().slice(0, 10)] = []
      }
      for (const it of (itemsData ?? []) as NotaItemCalendario[]) {
        if (!porFecha[it.fecha]) porFecha[it.fecha] = []
        porFecha[it.fecha].push(it)
      }
      setNotaItems(prev => ({ ...prev, ...porFecha }))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar eventos del calendario'
      console.error('[useCalendario] fetchEventos Error:', msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  /* Agrega un ítem de nota (una línea) al final del día */
  const agregarNotaItem = useCallback(async (fecha: string, texto: string) => {
    if (!restIdRef.current || !texto.trim()) return
    try {
      // El orden de la lista lo da created_at (server-side, sin ambigüedad),
      // no un contador calculado en el cliente — dos ítems agregados en
      // rápida sucesión podían pisarse el mismo índice.
      const { data, error } = await supabase
        .from('calendario_nota_items')
        .insert({ restaurante_id: restIdRef.current, fecha, texto: texto.trim() })
        .select('*')
        .single()
      if (error) throw error
      setNotaItems(prev => ({ ...prev, [fecha]: [...(prev[fecha] ?? []), data as NotaItemCalendario] }))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al agregar el ítem'
      console.error('[useCalendario] agregarNotaItem Error:', msg)
      throw new Error(msg)
    }
  }, [supabase])

  const eliminarNotaItem = useCallback(async (id: string, fecha: string) => {
    try {
      setNotaItems(prev => ({ ...prev, [fecha]: (prev[fecha] ?? []).filter(it => it.id !== id) }))
      const { error } = await supabase.from('calendario_nota_items').delete().eq('id', id)
      if (error) throw error
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar el ítem'
      console.error('[useCalendario] eliminarNotaItem Error:', msg)
    }
  }, [supabase])

  /* Marca el ítem con la plaza elegida + la tarea de Producción que se creó a partir de él */
  const asignarPlazaNotaItem = useCallback(async (id: string, fecha: string, plaza: string, tareaId: string) => {
    try {
      setNotaItems(prev => ({
        ...prev,
        [fecha]: (prev[fecha] ?? []).map(it => it.id === id ? { ...it, plaza, tarea_id: tareaId } : it),
      }))
      const { error } = await supabase.from('calendario_nota_items').update({ plaza, tarea_id: tareaId }).eq('id', id)
      if (error) throw error
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al enviar el ítem a Producción'
      console.error('[useCalendario] asignarPlazaNotaItem Error:', msg)
      throw new Error(msg)
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos', filter: `restaurante_id=eq.${RESTAURANTE_ID}` }, () => {
        const actual = mesActualRef.current ?? { mes: now.getMonth() + 1, anio: now.getFullYear() }
        fetchEventos(actual.mes, actual.anio)
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID])

  return {
    eventos,
    proveedores,
    notaItems,
    loading,
    error,
    fetchEventos: fetchEventosTracked,
    crearEvento,
    actualizarEvento,
    eliminarEvento,
    agregarNotaItem,
    eliminarNotaItem,
    asignarPlazaNotaItem,
  }
}
