'use client'

import Link from 'next/link'
import type { Rol } from '@/types'
import { ROL_CONFIG } from '@/lib/constants'

interface MiPlazaProps {
  rol: Rol
  completados: number
  total: number
}

const ROL_PLAZA_LABEL: Partial<Record<Rol, string>> = {
  parrilla: 'Plaza Parrilla',
  frios: 'Plaza Frío',
  calientes: 'Plaza Caliente',
  pase: 'Plaza Pase',
  pasteleria: 'Plaza Pastelería',
  panaderia: 'Plaza Panadería',
  linea: 'Plaza Línea',
  chef: 'Todas las plazas',
  admin: 'Visión general',
}

export default function MiPlaza({ rol, completados, total }: MiPlazaProps) {
  const pct = total > 0 ? Math.round((completados / total) * 100) : 0
  const plazaLabel = ROL_PLAZA_LABEL[rol] ?? 'Mi plaza'

  // Radio del círculo SVG
  const radius = 16
  const circunferencia = 2 * Math.PI * radius
  const offset = circunferencia - (pct / 100) * circunferencia

  const statusLabel =
    pct === 0
      ? 'Sin iniciar'
      : pct === 100
      ? 'Apertura completada'
      : `${completados} de ${total} checklist`

  return (
    <div style={{ padding: '4px 16px 6px' }}>
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-2">
        <div
          className="text-[11px] font-bold uppercase tracking-[.08em]"
          style={{ color: 'var(--text-2)' }}
        >
          Mi plaza
        </div>
        <Link
          href="/checklist"
          className="text-[11px] font-bold border-none bg-transparent cursor-pointer"
          style={{ color: 'var(--navy)' }}
        >
          Abrir →
        </Link>
      </div>

      {/* Card navy */}
      <Link
        href="/checklist"
        className="block rounded-[16px] p-4 cursor-pointer relative overflow-hidden transition-transform active:scale-[.98]"
        style={{ background: 'var(--navy)', boxShadow: 'var(--shadow-3)' }}
      >
        {/* Decorativo */}
        <div
          className="absolute rounded-full"
          style={{
            right: '-16px',
            top: '-16px',
            width: '80px',
            height: '80px',
            background: 'rgba(255,255,255,.05)',
          }}
        />

        <div className="flex items-center justify-between mb-3">
          <div>
            <div
              className="text-[11px] font-bold uppercase tracking-[.06em] mb-[3px]"
              style={{ color: 'rgba(255,255,255,.5)' }}
            >
              {plazaLabel}
            </div>
            <div className="text-[22px] font-bold text-white">{pct}%</div>
            <div
              className="text-[11px] mt-[2px]"
              style={{ color: 'rgba(255,255,255,.5)' }}
            >
              {statusLabel}
            </div>
          </div>

          {/* Anillo de progreso */}
          <div className="w-[52px] h-[52px] relative">
            <svg
              viewBox="0 0 36 36"
              className="w-[52px] h-[52px]"
              style={{ transform: 'rotate(-90deg)' }}
            >
              <circle
                cx="18"
                cy="18"
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,.15)"
                strokeWidth="3"
              />
              <circle
                cx="18"
                cy="18"
                r={radius}
                fill="none"
                stroke="#4ade80"
                strokeWidth="3"
                strokeDasharray={circunferencia}
                strokeDashoffset={offset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset .5s' }}
              />
            </svg>
          </div>
        </div>

        {/* Barra de progreso */}
        <div
          className="h-[3px] rounded-full overflow-hidden"
          style={{ background: 'rgba(255,255,255,.15)' }}
        >
          <div
            className="h-full rounded-full transition-[width_.4s]"
            style={{ width: `${pct}%`, background: '#4ade80' }}
          />
        </div>

        <div className="flex items-center justify-between mt-[10px]">
          <span
            className="text-[11px]"
            style={{ color: 'rgba(255,255,255,.5)' }}
          >
            Tocá para abrir el checklist
          </span>
          <span
            className="material-symbols-outlined text-[16px]"
            style={{ color: 'rgba(255,255,255,.4)' }}
          >
            chevron_right
          </span>
        </div>
      </Link>
    </div>
  )
}
