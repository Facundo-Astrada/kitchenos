'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { RutinaTurnoItem, RutinaTurnoRegistro, RutinaTurnoFase } from '@/types'
import { useRestauranteId } from './useRestauranteId'

// Ventana en la que el eco de una escritura propia se descarta (ver hooks.md #23:
// el problema acá es el orden, no el costo — tildar y destildar rápido no puede
// terminar ganando el tilde viejo que vuelve por el canal 1-3s después).
const ECO_MS = 3000

/** Identidad de un registro: la misma tupla que su índice único en la DB. */
function clave(itemId: string, fecha: string, turno: string): string {
  return `${itemId}|${fecha}|${turno}`
}

// Fallback constante, no `?? []` — ver hooks.md #5: un array nuevo por render le
// cambia la identidad a `items` y cualquier efecto de la pantalla que lo tenga
// en deps y llame a setState entra en loop.
const SIN_ITEMS: RutinaTurnoItem[] = []

async function fetchItems(key: string): Promise<RutinaTurnoItem[]> {
  const rid = key.slice('rutina-turno-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('rutina_turno_items')
    .select('*')
    .eq('restaurante_id', rid)
    .eq('activo', true)
    .order('fase', { ascending: true })
    .order('orden', { ascending: true })
  if (error) throw error
  return (data ?? []) as RutinaTurnoItem[]
}

export function useRutinaTurno() {
  const RESTAURANTE_ID = useRestauranteId()
  // createClient() NO es singleton — sin el useMemo, todo useCallback que lo
  // tenga en deps cambia de identidad cada render (hooks.md #20).
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID ? `rutina-turno-${RESTAURANTE_ID}` : null
  const { data, isLoading: itemsLoading, mutate: mutateItems } = useSWR(swrKey, fetchItems, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 300_000,
    keepPreviousData: true,
  })
  const items = data ?? SIN_ITEMS

  const [registros, setRegistros] = useState<RutinaTurnoRegistro[]>([])
  const [regLoading, setRegLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // `loading` es de la PRIMERA carga (hooks.md, "Escrituras del camino crítico"):
  // un flag que se prende en cada refetch deja la lista en blanco al cambiar de
  // fecha o de turno, y eso se percibe como "navega lento".
  const [yaCargo, setYaCargo] = useState(false)
  const loading = (itemsLoading || regLoading) && !yaCargo

  // Qué (fecha, turno) está mostrando esta instancia — lo necesitan el realtime
  // y el rollback: un evento de otro turno no se puede aplicar sobre esta lista.
  const vistaRef = useRef<{ fecha: string; turno: string } | null>(null)
  // Escrituras propias recientes, para descartar su eco.
  const propiasRef = useRef<Map<string, number>>(new Map())

  const fetchRegistros = useCallback(async (fecha: string, turno: string) => {
    if (!RESTAURANTE_ID) { setRegistros([]); return }   // guard obligatorio
    vistaRef.current = { fecha, turno }
    setRegLoading(true)
    try {
      const { data: regs, error: e } = await supabase
        .from('rutina_turno_registros')
        .select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .eq('fecha', fecha)
        .eq('turno', turno)
      if (e) throw e
      // Otra vista pudo entrar mientras este fetch volaba — descartarlo evita
      // pintar los tildes del almuerzo sobre la pantalla de la cena.
      const v = vistaRef.current
      if (v?.fecha !== fecha || v?.turno !== turno) return
      setRegistros((regs ?? []) as RutinaTurnoRegistro[])
      setError(null)
    } catch (e: unknown) {
      // Los errores de Supabase NO son Error — son {message, code, details} (hooks.md #2).
      const msg = e instanceof Error ? e.message
        : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
        : 'Error al cargar la rutina del turno'
      console.error('[useRutinaTurno] fetchRegistros:', msg)
      setError(msg)
    } finally {
      setRegLoading(false)
      setYaCargo(true)
    }
  }, [RESTAURANTE_ID, supabase])

  // ── Realtime ────────────────────────────────────────────────────────────
  // Filtrado por restaurante SIEMPRE (hooks.md #18): sin el filter llegan las
  // escrituras de todas las cuentas y despiertan a todos los dispositivos.
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const filter = `restaurante_id=eq.${RESTAURANTE_ID}`
    const ch = supabase.channel(`rutina-turno-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rutina_turno_items', filter }, () => mutateItems())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rutina_turno_registros', filter }, payload => {
        const row = (payload.new ?? payload.old) as RutinaTurnoRegistro | undefined
        if (!row) return
        const v = vistaRef.current
        // Evento de otra fecha/turno: no toca lo que se está mirando.
        if (!v || row.fecha !== v.fecha || row.turno !== v.turno) return
        // Eco de la escritura propia — ya está pintado, aplicarlo tarde pisaría
        // un cambio posterior del mismo usuario.
        const k = clave(row.item_id, row.fecha, row.turno)
        const t = propiasRef.current.get(k)
        if (t && Date.now() - t < ECO_MS) return
        setRegistros(prev => {
          if (payload.eventType === 'DELETE') return prev.filter(r => r.id !== row.id)
          const idx = prev.findIndex(r => r.item_id === row.item_id)
          if (idx === -1) return [...prev, row]
          const next = prev.slice()
          next[idx] = row
          return next
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID, supabase, mutateItems])

  // Poda del Map de escrituras propias — si no, crece toda la sesión.
  const marcarPropia = useCallback((k: string) => {
    const m = propiasRef.current
    m.set(k, Date.now())
    if (m.size > 100) {
      const corte = Date.now() - ECO_MS
      for (const [kk, tt] of m) if (tt < corte) m.delete(kk)
    }
  }, [])

  // ── Tildar / asignar ────────────────────────────────────────────────────
  // Camino crítico: se pinta primero y se escribe después (hooks.md "Escrituras
  // del camino crítico"). En la cocina con 4G, esperar el round-trip antes de
  // pintar el tilde se siente como un segundo muerto por tap.
  const marcar = useCallback(async (
    itemId: string, fecha: string, turno: string,
    d: { completado?: boolean; responsable_id?: string | null },
    usuarioId?: string | null,
  ) => {
    if (!RESTAURANTE_ID) return
    const k = clave(itemId, fecha, turno)
    marcarPropia(k)

    const completadoAt = d.completado === undefined ? undefined : (d.completado ? new Date().toISOString() : null)
    const previo = registros.find(r => r.item_id === itemId)

    // Optimista.
    setRegistros(prev => {
      const idx = prev.findIndex(r => r.item_id === itemId)
      const parche = {
        ...d,
        ...(completadoAt !== undefined ? { completado_at: completadoAt } : {}),
        ...(d.completado !== undefined ? { usuario_id: usuarioId ?? null } : {}),
      }
      if (idx === -1) {
        return [...prev, {
          id: `tmp-${itemId}`, restaurante_id: RESTAURANTE_ID, item_id: itemId, fecha, turno,
          completado: false, responsable_id: null, usuario_id: null, completado_at: null,
          created_at: new Date().toISOString(), ...parche,
        } as RutinaTurnoRegistro]
      }
      const next = prev.slice()
      next[idx] = { ...next[idx], ...parche }
      return next
    })

    try {
      const { data: fila, error: e } = await supabase
        .from('rutina_turno_registros')
        .upsert({
          item_id: itemId, fecha, turno,
          // El upsert reemplaza la fila entera: sin esto, tildar borraría el
          // responsable ya asignado (y asignar destildaría el ítem).
          completado: d.completado ?? previo?.completado ?? false,
          responsable_id: d.responsable_id !== undefined ? d.responsable_id : (previo?.responsable_id ?? null),
          ...(completadoAt !== undefined ? { completado_at: completadoAt } : {}),
          ...(d.completado !== undefined ? { usuario_id: usuarioId ?? null } : {}),
        }, { onConflict: 'item_id,fecha,turno' })
        .select()
        .single()
      if (e) throw e
      // Reemplazar la fila optimista por la real (el id `tmp-` no sirve para el
      // DELETE de realtime ni para un update posterior).
      if (fila) setRegistros(prev => prev.map(r => r.item_id === itemId ? fila as RutinaTurnoRegistro : r))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message
        : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
        : 'Error al guardar'
      console.error('[useRutinaTurno] marcar:', msg)
      setError(msg)
      fetchRegistros(fecha, turno)   // rollback contra el servidor
    }
  }, [RESTAURANTE_ID, supabase, registros, marcarPropia, fetchRegistros])

  // ── CRUD de la plantilla ────────────────────────────────────────────────
  const agregarItem = useCallback(async (d: {
    texto: string; fase: RutinaTurnoFase; horas?: Record<string, string>
    turnos?: string[] | null; requiere_responsable?: boolean; dias_semana?: number[] | null; orden?: number
  }) => {
    if (!RESTAURANTE_ID) return null
    // id en el cliente para no bloquear el próximo tap con el round-trip
    // (hooks.md #24: en un editor "Enter crea la siguiente línea", esperar el
    // await antes de limpiar el input concatena la línea siguiente con la anterior).
    const id = crypto.randomUUID()
    const fila = {
      id, restaurante_id: RESTAURANTE_ID,
      texto: d.texto, fase: d.fase,
      horas: d.horas ?? {},
      turnos: d.turnos ?? null,
      requiere_responsable: d.requiere_responsable ?? false,
      dias_semana: d.dias_semana ?? null,
      orden: d.orden ?? items.filter(i => i.fase === d.fase).length,
      activo: true,
      created_at: new Date().toISOString(),
    } as RutinaTurnoItem
    mutateItems(prev => [...(prev ?? []), fila], { revalidate: false })
    try {
      const { error: e } = await supabase.from('rutina_turno_items').insert(fila)
      if (e) throw e
    } catch (e: unknown) {
      console.error('[useRutinaTurno] agregarItem:', e)
      mutateItems()
      return null
    }
    return id
  }, [RESTAURANTE_ID, supabase, items, mutateItems])

  const actualizarItem = useCallback(async (id: string, d: Partial<RutinaTurnoItem>) => {
    mutateItems(prev => (prev ?? []).map(i => i.id === id ? { ...i, ...d } : i), { revalidate: false })
    try {
      const { error: e } = await supabase.from('rutina_turno_items').update(d).eq('id', id)
      if (e) throw e
    } catch (e: unknown) {
      console.error('[useRutinaTurno] actualizarItem:', e)
      mutateItems()
    }
  }, [supabase, mutateItems])

  // Baja lógica: borrar de verdad se llevaría puesto el histórico de registros
  // por CASCADE, que es justo el dato que da valor a la pantalla.
  const eliminarItem = useCallback(async (id: string) => {
    mutateItems(prev => (prev ?? []).filter(i => i.id !== id), { revalidate: false })
    try {
      const { error: e } = await supabase.from('rutina_turno_items').update({ activo: false }).eq('id', id)
      if (e) throw e
    } catch (e: unknown) {
      console.error('[useRutinaTurno] eliminarItem:', e)
      mutateItems()
    }
  }, [supabase, mutateItems])

  /** Reordena una fase completa — recibe los ids en el orden nuevo. */
  const reordenar = useCallback(async (fase: RutinaTurnoFase, idsOrdenados: string[]) => {
    const pos = new Map(idsOrdenados.map((id, i) => [id, i]))
    mutateItems(prev => (prev ?? []).map(i =>
      i.fase === fase && pos.has(i.id) ? { ...i, orden: pos.get(i.id)! } : i
    ), { revalidate: false })
    try {
      await Promise.all(idsOrdenados.map((id, i) =>
        supabase.from('rutina_turno_items').update({ orden: i }).eq('id', id)
      ))
    } catch (e: unknown) {
      console.error('[useRutinaTurno] reordenar:', e)
      mutateItems()
    }
  }, [supabase, mutateItems])

  return {
    items, registros, loading, error,
    fetchRegistros, marcar,
    agregarItem, actualizarItem, eliminarItem, reordenar,
    mutateItems,
  }
}
