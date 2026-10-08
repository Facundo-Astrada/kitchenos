'use client'

// Chip de filtro del header de Stock (Bajo, Pendiente, Sin precio, Inmóvil,
// Unidades): toca para filtrar, toca de nuevo para soltar. Vivía repetido
// inline en stock/ClientView.tsx, una variante por chip.
export function FiltroChip({ activo, onClick, rgb, label, count, countColor, icon, title, coachTarget }: {
  activo: boolean
  onClick: () => void
  rgb: string            // '245,158,11'
  label: string
  count?: number
  countColor?: string
  icon?: string
  title?: string
  coachTarget?: string
}) {
  return (
    <button
      data-coach-target={coachTarget}
      onClick={onClick}
      title={title}
      style={{ background: `rgba(${rgb},${activo ? .3 : .15})`, border: `1px solid rgba(${rgb},${activo ? .6 : .3})`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
    >
      {icon && <span className="material-symbols-outlined" style={{ fontSize: 14, color: countColor }}>{icon}</span>}
      {count != null && <span style={{ fontSize: 15, fontWeight: 700, color: countColor, fontFamily: "'DM Mono', monospace" }}>{count}</span>}
      <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</span>
    </button>
  )
}
