'use client'

// lib/ui/motion.ts — tokens únicos de duración/easing + helpers de movimiento.
// Ver .claude/docs/ui.md § Movimiento para las 3 reglas: nada de rendimiento
// individual expuesto, KDS/Muro no se tocan, nunca animar la posición de un
// target tappable (rompe el primer tap — ver ui.md § Animaciones de lista).

import { useEffect, useState } from 'react'

export const DURATION = {
  instant: 0.12, // feedback de tap: scale, color de un control
  base: 0.2,     // cambio de estado: badge, barra de progreso
  enter: 0.26,   // entrada de pantalla o sheet
} as const

export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1]

// Spring de sheets/paneles (mismo valor ya calibrado en MoreMenu).
export const SPRING_SHEET = { type: 'spring', damping: 32, stiffness: 380, mass: 0.8 } as const

// true si el usuario pidió "reducir movimiento" en el SO. Toda animación de
// pantalla/chrome debe caer a duración 0 (no a "sin animar el prop": los
// valores finales tienen que aplicarse igual, solo sin transición).
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

// Duración efectiva: cae a 0 con reduced-motion activado.
export function useDuration(base: number): number {
  const reduced = useReducedMotion()
  return reduced ? 0 : base
}

// Háptico corto de confirmación (tildar un ítem, despachar, entregar plaza).
// No-op en desktop y en navegadores sin soporte (iOS Safari) — nunca rompe
// el flujo si falla. Independiente de reduced-motion: es táctil, no visual.
export function tap(ms: number = 10) {
  if (typeof navigator === 'undefined') return
  try {
    navigator.vibrate?.(ms)
  } catch {
    // no soportado, ignorar
  }
}
