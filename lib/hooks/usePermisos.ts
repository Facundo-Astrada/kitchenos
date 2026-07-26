'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/context'
import { useRestauranteId } from './useRestauranteId'
import { MODULOS_EMPRENDIMIENTO } from '@/lib/constants'
import type { RolPermiso } from '@/types'

interface PermisosState {
  permisos: RolPermiso | null
  allPermisos: RolPermiso[]
  loading: boolean
  error: string | null
  puedeVer: (modulo: string) => boolean
  puedeEditar: (recurso: 'stock' | 'equipo' | 'recetas' | 'carta') => boolean
  puedeEliminar: boolean
  isAdmin: boolean
  /** 'emprendimiento' | null — perfil del restaurante (restaurantes.configuracion.perfil) */
  perfilRestaurante: string | null
  /** true si el módulo está permitido por el perfil del restaurante (null = sin restricción, todo pasa) */
  moduloEnPerfil: (modulo: string) => boolean
  fetchPermisos: () => Promise<void>
  updatePermisos: (rolPermiso: Partial<RolPermiso> & { id: string }) => Promise<void>
  upsertPermisos: (rol: string, data: Partial<Omit<RolPermiso, 'id' | 'restaurante_id' | 'rol' | 'created_at' | 'updated_at'>>) => Promise<void>
}

export function usePermisos(): PermisosState {
  const RESTAURANTE_ID = useRestauranteId()
  const { perfil, user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [permisos, setPermisos] = useState<RolPermiso | null>(null)
  const [allPermisos, setAllPermisos] = useState<RolPermiso[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Módulos efectivos del usuario logueado (puesto + overrides individuales)
  const [modulosEfectivos, setModulosEfectivos] = useState<string[] | null>(null)

  // Perfil del restaurante (ej. 'emprendimiento') — capa aparte de puedeVer/isAdmin
  const [perfilRestaurante, setPerfilRestaurante] = useState<string | null>(null)

  const dbRol = perfil?.rol === 'admin' ? 'admin'
    : perfil?.rol === 'chef' ? 'sous_chef'
    : perfil?.rol === 'ayudante' ? 'bachero'
    : ['parrilla','frios','calientes','pase','pasteleria','panaderia','linea'].includes(perfil?.rol ?? '') ? 'cocinero'
    : perfil?.rol ?? ''

  const fetchPermisos = useCallback(async () => {
    if (!RESTAURANTE_ID) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    try {
      // 1. Cargar todos los rol_permisos del restaurante
      const { data: all, error: allErr } = await supabase
        .from('rol_permisos')
        .select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('rol')
      if (allErr) throw allErr

      setAllPermisos(all ?? [])

      const mine = (all ?? []).find(p => p.rol === dbRol) ?? null
      setPermisos(mine)

      // 1b. Perfil del restaurante (modo emprendimiento vs. gestión completa)
      const { data: rest } = await supabase
        .from('restaurantes')
        .select('configuracion')
        .eq('id', RESTAURANTE_ID)
        .maybeSingle()
      const configuracion = (rest?.configuracion ?? null) as { perfil?: string } | null
      setPerfilRestaurante(configuracion?.perfil ?? null)

      // 2. Si hay un usuario logueado con auth_user_id, buscar su equipo_miembro + puesto
      if (user?.id && dbRol !== 'admin') {
        const { data: miembro } = await supabase
          .from('equipo_miembros')
          .select('puesto_id, modulos_extra, modulos_restringidos')
          .eq('restaurante_id', RESTAURANTE_ID)
          .eq('auth_user_id', user.id)
          .eq('activo', true)
          .maybeSingle()

        if (miembro?.puesto_id) {
          const { data: puesto } = await supabase
            .from('puestos')
            .select('permisos_app')
            .eq('id', miembro.puesto_id)
            .maybeSingle()

          if (puesto?.permisos_app) {
            const extra = miembro.modulos_extra ?? []
            const restringidos = miembro.modulos_restringidos ?? []
            const base = puesto.permisos_app as string[]
            const efectivos = [...new Set([...base, ...extra])].filter(m => !restringidos.includes(m))
            setModulosEfectivos(efectivos)
            return
          }
        }
      }
      // Sin puesto asignado — usa rol_permisos como fallback
      setModulosEfectivos(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar permisos'
      console.error('[usePermisos] Error:', msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [RESTAURANTE_ID, dbRol, supabase, user?.id])

  useEffect(() => {
    fetchPermisos()
  }, [fetchPermisos])

  const puedeVer = useCallback((modulo: string): boolean => {
    if (dbRol === 'admin') return true
    // Prioridad: módulos efectivos del puesto (si existen) → rol_permisos fallback
    if (modulosEfectivos !== null) return modulosEfectivos.includes(modulo)
    if (!permisos) return false
    return permisos.modulos_visibles.includes(modulo)
  }, [permisos, dbRol, modulosEfectivos])

  // null = sin restricción de perfil (comportamiento actual, no-regresión).
  const perfilModulos = perfilRestaurante === 'emprendimiento' ? MODULOS_EMPRENDIMIENTO : null
  const moduloEnPerfil = useCallback((modulo: string): boolean => {
    if (perfilModulos === null) return true
    if (modulo === 'home') return true
    return (perfilModulos as string[]).includes(modulo)
  }, [perfilModulos])

  const puedeEditar = useCallback((recurso: 'stock' | 'equipo' | 'recetas' | 'carta'): boolean => {
    if (dbRol === 'admin') return true
    if (!permisos) return false
    switch (recurso) {
      case 'stock':   return permisos.puede_editar_stock
      case 'equipo':  return permisos.puede_editar_equipo
      case 'recetas': return permisos.puede_editar_recetas
      case 'carta':   return permisos.puede_editar_carta
      default:        return false
    }
  }, [permisos, dbRol])

  const updatePermisos = useCallback(async (rolPermiso: Partial<RolPermiso> & { id: string }) => {
    try {
      const { error: err } = await supabase
        .from('rol_permisos')
        .update({ ...rolPermiso, updated_at: new Date().toISOString() })
        .eq('id', rolPermiso.id)
      if (err) throw err
      await fetchPermisos()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar permisos'
      console.error('[usePermisos] updatePermisos Error:', msg)
      throw new Error(msg)
    }
  }, [supabase, fetchPermisos])

  const upsertPermisos = useCallback(async (
    rol: string,
    data: Partial<Omit<RolPermiso, 'id' | 'restaurante_id' | 'rol' | 'created_at' | 'updated_at'>>
  ) => {
    if (!RESTAURANTE_ID) return
    try {
      const { error: err } = await supabase
        .from('rol_permisos')
        .upsert({
          restaurante_id: RESTAURANTE_ID,
          rol,
          ...data,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'restaurante_id,rol' })
      if (err) throw err
      await fetchPermisos()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al guardar permisos'
      console.error('[usePermisos] upsertPermisos Error:', msg)
      throw new Error(msg)
    }
  }, [supabase, RESTAURANTE_ID, fetchPermisos])

  return {
    permisos,
    allPermisos,
    loading,
    error,
    puedeVer,
    puedeEditar,
    puedeEliminar: dbRol === 'admin' || (permisos?.puede_eliminar ?? false),
    isAdmin: dbRol === 'admin',
    perfilRestaurante,
    moduloEnPerfil,
    fetchPermisos,
    updatePermisos,
    upsertPermisos,
  }
}
