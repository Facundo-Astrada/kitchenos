'use client'

interface ActionButtonProps {
  icon: string
  label: string
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  alwaysShowLabel?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
}

const VARIANT: Record<string, React.CSSProperties> = {
  primary: { background: '#f97316', color: '#fff', border: 'none' },
  secondary: { background: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.9)', border: '1px solid rgba(255,255,255,.2)' },
  danger: { background: '#ef4444', color: '#fff', border: 'none' },
}

export default function ActionButton({
  icon,
  label,
  onClick,
  variant = 'primary',
  alwaysShowLabel = false,
  disabled = false,
  type = 'button',
}: ActionButtonProps) {
  return (
    <>
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        title={label}
        aria-label={label}
        style={{
          ...VARIANT[variant],
          borderRadius: 10,
          padding: '6px 12px',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontWeight: 700,
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>
        <span className={alwaysShowLabel ? undefined : 'ab-label'}>{label}</span>
      </button>

      {!alwaysShowLabel && (
        <style>{`
          @media (max-width: 479px) {
            .ab-label { display: none; }
          }
        `}</style>
      )}
    </>
  )
}
