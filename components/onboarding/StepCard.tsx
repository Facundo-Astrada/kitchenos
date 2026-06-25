'use client'

import type { StepState } from '@/lib/hooks/useOnboardingProgress'

export type StepGroup = 'amber' | 'green' | 'blue' | 'purple'

const GROUP_COLOR: Record<StepGroup, string> = {
  amber: '#f59e0b',
  green: '#16a34a',
  blue: '#4361a0',
  purple: '#8b5cf6',
}

export interface StepCardProps {
  index: number
  total: number
  group: StepGroup
  icon: string
  title: string
  description: string
  state: StepState
  /** Línea de dato de interés (ej: "3 platos en la carta") */
  stat?: string
  /** Nota destacada opcional (ej: aclaración del mise) */
  note?: string
  /** Acción principal — navega al deeplink */
  onGo?: () => void
  goLabel?: string
  /** Marca el paso como hecho sin navegar */
  onMarkDone?: () => void
  /** Contenido extra (ej: selector de plaza, opciones de carga) */
  children?: React.ReactNode
}

/**
 * Card de un paso del onboarding. Nivel de módulo, SIN inputs con foco propio
 * dentro (los selectores/inputs viven en `children`, controlados desde el padre).
 */
export default function StepCard({
  index, total, group, icon, title, description, state,
  stat, note, onGo, goLabel = 'Ir a configurar', onMarkDone, children,
}: StepCardProps) {
  const accent = GROUP_COLOR[group]
  const done = state === 'done'

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: `4px solid ${accent}`,
        borderRadius: 14,
        padding: '16px 16px 14px',
        boxShadow: '0 2px 10px rgba(0,0,0,.05)',
        opacity: done ? 0.92 : 1,
      }}
    >
      {/* Encabezado de la card */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          style={{
            width: 40, height: 40, borderRadius: 11, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: done ? 'rgba(22,163,74,.12)' : `${accent}1f`,
            color: done ? '#16a34a' : accent,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
            {done ? 'check_circle' : icon}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Paso {index} de {total}
            </span>
            <StatusPill state={state} />
          </div>
          <h3 style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.25 }}>
            {title}
          </h3>
        </div>
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
        {description}
      </p>

      {stat && (
        <div
          style={{
            marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 9, padding: '6px 10px',
            fontSize: 12, fontWeight: 600, color: 'var(--text-1)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15, color: accent }}>insights</span>
          {stat}
        </div>
      )}

      {note && (
        <div
          style={{
            marginTop: 10, display: 'flex', gap: 8,
            background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.28)',
            borderRadius: 10, padding: '9px 11px',
            fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#f59e0b', flexShrink: 0 }}>lightbulb</span>
          <span>{note}</span>
        </div>
      )}

      {children && <div style={{ marginTop: 12 }}>{children}</div>}

      {/* Acciones del paso */}
      {(onGo || onMarkDone) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {onGo && (
            <button
              onClick={onGo}
              style={{
                flex: 1, minWidth: 150, padding: '11px 14px', borderRadius: 10, border: 'none',
                background: 'var(--navy)', color: '#fff', fontWeight: 700, fontSize: 13.5,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {goLabel}
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_forward</span>
            </button>
          )}
          {onMarkDone && !done && (
            <button
              onClick={onMarkDone}
              style={{
                padding: '11px 14px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--text-2)', fontWeight: 700, fontSize: 13.5,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>check</span>
              Ya lo tengo
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function StatusPill({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <span style={{ fontSize: 10.5, fontWeight: 800, color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
        Listo
      </span>
    )
  }
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>radio_button_unchecked</span>
      Pendiente
    </span>
  )
}
