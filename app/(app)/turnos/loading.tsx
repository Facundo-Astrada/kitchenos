// Skeleton de ruta de /turnos: header de una fila + KPIs + grilla persona × día.
export default function TurnosLoading() {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="skeleton-pulse" style={{ height: 22, width: 90, background: 'rgba(255,255,255,.2)', borderRadius: 8, marginRight: 10 }} />
        <div className="skeleton-pulse" style={{ height: 36, width: 36, background: 'rgba(255,255,255,.12)', borderRadius: 10 }} />
        <div className="skeleton-pulse" style={{ height: 36, width: 36, background: 'rgba(255,255,255,.12)', borderRadius: 10 }} />
        <div className="skeleton-pulse" style={{ height: 18, width: 140, background: 'rgba(255,255,255,.2)', borderRadius: 8 }} />
        <div style={{ flex: 1 }} />
        <div className="skeleton-pulse" style={{ height: 36, width: 120, background: 'rgba(255,255,255,.12)', borderRadius: 10 }} />
      </div>
      <div style={{ padding: '14px 20px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton-pulse" style={{ flex: '1 1 0', maxWidth: 270, height: 74, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }} />
          ))}
        </div>
        <div className="skeleton-pulse" style={{ height: 64, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: 6 }} />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="skeleton-pulse" style={{ height: 54, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }} />
        ))}
      </div>
    </div>
  )
}
