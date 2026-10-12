'use client'

// Anillo compacto de nivel de stock (stock actual vs mínimo) — reemplaza la
// mini-barra horizontal vieja en la tabla de Insumos: mismo dato, menos ancho
// (deja lugar a la columna Proveedor sin agrandar la tabla).

type Props = {
  stockActual: number
  stockMinimo: number | null | undefined
  bajo: boolean
}

export default function NivelRing({ stockActual, stockMinimo, bajo }: Props) {
  const min = stockMinimo ?? 0
  const pct = min > 0 ? Math.min(100, Math.round((stockActual / min) * 100)) : (stockActual > 0 ? 100 : 0)
  const color = bajo ? '#d97706' : '#10b981'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        background: min > 0 ? `conic-gradient(${color} 0% ${pct}%, var(--border) ${pct}% 100%)` : 'var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ width: 13, height: 13, borderRadius: '50%', background: 'var(--surface)' }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: 'var(--text-3)' }}>{min > 0 ? `${pct}%` : '—'}</span>
    </div>
  )
}
