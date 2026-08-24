'use client'

// FlipCard — mecánica compartida de la "carta de jugador" (PLAN-SUPERFICIE
// S3). Extraído de components/organigrama/MiembroCard.tsx, que fue la
// primera carta y quedó como referencia de estilo (gradiente, badge, stats).
// Este componente solo resuelve el flip 3D — el contenido de frente/dorso lo
// arma cada caller, porque una carta de plaza y una de plato muestran datos
// de forma completamente distinta; forzarlas al mismo layout sería más
// frágil que compartir solo la mecánica.

import { useState } from 'react'
import { useReducedMotion } from '@/lib/ui/motion'

interface FlipCardProps {
  front: React.ReactNode
  back: React.ReactNode
  height?: number
  flipped?: boolean
  onFlippedChange?: (flipped: boolean) => void
  className?: string
}

export function FlipCard({ front, back, height = 264, flipped: flippedProp, onFlippedChange, className }: FlipCardProps) {
  const [flippedState, setFlippedState] = useState(false)
  const flipped = flippedProp ?? flippedState
  const reducedMotion = useReducedMotion()

  function toggle() {
    if (onFlippedChange) onFlippedChange(!flipped)
    else setFlippedState(f => !f)
  }

  return (
    <div
      onClick={toggle}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
      className={className}
      style={{ perspective: 1400, height, cursor: 'pointer' }}
    >
      <div
        style={{
          position: 'relative', width: '100%', height: '100%',
          transition: reducedMotion ? 'none' : 'transform .5s cubic-bezier(.2,.8,.2,1)',
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'none',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: 16, overflow: 'hidden' }}>
          {front}
        </div>
        <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: 16, transform: 'rotateY(180deg)', overflow: 'hidden' }}>
          {back}
        </div>
      </div>
    </div>
  )
}
