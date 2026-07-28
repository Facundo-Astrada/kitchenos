'use client'

export function SwitchRow({ checked, onChange, label, sub, color = '#4361a0', icon }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  sub: string
  color?: string
  icon: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', padding: '9px 0', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 20, color: checked ? color : 'var(--text-3)', flexShrink: 0, transition: 'color .15s ease-out' }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{label}</span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{sub}</span>
      </span>
      <span aria-hidden style={{ flexShrink: 0, width: 40, height: 24, borderRadius: 12, background: checked ? color : 'var(--border)', position: 'relative', transition: 'background .15s ease-out' }}>
        <span style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.3)', transition: 'left .18s cubic-bezier(0.16, 1, 0.3, 1)' }} />
      </span>
    </button>
  )
}
