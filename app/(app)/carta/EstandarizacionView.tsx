'use client'

import { useMemo } from 'react'
import type { Receta } from '@/types'
import type { CartaItemEnriquecido } from '@/lib/hooks/useCarta'
import { analizarCarta, nivelDePlato, type Nivel } from '@/lib/recetas/estandarizacion'
import { fmtMoney } from './cards'

// Escala de 4 niveles — NO son colores de alarma (DESIGN.md §8: presupuesto
// de ámbar ≤3 por pantalla). N0/N1 son neutros, N2 es informativo (azul,
// "en progreso"), N3 es positivo (verde, "listo"). Nunca ámbar/rojo por
// nivel — con hasta ~90 componentes en pantalla eso violaría el presupuesto
// por acumulación aunque cada uno individualmente no sea una alarma.
export const NIVEL_META: Record<Nivel, { label: string; nombre: string; bg: string; fg: string }> = {
  0: { label: 'N0', nombre: 'Sin cargar', bg: 'var(--border)', fg: 'var(--text-3)' },
  1: { label: 'N1', nombre: 'Nombrada',   bg: 'var(--bg)',     fg: 'var(--text-2)' },
  2: { label: 'N2', nombre: 'Escrita',    bg: 'var(--blue-bg)', fg: 'var(--blue-fg)' },
  3: { label: 'N3', nombre: 'Pesada',     fg: 'var(--green-fg)', bg: 'var(--green-bg)' },
}

export function NivelBadge({ nivel, title }: { nivel: Nivel; title?: string }) {
  const m = NIVEL_META[nivel]
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', fontSize: 10, fontWeight: 800,
      padding: '2px 6px', borderRadius: 5, background: m.bg, color: m.fg,
      letterSpacing: '.02em', flexShrink: 0,
    }}>
      {m.label}
    </span>
  )
}

export function EstandarizacionView({
  items,
  recetasPorId,
  onBack,
  onOpenPlato,
  verCostos = false,
}: {
  items: CartaItemEnriquecido[]
  // Recetario completo — resuelve ingredientes tipo "subreceta" a su propio
  // nivel en vez de contarlos siempre como "sin costo". Ver estandarizacion.ts.
  recetasPorId?: Map<string, Receta>
  onBack: () => void
  onOpenPlato: (id: string) => void
  verCostos?: boolean
}) {
  const analisis = useMemo(() => analizarCarta(items, recetasPorId), [items, recetasPorId])
  const porPlato = useMemo(
    () => items
      .map(item => ({ item, diag: nivelDePlato(item, recetasPorId) }))
      .sort((a, b) => a.diag.nivel - b.diag.nivel || a.item.nombre.localeCompare(b.item.nombre, 'es')),
    [items, recetasPorId],
  )

  const { porNivel, totalComponentes, totalPlatos, platosQueCostean, cola } = analisis
  const n3Verificados = porNivel[3]

  return (
    <div>
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>Estandarización</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Qué le falta a cada receta para costear de verdad</div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {totalComponentes === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
            Todavía no hay componentes cargados en ningún plato.
          </div>
        ) : (
          <>
            {/* ── Barra apilada — un solo elemento visual, no 4 alarmas ── */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>
                {totalPlatos} plato{totalPlatos !== 1 ? 's' : ''} · {totalComponentes} componente{totalComponentes !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'var(--bg)' }}>
                {([0, 1, 2, 3] as Nivel[]).map(n => (
                  porNivel[n] > 0 && (
                    <div key={n} title={`${NIVEL_META[n].nombre}: ${porNivel[n]}`} style={{
                      width: `${(porNivel[n] / totalComponentes) * 100}%`,
                      background: n === 0 ? 'var(--border)' : NIVEL_META[n].fg,
                      opacity: n === 0 ? 1 : 0.85,
                    }} />
                  )
                ))}
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
                {([0, 1, 2, 3] as Nivel[]).map(n => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <NivelBadge nivel={n} />
                    <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{NIVEL_META[n].nombre} · {porNivel[n]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Titular real — conteo, no un % ponderado inventado ── */}
            <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.5 }}>
              <strong>{totalComponentes - porNivel[0] - porNivel[1]}</strong> de {totalComponentes} componentes ya costean (N2 o mejor) ·{' '}
              <strong>{n3Verificados}</strong> con peso pesado y costo verificado (N3) ·{' '}
              <strong>{platosQueCostean}</strong> de {totalPlatos} platos con food cost calculable
            </div>

            {/* ── Empezá por acá — cola ordenada por palanca, no alfabético ── */}
            {cola.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                  Empezá por acá
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  {cola.slice(0, 8).map((c, idx) => (
                    <button
                      key={c.key}
                      onClick={() => onOpenPlato(c.primerPlatoId)}
                      style={{
                        width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '10px 12px', background: 'none', border: 'none', fontFamily: 'inherit', cursor: 'pointer',
                        borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <NivelBadge nivel={c.nivel} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{c.nombre}</span>
                          <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                            → destraba {c.platosQueDestraba} plato{c.platosQueDestraba !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {c.faltantes.length > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                            Falta: {c.faltantes.join(' · ')}
                          </div>
                        )}
                      </div>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)', flexShrink: 0 }}>chevron_right</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Por plato — mini-barra de segmentos, uno por componente ── */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                Por plato
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {porPlato.map(({ item, diag }) => (
                  <button
                    key={item.id}
                    onClick={() => onOpenPlato(item.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                      padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <NivelBadge nivel={diag.nivel} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.nombre}
                    </span>
                    {diag.componentes.length > 0 && (
                      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                        {diag.componentes.map((c, i) => (
                          <div
                            key={i}
                            title={`${c.nombre} — ${NIVEL_META[c.diag.nivel].nombre}${c.diag.faltantes.length ? ': falta ' + c.diag.faltantes.join(', ') : ''}`}
                            style={{
                              width: 7, height: 16, borderRadius: 2,
                              background: c.diag.nivel === 0 ? 'var(--border)' : NIVEL_META[c.diag.nivel].fg,
                              opacity: c.diag.nivel === 0 ? 1 : 0.85,
                            }}
                          />
                        ))}
                      </div>
                    )}
                    {verCostos && diag.costoPorGramo != null && (
                      <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>
                        {fmtMoney(diag.costoPorGramo)}/g{!diag.costoVerificado ? ' est.' : ''}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Límite declarado, no oculto ── */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', background: 'var(--bg)', borderRadius: 10 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)', flexShrink: 0, marginTop: 1 }}>info</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
            No incluye productos comprados que van directo al plato (pan, limón): hoy solo se puede
            cargar como componente una receta o subreceta, no un producto de stock suelto.
          </span>
        </div>
      </div>
    </div>
  )
}
