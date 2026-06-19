export default function TurnosLoading() {
  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', flexShrink: 0 }}>
        <div className="animate-pulse" style={{ height: 22, width: '40%', background: 'rgba(255,255,255,.2)', borderRadius: 8, marginBottom: 10 }} />
        {/* Tab row */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,.12)', borderRadius: 10, padding: 3 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse" style={{ flex: 1, height: 30, background: i === 1 ? 'rgba(255,255,255,.25)' : 'transparent', borderRadius: 8 }} />
          ))}
        </div>
      </div>

      {/* Week navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div className="animate-pulse" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--border)' }} />
        <div className="animate-pulse" style={{ height: 13, width: '40%', background: 'var(--border)', borderRadius: 6 }} />
        <div className="animate-pulse" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--border)' }} />
      </div>

      {/* Team rows */}
      <div style={{ flex: 1, overflowY: 'hidden', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[...Array(4)].map((_, r) => (
          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Avatar + name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, width: 80, flexShrink: 0 }}>
              <div className="animate-pulse" style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />
              <div className="animate-pulse" style={{ height: 11, flex: 1, background: 'var(--border)', borderRadius: 6 }} />
            </div>
            {/* 7 day cells */}
            {[...Array(7)].map((_, d) => (
              <div key={d} className="animate-pulse" style={{ flex: 1, height: 34, borderRadius: 8, background: d % 3 === 0 ? '#4361a022' : 'var(--border)' }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
