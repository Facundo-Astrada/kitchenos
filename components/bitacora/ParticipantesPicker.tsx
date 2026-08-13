'use client'

import { useEquipo } from '@/lib/hooks/useEquipo'
import type { BitacoraParticipante } from '@/types'

interface Props {
  participantes: BitacoraParticipante[]
  onChange: (participantes: BitacoraParticipante[]) => void
}

export default function ParticipantesPicker({ participantes, onChange }: Props) {
  const { miembros } = useEquipo()
  const activos = miembros.filter(m => m.activo)

  function toggle(id: string, nombre: string) {
    const yaEsta = participantes.some(p => p.id === id)
    onChange(
      yaEsta
        ? participantes.filter(p => p.id !== id)
        : [...participantes, { id, nombre }],
    )
  }

  if (activos.length === 0) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {activos.map(m => {
        const nombre = [m.nombre, m.apellido].filter(Boolean).join(' ').trim()
        const activo = participantes.some(p => p.id === m.id)
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => toggle(m.id, nombre)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 20,
              fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              background: activo ? 'var(--accent)' : 'var(--surface)',
              color: activo ? '#fff' : 'var(--text-2)',
              border: activo ? '1px solid var(--accent)' : '1px solid var(--border)',
              transition: 'background .12s, color .12s',
            }}
          >
            {activo && <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check</span>}
            {nombre || 'Sin nombre'}
          </button>
        )
      })}
    </div>
  )
}
