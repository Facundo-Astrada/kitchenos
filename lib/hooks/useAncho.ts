'use client'

import { useEffect, useState } from 'react'

/* Ancho real del área de contenido. "Desktop" no alcanza: con la sidebar y el
   panel del Coach abiertos, a una ventana de 1280px le quedan ~580 (ver
   ui.md § Columnas de una pantalla de contenido). Devuelve 0 hasta medir.

   Recibe el elemento (no un ref): una pantalla con retornos tempranos
   (skeleton, editor a pantalla completa) monta su raíz más tarde, y un efecto
   atado a un ref no se vuelve a correr cuando el nodo aparece. Uso:
   `const [raiz, setRaiz] = useState<HTMLDivElement | null>(null)` +
   `<div ref={setRaiz}>`. Calendario y Turnos tienen su copia local por ref. */
export function useAncho(el: HTMLElement | null) {
  const [ancho, setAncho] = useState(0)
  useEffect(() => {
    if (!el) return
    const ro = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return ancho
}
