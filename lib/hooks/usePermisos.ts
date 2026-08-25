'use client'

import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/context'
import { useRestauranteId } from './useRestauranteId'
import { useRestauranteConfig } from './useRestauranteConfig'
import { MODULOS_EMPRENDIMIENTO } from '@/lib/constants'
import { puedeVerCostos, puedeVerModulo, resolverModulosEfectivos } from '@/lib/permisos/resolver'
import type { RolPermiso } from '@/types'

const SWR_OPTS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 300_000,
  keepPreviousData: true,
} as const

const SIN_PERMISOS: RolPermiso[] = []

interface PermisosState {
  permisos: RolPermiso | null
  allPermisos: RolPermiso[]
  loading: boolean
  error: string | null
  puedeVer: (modulo: string) => boolean
  puedeEditar: (recurso: 'stock' | 'equipo' | 'recetas' | 'carta') => boolean
  puedeEliminar: boolean
  /** Ve precios, costos, food cost, margen y stock valorizado. Configurable por puesto. */
  verCostos: boolean
  isAdmin: boolean
  /** 'emprendimiento' | null — perfil del restaurante (restaurantes.configuracion.perfil) */
  perfilRestaurante: string | null
  /** true si el módulo está permitido por el perfil del restaurante (null = sin restricción, todo pasa) */
  moduloEnPerfil: (modulo: string) => boolean
  fetchPermisos: () => Promise<void>
  updatePermisos: (rolPermiso: Partial<RolPermiso> & { id: string }) => Promise<void>
  upsertPermisos: (rol: string, data: Partial<Omit<RolPermiso, 'id' | 'restaurante_id' | 'rol' | 'created_at' | 'updated_at'>>) => Promise<void>
}

interface PermisosData {
  allPermisos: RolPermiso[]
  /** null = sin puesto asignado, usar rol_permisos como fallback */
  modulosEfectivos: string[] | null
  /** `puestos.ver_costos` del puesto asignado. null = sin puesto. */
  verCostosPuesto: boolean | null
  /** `equipo_miembros.ver_costos` — override por persona. null = sin override. */
  verCostosMiembro: boolean | null
}

interface MiembroPuestoRow {
  puesto_id: string | null
  modulos_extra: string[] | null
  modulos_restringidos: string[] | null
  ver_costos: boolean | null
}

function permisosKey(restauranteId: string, userId: string, dbRol: string) {
  // '|' como separador: restauranteId/userId son UUIDs (contienen '-'), dbRol no contiene '|'
  return `permisos|${restauranteId}|${userId}|${dbRol}`
}

function errMsg(e: unknown, fallback: string): string {
  // Los errores de Supabase NO son Error — son {message, code, details} (hooks.md #2)
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return fallback
}

async function fetchPermisosData(key: string): Promise<PermisosData> {
  const [, restauranteId, userId, dbRol] = key.split('|')
  const supabase = createClient()

  const allPromise = supabase.from('rol_permisos').select('*').eq('restaurante_id', restauranteId).order('rol')
  const miembroPromise = dbRol === 'admin'
    ? null
    : supabase.from('equipo_miembros').select('puesto_id, modulos_extra, modulos_restringidos, ver_costos')
        .eq('restaurante_id', restauranteId).eq('auth_user_id', userId).eq('activo', true).maybeSingle()

  const [allRes, miembroRes] = await Promise.all([allPromise, miembroPromise])
  if (allRes.error) throw allRes.error

  const allPermisos = (allRes.data ?? []) as RolPermiso[]

  let modulosEfectivos: string[] | null = null
  let verCostosPuesto: boolean | null = null
  const miembro = miembroRes?.data as MiembroPuestoRow | null | undefined
  if (miembro?.puesto_id) {
    const { data: puesto } = await supabase.from('puestos').select('permisos_app, ver_costos').eq('id', miembro.puesto_id).maybeSingle()
    modulosEfectivos = resolverModulosEfectivos({
      permisosApp: puesto?.permisos_app as string[] | null | undefined,
      modulosExtra: miembro.modulos_extra,
      modulosRestringidos: miembro.modulos_restringidos,
    })
    // Independiente de modulosEfectivos a propósito: un puesto sin permisos_app
    // cargados degrada al fallback por rol para los MÓDULOS, pero su ver_costos
    // sigue siendo una decisión explícita del admin y vale igual.
    verCostosPuesto = (puesto?.ver_costos as boolean | null | undefined) ?? null
  }

  return {
    allPermisos,
    modulosEfectivos,
    verCostosPuesto,
    verCostosMiembro: miembro?.ver_costos ?? null,
  }
}

export function usePermisos(): PermisosState {
  const RESTAURANTE_ID = useRestauranteId()
  const { perfil, user } = useAuth()
  // restaurantes.configuracion — key SWR compartida con el resto de la app (nunca query propia, ver hooks.md § Peso de la pantalla)
  const { configuracion, loading: configLoading } = useRestauranteConfig()
  const perfilRestaurante = (configuracion?.perfil as string | undefined) ?? null

  const dbRol = perfil?.rol === 'admin' ? 'admin'
    : perfil?.rol === 'chef' ? 'sous_chef'
    : perfil?.rol === 'ayudante' ? 'bachero'
    : ['parrilla', 'frios', 'calientes', 'pase', 'pasteleria', 'panaderia', 'linea'].includes(perfil?.rol ?? '') ? 'cocinero'
    : perfil?.rol ?? ''

  const swrKey = RESTAURANTE_ID && user?.id ? permisosKey(RESTAURANTE_ID, user.id, dbRol) : null
  const { data, error: swrError, isLoading, mutate } = useSWR(swrKey, fetchPermisosData, SWR_OPTS)

  const allPermisos = data?.allPermisos ?? SIN_PERMISOS
  const modulosEfectivos = data?.modulosEfectivos ?? null
  const verCostosPuesto = data?.verCostosPuesto ?? null
  const verCostosMiembro = data?.verCostosMiembro ?? null
  const permisos = useMemo(() => allPermisos.find(p => p.rol === dbRol) ?? null, [allPermisos, dbRol])
  const loading = isLoading || configLoading
  const error = swrError ? errMsg(swrError, 'Error al cargar permisos') : null

  const fetchPermisos = useCallback(async () => { await mutate() }, [mutate])

  // Prioridad: admin → módulos efectivos del puesto → rol_permisos fallback.
  // La cascada vive en lib/permisos/resolver.ts, compartida con la réplica
  // server-side que usa el Coach (lib/permisos/server.ts).
  const puedeVer = useCallback((modulo: string): boolean => puedeVerModulo({
    isAdmin: dbRol === 'admin',
    modulosEfectivos,
    modulosVisibles: permisos?.modulos_visibles,
  }, modulo), [permisos, dbRol, modulosEfectivos])

  // null = sin restricción de perfil (comportamiento actual, no-regresión).
  const perfilModulos = perfilRestaurante === 'emprendimiento' ? MODULOS_EMPRENDIMIENTO : null
  const moduloEnPerfil = useCallback((modulo: string): boolean => {
    if (perfilModulos === null) return true
    if (modulo === 'home') return true
    return (perfilModulos as string[]).includes(modulo)
  }, [perfilModulos])

  // Ve plata: precios de compra, costo de receta, food cost, margen, stock
  // valorizado. Era `isAdmin` cableado en cada pantalla — ver lib/permisos/resolver.ts.
  const verCostos = useMemo(() => puedeVerCostos({
    isAdmin: dbRol === 'admin',
    overrideMiembro: verCostosMiembro,
    verCostosPuesto,
    fallbackRol: permisos?.puede_ver_costos,
  }), [dbRol, verCostosMiembro, verCostosPuesto, permisos])

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
      const supabase = createClient()
      const { error: err } = await supabase
        .from('rol_permisos')
        .update({ ...rolPermiso, updated_at: new Date().toISOString() })
        .eq('id', rolPermiso.id)
      if (err) throw err
      await mutate()
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al actualizar permisos'))
    }
  }, [mutate])

  const upsertPermisos = useCallback(async (
    rol: string,
    data: Partial<Omit<RolPermiso, 'id' | 'restaurante_id' | 'rol' | 'created_at' | 'updated_at'>>
  ) => {
    if (!RESTAURANTE_ID) return
    try {
      const supabase = createClient()
      const { error: err } = await supabase
        .from('rol_permisos')
        .upsert({
          restaurante_id: RESTAURANTE_ID,
          rol,
          ...data,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'restaurante_id,rol' })
      if (err) throw err
      await mutate()
    } catch (e: unknown) {
      throw new Error(errMsg(e, 'Error al guardar permisos'))
    }
  }, [RESTAURANTE_ID, mutate])

  return {
    permisos,
    allPermisos,
    loading,
    error,
    puedeVer,
    puedeEditar,
    puedeEliminar: dbRol === 'admin' || (permisos?.puede_eliminar ?? false),
    verCostos,
    isAdmin: dbRol === 'admin',
    perfilRestaurante,
    moduloEnPerfil,
    fetchPermisos,
    updatePermisos,
    upsertPermisos,
  }
}
