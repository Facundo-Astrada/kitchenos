import { SkeletonHeader } from '@/components/ui/Skeleton'

export default function CalendarioLoading() {
  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <SkeletonHeader />

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', flexShrink: 0 }}>
        <div className="animate-pulse" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--border)' }} />
        <div className="animate-pulse" style={{ height: 14, width: '35%', background: 'var(--border)', borderRadius: 6 }} />
        <div className="animate-pulse" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--border)' }} />
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, padding: '0 14px 8px', flexShrink: 0 }}>
        {[...Array(7)].map((_, i) => (
          <div key={i} className="animate-pulse" style={{ height: 11, background: 'var(--border)', borderRadius: 6 }} />
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ flex: 1, overflowY: 'hidden', padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[...Array(5)].map((_, w) => (
          <div key={w} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {[...Array(7)].map((_, d) => (
              <div key={d} className="animate-pulse" style={{ height: 40, background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
