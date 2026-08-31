'use client'

import type { CartaItemEnriquecido } from '@/lib/hooks/useCarta'
import { QUAD_META, type Quadrante } from '@/lib/carta/ingenieriaMenu'
import { Skeleton } from '@/components/ui'

export const fmtMoney = (n: number) =>
  n > 0 ? `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—'

export function fcBadge(pct: number): { bg: string; text: string } {
  if (pct < 30) return { bg: '#d1fae5', text: '#065f46' }
  if (pct <= 35) return { bg: '#fef3c7', text: '#92400e' }
  return { bg: '#fee2e2', text: '#991b1b' }
}

export function marginBadge(pct: number): { bg: string; text: string } {
  if (pct > 30) return { bg: '#d1fae5', text: '#065f46' }
  if (pct >= 15) return { bg: '#fef3c7', text: '#92400e' }
  return { bg: '#fee2e2', text: '#991b1b' }
}

// ── Plato Card ──────────────────────────────────────────
export function PlatoCard({
  item,
  onClick,
  onToggle,
  verCostos = false,
  quadrante = null,
}: {
  item: CartaItemEnriquecido
  onClick: () => void
  onToggle: () => void
  verCostos?: boolean
  /** Estrella/Caballo/Puzzle/Perro — solo admin, ver quadranteMap en CartaPage. */
  quadrante?: Quadrante | null
}) {
  const hasFc = item.food_cost_pct != null && item.food_cost_pct > 0
  const fc = fcBadge(item.food_cost_pct ?? 0)
  const hasMrg = item.margen_pct_computed != null
  const mrg = marginBadge(item.margen_pct_computed ?? 0)
  const quadMeta = quadrante ? QUAD_META[quadrante] : null

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, overflow: 'hidden',
      position: 'relative',
      height: '100%', display: 'flex', flexDirection: 'column',
    }}>
      {/* Grey overlay + large 86 badge when not disponible */}
      {!item.disponible && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2,
          background: 'rgba(148,163,184,0.5)',
          borderRadius: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            background: '#dc2626', color: '#fff',
            padding: '6px 18px', borderRadius: 10,
            fontSize: 22, fontWeight: 900, letterSpacing: 2,
            boxShadow: '0 2px 8px rgba(220,38,38,0.4)',
          }}>
            86
          </div>
        </div>
      )}

      {/* Clickable area */}
      <button onClick={onClick} style={{
        display: 'block', width: '100%', textAlign: 'left',
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '14px 14px 8px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          {item.foto_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.foto_url} alt="" style={{
              width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0,
            }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-1)', lineHeight: 1.3 }}>
              {item.nombre}
            </div>
            {item.descripcion && (
              <div style={{
                fontSize: 12, color: 'var(--text-3)', marginTop: 3,
                lineHeight: 1.4,
                overflow: 'hidden', textOverflow: 'ellipsis',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {item.descripcion}
              </div>
            )}
          </div>
          {verCostos && (
          <div style={{
            fontSize: 18, fontWeight: 700, color: 'var(--navy)',
            whiteSpace: 'nowrap', paddingTop: 1,
          }}>
            {fmtMoney(item.precio_venta)}
          </div>
          )}
        </div>

        {/* Badges row */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{
            fontSize: 11, color: 'var(--text-3)',
            background: 'var(--bg)', padding: '2px 8px', borderRadius: 6,
            opacity: 0.75,
          }}>
            {item.categoria}
          </span>
          {quadMeta && (
            <span title={quadMeta.rec} style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 11, fontWeight: 700,
              background: `${quadMeta.color}18`, color: quadMeta.color,
              padding: '2px 8px', borderRadius: 6,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{quadMeta.icon}</span>
              {quadMeta.label.slice(0, -1)}
            </span>
          )}
          {verCostos && hasMrg && (
            <span style={{
              fontSize: 11, fontWeight: 700,
              background: mrg.bg, color: mrg.text,
              padding: '2px 8px', borderRadius: 6,
            }}>
              Mrg {(item.margen_pct_computed ?? 0).toFixed(1)}%
            </span>
          )}
          {verCostos && !hasMrg && hasFc && (
            <span style={{
              fontSize: 11, fontWeight: 700,
              background: fc.bg, color: fc.text,
              padding: '2px 8px', borderRadius: 6,
            }}>
              FC {(item.food_cost_pct ?? 0).toFixed(1)}%
            </span>
          )}
          {item.plato_recetas.length > 0 && (
            <span style={{
              fontSize: 11, color: 'var(--accent)',
              background: '#eef2ff', padding: '2px 8px', borderRadius: 6,
            }}>
              {item.plato_recetas.length} receta{item.plato_recetas.length > 1 ? 's' : ''}
            </span>
          )}
          {item.plato_recetas.length === 0 && item.receta && (
            <span style={{
              fontSize: 11, color: 'var(--accent)',
              background: '#eef2ff', padding: '2px 8px', borderRadius: 6,
            }}>
              Receta vinculada
            </span>
          )}
        </div>
      </button>

      {/* Toggle disponible — anclado abajo (marginTop:auto) para que la tarjeta llene el alto fijo del FlipCard en desktop */}
      <div style={{
        padding: '8px 14px 12px', display: 'flex', justifyContent: 'flex-end',
        borderTop: '1px solid var(--border)',
        position: 'relative', zIndex: 3, marginTop: 'auto',
      }}>
        <button onClick={e => { e.stopPropagation(); onToggle() }} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 12, color: item.disponible ? '#059669' : '#ef4444',
          fontWeight: 600,
        }}>
          <div style={{
            width: 36, height: 20, borderRadius: 10,
            background: item.disponible ? '#059669' : '#d1d5db',
            position: 'relative', transition: 'background 0.2s',
          }}>
            <div style={{
              width: 16, height: 16, borderRadius: 8,
              background: '#fff', position: 'absolute', top: 2,
              left: item.disponible ? 18 : 2,
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </div>
          {item.disponible ? 'Disponible' : 'No disponible'}
        </button>
      </div>
    </div>
  )
}

// Dorso de la carta de plato (desktop, PLAN-SUPERFICIE S6) — reemplaza al
// panel lateral de 380px que abría "Ver y gestionar completo": ahora la
// carta se da vuelta ahí mismo, en la grilla, y muestra el resumen que antes
// vivía en ese panel (precio/FC, categoría+tags, estado, recetas de un
// vistazo). La edición real (recetas, packaging, precio) sigue viviendo en
// la pantalla completa — cabe un editor denso ahí, no en el dorso de una
// tarjeta — a un solo tap con "Editar completo".
export function PlatoCardBack({
  item, verCostos, onToggleDisponible, onEditarCompleto,
}: {
  item: CartaItemEnriquecido
  verCostos: boolean
  onToggleDisponible: () => void
  onEditarCompleto: () => void
}) {
  const hasFc = item.food_cost_pct != null && item.food_cost_pct > 0
  const hasMrg = item.margen_pct_computed != null

  return (
    <div style={{
      height: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-3)', borderRadius: 14,
      padding: '12px 13px 10px', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 8 }}>
        {item.nombre}
      </div>

      {verCostos && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '6px 10px', flex: 1 }}>
            <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase' }}>Precio</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>{fmtMoney(item.precio_venta)}</div>
          </div>
          {(hasMrg || hasFc) && (() => {
            const b = hasMrg ? marginBadge(item.margen_pct_computed ?? 0) : fcBadge(item.food_cost_pct ?? 0)
            const val = hasMrg ? item.margen_pct_computed ?? 0 : item.food_cost_pct ?? 0
            return (
              <div style={{ background: b.bg, borderRadius: 8, padding: '6px 10px', flex: 1 }}>
                <div style={{ fontSize: 9, color: b.text, opacity: 0.75, textTransform: 'uppercase' }}>{hasMrg ? 'Margen' : 'FC'}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: b.text }}>{val.toFixed(1)}%</div>
              </div>
            )
          })()}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        <span style={{ fontSize: 10, background: 'var(--bg)', color: 'var(--text-3)', padding: '2px 8px', borderRadius: 20 }}>{item.categoria}</span>
        {(item.tags ?? []).map(tag => (
          <span key={tag} style={{ fontSize: 10, background: '#eef2ff', color: 'var(--accent)', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{tag}</span>
        ))}
      </div>

      <button
        onClick={e => { e.stopPropagation(); onToggleDisponible() }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8,
          fontSize: 11, fontWeight: 600, color: item.disponible ? '#059669' : '#ef4444',
        }}
      >
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.disponible ? '#16a34a' : '#dc2626' }} />
        {item.disponible ? 'Disponible' : 'No disponible'}
        <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>· cambiar</span>
      </button>

      {(item.plato_recetas.length > 0 || item.receta) && (
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4 }}>
          Recetas
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', flex: 1 }}>
        {item.plato_recetas.map(pr => (
          <div key={pr.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-1)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--accent)', flexShrink: 0 }}>menu_book</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pr.receta?.nombre ?? '—'}</span>
            <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{pr.porciones} porc.</span>
          </div>
        ))}
        {item.receta && item.plato_recetas.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-1)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--accent)' }}>menu_book</span>
            {item.receta.nombre}
          </div>
        )}
      </div>

      <button
        onClick={e => { e.stopPropagation(); onEditarCompleto() }}
        style={{
          width: '100%', padding: '8px', borderRadius: 10, marginTop: 8,
          background: 'var(--navy)', color: '#fff', border: 'none',
          fontWeight: 600, fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>open_in_full</span>
        Editar completo
      </button>
    </div>
  )
}

// Forma de PlatoCard sin datos — ocupa el lugar real de la lista mientras
// carga (S5.3), en vez de un "Cargando..." centrado que salta a la grilla
// completa de golpe.
export function PlatoCardSkeleton() {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 14px 8px' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Skeleton width={52} height={52} radius={8} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 2 }}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="45%" height={11} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <Skeleton width={48} height={18} radius={6} />
        <Skeleton width={60} height={18} radius={6} />
      </div>
      <div style={{ height: 1, background: 'var(--border)', margin: '12px 0 8px' }} />
      <Skeleton width={80} height={12} style={{ marginBottom: 8 }} />
    </div>
  )
}
