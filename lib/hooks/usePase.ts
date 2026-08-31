'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PaseMensaje, PrioridadPase, Plaza } from '@/types'
import { useRestauranteId } from './useRestauranteId'
import { useAuth } from '@/lib/auth/context'

const PAGE_SIZE = 50

export function usePase() {
  const RESTAURANTE_ID = useRestauranteId()
  const { user, perfil } = useAuth()
  const [mensajes, setMensajes] = useState<PaseMensaje[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  // Fetch latest messages
  const fetchMensajes = useCallback(async () => {
    if (!RESTAURANTE_ID) { setLoading(false); return }
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase.from('pase_mensajes').select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (error) throw error
      const msgs = ((data ?? []) as PaseMensaje[]).reverse()
      setMensajes(msgs)
      setHasMore((data?.length ?? 0) === PAGE_SIZE)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar mensajes del pase'
      console.error('[usePase] Error:', msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [RESTAURANTE_ID, supabase])

  // Load older messages (pagination backwards)
  const cargarAnteriores = useCallback(async () => {
    if (!RESTAURANTE_ID || !hasMore || loading) return
    setError(null)

    try {
      const oldest = mensajes[0]
      if (!oldest) return

      const { data, error } = await supabase.from('pase_mensajes').select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .lt('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (error) throw error

      const older = ((data ?? []) as PaseMensaje[]).reverse()
      setMensajes(prev => [...older, ...prev])
      setHasMore((data?.length ?? 0) === PAGE_SIZE)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar mensajes anteriores'
      console.error('[usePase] cargarAnteriores Error:', msg)
      setError(msg)
    }
  }, [RESTAURANTE_ID, hasMore, loading, mensajes, supabase])

  const fetchRecientes = useCallback(async (limit = 3): Promise<PaseMensaje[]> => {
    try {
      const { data, error } = await supabase.from('pase_mensajes').select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return ((data ?? []) as PaseMensaje[]).reverse()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar mensajes recientes'
      console.error('[usePase] fetchRecientes Error:', msg)
      return []
    }
  }, [RESTAURANTE_ID, supabase])

  const enviarMensaje = useCallback(async (datos: {
    texto: string
    prioridad?: PrioridadPase
    plaza?: Plaza | null
    tipo?: string
  }) => {
    try {
      const hoy = new Date().toISOString().slice(0, 10)
      const h = new Date().getHours()
      const turno = h < 16 ? 'almuerzo' : h < 22 ? 'cena' : 'noche'

      const usuarioId = user?.id ?? ''
      const usuarioNombre = [perfil?.nombre, perfil?.apellido].filter(Boolean).join(' ').trim() || 'Usuario'
      const { error } = await supabase.from('pase_mensajes').insert({
        texto: datos.texto,
        usuario_id: usuarioId,
        usuario_nombre: usuarioNombre,
        tipo: datos.tipo || 'texto',
        prioridad: datos.prioridad || 'normal',
        turno_fecha: hoy,
        turno_tipo: turno,
        plaza: datos.plaza || null,
        leido_por: usuarioId ? [usuarioId] : [],
        restaurante_id: RESTAURANTE_ID,
      })
      if (error) throw error
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al enviar mensaje'
      console.error('[usePase] enviarMensaje Error:', msg)
      throw new Error(msg)
    }
  }, [RESTAURANTE_ID, supabase, user, perfil])

  const marcarLeidos = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('pase_mensajes').select('id, leido_por')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      if (!data) return

      const userId = user?.id ?? ''
      const unread = (data as { id: string; leido_por: string[] }[])
        .filter(m => userId && !m.leido_por.includes(userId))

      for (const msg of unread) {
        await supabase.from('pase_mensajes').update({
          leido_por: [...msg.leido_por, userId],
        }).eq('id', msg.id)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al marcar mensajes como leídos'
      console.error('[usePase] marcarLeidos Error:', msg)
    }
  }, [RESTAURANTE_ID, supabase, user])

  const contarNoLeidos = useCallback(async (): Promise<number> => {
    try {
      const { data, error } = await supabase.from('pase_mensajes').select('id, leido_por')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      if (!data) return 0
      const userId = user?.id ?? ''
      return (data as { id: string; leido_por: string[] }[])
        .filter(m => userId && !m.leido_por.includes(userId)).length
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al contar mensajes no leídos'
      console.error('[usePase] contarNoLeidos Error:', msg)
      return 0
    }
  }, [RESTAURANTE_ID, supabase, user])

  // Realtime subscription
  useEffect(() => {
    fetchMensajes()

    const ch = supabase.channel('pase-changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'pase_mensajes',
        filter: `restaurante_id=eq.${RESTAURANTE_ID}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setMensajes(prev => [...prev, payload.new as PaseMensaje])
        } else if (payload.eventType === 'UPDATE') {
          setMensajes(prev => prev.map(m => m.id === (payload.new as PaseMensaje).id ? payload.new as PaseMensaje : m))
        } else if (payload.eventType === 'DELETE') {
          setMensajes(prev => prev.filter(m => m.id !== (payload.old as { id: string }).id))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchMensajes])

  return {
    mensajes, loading, error, hasMore, usuarioId: user?.id ?? '',
    fetchMensajes, fetchRecientes, enviarMensaje, marcarLeidos, contarNoLeidos,
    cargarAnteriores,
  }
}
