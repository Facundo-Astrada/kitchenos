import { SkeletonHeader } from '@/components/ui/Skeleton'

export default function CartaLoading() {
  return (
    <div className="scroll-body" style={{ background: 'var(--bg)' }}>
      <SkeletonHeader />

      <div style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {['Entrada', 'Principal', 'Postre'].map((_, s) => (
          <div key={s}>
            {/* Section label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div className="animate-pulse" style={{ height: 12, width: '25%', background: 'var(--border)', borderRadius: 6 }} />
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            {/* Menu items */}
            {[...Array(2)].map((_, i) => (
              <div key={i} style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '12px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="animate-pulse" style={{ height: 14, width: `${45 + i * 15}%`, background: 'var(--border)', borderRadius: 6 }} />
                  <div className="animate-pulse" style={{ height: 10, width: '30%', background: 'var(--border)', borderRadius: 6 }} />
                </div>
                <div className="animate-pulse" style={{ height: 18, width: 55, background: 'var(--border)', borderRadius: 8, flexShrink: 0, marginLeft: 12 }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
