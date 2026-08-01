'use client'

export type OpsToggleValue = 'menu' | 'carta' | 'evento' | 'todo'

interface OpsToggleProps {
  value: OpsToggleValue
  onChange: (m: OpsToggleValue) => void
}

export function OpsToggle({ value, onChange }: OpsToggleProps) {
  return (
    <div style={{
      display: 'flex',
      background: 'rgba(255,255,255,.12)',
      borderRadius: 999,
      padding: 2,
      gap: 0,
    }}>
      {(['menu', 'carta', 'evento', 'todo'] as OpsToggleValue[]).map((m) => {
        const active = value === m
        const esTodo = m === 'todo'
        return (
          <button
            key={m}
            onClick={() => onChange(m)}
            style={{
              // flex:1 solo tiene efecto cuando el wrapper fuerza width:100%
              // (mobile, ver .ops-toggle-wrap en globals.css) — en desktop el
              // contenedor no tiene espacio libre para repartir y esto es un
              // no-op, así que es seguro dejarlo siempre activo.
              flex: 1, minWidth: 0,
              padding: '5px 8px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              background: active ? (esTodo ? '#f59e0b' : '#fff') : 'transparent',
              color: active ? (esTodo ? '#fff' : 'var(--navy)') : (esTodo ? '#fbbf24' : 'rgba(255,255,255,.55)'),
              transition: 'all .15s',
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>
              {m === 'menu' ? 'Menú' : m === 'evento' ? 'Evento' : m === 'todo' ? 'Todo' : 'Carta'}
            </span>
            {active && (
              <span style={{ fontSize: 8, fontWeight: 600, opacity: esTodo ? 0.85 : 0.5, letterSpacing: '.03em', lineHeight: 1.25, textAlign: 'center' }}>
                {m === 'carta' ? 'Por prioridad' : m === 'todo' ? 'Carta+Menú+Evento' : 'Por categoría'}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
