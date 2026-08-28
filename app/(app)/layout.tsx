'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { useAuth } from '@/lib/auth/context'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { createClient } from '@/lib/supabase/client' // usado en fetchCoachContext
import BottomNav from '@/components/shell/BottomNav'
import MoreMenu from '@/components/shell/MoreMenu'
import DesktopShell from '@/components/shell/DesktopShell'
import RouteGuard from '@/components/shell/RouteGuard'
import KitchenCoachFAB from '@/components/coach/KitchenCoachFAB'
import { NotificacionesBell } from '@/components/notificaciones/NotificacionesBell'
import { CoachPanelContent } from '@/components/coach/CoachPanelContent'
import DemoBanner from '@/components/shell/DemoBanner'
import BienvenidaPuesto from '@/components/onboarding/BienvenidaPuesto'
import { useOnboardingPersonal } from '@/lib/hooks/useOnboardingPersonal'
import { useTourAutomatico } from '@/lib/hooks/useTourAutomatico'
import { UiChromeProvider } from '@/lib/ui/chrome'
import { hoyOperativo } from '@/lib/ops/turnos'
import { DURATION, EASE_OUT, useReducedMotion } from '@/lib/ui/motion'

type StockCriticoItem = { nombre: string; cantidad: number; minimo: number }
type TareaPendienteItem = { titulo: string; prioridad: string; plaza?: string }

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const { perfil, loading } = useAuth()
  const restauranteId = useRestauranteId()
  const pathname = usePathname()
  const isDesktop = useIsDesktop()
  const reducedMotion = useReducedMotion()
  const [stockCritico, setStockCritico] = useState<StockCriticoItem[]>([])
  const [tareasPendientes, setTareasPendientes] = useState<TareaPendienteItem[]>([])

  // Primer ingreso (PLAN-ACCESO-Y-USO B4): la carta de bienvenida va acá y no
  // en el dashboard porque el invitado puede caer directo en cualquier ruta.
  // El tour automatico espera a que la cierre — dos overlays a la vez es ruido.
  const { bienvenidaPendiente, marcarBienvenidaVista } = useOnboardingPersonal()
  useTourAutomatico(bienvenidaPendiente)

  const rol = perfil?.rol ?? 'ayudante'

  useEffect(() => {
    if (!restauranteId || loading) return
    const supabase = createClient()

    async function fetchCoachContext() {
      const hoy = hoyOperativo()

      const [stockRes, tareasRes] = await Promise.all([
        supabase
          .from('productos')
          .select('nombre, stock_actual, stock_minimo')
          .eq('restaurante_id', restauranteId)
          .limit(50),
        supabase
          .from('tareas')
          .select('titulo, prioridad, plaza')
          .eq('restaurante_id', restauranteId)
          .neq('status', 'done')
          .or(`fecha_limite.is.null,fecha_limite.gte.${hoy}`)
          .order('prioridad', { ascending: true })
          .limit(10),
      ])

      if (stockRes.data) {
        setStockCritico(
          stockRes.data
            .filter((p: { nombre: string; stock_actual: number; stock_minimo: number }) => p.stock_actual <= p.stock_minimo)
            .slice(0, 10)
            .map((p: { nombre: string; stock_actual: number; stock_minimo: number }) => ({
              nombre: p.nombre,
              cantidad: p.stock_actual,
              minimo: p.stock_minimo,
            }))
        )
      }

      if (tareasRes.data) {
        setTareasPendientes(
          tareasRes.data.map((t: { titulo: string; prioridad: string; plaza?: string }) => ({
            titulo: t.titulo,
            prioridad: t.prioridad,
            plaza: t.plaza ?? undefined,
          }))
        )
      }
    }

    fetchCoachContext()
  }, [restauranteId, loading])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: 'var(--bg)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--text-3)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // Única transición de pantalla de la app — cubre todas las rutas (ver
  // components/PageTransition.tsx, que deliberadamente no anima de nuevo
  // encima). Entra con fade + una leve subida; sale solo con fade.
  const pageContent = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: reducedMotion ? 0 : 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reducedMotion ? 0 : DURATION.enter, ease: EASE_OUT }}
        style={{ height: '100%' }}
      >
        <RouteGuard>{children}</RouteGuard>
      </motion.div>
    </AnimatePresence>
  )

  const bienvenida = bienvenidaPendiente
    ? <BienvenidaPuesto onCerrar={marcarBienvenidaVista} />
    : null

  if (isDesktop) {
    return (
      <UiChromeProvider>
        <DesktopShell
          sidePanel={pathname !== '/coach' ? <CoachPanelContent variant="dock" /> : null}
        >
          {pageContent}
        </DesktopShell>
        {bienvenida}
      </UiChromeProvider>
    )
  }

  return (
    <UiChromeProvider>
      <div className="relative flex flex-col h-full">
        <DemoBanner />
        <NotificacionesBell variant="floating" />
        <main className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
          {pageContent}
        </main>

        <AnimatePresence>
          {moreOpen && (
            <MoreMenu
              rol={rol}
              onClose={() => setMoreOpen(false)}
            />
          )}
        </AnimatePresence>

        <BottomNav onMoreClick={() => setMoreOpen(true)} />

        <KitchenCoachFAB
          stockCritico={stockCritico}
          tareasPendientes={tareasPendientes}
        />

        {bienvenida}
      </div>
    </UiChromeProvider>
  )
}
