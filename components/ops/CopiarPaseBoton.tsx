'use client'

import { useMemo, useState } from 'react'
import { construirTextoPase, datosPaseDeTareas } from '@/lib/ops/textoPase'
import { plazaLabel } from '@/lib/constants'
import { PaseSheet } from './PaseSheet'
import type { Plaza, PlazaCustom, Tarea, PaseMensaje } from '@/types'

// Botón "Copiar pase" de la barra de cierre del Mise — arma el texto (ver
// lib/ops/textoPase.ts) solo al abrir el sheet, no en cada render: `tareas`
// cambia con cada tilde de toda la cocina.
//
// `open`/`onOpenChange` son opcionales: sin ellos el botón maneja su propio
// estado (uso en ProduccionBoard.tsx). ClientView (Mise) los pasa controlados
// para poder abrir el sheet solo al confirmar "Entregar plaza" — el pase se
// revisa y se manda como consecuencia de entregar, no como un paso aparte que
// el usuario puede copiar-pegar en WhatsApp y no volver a cerrar.
interface CopiarPaseBotonProps {
  plaza: Plaza
  fecha: string
  jornadaProxima: string
  tareas: Tarea[]
  notasHoy: PaseMensaje[]
  plazasCustom: PlazaCustom[]
  turnoNombre: string | null
  autor: string | null
  entregadoAt: string | null
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CopiarPaseBoton({
  plaza, fecha, jornadaProxima, tareas, notasHoy, plazasCustom, turnoNombre, autor, entregadoAt,
  open: openProp, onOpenChange,
}: CopiarPaseBotonProps) {
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const setOpen = onOpenChange ?? setOpenState

  const texto = useMemo(() => {
    if (!open) return ''
    return construirTextoPase({
      plazaNombre: plazaLabel(plaza, plazasCustom),
      turnoNombre, jornada: fecha,
      ...datosPaseDeTareas(tareas, plaza, jornadaProxima),
      notas: notasHoy, autor, entregadoAt,
    })
  }, [open, plaza, fecha, jornadaProxima, tareas, notasHoy, plazasCustom, turnoNombre, autor, entregadoAt])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Copiar pase"
        aria-label="Copiar pase"
        style={{
          flexShrink: 0, width: 36, height: 36, borderRadius: 10,
          border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)',
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>content_copy</span>
      </button>
      {open && (
        <PaseSheet
          titulo={`Pase — ${plazaLabel(plaza, plazasCustom)}`}
          textoInicial={texto}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
