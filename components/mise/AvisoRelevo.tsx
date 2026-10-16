'use client'

// AvisoRelevo — un renglón sobre de dónde viene lo que se está viendo en el Mise.
// Tres casos, todos del relevo entre turnos (ver lib/ops/turnos.ts: turnoVigente):
//  · la plaza está retenida en su turno porque todavía no entregó (el reloj ya
//    empezó el siguiente),
//  · la vista se movió a mano a un turno que no es el de la plaza,
//  · en la apertura, qué cierre se está recibiendo y cuándo se entregó.
import type { TurnoServicio } from '@/types'

const btn: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer',
  padding: '4px 10px', borderRadius: 99, fontFamily: 'inherit',
  fontSize: 11, fontWeight: 700, color: 'var(--text-1)',
}

export default function AvisoRelevo({
  tab, retenida, desvioManual, turnoActual, proximoTurno, turnoPrevio,
  turnoVigenteId, turnoManual, nombreTurno, entregaPreviaAt, onSetTurno,
}: {
  tab: string
  retenida: boolean
  desvioManual: boolean
  turnoActual: TurnoServicio | null
  proximoTurno: TurnoServicio | null
  turnoPrevio: { jornada: string; turnoId: string } | null
  turnoVigenteId: string | null
  turnoManual: string | null
  nombreTurno: (id: string) => string
  entregaPreviaAt: string | null
  onSetTurno: (id: string | null) => void
}) {
  const recibe = tab === 'apertura' && !!turnoPrevio
  if (!retenida && !desvioManual && !recibe) return null
  const alerta = retenida || desvioManual

  let texto: React.ReactNode = null
  if (retenida && proximoTurno) {
    texto = <><strong>{turnoActual?.nombre} sin entregar.</strong> Ya empezó {proximoTurno.nombre}; cerrá y entregá, o pasá directo.</>
  } else if (desvioManual && turnoManual && turnoVigenteId) {
    texto = <>Estás viendo <strong>{nombreTurno(turnoManual)}</strong>; la plaza está en <strong>{nombreTurno(turnoVigenteId)}</strong>.</>
  } else if (turnoPrevio) {
    const hora = entregaPreviaAt
      ? new Date(entregaPreviaAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      : null
    texto = <>
      Recibís el cierre de <strong>{nombreTurno(turnoPrevio.turnoId)} {turnoPrevio.jornada.slice(8, 10)}/{turnoPrevio.jornada.slice(5, 7)}</strong>
      {hora ? <> · entregado {hora}</> : <> · <strong>sin entregar</strong></>}
    </>
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '7px 10px', marginBottom: 8, borderRadius: 10, fontSize: 12, color: 'var(--text-2)',
      background: alerta ? 'rgba(245,158,11,.12)' : 'var(--bg)',
      border: `1px solid ${alerta ? 'rgba(245,158,11,.35)' : 'var(--border)'}`,
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 16, flexShrink: 0 }}>
        {alerta ? 'info' : 'move_to_inbox'}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{texto}</span>
      {retenida && proximoTurno && (
        <button onClick={() => onSetTurno(proximoTurno.id)} style={btn}>Pasar a {proximoTurno.nombre}</button>
      )}
      {desvioManual && turnoVigenteId && (
        <button onClick={() => onSetTurno(null)} style={btn}>Volver a {nombreTurno(turnoVigenteId)}</button>
      )}
    </div>
  )
}
