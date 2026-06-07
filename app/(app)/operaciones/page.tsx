'use client'

import { useState, useEffect } from 'react'
import ChecklistPage from '@/app/(app)/checklist/ClientView'
import TareasPage from '@/app/(app)/tareas/ClientView'
import { ProduccionView } from '@/app/(app)/produccion/page'

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

  // Tab inicial desde la URL (?tab=) — permite deep-link y redirects desde las rutas viejas
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'produccion' || t === 'mise' || t === 'planificacion') setTab(t)
  }, [])

  // Write screen context for KitchenCoach on tab change
  useEffect(() => {
    try {
      localStorage.setItem('kc_screen_context', JSON.stringify({ screen: 'operaciones', tab }))
    } catch { /* ignore */ }
  }, [tab])

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
      <div style={{ background: 'var(--navy)', padding: '46px 16px 0', flexShrink: 0 }}>
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
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab panels */}
      <div style={{ flex: 1, overflow: 'hidden', display: tab === 'produccion' ? 'flex' : 'none', flexDirection: 'column' }}>
        <TareasPage embedded />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: tab === 'mise' ? 'flex' : 'none', flexDirection: 'column' }}>
        <ChecklistPage embedded />
      </div>
      <div style={{ flex: 1, overflow: tab === 'planificacion' ? 'auto' : 'hidden', display: tab === 'planificacion' ? 'block' : 'none' }}>
        <ProduccionView embedded />
      </div>
    </div>
  )
}
