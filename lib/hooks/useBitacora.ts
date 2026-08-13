'use client'

import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import { useAuth } from '@/lib/auth/context'
import type { BitacoraEntrada, BitacoraItem, BitacoraParticipante, BitacoraTipo } from '@/types'

const SWR_OPTS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 60_000,
  keepPreviousData: true,
} as const

async function fetchEntradas(key: string): Promise<BitacoraEntrada[]> {
  const rid = key.slice('bitacora-'.length)
  const supabase = createClient()
  const { data, error } = await supabase.from('bitacora_entradas').select('*')
    .eq('restaurante_id', rid)
    .order('fijada', { ascending: false })
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as BitacoraEntrada[]
}

// Ventana de ~3s para ignorar el eco de la propia escritura por realtime
// (hooks.md #23) — tildar/destildar rápido no debe revertirse solo.
const ECO_REALTIME_MS = 3000

export function useBitacora() {
  const RESTAURANTE_ID = useRestauranteId()
  const { user, perfil } = useAuth()
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID ? `bitacora-${RESTAURANTE_ID}` : null
  const { data: entradas = [], isLoading: loadingEntradas, mutate: mutateEntradas } = useSWR(
    swrKey, fetchEntradas, SWR_OPTS,
  )

  const [itemsPorEntrada, setItemsPorEntrada] = useState<Record<string, BitacoraItem[]>>({})
  const [loadingItems, setLoadingItems] = useState<Record<string, boolean>>({})
  const escriturasPropias = useRef<Map<string, number>>(new Map())

  const marcarEscrituraPropia = useCallback((id: string) => {
    const m = escriturasPropias.current
    m.set(id, Date.now())
    if (m.size > 200) {
      const corte = Date.now() - ECO_REALTIME_MS
      for (const [k, ts] of m) if (ts < corte) m.delete(k)
    }
  }, [])

  const autorId = user?.id ?? null
  const autorNombre = [perfil?.nombre, perfil?.apellido].filter(Boolean).join(' ').trim() || 'Usuario'

  // ── Entradas ──────────────────────────────────────────────

  const crearEntrada = useCallback(async (datos: {
    titulo: string
    tipo: BitacoraTipo
    fecha?: string
    participantes?: BitacoraParticipante[]
  }): Promise<string> => {
    if (!RESTAURANTE_ID) throw new Error('Sin restaurante')
    const { data, error } = await supabase.from('bitacora_entradas').insert({
      titulo: datos.titulo.trim() || 'Sin título',
      tipo: datos.tipo,
      fecha: datos.fecha ?? new Date().toISOString().slice(0, 10),
      autor_id: autorId,
      autor_nombre: autorNombre,
      participantes: datos.participantes ?? [],
      restaurante_id: RESTAURANTE_ID,
    }).select('id').single()
    if (error) throw error
    await mutateEntradas()
    return data.id as string
  }, [RESTAURANTE_ID, supabase, autorId, autorNombre, mutateEntradas])

  const actualizarEntrada = useCallback(async (id: string, datos: Partial<
    Pick<BitacoraEntrada, 'titulo' | 'tipo' | 'fecha' | 'participantes' | 'fijada' | 'archivada'>
  >) => {
    await mutateEntradas((prev) =>
      (prev ?? []).map(e => e.id === id ? { ...e, ...datos, updated_at: new Date().toISOString() } : e),
      { revalidate: false },
    )
    const { error } = await supabase.from('bitacora_entradas')
      .update({ ...datos, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { await mutateEntradas(); throw error }
  }, [supabase, mutateEntradas])

  const eliminarEntrada = useCallback(async (id: string) => {
    await mutateEntradas((prev) => (prev ?? []).filter(e => e.id !== id), { revalidate: false })
    setItemsPorEntrada(prev => { const { [id]: _omit, ...rest } = prev; return rest })
    const { error } = await supabase.from('bitacora_entradas').delete().eq('id', id)
    if (error) { await mutateEntradas(); throw error }
  }, [supabase, mutateEntradas])

  // ── Ítems (por entrada, cargados on-demand al abrir el documento) ──────

  const fetchItems = useCallback(async (entradaId: string) => {
    setLoadingItems(prev => ({ ...prev, [entradaId]: true }))
    try {
      const { data, error } = await supabase.from('bitacora_items').select('*')
        .eq('entrada_id', entradaId).order('orden', { ascending: true })
      if (error) throw error
      setItemsPorEntrada(prev => ({ ...prev, [entradaId]: (data ?? []) as BitacoraItem[] }))
    } finally {
      setLoadingItems(prev => ({ ...prev, [entradaId]: false }))
    }
  }, [supabase])

  // Optimista de verdad: el id se genera en el cliente, así que el estado
  // local (y por lo tanto el foco a la línea nueva) queda listo en el mismo
  // frame — el insert a Supabase corre después, sin bloquear. Tipear rápido
  // (Enter → Tab → seguir escribiendo) no puede pisarse esperando la red
  // (bug real encontrado en pruebas: sin esto, la línea siguiente heredaba
  // el texto de la anterior si el insert tardaba más que el siguiente tap).
  const agregarItem = useCallback(async (
    entradaId: string,
    datos: { id?: string; texto?: string; nivel?: number; orden: number },
  ): Promise<BitacoraItem> => {
    if (!RESTAURANTE_ID) throw new Error('Sin restaurante')
    const fila: BitacoraItem = {
      id: datos.id ?? crypto.randomUUID(),
      entrada_id: entradaId,
      texto: datos.texto ?? '',
      nivel: datos.nivel ?? 0,
      orden: datos.orden,
      completado: false,
      restaurante_id: RESTAURANTE_ID,
      created_at: new Date().toISOString(),
    }
    marcarEscrituraPropia(fila.id)
    setItemsPorEntrada(prev => ({
      ...prev,
      [entradaId]: [...(prev[entradaId] ?? []), fila].sort((a, b) => a.orden - b.orden),
    }))
    const { error } = await supabase.from('bitacora_items').insert(fila)
    if (error) {
      setItemsPorEntrada(prev => ({ ...prev, [entradaId]: (prev[entradaId] ?? []).filter(it => it.id !== fila.id) }))
      throw error
    }
    return fila
  }, [RESTAURANTE_ID, supabase, marcarEscrituraPropia])

  // Insertar varios ítems de una (pegar desde Docs) — un solo insert batch.
  const agregarItemsBatch = useCallback(async (
    entradaId: string,
    filas: { texto: string; nivel: number; orden: number }[],
  ) => {
    if (!RESTAURANTE_ID || filas.length === 0) return
    const { data, error } = await supabase.from('bitacora_items').insert(
      filas.map(f => ({ ...f, entrada_id: entradaId, restaurante_id: RESTAURANTE_ID })),
    ).select('*')
    if (error) throw error
    const nuevas = (data ?? []) as BitacoraItem[]
    nuevas.forEach(f => marcarEscrituraPropia(f.id))
    setItemsPorEntrada(prev => ({
      ...prev,
      [entradaId]: [...(prev[entradaId] ?? []), ...nuevas].sort((a, b) => a.orden - b.orden),
    }))
  }, [RESTAURANTE_ID, supabase, marcarEscrituraPropia])

  const actualizarItem = useCallback(async (
    entradaId: string, id: string, datos: Partial<Pick<BitacoraItem, 'texto' | 'nivel' | 'orden' | 'completado'>>,
  ) => {
    marcarEscrituraPropia(id)
    setItemsPorEntrada(prev => ({
      ...prev,
      [entradaId]: (prev[entradaId] ?? []).map(it => it.id === id ? { ...it, ...datos } : it),
    }))
    const { error } = await supabase.from('bitacora_items').update(datos).eq('id', id)
    if (error) console.error('[useBitacora] actualizarItem Error:', error.message)
  }, [supabase, marcarEscrituraPropia])

  // Solo estado local — el editor la usa en cada tecla (60fps), sin pegarle
  // a la red por carácter. El commit real a DB lo dispara el caller con
  // debounce (ver actualizarItem) para no perder la escritura al navegar.
  const setItemTextoLocal = useCallback((entradaId: string, id: string, texto: string) => {
    setItemsPorEntrada(prev => ({
      ...prev,
      [entradaId]: (prev[entradaId] ?? []).map(it => it.id === id ? { ...it, texto } : it),
    }))
  }, [])

  // Reasigna `orden` en bloque (espaciado por 1000) cuando dos líneas ya no
  // tienen un entero libre en el medio para insertar una nueva entre ambas.
  const renumerarItems = useCallback(async (entradaId: string, lista: BitacoraItem[]) => {
    setItemsPorEntrada(prev => ({ ...prev, [entradaId]: lista }))
    lista.forEach(it => marcarEscrituraPropia(it.id))
    const { error } = await supabase.from('bitacora_items')
      .upsert(lista.map(it => ({ id: it.id, orden: it.orden })))
    if (error) console.error('[useBitacora] renumerarItems Error:', error.message)
  }, [supabase, marcarEscrituraPropia])

  const eliminarItem = useCallback(async (entradaId: string, id: string) => {
    setItemsPorEntrada(prev => ({
      ...prev,
      [entradaId]: (prev[entradaId] ?? []).filter(it => it.id !== id),
    }))
    const { error } = await supabase.from('bitacora_items').delete().eq('id', id)
    if (error) console.error('[useBitacora] eliminarItem Error:', error.message)
  }, [supabase])

  // ── Realtime ──────────────────────────────────────────────
  // Un solo canal para ambas tablas, filtrado por restaurante_id (hooks.md #18).
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const ch = supabase.channel(`bitacora-${RESTAURANTE_ID}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'bitacora_entradas',
        filter: `restaurante_id=eq.${RESTAURANTE_ID}`,
      }, (payload) => {
        const fila = (payload.new ?? payload.old) as { id?: string } | null
        if (fila?.id) {
          const ts = escriturasPropias.current.get(fila.id)
          if (ts != null && Date.now() - ts < ECO_REALTIME_MS) return
        }
        mutateEntradas()
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'bitacora_items',
        filter: `restaurante_id=eq.${RESTAURANTE_ID}`,
      }, (payload) => {
        const fila = (payload.new ?? payload.old) as BitacoraItem | null
        if (!fila) return
        const ts = escriturasPropias.current.get(fila.id)
        if (ts != null && Date.now() - ts < ECO_REALTIME_MS) return

        setItemsPorEntrada(prev => {
          const lista = prev[fila.entrada_id]
          if (lista === undefined) return prev // entrada no abierta acá — nada que parchear
          if (payload.eventType === 'DELETE') {
            return { ...prev, [fila.entrada_id]: lista.filter(it => it.id !== fila.id) }
          }
          const existe = lista.some(it => it.id === fila.id)
          const siguiente = existe
            ? lista.map(it => it.id === fila.id ? fila : it)
            : [...lista, fila]
          return { ...prev, [fila.entrada_id]: siguiente.sort((a, b) => a.orden - b.orden) }
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID, supabase, mutateEntradas])

  return {
    entradas, loadingEntradas,
    crearEntrada, actualizarEntrada, eliminarEntrada,
    itemsPorEntrada, loadingItems, fetchItems,
    agregarItem, agregarItemsBatch, actualizarItem, eliminarItem,
    setItemTextoLocal, renumerarItems,
  }
}
