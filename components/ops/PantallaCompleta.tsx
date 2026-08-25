'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// ══════════════════════════════════════════════════════════════
// MODO PANTALLA COMPLETA — PLAN-ACCESO-Y-USO B7.2
//
// El pedido, textual: "que el usuario vea únicamente todo eso en la pantalla,
// no la barra lateral y superior. En una tablet dentro de una cocina ayuda a
// ver más plazas y aumentar el tamaño."
//
// Por eso NO es una vista nueva: es un contenedor que tapa el chrome de la app
// y deja el board de Producción tal cual, entero e interactivo — el cocinero
// sigue tildando sus tareas desde acá mientras cocina. Distinto de El Muro
// (`/muro`), que es solo-lectura-ish y para toda la cocina a dos metros; el
// link a esa vista está en la barra de abajo, que hasta ahora no existía en
// ninguna parte de OPS.
//
// La escala es un control y no un número fijo: la misma tablet se mira desde
// 40 cm apoyada en la mesada y desde 2 m colgada en la pared.
// ══════════════════════════════════════════════════════════════

const ESCALA_MIN = 1
const ESCALA_MAX = 1.6
const ESCALA_PASO = 0.15
const STORAGE_ESCALA = 'kc_ops_fullscreen_escala'

interface Props {
  onSalir: () => void
  children: React.ReactNode
  /** Se muestra en la barra inferior, a la izquierda. */
  titulo?: string
}

export default function PantallaCompleta({ onSalir, children, titulo }: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null)
  const [escala, setEscala] = useState(() => {
    if (typeof window === 'undefined') return 1
    const raw = parseFloat(localStorage.getItem(STORAGE_ESCALA) ?? '')
    return Number.isFinite(raw) && raw >= ESCALA_MIN && raw <= ESCALA_MAX ? raw : 1
  })

  const cambiarEscala = useCallback((delta: number) => {
    setEscala(prev => {
      const next = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, Math.round((prev + delta) * 100) / 100))
      localStorage.setItem(STORAGE_ESCALA, String(next))
      return next
    })
  }, [])

  // Fullscreen del navegador: gana la barra de estado y la de direcciones, que
  // en una tablet son ~10% de la pantalla. Si el navegador lo rechaza (hace
  // falta un gesto del usuario, y algunos iOS no lo soportan) no pasa nada: el
  // overlay ya tapa el chrome de la app, que es el 90% del pedido.
  useEffect(() => {
    const el = contenedorRef.current
    el?.requestFullscreen?.().catch(() => { /* opcional, seguimos igual */ })
    return () => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [])

  // Escape sale. El navegador ya lo usa para salir de su propio fullscreen, así
  // que también se escucha `fullscreenchange`: sin esto, salir con Escape
  // dejaba el overlay puesto y sin fullscreen — el peor de los dos mundos.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onSalir() }
    function onFsChange() { if (!document.fullscreenElement) onSalir() }
    document.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFsChange)
    }
  }, [onSalir])

  const btn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    height: 34, padding: '0 12px', borderRadius: 9, cursor: 'pointer',
    background: 'var(--surface)', border: '1px solid var(--border)',
    color: 'var(--text-2)', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
    textDecoration: 'none', flexShrink: 0,
  }

  return (
    <div
      ref={contenedorRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 250,
        background: 'var(--bg)', display: 'flex', flexDirection: 'column',
      }}
    >
      {/* El board, escalado. `zoom` y no `transform: scale` a propósito: scale
          no reflowea, así que las columnas quedarían cortadas a la derecha en
          vez de reacomodarse. */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', zoom: escala }}>
        {children}
      </div>

      {/* Barra de salida — abajo, donde no compite con el contenido y la mano
          la alcanza sin taparlo. Siempre visible: perder la salida en un modo
          a pantalla completa es la peor trampa posible. */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', borderTop: '1px solid var(--border)',
        background: 'var(--surface)',
      }}>
        {titulo && (
          <span style={{
            fontSize: 11, fontWeight: 800, color: 'var(--text-3)',
            textTransform: 'uppercase', letterSpacing: '.07em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{titulo}</span>
        )}

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => cambiarEscala(-ESCALA_PASO)}
            disabled={escala <= ESCALA_MIN}
            aria-label="Achicar"
            style={{ ...btn, width: 34, padding: 0, opacity: escala <= ESCALA_MIN ? .4 : 1 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>text_decrease</span>
          </button>
          <span style={{
            fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
            minWidth: 38, textAlign: 'center', fontFamily: "'DM Mono', monospace",
          }}>
            {Math.round(escala * 100)}%
          </span>
          <button
            onClick={() => cambiarEscala(ESCALA_PASO)}
            disabled={escala >= ESCALA_MAX}
            aria-label="Agrandar"
            style={{ ...btn, width: 34, padding: 0, opacity: escala >= ESCALA_MAX ? .4 : 1 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>text_increase</span>
          </button>
        </div>

        {/* El Muro existía desde MURO-PLAN pero no se llegaba desde OPS por
            ningún camino (ver B5.3). Este es el lugar donde se lo busca. */}
        <Link href="/muro" style={btn} title="Vista de pared, para toda la cocina">
          <span className="material-symbols-outlined" style={{ fontSize: 17 }}>cast</span>
          Muro
        </Link>

        <button onClick={onSalir} style={{ ...btn, background: 'var(--navy)', color: '#fff', border: 'none' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 17 }}>close_fullscreen</span>
          Salir
        </button>
      </div>
    </div>
  )
}
