'use client'

import { useState } from 'react'
import type { BitacoraEntrada } from '@/types'
import { BITACORA_TIPO_CONFIG } from './config'
import { formatFecha } from '@/lib/utils'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'

interface Props {
  entrada: BitacoraEntrada
  active: boolean
  onClick: () => void
  onArchivar?: () => void
}

export default function EntradaListItem({ entrada, active, onClick, onArchivar }: Props) {
  const cfg = BITACORA_TIPO_CONFIG[entrada.tipo]
  const isDesktop = useIsDesktop()
  const [hover, setHover] = useState(false)
  // En mobile no hay hover — el botón queda siempre visible ahí; en desktop
  // se revela al pasar el mouse (o si la fila ya está seleccionada) para no
  // saturar la lista de iconos.
  const mostrarArchivar = !isDesktop || hover || active

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', display: 'flex', alignItems: 'stretch', width: '100%',
        borderRadius: 12, marginBottom: 2, overflow: 'hidden',
        background: active ? 'var(--accent)' : 'var(--surface)',
        borderLeft: `3px solid ${active ? '#fff' : cfg.color}`,
        boxShadow: active ? 'var(--shadow-2)' : 'var(--shadow-1)',
        transition: 'box-shadow .12s ease-out',
      }}
    >
      <button
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0, textAlign: 'left',
          padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit',
          background: 'none', border: 'none',
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
      {onArchivar && (
        <button
          onClick={e => { e.stopPropagation(); onArchivar() }}
          title={entrada.archivada ? 'Desarchivar' : 'Archivar'}
          style={{
            display: mostrarArchivar ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center',
            width: 32, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
            color: active ? 'rgba(255,255,255,.8)' : 'var(--text-3)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
            {entrada.archivada ? 'unarchive' : 'archive'}
          </span>
        </button>
      )}
    </div>
  )
}
