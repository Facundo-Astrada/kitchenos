'use client'

// LineUpStrip — el acceso a la ficha de line-up, justo antes de abrir.
//
// Va SEPARADO de AhoraCard a propósito: esa card tiene un único CTA por diseño
// (PLAN-SUPERFICIE S1) y meterle un segundo link rompería lo que la hace
// funcionar. Esto es una tira aparte, más chica, con menos peso visual.
//
// Solo aparece en la ventana pre-servicio (apertura o control de carta) y solo
// si hay algo que decir: un line-up ofrecido en vacío se quema para siempre.
// Ver PLAN-IMPLANTACION-2026-09.md § 5.4.

import Link from 'next/link'
import { useLineUp } from '@/lib/hooks/useLineUp'
import { lineUpTieneContenido } from '@/lib/ops/lineup'
import type { MomentoDia } from '@/lib/dashboard/momento'

const MOMENTOS_PRE_SERVICIO: MomentoDia['tipo'][] = ['apertura', 'controlCarta']

export default function LineUpStrip({ momento }: { momento: MomentoDia }) {
  const { datos, loading } = useLineUp()

  if (!MOMENTOS_PRE_SERVICIO.includes(momento.tipo)) return null
  if (loading || !lineUpTieneContenido(datos)) return null

  // Lo que más pesa en el briefing, en el orden en que se lee.
  const partes: string[] = []
  if (datos.ochentaySeis.length > 0) partes.push(`${datos.ochentaySeis.length} en 86`)
  if (datos.pendientes.length > 0) partes.push(`${datos.pendientes.length} del turno anterior`)
  if (datos.eventos.length > 0) partes.push(`${datos.eventos.length} para tener en cuenta`)
  if (datos.faltantes.length > 0) partes.push(`${datos.faltantes.length} bajo mínimo`)

  return (
    <Link
      href="/lineup"
      className="block transition-transform active:scale-[.98]"
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderLeft: '3px solid #f59e0b', borderRadius: 12,
        padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 11,
        textDecoration: 'none',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#f59e0b', flexShrink: 0 }}>
        campaign
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' }}>
          Ficha de line-up lista
        </span>
        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>
          {partes.join(' · ') || 'Para leer antes de abrir'}
        </span>
      </span>
      <span className="material-symbols-outlined" style={{ fontSize: 19, color: 'var(--text-3)', flexShrink: 0 }}>
        chevron_right
      </span>
    </Link>
  )
}
