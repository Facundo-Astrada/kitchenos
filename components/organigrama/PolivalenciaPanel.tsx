'use client'
/**
 * Matriz de polivalencia — Organigrama → Polivalencia.
 *
 * Filas = personas, columnas = plazas, celda = nivel 0-4. Ver
 * `PLAN-IMPLANTACION-2026-09.md` § 5.3 y `lib/hooks/useCompetencias.ts`.
 *
 * Dos reglas de lectura que gobiernan todo el diseño de esta pantalla:
 *
 * 1. **Mide cobertura del restaurante, no rendimiento de la persona**
 *    (DECISIONES.md § 25). Por eso arriba de todo va el riesgo POR PLAZA y no un
 *    promedio por persona, y por eso no hay ningún orden "de mejor a peor": el
 *    plantel se lista alfabético, como en el resto de la app.
 * 2. **El nivel 4 no es una medalla, es una dirección**: es a quién le pregunta
 *    el resto. De acá salen los referentes de la ruta de implantación.
 */
import { useMemo, useState } from 'react'
import {
  NIVELES_COMPETENCIA, nivelCompetencia, todasLasPlazas, plazaLabel, plazaIcon,
  NIVEL_AUTONOMO, NIVEL_REFERENTE, type NivelCompetencia,
} from '@/lib/constants'
import { useCompetencias } from '@/lib/hooks/useCompetencias'
import { usePlazasCustom } from '@/lib/hooks/usePlazasCustom'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import type { Miembro } from '@/lib/hooks/useEquipo'
import { EmptyState } from '@/components/ui/EmptyState'

const ESTADO_RIESGO = {
  critico:      { label: 'Sin nadie que la cubra', color: '#ef4444', icon: 'error' },
  fragil:       { label: 'Depende de una persona', color: '#f97316', icon: 'warning' },
  'sin-relevo': { label: 'Nadie la enseña',        color: '#f59e0b', icon: 'school' },
  ok:           { label: 'Cubierta',               color: '#10b981', icon: 'check_circle' },
} as const

export default function PolivalenciaPanel({
  miembros, isAdmin, onToast,
}: {
  miembros: Miembro[]
  isAdmin: boolean
  onToast: (msg: string) => void
}) {
  const { plazasCustom } = usePlazasCustom()
  const { nivelDe, setNivel, riesgo, loading } = useCompetencias()
  const [editando, setEditando] = useState<{ miembroId: string; plaza: string } | null>(null)
  const isDesktop = useIsDesktop()

  // 'general' y 'menu' no son plazas físicas donde alguien se forme: no entran.
  const plazas = useMemo(
    () => todasLasPlazas(plazasCustom).filter(p => p !== 'general' && p !== 'menu'),
    [plazasCustom],
  )
  const riesgos = useMemo(() => riesgo(plazas), [riesgo, plazas])
  const alertas = riesgos.filter(r => r.estado !== 'ok')

  if (!loading && miembros.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        <EmptyState
          icon="school"
          title="Todavía no hay plantel"
          subtitle="Cargá a tu equipo en Plantel y volvé acá para marcar quién sabe hacer qué en cada plaza."
        />
      </div>
    )
  }

  async function cambiar(miembroId: string, plaza: string, nivel: NivelCompetencia) {
    setEditando(null)
    if (!isAdmin) return
    await setNivel(miembroId, plaza, nivel)
    if (nivel >= NIVEL_REFERENTE) {
      const nombre = miembros.find(m => m.id === miembroId)?.nombre ?? 'Esa persona'
      onToast(`${nombre} queda como referente de ${plazaLabel(plaza, plazasCustom)}`)
    }
  }

  function nivelDropdown(miembroId: string, plaza: string, nivelActual: NivelCompetencia) {
    return (
      <>
        {NIVELES_COMPETENCIA.map(n => (
          <button
            key={n.nivel} type="button"
            onClick={() => cambiar(miembroId, plaza, n.nivel)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 9px',
              borderRadius: 8, border: 'none', textAlign: 'left', cursor: 'pointer',
              background: n.nivel === nivelActual ? n.color + '1a' : 'transparent',
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: 2, background: n.color, flexShrink: 0, marginTop: 4 }} />
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{n.label}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.35 }}>{n.ayuda}</span>
            </span>
          </button>
        ))}
      </>
    )
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }} data-coach-target="organigrama-polivalencia">
      <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.55 }}>
        Quién sabe hacer qué, y con qué nivel. Sirve para dos cosas: saber <b>a quién preguntarle</b> en
        cada plaza, y ver <b>qué plaza se cae</b> si falta una sola persona — hoy, y no el día que falte.
        Mide la cobertura del restaurante, no a la gente.
      </p>

      {/* ── Riesgo por plaza: lo primero, porque es lo accionable ── */}
      {alertas.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
          {alertas.map(r => {
            const cfg = ESTADO_RIESGO[r.estado]
            return (
              <div key={r.plaza} style={{
                background: 'var(--surface)', border: `1px solid ${cfg.color}55`,
                borderLeft: `3px solid ${cfg.color}`, borderRadius: 12, padding: '10px 12px',
                display: 'flex', flexDirection: 'column', gap: 3,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: cfg.color }}>{cfg.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{plazaLabel(r.plaza, plazasCustom)}</span>
                </div>
                <span style={{ fontSize: 11.5, color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  {r.autonomos} {r.autonomos === 1 ? 'persona la cubre sola' : 'personas la cubren solas'}
                  {' · '}{r.referentes} {r.referentes === 1 ? 'referente' : 'referentes'}
                </span>
              </div>
            )
          })}
        </div>
      )}
      {!loading && alertas.length === 0 && plazas.length > 0 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid #10b981',
          borderRadius: 12, padding: '10px 12px', fontSize: 12.5, color: 'var(--text-2)',
        }}>
          Todas las plazas tienen al menos dos personas que las cubren solas y alguien que las enseña.
        </div>
      )}

      {/* ── La matriz (desktop) / cards por plaza (mobile) ──
          En mobile la tabla no entra: con 6 plazas fijas son ~692px de
          ancho mínimo contra ~390px de pantalla (S7 sep 2026, feedback:
          "no puedo ver todas las plazas"). Transponer a card-por-plaza
          además queda más fiel a la regla de lectura de arriba: el riesgo
          de la plaza es lo primero, no quién es mejor. */}
      {isDesktop ? (
        <div
          style={{
            overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12,
            // Sombra de scroll sin JS: dos gradientes "local" (se mueven con el
            // contenido, tapan la sombra cuando no hay más para ver a ese lado)
            // sobre dos gradientes "scroll" (fijos al viewport, la sombra real).
            background: `
              linear-gradient(to right, var(--surface) 30%, rgba(255,255,255,0)),
              linear-gradient(to right, rgba(255,255,255,0), var(--surface) 70%) 100% 0,
              linear-gradient(to right, rgba(0,0,0,.10), rgba(0,0,0,0)),
              linear-gradient(to left, rgba(0,0,0,.10), rgba(0,0,0,0)) 100% 0
            `,
            backgroundRepeat: 'no-repeat',
            backgroundColor: 'var(--surface)',
            backgroundSize: '40px 100%, 40px 100%, 14px 100%, 14px 100%',
            backgroundAttachment: 'local, local, scroll, scroll',
          }}
        >
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 120 + plazas.length * 96 }}>
            <thead>
              <tr>
                <th style={{
                  position: 'sticky', left: 0, zIndex: 2, background: 'var(--surface)',
                  textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700,
                  color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em',
                  borderBottom: '1px solid var(--border)', minWidth: 140,
                }}>Persona</th>
                {plazas.map(p => (
                  <th key={p} style={{
                    padding: '10px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-2)',
                    borderBottom: '1px solid var(--border)', minWidth: 92,
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 17 }}>{plazaIcon(p, plazasCustom)}</span>
                      {plazaLabel(p, plazasCustom)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {miembros.map(m => (
                <tr key={m.id}>
                  <td style={{
                    position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface)',
                    padding: '8px 12px', fontSize: 13, fontWeight: 500,
                    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                  }}>{m.nombre}</td>
                  {plazas.map(p => {
                    const nivel = nivelDe(m.id, p)
                    const cfg = nivelCompetencia(nivel)
                    const abierto = editando?.miembroId === m.id && editando?.plaza === p
                    return (
                      <td key={p} style={{
                        padding: 6, textAlign: 'center', borderBottom: '1px solid var(--border)',
                        position: 'relative',
                      }}>
                        <button
                          type="button"
                          disabled={!isAdmin}
                          onClick={() => setEditando(abierto ? null : { miembroId: m.id, plaza: p })}
                          title={`${cfg.label} — ${cfg.ayuda}`}
                          aria-label={`${m.nombre} en ${plazaLabel(p, plazasCustom)}: ${cfg.label}`}
                          style={{
                            display: 'inline-flex', gap: 3, padding: '7px 8px', borderRadius: 8,
                            border: `1px solid ${abierto ? cfg.color : 'transparent'}`,
                            background: abierto ? cfg.color + '18' : 'transparent',
                            cursor: isAdmin ? 'pointer' : 'default',
                          }}
                        >
                          {[0, 1, 2, 3].map(i => (
                            <span key={i} style={{
                              width: 8, height: 8, borderRadius: 2, display: 'block',
                              background: i < nivel ? cfg.color : 'var(--border)',
                            }} />
                          ))}
                        </button>

                        {abierto && (
                          <div style={{
                            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                            zIndex: 20, background: 'var(--surface)', border: '1px solid var(--border)',
                            borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.16)', padding: 6,
                            display: 'flex', flexDirection: 'column', gap: 2, minWidth: 210, textAlign: 'left',
                          }}>
                            {nivelDropdown(m.id, p, nivel)}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {plazas.map(p => {
            const r = riesgos.find(x => x.plaza === p)
            const cfg = r ? ESTADO_RIESGO[r.estado] : ESTADO_RIESGO.ok
            const entradas = miembros.map(m => ({ m, nivel: nivelDe(m.id, p) }))
            const formados = entradas
              .filter(e => e.nivel > 0)
              .sort((a, b) => b.nivel - a.nivel || a.m.nombre.localeCompare(b.m.nombre))
            const sinFormar = entradas.filter(e => e.nivel === 0)

            return (
              <div key={p} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderLeft: `3px solid ${cfg.color}`, borderRadius: 12, padding: '12px 14px',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-2)', flexShrink: 0 }}>
                      {plazaIcon(p, plazasCustom)}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{plazaLabel(p, plazasCustom)}</span>
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: cfg.color, flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{cfg.icon}</span>
                    {cfg.label}
                  </span>
                </div>

                {formados.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, fontStyle: 'italic' }}>Nadie formado todavía</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {formados.map(({ m, nivel }) => {
                      const cfgNivel = nivelCompetencia(nivel)
                      const abierto = editando?.miembroId === m.id && editando?.plaza === p
                      return (
                        <div key={m.id}>
                          <button
                            type="button"
                            disabled={!isAdmin}
                            onClick={() => setEditando(abierto ? null : { miembroId: m.id, plaza: p })}
                            aria-label={`${m.nombre} en ${plazaLabel(p, plazasCustom)}: ${cfgNivel.label}`}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                              padding: '8px 10px', borderRadius: 8,
                              border: `1px solid ${abierto ? cfgNivel.color : 'var(--border)'}`,
                              background: abierto ? cfgNivel.color + '18' : 'var(--bg)',
                              cursor: isAdmin ? 'pointer' : 'default',
                            }}
                          >
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{m.nombre}</span>
                            <span style={{ display: 'inline-flex', gap: 3, flexShrink: 0 }}>
                              {[0, 1, 2, 3].map(i => (
                                <span key={i} style={{
                                  width: 8, height: 8, borderRadius: 2, display: 'block',
                                  background: i < nivel ? cfgNivel.color : 'var(--border)',
                                }} />
                              ))}
                            </span>
                          </button>
                          {abierto && (
                            <div style={{
                              marginTop: 4, background: 'var(--bg)', border: '1px solid var(--border)',
                              borderRadius: 10, padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
                            }}>
                              {nivelDropdown(m.id, p, nivel)}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {sinFormar.length > 0 && (
                  <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
                    Sin formar: {sinFormar.slice(0, 4).map(e => e.m.nombre).join(', ')}
                    {sinFormar.length > 4 ? ` +${sinFormar.length - 4}` : ''}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Leyenda ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {NIVELES_COMPETENCIA.map(n => (
          <span key={n.nivel} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text-2)' }}>
            <span style={{ display: 'inline-flex', gap: 2 }}>
              {[0, 1, 2, 3].map(i => (
                <span key={i} style={{
                  width: 7, height: 7, borderRadius: 2,
                  background: i < n.nivel ? n.color : 'var(--border)',
                }} />
              ))}
            </span>
            {n.label}
          </span>
        ))}
      </div>

      <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
        Se sube de nivel haciendo, no mirando: el nivel {NIVEL_AUTONOMO} es &laquo;puede cubrir el turno solo&raquo; y
        el {NIVEL_REFERENTE} es &laquo;además lo enseña&raquo;. {!isAdmin && 'Solo un administrador puede cambiar los niveles.'}
      </p>
    </div>
  )
}
