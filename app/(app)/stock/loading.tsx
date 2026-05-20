import { SkeletonHeader } from '@/components/ui/Skeleton'

export default function StockLoading() {
  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <SkeletonHeader hasSearch />

      {/* Category filter row */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', overflowX: 'hidden', flexShrink: 0 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="animate-pulse" style={{ height: 28, width: 65, borderRadius: 20, background: 'var(--border)', flexShrink: 0 }} />
        ))}
      </div>

      {/* Product list */}
      <div style={{ flex: 1, overflowY: 'hidden', padding: '0 14px' }}>
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
              <div className="animate-pulse" style={{ height: 14, width: `${40 + (i * 11) % 35}%`, background: 'var(--border)', borderRadius: 6 }} />
              <div className="animate-pulse" style={{ height: 10, width: '28%', background: 'var(--border)', borderRadius: 6 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
              <div className="animate-pulse" style={{ height: 14, width: 50, background: 'var(--border)', borderRadius: 6 }} />
              <div className="animate-pulse" style={{ height: 10, width: 30, background: 'var(--border)', borderRadius: 20 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
