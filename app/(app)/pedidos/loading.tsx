import { SkeletonHeader } from '@/components/ui/Skeleton'

export default function PedidosLoading() {
  return (
    <div className="scroll-body" style={{ background: 'var(--bg)' }}>
      <SkeletonHeader />

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 14px', overflowX: 'hidden' }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="animate-pulse" style={{ height: 28, width: 70, borderRadius: 20, background: 'var(--border)', flexShrink: 0 }} />
        ))}
      </div>

      <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <div className="animate-pulse" style={{ height: 14, width: '50%', background: 'var(--border)', borderRadius: 6 }} />
              <div className="animate-pulse" style={{ height: 20, width: 60, background: 'var(--border)', borderRadius: 20 }} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="animate-pulse" style={{ height: 11, width: '30%', background: 'var(--border)', borderRadius: 6 }} />
              <div className="animate-pulse" style={{ height: 11, width: '25%', background: 'var(--border)', borderRadius: 6 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
