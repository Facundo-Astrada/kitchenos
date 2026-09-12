'use client'

import Link from 'next/link'
import type { CoachLink } from '@/lib/coach/types'

const NARANJA = '#f97316'

/**
 * Accesos directos debajo de una respuesta del Coach.
 *
 * Distintos de los chips de `options`, que mandan otra pregunta al chat: estos
 * NAVEGAN a la pantalla de algo concreto que la herramienta ya resolvió (la
 * ficha de una receta, por ejemplo). El href lo arma el server con el id real
 * — el texto del chat se pinta plano, así que un link no podría viajar adentro.
 */
export function CoachLinks({ links, onNavigate, marginLeft = 36 }: { links: CoachLink[]; onNavigate?: () => void; marginLeft?: number }) {
  if (!links.length) return null
  return (
    <div style={{ marginLeft, marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {links.map(l => (
        <Link
          key={l.href}
          href={l.href}
          onClick={onNavigate}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: NARANJA, border: `1px solid ${NARANJA}`, borderRadius: 20,
            // 36px: son botones de chat, no de superficie de servicio — el piso
            // de 56px de DESIGN.md aplica a las pantallas operativas.
            minHeight: 36, padding: '7px 13px',
            fontSize: 12.5, fontWeight: 600, color: '#fff', textDecoration: 'none',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{l.icono ?? 'open_in_new'}</span>
          {l.label}
        </Link>
      ))}
    </div>
  )
}
