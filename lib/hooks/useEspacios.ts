'use client'

import { useEffect, useMemo, useRef } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { Espacio, EspacioPlaza, Plaza } from '@/types'
import { PLAZAS_COCINA } from '@/lib/constants'
import { useRestauranteId } from './useRestauranteId'

interface EspaciosData {
  espacios: Espacio[]
  espacioPlazas: EspacioPlaza[]
}

async function fetchEspaciosData(key: string): Promise<EspaciosData> {
  const rid = key.slice('espacios-'.length)
  const supabase = createClient()
  const [espRes, epRes] = await Promise.all([
    supabase.from('espacios').select('*').eq('restaurante_id', rid).order('orden', { ascending: true }),
    supabase.from('espacio_plazas').select('*').eq('restaurante_id', rid).order('orden', { ascending: true }),
  ])
  if (espRes.error) throw espRes.error
  if (epRes.error) throw epRes.error
  return {
    espacios: (espRes.data ?? []) as Espacio[],
    espacioPlazas: (epRes.data ?? []) as EspacioPlaza[],
  }
}

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return fallback
}

export function useEspacios() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])
  const seedingRef = useRef(false)

  const swrKey = RESTAURANTE_ID ? `espacios-${RESTAURANTE_ID}` : null

  const { data, isLoading: loading, mutate } = useSWR(swrKey, fetchEspaciosData, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 300_000,
    keepPreviousData: true,
  })

  const espacios = useMemo(() => data?.espacios ?? [], [data])
  const espacioPlazas = useMemo(() => data?.espacioPlazas ?? [], [data])

  // Realtime
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const ch = supabase.channel(`espacios-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'espacios' }, () => mutate())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'espacio_plazas' }, () => mutate())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID, supabase, mutate])

  // ── Seeding: espacio "Cocina" por defecto en el primer fetch vacío ──
  useEffect(() => {
    if (!RESTAURANTE_ID || loading || seedingRef.current) return
    if (data && data.espacios.length === 0) {
      seedingRef.current = true
      seedDefaultEspacio().catch((e) => {
        console.error('[useEspacios] seed Error:', errMsg(e, 'seed'))
        seedingRef.current = false
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [RESTAURANTE_ID, loading, data])

  async function seedDefaultEspacio() {
    const { data: esp, error } = await supabase.from('espacios')
      .insert({ restaurante_id: RESTAURANTE_ID, nombre: 'Cocina', icono: 'kitchen', orden: 0 })
      .select('id').single()
    if (error) throw error
    const espacioId = esp.id as string
    const rows = PLAZAS_COCINA.map((plaza_key, i) => ({
      restaurante_id: RESTAURANTE_ID, espacio_id: espacioId, plaza_key, orden: i,
    }))
    const { error: epErr } = await supabase.from('espacio_plazas').insert(rows)
    if (epErr) throw epErr
    await mutate()
  }

  // ── CRUD espacios ──
  async function agregarEspacio(datos: { nombre: string; icono?: string }) {
    try {
      const { error } = await supabase.from('espacios').insert({
        restaurante_id: RESTAURANTE_ID,
        nombre: datos.nombre,
        icono: datos.icono || 'kitchen',
        orden: espacios.length,
      })
      if (error) throw error
      await mutate()
    } catch (e) {
      const msg = errMsg(e, 'Error al agregar espacio')
      console.error('[useEspacios] agregarEspacio Error:', msg)
      throw new Error(msg)
    }
  }

  async function actualizarEspacio(id: string, datos: Partial<{ nombre: string; icono: string; orden: number }>) {
    try {
      const { error } = await supabase.from('espacios').update(datos).eq('id', id)
      if (error) throw error
      await mutate()
    } catch (e) {
      const msg = errMsg(e, 'Error al actualizar espacio')
      console.error('[useEspacios] actualizarEspacio Error:', msg)
      throw new Error(msg)
    }
  }

  async function eliminarEspacio(id: string) {
    try {
      const { error } = await supabase.from('espacios').delete().eq('id', id)
      if (error) throw error
      await mutate()
    } catch (e) {
      const msg = errMsg(e, 'Error al eliminar espacio')
      console.error('[useEspacios] eliminarEspacio Error:', msg)
      throw new Error(msg)
    }
  }

  // ── Asignación de plazas ──
  async function asignarPlaza(espacioId: string, plazaKey: Plaza) {
    try {
      const orden = espacioPlazas.filter(ep => ep.espacio_id === espacioId).length
      const { error } = await supabase.from('espacio_plazas').insert({
        restaurante_id: RESTAURANTE_ID, espacio_id: espacioId, plaza_key: plazaKey, orden,
      })
      if (error) throw error
      await mutate()
    } catch (e) {
      const msg = errMsg(e, 'Error al asignar plaza')
      console.error('[useEspacios] asignarPlaza Error:', msg)
      throw new Error(msg)
    }
  }

  async function quitarPlaza(id: string) {
    try {
      const { error } = await supabase.from('espacio_plazas').delete().eq('id', id)
      if (error) throw error
      await mutate()
    } catch (e) {
      const msg = errMsg(e, 'Error al quitar plaza')
      console.error('[useEspacios] quitarPlaza Error:', msg)
      throw new Error(msg)
    }
  }

  // Plazas ya usadas por cualquier espacio (para ocultarlas en el picker)
  const plazasUsadas = useMemo(() => new Set(espacioPlazas.map(ep => ep.plaza_key)), [espacioPlazas])

  return {
    espacios, espacioPlazas, plazasUsadas, loading, mutate,
    agregarEspacio, actualizarEspacio, eliminarEspacio,
    asignarPlaza, quitarPlaza,
  }
}
