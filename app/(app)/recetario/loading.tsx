import { SkeletonHeader } from '@/components/ui/Skeleton'

export default function RecetarioLoading() {
  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <SkeletonHeader hasSearch />

      {/* Tabs */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 14px', display: 'flex', gap: 0, flexShrink: 0 }}>
        {['Recetas', 'Ideas'].map((_, i) => (
          <div key={i} style={{ flex: 1, padding: '10px 0', display: 'flex', justifyContent: 'center' }}>
            <div className="animate-pulse" style={{ height: 13, width: 55, background: 'var(--border)', borderRadius: 6 }} />
          </div>
        ))}
      </div>

      {/* Recipe cards */}
      <div style={{ flex: 1, overflowY: 'hidden', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="animate-pulse" style={{ width: 52, height: 52, borderRadius: 10, background: 'var(--border)', flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div className="animate-pulse" style={{ height: 14, width: '65%', background: 'var(--border)', borderRadius: 6 }} />
              <div className="animate-pulse" style={{ height: 11, width: '45%', background: 'var(--border)', borderRadius: 6 }} />
            </div>
            <div className="animate-pulse" style={{ height: 22, width: 44, background: 'var(--border)', borderRadius: 8, flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
