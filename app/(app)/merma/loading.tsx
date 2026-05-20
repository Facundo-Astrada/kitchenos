export default function MermaLoading() {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '46px 16px 14px' }}>
        <div className="animate-pulse" style={{ height: 24, width: '35%', background: 'var(--border)', borderRadius: 8, marginBottom: 6 }} />
        <div className="animate-pulse" style={{ height: 12, width: '55%', background: 'var(--border)', borderRadius: 6 }} />
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 10, padding: '0 14px 14px', overflowX: 'hidden' }}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse" style={{ flex: 1, height: 70, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }} />
        ))}
      </div>

      {/* Table */}
      <div style={{ padding: '0 14px' }}>
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, padding: '10px 14px', borderBottom: '2px solid var(--border)' }}>
            {['55%', '20%', '20%'].map((w, i) => (
              <div key={i} className="animate-pulse" style={{ height: 10, width: w, background: 'var(--border)', borderRadius: 6 }} />
            ))}
          </div>
          {/* Table rows */}
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, padding: '12px 14px', borderBottom: i < 4 ? '1px solid var(--border)' : 'none' }}>
              <div className="animate-pulse" style={{ height: 13, width: `${50 + (i * 7) % 30}%`, background: 'var(--border)', borderRadius: 6 }} />
              <div className="animate-pulse" style={{ height: 13, width: 40, background: 'var(--border)', borderRadius: 6 }} />
              <div className="animate-pulse" style={{ height: 13, width: 50, background: 'var(--border)', borderRadius: 6 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
