'use client'

// Toast — confirmación flotante de 3s (PLAN-SUPERFICIE S5.4). Extraído de
// carta/page.tsx y pedidos/page.tsx, que tenían la MISMA función copiada
// verbatim (mismo estilo, mismo timeout) — la forma que ya se había
// convergido a mano en dos lugares distintos. Usa .toast-enter (globals.css,
// tenía 0 usos reales hasta ahora) para la entrada.
//
// No es una migración de las ~17 pantallas que hoy arman su propio toast
// inline — varias tienen semántica propia (ej. el verde del Mise es
// "confirmación positiva", no solo estilo) que no vale la pena forzar a lo
// neutro. Esta es la que usa una pantalla nueva; las existentes migran solas
// la próxima vez que se las toque, como con cualquier otro componente de acá.

import { useEffect } from 'react'

export function Toast({ msg, onDone, variant = 'default' }: {
  msg: string
  onDone: () => void
  variant?: 'default' | 'error'
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div
      className="toast-enter"
      style={{
        position: 'fixed', bottom: 'var(--toast-bottom)', left: '50%', transform: 'translateX(-50%)',
        background: variant === 'error' ? '#991b1b' : '#1e293b', color: '#fff', padding: '10px 20px',
        borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 100,
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)', maxWidth: '90vw', textAlign: 'center',
      }}
    >
      {msg}
    </div>
  )
}
