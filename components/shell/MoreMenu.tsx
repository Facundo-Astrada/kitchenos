'use client'

import Link from 'next/link'
import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { MODULO_CONFIG, MODULOS_POR_ROL, NAV_ITEMS } from '@/lib/constants'
import type { ModuloId } from '@/lib/constants'
import type { Rol } from '@/types'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { useAuth } from '@/lib/auth/context'
import { resetOnboardingDone } from '@/lib/hooks/useOnboardingProgress'
import ImportadorUniversal from '@/components/importador/ImportadorUniversal'

interface MoreMenuProps {
  rol: Rol
  onClose: () => void
}

export default function MoreMenu({ rol, onClose }: MoreMenuProps) {
  const { puedeVer, loading, moduloEnPerfil, isAdmin } = usePermisos()
  const { user } = useAuth()
  const [showImportador, setShowImportador] = useState(false)

  function abrirGuiaInicio() {
    resetOnboardingDone(user?.id)
    onClose()
  }

  const todosLosModulos = MODULOS_POR_ROL[rol]
  const modulosExtra = todosLosModulos.filter((m) => {
    if (NAV_ITEMS.includes(m as (typeof NAV_ITEMS)[number])) return false
    if (!loading) {
      const dbKey = m === 'home' ? 'inicio' : m
      return puedeVer(dbKey) && moduloEnPerfil(dbKey)
    }
    return true
  })

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/40 z-[150]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 z-[200] rounded-t-[20px] pb-[max(env(safe-area-inset-bottom),20px)]"
        style={{ background: 'var(--surface)' }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 380, mass: 0.8 }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
        </div>

        <div className="px-4 pb-2">

          {/* Kitchen Coach — asistente IA */}
          <Link
            href="/coach"
            onClick={onClose}
            className="w-full flex items-center gap-3 mb-3 rounded-[14px] px-4 py-3 border transition-colors active:scale-[.98]"
            style={{ background: 'rgba(249,115,22,.08)', border: '1px solid rgba(249,115,22,.28)', cursor: 'pointer' }}
          >
            <div className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0" style={{ background: '#f97316' }}>
              <span className="material-symbols-outlined text-white text-[22px]">chef_hat</span>
            </div>
            <div className="text-left">
              <div className="text-[13px] font-bold" style={{ color: 'var(--text-1)' }}>Kitchen Coach</div>
              <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>Preguntale lo que sea sobre tu cocina</div>
            </div>
            <span className="material-symbols-outlined ml-auto text-[18px]" style={{ color: 'var(--text-3)' }}>chevron_right</span>
          </Link>

          {/* Importar datos */}
          <button
            onClick={() => setShowImportador(true)}
            className="w-full flex items-center gap-3 mb-4 rounded-[14px] px-4 py-3 border transition-colors active:scale-[.98]"
            style={{ background: 'rgba(67,97,160,.07)', border: '1px solid rgba(67,97,160,.2)', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <div className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent)' }}>
              <span className="material-symbols-outlined text-white text-[22px]">upload_file</span>
            </div>
            <div className="text-left">
              <div className="text-[13px] font-bold" style={{ color: 'var(--text-1)' }}>Importar datos</div>
              <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>Excel · CSV · Word — la IA detecta el tipo</div>
            </div>
            <span className="material-symbols-outlined ml-auto text-[18px]" style={{ color: 'var(--text-3)' }}>chevron_right</span>
          </button>

          {/* Guía de inicio / Organización — solo admin. Único acceso fuera de
              Configuración a /onboarding y /implantacion (S7 sep 2026,
              feedback: "deberían tener más protagonismo"). */}
          {isAdmin && (
            <div className="flex gap-2 mb-4">
              <Link
                href="/onboarding"
                onClick={abrirGuiaInicio}
                className="flex-1 flex items-center gap-2 rounded-[14px] px-3 py-2.5 border transition-colors active:scale-[.98]"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer' }}
              >
                <span className="material-symbols-outlined text-[18px]" style={{ color: 'var(--navy)' }}>rocket_launch</span>
                <span className="text-[12px] font-bold" style={{ color: 'var(--text-1)' }}>Guía de inicio</span>
              </Link>
              <Link
                href="/implantacion"
                onClick={onClose}
                className="flex-1 flex items-center gap-2 rounded-[14px] px-3 py-2.5 border transition-colors active:scale-[.98]"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer' }}
              >
                <span className="material-symbols-outlined text-[18px]" style={{ color: 'var(--navy)' }}>landscape</span>
                <span className="text-[12px] font-bold" style={{ color: 'var(--text-1)' }}>Organización</span>
              </Link>
            </div>
          )}

          <p className="text-[10px] font-bold uppercase tracking-[.1em] mb-3" style={{ color: 'var(--text-2)' }}>
            Módulos
          </p>

          <div className="grid grid-cols-4 gap-3">
            {modulosExtra.map((moduloId, i) => {
              const modulo = MODULO_CONFIG[moduloId as ModuloId]
              if (!modulo) return null
              return (
                <motion.div
                  key={moduloId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.2 }}
                >
                  <Link
                    href={modulo.href}
                    onClick={onClose}
                    className="flex flex-col items-center gap-[6px] cursor-pointer"
                  >
                    <div
                      className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center transition-transform active:scale-[.92]"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--navy)' }}
                    >
                      <span className="material-symbols-outlined text-[24px]">{modulo.icon}</span>
                    </div>
                    <span className="text-[9px] font-semibold text-center leading-tight tracking-[.02em]" style={{ color: 'var(--navy)' }}>
                      {modulo.label.split(' ')[0]}
                    </span>
                  </Link>
                </motion.div>
              )
            })}
          </div>
        </div>
      </motion.div>
      <AnimatePresence>
        {showImportador && (
          <ImportadorUniversal onClose={() => { setShowImportador(false); onClose() }} />
        )}
      </AnimatePresence>
    </>
  )
}
