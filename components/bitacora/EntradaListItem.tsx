'use client'

import type { BitacoraEntrada } from '@/types'
import { BITACORA_TIPO_CONFIG } from './config'
import { formatFecha } from '@/lib/utils'

interface Props {
  entrada: BitacoraEntrada
  active: boolean
  onClick: () => void
}

export default function EntradaListItem({ entrada, active, onClick }: Props) {
  const cfg = BITACORA_TIPO_CONFIG[entrada.tipo]

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left',
        padding: '10px 12px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
        background: active ? 'var(--accent)' : 'transparent',
        border: 'none', marginBottom: 2,
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: 17, marginTop: 1, flexShrink: 0, color: active ? '#fff' : cfg.color }}
      >
        {cfg.icon}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 13, fontWeight: 700,
          color: active ? '#fff' : 'var(--text-1)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {entrada.fijada && (
            <span className="material-symbols-outlined" style={{ fontSize: 12, color: active ? '#fff' : '#f59e0b' }}>push_pin</span>
          )}
          {entrada.titulo}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 2,
          fontSize: 11, color: active ? 'rgba(255,255,255,.75)' : 'var(--text-3)',
        }}>
          <span>{formatFecha(entrada.fecha)}</span>
          {entrada.participantes.length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>group</span>
              {entrada.participantes.length}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
