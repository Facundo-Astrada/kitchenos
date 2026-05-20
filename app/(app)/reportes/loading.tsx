import { SkeletonHeader } from '@/components/ui/Skeleton'

export default function ReportesLoading() {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <SkeletonHeader />

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 6, padding: '12px 14px' }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="animate-pulse" style={{ height: 28, flex: 1, borderRadius: 20, background: 'var(--border)' }} />
        ))}
      </div>

      <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 3 metric cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '12px 10px' }}>
              <div className="animate-pulse" style={{ height: 10, width: '70%', background: 'var(--border)', borderRadius: 6, marginBottom: 8 }} />
              <div className="animate-pulse" style={{ height: 20, width: '55%', background: 'var(--border)', borderRadius: 6 }} />
            </div>
          ))}
        </div>

        {/* Chart placeholder */}
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 16 }}>
          <div className="animate-pulse" style={{ height: 12, width: '35%', background: 'var(--border)', borderRadius: 6, marginBottom: 16 }} />
          <div className="animate-pulse" style={{ height: 200, background: 'var(--border)', borderRadius: 10 }} />
        </div>

        {/* Second chart */}
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 16 }}>
          <div className="animate-pulse" style={{ height: 12, width: '40%', background: 'var(--border)', borderRadius: 6, marginBottom: 16 }} />
          <div className="animate-pulse" style={{ height: 140, background: 'var(--border)', borderRadius: 10 }} />
        </div>
      </div>
    </div>
  )
}
