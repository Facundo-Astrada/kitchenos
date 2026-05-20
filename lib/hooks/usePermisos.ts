'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/context'
import { useRestauranteId } from './useRestauranteId'
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
  fetchPermisos: () => Promise<void>
  updatePermisos: (rolPermiso: Partial<RolPermiso> & { id: string }) => Promise<void>
  upsertPermisos: (rol: string, data: Partial<Omit<RolPermiso, 'id' | 'restaurante_id' | 'rol' | 'created_at' | 'updated_at'>>) => Promise<void>
}

export function usePermisos(): PermisosState {
  const RESTAURANTE_ID = useRestauranteId()
  const { perfil } = useAuth()
  const [supabase] = useState(() => createClient())
  const [permisos, setPermisos] = useState<RolPermiso | null>(null)
  const [allPermisos, setAllPermisos] = useState<RolPermiso[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const dbRol = perfil?.rol === 'admin' ? 'admin'
    : perfil?.rol === 'chef' ? 'sous_chef'
    : perfil?.rol === 'ayudante' ? 'bachero'
    : ['parrilla','frios','calientes','pase','pasteleria','panaderia','linea'].includes(perfil?.rol ?? '') ? 'cocinero'
    : perfil?.rol ?? ''

  const fetchPermisos = useCallback(async () => {
    if (!RESTAURANTE_ID) {
      // No restaurant ID — stop loading so RouteGuard doesn't hang
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    try {
      // Fetch all role permissions for this restaurant
      const { data: all, error: allErr } = await supabase
        .from('rol_permisos')
        .select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('rol')

      if (allErr) throw allErr

      setAllPermisos(all ?? [])

      // Find the current user's role permissions
      const mine = (all ?? []).find(p => p.rol === dbRol) ?? null
      setPermisos(mine)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar permisos'
      console.error('[usePermisos] Error:', msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [RESTAURANTE_ID, dbRol, supabase])

  useEffect(() => {
    fetchPermisos()
  }, [fetchPermisos])

  const puedeVer = useCallback((modulo: string): boolean => {
    // Admin always sees everything
    if (dbRol === 'admin') return true
    if (!permisos) return false
    return permisos.modulos_visibles.includes(modulo)
  }, [permisos, dbRol])

  const puedeEditar = useCallback((recurso: 'stock' | 'equipo' | 'recetas' | 'carta'): boolean => {
    if (dbRol === 'admin') return true
    if (!permisos) return false
    switch (recurso) {
      case 'stock': return permisos.puede_editar_stock
      case 'equipo': return permisos.puede_editar_equipo
      case 'recetas': return permisos.puede_editar_recetas
      case 'carta': return permisos.puede_editar_carta
      default: return false
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
    fetchPermisos,
    updatePermisos,
    upsertPermisos,
  }
}
