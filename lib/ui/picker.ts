// lib/ui/picker.ts — geometría pura del picker vertical de mantener-apretado
// (PrioridadPicker). Sin DOM: recibe rects ya medidos, así se testea con
// vitest (env node) sin montar nada.

export interface RectV { top: number; bottom: number }

/** Índice de la opción cuyo rect contiene `y`, o null si el dedo está fuera de la columna. */
export function opcionDesdeY(y: number, rects: RectV[]): number | null {
  for (let i = 0; i < rects.length; i++) {
    if (y >= rects[i].top && y <= rects[i].bottom) return i
  }
  return null
}

export interface DOMRectLike { top: number; bottom: number; left: number; right: number }

/**
 * Posición del popover (fixed, portal a body): pegado al lado derecho del
 * anchor por defecto, a la izquierda si no entra en el viewport. Top
 * centrado en el anchor y clampeado para no salirse arriba/abajo.
 */
export function posicionPopover(
  anchor: DOMRectLike, alto: number, ancho: number, vw: number, vh: number,
): { left: number; top: number } {
  const gap = 6
  const left = anchor.right + gap + ancho <= vw ? anchor.right + gap : Math.max(4, anchor.left - gap - ancho)
  const centro = anchor.top + (anchor.bottom - anchor.top) / 2
  const top = Math.min(Math.max(4, centro - alto / 2), vh - alto - 4)
  return { left, top }
}
