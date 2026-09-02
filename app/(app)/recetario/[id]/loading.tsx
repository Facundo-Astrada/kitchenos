// Compartido entre dos momentos (ver .claude/docs/ui.md § Skeletons de carga):
// Next.js monta este archivo como loading.tsx durante la transición de ruta,
// y RecetaDetallePage reusa el mismo componente para el fetch del hook ya
// montado (useRecetas todavía sin datos) — evita el parpadeo de pasar de este
// esqueleto a un "Cargando…" centrado antes de llegar al contenido real.
export function RecetaDetailSkeleton() {
  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header navy */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', flexShrink: 0, display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        <div className="animate-pulse" style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,.15)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="animate-pulse" style={{ height: 20, width: '60%', background: 'rgba(255,255,255,.2)', borderRadius: 8, marginBottom: 6 }} />
          <div className="animate-pulse" style={{ height: 11, width: '35%', background: 'rgba(255,255,255,.12)', borderRadius: 6 }} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'hidden', padding: '16px 16px 80px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Image */}
        <div className="animate-pulse" style={{ height: 200, background: 'var(--border)', borderRadius: 16 }} />

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 10 }}>
              <div className="animate-pulse" style={{ height: 10, width: '60%', background: 'var(--border)', borderRadius: 6, marginBottom: 7 }} />
              <div className="animate-pulse" style={{ height: 18, width: '45%', background: 'var(--border)', borderRadius: 6 }} />
            </div>
          ))}
        </div>

        {/* Ingredient list */}
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 14 }}>
          <div className="animate-pulse" style={{ height: 11, width: '35%', background: 'var(--border)', borderRadius: 6, marginBottom: 14 }} />
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none' }}>
              <div className="animate-pulse" style={{ height: 13, width: `${40 + i * 8}%`, background: 'var(--border)', borderRadius: 6 }} />
              <div className="animate-pulse" style={{ height: 13, width: '20%', background: 'var(--border)', borderRadius: 6 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function RecetaDetailLoading() {
  return <RecetaDetailSkeleton />
}
