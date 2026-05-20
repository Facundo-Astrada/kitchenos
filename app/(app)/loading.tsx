import { SkeletonHeader, SkeletonRow } from '@/components/ui/Skeleton'

export default function DashboardLoading() {
  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <SkeletonHeader />

      <div style={{ flex: 1, padding: '14px 14px 0', overflowY: 'hidden', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 4 metric cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 14 }}>
              <div className="animate-pulse" style={{ height: 11, width: '55%', background: 'var(--border)', borderRadius: 6, marginBottom: 10 }} />
              <div className="animate-pulse" style={{ height: 22, width: '40%', background: 'var(--border)', borderRadius: 6 }} />
            </div>
          ))}
        </div>

        {/* Tareas section */}
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '12px 14px' }}>
          <div className="animate-pulse" style={{ height: 11, width: '30%', background: 'var(--border)', borderRadius: 6, marginBottom: 10 }} />
          {[...Array(3)].map((_, i) => <SkeletonRow key={i} />)}
        </div>

        {/* Módulos grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse" style={{ height: 70, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }} />
          ))}
        </div>
      </div>
    </div>
  )
}
