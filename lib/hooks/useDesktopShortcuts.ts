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
