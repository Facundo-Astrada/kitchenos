import { SkeletonHeader } from '@/components/ui/Skeleton'

export default function ConfiguracionLoading() {
  return (
    <div className="scroll-body" style={{ background: 'var(--bg)' }}>
      <SkeletonHeader />

      <div style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Profile card */}
        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '16px 14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div className="animate-pulse" style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div className="animate-pulse" style={{ height: 16, width: '55%', background: 'var(--border)', borderRadius: 6 }} />
            <div className="animate-pulse" style={{ height: 11, width: '35%', background: 'var(--border)', borderRadius: 6 }} />
          </div>
        </div>

        {/* Settings options */}
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="animate-pulse" style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--border)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="animate-pulse" style={{ height: 13, width: `${40 + i * 8}%`, background: 'var(--border)', borderRadius: 6 }} />
            </div>
            <div className="animate-pulse" style={{ width: 20, height: 20, borderRadius: 4, background: 'var(--border)', flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
