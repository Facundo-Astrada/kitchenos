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
              // `flex:1` implica `flex-basis:0`: los cuatro botones quedaban del
              // mismo ancho ignorando su contenido, y el activo — el único que
              // muestra subtítulo — se derramaba fuera del pill ("Carta+Menú+
              // Evento" pisando el navy). Con basis `auto` el ancho parte del
              // contenido y recién ahí reparte el sobrante, que es lo que hace
              // falta cuando el wrapper fuerza width:100% en mobile
              // (ver .ops-toggle-wrap en globals.css).
              flex: '1 1 auto', minWidth: 0,
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
              // Red de contención para pantallas muy angostas, donde minWidth:0
              // todavía permite encoger por debajo del contenido: recorta dentro
              // del pill en vez de derramar sobre el navy.
              overflow: 'hidden',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>
              {m === 'menu' ? 'Menú' : m === 'evento' ? 'Evento' : m === 'todo' ? 'Todo' : 'Carta'}
            </span>
            {active && (
              <span style={{
                fontSize: 8, fontWeight: 600, opacity: esTodo ? 0.85 : 0.5,
                letterSpacing: '.03em', lineHeight: 1.25, textAlign: 'center',
                maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {m === 'carta' ? 'Por plaza' : m === 'todo' ? 'Carta+Menú+Evento' : 'Por categoría'}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
