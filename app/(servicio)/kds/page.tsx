'use client'

// Fase 1 — Esqueleto vacío.
// El KDS funcional (comandas en tiempo real, bump, recall) es Fase 2.
export default function KdsPage() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        opacity: 0.5,
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 64 }}>
        kitchen
      </span>
      <p style={{ fontSize: 18, fontWeight: 600 }}>Kitchen Display System</p>
      <p style={{ fontSize: 14 }}>Disponible en Fase 2</p>
    </div>
  )
}
