export default function PedidoDiarioLoading() {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
        <div className="animate-pulse" style={{ height: 22, width: '45%', background: 'rgba(255,255,255,.2)', borderRadius: 8 }} />
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="animate-pulse" style={{ height: 64, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }} />
        ))}
      </div>
    </div>
  )
}
