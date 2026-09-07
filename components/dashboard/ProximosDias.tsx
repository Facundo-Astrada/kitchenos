'use client'

// Franja "próximos días" — eventos y menús planificados para la semana que
// viene, de un vistazo, con link a /calendario para el detalle (S6, sep 2026,
// Bloque 6). Ver lib/hooks/useProximosDias.ts para el porqué de la consulta
// angosta en vez de reusar useCalendario() entero.

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

export default function ProximosDias() {
  const { dias, loading } = useProximosDias(5)

  // Nada que mostrar y ya cargó: no vale la pena el espacio de una card vacía.
  if (!loading && dias.every(d => d.items.length === 0)) return null

  const hoy = dias[0]?.fecha ?? ''

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
