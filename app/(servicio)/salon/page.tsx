'use client'

// Fase 1 — Esqueleto vacío.
// El mapa operativo de mesas + KDS es Fase 2 (walking skeleton).
export default function SalonPage() {
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
        table_restaurant
      </span>
      <p style={{ fontSize: 18, fontWeight: 600 }}>Vista de Salón</p>
      <p style={{ fontSize: 14 }}>Disponible en Fase 2</p>
    </div>
  )
}
