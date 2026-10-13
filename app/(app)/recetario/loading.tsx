import { SkeletonHeader } from '@/components/ui/Skeleton'

export default function RecetarioLoading() {
  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Las pestañas viven dentro del header navy (page.tsx), no en una fila aparte. */}
      <SkeletonHeader hasSearch />

      {/* Chips de categoría */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '8px 14px', display: 'flex', gap: 8, flexShrink: 0 }}>
        {[64, 52, 58, 70, 60].map((w, i) => (
          <div key={i} className="animate-pulse" style={{ height: 30, width: w, background: 'var(--border)', borderRadius: 99 }} />
        ))}
      </div>

      {/* Recipe cards */}
      <div style={{ flex: 1, overflowY: 'hidden', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[...Array(7)].map((_, i) => (
          <div key={i} style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="animate-pulse" style={{ height: 15, width: `${50 + (i % 3) * 12}%`, background: 'var(--border)', borderRadius: 6 }} />
            <div className="animate-pulse" style={{ height: 11, width: '40%', background: 'var(--border)', borderRadius: 6 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
