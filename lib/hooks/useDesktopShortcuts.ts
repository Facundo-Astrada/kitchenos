'use client'
import { useEffect } from 'react'
import { useIsDesktop } from './useIsDesktop'

export function useDesktopShortcuts() {
  const isDesktop = useIsDesktop()

  useEffect(() => {
    if (!isDesktop) return

    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      const inInput =
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) ||
        (e.target as HTMLElement).isContentEditable

      // Ctrl/Cmd+S — guardar (funciona dentro de inputs también)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        document.querySelector<HTMLButtonElement>('[data-shortcut="save"]')?.click()
        return
      }

      // Ctrl/Cmd+K — paleta de comandos (también dentro de inputs, como Cmd+S:
      // Ctrl/Cmd+B — plegar la barra lateral (PLAN-ACCESO-Y-USO B7.1).
      // Convención de editores (VS Code y compañía) para lo mismo.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault()
        document.dispatchEvent(new CustomEvent('kos:toggle-sidebar'))
        return
      }

      // es el atajo que se usa DESDE cualquier lado, no solo en pantallas sin foco)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        document.dispatchEvent(new CustomEvent('kos:command-palette'))
        return
      }

      if (inInput) return

      // / — enfocar búsqueda
      if (e.key === '/') {
        e.preventDefault()
        const input = document.querySelector<HTMLInputElement>(
          'input[placeholder*="uscar"], input[placeholder*="USCAR"], input[type="search"]'
        )
        input?.focus()
        return
      }

      // N — nuevo ítem
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        document.querySelector<HTMLButtonElement>('[data-shortcut="new"]')?.click()
        return
      }

      // ? — panel de atajos
      if (e.key === '?') {
        document.dispatchEvent(new CustomEvent('kos:shortcuts-help'))
        return
      }

      // Esc — cerrar modal activo
      if (e.key === 'Escape') {
        document.dispatchEvent(new CustomEvent('kos:close-modal'))
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isDesktop])
}
