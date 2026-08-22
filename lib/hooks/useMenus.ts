'use client'
import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import { sincronizarMiseDeMenu, desactivarMiseDeMenu, type SincronizarMiseResultado } from '@/lib/ops/menuMise'

export type MenuTipo = 'fijo' | 'evento'
export type PrepTipo = 'plato' | 'receta' | 'producto' | null
export type PrepPrioridad = 'critica' | 'alta' | 'media' | 'baja'

export interface MenuPreparacion {
  id: string
  menu_id: string
  paso: string
  tipo: PrepTipo
  ref_id: string | null
  nombre: string
  prioridad: PrepPrioridad
  plaza: string | null
  seccion_mise: string | null
  usuario_asignado: string | null
  cantidad: number | null
  unidad: string | null
  variante: string | null
  cantidad_ops: number | null
  unidad_ops: string | null
  recipiente_nombre: string | null
  peso_porcion: number | null
  peso_porcion_unidad: string | null
  orden: number
}

export interface MenuConPreparaciones {
  id: string
  restaurante_id: string
  nombre: string
  tipo: MenuTipo
  descripcion: string | null
  fecha_evento: string | null
  vigencia_desde: string | null
  vigencia_hasta: string | null
  // Si está cargada, activar en el mise manda TODAS las preparaciones a esta
  // plaza (real o custom) en vez de la que cada una tenga configurada — para
  // que una sola persona controle el menú entero desde una plaza propia.
  plaza_control: string | null
  variantes: string[] | null
  precio: number | null
  activo: boolean
  created_at: string
  preparaciones: MenuPreparacion[]
  // true si el menú tiene checklist_items propios (activado en el mise) —
  // independiente de si hoy cae dentro de su vigencia (ver MenusView).
  enMise: boolean
}

// Datos de una preparación al crear/editar (sin id ni menu_id — se asignan al guardar)
export interface PrepInput {
  paso: string
  tipo: PrepTipo
  ref_id: string | null
  nombre: string
  prioridad: PrepPrioridad
  plaza: string | null
  seccion_mise?: string | null
  usuario_asignado: string | null
  cantidad?: number | null
  unidad?: string | null
  variante?: string | null
  cantidad_ops?: number | null
  unidad_ops?: string | null
  recipiente_nombre?: string | null
  peso_porcion?: number | null
  peso_porcion_unidad?: string | null
}

async function fetchMenusData(key: string): Promise<MenuConPreparaciones[]> {
  const rid = key.slice('menus-'.length)
  const supabase = createClient()
  const { data: menusData } = await supabase
    .from('menus')
    .select('*')
    .eq('restaurante_id', rid)
    .eq('activo', true)
    .order('created_at', { ascending: false })

  const ids = (menusData ?? []).map(m => m.id)
  let preps: MenuPreparacion[] = []
  let idsEnMise = new Set<string>()
  if (ids.length > 0) {
    const [{ data: prepData }, { data: miseData }] = await Promise.all([
      supabase.from('menu_preparaciones').select('*').in('menu_id', ids).order('orden', { ascending: true }),
      // Una sola query agregada para las N cards de MenusView — no una por card.
      supabase.from('checklist_items').select('menu_id').in('menu_id', ids),
    ])
    preps = (prepData ?? []) as MenuPreparacion[]
    idsEnMise = new Set((miseData ?? []).map((r: { menu_id: string | null }) => r.menu_id).filter((id): id is string => !!id))
  }

  return (menusData ?? []).map(m => ({
    ...(m as Omit<MenuConPreparaciones, 'preparaciones' | 'enMise'>),
    preparaciones: preps.filter(p => p.menu_id === m.id),
    enMise: idsEnMise.has(m.id),
  }))
}

export function useMenus() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID ? `menus-${RESTAURANTE_ID}` : null

  const { data: menus = [], isLoading: loading, mutate } = useSWR(
    swrKey,
    fetchMenusData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 300_000,
      keepPreviousData: true,
    }
  )

  const fetchMenus = useCallback(async () => { await mutate() }, [mutate])

  // ── Crear menú + sus preparaciones ──
  const crearMenu = useCallback(async (
    data: { nombre: string; tipo: MenuTipo; descripcion?: string | null; fecha_evento?: string | null; vigencia_desde?: string | null; vigencia_hasta?: string | null; plaza_control?: string | null; variantes?: string[] | null; precio?: number | null },
    preps: PrepInput[],
  ): Promise<string | null> => {
    if (!RESTAURANTE_ID) return null
    const { data: menu, error } = await supabase
      .from('menus')
      .insert({
        restaurante_id: RESTAURANTE_ID,
        nombre: data.nombre,
        tipo: data.tipo,
        descripcion: data.descripcion ?? null,
        fecha_evento: data.fecha_evento ?? null,
        vigencia_desde: data.vigencia_desde ?? null,
        vigencia_hasta: data.vigencia_hasta ?? null,
        plaza_control: data.plaza_control ?? null,
        variantes: data.variantes && data.variantes.length > 0 ? data.variantes : null,
        precio: data.precio ?? null,
      })
      .select('id')
      .single()
    if (error || !menu) throw new Error(error?.message ?? 'Error al crear menú')

    if (preps.length > 0) {
      const rows = preps.map((p, i) => ({
        menu_id: menu.id,
        paso: p.paso,
        tipo: p.tipo,
        ref_id: p.ref_id,
        nombre: p.nombre,
        prioridad: p.prioridad,
        plaza: p.plaza,
        seccion_mise: p.seccion_mise ?? null,
        usuario_asignado: p.usuario_asignado,
        cantidad: p.cantidad ?? null,
        unidad: p.unidad ?? null,
        variante: p.variante ?? null,
        cantidad_ops: p.cantidad_ops ?? null,
        unidad_ops: p.unidad_ops ?? null,
        recipiente_nombre: p.recipiente_nombre ?? null,
        peso_porcion: p.peso_porcion ?? null,
        peso_porcion_unidad: p.peso_porcion_unidad ?? null,
        orden: i,
      }))
      const { error: prepErr } = await supabase.from('menu_preparaciones').insert(rows)
      if (prepErr) throw new Error(prepErr.message)
    }
    await fetchMenus()
    return menu.id
  }, [RESTAURANTE_ID, fetchMenus]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actualizar menú: update + reemplazar preparaciones ──
  const actualizarMenu = useCallback(async (
    id: string,
    data: { nombre: string; tipo: MenuTipo; descripcion?: string | null; fecha_evento?: string | null; vigencia_desde?: string | null; vigencia_hasta?: string | null; plaza_control?: string | null; variantes?: string[] | null; precio?: number | null },
    preps: PrepInput[],
  ) => {
    const { error } = await supabase
      .from('menus')
      .update({ nombre: data.nombre, tipo: data.tipo, descripcion: data.descripcion ?? null, fecha_evento: data.fecha_evento ?? null, vigencia_desde: data.vigencia_desde ?? null, vigencia_hasta: data.vigencia_hasta ?? null, plaza_control: data.plaza_control ?? null, variantes: data.variantes && data.variantes.length > 0 ? data.variantes : null, precio: data.precio ?? null, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)

    const { error: delErr } = await supabase.from('menu_preparaciones').delete().eq('menu_id', id)
    if (delErr) throw new Error(delErr.message)

    if (preps.length > 0) {
      const rows = preps.map((p, i) => ({
        menu_id: id,
        paso: p.paso,
        tipo: p.tipo,
        ref_id: p.ref_id,
        nombre: p.nombre,
        prioridad: p.prioridad,
        plaza: p.plaza,
        seccion_mise: p.seccion_mise ?? null,
        usuario_asignado: p.usuario_asignado,
        cantidad: p.cantidad ?? null,
        unidad: p.unidad ?? null,
        variante: p.variante ?? null,
        cantidad_ops: p.cantidad_ops ?? null,
        unidad_ops: p.unidad_ops ?? null,
        recipiente_nombre: p.recipiente_nombre ?? null,
        peso_porcion: p.peso_porcion ?? null,
        peso_porcion_unidad: p.peso_porcion_unidad ?? null,
        orden: i,
      }))
      const { error: prepErr } = await supabase.from('menu_preparaciones').insert(rows)
      if (prepErr) throw new Error(prepErr.message)
    }

    // ── Propagar a las fechas YA activadas (hoy en adelante; el pasado no se toca) ──
    // Las tareas son un snapshot del menú al activarlo. Al editar el menú sincronizamos:
    // agregamos las preparaciones nuevas, refrescamos las existentes, y sacamos las
    // borradas SOLO si todavía no se empezaron (no se pisa trabajo ya hecho/en curso).
    const hoy = new Date().toISOString().split('T')[0]
    const { data: activadas } = await supabase
      .from('tareas')
      .select('id, titulo, turno_fecha, estado')
      .eq('menu_id', id)
      .is('parent_id', null)
      .gte('turno_fecha', hoy)
    if (activadas && activadas.length > 0) {
      const fechas = [...new Set((activadas as { turno_fecha: string }[]).map(t => t.turno_fecha))]
      const prepByName = new Map(preps.map(p => [p.nombre, p]))
      for (const f of fechas) {
        const existentes = (activadas as { id: string; titulo: string; turno_fecha: string; estado: string }[])
          .filter(t => t.turno_fecha === f)
        const existentesNombres = new Set(existentes.map(t => t.titulo))
        // AGREGAR las preparaciones que aún no existen en esa fecha
        const nuevas = preps
          .filter(p => !existentesNombres.has(p.nombre))
          .map((p, i) => ({
            titulo: p.nombre,
            descripcion: data.nombre,
            status: 'pendiente',
            estado: 'pendiente',
            prioridad: p.prioridad,
            categoria: 'produccion',
            modo: data.tipo === 'evento' ? 'evento' : 'menu',
            seccion: p.paso || 'general',
            plaza: p.plaza,
            asignado_a: p.usuario_asignado,
            receta_id: p.tipo === 'receta' ? p.ref_id : null,
            cantidad: p.cantidad ?? null,
            turno_fecha: f,
            menu_id: id,
            orden: 1000 + i,
            restaurante_id: RESTAURANTE_ID,
          }))
        if (nuevas.length > 0) await supabase.from('tareas').insert(nuevas)
        // ACTUALIZAR las existentes / SACAR las borradas que no se empezaron
        for (const t of existentes) {
          const p = prepByName.get(t.titulo)
          if (p) {
            await supabase.from('tareas').update({
              prioridad: p.prioridad,
              seccion: p.paso || 'general',
              plaza: p.plaza,
              receta_id: p.tipo === 'receta' ? p.ref_id : null,
              cantidad: p.cantidad ?? null,
            }).eq('id', t.id)
          } else if (t.estado === 'pendiente') {
            await supabase.from('tareas').delete().eq('id', t.id)
          }
        }
      }
    }

    await fetchMenus()
  }, [RESTAURANTE_ID, fetchMenus]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Soft-delete ──
  const eliminarMenu = useCallback(async (id: string) => {
    const { error } = await supabase.from('menus').update({ activo: false }).eq('id', id)
    if (error) throw new Error(error.message)
    await fetchMenus()
  }, [fetchMenus]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mise: activar/desactivar (ver lib/ops/menuMise.ts, PLAN-MENUS-MISE) ──
  const activarEnMise = useCallback(async (menu: MenuConPreparaciones): Promise<SincronizarMiseResultado | null> => {
    if (!RESTAURANTE_ID) return null
    const res = await sincronizarMiseDeMenu({ supabase, restauranteId: RESTAURANTE_ID, menu: { id: menu.id, plazaControl: menu.plaza_control, preparaciones: menu.preparaciones } })
    await fetchMenus()
    return res
  }, [RESTAURANTE_ID, fetchMenus]) // eslint-disable-line react-hooks/exhaustive-deps

  const desactivarEnMise = useCallback(async (menuId: string) => {
    await desactivarMiseDeMenu(supabase, menuId)
    await fetchMenus()
  }, [fetchMenus]) // eslint-disable-line react-hooks/exhaustive-deps

  return { menus, loading, fetchMenus, crearMenu, actualizarMenu, eliminarMenu, activarEnMise, desactivarEnMise }
}
