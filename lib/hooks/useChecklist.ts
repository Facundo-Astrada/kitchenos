'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type {
  MisePlaceItem, MisePlaceRegistro, ChecklistSeccionConfig, ChecklistSeccionTipo,
  ChecklistRutina, ChecklistRutinaRegistro, ChecklistAuditoria, RutinaCondicion,
  Plaza, MisePrioridad, RutinaFrecuencia,
} from '@/types'
import { useRestauranteId } from './useRestauranteId'
import { parseTurnoFase } from '@/lib/ops/turnos'
import { onMiseRegistroPatch, type MiseRegistroPatch } from '@/lib/ops/miseBus'

/** Identidad de un registro: la misma tupla que su índice único en la DB. */
function claveRegistro(itemId: string, fecha: string, turno: string): string {
  return `${itemId}|${fecha}|${turno}`
}
// Ventana en la que el eco de una escritura propia se descarta.
const ECO_MS = 3000

// Pase de turno incumplido (Fase 3, jul 2026): un (fecha, turno, plaza) tuvo
// apertura pero NINGÚN cierre completado — se deduce de checklist_registros,
// no hay flag ni fila propia. usuarioId = quién hizo la última acción sobre
// el cierre de ese grupo (null si nadie llegó a tocarlo, ver useChecklist.ts
// upsertRegistro — usuario_id recién empezó a poblarse en jul 2026, las filas
// anteriores no lo tienen).
export interface PaseTurnoIncumplido {
  fecha: string
  turnoId: string | null   // null = fila legacy sin turno de servicio codificado
  plaza: string
  usuarioId: string | null
}

interface ChecklistConfig {
  secciones: ChecklistSeccionConfig[]
  items: MisePlaceItem[]
  rutinas: ChecklistRutina[]
}

// Vacíos compartidos — ver el `??` de abajo: la identidad tiene que ser estable.
const SIN_SECCIONES: ChecklistSeccionConfig[] = []
const SIN_ITEMS: MisePlaceItem[] = []
const SIN_RUTINAS: ChecklistRutina[] = []

async function fetchChecklistConfig(key: string): Promise<ChecklistConfig> {
  const rid = key.slice('checklist-config-'.length)
  const supabase = createClient()
  const [secRes, itemRes, rutRes] = await Promise.all([
    supabase.from('checklist_secciones').select('*').eq('restaurante_id', rid).order('orden', { ascending: true }),
    // menus(...) embebido para saber vigencia — el filtro NUNCA va acá con
    // .eq('menus.vigencia_hasta', …): sobre tabla embebida no filtra la fila
    // padre (bug conocido de PostgREST). Se filtra en JS, ver menuItemVisible.
    supabase.from('checklist_items').select('*, menus(nombre, tipo, vigencia_desde, vigencia_hasta)').eq('restaurante_id', rid).order('orden', { ascending: true }),
    supabase.from('checklist_rutina').select('*').eq('restaurante_id', rid).order('orden', { ascending: true }),
  ])
  if (secRes.error) throw secRes.error
  if (itemRes.error) throw itemRes.error
  if (rutRes.error) throw rutRes.error
  return {
    secciones: (secRes.data ?? []) as ChecklistSeccionConfig[],
    items: (itemRes.data ?? []) as MisePlaceItem[],
    rutinas: (rutRes.data ?? []) as ChecklistRutina[],
  }
}

export function useChecklist() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  // ── SWR: datos estáticos (secciones, items, rutinas) ──
  const swrKey = RESTAURANTE_ID ? `checklist-config-${RESTAURANTE_ID}` : null

  const { data: config, isLoading: configLoading, mutate: mutateConfig } = useSWR(
    swrKey,
    fetchChecklistConfig,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 300_000,
      keepPreviousData: true,
    }
  )

  // Fallbacks constantes, no `?? []`: mientras el config no resolvió (o el
  // restaurante todavía no cargó), un array nuevo por render le cambia la
  // identidad a `items` en cada vuelta, y cualquier efecto de la pantalla que
  // lo tenga en deps y llame a un setState se dispara solo, sin parar —
  // "Maximum update depth exceeded" en el mise antes de que abra la lista.
  const secciones = config?.secciones ?? SIN_SECCIONES
  const items = config?.items ?? SIN_ITEMS
  const rutinas = config?.rutinas ?? SIN_RUTINAS

  // ── Estado dinámico (registros dependen de fecha/turno) ──
  const [registros, setRegistros] = useState<MisePlaceRegistro[]>([])
  const [rutinaRegistros, setRutinaRegistros] = useState<ChecklistRutinaRegistro[]>([])
  const [dynamicLoading, setDynamicLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loading = configLoading || dynamicLoading

  // Realtime para datos estáticos. Filtrado por restaurante: sin el filter, la
  // escritura de cualquier otra cuenta llegaba igual y hacía refetchear el
  // config entero acá (secciones + items + rutinas), en todos los dispositivos.
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const filter = `restaurante_id=eq.${RESTAURANTE_ID}`
    const ch = supabase.channel(`checklist-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_secciones', filter }, () => mutateConfig())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_items', filter }, () => mutateConfig())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_rutina', filter }, () => mutateConfig())
      // Desactivar un menú del mise solo toca menus.vigencia_hasta, no
      // checklist_items — sin esto el mise no se enteraría hasta refrescar.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'menus', filter }, () => mutateConfig())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID, supabase, mutateConfig])

  // Los ids de los items ya están en memoria (config SWR) — ir a buscarlos a la
  // DB en cada fetch era un round-trip extra en el camino crítico del mise.
  // Ref (no dep del useCallback) para que fetchAll no cambie de identidad cada
  // vez que revalida el config y dispare el efecto que lo llama (ver hooks.md #10).
  const itemIdsRef = useRef<string[]>([])
  useEffect(() => { itemIdsRef.current = items.map(i => i.id) }, [items])

  // Qué fecha+turno está mostrando esta instancia. Lo necesita el puente con
  // Producción de abajo: un parche de otro turno no se puede aplicar sobre esta
  // lista (se vería un tilde en el turno equivocado).
  const vistaRef = useRef<{ fecha: string; turno: string } | null>(null)

  const fetchRegistros = useCallback(async (fecha: string, turno: string) => {
    vistaRef.current = { fecha, turno }
    if (!RESTAURANTE_ID) { setRegistros([]); return }
    try {
      let itemIds = itemIdsRef.current
      if (itemIds.length === 0) {
        // Primera carga: el config todavía no resolvió.
        const { data: itemsData, error: itemsErr } = await supabase.from('checklist_items').select('id')
          .eq('restaurante_id', RESTAURANTE_ID)
        if (itemsErr) throw itemsErr
        itemIds = (itemsData ?? []).map((i: { id: string }) => i.id)
      }
      if (itemIds.length === 0) { setRegistros([]); return }
      const { data, error: regErr } = await supabase.from('checklist_registros').select('*')
        .eq('fecha', fecha).eq('turno', turno)
        .in('checklist_item_id', itemIds)
      if (regErr) throw regErr
      setRegistros((data ?? []) as MisePlaceRegistro[])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar registros del checklist'
      console.error('[useChecklist] fetchRegistros Error:', msg)
      setError(msg)
    }
  }, [RESTAURANTE_ID, supabase])

  // Variante agregada del día — para vistas que quieren "cuánto se avanzó hoy
  // en TODO el mise" (Dashboard: StatusCard "Checklist", MiPlaza, AhoraCard),
  // no el mise de una plaza+turno puntual. Sin filtro de turno a propósito.
  // No fija vistaRef ni participa del parche en vivo (aplicarRegistroLocal) —
  // esa cañería es turno-específica (ver el comentario de vistaRef arriba) y
  // generalizarla a "cualquier turno del día" es un cambio propio, no de acá.
  // Alcanza con traer el número correcto al entrar a la pantalla.
  const fetchRegistrosDelDia = useCallback(async (fecha: string) => {
    if (!RESTAURANTE_ID) { setRegistros([]); return }
    try {
      let itemIds = itemIdsRef.current
      if (itemIds.length === 0) {
        const { data: itemsData, error: itemsErr } = await supabase.from('checklist_items').select('id')
          .eq('restaurante_id', RESTAURANTE_ID)
        if (itemsErr) throw itemsErr
        itemIds = (itemsData ?? []).map((i: { id: string }) => i.id)
      }
      if (itemIds.length === 0) { setRegistros([]); return }
      const { data, error: regErr } = await supabase.from('checklist_registros').select('*')
        .eq('fecha', fecha)
        .in('checklist_item_id', itemIds)
      if (regErr) throw regErr
      setRegistros((data ?? []) as MisePlaceRegistro[])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar el avance del día'
      console.error('[useChecklist] fetchRegistrosDelDia Error:', msg)
      setError(msg)
    }
  }, [RESTAURANTE_ID, supabase])

  const fetchRutinaRegistros = useCallback(async (fecha: string) => {
    if (!RESTAURANTE_ID) { setRutinaRegistros([]); return }
    try {
      const { data: rutinasData, error: rutErr } = await supabase.from('checklist_rutina').select('id')
        .eq('restaurante_id', RESTAURANTE_ID)
      if (rutErr) throw rutErr
      const rutinaIds = (rutinasData ?? []).map((r: { id: string }) => r.id)
      if (rutinaIds.length === 0) { setRutinaRegistros([]); return }
      const { data, error: regErr } = await supabase.from('checklist_rutina_registros').select('*')
        .eq('fecha', fecha)
        .in('rutina_id', rutinaIds)
      if (regErr) throw regErr
      setRutinaRegistros((data ?? []) as ChecklistRutinaRegistro[])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar registros de rutinas'
      console.error('[useChecklist] fetchRutinaRegistros Error:', msg)
      setError(msg)
    }
  }, [RESTAURANTE_ID, supabase])

  // `loading` solo en la primera carga: al cambiar de fase (apertura↔cierre) o de
  // fecha, la lista se quedaba en blanco con "Cargando…" y volvía a aparecer de
  // golpe. Se mantiene lo anterior en pantalla mientras llegan los registros
  // nuevos — en mobile es la diferencia entre "navegar" y "esperar".
  const yaCargoRef = useRef(false)

  const fetchAll = useCallback(async (fecha: string, turno: string) => {
    if (!yaCargoRef.current) setDynamicLoading(true)
    setError(null)
    try {
      // El config (secciones/items/rutinas) NO se revalida acá: casi nunca cambia,
      // ya está en cache, y fetchAll corre varias veces por carga (al elegir plaza,
      // al resolver el turno de servicio, al cambiar de fase) — eran 5 descargas
      // de la lista de items por abrir una plaza. Lo mantienen al día la
      // suscripción realtime y refetchConfig() tras una escritura externa.
      await Promise.all([
        fetchRegistros(fecha, turno),
        fetchRutinaRegistros(fecha),
      ])
      yaCargoRef.current = true
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar datos del checklist'
      console.error('[useChecklist] fetchAll Error:', msg)
      setError(msg)
    } finally {
      setDynamicLoading(false)
    }
  }, [fetchRegistros, fetchRutinaRegistros])

  // ── Registros que llegan de afuera de este hook ─────────────────────────
  // Dos fuentes, misma aplicación: el bus en memoria (Producción en ESTA
  // pestaña, ver lib/ops/miseBus.ts) y realtime (otro dispositivo). En los dos
  // casos se parchea la lista en vez de refetchear: el payload ya trae la fila.

  // Escrituras propias recientes. Cada write vuelve por realtime como eco; ya
  // está aplicado de forma optimista, y aplicarlo tarde puede pisar un cambio
  // posterior (tildar y destildar rápido deja el tilde viejo ganando). Ver
  // hooks.md #18.
  const escriturasPropias = useRef<Map<string, number>>(new Map())
  const marcarEscrituraPropia = useCallback((itemId: string, fecha: string, turno: string) => {
    const m = escriturasPropias.current
    m.set(claveRegistro(itemId, fecha, turno), Date.now())
    // Poda: sin esto el Map crece todo el turno (40+ ítems × cada corrección).
    if (m.size > 200) {
      const corte = Date.now() - ECO_MS
      for (const [k, t] of m) if (t < corte) m.delete(k)
    }
  }, [])

  const aplicarRegistroLocal = useCallback((patch: MiseRegistroPatch, esPropia = false) => {
    const vista = vistaRef.current
    // Parche de otra fecha/turno: se ignora. Cuando el usuario navegue ahí, el
    // fetch va a traer el estado real igual.
    if (!vista || patch.fecha !== vista.fecha || patch.turno !== vista.turno) return
    // Ítem ajeno — puede haber dos instancias del hook conviviendo.
    if (itemIdsRef.current.length > 0 && !itemIdsRef.current.includes(patch.itemId)) return
    if (!esPropia) {
      const t = escriturasPropias.current.get(claveRegistro(patch.itemId, patch.fecha, patch.turno))
      if (t && Date.now() - t < ECO_MS) return
    }
    const { itemId, fecha, turno, ...datos } = patch
    setRegistros(prev => {
      const idx = prev.findIndex(r => r.checklist_item_id === itemId && r.fecha === fecha && r.turno === turno)
      if (idx === -1) {
        return [...prev, {
          id: `optimistic-${itemId}-${fecha}-${turno}`,
          checklist_item_id: itemId, fecha, turno,
          completado: false, cantidad_actual: null,
          ...datos,
        } as MisePlaceRegistro]
      }
      const next = [...prev]
      next[idx] = { ...next[idx], ...datos }
      return next
    })
  }, [])

  // Producción, misma pestaña: instantáneo, sin red. Cubre el caso del cocinero
  // que marca la tarea y mira el mise en el mismo teléfono.
  useEffect(() => onMiseRegistroPatch(patch => {
    marcarEscrituraPropia(patch.itemId, patch.fecha, patch.turno)
    aplicarRegistroLocal(patch, true)
  }), [aplicarRegistroLocal, marcarEscrituraPropia])

  // Otro dispositivo: la tablet de cocina mostrando el mise mientras alguien
  // marca desde su celular. Filtrado por restaurante — para eso se agregó
  // checklist_registros.restaurante_id (migración 20260806b).
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const ch = supabase
      .channel(`checklist-reg-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'checklist_registros',
        filter: `restaurante_id=eq.${RESTAURANTE_ID}`,
      }, payload => {
        // Los DELETE traen solo la PK (replica identity default) — no hay nada
        // que parchear y la app no borra registros.
        const row = payload.new as Partial<MisePlaceRegistro> | null
        if (!row?.checklist_item_id || !row.fecha || !row.turno) return
        aplicarRegistroLocal({
          itemId: row.checklist_item_id, fecha: row.fecha, turno: row.turno,
          completado: row.completado, cantidad_actual: row.cantidad_actual ?? null,
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID, supabase, aplicarRegistroLocal])

  // ── Secciones CRUD ──
  async function agregarSeccion(datos: { nombre: string; icono: string; orden: number; plaza: Plaza; tipo?: ChecklistSeccionTipo; producto_ids?: string[]; parent_id?: string | null }) {
    try {
      const { data, error } = await supabase.from('checklist_secciones').insert({
        ...datos, restaurante_id: RESTAURANTE_ID,
      }).select('id').single()
      if (error) throw error
      await mutateConfig()
      return data.id as string
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al agregar sección'
      console.error('[useChecklist] agregarSeccion Error:', msg)
      throw new Error(msg)
    }
  }

  async function actualizarSeccion(id: string, datos: Partial<{ nombre: string; icono: string; orden: number; tipo: ChecklistSeccionTipo; producto_ids: string[]; parent_id: string | null }>) {
    try {
      const { error } = await supabase.from('checklist_secciones').update(datos).eq('id', id)
      if (error) throw error
      await mutateConfig()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar sección'
      console.error('[useChecklist] actualizarSeccion Error:', msg)
      throw new Error(msg)
    }
  }

  async function eliminarSeccion(id: string) {
    try {
      const { error } = await supabase.from('checklist_secciones').delete().eq('id', id)
      if (error) throw error
      await mutateConfig()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar sección'
      console.error('[useChecklist] eliminarSeccion Error:', msg)
      throw new Error(msg)
    }
  }

  async function reordenarSecciones(updates: { id: string; orden: number }[]) {
    try {
      for (const u of updates) {
        const { error } = await supabase.from('checklist_secciones').update({ orden: u.orden }).eq('id', u.id)
        if (error) throw error
      }
      await mutateConfig()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al reordenar secciones'
      console.error('[useChecklist] reordenarSecciones Error:', msg)
      throw new Error(msg)
    }
  }

  // ── Items CRUD ──
  async function agregarItem(datos: {
    plaza: Plaza; seccion_id: string; nombre: string; cantidad: number
    unidad: string; prioridad: MisePrioridad; ubicacion?: string; receta_id?: string; orden?: number
  }) {
    try {
      const { data, error } = await supabase.from('checklist_items').insert({
        ...datos, ubicacion: datos.ubicacion || null, receta_id: datos.receta_id || null,
        orden: datos.orden ?? 0, restaurante_id: RESTAURANTE_ID,
      }).select('id').single()
      if (error) throw error
      await mutateConfig()
      return data.id as string
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al agregar item'
      console.error('[useChecklist] agregarItem Error:', msg)
      throw new Error(msg)
    }
  }

  async function actualizarItem(id: string, datos: Partial<{ prioridad: MisePrioridad; nombre: string; cantidad: number; unidad: string; ubicacion: string | null; seccion_id: string; plaza: Plaza; seccion: string; recipiente_nombre: string | null; recipiente_capacidad: number | null; peso_porcion: number | null; peso_porcion_unidad: string | null; orden: number }>) {
    mutateConfig(
      (prev) => prev ? { ...prev, items: prev.items.map(i => i.id === id ? { ...i, ...datos } : i) } : prev,
      { revalidate: false }
    )
    try {
      const { error } = await supabase.from('checklist_items').update(datos).eq('id', id)
      if (error) throw error
    } catch (e: unknown) {
      await mutateConfig() // rollback via re-fetch
      const msg = e instanceof Error ? e.message : 'Error al actualizar item'
      console.error('[useChecklist] actualizarItem Error:', msg)
      throw new Error(msg)
    }
  }

  async function eliminarItem(id: string) {
    try {
      const { error } = await supabase.from('checklist_items').delete().eq('id', id)
      if (error) throw error
      await mutateConfig()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar item'
      console.error('[useChecklist] eliminarItem Error:', msg)
      throw new Error(msg)
    }
  }

  // ── Registros ──
  // Optimista: el tilde se pinta en el mismo frame del tap y la escritura viaja
  // después. Antes eran tres round-trips en serie antes de que el círculo se
  // pusiera verde (upsert → select ids → select registros); en la cocina, con
  // 4G, eso se sentía como un segundo largo de nada por cada ítem. Si la
  // escritura falla se refetchea y el estado vuelve a la verdad del servidor.
  const upsertRegistro = useCallback(async (
    itemId: string, fecha: string, turno: string,
    datos: { completado?: boolean; cantidad_actual?: number | null; usuario_id?: string | null },
  ) => {
    // Antes del optimista: el eco de este write vuelve por realtime en 1-3s y
    // sin esto podría pisar un tap posterior sobre el mismo ítem.
    marcarEscrituraPropia(itemId, fecha, turno)
    setRegistros(prev => {
      const idx = prev.findIndex(r => r.checklist_item_id === itemId && r.fecha === fecha && r.turno === turno)
      if (idx === -1) {
        return [...prev, {
          id: `optimistic-${itemId}-${fecha}-${turno}`,
          checklist_item_id: itemId, fecha, turno,
          completado: false, cantidad_actual: null,
          ...datos,
        } as MisePlaceRegistro]
      }
      const next = [...prev]
      next[idx] = { ...next[idx], ...datos }
      return next
    })
    try {
      const { error } = await supabase.from('checklist_registros').upsert({
        checklist_item_id: itemId, fecha, turno, ...datos,
      }, { onConflict: 'checklist_item_id,fecha,turno' })
      if (error) throw error
    } catch (e: unknown) {
      await fetchRegistros(fecha, turno)   // rollback contra el servidor
      const msg = e instanceof Error ? e.message : 'Error al guardar registro'
      console.error('[useChecklist] upsertRegistro Error:', msg)
      throw new Error(msg)
    }
  }, [supabase, fetchRegistros, marcarEscrituraPropia])

  // ── Rutinas CRUD ──
  async function agregarRutina(datos: {
    nombre: string; plaza: Plaza; frecuencia: RutinaFrecuencia; orden?: number
    dias_semana?: number[] | null; dia_mes?: number | null
    puntaje?: number | null; requiere_foto?: boolean; condicion?: RutinaCondicion | null
  }) {
    try {
      const { error } = await supabase.from('checklist_rutina').insert({
        ...datos, orden: datos.orden ?? 0, restaurante_id: RESTAURANTE_ID,
      })
      if (error) throw error
      await mutateConfig()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al agregar rutina'
      console.error('[useChecklist] agregarRutina Error:', msg)
      throw new Error(msg)
    }
  }

  async function actualizarRutina(id: string, datos: Partial<{
    nombre: string; frecuencia: RutinaFrecuencia
    puntaje: number | null; requiere_foto: boolean; condicion: RutinaCondicion | null
  }>) {
    try {
      const { error } = await supabase.from('checklist_rutina').update(datos).eq('id', id)
      if (error) throw error
      await mutateConfig()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar rutina'
      console.error('[useChecklist] actualizarRutina Error:', msg)
      throw new Error(msg)
    }
  }

  async function eliminarRutina(id: string) {
    try {
      const { error } = await supabase.from('checklist_rutina').delete().eq('id', id)
      if (error) throw error
      await mutateConfig()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar rutina'
      console.error('[useChecklist] eliminarRutina Error:', msg)
      throw new Error(msg)
    }
  }

  async function toggleRutina(rutinaId: string, fecha: string, completado: boolean) {
    try {
      if (completado) {
        const { error: upsErr } = await supabase.from('checklist_rutina_registros').upsert({
          rutina_id: rutinaId, fecha, completado: true,
        }, { onConflict: 'rutina_id,fecha' })
        if (upsErr) throw upsErr
        const { error: updErr } = await supabase.from('checklist_rutina').update({ ultima_vez: new Date().toISOString() }).eq('id', rutinaId)
        if (updErr) throw updErr
      } else {
        const { error: delErr } = await supabase.from('checklist_rutina_registros').delete()
          .eq('rutina_id', rutinaId).eq('fecha', fecha)
        if (delErr) throw delErr
      }
      await Promise.all([fetchRutinaRegistros(fecha), mutateConfig()])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cambiar estado de rutina'
      console.error('[useChecklist] toggleRutina Error:', msg)
      throw new Error(msg)
    }
  }

  // ── Auditoría (M4, jul 2026) ──
  // Registra la respuesta de un ítem de auditoría (rutina con puntaje). completado siempre true;
  // estado distingue ok/fallo. No usar para rutinas sin puntaje — para esas, toggleRutina alcanza.
  async function registrarAuditoriaRutina(rutinaId: string, fecha: string, estado: 'ok' | 'fallo', fotoUrl: string | null) {
    try {
      const { error: upsErr } = await supabase.from('checklist_rutina_registros').upsert({
        rutina_id: rutinaId, fecha, completado: true, estado, foto_url: fotoUrl,
      }, { onConflict: 'rutina_id,fecha' })
      if (upsErr) throw upsErr
      const { error: updErr } = await supabase.from('checklist_rutina').update({ ultima_vez: new Date().toISOString() }).eq('id', rutinaId)
      if (updErr) throw updErr
      await Promise.all([fetchRutinaRegistros(fecha), mutateConfig()])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al registrar auditoría'
      console.error('[useChecklist] registrarAuditoriaRutina Error:', msg)
      throw new Error(msg)
    }
  }

  // Snapshot agregado de una pasada de auditoría (plaza+fecha) — se re-escribe si se corrige un ítem después.
  async function guardarAuditoriaPasada(datos: {
    plaza: string; fecha: string
    puntaje_obtenido: number; puntaje_posible: number; score: number
    items_evaluados: number; items_fallidos: number; usuario_id: string | null
  }) {
    try {
      const { error } = await supabase.from('checklist_auditorias').upsert({
        ...datos, restaurante_id: RESTAURANTE_ID,
      }, { onConflict: 'restaurante_id,plaza,fecha' })
      if (error) throw error
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al guardar la auditoría'
      console.error('[useChecklist] guardarAuditoriaPasada Error:', msg)
      throw new Error(msg)
    }
  }

  // useCallback: reportes/page.tsx la usa como dependencia de su propio useCallback (loadTab) —
  // sin memoizar, cada render generaría una referencia nueva y dispararía un loop de renders.
  const fetchAuditorias = useCallback(async (desde: string, hasta?: string): Promise<ChecklistAuditoria[]> => {
    if (!RESTAURANTE_ID) return []
    try {
      let q = supabase.from('checklist_auditorias').select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .gte('fecha', desde)
        .order('fecha', { ascending: true })
      if (hasta) q = q.lte('fecha', hasta)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as ChecklistAuditoria[]
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar el histórico de auditorías'
      console.error('[useChecklist] fetchAuditorias Error:', msg)
      throw new Error(msg)
    }
  }, [RESTAURANTE_ID, supabase])

  // useCallback: igual que fetchAuditorias, se usa en el loadTab de Reportes —
  // sin memoizar, generaría un loop de renders (ver hooks.md #10).
  const fetchAuditoriaPaseTurno = useCallback(async (desde: string, hasta?: string): Promise<PaseTurnoIncumplido[]> => {
    if (!RESTAURANTE_ID) return []
    try {
      const { data: itemsData, error: itemsErr } = await supabase.from('checklist_items').select('id, plaza')
        .eq('restaurante_id', RESTAURANTE_ID)
      if (itemsErr) throw itemsErr
      const itemPlaza = new Map<string, string>()
      for (const i of (itemsData ?? []) as { id: string; plaza: string }[]) itemPlaza.set(i.id, i.plaza)
      const itemIds = Array.from(itemPlaza.keys())
      if (itemIds.length === 0) return []

      let q = supabase.from('checklist_registros')
        .select('checklist_item_id, fecha, turno, completado, usuario_id')
        .in('checklist_item_id', itemIds)
        .gte('fecha', desde)
      if (hasta) q = q.lte('fecha', hasta)
      const { data: regs, error: regErr } = await q
      if (regErr) throw regErr

      interface Grupo { hasApertura: boolean; hasCierreCompletado: boolean; ultimoUsuarioId: string | null }
      const grupos = new Map<string, Grupo>()
      for (const r of (regs ?? []) as { checklist_item_id: string; fecha: string; turno: string; completado: boolean; usuario_id: string | null }[]) {
        const plaza = itemPlaza.get(r.checklist_item_id)
        if (!plaza) continue
        const { turnoId, fase } = parseTurnoFase(r.turno)
        const key = `${r.fecha}|${turnoId ?? 'legacy'}|${plaza}`
        const g = grupos.get(key) ?? { hasApertura: false, hasCierreCompletado: false, ultimoUsuarioId: null }
        if (fase === 'apertura') g.hasApertura = true
        if (fase === 'cierre') {
          if (r.completado) g.hasCierreCompletado = true
          if (r.usuario_id) g.ultimoUsuarioId = r.usuario_id
        }
        grupos.set(key, g)
      }

      const incumplidos: PaseTurnoIncumplido[] = []
      for (const [key, g] of grupos) {
        // Solo cuenta si hubo apertura (el turno se usó) y ningún cierre completado.
        if (!g.hasApertura || g.hasCierreCompletado) continue
        const [fecha, turnoId, plaza] = key.split('|')
        incumplidos.push({ fecha, turnoId: turnoId === 'legacy' ? null : turnoId, plaza, usuarioId: g.ultimoUsuarioId })
      }
      return incumplidos.sort((a, b) => b.fecha.localeCompare(a.fecha))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar el pase de turno'
      console.error('[useChecklist] fetchAuditoriaPaseTurno Error:', msg)
      throw new Error(msg)
    }
  }, [RESTAURANTE_ID, supabase])

  return {
    secciones, items, registros, rutinas, rutinaRegistros, loading, error,
    fetchAll, fetchRegistros, fetchRegistrosDelDia, fetchRutinaRegistros,
    agregarSeccion, actualizarSeccion, eliminarSeccion, reordenarSecciones,
    agregarItem, actualizarItem, eliminarItem, upsertRegistro,
    agregarRutina, actualizarRutina, eliminarRutina, toggleRutina,
    registrarAuditoriaRutina, guardarAuditoriaPasada, fetchAuditorias, fetchAuditoriaPaseTurno,
    // Refresco explícito tras una escritura externa a secciones/items (ej.
    // upsertMiseChecklistItem/shrinkOrPruneMise desde el board de Carta) —
    // la realtime subscription ya lo hace sola en 1-3s, esto evita esa espera.
    refetchConfig: mutateConfig,
  }
}
