'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePase } from '@/lib/hooks/usePase'
import type { PaseMensaje, PrioridadPase } from '@/types'

interface PasePreviewProps {
  puedeEscribir: boolean
}

const PRIORIDAD_CONFIG: Record<PrioridadPase, {
  bg: string; border: string; tagBg: string; text: string; label: string
}> = {
  urgente: {
    bg: '#fef2f2', border: '#fecaca', tagBg: '#ef4444', text: '#991b1b', label: 'URGENTE',
  },
  importante: {
    bg: '#fffbeb', border: '#fde68a', tagBg: '#f59e0b', text: '#92400e', label: 'IMPORTANTE',
  },
  normal: {
    bg: 'var(--surface)', border: 'var(--border)', tagBg: 'var(--navy)', text: 'var(--text)', label: 'NOVEDAD',
  },
}

export default function PasePreview({ puedeEscribir }: PasePreviewProps) {
  const { fetchRecientes, enviarMensaje } = usePase()
  const [mensajes, setMensajes] = useState<PaseMensaje[]>([])
  const [texto, setTexto] = useState('')

  useEffect(() => {
    fetchRecientes(3).then(setMensajes)
  }, [fetchRecientes])

  // Show urgent/important first, max 3
  const preview = [...mensajes]
    .sort((a, b) => {
      const p: Record<PrioridadPase, number> = { urgente: 0, importante: 1, normal: 2 }
      return (p[(a.prioridad as PrioridadPase) ?? 'normal'] ?? 2) - (p[(b.prioridad as PrioridadPase) ?? 'normal'] ?? 2)
    })
    .slice(0, 3)

  async function handleSend() {
    if (!texto.trim()) return
    await enviarMensaje({ texto: texto.trim() })
    setTexto('')
    fetchRecientes(3).then(setMensajes)
  }

  return (
    <div style={{ padding: '12px 16px 6px' }}>
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-2">
        <div
          className="text-[11px] font-bold uppercase tracking-[.08em]"
          style={{ color: 'var(--text-2)' }}
        >
          Pase de turno
        </div>
        <Link
          href="/pase"
          className="text-[11px] font-bold border-none bg-transparent cursor-pointer"
          style={{ color: 'var(--navy)' }}
        >
          Ver todo →
        </Link>
      </div>

      {/* Mensajes preview */}
      {preview.length === 0 ? (
        <div
          className="rounded-[12px] p-[10px_12px] mb-2 text-[12px] font-medium"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--text-3)',
          }}
        >
          Sin novedades del turno anterior
        </div>
      ) : (
        preview.map((msg) => {
          const config = PRIORIDAD_CONFIG[(msg.prioridad as PrioridadPase) ?? 'normal']
          return (
            <Link
              key={msg.id}
              href="/pase"
              className="flex items-start gap-2 rounded-[12px] p-[10px_12px] mb-[6px] cursor-pointer block"
              style={{ background: config.bg, border: `1px solid ${config.border}` }}
            >
              <span
                className="text-[11px] font-bold rounded-[6px] px-[7px] py-[2px] whitespace-nowrap flex-shrink-0 text-white"
                style={{ background: config.tagBg }}
              >
                {config.label}
              </span>
              <span
                className="text-[12px] font-medium line-clamp-2"
                style={{ color: config.text }}
              >
                {msg.texto}
              </span>
            </Link>
          )
        })
      )}

      {/* Quick add al pase */}
      {puedeEscribir && (
        <div
          className="flex gap-2 items-center rounded-[12px] p-[6px_10px]"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <span
            className="material-symbols-outlined text-[18px]"
            style={{ color: 'var(--text-3)' }}
          >
            edit_note
          </span>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Agregar novedad al pase..."
            className="flex-1 border-none bg-transparent text-[12px] outline-none"
            style={{ fontFamily: 'inherit', color: 'var(--text)' }}
          />
          <button
            onClick={handleSend}
            className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center border-none cursor-pointer"
            style={{ background: 'var(--navy)' }}
          >
            <span className="material-symbols-outlined text-[15px] text-white">send</span>
          </button>
        </div>
      )}
    </div>
  )
}
