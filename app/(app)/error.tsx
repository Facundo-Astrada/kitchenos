'use client'

import { useEffect } from 'react'
import { reportClientError } from '@/components/ErrorReporter'

// Error boundary de Next para las páginas bajo (app): captura errores de render
// de React que window.onerror no ve, muestra una pantalla amigable y reporta.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportClientError({
      message: error.message || 'Error de render',
      stack: error.stack,
      source: `react-error-boundary${error.digest ? ':' + error.digest : ''}`,
    })
  }, [error])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '24px 24px 120px', textAlign: 'center', background: 'var(--bg)' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-3)' }}>error</span>
      <h2 style={{ margin: '16px 0 8px', fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>Algo salió mal</h2>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)', maxWidth: 320 }}>
        Tuvimos un problema cargando esta pantalla. Probá de nuevo; si sigue pasando, avisanos.
      </p>
      <button
        onClick={() => reset()}
        style={{ marginTop: 24, padding: '12px 24px', borderRadius: 12, border: 'none', background: 'var(--navy)', color: '#fff', fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
      >
        Reintentar
      </button>
    </div>
  )
}
