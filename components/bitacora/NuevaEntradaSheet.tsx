'use client'

import { useState } from 'react'
import { SheetChrome } from '@/lib/ui/chrome'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import type { BitacoraParticipante, BitacoraTipo } from '@/types'
import { BITACORA_TIPOS, BITACORA_TIPO_CONFIG } from './config'
import ParticipantesPicker from './ParticipantesPicker'

interface Props {
  onClose: () => void
  onCreate: (datos: { titulo: string; tipo: BitacoraTipo; fecha: string; participantes: BitacoraParticipante[] }) => void
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function NuevaEntradaSheet({ onClose, onCreate }: Props) {
  const isDesktop = useIsDesktop()
  const [tipo, setTipo] = useState<BitacoraTipo>('reunion')
  const [titulo, setTitulo] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [participantes, setParticipantes] = useState<BitacoraParticipante[]>([])

  function submit() {
    const cfg = BITACORA_TIPO_CONFIG[tipo]
    onCreate({
      titulo: titulo.trim() || `${cfg.label} ${new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}`,
      tipo, fecha, participantes,
    })
  }

  return (
    <SheetChrome>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column',
          justifyContent: isDesktop ? 'center' : 'flex-end', alignItems: 'center',
          padding: isDesktop ? 24 : 0,
        }}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.32)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={onClose} />
        <div
          style={{
            position: 'relative', background: 'var(--surface)',
            borderRadius: isDesktop ? 16 : '16px 16px 0 0',
            width: isDesktop ? 'min(440px, 92vw)' : '100%',
            boxShadow: isDesktop ? '0 20px 60px rgba(0,0,0,.35)' : '0 -8px 40px rgba(0,0,0,.3)',
            border: isDesktop ? '1px solid var(--border)' : 'none',
            padding: '20px 16px calc(env(safe-area-inset-bottom) + 20px)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {!isDesktop && <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 16px' }} />}
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 16px' }}>Nueva entrada</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {BITACORA_TIPOS.map(t => {
                const cfg = BITACORA_TIPO_CONFIG[t]
                const activo = t === tipo
                return (
                  <button
                    key={t}
                    onClick={() => setTipo(t)}
                    style={{
                      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '10px 4px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                      background: activo ? `${cfg.color}1f` : 'var(--bg)',
                      border: activo ? `1.5px solid ${cfg.color}` : '1px solid var(--border)',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: cfg.color }}>{cfg.icon}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: activo ? cfg.color : 'var(--text-2)' }}>{cfg.label}</span>
                  </button>
                )
              })}
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>Título</span>
              <input
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                placeholder={`${BITACORA_TIPO_CONFIG[tipo].label} ${new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}`}
                autoFocus
                style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-1)', background: 'var(--bg)' }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>Fecha</span>
              <input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-1)', background: 'var(--bg)' }}
              />
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>Participantes</span>
              <ParticipantesPicker participantes={participantes} onChange={setParticipantes} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button
              onClick={onClose}
              style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button
              onClick={submit}
              style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}
            >
              Crear
            </button>
          </div>
        </div>
      </div>
    </SheetChrome>
  )
}
