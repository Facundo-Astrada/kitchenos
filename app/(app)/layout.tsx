'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@/lib/auth/context'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { createClient } from '@/lib/supabase/client' // usado en fetchCoachContext
import BottomNav from '@/components/shell/BottomNav'
import MoreMenu from '@/components/shell/MoreMenu'
import DesktopShell from '@/components/shell/DesktopShell'
import RouteGuard from '@/components/shell/RouteGuard'
import KitchenCoachFAB from '@/components/coach/KitchenCoachFAB'
import { UiChromeProvider } from '@/lib/ui/chrome'

type StockCriticoItem = { nombre: string; cantidad: number; minimo: number }
type TareaPendienteItem = { titulo: string; prioridad: string; plaza?: string }

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const { perfil, loading } = useAuth()
  const restauranteId = useRestauranteId()
  const pathname = usePathname()
  const isDesktop = useIsDesktop()
  const [stockCritico, setStockCritico] = useState<StockCriticoItem[]>([])
  const [tareasPendientes, setTareasPendientes] = useState<TareaPendienteItem[]>([])

  const rol = perfil?.rol ?? 'ayudante'

  useEffect(() => {
    if (!restauranteId || loading) return
    const supabase = createClient()

    async function fetchCoachContext() {
      const hoy = new Date().toISOString().split('T')[0]

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

  const pageContent = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1, ease: 'easeOut' }}
        style={{ height: '100%' }}
      >
        <RouteGuard>{children}</RouteGuard>
      </motion.div>
    </AnimatePresence>
  )

  if (isDesktop) {
    return (
      <UiChromeProvider>
        <DesktopShell>{pageContent}</DesktopShell>
        <KitchenCoachFAB
          stockCritico={stockCritico}
          tareasPendientes={tareasPendientes}
        />
      </UiChromeProvider>
    )
  }

  return (
    <UiChromeProvider>
      <div className="relative flex flex-col h-full">
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
      </div>
    </UiChromeProvider>
  )
}
