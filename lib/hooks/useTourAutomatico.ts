'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { TOURS } from '@/lib/coach/tours'
import { RUTA_A_MODULO, RUTA_A_TOUR } from '@/lib/constants'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { useOnboardingPersonal } from '@/lib/hooks/useOnboardingPersonal'

/**
 * Arranca solo el recorrido de una pantalla la primera vez que la persona
 * entra (PLAN-ACCESO-Y-USO B4.2).
 *
 * Los ~20 recorridos de `lib/coach/tours.ts` ya existían pero solo se
 * disparaban desde un chip del Coach, así que en la práctica casi nadie los
 * veía. Lo único automático eran dos disparadores hardcodeados en localStorage
 * (`kc_app_welcomed`, `kc_ops_welcomed`) que cubrían dashboard y OPS.
 *
 * Tres reglas:
 *  - Se dispara UNA vez por pantalla y por persona, persistido en DB.
 *  - Nunca en una pantalla que la persona no puede ver. Enseñar algo que no
 *    puede tocar solo genera un pedido de permisos.
 *  - Nunca encima de la carta de bienvenida: esperar a que la cierre.
 */

// El overlay del tour necesita que la pantalla haya montado sus data-coach-target.
const DELAY_MS = 900

export function useTourAutomatico(bienvenidaAbierta: boolean) {
  const pathname = usePathname()
  const { puedeVer, isAdmin, moduloEnPerfil, loading: permisosLoading } = usePermisos()
  const { tourVisto, marcarTourVisto, loading: onboardingLoading } = useOnboardingPersonal()

  // Evita re-disparar en el mismo montaje si algo cambia de identidad mientras
  // el timer corre (el marcado en DB es optimista pero no instantáneo).
  const disparadosRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (bienvenidaAbierta || permisosLoading || onboardingLoading) return

    const basePath = '/' + (pathname.split('/')[1] ?? '')
    const tour = RUTA_A_TOUR[basePath]
    if (!tour || !TOURS[tour]) return
    if (tourVisto(tour) || disparadosRef.current.has(tour)) return

    const modulo = RUTA_A_MODULO[basePath]
    if (modulo && !moduloEnPerfil(modulo)) return
    if (modulo && modulo !== 'home' && !isAdmin && !puedeVer(modulo)) return

    disparadosRef.current.add(tour)
    const t = setTimeout(() => {
      // `kc-welcome-app` es el evento que KitchenCoachFAB ya escucha para lanzar
      // el overlay del recorrido; el tour concreto lo resuelve el FAB leyendo
      // `kc_screen_context`, que cada pantalla escribe al montar.
      window.dispatchEvent(new CustomEvent('kc-welcome-app'))
      void marcarTourVisto(tour)
    }, DELAY_MS)
    return () => clearTimeout(t)
  }, [
    pathname, bienvenidaAbierta, permisosLoading, onboardingLoading,
    tourVisto, marcarTourVisto, puedeVer, isAdmin, moduloEnPerfil,
  ])
}
