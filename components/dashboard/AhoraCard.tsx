'use client'

// AhoraCard — el bloque "en qué momento del día estás", con un único CTA.
// PLAN-SUPERFICIE S1: antes la primera pantalla del día abría con 3 KPIs y
// dos banners rojos antes de decir qué hacer. Esto va arriba de todo eso.
// Momento calculado en lib/dashboard/momento.ts — acá solo se traduce a texto/ícono.

import Link from 'next/link'
import type { MomentoDia } from '@/lib/dashboard/momento'

const CFG: Record<MomentoDia['tipo'], { icon: string }> = {
  apertura: { icon: 'playlist_add_check' },
  controlCarta: { icon: 'fact_check' },
  servicio: { icon: 'restaurant' },
  fueraDeTurno: { icon: 'nights_stay' },
}

export default function AhoraCard({ momento }: { momento: MomentoDia }) {
  const icon = CFG[momento.tipo].icon

  let titulo: string
  let subtitulo: string
  let href: string | null
  let ctaLabel: string | null
  let pct: number | null = null

  switch (momento.tipo) {
    case 'apertura': {
      const { completados, total } = momento
      titulo = completados === 0 ? 'Abrí tu plaza' : `Mise ${completados}/${total} — seguí`
      subtitulo = completados === 0 ? 'Arrancá el mise en place' : 'Falta terminar la apertura'
      href = momento.href
      ctaLabel = 'Ir al mise'
      pct = total > 0 ? Math.round((completados / total) * 100) : 0
      break
    }
    case 'controlCarta':
      titulo = 'Control de carta'
      subtitulo = `Antes de ${momento.turnoNombre.toLowerCase()} — probá partida por partida`
      href = momento.href
      ctaLabel = 'Empezar'
      break
    case 'servicio':
      titulo = `${momento.turnoNombre} en curso`
      subtitulo = momento.label
      href = momento.href
      ctaLabel = momento.label
      break
    case 'fueraDeTurno':
      titulo = 'Sin turno activo'
      subtitulo = 'Volvé cuando arranque el próximo servicio'
      href = null
      ctaLabel = null
      break
  }

  const content = (
    <div
      className="rounded-[16px] p-4 relative overflow-hidden"
      style={{ background: 'var(--navy)' }}
    >
      <div
        className="absolute rounded-full"
        style={{ right: -16, top: -16, width: 80, height: 80, background: 'rgba(255,255,255,.05)' }}
      />
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,.12)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#fff' }}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-white leading-tight">{titulo}</div>
          <div className="text-[12px] mt-[2px]" style={{ color: 'rgba(255,255,255,.6)' }}>{subtitulo}</div>
        </div>
        {href && (
          <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 20, color: 'rgba(255,255,255,.4)' }}>
            chevron_right
          </span>
        )}
      </div>

      {pct !== null && (
        <div className="h-[4px] rounded-full overflow-hidden mt-3" style={{ background: 'rgba(255,255,255,.15)' }}>
          <div
            className="h-full rounded-full transition-[width_.4s]"
            style={{ width: `${pct}%`, background: '#f59e0b' }}
          />
        </div>
      )}
    </div>
  )

  if (!href) return content
  return (
    <Link href={href} className="block transition-transform active:scale-[.98]">
      {content}
    </Link>
  )
}
