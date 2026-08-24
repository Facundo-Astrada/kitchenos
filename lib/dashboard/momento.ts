'use client'

// lib/dashboard/momento.ts — "en qué momento del día estás" para el bloque
// Ahora del Dashboard (PLAN-SUPERFICIE S1). Deriva de datos que ya existen
// (turnos de servicio + avance del mise agregado) — no agrega tabla ni campo.
//
// Simplificación deliberada: no hay un estado "cierre" propio. El avance del
// mise que ve el Dashboard es agregado de TODAS las plazas (mismo criterio
// que ya usaba MiPlaza.tsx), así que no hay acá una señal fiable de "mi plaza
// ya entregó" sin una plaza asignada real por persona — eso vive en
// useCierresTurno, que sí es por plaza, y solo dentro del Mise
// (checklist/ClientView.tsx) se sabe qué plaza está mirando el usuario. Si en
// uso real hace falta acá, se suma ahí — no se inventa una señal global.

import { useEffect, useMemo, useState } from 'react'
import { useTurnosServicio } from '@/lib/hooks/useTurnosServicio'
import { proximoTurnoEnVentana, minutosDelDiaEnTz } from '@/lib/ops/turnos'
import type { Rol, TurnoServicio } from '@/types'

// Misma ventana que OPS/control-carta (app/(app)/operaciones/page.tsx,
// app/(app)/control-carta/page.tsx) — no reimplementar con otro número.
const VENTANA_PRE_APERTURA_MIN = 120

function minutosDeHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// A diferencia de turnoActivo() (lib/ops/turnos.ts) — que deliberadamente
// devuelve el último turno del día cuando ninguno arrancó todavía, porque
// sirve para ATRIBUIR un registro — esto contesta "hay servicio ahora mismo
// según el horario" y devuelve null en los huecos entre turnos.
function turnoEnCurso(ahora: Date, turnos: TurnoServicio[]): TurnoServicio | null {
  const nowMin = minutosDelDiaEnTz(ahora)
  for (const t of turnos) {
    const desde = minutosDeHHMM(t.desde)
    const hasta = minutosDeHHMM(t.hasta)
    const cruzaMedianoche = hasta <= desde
    const enCurso = cruzaMedianoche ? (nowMin >= desde || nowMin < hasta) : (nowMin >= desde && nowMin < hasta)
    if (enCurso) return t
  }
  return null
}

export type MomentoDia =
  | { tipo: 'apertura'; completados: number; total: number; href: string }
  | { tipo: 'controlCarta'; turnoNombre: string; href: string }
  | { tipo: 'servicio'; turnoNombre: string; href: string; label: string }
  | { tipo: 'fueraDeTurno' }

export function useMomentoDia(opts: {
  miseCompletados: number
  miseTotal: number
  rol: Rol
}): MomentoDia {
  const { turnosActivos } = useTurnosServicio()

  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const turnoVentana = useMemo(
    () => proximoTurnoEnVentana(ahora, turnosActivos, VENTANA_PRE_APERTURA_MIN),
    [ahora, turnosActivos],
  )
  const turnoActual = useMemo(() => turnoEnCurso(ahora, turnosActivos), [ahora, turnosActivos])

  return useMemo<MomentoDia>(() => {
    const misePendiente = opts.miseTotal > 0 && opts.miseCompletados < opts.miseTotal
    if (misePendiente) {
      return { tipo: 'apertura', completados: opts.miseCompletados, total: opts.miseTotal, href: '/operaciones?tab=mise' }
    }
    if (turnoVentana) {
      return { tipo: 'controlCarta', turnoNombre: turnoVentana.nombre, href: `/control-carta?turno=${turnoVentana.id}` }
    }
    if (turnoActual) {
      const esGestion = opts.rol === 'admin' || opts.rol === 'chef'
      return esGestion
        ? { tipo: 'servicio', turnoNombre: turnoActual.nombre, href: '/salon', label: 'Ir al salón' }
        : { tipo: 'servicio', turnoNombre: turnoActual.nombre, href: '/operaciones?tab=produccion', label: 'Ver producción' }
    }
    return { tipo: 'fueraDeTurno' }
  }, [opts.miseCompletados, opts.miseTotal, opts.rol, turnoVentana, turnoActual])
}
