'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import ChecklistPage from '@/app/(app)/checklist/ClientView'
import TareasPage from '@/app/(app)/tareas/ClientView'
import { ProduccionView } from '@/app/(app)/produccion/page'
import { RutinaTurnoView } from '@/components/rutina/RutinaTurnoView'
import { useTareas } from '@/lib/hooks/useTareas'
import { useTurnosServicio } from '@/lib/hooks/useTurnosServicio'
import { hoyOperativo, proximoTurnoEnVentana } from '@/lib/ops/turnos'
import { onOpsChromeCompact } from '@/lib/ops/chromeBus'

// PLAN-4-CAPAS B7 — el CTA de Control de Carta solo vive en esta ventana
// previa a que arranque un turno ("una hora antes de abrir", elBulli 10.1).
// Un poco más ancha que la hora literal para no exigir el tap justo a tiempo.
const VENTANA_PRE_APERTURA_MIN = 120

type Tab = 'produccion' | 'mise' | 'planificacion' | 'turno'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'produccion',    label: 'Producción',   icon: 'task_alt' },
  { id: 'mise',          label: 'Mise',         icon: 'playlist_add_check' },
  { id: 'planificacion', label: 'Planificación', icon: 'factory' },
  { id: 'turno',         label: 'Turno',        icon: 'schedule' },
]

const TAB_IDS = TABS.map(t => t.id)
function esTab(v: string | null): v is Tab {
  return v != null && (TAB_IDS as string[]).includes(v)
}

// ══════════════════════════════════════════════════════════════
// OPERACIONES PAGE (tab container principal)
// ══════════════════════════════════════════════════════════════
export default function OperacionesPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('produccion')
  // useTareas es SWR (cacheado) — comparte cache con el tab Producción, costo ~0.
  const { tareas } = useTareas()
  const { turnosActivos } = useTurnosServicio()

  // Reloj propio para el CTA de Control de Carta — sin esto la ventana previa
  // a la apertura solo se evaluaría una vez, al montar OPS, y nunca aparecería
  // ni desaparecería sola durante una sesión larga.
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  const turnoProximo = useMemo(
    () => proximoTurnoEnVentana(ahora, turnosActivos, VENTANA_PRE_APERTURA_MIN),
    [ahora, turnosActivos],
  )
  // Tareas de hoy sin completar → badge en el tab Producción (ver el efecto sin cambiar de tab)
  const pendientesProduccion = useMemo(() => {
    const hoy = hoyOperativo()
    return tareas.filter(t => t.turno_fecha === hoy && !t.parent_id && t.estado !== 'listo').length
  }, [tareas])
  // Lazy-mount: cada tab se monta recién en su primera visita y de ahí en más
  // se mantiene (display:none preserva el estado). Evita disparar los ~10 hooks
  // de los 3 sub-módulos en paralelo al entrar a OPS.
  const [mounted, setMounted] = useState<Set<Tab>>(() => new Set<Tab>(['produccion']))

  // Tab inicial desde la URL (?tab=) — permite deep-link y redirects desde las rutas viejas
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (esTab(t)) setTab(t)
  }, [])

  // Marcar el tab activo como montado (se queda montado para preservar estado)
  useEffect(() => {
    setMounted(prev => prev.has(tab) ? prev : new Set(prev).add(tab))
  }, [tab])

  // Write screen context for KitchenCoach — OPS es el dueño del contexto
  // (los hijos embebidos no escriben). Insights de producción para que el
  // Coach responda "¿qué me conviene producir hoy?" con datos reales.
  useEffect(() => {
    try {
      const hoy = hoyOperativo()
      const delDia = tareas.filter(t => t.turno_fecha === hoy && !t.parent_id)
      const total = delDia.length
      const listos = delDia.filter(t => t.estado === 'listo').length
      const topCriticas = tareas
        .filter(t => t.prioridad === 'critica' && t.estado !== 'listo')
        .map(t => t.titulo).slice(0, 5)
      localStorage.setItem('kc_screen_context', JSON.stringify({
        screen: 'operaciones',
        tab,
        produccionTotal: total,
        produccionListos: listos,
        produccionPendientes: total - listos,
        avance: total > 0 ? Math.round((listos / total) * 100) : 0,
        topCriticas,
      }))
    } catch { /* ignore */ }
    return () => localStorage.removeItem('kc_screen_context')
  }, [tab, tareas])

  // El mise avisa cuándo plegar. Solo él lo emite, y al desmontarse o cambiar
  // de plaza/fase manda `false`, así que los otros paneles nunca se quedan sin
  // su navegación. El cambio de tab lo restaura por las dudas.
  const [chromeCompacto, setChromeCompacto] = useState(false)
  useEffect(() => onOpsChromeCompact(setChromeCompacto), [])
  useEffect(() => { setChromeCompacto(false) }, [tab])

  // Listen for kc-set-tab event from the coach tour (y desde Planificación → Producción)
  useEffect(() => {
    function handleSetTab(e: Event) {
      const { tab: newTab } = (e as CustomEvent<{ tab: Tab }>).detail
      if (esTab(newTab)) setTab(newTab)
    }
    window.addEventListener('kc-set-tab', handleSetTab)
    return () => window.removeEventListener('kc-set-tab', handleSetTab)
  }, [])

  // Dispatch welcome event on first OPS visit
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem('kc_ops_welcomed')) return
    localStorage.setItem('kc_ops_welcomed', '1')
    setTimeout(() => window.dispatchEvent(new CustomEvent('kc-welcome-ops')), 900)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab header — se pliega mientras se recorre la lista del mise (ver
          lib/ops/chromeBus): en una tablet estas franjas fijas se comían un
          tercio de la pantalla, que son ocho ítems que no se ven. Vuelve entero
          al primer scroll hacia arriba. */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 0', flexShrink: 0 }}>
        <div style={{
          display: 'flex', gap: 6,
          maxHeight: chromeCompacto ? 0 : 44, paddingBottom: chromeCompacto ? 0 : 10,
          opacity: chromeCompacto ? 0 : 1, overflow: 'hidden',
          transition: 'max-height .18s ease, opacity .14s ease, padding .18s ease',
        }}>
          {TABS.map(t => (
            <button
              key={t.id}
              data-coach-target={`ops-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                padding: '8px 4px', borderRadius: 99, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                background: tab === t.id ? '#fff' : 'rgba(255,255,255,.12)',
                color: tab === t.id ? 'var(--navy)' : 'rgba(255,255,255,.65)',
                transition: 'all .15s',
                WebkitTapHighlightColor: 'transparent',
                position: 'relative',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{t.icon}</span>
              {t.label}
              {t.id === 'produccion' && pendientesProduccion > 0 && (
                <span style={{
                  minWidth: 16, height: 16, padding: '0 4px', borderRadius: 99,
                  background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 800,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {pendientesProduccion}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* CTA Control de Carta (PLAN-4-CAPAS B7) — solo en la ventana previa a
          la apertura de un turno, no todo el día (ver proximoTurnoEnVentana). */}
      {turnoProximo && (
        <button
          onClick={() => router.push(`/control-carta?turno=${turnoProximo.id}`)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            padding: '10px 16px', border: 'none', borderBottom: '1px solid var(--border)',
            background: 'rgba(245,158,11,.12)', cursor: 'pointer', fontFamily: 'inherit',
            textAlign: 'left', flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#f59e0b' }}>fact_check</span>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
            Control de carta antes de {turnoProximo.nombre.toLowerCase()}
          </span>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>chevron_right</span>
        </button>
      )}

      {/* Tab panels — cada uno se monta en su primera visita y se conserva */}
      {mounted.has('produccion') && (
        <div style={{ flex: 1, overflow: 'hidden', display: tab === 'produccion' ? 'flex' : 'none', flexDirection: 'column' }}>
          <TareasPage embedded />
        </div>
      )}
      {mounted.has('mise') && (
        <div style={{ flex: 1, overflow: 'hidden', display: tab === 'mise' ? 'flex' : 'none', flexDirection: 'column' }}>
          <ChecklistPage embedded />
        </div>
      )}
      {mounted.has('planificacion') && (
        <div style={{ flex: 1, overflow: tab === 'planificacion' ? 'auto' : 'hidden', display: tab === 'planificacion' ? 'block' : 'none' }}>
          <ProduccionView embedded />
        </div>
      )}
      {mounted.has('turno') && (
        <div style={{ flex: 1, overflow: 'hidden', display: tab === 'turno' ? 'flex' : 'none', flexDirection: 'column' }}>
          <RutinaTurnoView embedded />
        </div>
      )}
    </div>
  )
}
