'use client'

// Sillas alrededor de una mesa, derivadas de forma + capacidad — cero estado propio,
// se recalculan solas cuando cambia la capacidad o el tamaño de la mesa.
// Se renderizan como hijas absolutas del wrapper de la mesa (que ya es position:absolute
// y rota con transform), así heredan la rotación sin necesidad de contra-rotar.
// Cada silla es un glifo top-down: asiento redondeado + respaldo hacia afuera de la mesa.

import type { MesaForma } from '@/types'

const OUT = 16 // % de solapamiento hacia afuera del borde, lados rectos
const RADIO_REDONDA = 68 // % de radio para mesas redondas
const MAX_SILLAS = 24

interface SillaPos { left: number; top: number; rot: number }

function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0 || total <= 0) return weights.map(() => 0)
  const raw = weights.map(w => (w / sum) * total)
  const base = raw.map(Math.floor)
  const restante = total - base.reduce((a, b) => a + b, 0)
  const orden = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; k < restante; k++) base[orden[k % orden.length].i]++
  return base
}

function sillaPositions(forma: MesaForma, capacidad: number, ancho: number, alto: number): SillaPos[] {
  const cap = Math.min(Math.max(capacidad, 0), MAX_SILLAS)
  if (cap === 0) return []

  if (forma === 'redonda') {
    return Array.from({ length: cap }, (_, i) => {
      const theta = (i / cap) * Math.PI * 2 - Math.PI / 2
      return {
        left: 50 + RADIO_REDONDA * Math.cos(theta),
        top: 50 + RADIO_REDONDA * Math.sin(theta),
        rot: (i / cap) * 360, // respaldo apunta radialmente hacia afuera
      }
    })
  }

  // cuadrada / rectangular — reparte por lado según su longitud relativa (lados largos, más sillas)
  const [top, right, bottom, left] = apportion(cap, [ancho, alto, ancho, alto])
  const along = (n: number) => Array.from({ length: n }, (_, i) => ((i + 1) / (n + 1)) * 100)
  const pos: SillaPos[] = []
  along(top).forEach(t => pos.push({ left: t, top: -OUT, rot: 0 }))       // respaldo hacia arriba
  along(right).forEach(t => pos.push({ left: 100 + OUT, top: t, rot: 90 })) // hacia la derecha
  along(bottom).forEach(t => pos.push({ left: t, top: 100 + OUT, rot: 180 })) // hacia abajo
  along(left).forEach(t => pos.push({ left: -OUT, top: t, rot: 270 }))    // hacia la izquierda
  return pos
}

export function Sillas({ forma, capacidad, ancho, alto, tamano = 14 }: {
  forma: MesaForma
  capacidad: number
  ancho: number
  alto: number
  tamano?: number // px del glifo de silla
}) {
  const posiciones = sillaPositions(forma, capacidad, ancho, alto)
  if (posiciones.length === 0) return null
  return (
    <>
      {posiciones.map((p, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: tamano,
            height: tamano,
            transform: `translate(-50%, -50%) rotate(${p.rot}deg)`,
            pointerEvents: 'none',
          }}
        >
          {/* respaldo (borde exterior) */}
          <span style={{
            position: 'absolute', left: '12%', top: 0, width: '76%', height: '26%',
            borderRadius: `${tamano * 0.3}px ${tamano * 0.3}px 3px 3px`,
            background: '#64748b',
          }} />
          {/* asiento */}
          <span style={{
            position: 'absolute', left: '8%', top: '24%', width: '84%', height: '72%',
            borderRadius: `4px 4px ${tamano * 0.35}px ${tamano * 0.35}px`,
            background: '#93a3b8',
          }} />
        </span>
      ))}
    </>
  )
}
