'use client'

// Pass-through deliberado: la transición de pantalla real vive en
// app/(app)/layout.tsx (AnimatePresence keyeada por pathname, cubre TODAS
// las rutas, con o sin este wrapper). Animar de nuevo acá encima produce dos
// fades encimados. Se mantiene solo por compatibilidad con los imports
// existentes — no darle animación propia.
export default function PageTransition({ children }: { children: React.ReactNode }) {
  return <div style={{ height: '100%' }}>{children}</div>
}
