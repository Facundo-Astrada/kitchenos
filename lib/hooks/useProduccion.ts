'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import type { PlatoCompuesto, PlatoComponente, ProduccionDiaria, StatusProduccion } from '@/types'

export interface PlatoConComponentes extends PlatoCompuesto {
  componentes: PlatoComponente[]
}

export interface ProduccionItem extends ProduccionDiaria {
  componente_nombre: string
  plato_nombre: string
  notas_produccion: string | null
  receta_id: string | null
}

export function useProduccion() {
  const RESTAURANTE_ID = useRestauranteId()
  const ridRef = useRef(RESTAURANTE_ID)
  ridRef.current = RESTAURANTE_ID
  const [supabase] = useState(() => createClient())

  const [platos, setPlatos] = useState<PlatoConComponentes[]>([])
  const [produccion, setProduccion] = useState<ProduccionDiaria[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── Fetch platos with componentes ─────────────────────────
  const fetchPlatos = useCallback(async () => {
    const rid = ridRef.current
    if (!rid) { setLoading(false); return }
    setError(null)

    try {
      const { data: platosData, error: pErr } = await supabase
        .from('platos_compuestos')
        .select('*')
        .eq('restaurante_id', rid)
        .eq('activo', true)
        .order('categoria')
        .order('orden')

      if (pErr) throw pErr

      const ids = (platosData ?? []).map(p => p.id)
      let comps: PlatoComponente[] = []
      if (ids.length > 0) {
        const { data: cData, error: cErr } = await supabase
          .from('plato_componentes')
          .select('*')
          .in('plato_compuesto_id', ids)
          .order('orden')
        if (cErr) throw cErr
        comps = cData ?? []
      }

      const result: PlatoConComponentes[] = (platosData ?? []).map(p => ({
        ...p,
        componentes: comps.filter(c => c.plato_compuesto_id === p.id),
      }))

      setPlatos(result)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar platos'
      console.error('[useProduccion] fetchPlatos Error:', msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  // ── Fetch produccion for a date ───────────────────────────
  const fetchProduccion = useCallback(async (fecha: string) => {
    const rid = ridRef.current
    if (!rid) return

    try {
      const { data, error: err } = await supabase
        .from('produccion_diaria')
        .select('*')
        .eq('restaurante_id', rid)
        .eq('fecha', fecha)

      if (err) throw err
      setProduccion(data ?? [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar producción diaria'
      console.error('[useProduccion] fetchProduccion Error:', msg)
      setError(msg)
    }
  }, [supabase])

  // ── Init produccion for a date (create entries for all componentes) ──
  const initProduccion = useCallback(async (fecha: string, menuTag?: string | null) => {
    const rid = ridRef.current
    if (!rid) return

    try {
      const allComps: { plato_id: string; comp_id: string }[] = []
      for (const p of platos) {
        for (const c of p.componentes) {
          allComps.push({ plato_id: p.id, comp_id: c.id })
        }
      }
      if (allComps.length === 0) return

      // Check which already exist for this fecha + menu_tag combo
      const existingQuery = supabase
        .from('produccion_diaria')
        .select('componente_id')
        .eq('restaurante_id', rid)
        .eq('fecha', fecha)
      if (menuTag) existingQuery.eq('menu_tag', menuTag)
      else existingQuery.is('menu_tag', null)

      const { data: existing, error: exErr } = await existingQuery
      if (exErr) throw exErr

      const existingIds = new Set((existing ?? []).map(e => e.componente_id))
      const toInsert = allComps
        .filter(c => !existingIds.has(c.comp_id))
        .map(c => ({
          fecha,
          plato_compuesto_id: c.plato_id,
          componente_id: c.comp_id,
          status: 'pendiente' as StatusProduccion,
          menu_tag: menuTag ?? null,
          restaurante_id: rid,
        }))

      if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from('produccion_diaria').insert(toInsert)
        if (insErr) throw insErr
      }

      await fetchProduccion(fecha)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al inicializar producción'
      console.error('[useProduccion] initProduccion Error:', msg)
      throw new Error(msg)
    }
  }, [supabase, platos, fetchProduccion])

  // ── Fetch dates that have production entries in a given month ──
  const fetchFechasMes = useCallback(async (mes: string): Promise<Record<string, string[]>> => {
    const rid = ridRef.current
    if (!rid) return {}

    const [year, month] = mes.split('-')
    const from = `${year}-${month}-01`
    const lastDay = new Date(Number(year), Number(month), 0).getDate()
    const to = `${year}-${month}-${String(lastDay).padStart(2, '0')}`

    try {
      const { data, error: err } = await supabase
        .from('produccion_diaria')
        .select('fecha, menu_tag')
        .eq('restaurante_id', rid)
        .gte('fecha', from)
        .lte('fecha', to)

      if (err) throw err

      // Return map of fecha → unique menu_tags[]
      const result: Record<string, string[]> = {}
      for (const row of data ?? []) {
        if (!result[row.fecha]) result[row.fecha] = []
        const tag = row.menu_tag ?? ''
        if (!result[row.fecha].includes(tag)) result[row.fecha].push(tag)
      }
      return result
    } catch (e: unknown) {
      console.error('[useProduccion] fetchFechasMes Error:', e)
      return {}
    }
  }, [supabase])

  // ── Update status ─────────────────────────────────────────
  const updateStatus = useCallback(async (id: string, status: StatusProduccion) => {
    try {
      const { error: err } = await supabase
        .from('produccion_diaria')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (err) throw err
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar estado de producción'
      console.error('[useProduccion] updateStatus Error:', msg)
      throw new Error(msg)
    }
  }, [supabase])

  // ── CRUD platos ───────────────────────────────────────────
  const crearPlato = useCallback(async (data: {
    nombre: string
    categoria: string
    descripcion?: string
    componentes: { nombre: string; receta_id?: string | null; notas_produccion?: string }[]
  }) => {
    const rid = ridRef.current
    if (!rid) return

    try {
      const { data: plato, error: pErr } = await supabase
        .from('platos_compuestos')
        .insert({
          nombre: data.nombre,
          categoria: data.categoria,
          descripcion: data.descripcion ?? null,
          restaurante_id: rid,
          orden: platos.length,
        })
        .select('id')
        .single()

      if (pErr) throw pErr

      if (data.componentes.length > 0) {
        const comps = data.componentes.map((c, i) => ({
          plato_compuesto_id: plato.id,
          nombre: c.nombre,
          receta_id: c.receta_id ?? null,
          notas_produccion: c.notas_produccion ?? null,
          orden: i,
        }))
        const { error: cErr } = await supabase.from('plato_componentes').insert(comps)
        if (cErr) throw cErr
      }

      await fetchPlatos()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al crear plato'
      console.error('[useProduccion] crearPlato Error:', msg)
      throw new Error(msg)
    }
  }, [supabase, platos.length, fetchPlatos])

  const actualizarPlato = useCallback(async (
    id: string,
    data: Partial<PlatoCompuesto>,
    componentes?: { id?: string; nombre: string; receta_id?: string | null; notas_produccion?: string; orden: number }[]
  ) => {
    try {
      const { error: pErr } = await supabase
        .from('platos_compuestos')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (pErr) throw pErr

      if (componentes) {
        // Delete old, insert new
        const { error: delErr } = await supabase.from('plato_componentes').delete().eq('plato_compuesto_id', id)
        if (delErr) throw delErr

        if (componentes.length > 0) {
          const comps = componentes.map((c, i) => ({
            plato_compuesto_id: id,
            nombre: c.nombre,
            receta_id: c.receta_id ?? null,
            notas_produccion: c.notas_produccion ?? null,
            orden: i,
          }))
          const { error: insErr } = await supabase.from('plato_componentes').insert(comps)
          if (insErr) throw insErr
        }
      }

      await fetchPlatos()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar plato'
      console.error('[useProduccion] actualizarPlato Error:', msg)
      throw new Error(msg)
    }
  }, [supabase, fetchPlatos])

  const eliminarPlato = useCallback(async (id: string) => {
    try {
      const { error: err } = await supabase
        .from('platos_compuestos')
        .update({ activo: false })
        .eq('id', id)
      if (err) throw err
      await fetchPlatos()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar plato'
      console.error('[useProduccion] eliminarPlato Error:', msg)
      throw new Error(msg)
    }
  }, [supabase, fetchPlatos])

  // ── Duplicate menu to another date ────────────────────────
  const duplicarMenu = useCallback(async (fromFecha: string, toFecha: string) => {
    const rid = ridRef.current
    if (!rid) return

    try {
      const { data: source, error: srcErr } = await supabase
        .from('produccion_diaria')
        .select('plato_compuesto_id, componente_id')
        .eq('restaurante_id', rid)
        .eq('fecha', fromFecha)

      if (srcErr) throw srcErr
      if (!source || source.length === 0) return

      // Check existing
      const { data: existing, error: exErr } = await supabase
        .from('produccion_diaria')
        .select('componente_id')
        .eq('restaurante_id', rid)
        .eq('fecha', toFecha)

      if (exErr) throw exErr

      const existingIds = new Set((existing ?? []).map(e => e.componente_id))
      const toInsert = source
        .filter(s => !existingIds.has(s.componente_id))
        .map(s => ({
          fecha: toFecha,
          plato_compuesto_id: s.plato_compuesto_id,
          componente_id: s.componente_id,
          status: 'pendiente' as StatusProduccion,
          restaurante_id: rid,
        }))

      if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from('produccion_diaria').insert(toInsert)
        if (insErr) throw insErr
      }

      return toInsert.length
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al duplicar menú'
      console.error('[useProduccion] duplicarMenu Error:', msg)
      throw new Error(msg)
    }
  }, [supabase])

  // ── Fetch recetas for ingredient consolidation ────────────
  const fetchIngredientesConsolidados = useCallback(async (recetaIds: string[]) => {
    if (recetaIds.length === 0) return []

    try {
      const { data, error } = await supabase
        .from('ingredientes')
        .select('receta_id, nombre, cantidad, unidad')
        .in('receta_id', recetaIds)

      if (error) throw error
      return data ?? []
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar ingredientes consolidados'
      console.error('[useProduccion] fetchIngredientesConsolidados Error:', msg)
      return []
    }
  }, [supabase])

  // ── Initial load ──────────────────────────────────────────
  useEffect(() => {
    fetchPlatos()
  }, [fetchPlatos, RESTAURANTE_ID])

  return {
    platos,
    produccion,
    loading,
    error,
    fetchPlatos,
    fetchProduccion,
    initProduccion,
    fetchFechasMes,
    updateStatus,
    crearPlato,
    actualizarPlato,
    eliminarPlato,
    duplicarMenu,
    fetchIngredientesConsolidados,
    setProduccion,
  }
}
