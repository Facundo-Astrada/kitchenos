'use client'

import { useState } from 'react'
import type { CartaItem } from '@/types'

interface ModoServicioProps {
  platos: CartaItem[]
  onSalir: () => void
}

interface PlatoState {
  id: string
  nombre: string
  pax: number | null // null = 86
}

export default function ModoServicio({ platos, onSalir }: ModoServicioProps) {
  const [estados, setEstados] = useState<PlatoState[]>(
    platos.map((p) => ({ id: p.id, nombre: p.nombre, pax: null }))
  )
  const [platoActivo, setPlatoActivo] = useState<string | null>(null)
  const [novedad, setNovedad] = useState('')

  function restarPax(cantidad: number) {
    if (!platoActivo) return
    setEstados((prev) =>
      prev.map((p) => {
        if (p.id !== platoActivo || p.pax === null) return p
        const nuevo = Math.max(0, p.pax - cantidad)
        return { ...p, pax: nuevo }
      })
    )
  }

  function marcar86() {
    if (!platoActivo) return
    setEstados((prev) =>
      prev.map((p) => (p.id === platoActivo ? { ...p, pax: null } : p))
    )
    setPlatoActivo(null)
  }

  function enviarNovedad() {
    if (!novedad.trim()) return
    // TODO: conectar a Supabase
    setNovedad('')
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Barra superior */}
      <div
        className="flex items-center justify-between flex-shrink-0 px-4 py-[10px]"
        style={{ background: '#1a1a2e' }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: '#ef4444',
              boxShadow: '0 0 0 3px rgba(239,68,68,.3)',
              animation: 'pulse 1.5s infinite',
            }}
          />
          <span
            className="text-[12px] font-bold text-white uppercase tracking-[.08em]"
          >
            Modo servicio
          </span>
        </div>
        <button
          onClick={onSalir}
          className="text-[11px] font-bold text-white cursor-pointer rounded-[8px] px-3 py-[5px] border"
          style={{
            background: 'rgba(255,255,255,.1)',
            borderColor: 'rgba(255,255,255,.2)',
          }}
        >
          Salir
        </button>
      </div>

      {/* Lista de platos */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3"
        style={{ background: '#0f172a' }}
      >
        <div
          className="text-[10px] font-bold uppercase tracking-[.1em] mb-[10px]"
          style={{ color: 'rgba(255,255,255,.4)' }}
        >
          PAX disponibles · Ahora
        </div>

        {estados.length === 0 ? (
          <div
            className="text-[13px] text-center py-8"
            style={{ color: 'rgba(255,255,255,.3)' }}
          >
            No hay platos en la carta
          </div>
        ) : (
          estados.map((p) => {
            const is86 = p.pax === null
            const isActivo = platoActivo === p.id
            const isWarn = p.pax !== null && p.pax <= 8

            return (
              <button
                key={p.id}
                onClick={() => !is86 && setPlatoActivo(isActivo ? null : p.id)}
                className="w-full flex items-center justify-between rounded-[12px] px-4 py-3 mb-2 border text-left transition-all"
                style={{
                  background: is86
                    ? 'rgba(255,255,255,.04)'
                    : isActivo
                    ? 'rgba(99,102,241,.15)'
                    : 'rgba(255,255,255,.06)',
                  borderColor: is86
                    ? 'rgba(255,255,255,.08)'
                    : isActivo
                    ? 'rgba(99,102,241,.5)'
                    : 'rgba(255,255,255,.1)',
                  opacity: is86 ? 0.5 : 1,
                  cursor: is86 ? 'default' : 'pointer',
                }}
              >
                <span
                  className="text-[14px] font-semibold"
                  style={{
                    color: is86 ? 'rgba(255,255,255,.3)' : '#fff',
                    textDecoration: is86 ? 'line-through' : 'none',
                  }}
                >
                  {p.nombre}
                </span>
                <div className="flex items-center gap-1">
                  <span
                    className="text-[22px] font-bold"
                    style={{
                      color: is86
                        ? '#6b7280'
                        : isWarn
                        ? '#f59e0b'
                        : '#4ade80',
                    }}
                  >
                    {is86 ? '86' : p.pax}
                  </span>
                  {!is86 && (
                    <span
                      className="text-[11px]"
                      style={{ color: 'rgba(255,255,255,.4)' }}
                    >
                      PAX
                    </span>
                  )}
                </div>
              </button>
            )
          })
        )}

        {/* Panel descontar PAX */}
        <div
          className="mt-3 rounded-[14px] p-3"
          style={{ background: '#1e293b' }}
        >
          <div
            className="text-[10px] font-bold uppercase tracking-[.1em] mb-2"
            style={{ color: 'rgba(255,255,255,.4)' }}
          >
            Descontar PAX
          </div>
          <div
            className="text-[13px] font-bold mb-[10px]"
            style={{
              color: platoActivo
                ? '#fff'
                : 'rgba(255,255,255,.4)',
            }}
          >
            {platoActivo
              ? `→ ${estados.find((p) => p.id === platoActivo)?.nombre}`
              : '→ Tocá un plato arriba'}
          </div>
          <div className="grid grid-cols-4 gap-[6px]">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => restarPax(n)}
                disabled={!platoActivo}
                className="rounded-[10px] py-[10px] text-[14px] font-bold text-white border transition-all active:scale-[.95]"
                style={{
                  background: platoActivo ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.05)',
                  borderColor: 'rgba(255,255,255,.15)',
                  opacity: platoActivo ? 1 : 0.4,
                }}
              >
                −{n}
              </button>
            ))}
            <button
              onClick={marcar86}
              disabled={!platoActivo}
              className="rounded-[10px] py-[10px] text-[14px] font-bold border transition-all active:scale-[.95]"
              style={{
                background: platoActivo ? '#ef4444' : 'rgba(239,68,68,.2)',
                borderColor: platoActivo ? '#ef4444' : 'rgba(239,68,68,.3)',
                color: '#fff',
                opacity: platoActivo ? 1 : 0.5,
              }}
            >
              86
            </button>
          </div>
        </div>

        {/* Novedad al pase */}
        <div
          className="mt-[10px] rounded-[14px] p-3"
          style={{ background: '#1e293b' }}
        >
          <div
            className="text-[10px] font-bold uppercase tracking-[.1em] mb-2"
            style={{ color: 'rgba(255,255,255,.4)' }}
          >
            Novedad al pase
          </div>
          <div className="flex gap-[6px]">
            <input
              value={novedad}
              onChange={(e) => setNovedad(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && enviarNovedad()}
              placeholder="Escribir novedad..."
              className="flex-1 h-[38px] rounded-[10px] px-3 text-[12px] outline-none border text-white"
              style={{
                background: 'rgba(255,255,255,.08)',
                borderColor: 'rgba(255,255,255,.15)',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={enviarNovedad}
              className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center border-none cursor-pointer"
              style={{ background: 'var(--navy)' }}
            >
              <span className="material-symbols-outlined text-[16px] text-white">send</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
