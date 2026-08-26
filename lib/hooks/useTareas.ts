'use client'

import { useEffect, useCallback, useMemo, useRef } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { Tarea, ChecklistItemTarea, OpsEstado } from '@/types'
import { useRestauranteId } from './useRestauranteId'
import { useAuth } from '@/lib/auth/context'
import { claveTarea, tareaExistentePara, esProduccionDelDia } from '@/lib/ops/dedupeTareas'

function parseTarea(t: Record<string, unknown>): Tarea {
  return {
    ...(t as unknown as Tarea),
    checklist: Array.isArray(t.checklist)
      ? t.checklist as ChecklistItemTarea[]
      : typeof t.checklist === 'string' ? JSON.parse(t.checklist as string) : [],
  }
}

// Ventana durante la cual un evento de realtime con un id que acabamos de
// escribir se considera el eco de nuestra propia escritura y se ignora.
const ECO_REALTIME_MS = 5_000

// Ventana de historia que baja el cliente. `tareas` crece ~40 filas por día y se
// pedía entera en cada carga de OPS (900 filas / ~200 kB en una cuenta con tres
// meses de uso; en un año serían varios megas por cada apertura de pantalla).
// Ninguna vista operativa mira más atrás que unas semanas: Producción trabaja con
// hoy y ayer, Planificación con el día elegido del calendario, el Dashboard con
// hoy. El histórico largo vive en Reportes, que hace sus propias queries.
const DIAS_HISTORIA = 60

function desdeISO(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toISOString().slice(0, 10)
}

// ── Una preparación, un día, una tarea ──────────────────────────────────────
// La regla vive en lib/ops/dedupeTareas.ts; acá se aplica en el único lugar por
// el que pasan todas las pantallas que crean producción (Mise, board, Pase,
// Control de Carta). Antes cada una tenía —o no— su propio guard, así que la
// misma preparación entraba por una puerta que no veía a las otras.
//
// El mapa es de MÓDULO y no un ref por componente a propósito: el Mise, el
// board y el Pase son tres componentes distintos que pueden estar mandando el
// mismo trabajo al mismo tiempo, y un ref por componente no los ve. Guarda la
// promesa en curso, no un booleano: el segundo tap se cuelga del primero y
// recibe la misma tarea en vez de crear otra o quedarse sin id.
const despachosEnVuelo = new Map<string, Promise<string>>()

// Las tareas del día directo de la base. Solo se usa cuando la cache de SWR no
// puede responder — el Pase y el Calendario abren `useTareas` en modo
// soloEscritura y no bajan la lista, así que sin esto crearían a ciegas.
async function tareasDelDiaEnDB(
  supabase: ReturnType<typeof createClient>, rid: string, fecha: string,
): Promise<Tarea[]> {
  const { data } = await supabase.from('tareas')
    .select('id, titulo, categoria, modo, plaza, seccion, menu_id, checklist_item_id, estado, turno_fecha, created_at, parent_id')
    .eq('restaurante_id', rid).eq('turno_fecha', fecha).is('parent_id', null)
  return (data ?? []) as Tarea[]
}

async function fetchTareasData(key: string): Promise<Tarea[]> {
  const rid = key.slice('tareas-'.length)
  const supabase = createClient()
  const desde = desdeISO(DIAS_HISTORIA)
  const { data, error } = await supabase
    .from('tareas')
    .select('*')
    .eq('restaurante_id', rid)
    // turno_fecha es text 'YYYY-MM-DD' (orden lexicográfico = cronológico).
    // Las filas sin fecha se incluyen: son tareas sueltas que siguen vigentes.
    .or(`turno_fecha.is.null,turno_fecha.gte.${desde}`)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(t => parseTarea(t as Record<string, unknown>))
}

/**
 * @param opts.soloEscritura — no descarga la lista; deja solo las funciones de
 *   CRUD. El Pase y el Calendario únicamente crean tareas y estaban bajando la
 *   tabla entera al abrirse. Al escribir se invalida igual la cache del resto.
 */
export function useTareas(opts?: { soloEscritura?: boolean }) {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])
  const { perfil } = useAuth()

  const swrKey = RESTAURANTE_ID && !opts?.soloEscritura ? `tareas-${RESTAURANTE_ID}` : null
  // Con soloEscritura el `mutate` local no apunta a ninguna key: para que las
  // pantallas que sí muestran la lista se enteren, se invalida por la key real.
  const { mutate: mutateGlobal, cache } = useSWRConfig()
  const invalidarLista = useCallback(() => {
    if (RESTAURANTE_ID) mutateGlobal(`tareas-${RESTAURANTE_ID}`)
  }, [mutateGlobal, RESTAURANTE_ID])

  const { data: tareas = [], isLoading: loading, error: swrError, mutate } = useSWR(
    swrKey,
    fetchTareasData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 300_000,
      keepPreviousData: true,
    }
  )

  const error = (swrError as Error | null)?.message ?? null

  // Ids escritos por ESTE cliente hace poco. Cada update propio vuelve por
  // realtime, y refetchear ahí solo pisa el optimistic con un round-trip de la
  // tabla entera (cientos de filas) — es lo que se percibía como demora al
  // tildar. Los cambios de OTROS dispositivos sí refetchean (con debounce).
  const escriturasPropias = useRef<Map<string, number>>(new Map())
  const marcarEscrituraPropia = useCallback((id: string) => {
    const ahora = Date.now()
    for (const [k, ts] of escriturasPropias.current) {
      if (ahora - ts > ECO_REALTIME_MS) escriturasPropias.current.delete(k)
    }
    escriturasPropias.current.set(id, ahora)
  }, [])

  useEffect(() => {
    if (!RESTAURANTE_ID) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const ch = supabase
      .channel(`tareas-rt-${RESTAURANTE_ID}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tareas',
          filter: `restaurante_id=eq.${RESTAURANTE_ID}`,
        },
        (payload) => {
          const fila = (payload.new ?? payload.old) as { id?: string } | null
          const id = fila?.id
          if (id) {
            const ts = escriturasPropias.current.get(id)
            if (ts != null && Date.now() - ts < ECO_REALTIME_MS) return
          }
          // Debounce: activar un menú inserta 20+ filas de una → un solo refetch.
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => mutate(), 400)
        },
      )
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(ch)
    }
  }, [RESTAURANTE_ID, supabase, mutate])

  // Todas las funciones CRUD van en useCallback: bajan como props hasta ItemOps,
  // que está memoizado — una referencia nueva por render lo re-renderizaría igual
  // (ver .claude/docs/hooks.md #10).
  const insertarTarea = useCallback(async (datos: Omit<Tarea, 'id' | 'restaurante_id' | 'created_at' | 'completed_at'>) => {
    try {
      const { data, error } = await supabase.from('tareas').insert({
        ...datos,
        checklist: JSON.stringify(datos.checklist || []),
        restaurante_id: RESTAURANTE_ID,
      }).select('id').single()
      if (error) throw error
      marcarEscrituraPropia(data.id as string)
      if (swrKey) await mutate()
      else invalidarLista()
      return data.id as string
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al agregar tarea'
      console.error('[useTareas] agregarTarea Error:', msg)
      throw new Error(msg)
    }
  }, [supabase, RESTAURANTE_ID, mutate, marcarEscrituraPropia, swrKey, invalidarLista])

  const agregarTarea = useCallback(async (datos: Omit<Tarea, 'id' | 'restaurante_id' | 'created_at' | 'completed_at'>) => {
    // Lo que no es producción del día entra derecho: la regla no le aplica.
    if (!RESTAURANTE_ID || !esProduccionDelDia(datos)) return insertarTarea(datos)

    const clave = `${RESTAURANTE_ID}::${claveTarea(datos)}`
    // Un despacho igual todavía en vuelo: el segundo tap se cuelga del primero.
    const enVuelo = despachosEnVuelo.get(clave)
    if (enVuelo) return enVuelo

    const trabajo = (async () => {
      // La cache de SWR es la lista que las pantallas ya tienen bajada — se lee
      // del objeto vivo y no de un snapshot de render, así que ya trae lo que
      // insertó el tap anterior (agregarTarea espera al mutate antes de volver).
      const cacheada = (cache.get(`tareas-${RESTAURANTE_ID}`) as { data?: Tarea[] } | undefined)?.data
      const lista = cacheada ?? await tareasDelDiaEnDB(supabase, RESTAURANTE_ID, datos.turno_fecha!)
      const existente = tareaExistentePara(lista, datos)
      // Ya hay una fila para este trabajo: se devuelve esa. No la reabre ni la
      // reescribe — eso es decisión de quien despacha (ver el Mise, que sí
      // reabre lo tildado porque re-despachar ahí significa "hay que rehacerlo").
      if (existente) return existente.id
      return insertarTarea(datos)
    })()

    despachosEnVuelo.set(clave, trabajo)
    try { return await trabajo } finally { despachosEnVuelo.delete(clave) }
  }, [RESTAURANTE_ID, insertarTarea, cache, supabase])

  const actualizarTarea = useCallback(async (id: string, datos: Partial<Omit<Tarea, 'id' | 'restaurante_id'>>) => {
    const optimistic = (prev: Tarea[] | undefined) =>
      (prev ?? []).map(t => t.id === id ? { ...t, ...datos } : t)

    marcarEscrituraPropia(id)
    await mutate(
      async (current) => {
        const updateData: Record<string, unknown> = { ...datos }
        if (datos.checklist) updateData.checklist = JSON.stringify(datos.checklist)
        const { error } = await supabase.from('tareas').update(updateData).eq('id', id)
        if (error) throw error
        return optimistic(current)
      },
      { optimisticData: optimistic, revalidate: false, rollbackOnError: true }
    )
  }, [supabase, mutate, marcarEscrituraPropia])

  // `estado` (OpsEstado) es la única fuente de verdad del avance de la tarea.
  // `status` (legacy) y `completed_at` se derivan acá para que cualquier lector
  // legacy (Reportes) quede consistente sin una segunda forma de escribir status.
  // `completado_por`/`estado_por` salen de acá y no de un parámetro: es el
  // único punto de escritura de `estado` en todo el proyecto (ver MURO-PLAN.md
  // F1/F3), así que resolverlo adentro es la única forma de que ningún caller
  // nuevo se lo olvide. `estado_por/at` cubre en_curso y duda (mismo par para
  // las dos — "quién puso la tarea en el estado actual y desde cuándo"; listo
  // tiene su propio par por separado). No es acumulativo: se limpia al salir
  // del estado y se recalcula la próxima vez que vuelve a entrar.
  const cambiarEstado = useCallback(async (id: string, estado: OpsEstado) => {
    const status = estado === 'listo' ? 'completada' : 'pendiente'
    const completed_at = estado === 'listo' ? new Date().toISOString() : null
    const completado_por = estado === 'listo' ? (perfil?.miembro_id ?? null) : null
    const conAtribucion = estado === 'en_curso' || estado === 'duda'
    const estado_por = conAtribucion ? (perfil?.miembro_id ?? null) : null
    const estado_at = conAtribucion ? new Date().toISOString() : null
    const optimistic = (prev: Tarea[] | undefined) =>
      (prev ?? []).map(t => t.id === id ? { ...t, estado, status, completed_at, completado_por, estado_por, estado_at } : t)

    marcarEscrituraPropia(id)
    await mutate(
      async (current) => {
        const { error } = await supabase.from('tareas').update({ estado, status, completed_at, completado_por, estado_por, estado_at }).eq('id', id)
        if (error) throw error
        return optimistic(current)
      },
      { optimisticData: optimistic, revalidate: false, rollbackOnError: true }
    )
  }, [supabase, mutate, marcarEscrituraPropia, perfil])

  const toggleChecklistItem = useCallback(async (id: string, checklist: ChecklistItemTarea[], itemIdx: number) => {
    const updated = checklist.map((c, i) => i === itemIdx ? { ...c, completado: !c.completado } : c)
    await actualizarTarea(id, { checklist: updated })
  }, [actualizarTarea])

  const eliminarTarea = useCallback(async (id: string) => {
    try {
      marcarEscrituraPropia(id)
      const { error } = await supabase.from('tareas').delete().eq('id', id)
      if (error) throw error
      mutate((prev) => prev?.filter(t => t.id !== id), { revalidate: false })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar tarea'
      console.error('[useTareas] eliminarTarea Error:', msg)
      throw new Error(msg)
    }
  }, [supabase, mutate, marcarEscrituraPropia])

  return {
    tareas,
    loading,
    error,
    refetch: useCallback(() => { mutate() }, [mutate]),
    agregarTarea,
    actualizarTarea,
    cambiarEstado,
    toggleChecklistItem,
    eliminarTarea,
  }
}
