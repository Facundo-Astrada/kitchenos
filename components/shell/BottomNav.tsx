'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_ITEMS, MODULO_CONFIG } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { usePermisos } from '@/lib/hooks/usePermisos'

interface BottomNavProps {
  onMoreClick: () => void
}

export default function BottomNav({ onMoreClick }: BottomNavProps) {
  const pathname = usePathname()
  const { puedeVer, isAdmin, moduloEnPerfil } = usePermisos()

  const visibleItems = NAV_ITEMS.filter(id =>
    (id === 'home' || isAdmin || puedeVer(id)) && moduloEnPerfil(id)
  )

  return (
    <nav
      className="flex-shrink-0 flex z-[100]"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        margin: '0 10px 10px',
        paddingBottom: 'max(env(safe-area-inset-bottom), 6px)',
        paddingTop: '8px',
        boxShadow: '0 -4px 20px rgba(0,0,0,.08)',
      }}
    >
      {visibleItems.map((moduloId) => {
        const modulo = MODULO_CONFIG[moduloId]
        const isActive =
          moduloId === 'home'
            ? pathname === '/'
            : pathname.startsWith(modulo.href)

        return (
          <Link
            key={moduloId}
            href={modulo.href}
            className={cn(
              'flex-1 flex flex-col items-center gap-[2px] cursor-pointer px-0 py-1 border-none bg-transparent relative transition-colors duration-200',
              isActive
                ? 'text-[var(--navy)]'
                : 'text-[var(--text-3)]'
            )}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {isActive && (
              <span
                className="absolute top-[-8px] left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-b-full"
                style={{
                  background: 'var(--navy)',
                  animation: 'navDot .25s ease',
                }}
              />
            )}
            <span className="material-symbols-outlined text-[22px]">
              {modulo.icon}
            </span>
            <p className="text-[9px] font-semibold uppercase tracking-[.04em]">
              {modulo.label.split(' ')[0]}
            </p>
          </Link>
        )
      })}

      {/* Botón "Más" */}
      <button
        onClick={onMoreClick}
        className="flex-1 flex flex-col items-center gap-[2px] cursor-pointer px-0 py-1 border-none bg-transparent text-[var(--text-3)]"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <span className="material-symbols-outlined text-[22px]">grid_view</span>
        <p className="text-[9px] font-semibold uppercase tracking-[.04em]">Más</p>
      </button>
    </nav>
  )
}
