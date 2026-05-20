'use client'

import { ReactNode } from 'react'
import { useRouter } from 'next/navigation'

interface PageHeaderProps {
  title: string
  icon?: string
  subtitle?: string
  actions?: ReactNode
  below?: ReactNode
  onBack?: () => void
  paddingTop?: number
}

export default function PageHeader({ title, icon, subtitle, actions, below, onBack, paddingTop = 46 }: PageHeaderProps) {
  const router = useRouter()

  return (
    <div style={{ background: 'var(--navy)', padding: `${paddingTop}px 1rem 0`, flexShrink: 0 }}>
      <div className="ph-row" style={{ paddingBottom: below ? '0.75rem' : '1rem' }}>
        <div className="ph-title">
          {onBack !== undefined && (
            <button
              onClick={() => { if (onBack) onBack(); else router.back() }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', flexShrink: 0 }}
              aria-label="Volver"
            >
              <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.7)', fontSize: 22 }}>arrow_back</span>
            </button>
          )}
          {icon && (
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'rgba(255,255,255,.6)', flexShrink: 0 }}>{icon}</span>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>

        {actions && (
          <div className="ph-actions">
            {actions}
          </div>
        )}
      </div>

      {below && (
        <div style={{ paddingBottom: '0.75rem' }}>
          {below}
        </div>
      )}

      <style>{`
        .ph-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.75rem;
        }
        .ph-title {
          display: flex;
          flex: 1;
          min-width: 0;
          align-items: center;
          gap: 10px;
        }
        .ph-actions {
          display: flex;
          gap: 6px;
          align-items: center;
        }
        @media (max-width: 479px) {
          .ph-actions {
            width: 100%;
            justify-content: flex-end;
          }
        }
      `}</style>
    </div>
  )
}
