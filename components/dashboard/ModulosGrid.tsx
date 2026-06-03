'use client'

import Link from 'next/link'
import { MODULOS_POR_ROL, MODULO_CONFIG, NAV_ITEMS } from '@/lib/constants'
import type { ModuloId } from '@/lib/constants'
import type { Rol } from '@/types'
import { usePermisos } from '@/lib/hooks/usePermisos'

// Todos los módulos que pueden aparecer en el grid
const GRID_MODULOS: ModuloId[] = [
  'operaciones', 'recetario', 'stock', 'pedidos', 'carta',
  'facturas', 'proveedores', 'calendario', 'reportes', 'haccp',
  'pase', 'produccion', 'turnos', 'ventas', 'merma', 'equipo', 'configuracion',
]

interface ModulosGridProps {
  rol: Rol
}

export default function ModulosGrid({ rol }: ModulosGridProps) {
  const { puedeVer, isAdmin, loading } = usePermisos()

  const fallback = new Set<string>(MODULOS_POR_ROL[rol] ?? [])

  const modulos = GRID_MODULOS.filter(m => {
    if (NAV_ITEMS.includes(m as (typeof NAV_ITEMS)[number])) return false
    if (loading) return fallback.has(m)
    if (isAdmin) return true
    return puedeVer(m)
  })

  if (modulos.length === 0) return null

  return (
    <div style={{ padding: '4px 16px 4px' }}>
      <div
        className="text-[11px] font-bold uppercase tracking-[.08em] mb-2"
        style={{ color: 'var(--text-2)' }}
      >
        Módulos
      </div>

      <div className="grid grid-cols-4 gap-2">
        {modulos.map((moduloId) => {
          const modulo = MODULO_CONFIG[moduloId as ModuloId]
          if (!modulo) return null
          return (
            <Link
              key={moduloId}
              href={modulo.href}
              className="flex flex-col items-center gap-[6px] cursor-pointer"
            >
              <div
                className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center transition-transform active:scale-[.92]"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--navy)',
                }}
              >
                <span className="material-symbols-outlined text-[24px]">
                  {modulo.icon}
                </span>
              </div>
              <span
                className="text-[9px] font-semibold text-center leading-tight tracking-[.02em]"
                style={{ color: 'var(--navy)' }}
              >
                {modulo.label.split(' ')[0]}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
