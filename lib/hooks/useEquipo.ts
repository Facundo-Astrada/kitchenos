'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'

// ── Types ──

export interface Miembro {
  id: string
  auth_user_id: string | null
  nombre: string
  apellido: string
  rol: string
  puesto_id: string | null
  plaza_asignada: string | null
  telefono: string | null
  email: string | null
  fecha_ingreso: string | null
  activo: boolean
  foto_url: string | null
  restaurante_id: string
  created_at: string
}

export interface Turno {
  id: string
  miembro_id: string
  fecha: string
  turno_tipo: string
  hora_entrada: string | null
  hora_salida: string | null
  notas: string | null
  restaurante_id: string
  created_at: string
}

export interface Puesto {
  id: string
  nombre: string
  descripcion: string | null
  tareas_funciones: string[] | null
  permisos_app: string[] | null
  restaurante_id: string
  created_at: string
}

export type TurnoTipo = 'mañana' | 'tarde' | 'noche' | 'franco' | 'vacaciones'

export const TURNO_CONFIG: Record<TurnoTipo, { label: string; fullLabel: string; color: string; bg: string }> = {
  mañana: { label: 'M', fullLabel: 'Mañana', color: '#f59e0b', bg: '#fef3c7' },
  tarde: { label: 'T', fullLabel: 'Tarde', color: '#3b82f6', bg: '#dbeafe' },
  noche: { label: 'N', fullLabel: 'Noche', color: '#4361a0', bg: '#e0e7ff' },
  franco: { label: 'F', fullLabel: 'Franco', color: '#6b7280', bg: '#f3f4f6' },
  vacaciones: { label: 'V', fullLabel: 'Vacaciones', color: '#10b981', bg: '#d1fae5' },
}

// ── Hook ──

export function useEquipo() {
  const RESTAURANTE_ID = useRestauranteId()
  const [miembros, setMiembros] = useState<Miembro[]>([])
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [puestos, setPuestos] = useState<Puesto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  // ── Miembros ──

  const fetchMiembros = useCallback(async () => {
    if (!RESTAURANTE_ID) { setLoading(false); return }
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase
        .from('equipo_miembros')
        .select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .eq('activo', true)
        .order('nombre')

      if (error) throw error
      setMiembros(data ?? [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar miembros del equipo'
      console.error('[useEquipo] fetchMiembros Error:', msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [RESTAURANTE_ID, supabase])

  async function crearMiembro(
    datos: Omit<Miembro, 'id' | 'restaurante_id' | 'created_at' | 'activo'>
  ) {
    try {
      const { error } = await supabase.from('equipo_miembros').insert({
        ...datos,
        activo: true,
        restaurante_id: RESTAURANTE_ID,
      })
      if (error) throw error
      await fetchMiembros()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al crear miembro'
      console.error('[useEquipo] crearMiembro Error:', msg)
      throw new Error(msg)
    }
  }

  async function actualizarMiembro(id: string, datos: Partial<Omit<Miembro, 'id' | 'restaurante_id' | 'created_at'>>) {
    try {
      const { error } = await supabase
        .from('equipo_miembros')
        .update(datos)
        .eq('id', id)
      if (error) throw error
      await fetchMiembros()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar miembro'
      console.error('[useEquipo] actualizarMiembro Error:', msg)
      throw new Error(msg)
    }
  }

  async function desactivarMiembro(id: string) {
    try {
      const { error } = await supabase
        .from('equipo_miembros')
        .update({ activo: false })
        .eq('id', id)
      if (error) throw error
      setMiembros((prev) => prev.filter((m) => m.id !== id))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al desactivar miembro'
      console.error('[useEquipo] desactivarMiembro Error:', msg)
      throw new Error(msg)
    }
  }

  // ── Turnos ──

  const fetchTurnos = useCallback(async (weekStart: string, weekEnd: string) => {
    try {
      const { data, error } = await supabase
        .from('turnos')
        .select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .gte('fecha', weekStart)
        .lte('fecha', weekEnd)

      if (error) throw error
      setTurnos(data ?? [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar turnos'
      console.error('[useEquipo] fetchTurnos Error:', msg)
      setError(msg)
    }
  }, [RESTAURANTE_ID, supabase])

  const fetchTurnosMes = useCallback(async (mes: number, anio: number): Promise<Turno[]> => {
    if (!RESTAURANTE_ID) return []
    const desde = `${anio}-${String(mes).padStart(2, '0')}-01`
    const lastDay = new Date(anio, mes, 0).getDate()
    const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    try {
      const { data, error } = await supabase
        .from('turnos')
        .select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .gte('fecha', desde)
        .lte('fecha', hasta)
      if (error) throw error
      return (data ?? []) as Turno[]
    } catch {
      return []
    }
  }, [RESTAURANTE_ID, supabase])

  async function asignarTurno(miembro_id: string, fecha: string, turno_tipo: TurnoTipo) {
    try {
      const { error } = await supabase
        .from('turnos')
        .upsert(
          {
            miembro_id,
            fecha,
            turno_tipo,
            restaurante_id: RESTAURANTE_ID,
          },
          { onConflict: 'miembro_id,fecha' }
        )
      if (error) throw error
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al asignar turno'
      console.error('[useEquipo] asignarTurno Error:', msg)
      throw new Error(msg)
    }
  }

  async function limpiarTurno(miembro_id: string, fecha: string) {
    try {
      const { error } = await supabase
        .from('turnos')
        .delete()
        .eq('miembro_id', miembro_id)
        .eq('fecha', fecha)
      if (error) throw error
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al limpiar turno'
      console.error('[useEquipo] limpiarTurno Error:', msg)
    }
  }

  // ── Puestos ──

  const fetchPuestos = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('puestos')
        .select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('nombre')

      if (error) throw error
      setPuestos(data ?? [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar puestos'
      console.error('[useEquipo] fetchPuestos Error:', msg)
      setError(msg)
    }
  }, [RESTAURANTE_ID, supabase])

  async function crearPuesto(
    datos: Omit<Puesto, 'id' | 'restaurante_id' | 'created_at'>
  ) {
    try {
      const { error } = await supabase.from('puestos').insert({
        ...datos,
        restaurante_id: RESTAURANTE_ID,
      })
      if (error) throw error
      await fetchPuestos()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al crear puesto'
      console.error('[useEquipo] crearPuesto Error:', msg)
      throw new Error(msg)
    }
  }

  async function actualizarPuesto(id: string, datos: Partial<Omit<Puesto, 'id' | 'restaurante_id' | 'created_at'>>) {
    try {
      const { error } = await supabase
        .from('puestos')
        .update(datos)
        .eq('id', id)
      if (error) throw error
      await fetchPuestos()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar puesto'
      console.error('[useEquipo] actualizarPuesto Error:', msg)
      throw new Error(msg)
    }
  }

  // ── Realtime + init ──

  useEffect(() => {
    fetchMiembros()
    fetchPuestos()

    const chMiembros = supabase
      .channel('equipo-miembros-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'equipo_miembros' },
        () => fetchMiembros()
      )
      .subscribe()

    const chTurnos = supabase
      .channel('turnos-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turnos' },
        () => {
          // Re-fetch turnos if we have a current range — handled by the page
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(chMiembros)
      supabase.removeChannel(chTurnos)
    }
  }, [fetchMiembros, fetchPuestos])

  return {
    miembros,
    turnos,
    puestos,
    loading,
    error,
    fetchMiembros,
    crearMiembro,
    actualizarMiembro,
    desactivarMiembro,
    fetchTurnos,
    fetchTurnosMes,
    asignarTurno,
    limpiarTurno,
    fetchPuestos,
    crearPuesto,
    actualizarPuesto,
  }
}
