'use client'

import { useState } from 'react'
import ChecklistPage from '@/app/(app)/checklist/ClientView'
import TareasPage from '@/app/(app)/tareas/ClientView'
import ProduccionPage from '@/app/(app)/produccion/page'
import IngenieriaMenuView from '@/app/(app)/ingenieria-menu/ClientView'

type Tab = 'mise' | 'tareas' | 'planificacion' | 'ingenieria'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'tareas',       label: 'Tareas',      icon: 'task_alt' },
  { id: 'mise',         label: 'Checklist',   icon: 'playlist_add_check' },
  { id: 'planificacion',label: 'Planificación',icon: 'factory' },
  { id: 'ingenieria',   label: 'Ingeniería',  icon: 'engineering' },
]

export default function OperacionesPage() {
  const [tab, setTab] = useState<Tab>('tareas')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Unified tab header */}
      <div style={{ background: 'var(--navy)', padding: '46px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 5, paddingBottom: 10, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                padding: '7px 12px', borderRadius: 99, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                background: tab === t.id ? '#fff' : 'rgba(255,255,255,.12)',
                color: tab === t.id ? 'var(--navy)' : 'rgba(255,255,255,.65)',
                transition: 'all .15s',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab panels */}
      <div style={{ flex: 1, overflow: 'hidden', display: tab === 'mise' ? 'flex' : 'none', flexDirection: 'column' }}>
        <ChecklistPage embedded />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: tab === 'tareas' ? 'flex' : 'none', flexDirection: 'column' }}>
        <TareasPage embedded />
      </div>
      <div style={{ flex: 1, overflow: tab === 'planificacion' ? 'auto' : 'hidden', display: tab === 'planificacion' ? 'block' : 'none' }}>
        <ProduccionPage embedded />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: tab === 'ingenieria' ? 'flex' : 'none', flexDirection: 'column' }}>
        <IngenieriaMenuView embedded />
      </div>
    </div>
  )
}
