import { SkeletonHeader } from '@/components/ui/Skeleton'

export default function HaccpLoading() {
  return (
    <div className="scroll-body" style={{ background: 'var(--bg)' }}>
      <SkeletonHeader />

      <div style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[...Array(3)].map((_, s) => (
          <div key={s} style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {/* Section header */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="animate-pulse" style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--border)' }} />
              <div className="animate-pulse" style={{ height: 13, width: '45%', background: 'var(--border)', borderRadius: 6 }} />
            </div>
            {/* Checklist items */}
            {[...Array(3)].map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: i < 2 ? '1px solid var(--border)' : 'none' }}>
                <div className="animate-pulse" style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--border)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="animate-pulse" style={{ height: 13, width: `${50 + i * 10}%`, background: 'var(--border)', borderRadius: 6 }} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
