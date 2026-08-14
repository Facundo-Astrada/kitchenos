// Colapso del chrome de OPS mientras se recorre el mise.
//
// El header de OPS son cuatro franjas fijas apiladas (tabs del módulo, plaza y
// acciones, fases y progreso) que juntas se comían un tercio de la pantalla en
// una tablet: cuando el trabajo es recorrer 41 ítems de una plaza, ese tercio
// son ocho ítems que no se ven. Scrolleando hacia abajo el chrome que no se usa
// se pliega y queda solo la fila de fases; al primer scroll hacia arriba vuelve
// entero.
//
// Vive fuera de React y no en un contexto porque el que scrollea (el mise) y el
// que se pliega (los tabs de OPS, en operaciones/page.tsx) son hermanos sin
// estado en común: un contexto acá re-renderizaría los tres paneles de OPS en
// cada tick de scroll, que es exactamente lo que no queremos mientras el dedo
// está arrastrando. Mismo criterio que miseBus.
const EVT = 'kc-ops-chrome'

/** Lo pide el mise al scrollear. `compact` = plegar lo que no se está usando. */
export function setOpsChromeCompact(compact: boolean): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVT, { detail: { compact } }))
}

/** Lo escucha el contenedor de OPS. Devuelve la función de limpieza. */
export function onOpsChromeCompact(cb: (compact: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (e: Event) => cb((e as CustomEvent<{ compact: boolean }>).detail.compact)
  window.addEventListener(EVT, handler)
  return () => window.removeEventListener(EVT, handler)
}
