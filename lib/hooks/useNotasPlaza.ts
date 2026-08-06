'use client'

import { useCallback, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/context'
import { hoyOperativo, sumarDias } from '@/lib/ops/turnos'
import { useRestauranteId } from './useRestauranteId'
import type { PaseMensaje } from '@/types'

// Anotaciones de plaza — "chequear el orden, el servicio fue pesado", "hay
// mucha carne para revisar", "ingresó pescado". Las deja el que termina su
// turno en la plaza y las lee el que entra: son el pase de turno a nivel plaza,
// el detalle que no cabe en una tarea ni en un tilde.
//
// NO usa tabla propia: son `pase_mensajes` con `plaza` seteada (y tipo 'plaza'
// para saber de dónde salieron). Así lo que se escribe en la columna de
// Parrilla aparece también en el Pase, que es donde se lee el traspaso
// completo — una sola bandeja de avisos en vez de un silo nuevo por pantalla.
// Es el mismo criterio con el que NotaImportanteCard vive sobre `pase_mensajes`.
//
// Se leen las que tengan CUALQUIER plaza, no solo las tipo 'plaza': un mensaje
// escrito en el Pase con "#parrilla" ya viene con plaza cargada
// (plazaDesdeTexto) y es exactamente la misma información — tiene que
// aparecer en la columna de Parrilla.

// Hoy + ayer. El turno anterior es lo que hay que leer al entrar; más atrás es
// historia, y para eso está el Pase.
const VENTANA_DIAS = 1

type NotasKey = readonly ['notas-plaza', string, string]

async function fetchNotas([, rid, desde]: NotasKey): Promise<PaseMensaje[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('pase_mensajes')
    .select('*')
    .eq('restaurante_id', rid)
    .not('plaza', 'is', null)
    .gte('turno_fecha', desde)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PaseMensaje[]
}

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return fallback
}

export function useNotasPlaza() {
  const RESTAURANTE_ID = useRestauranteId()
  const { user, perfil } = useAuth()
  const supabase = useMemo(() => createClient(), [])

  // hoyOperativo en la key: al rodar la jornada la ventana se corre sola en vez
  // de quedar servida desde el cache del día anterior.
  const hoy = hoyOperativo()
  const desde = sumarDias(hoy, -VENTANA_DIAS)
  const swrKey: NotasKey | null = RESTAURANTE_ID ? ['notas-plaza', RESTAURANTE_ID, desde] : null

  const { data, isLoading: loading, mutate } = useSWR(swrKey, fetchNotas, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  })

  const notas = useMemo(() => data ?? [], [data])

  /** Notas de una plaza, más nuevas primero. */
  const notasDe = useCallback(
    (plaza: string): PaseMensaje[] => notas.filter(n => n.plaza === plaza),
    [notas],
  )

  // Realtime — el que entra al turno tiene que ver la nota del que salió sin
  // recargar, y en la tablet de cocina nadie recarga nada. Filtrado por
  // restaurante (ver hooks.md #18/#4).
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const ch = supabase
      .channel(`notas-plaza-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'pase_mensajes',
        filter: `restaurante_id=eq.${RESTAURANTE_ID}`,
      }, () => { mutate() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID, supabase, mutate])

  const agregar = useCallback(async (args: {
    plaza: string
    texto: string
    importante?: boolean
  }): Promise<void> => {
    if (!RESTAURANTE_ID) throw new Error('Sin restaurante')
    const limpio = args.texto.trim()
    if (!limpio) return
    // Mismo criterio de turno que usePase, para que una nota escrita acá y un
    // mensaje escrito en el Pase caigan en el mismo turno.
    const h = new Date().getHours()
    const turno = h < 16 ? 'almuerzo' : h < 22 ? 'cena' : 'noche'
    const usuarioId = user?.id ?? ''
    try {
      const { error } = await supabase.from('pase_mensajes').insert({
        texto: limpio,
        usuario_id: usuarioId,
        usuario_nombre: [perfil?.nombre, perfil?.apellido].filter(Boolean).join(' ').trim() || 'Usuario',
        tipo: 'plaza',
        // Normal por defecto: la nota de plaza es contexto del turno, no una
        // alarma. Marcarla importante la sube además a la columna "Importante"
        // del board y al Pase con su franja de color.
        prioridad: args.importante ? 'importante' : 'normal',
        turno_fecha: hoy,
        turno_tipo: turno,
        plaza: args.plaza,
        leido_por: usuarioId ? [usuarioId] : [],
        restaurante_id: RESTAURANTE_ID,
      })
      if (error) throw error
      await mutate()
    } catch (e) {
      const msg = errMsg(e, 'Error al guardar la nota')
      console.error('[useNotasPlaza] agregar Error:', msg)
      throw new Error(msg)
    }
  }, [RESTAURANTE_ID, supabase, mutate, user, perfil, hoy])

  const eliminar = useCallback(async (id: string): Promise<void> => {
    try {
      const { error } = await supabase.from('pase_mensajes').delete().eq('id', id)
      if (error) throw error
      await mutate()
    } catch (e) {
      const msg = errMsg(e, 'Error al borrar la nota')
      console.error('[useNotasPlaza] eliminar Error:', msg)
      throw new Error(msg)
    }
  }, [supabase, mutate])

  return { notas, notasDe, loading, agregar, eliminar, mutate }
}
