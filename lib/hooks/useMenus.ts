'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'

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
  orden: number
}

export interface MenuConPreparaciones {
  id: string
  restaurante_id: string
  nombre: string
  tipo: MenuTipo
  descripcion: string | null
  activo: boolean
  created_at: string
  preparaciones: MenuPreparacion[]
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
}

export function useMenus() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = createClient()
  const [menus, setMenus] = useState<MenuConPreparaciones[]>([])
  const [loading, setLoading] = useState(true)

  const fetchMenus = useCallback(async () => {
    if (!RESTAURANTE_ID) return
    setLoading(true)
    const { data: menusData } = await supabase
      .from('menus')
      .select('*')
      .eq('restaurante_id', RESTAURANTE_ID)
      .eq('activo', true)
      .order('created_at', { ascending: false })

    const ids = (menusData ?? []).map(m => m.id)
    let preps: MenuPreparacion[] = []
    if (ids.length > 0) {
      const { data: prepData } = await supabase
        .from('menu_preparaciones')
        .select('*')
        .in('menu_id', ids)
        .order('orden', { ascending: true })
      preps = (prepData ?? []) as MenuPreparacion[]
    }

    const result: MenuConPreparaciones[] = (menusData ?? []).map(m => ({
      ...(m as Omit<MenuConPreparaciones, 'preparaciones'>),
      preparaciones: preps.filter(p => p.menu_id === m.id),
    }))
    setMenus(result)
    setLoading(false)
  }, [RESTAURANTE_ID]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchMenus() }, [fetchMenus])

  // ── Crear menú + sus preparaciones ──
  const crearMenu = useCallback(async (
    data: { nombre: string; tipo: MenuTipo; descripcion?: string | null },
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
    data: { nombre: string; tipo: MenuTipo; descripcion?: string | null },
    preps: PrepInput[],
  ) => {
    const { error } = await supabase
      .from('menus')
      .update({ nombre: data.nombre, tipo: data.tipo, descripcion: data.descripcion ?? null, updated_at: new Date().toISOString() })
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
            modo: 'menu',
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

  return { menus, loading, fetchMenus, crearMenu, actualizarMenu, eliminarMenu }
}
