'use client'

export function Skeleton({ className, style }: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={`animate-pulse rounded-md ${className ?? ''}`}
      style={{ background: 'var(--border)', ...style }}
    />
  )
}

export function SkeletonHeader({ hasSearch }: { hasSearch?: boolean }) {
  return (
    <div style={{ background: 'var(--navy)', padding: '46px 16px 14px', flexShrink: 0 }}>
      <div className="animate-pulse" style={{ height: 22, width: '55%', background: 'rgba(255,255,255,.2)', borderRadius: 8, marginBottom: 6 }} />
      <div className="animate-pulse" style={{ height: 12, width: '35%', background: 'rgba(255,255,255,.12)', borderRadius: 6 }} />
      {hasSearch && (
        <div className="animate-pulse" style={{ height: 34, background: 'rgba(255,255,255,.1)', borderRadius: 8, marginTop: 10 }} />
      )}
    </div>
  )
}

export function SkeletonCard({ height = 72 }: { height?: number }) {
  return (
    <div className="animate-pulse" style={{
      height,
      background: 'var(--surface)',
      borderRadius: 14,
      border: '1px solid var(--border)',
    }} />
  )
}

export function SkeletonRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
      <div className="animate-pulse" style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div className="animate-pulse" style={{ height: 13, width: '70%', background: 'var(--border)', borderRadius: 6 }} />
        <div className="animate-pulse" style={{ height: 10, width: '45%', background: 'var(--border)', borderRadius: 6 }} />
      </div>
    </div>
  )
}
