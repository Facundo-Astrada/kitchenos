'use client'

import { ROL_CONFIG } from '@/lib/constants'
import type { Perfil } from '@/types'

interface HeaderProps {
  perfil: Perfil
  onCoachClick?: () => void
  onNotificationsClick?: () => void
}

export default function Header({
  perfil,
  onCoachClick,
  onNotificationsClick,
}: HeaderProps) {
  const rolConfig = ROL_CONFIG[perfil.rol]

  return (
    <div
      className="flex items-center justify-between flex-shrink-0"
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '52px 16px 12px',
      }}
    >
      {/* Usuario */}
      <div className="flex items-center gap-[10px]">
        <div
          className="w-[38px] h-[38px] rounded-full flex items-center justify-center text-[13px] font-bold tracking-[.05em] flex-shrink-0 text-white"
          style={{ background: rolConfig.color }}
        >
          {perfil.initials}
        </div>
        <div>
          <p
            className="text-[14px] font-bold"
            style={{ color: 'var(--navy)' }}
          >
            {perfil.nombre}
          </p>
          <p
            className="text-[11px] font-medium"
            style={{ color: 'var(--text-2)' }}
          >
            {rolConfig.label.split('·')[0].trim()}
          </p>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex gap-2">
        {onCoachClick && (
          <button
            onClick={onCoachClick}
            className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center border-none cursor-pointer transition-transform active:scale-[.92]"
            style={{ background: 'var(--bg)', color: 'var(--navy)' }}
            title="Kitchen Coach"
          >
            <span className="material-symbols-outlined text-[20px]">smart_toy</span>
          </button>
        )}

        <button
          onClick={onNotificationsClick}
          className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center border-none cursor-pointer relative transition-transform active:scale-[.92]"
          style={{ background: 'var(--bg)', color: 'var(--navy)' }}
          title="Notificaciones"
        >
          <span className="material-symbols-outlined text-[20px]">notifications</span>
          <div
            className="absolute top-[6px] right-[6px] w-[7px] h-[7px] rounded-full"
            style={{
              background: 'var(--red)',
              border: '1.5px solid var(--surface)',
            }}
          />
        </button>
      </div>
    </div>
  )
}
