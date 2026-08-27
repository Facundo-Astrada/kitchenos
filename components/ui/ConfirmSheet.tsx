'use client'

import { createPortal } from 'react-dom'
import { SheetChrome } from '@/lib/ui/chrome'

// Confirmación en marca de la casa — nunca window.confirm() nativo en flujo
// de servicio (DESIGN.md §7/§10). Portal a body + backdrop navy + tarjeta
// centrada. Canónico (D0): un solo componente para toda confirmación
// destructiva de Registro Preparación (Mise, Producción, Salón/Config) — no
// reinventar el sheet por pantalla.
export function ConfirmSheet({
  icon, iconColor, title, body, confirmLabel, confirmColor, onConfirm, onCancel,
}: {
  icon: string
  iconColor: string
  title: string
  body: string
  confirmLabel: string
  confirmColor: string
  onConfirm: () => void
  onCancel: () => void
}) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <SheetChrome>
      <div
        onClick={onCancel}
        style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          className="toast-enter"
          style={{
            width: '100%', maxWidth: 340, background: 'var(--bg)', borderRadius: 18,
            padding: '22px 20px 16px', boxShadow: '0 20px 50px rgba(0,0,0,.35)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 34, color: iconColor, marginBottom: 4 }}>{icon}</span>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{title}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.4, marginBottom: 10 }}>{body}</div>
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <button
              onClick={onCancel}
              style={{
                background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit',
                flex: 1, padding: '12px 0', borderRadius: 12, fontSize: 13, fontWeight: 700, color: 'var(--text-2)',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              style={{
                background: confirmColor, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                flex: 1.3, padding: '12px 0', borderRadius: 12, color: '#fff', fontSize: 13, fontWeight: 700,
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </SheetChrome>,
    document.body,
  )
}
