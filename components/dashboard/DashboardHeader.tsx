'use client'

import Link from 'next/link'
import { useTheme } from '@/components/providers/ThemeProvider'
import { ROL_CONFIG } from '@/lib/constants'
import type { Perfil } from '@/types'

interface DashboardHeaderProps {
  perfil: Perfil
  onOpenNotifications?: () => void
  notifCount?: number
  miseCompletados?: number
  miseTotal?: number
  tareasCompletadas?: number
  tareasTotal?: number
  en86?: number | null
  desktop?: boolean
}

export default function DashboardHeader({
  perfil,
  onOpenNotifications,
  notifCount = 0,
  miseCompletados = 0,
  miseTotal = 0,
  tareasCompletadas = 0,
  tareasTotal = 0,
  en86 = null,
  desktop = false,
}: DashboardHeaderProps) {
  const { theme, toggle: toggleTheme } = useTheme()
  const rolConfig = ROL_CONFIG[perfil.rol]
  const isAyudante = perfil.rol === 'ayudante'

  return (
    <div
      className="flex-shrink-0"
      style={{ background: 'var(--navy)', padding: desktop ? '14px 24px' : '48px 16px 14px' }}
    >
      {/* Fila superior: usuario + botones */}
      <div className="flex items-center justify-between mb-3">
        {/* Usuario — tocable → /perfil */}
        <Link href="/perfil" className="flex items-center gap-[10px] transition-opacity active:opacity-70">
          <div
            className="w-[38px] h-[38px] rounded-full flex items-center justify-center text-[13px] font-bold tracking-[.05em] flex-shrink-0 text-white"
            style={{ background: 'rgba(255,255,255,.15)', border: '1.5px solid rgba(255,255,255,.3)' }}
          >
            {perfil.initials}
          </div>
          <div>
            <div className="text-[15px] font-bold text-white">{perfil.nombre}</div>
            <div
              className="text-[10px] font-semibold uppercase tracking-[.06em]"
              style={{ color: 'rgba(255,255,255,.6)' }}
            >
              {rolConfig.label.split('·')[1]?.trim() ?? rolConfig.label}
            </div>
          </div>

          {/* Badge solo lectura */}
          {isAyudante && (
            <div
              className="flex items-center gap-1 ml-1 rounded-full px-2 py-[2px]"
              style={{
                background: 'rgba(245,158,11,.2)',
                border: '1px solid rgba(245,158,11,.4)',
              }}
            >
              <span className="material-symbols-outlined text-[12px]" style={{ color: '#fcd34d' }}>
                visibility
              </span>
              <span
                className="text-[9px] font-bold uppercase tracking-[.06em]"
                style={{ color: '#fcd34d' }}
              >
                Solo lectura
              </span>
            </div>
          )}
        </Link>

        {/* Botones de acción */}
        <div className="flex gap-[6px]">
          {/* Dark mode */}
          <button
            onClick={toggleTheme}
            className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center border cursor-pointer transition-transform active:scale-[.92]"
            style={{
              background: 'rgba(255,255,255,.12)',
              borderColor: 'rgba(255,255,255,.2)',
              color: '#fff',
            }}
            title="Modo oscuro"
          >
            <span className="material-symbols-outlined text-[20px]">
              {theme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
          </button>

          {/* Notificaciones */}
          <button
            onClick={onOpenNotifications}
            className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center border cursor-pointer relative transition-transform active:scale-[.92]"
            style={{
              background: 'rgba(255,255,255,.12)',
              borderColor: 'rgba(255,255,255,.2)',
              color: '#fff',
            }}
          >
            <span className="material-symbols-outlined text-[20px]">notifications</span>
            {notifCount > 0 && (
              <div
                className="absolute top-[6px] right-[6px] w-[7px] h-[7px] rounded-full"
                style={{ background: '#ef4444', border: '1.5px solid var(--navy)' }}
              />
            )}
          </button>
        </div>
      </div>

      {/* Barra de estado del día */}
      <StatusBar
        miseCompletados={miseCompletados}
        miseTotal={miseTotal}
        tareasCompletadas={tareasCompletadas}
        tareasTotal={tareasTotal}
        en86={en86}
      />
    </div>
  )
}

function StatusBar({
  miseCompletados,
  miseTotal,
  tareasCompletadas,
  tareasTotal,
  en86,
}: {
  miseCompletados: number
  miseTotal: number
  tareasCompletadas: number
  tareasTotal: number
  en86: number | null
}) {
  const misePct = miseTotal > 0 ? Math.round((miseCompletados / miseTotal) * 100) : 0
  const tareasPct = tareasTotal > 0 ? Math.round((tareasCompletadas / tareasTotal) * 100) : 0

  return (
    <div className="grid grid-cols-3 gap-2">
      <StatusCard
        label="Checklist"
        href="/checklist"
        value={`${miseCompletados}/${miseTotal}`}
        barWidth={misePct}
        barColor="#10b981"
      />
      <StatusCard
        label="Tareas hoy"
        href="/tareas"
        value={`${tareasCompletadas}/${tareasTotal}`}
        barWidth={tareasPct}
        barColor="#f59e0b"
      />
      <EightySixCard en86={en86} />
    </div>
  )
}

function StatusCard({
  label,
  href,
  value,
  barWidth,
  barColor,
}: {
  label: string
  href: string
  value: string
  barWidth: number
  barColor: string
}) {
  return (
    <a
      href={href}
      className="block rounded-[12px] p-[10px_12px] cursor-pointer transition-transform active:scale-[.97]"
      style={{
        background: 'rgba(255,255,255,.1)',
        border: '1px solid rgba(255,255,255,.15)',
      }}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-[.06em] mb-1"
        style={{ color: 'rgba(255,255,255,.6)' }}
      >
        {label}
      </div>
      <div className="text-[20px] font-bold text-white">{value}</div>
      <div
        className="h-[3px] rounded-full mt-[6px] overflow-hidden"
        style={{ background: 'rgba(255,255,255,.15)' }}
      >
        <div
          className="h-full rounded-full transition-[width_.4s]"
          style={{ width: `${barWidth}%`, background: barColor }}
        />
      </div>
    </a>
  )
}

function EightySixCard({ en86 }: { en86: number | null }) {
  const cargando = en86 === null
  const hay86 = !cargando && en86 > 0
  return (
    <a
      href="/carta"
      className="block rounded-[12px] p-[10px_12px] cursor-pointer transition-transform active:scale-[.97]"
      style={{
        background: 'rgba(255,255,255,.1)',
        border: '1px solid rgba(255,255,255,.15)',
      }}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-[.06em] mb-1"
        style={{ color: 'rgba(255,255,255,.6)' }}
      >
        86 activos
      </div>
      <div className="text-[20px] font-bold" style={{ color: hay86 ? '#ef4444' : 'rgba(255,255,255,.85)' }}>
        {cargando ? '—' : en86}
      </div>
      <div className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,.5)' }}>
        {cargando ? 'Cargando…' : hay86 ? `${en86 === 1 ? 'plato sin' : 'platos sin'} vender` : 'Sin 86s activos'}
      </div>
    </a>
  )
}
