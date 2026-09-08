'use client'

// Franja "próximos días" — eventos y menús planificados para la semana que
// viene, de un vistazo, con link a /calendario para el detalle (S6, sep 2026,
// Bloque 6). Ver lib/hooks/useProximosDias.ts para el porqué de la consulta
// angosta en vez de reusar useCalendario() entero.
//
// Dos densidades (S6, Bloque 0): 'strip' es el teaser de 5 chips angostos
// (mobile, y antes también desktop). 'panel' es la vista de 7 días con cada
// evento como fila legible — pensada para el panel ancho del dashboard
// desktop, donde 5 chips de 90px quedaban ridículos estirados a 1000px.

import Link from 'next/link'
import { useProximosDias } from '@/lib/hooks/useProximosDias'

const DIAS_SEMANA = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']

function fmtDia(fecha: string, hoy: string) {
  const [y, m, d] = fecha.split('-').map(Number)
  const date = new Date(y, m - 1, d, 12)
  return {
    esHoy: fecha === hoy,
    diaSemana: DIAS_SEMANA[date.getDay()],
    numero: d,
  }
}

interface ProximosDiasProps {
  variant?: 'strip' | 'panel'
}

export default function ProximosDias({ variant = 'strip' }: ProximosDiasProps) {
  const { dias, loading } = useProximosDias(variant === 'panel' ? 7 : 5)

  // Nada que mostrar y ya cargó: no vale la pena el espacio de una card vacía.
  if (!loading && dias.every(d => d.items.length === 0)) return null

  const hoy = dias[0]?.fecha ?? ''

  if (variant === 'panel') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)' }}>
            Próximos días
          </p>
          <Link href="/calendario" style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', textDecoration: 'none' }}>
            Ver calendario →
          </Link>
        </div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} style={{ height: 140, borderRadius: 12, background: 'var(--bg)' }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
            {dias.map(d => {
              const { esHoy, diaSemana, numero } = fmtDia(d.fecha, hoy)
              return (
                <div
                  key={d.fecha}
                  style={{
                    borderRadius: 12, padding: '8px 6px', minHeight: 140,
                    background: esHoy ? 'var(--navy)' : 'var(--surface)',
                    border: esHoy ? 'none' : '1px solid var(--border)',
                    boxShadow: esHoy ? 'none' : 'var(--shadow-1)',
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.04em', color: esHoy ? 'rgba(255,255,255,.6)' : 'var(--text-3)' }}>
                      {diaSemana}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: esHoy ? '#fff' : 'var(--text-1)' }}>
                      {numero}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {d.items.length === 0 ? (
                      <div style={{ width: 4, height: 4, borderRadius: '50%', background: esHoy ? 'rgba(255,255,255,.25)' : 'var(--border)', margin: '4px auto 0' }} />
                    ) : (
                      d.items.map(item => (
                        <div
                          key={item.id}
                          title={item.titulo}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 4,
                            fontSize: 10.5, fontWeight: 600, padding: '3px 5px', borderRadius: 6, lineHeight: 1.25,
                            background: esHoy ? 'rgba(255,255,255,.15)' : item.color + '18',
                            color: esHoy ? '#fff' : item.color,
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 11, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {item.titulo}
                            {item.hora && <span style={{ opacity: 0.75, fontWeight: 500 }}> · {item.hora}</span>}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <Link
      href="/calendario"
      className="block transition-transform active:scale-[.98]"
      style={{ textDecoration: 'none' }}
    >
      <div
        className="rounded-[16px] p-3"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-1)' }}
      >
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            Próximos días
          </span>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>chevron_right</span>
        </div>

        {loading ? (
          <div className="flex gap-2 px-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ flex: 1, height: 52, borderRadius: 10, background: 'var(--bg)' }} />
            ))}
          </div>
        ) : (
          <div className="flex gap-1.5">
            {dias.map(d => {
              const { esHoy, diaSemana, numero } = fmtDia(d.fecha, hoy)
              const primero = d.items[0]
              const resto = d.items.length - 1
              return (
                <div
                  key={d.fecha}
                  style={{
                    flex: 1, minWidth: 0, borderRadius: 10, padding: '6px 4px',
                    background: esHoy ? 'var(--navy)' : 'transparent',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  }}
                >
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.04em', color: esHoy ? 'rgba(255,255,255,.6)' : 'var(--text-3)' }}>
                    {diaSemana}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: esHoy ? '#fff' : 'var(--text-1)' }}>
                    {numero}
                  </span>
                  {primero ? (
                    <div
                      title={d.items.map(i => i.titulo).join(', ')}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2,
                        fontSize: 9, fontWeight: 700, padding: '2px 3px', borderRadius: 6,
                        background: esHoy ? 'rgba(255,255,255,.15)' : primero.color + '18',
                        color: esHoy ? '#fff' : primero.color,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 10, flexShrink: 0 }}>{primero.icon}</span>
                      {resto > 0 ? `+${resto + 1}` : primero.titulo}
                    </div>
                  ) : (
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: esHoy ? 'rgba(255,255,255,.25)' : 'var(--border)' }} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Link>
  )
}
