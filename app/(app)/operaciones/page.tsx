'use client'

import { useState, useEffect, useMemo } from 'react'
import ChecklistPage from '@/app/(app)/checklist/ClientView'
import TareasPage from '@/app/(app)/tareas/ClientView'
import { ProduccionView } from '@/app/(app)/produccion/page'
import { useTareas } from '@/lib/hooks/useTareas'

type Tab = 'produccion' | 'mise' | 'planificacion'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'produccion',    label: 'Producción',   icon: 'task_alt' },
  { id: 'mise',          label: 'Mise',         icon: 'playlist_add_check' },
  { id: 'planificacion', label: 'Planificación', icon: 'factory' },
]

// ══════════════════════════════════════════════════════════════
// OPERACIONES PAGE (tab container principal)
// ══════════════════════════════════════════════════════════════
export default function OperacionesPage() {
  const [tab, setTab] = useState<Tab>('produccion')
  // useTareas es SWR (cacheado) — comparte cache con el tab Producción, costo ~0.
  const { tareas } = useTareas()
  // Tareas de hoy sin completar → badge en el tab Producción (ver el efecto sin cambiar de tab)
  const pendientesProduccion = useMemo(() => {
    const hoy = new Date().toISOString().split('T')[0]
    return tareas.filter(t => t.turno_fecha === hoy && !t.parent_id && t.estado !== 'listo').length
  }, [tareas])
  // Lazy-mount: cada tab se monta recién en su primera visita y de ahí en más
  // se mantiene (display:none preserva el estado). Evita disparar los ~10 hooks
  // de los 3 sub-módulos en paralelo al entrar a OPS.
  const [mounted, setMounted] = useState<Set<Tab>>(() => new Set<Tab>(['produccion']))

  // Tab inicial desde la URL (?tab=) — permite deep-link y redirects desde las rutas viejas
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'produccion' || t === 'mise' || t === 'planificacion') setTab(t)
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
      const hoy = new Date().toISOString().split('T')[0]
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

  // Listen for kc-set-tab event from the coach tour (y desde Planificación → Producción)
  useEffect(() => {
    function handleSetTab(e: Event) {
      const { tab: newTab } = (e as CustomEvent<{ tab: Tab }>).detail
      if (newTab === 'produccion' || newTab === 'mise' || newTab === 'planificacion') setTab(newTab)
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
      {/* Tab header */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6, paddingBottom: 10 }}>
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
    </div>
  )
}
