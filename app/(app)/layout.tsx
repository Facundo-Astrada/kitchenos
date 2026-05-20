'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@/lib/auth/context'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { createClient } from '@/lib/supabase/client'
import BottomNav from '@/components/shell/BottomNav'
import MoreMenu from '@/components/shell/MoreMenu'
import RouteGuard from '@/components/shell/RouteGuard'
import KitchenCoachFAB from '@/components/coach/KitchenCoachFAB'

type StockCriticoItem = { nombre: string; cantidad: number; minimo: number }
type TareaPendienteItem = { titulo: string; prioridad: string; plaza?: string }

type TurnoPersonal = {
  id: string
  entrada: string | null
  salida: string | null
}

const ROLES_SIN_FICHAJE: string[] = ['admin', 'owner']

function formatElapsed(entrada: string): string {
  const ms = Date.now() - new Date(entrada).getTime()
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `${h}h ${m}min`
  return `${m}min`
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const { perfil, user, loading } = useAuth()
  const restauranteId = useRestauranteId()
  const pathname = usePathname()
  const [stockCritico, setStockCritico] = useState<StockCriticoItem[]>([])
  const [tareasPendientes, setTareasPendientes] = useState<TareaPendienteItem[]>([])

  // Clock-in/out state
  const [turno, setTurno] = useState<TurnoPersonal | null>(null)
  const [turnoLoading, setTurnoLoading] = useState(false)
  const [elapsed, setElapsed] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const rol = perfil?.rol ?? 'ayudante'
  const mostrarBanner = perfil !== null && !ROLES_SIN_FICHAJE.includes(perfil.rol)

  // Fetch turno del dia para el usuario logueado
  useEffect(() => {
    if (!restauranteId || loading || !user || !mostrarBanner) return
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]

    async function fetchTurno() {
      const { data } = await supabase
        .from('turnos_personal')
        .select('id, entrada, salida')
        .eq('restaurante_id', restauranteId)
        .eq('usuario_id', user!.id)
        .eq('fecha', today)
        .maybeSingle()
      setTurno(data ?? null)
    }

    fetchTurno()
  }, [restauranteId, loading, user, mostrarBanner])

  // Actualizar tiempo transcurrido cada 30s
  useEffect(() => {
    if (turno?.entrada && !turno?.salida) {
      setElapsed(formatElapsed(turno.entrada))
      intervalRef.current = setInterval(() => {
        setElapsed(formatElapsed(turno.entrada!))
      }, 30000)
    } else {
      setElapsed('')
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [turno])

  async function handleClockIn() {
    if (!restauranteId || !user || turnoLoading) return
    setTurnoLoading(true)
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('turnos_personal')
      .insert({ restaurante_id: restauranteId, usuario_id: user.id, fecha: today, entrada: now })
      .select('id, entrada, salida')
      .single()
    if (!error && data) setTurno(data)
    setTurnoLoading(false)
  }

  async function handleClockOut() {
    if (!turno || turnoLoading) return
    setTurnoLoading(true)
    const supabase = createClient()
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('turnos_personal')
      .update({ salida: now })
      .eq('id', turno.id)
      .select('id, entrada, salida')
      .single()
    if (!error && data) setTurno(data)
    setTurnoLoading(false)
  }

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

  const enTurno = turno?.entrada && !turno?.salida
  const turnoFinalizado = turno?.entrada && turno?.salida

  return (
    <div className="relative flex flex-col h-full">
      <main className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
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
      </main>

      {/* Banner Clock-In / Clock-Out — solo para staff (no admin/owner) */}
      {mostrarBanner && (
        <div style={{
          background: 'rgba(28,45,74,0.06)',
          borderTop: '1px solid var(--border)',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: enTurno ? '#059669' : 'var(--text-3)' }}>
              {enTurno ? 'schedule' : turnoFinalizado ? 'check_circle' : 'login'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>
              {enTurno
                ? `En turno · ${elapsed}`
                : turnoFinalizado
                  ? 'Turno finalizado'
                  : 'Sin turno iniciado'}
            </span>
          </div>

          {!turnoFinalizado && (
            <button
              onClick={enTurno ? handleClockOut : handleClockIn}
              disabled={turnoLoading}
              style={{
                background: enTurno ? 'rgba(239,68,68,0.1)' : '#059669',
                color: enTurno ? '#ef4444' : '#fff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: turnoLoading ? 'default' : 'pointer',
                opacity: turnoLoading ? 0.6 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {turnoLoading ? '...' : enTurno ? 'Finalizar' : 'Iniciar turno'}
            </button>
          )}
        </div>
      )}

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
  )
}
