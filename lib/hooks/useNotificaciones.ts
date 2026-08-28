'use client'

import { useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import { useAuth } from '@/lib/auth/context'
import type { Notificacion } from '@/types'

const LIMIT = 30

async function fetchNotificacionesData(key: string): Promise<Notificacion[]> {
  const [, restId, userId] = key.split('|')
  const supabase = createClient()
  const { data, error } = await supabase
    .from('notificaciones')
    .select('*')
    .eq('restaurante_id', restId)
    .eq('usuario_id', userId)
    .order('created_at', { ascending: false })
    .limit(LIMIT)
  if (error) throw error
  return (data ?? []) as Notificacion[]
}

/** Feed in-app de notificaciones del usuario logueado — solo in-app, sin push/email/WhatsApp. */
export function useNotificaciones() {
  const RESTAURANTE_ID = useRestauranteId()
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const userId = user?.id ?? null

  const swrKey = RESTAURANTE_ID && userId ? `notificaciones|${RESTAURANTE_ID}|${userId}` : null

  const { data: notificaciones = [], isLoading: loading, mutate } = useSWR(
    swrKey,
    fetchNotificacionesData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 30_000,
      keepPreviousData: true,
    }
  )

  useEffect(() => {
    if (!RESTAURANTE_ID || !userId) return
    const ch = supabase
      .channel(`notificaciones-rt-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${userId}` }, () => mutate())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID, userId, supabase, mutate])

  const noLeidas = useMemo(() => notificaciones.filter(n => !n.leida).length, [notificaciones])

  async function marcarLeida(id: string) {
    mutate(prev => prev?.map(n => n.id === id ? { ...n, leida: true } : n), { revalidate: false })
    const { error } = await supabase.from('notificaciones').update({ leida: true }).eq('id', id)
    if (error) await mutate()
  }

  async function marcarTodasLeidas() {
    const idsNoLeidas = notificaciones.filter(n => !n.leida).map(n => n.id)
    if (idsNoLeidas.length === 0) return
    mutate(prev => prev?.map(n => ({ ...n, leida: true })), { revalidate: false })
    const { error } = await supabase.from('notificaciones').update({ leida: true }).in('id', idsNoLeidas)
    if (error) await mutate()
  }

  return { notificaciones, noLeidas, loading, marcarLeida, marcarTodasLeidas }
}
