'use client'

// Los tres modales chicos de Turnos: avisar la semana al equipo, las horas
// del mes y los horarios habituales de cada tipo de turno.

import { useEffect, useState } from 'react'
import { Modal, Avatar } from '@/components/ui'
import { MESES, toDateStr } from '@/lib/calendario/fechas'
import { TURNO_CONFIG, TIPOS_DE_TRABAJO, normalizarTipo, esTrabajo, type HorariosTurno } from '@/lib/turnos/tipos'
import { duracionHoras, fmtHoras, horasDeTurno } from '@/lib/turnos/planilla'
import type { Turno } from '@/lib/hooks/useTurnos'
import { fieldStyle, tituloSeccion, type PersonaPlanilla } from './shared'

const cabecera = (titulo: string, sub: string | null, onClose: () => void) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)' }}>{titulo}</div>
      {sub && <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
    </div>
    <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', color: 'var(--text-3)' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
    </button>
  </div>
)

const cuerpoModal: React.CSSProperties = {
  padding: '20px 18px', paddingBottom: 'max(env(safe-area-inset-bottom, 18px), 18px)', display: 'flex', flexDirection: 'column', gap: 14,
}

const btnPrimario: React.CSSProperties = {
  flex: 2, padding: '13px 12px', borderRadius: 12, border: 'none', background: 'var(--navy)', color: '#fff',
  fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
}
const btnSecundario: React.CSSProperties = {
  flex: 1, padding: '13px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)',
  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}

/* ─── Avisar al equipo ─── */

export interface DestinoAvisoTurnos { persona: PersonaPlanilla; resumen: string }

export function AvisarModal({ open, etiqueta, destinos, sinUsuario, sinCambios, onClose, onConfirmar }: {
  open: boolean
  /** "12 – 18 oct" */
  etiqueta: string
  destinos: DestinoAvisoTurnos[]
  /** Tienen turnos pero todavía no tienen usuario en la app: no les llega. */
  sinUsuario: string[]
  /** Ya recibieron esta misma semana y no les cambió nada. */
  sinCambios: number
  onClose: () => void
  onConfirmar: () => Promise<void>
}) {
  const [enviando, setEnviando] = useState(false)
  const confirmar = async () => {
    setEnviando(true)
    try { await onConfirmar() } finally { setEnviando(false) }
  }
  return (
    <Modal open={open} onClose={onClose} maxWidth={460}>
      <div style={cuerpoModal}>
        {cabecera('Avisar los turnos al equipo', `Semana del ${etiqueta}. A cada persona le llega un solo aviso con su semana, a la campana y al celular si lo tiene activado.`, onClose)}

        {destinos.length === 0 ? (
          <div style={{ padding: 14, borderRadius: 12, border: '1px dashed var(--border)', fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
            {sinCambios > 0 ? 'Nadie tiene cambios desde el último aviso.'
              : sinUsuario.length > 0 ? 'Quienes tienen turnos esta semana todavía no tienen usuario en la app.'
              : 'No hay turnos cargados para avisar esta semana.'}
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', maxHeight: '46vh', overflowY: 'auto', background: 'var(--surface)' }}>
            {destinos.map((d, i) => (
              <div key={d.persona.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <Avatar name={d.persona.nombre} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' }}>{d.persona.nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45, marginTop: 1 }}>{d.resumen}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {(sinUsuario.length > 0 || (sinCambios > 0 && destinos.length > 0)) && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
            {sinCambios > 0 && destinos.length > 0 && <div>{sinCambios} sin cambios desde el último aviso: no se les repite.</div>}
            {sinUsuario.length > 0 && <div>Sin usuario en la app (no les llega): {sinUsuario.join(', ')}.</div>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose} style={btnSecundario}>Cancelar</button>
          <button type="button" onClick={confirmar} disabled={destinos.length === 0 || enviando}
            style={{ ...btnPrimario, background: destinos.length ? 'var(--navy)' : 'var(--border)', cursor: destinos.length ? 'pointer' : 'default', opacity: enviando ? 0.6 : 1 }}>
            {enviando ? 'Avisando…' : destinos.length ? `Avisar a ${destinos.length}` : 'Avisar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ─── Horas del mes ─── */

export function HorasMesModal({ open, mes, anio, personas, horarios, verCostos, cargar, onClose }: {
  open: boolean
  mes: number
  anio: number
  personas: PersonaPlanilla[]
  horarios: HorariosTurno
  verCostos: boolean
  cargar: (desde: string, hasta: string) => Promise<Turno[]>
  onClose: () => void
}) {
  const [turnos, setTurnos] = useState<Turno[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!open) return
    let vivo = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTurnos(null); setError(false)
    cargar(toDateStr(anio, mes, 1), toDateStr(anio, mes, new Date(anio, mes, 0).getDate()))
      .then(d => { if (vivo) setTurnos(d) })
      .catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [open, mes, anio, cargar])

  const filas = personas.map(p => {
    const mios = (turnos ?? []).filter(t => t.miembro_id === p.id)
    const horas = mios.reduce((s, t) => s + horasDeTurno(t, horarios), 0)
    const dias = mios.filter(t => esTrabajo(normalizarTipo(t.turno_tipo))).length
    const francos = mios.filter(t => normalizarTipo(t.turno_tipo) === 'franco').length
    return { p, horas, dias, francos, costo: p.costoHora != null ? horas * p.costoHora : null }
  })
  const totalHoras = filas.reduce((s, f) => s + f.horas, 0)
  const conCosto = verCostos && filas.some(f => f.costo != null)
  const totalCosto = filas.reduce((s, f) => s + (f.costo ?? 0), 0)
  const fmtPesos = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
  const cols = conCosto ? 'minmax(0,1fr) 54px 54px 62px 96px' : 'minmax(0,1fr) 54px 54px 62px'
  const num: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  return (
    <Modal open={open} onClose={onClose} maxWidth={conCosto ? 560 : 480}>
      <div style={cuerpoModal}>
        {cabecera(`Horas planificadas · ${MESES[mes - 1]} ${anio}`, 'Sale de la planilla de turnos, no del fichaje.', onClose)}
        {error ? (
          <div role="alert" style={{ padding: 12, borderRadius: 10, background: 'var(--red-bg)', color: 'var(--red-fg)', fontSize: 13 }}>No se pudieron cargar las horas del mes.</div>
        ) : turnos === null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton-pulse" style={{ height: 38, borderRadius: 8, background: 'var(--border)' }} />)}
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)', maxHeight: '56vh', overflowY: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '9px 12px', ...tituloSeccion, fontSize: 10.5, position: 'sticky', top: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
              <span>Persona</span><span style={num}>Días</span><span style={num}>Francos</span><span style={num}>Horas</span>{conCosto && <span style={num}>Costo est.</span>}
            </div>
            {filas.map((f, i) => (
              <div key={f.p.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '9px 12px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.p.nombre}</span>
                <span style={{ ...num, color: 'var(--text-2)' }}>{f.dias || '—'}</span>
                <span style={{ ...num, color: 'var(--text-2)' }}>{f.francos || '—'}</span>
                <span style={{ ...num, fontWeight: 700, color: f.horas > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>{f.horas > 0 ? fmtHoras(f.horas) : '—'}</span>
                {conCosto && <span style={{ ...num, color: 'var(--text-2)' }}>{f.costo != null && f.horas > 0 ? fmtPesos(f.costo) : '—'}</span>}
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '10px 12px', borderTop: '2px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
              <span>Total</span><span /><span /><span style={num}>{fmtHoras(totalHoras)}</span>{conCosto && <span style={num}>{fmtPesos(totalCosto)}</span>}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ─── Horarios habituales ─── */

export function HorariosModal({ open, horarios, onClose, onGuardar }: {
  open: boolean
  horarios: HorariosTurno
  onClose: () => void
  onGuardar: (h: HorariosTurno) => Promise<void>
}) {
  const [borrador, setBorrador] = useState(horarios)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { if (open) setBorrador(horarios) }, [open, horarios])

  const completo = TIPOS_DE_TRABAJO.every(tp => borrador[tp as keyof HorariosTurno][0] && borrador[tp as keyof HorariosTurno][1])
  const guardar = async () => {
    setGuardando(true)
    try { await onGuardar(borrador) } finally { setGuardando(false) }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={440}>
      <div style={cuerpoModal}>
        {cabecera('Horarios habituales', 'El horario que se carga solo al asignar cada tipo de turno. Se puede cambiar persona por persona; los turnos ya cargados no se tocan.', onClose)}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {TIPOS_DE_TRABAJO.map(tp => {
            const k = tp as keyof HorariosTurno
            const cfg = TURNO_CONFIG[tp]
            const [e, s] = borrador[k]
            const set = (i: 0 | 1, v: string) => setBorrador(prev => ({ ...prev, [k]: i === 0 ? [v, prev[k][1]] : [prev[k][0], v] }))
            return (
              <div key={tp} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', borderLeft: `3px solid ${cfg.color}`, background: 'var(--surface)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: cfg.color }}>{cfg.icon}</span>
                <div style={{ width: 70, flexShrink: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' }}>{cfg.fullLabel}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{e && s ? fmtHoras(duracionHoras(e, s)) : '—'}</div>
                </div>
                <input type="time" aria-label={`${cfg.fullLabel}: entrada`} value={e} onChange={ev => set(0, ev.target.value)} style={{ ...fieldStyle, padding: '9px 8px', flex: 1, minWidth: 0 }} />
                <span style={{ color: 'var(--text-3)' }}>a</span>
                <input type="time" aria-label={`${cfg.fullLabel}: salida`} value={s} onChange={ev => set(1, ev.target.value)} style={{ ...fieldStyle, padding: '9px 8px', flex: 1, minWidth: 0 }} />
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose} style={btnSecundario}>Cancelar</button>
          <button type="button" onClick={guardar} disabled={!completo || guardando} style={{ ...btnPrimario, opacity: !completo || guardando ? 0.6 : 1 }}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
