export default function PresupuestoLoading() {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: 'var(--header-top) 16px 14px' }}>
        <div className="animate-pulse" style={{ height: 24, width: '35%', background: 'var(--border)', borderRadius: 8, marginBottom: 12 }} />
        <div className="animate-pulse" style={{ height: 34, width: '100%', background: 'var(--border)', borderRadius: 13 }} />
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 900, margin: '0 auto' }}>
        <div className="animate-pulse" style={{ height: 180, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }} />
        <div className="animate-pulse" style={{ height: 220, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }} />
        <div className="animate-pulse" style={{ height: 160, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }} />
      </div>
    </div>
  )
}
