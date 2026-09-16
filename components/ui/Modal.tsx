'use client'

// Modal — el patrón "centrado en desktop / sheet full-height en mobile" que
// ui.md pedía extraer desde hace cuatro copias (calendario/page.tsx x2,
// stock/ClientView.tsx, checklist/ClientView.tsx) y que ya se pagó dos veces
// el mismo bug al copiarse a mano: z-index por debajo del BottomNav y
// useSheetOpen() olvidado (el FAB del Coach quedaba flotando encima). Esta es
// la quinta vez que se toca el patrón — se extrae en vez de copiar de nuevo.
//
// Estructura fija en ui.md § "Modal centrado en desktop / full-screen en
// mobile": backdrop position:fixed,inset:0,zIndex:2000 con blur, card
// centrada (borderRadius:18, maxWidth configurable, maxHeight:'calc(100dvh -
// 48px)', overflowY:'auto'), cierre por click en backdrop + Escape.
//
// Se porta a document.body (sep 2026, encontrado probando PaseSheet.tsx):
// `position:fixed` deja de anclar contra el viewport si un ANCESTRO tiene un
// `transform` calculado, aunque sea la identidad — y una animación CSS con
// `forwards` (ej. `.toast-enter`, ver globals.css) deja ese transform puesto
// para siempre incluso después de terminar. Cualquier Modal montado dentro de
// una barra animada así quedaba encogido al tamaño de esa barra en vez de
// cubrir la pantalla. El portal lo saca del todo de esa cadena de ancestros.
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { useSheetOpenWhen } from '@/lib/ui/chrome'
import { useReducedMotion, DURATION, EASE_OUT, SPRING_SHEET } from '@/lib/ui/motion'

interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Ancho máximo en desktop, en px. Default 560 (el estándar de ui.md). */
  maxWidth?: number
  /**
   * Centrado como en desktop, incluso en mobile — para un paso que pide
   * revisión (ej. el texto del pase antes de mandarlo) y no es un drawer
   * casual que se descarta con un swipe hacia abajo.
   */
  center?: boolean
}

export function Modal({ open, onClose, children, maxWidth = 560, center = false }: ModalProps) {
  useSheetOpenWhen(open)
  const isDesktop = useIsDesktop()
  const centrado = isDesktop || center
  const reducedMotion = useReducedMotion()
  // document no existe en SSR — el portal solo puede armarse del lado del
  // cliente, ya montado.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', flexDirection: 'column',
            justifyContent: centrado ? 'center' : 'flex-end', alignItems: 'center',
            padding: centrado ? 24 : 0,
          }}
          onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : DURATION.base }}
            style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)',
              backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            }}
            onClick={onClose}
          />
          <motion.div
            initial={centrado ? { opacity: 0, scale: 0.96 } : { y: '100%' }}
            animate={centrado ? { opacity: 1, scale: 1 } : { y: 0 }}
            exit={centrado ? { opacity: 0, scale: 0.96 } : { y: '100%' }}
            transition={reducedMotion ? { duration: 0 } : centrado ? { duration: DURATION.enter, ease: EASE_OUT } : SPRING_SHEET}
            style={{
              position: 'relative', background: 'var(--surface)',
              borderRadius: centrado ? 18 : '18px 18px 0 0',
              width: centrado ? `min(${maxWidth}px, 92vw)` : '100%',
              maxHeight: centrado ? 'calc(100dvh - 48px)' : '92dvh',
              overflowY: 'auto',
              boxShadow: centrado ? '0 20px 60px rgba(0,0,0,.35)' : '0 -8px 40px rgba(0,0,0,.3)',
              border: centrado ? '1px solid var(--border)' : 'none',
            }}
            onClick={e => e.stopPropagation()}
          >
            {!centrado && (
              <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '10px auto 0' }} />
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
