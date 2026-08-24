'use client'
import { useEffect, useState } from 'react'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'

const SHORTCUTS = [
  { key: 'Ctrl+K', label: 'Paleta de comandos — ir a cualquier pantalla o acción' },
  { key: '/', label: 'Buscar en la pantalla actual' },
  { key: 'N', label: 'Nuevo ítem (producto, receta, tarea…)' },
  { key: 'Ctrl+S', label: 'Guardar formulario activo' },
  { key: 'Ctrl+V', label: 'Pegar desde Excel (en Stock)' },
  { key: 'Esc', label: 'Cerrar modal / panel' },
  { key: '?', label: 'Mostrar / ocultar esta pantalla' },
]

export default function ShortcutsHelp() {
  const isDesktop = useIsDesktop()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!isDesktop) return
    function toggle() { setOpen(v => !v) }
    function close() { setOpen(false) }
    document.addEventListener('kos:shortcuts-help', toggle)
    document.addEventListener('kos:close-modal', close)
    return () => {
      document.removeEventListener('kos:shortcuts-help', toggle)
      document.removeEventListener('kos:close-modal', close)
    }
  }, [isDesktop])

  if (!isDesktop || !open) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface)', borderRadius: 16, padding: '24px 28px', minWidth: 340, boxShadow: '0 8px 40px rgba(0,0,0,.4)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>
            Atajos de teclado
          </h2>
          <button
            onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', display: 'flex' }}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {SHORTCUTS.map(s => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{s.label}</span>
              <kbd style={{
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '3px 9px',
                fontSize: 11, fontFamily: "'DM Mono', monospace",
                color: 'var(--text-1)', fontWeight: 700,
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <p style={{ margin: '20px 0 0', fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
          Presioná <kbd style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace', fontSize: 10 }}>?</kbd> para abrir y cerrar
        </p>
      </div>
    </div>
  )
}
