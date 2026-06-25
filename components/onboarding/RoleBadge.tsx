'use client'

import type { FlujoOnboarding } from '@/lib/hooks/useUserRol'

const LABELS: Record<FlujoOnboarding, { texto: string; icono: string }> = {
  admin: { texto: 'Administrador', icono: 'admin_panel_settings' },
  encargado: { texto: 'Encargado', icono: 'supervisor_account' },
  cocinero: { texto: 'Cocina', icono: 'restaurant' },
}

/**
 * Badge del rol en el header del onboarding. Nivel de módulo (sin estado interno).
 */
export default function RoleBadge({ flujo }: { flujo: FlujoOnboarding }) {
  const { texto, icono } = LABELS[flujo]
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: 'rgba(255,255,255,.16)', color: '#fff',
        borderRadius: 999, padding: '3px 10px 3px 8px',
        fontSize: 11, fontWeight: 700, letterSpacing: '.02em',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{icono}</span>
      {texto}
    </span>
  )
}
