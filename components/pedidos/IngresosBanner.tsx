'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { usePedidos } from '@/lib/hooks/usePedidos'
import type { Pedido } from '@/types'

const hoyISO = () => new Date().toISOString().slice(0, 10)

// Resuelve la ventana de entrega de un pedido (con fallback a la fecha única previa)
function ventana(p: Pedido): { desde: string | null; hasta: string | null } {
  const desde = p.entrega_desde ?? p.fecha_entrega_esperada ?? null
  const hasta = p.entrega_hasta ?? p.fecha_entrega_esperada ?? desde
  return { desde, hasta }
}

function fmtDia(d: string | null): string {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

interface Props {
  /** En la propia pantalla de pedidos no navegamos, solo mostramos. */
  embedded?: boolean
  /** Avisa cuántos pedidos entran en el banner — para un resumen plegado externo (ver Dashboard). */
  onCount?: (n: number) => void
}

/**
 * Banner de "ingresos esperados": muestra los pedidos enviados cuya ventana de
 * entrega cae hoy (o ya está atrasada) y siguen sin recibirse.
 * Se usa en Inicio y en Pedidos.
 */
export default function IngresosBanner({ embedded = false, onCount }: Props) {
  const router = useRouter()
  const { pedidos } = usePedidos()

  const { hoy, atrasados } = useMemo(() => {
    const today = hoyISO()
    const pendientes = pedidos.filter(p => p.status === 'enviado' || p.status === 'parcial')
    const hoy: Pedido[] = []
    const atrasados: Pedido[] = []
    for (const p of pendientes) {
      const { desde, hasta } = ventana(p)
      if (!desde && !hasta) continue
      if (hasta && hasta < today) atrasados.push(p)
      else if ((desde ?? hasta)! <= today && (hasta ?? desde)! >= today) hoy.push(p)
    }
    return { hoy, atrasados }
  }, [pedidos])

  useEffect(() => { onCount?.(hoy.length + atrasados.length) }, [hoy.length, atrasados.length, onCount])

  if (hoy.length === 0 && atrasados.length === 0) return null

  const total = hoy.length + atrasados.length
  const montoEstimado = [...hoy, ...atrasados].reduce((s, p) => s + (p.total_estimado ?? 0), 0)

  return (
    <div
      onClick={() => { if (!embedded) router.push('/pedidos') }}
      style={{
        margin: embedded ? '0 0 12px' : '12px 16px 0',
        padding: '12px 14px',
        background: atrasados.length > 0 ? 'rgba(239,68,68,.08)' : 'rgba(29,78,216,.08)',
        border: `1px solid ${atrasados.length > 0 ? 'rgba(239,68,68,.3)' : 'rgba(29,78,216,.3)'}`,
        borderRadius: 12,
        cursor: embedded ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: 26, color: atrasados.length > 0 ? '#ef4444' : '#1d4ed8', flexShrink: 0 }}
      >
        {atrasados.length > 0 ? 'local_shipping' : 'inventory'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' }}>
          {hoy.length > 0 && `Hoy llegan ${hoy.length} pedido${hoy.length !== 1 ? 's' : ''}`}
          {hoy.length > 0 && atrasados.length > 0 && ' · '}
          {atrasados.length > 0 && (
            <span style={{ color: '#ef4444' }}>{atrasados.length} atrasado{atrasados.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {[...hoy, ...atrasados].slice(0, 3).map(p => {
            const { desde, hasta } = ventana(p)
            const rango = desde && hasta && desde !== hasta ? `${fmtDia(desde)}–${fmtDia(hasta)}` : fmtDia(desde ?? hasta)
            return `${p.proveedor_nombre} (${rango})`
          }).join(' · ')}
          {total > 3 && ` +${total - 3}`}
        </div>
      </div>
      {montoEstimado > 0 && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', fontFamily: "'DM Mono', monospace" }}>
            ${montoEstimado.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>a ingresar</div>
        </div>
      )}
      {!embedded && (
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)', flexShrink: 0 }}>chevron_right</span>
      )}
    </div>
  )
}
