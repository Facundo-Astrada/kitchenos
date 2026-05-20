export default function PaseLoading() {
  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: '46px 16px 12px', flexShrink: 0 }}>
        <div className="animate-pulse" style={{ height: 20, width: '45%', background: 'rgba(255,255,255,.2)', borderRadius: 8, marginBottom: 4 }} />
        <div className="animate-pulse" style={{ height: 11, width: '30%', background: 'rgba(255,255,255,.12)', borderRadius: 6 }} />
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'hidden', padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {[false, true, false, true, false].map((isRight, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isRight ? 'flex-end' : 'flex-start', gap: 4 }}>
            {!isRight && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7 }}>
                <div className="animate-pulse" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div className="animate-pulse" style={{ height: 12, width: 55, background: 'var(--border)', borderRadius: 6 }} />
                  <div className="animate-pulse" style={{ height: 40, width: `${130 + i * 20}px`, background: 'var(--border)', borderRadius: '4px 12px 12px 12px' }} />
                </div>
              </div>
            )}
            {isRight && (
              <div className="animate-pulse" style={{ height: 40, width: `${110 + i * 15}px`, background: '#4361a022', borderRadius: '12px 4px 12px 12px' }} />
            )}
          </div>
        ))}
      </div>

      {/* Input area */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 8 }}>
        <div className="animate-pulse" style={{ flex: 1, height: 38, background: 'var(--border)', borderRadius: 20 }} />
        <div className="animate-pulse" style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />
      </div>
    </div>
  )
}
