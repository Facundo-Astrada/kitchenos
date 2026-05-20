import { SkeletonHeader } from '@/components/ui/Skeleton'

export default function TareasLoading() {
  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <SkeletonHeader />

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 14px', overflowX: 'hidden', flexShrink: 0 }}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse" style={{ height: 30, width: 80, borderRadius: 20, background: 'var(--border)', flexShrink: 0 }} />
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'hidden', padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[...Array(2)].map((_, s) => (
          <div key={s}>
            {/* Section label */}
            <div className="animate-pulse" style={{ height: 10, width: '25%', background: 'var(--border)', borderRadius: 6, marginBottom: 10 }} />
            {/* Task cards */}
            {[...Array(3)].map((_, i) => (
              <div key={i} style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '11px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="animate-pulse" style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="animate-pulse" style={{ height: 13, width: `${45 + i * 12}%`, background: 'var(--border)', borderRadius: 6 }} />
                  <div className="animate-pulse" style={{ height: 10, width: '30%', background: 'var(--border)', borderRadius: 6 }} />
                </div>
                <div className="animate-pulse" style={{ height: 20, width: 50, background: 'var(--border)', borderRadius: 8, flexShrink: 0 }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
