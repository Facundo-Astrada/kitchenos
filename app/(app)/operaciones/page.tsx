'use client'

import { useState } from 'react'
import ChecklistPage from '@/app/(app)/checklist/ClientView'
import TareasPage from '@/app/(app)/tareas/ClientView'
import ProduccionPage from '@/app/(app)/produccion/page'

type Tab = 'produccion' | 'mise' | 'planificacion'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'produccion',   label: 'Producción',  icon: 'task_alt' },
  { id: 'mise',         label: 'Mise',        icon: 'playlist_add_check' },
  { id: 'planificacion',label: 'Planificación',icon: 'factory' },
]

export default function OperacionesPage() {
  const [tab, setTab] = useState<Tab>('produccion')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab header */}
      <div style={{ background: 'var(--navy)', padding: '46px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6, paddingBottom: 10 }}>
          {TABS.map(t => (
            <button
              key={t.id}
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
        <ProduccionPage embedded />
      </div>
    </div>
  )
}
