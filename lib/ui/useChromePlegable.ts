// Chrome que se pliega al recorrer una lista (header de Producción y del Mise).
//
// Tres cosas que antes fallaban y por qué:
//  1. Todo se pliega con la MISMA duración y curva (tokens de motion.ts). Antes
//     una parte desaparecía de golpe (display:none) y la otra con 180ms propios:
//     dos movimientos desfasados que se leían como un salto.
//  2. Plegar agranda la lista y desplegar la achica; el navegador corrige el
//     scrollTop y esa corrección se leía como "el usuario subió" → el header se
//     reabría solo, se volvía a plegar, y titilaba. Ahora, mientras dura la
//     transición, los eventos de scroll no deciden nada, y una corrección contra
//     el fondo de la lista tampoco cuenta como gesto.
//  3. Una lista corta que no sobra más que el alto del chrome no se pliega: al
//     plegar quedaría sin scroll, volvería a y<12 y reabriría (mismo titileo).
import { useCallback, useEffect, useRef, useState } from 'react'
import { DURATION, EASE_OUT, useReducedMotion } from './motion'

export const CHROME_MS = Math.round(DURATION.base * 1000)
const CURVA = `cubic-bezier(${EASE_OUT.join(',')})`
// Lo que tarda en asentarse el layout tras plegar: la transición más un margen.
const BLOQUEO_MS = CHROME_MS + 140
// Desplazamiento mínimo para contar como gesto y zona muerta arriba del todo.
const UMBRAL_GESTO = 8
const ZONA_ARRIBA = 12
// La lista tiene que sobrar al menos esto (≈ lo que se pliega) para plegar.
const SOBRANTE_MINIMO = 180

/** Transición coherente para todo lo que se pliega: mismo tiempo, misma curva. */
export function transicionChrome(reducido: boolean, ...props: string[]): string {
  if (reducido) return 'none'
  return props.map(p => `${p} ${p === 'opacity' ? Math.round(CHROME_MS * 0.7) : CHROME_MS}ms ${CURVA}`).join(', ')
}

export function useChromePlegable(onCambio?: (compacto: boolean) => void) {
  const reducido = useReducedMotion()
  const [compacto, setCompacto] = useState(false)
  const actual = useRef(false)
  const ultimoY = useRef(0)
  const bloqueoHasta = useRef(0)
  const onCambioRef = useRef(onCambio)
  useEffect(() => { onCambioRef.current = onCambio })

  const aplicar = useCallback((c: boolean) => {
    if (actual.current === c) return
    actual.current = c
    bloqueoHasta.current = performance.now() + BLOQUEO_MS
    setCompacto(c)
    onCambioRef.current?.(c)
  }, [])

  const onScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const el = e.currentTarget
    const y = el.scrollTop
    const delta = y - ultimoY.current
    ultimoY.current = y
    if (performance.now() < bloqueoHasta.current) return
    if (y < ZONA_ARRIBA) { aplicar(false); return }
    // Corrección del navegador contra el fondo al crecer la lista: no es un gesto.
    if (delta < 0 && y >= el.scrollHeight - el.clientHeight - 4) return
    if (delta > UMBRAL_GESTO) {
      if (el.scrollHeight - el.clientHeight > SOBRANTE_MINIMO) aplicar(true)
    } else if (delta < -UMBRAL_GESTO) aplicar(false)
  }, [aplicar])

  /** Empezar una vuelta nueva (cambio de plaza/fase): el chrome vuelve entero. */
  const reiniciar = useCallback(() => { ultimoY.current = 0; bloqueoHasta.current = 0; aplicar(false) }, [aplicar])

  return { compacto, onScroll, aplicar, reiniciar, reducido }
}
