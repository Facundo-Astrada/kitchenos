'use client'

// Layout de la vista de servicio (Salón + KDS)
// Reglas: pantalla completa, fondo oscuro, sin BottomNav, sin Coach FAB.
// Ver .claude/docs/ui.md § "Vista de servicio"
export default function ServicioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#111',
        color: '#fff',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}
    </div>
  )
}
