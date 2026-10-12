'use client'

// Panel del día elegido en Turnos — el mismo lugar y la misma forma que el
// panel del día del Calendario: quién trabaja, qué hay agendado (reflejo de
// solo lectura: se edita en Calendario) y las notas del día, que son las
// mismas del Calendario. Abajo, lo que conviene revisar de la semana.

import { ordenarItemsDia, type ItemCalendario, type NotaItemCalendario } from '@/lib/hooks/useCalendario'
import { fechaLarga, fechaRelativa, DIAS_CORTO, dowLunes, parse } from '@/lib/calendario/fechas'
import type { todasLasPlazas } from '@/lib/constants'
import { ItemFila } from '@/components/calendario/shared'
import { NotasDia } from '@/components/calendario/NotasDia'
import { Avatar } from '@/components/ui'
import {
  claveTurno, horarioDe, rangoCompacto, fmtHoras,
  type CoberturaDia, type IndiceTurnos, type AvisoPlanilla,
} from '@/lib/turnos/planilla'
import { TURNO_CONFIG, TIPOS_DE_TRABAJO, normalizarTipo, type HorariosTurno, type TurnoTipo } from '@/lib/turnos/tipos'
import { tituloSeccion, type PersonaPlanilla } from './shared'

type PlazasCustom = Parameters<typeof todasLasPlazas>[0]

export function DiaTurnosPanel({
  fecha, personas, idx, horarios, cobertura, items, notas, avisos, plazasCustom, puedeAnotar,
  onAbrirEvento, onIrCalendario, onAgregarNota, onEliminarNota, onSeleccionar,
}: {
  fecha: string
  personas: PersonaPlanilla[]
  idx: IndiceTurnos
  horarios: HorariosTurno
  cobertura: CoberturaDia | undefined
  items: ItemCalendario[]
  notas: NotaItemCalendario[]
  /** Avisos de toda la semana visible. */
  avisos: AvisoPlanilla[]
  plazasCustom: PlazasCustom
  puedeAnotar: boolean
  onAbrirEvento: (it: ItemCalendario) => void
  onIrCalendario: () => void
  onAgregarNota: (texto: string) => Promise<void>
  onEliminarNota: (id: string) => void
  onSeleccionar: (fecha: string) => void
}) {
  const rel = fechaRelativa(fecha)
  const ordenados = ordenarItemsDia(items)

  const dePersona = (tipo: TurnoTipo) => personas.filter(p => normalizarTipo(idx[claveTurno(p.id, fecha)]?.turno_tipo) === tipo)
  const grupos = TIPOS_DE_TRABAJO.map(tipo => ({ tipo, gente: dePersona(tipo) })).filter(g => g.gente.length > 0)
  const francos = dePersona('franco')
  const vacaciones = dePersona('vacaciones')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {rel && <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{rel}</div>}
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-1)' }}>{fechaLarga(fecha)}</h2>
        </div>
        <button type="button" onClick={onIrCalendario} title="Abrir este día en el Calendario" aria-label="Abrir este día en el Calendario" style={{
          height: 40, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)',
          color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>calendar_month</span>
          Calendario
        </button>
      </div>

      {/* Quién trabaja */}
      <section style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', boxShadow: 'var(--shadow-1)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={tituloSeccion}>Quién trabaja</span>
          {cobertura && cobertura.personas > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', marginLeft: 'auto' }}>
              {cobertura.personas} {cobertura.personas === 1 ? 'persona' : 'personas'} · {fmtHoras(cobertura.horas)}
            </span>
          )}
        </div>
        {grupos.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Nadie tiene turno cargado este día.</div>
        ) : grupos.map(({ tipo, gente }) => {
          const cfg = TURNO_CONFIG[tipo]
          const def = horarios[tipo as keyof HorariosTurno]
          return (
            <div key={tipo} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: cfg.color }}>{cfg.icon}</span>
                {cfg.fullLabel}
                <span style={{ fontWeight: 500, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{rangoCompacto(def[0], def[1])}</span>
                <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{gente.length}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {gente.map(p => {
                  const t = idx[claveTurno(p.id, fecha)]
                  const h = horarioDe(t, horarios)
                  const distinto = h && (h.entrada !== def[0] || h.salida !== def[1])
                  return (
                    <span key={p.id} title={t?.notas ?? undefined} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px 3px 3px', borderRadius: 99,
                      background: cfg.color + '14', fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', maxWidth: '100%',
                    }}>
                      <Avatar name={p.nombre} size={20} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre.split(' ')[0]}</span>
                      {distinto && <span style={{ fontWeight: 500, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{rangoCompacto(h.entrada, h.salida)}</span>}
                      {t?.notas && <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--text-3)' }}>sticky_note_2</span>}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
        {(francos.length > 0 || vacaciones.length > 0 || (cobertura?.sinAsignar ?? 0) > 0) && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 9, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.4 }}>
            {francos.length > 0 && <div><b style={{ fontWeight: 700 }}>Franco:</b> {francos.map(p => p.nombre.split(' ')[0]).join(', ')}</div>}
            {vacaciones.length > 0 && <div><b style={{ fontWeight: 700 }}>Vacaciones:</b> {vacaciones.map(p => p.nombre.split(' ')[0]).join(', ')}</div>}
            {(cobertura?.sinAsignar ?? 0) > 0 && <div style={{ color: 'var(--text-3)' }}>{cobertura!.sinAsignar} sin turno cargado</div>}
          </div>
        )}
      </section>

      {/* Agenda del día — reflejo del Calendario */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={tituloSeccion}>Agenda del día</span>
        {ordenados.length === 0 ? (
          <div style={{ padding: '12px', borderRadius: 12, border: '1px dashed var(--border)', fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
            Nada agendado este día.
          </div>
        ) : ordenados.map(it => <ItemFila key={it.id} it={it} onClick={onAbrirEvento} />)}
      </section>

      {puedeAnotar && (
        <NotasDia
          notas={notas}
          plazasCustom={plazasCustom}
          placeholder="Pidió el día, refuerzo para el evento…"
          pie="Son las mismas notas del día del Calendario."
          onAgregar={onAgregarNota}
          onEliminar={onEliminarNota}
        />
      )}

      {avisos.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={tituloSeccion}>Para revisar esta semana · {avisos.length}</span>
          <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {avisos.map((a, i) => {
              const cuerpo = (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--text-2)', flexShrink: 0, marginTop: 1 }}>
                    {a.tipo === 'descanso_corto' ? 'bedtime' : a.tipo === 'sin_franco' ? 'event_busy' : 'schedule'}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.4 }}>
                    <b style={{ fontWeight: 700 }}>{a.nombre.split(' ')[0]}</b>
                    {a.fecha && <span style={{ color: 'var(--text-3)' }}> · {DIAS_CORTO[dowLunes(a.fecha)]} {parse(a.fecha).getDate()}</span>}
                    <br />
                    <span style={{ color: 'var(--text-2)' }}>{a.texto}</span>
                  </span>
                </>
              )
              const estilo: React.CSSProperties = {
                display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 12px', width: '100%', textAlign: 'left',
                borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: a.fecha === fecha ? 'rgba(67,97,160,0.07)' : 'transparent',
              }
              return a.fecha
                ? <button key={a.id} type="button" onClick={() => onSeleccionar(a.fecha!)} style={{ ...estilo, borderLeft: 'none', borderRight: 'none', borderBottom: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{cuerpo}</button>
                : <div key={a.id} style={estilo}>{cuerpo}</div>
            })}
          </div>
        </section>
      )}
    </div>
  )
}
