'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/context'
import { useRestauranteId } from './useRestauranteId'

/**
 * Rol operativo del usuario para el onboarding.
 * Se detecta desde equipo_miembros.puestos.nivel (FK real: auth_user_id).
 *
 * Mapeo de flujos:
 *   admin                 → 'admin'      (8 pasos — config completa)
 *   sous_chef             → 'encargado'  (4 pasos — setup operativo)
 *   cocinero | bachero    → 'cocinero'   (2 pasos — activación rápida)
 *
 * Fallback: si el usuario no tiene fila en equipo_miembros o el puesto
 * no tiene nivel, usa el rol del perfil de auth (perfil.rol === 'admin').
 */
export type FlujoOnboarding = 'admin' | 'encargado' | 'cocinero'

export interface UserRolInfo {
  /** Nivel crudo del puesto: 'admin' | 'sous_chef' | 'cocinero' | 'bachero' | '' */
  nivel: string
  /** Flujo de onboarding derivado */
  flujo: FlujoOnboarding
  esAdmin: boolean
  /** plaza_default del puesto, o plaza_asignada del miembro, o null */
  plazaDefault: string | null
  loading: boolean
}

function nivelAFlujo(nivel: string, esAdminPerfil: boolean): FlujoOnboarding {
  if (nivel === 'admin' || esAdminPerfil) return 'admin'
  if (nivel === 'sous_chef') return 'encargado'
  // 'cocinero' | 'bachero' | desconocido → activación rápida
  return 'cocinero'
}

export function useUserRol(): UserRolInfo {
  const RESTAURANTE_ID = useRestauranteId()
  const { user, perfil } = useAuth()
  const [supabase] = useState(() => createClient())

  const esAdminPerfil = perfil?.rol === 'admin'

  const [info, setInfo] = useState<UserRolInfo>({
    nivel: '',
    flujo: 'cocinero',
    esAdmin: false,
    plazaDefault: null,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false

    async function detectar() {
      // Guard: sin restaurante todavía
      if (!RESTAURANTE_ID) return

      // Sin usuario auth: caer al rol del perfil
      if (!user?.id) {
        if (!cancelled) {
          setInfo({
            nivel: esAdminPerfil ? 'admin' : '',
            flujo: nivelAFlujo('', esAdminPerfil),
            esAdmin: esAdminPerfil,
            plazaDefault: perfil?.plaza_asignada ?? null,
            loading: false,
          })
        }
        return
      }

      try {
        // FK real verificada en schema: equipo_miembros.auth_user_id
        const { data: miembro } = await supabase
          .from('equipo_miembros')
          .select('plaza_asignada, puestos(nivel, plaza_default)')
          .eq('restaurante_id', RESTAURANTE_ID)
          .eq('auth_user_id', user.id)
          .eq('activo', true)
          .maybeSingle()

        // puestos puede venir como objeto o array según el join — normalizar
        const puestoRaw = (miembro as { puestos?: unknown } | null)?.puestos
        const puesto = Array.isArray(puestoRaw)
          ? (puestoRaw[0] as { nivel?: string; plaza_default?: string | null } | undefined)
          : (puestoRaw as { nivel?: string; plaza_default?: string | null } | null | undefined)

        const nivel = puesto?.nivel ?? (esAdminPerfil ? 'admin' : '')
        const plazaDefault =
          puesto?.plaza_default ??
          (miembro as { plaza_asignada?: string | null } | null)?.plaza_asignada ??
          perfil?.plaza_asignada ??
          null

        const flujo = nivelAFlujo(nivel, esAdminPerfil)

        if (!cancelled) {
          setInfo({
            nivel,
            flujo,
            esAdmin: flujo === 'admin',
            plazaDefault,
            loading: false,
          })
        }
      } catch {
        // Falla seguro: usar el perfil de auth
        if (!cancelled) {
          setInfo({
            nivel: esAdminPerfil ? 'admin' : '',
            flujo: nivelAFlujo('', esAdminPerfil),
            esAdmin: esAdminPerfil,
            plazaDefault: perfil?.plaza_asignada ?? null,
            loading: false,
          })
        }
      }
    }

    detectar()
    return () => { cancelled = true }
  }, [RESTAURANTE_ID, user?.id, esAdminPerfil, perfil?.plaza_asignada, supabase])

  return info
}
