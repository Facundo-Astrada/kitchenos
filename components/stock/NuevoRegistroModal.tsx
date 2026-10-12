'use client'

// Modal mínimo "crear algo nuevo con solo un nombre" — fondo translúcido,
// tarjeta centrada. Usado desde el form de producto de Stock para categoría
// (con selector de color vía `extra`) y proveedor, sin cortar el flujo de
// cargar/ordenar stock para ir a otra pantalla. Compartido para no repetir
// el mismo bloque dos veces (ratchet de líneas, refactor-kos.md §4).

type Props = {
  titulo: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  onCancel: () => void
  onConfirm: () => void
  saving: boolean
  error?: string | null
  inputStyle: React.CSSProperties
  extra?: React.ReactNode
}

export default function NuevoRegistroModal({ titulo, placeholder, value, onChange, onCancel, onConfirm, saving, error, inputStyle, extra }: Props) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 16px' }}>{titulo}</h3>
        {error && (
          <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#ef4444', marginBottom: 10 }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            autoFocus
            style={inputStyle}
            onKeyDown={e => { if (e.key === 'Enter') onConfirm() }}
          />
          {extra}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={onCancel} style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 11, fontSize: 13, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
          <button onClick={onConfirm} disabled={saving || !value.trim()} style={{ flex: 1, background: 'var(--navy)', border: 'none', borderRadius: 10, padding: 11, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: !value.trim() ? 0.5 : 1 }}>
            {saving ? 'Guardando…' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}
