import { SkeletonHeader } from '@/components/ui/Skeleton'

export default function FacturasLoading() {
  return (
    <div className="scroll-body" style={{ background: 'var(--bg)' }}>
      <SkeletonHeader />

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 14px', overflowX: 'hidden' }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="animate-pulse" style={{ height: 28, width: 70, borderRadius: 20, background: 'var(--border)', flexShrink: 0 }} />
        ))}
      </div>

      <div style={{ padding: '0 14px' }}>
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ padding: '14px 16px', borderBottom: i < 4 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="animate-pulse" style={{ height: 14, width: `${100 + i * 15}px`, background: 'var(--border)', borderRadius: 6 }} />
                <div className="animate-pulse" style={{ height: 10, width: 80, background: 'var(--border)', borderRadius: 6 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                <div className="animate-pulse" style={{ height: 14, width: 60, background: 'var(--border)', borderRadius: 6 }} />
                <div className="animate-pulse" style={{ height: 18, width: 55, background: 'var(--border)', borderRadius: 20 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
