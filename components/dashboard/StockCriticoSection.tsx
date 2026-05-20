'use client'

import Link from 'next/link'
import type { Producto } from '@/types'
import { getEstadoStock } from '@/lib/utils'

interface StockCriticoSectionProps {
  productos: Producto[]
}

export default function StockCriticoSection({ productos }: StockCriticoSectionProps) {
  const criticos = productos.filter(
    (p) => getEstadoStock(p.stock_actual, p.stock_minimo, p.stock_critico) !== 'ok'
  )

  if (criticos.length === 0) return null

  return (
    <div style={{ padding: '4px 16px 6px' }}>
      <div className="flex items-center justify-between mb-2">
        <div
          className="text-[11px] font-bold uppercase tracking-[.08em]"
          style={{ color: 'var(--text-2)' }}
        >
          Stock crítico
        </div>
        <Link
          href="/stock"
          className="text-[11px] font-bold border-none bg-transparent cursor-pointer"
          style={{ color: 'var(--navy)' }}
        >
          Ver inventario →
        </Link>
      </div>

      <div
        className="flex gap-2 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'none' }}
      >
        {criticos.map((p) => {
          const estado = getEstadoStock(p.stock_actual, p.stock_minimo, p.stock_critico)
          const esCritico = estado === 'critico'

          return (
            <Link
              key={p.id}
              href="/stock"
              className="block rounded-[12px] p-[10px_14px] min-w-[110px] cursor-pointer flex-shrink-0 transition-transform active:scale-[.97]"
              style={{
                background: esCritico ? '#fef2f2' : '#fffbeb',
                border: `1px solid ${esCritico ? '#fecaca' : '#fde68a'}`,
              }}
            >
              <div
                className="text-[10px] font-bold uppercase tracking-[.06em] mb-1"
                style={{ color: esCritico ? '#991b1b' : '#92400e' }}
              >
                {esCritico ? 'Crítico' : 'Bajo'}
              </div>
              <div
                className="text-[15px] font-bold"
                style={{ color: esCritico ? '#991b1b' : '#92400e' }}
              >
                {p.nombre}
              </div>
              <div
                className="text-[11px] mt-[2px]"
                style={{ color: esCritico ? '#ef4444' : '#f59e0b' }}
              >
                {p.stock_actual} / {p.stock_minimo} {p.unidad}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
