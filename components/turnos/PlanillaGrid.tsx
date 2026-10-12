'use client'

// Grilla semanal de Turnos (desktop / tablet): persona × día. Arriba de las
// filas, la banda "Agenda" refleja el Calendario (eventos, menús, entregas,
// reservas, feriados) para armar los horarios mirando lo que pasa cada día.
// Con un pincel elegido, cada clic pinta ese turno — y arrastrando con el
// mouse se pinta una tira. Sin pincel, el clic abre el editor.

import { useEffect, useRef, useState } from 'react'
import type { ItemCalendario } from '@/lib/hooks/useCalendario'
import { segmentosSemana } from '@/lib/calendario/layout'
import { DIAS_CORTO, hoy as hoyStr, fechaLarga } from '@/lib/calendario/fechas'
import { CAPA_POR_ID } from '@/lib/calendario/capas'
import { colorItem, iconoItem, horaCorta } from '@/components/calendario/shared'
import { Avatar } from '@/components/ui'
import {
  claveTurno, fmtHoras, horasPersona, HORAS_SEMANA_MAX,
  type CoberturaDia, type IndiceTurnos, type AvisoPlanilla,
} from '@/lib/turnos/planilla'
import type { HorariosTurno } from '@/lib/turnos/tipos'
import { TurnoPill, BarraCobertura, type PersonaPlanilla, type Pincel } from './shared'

const BARRA_H = 22
const CARRILES_MAX = 3
const TINTE_SEL = 'rgba(67,97,160,0.09)'
const TINTE_HOY = 'rgba(67,97,160,0.045)'

export function PlanillaGrid({
  semana, personas, idx, horarios, cobertura, avisos, porDia, conNota, seleccionado,
  pincel, editable, compacta,
  onSeleccionar, onAbrir, onPintar,
}: {
  semana: string[]
  personas: PersonaPlanilla[]
  idx: IndiceTurnos
  horarios: HorariosTurno
  cobertura: Record<string, CoberturaDia>
  avisos: AvisoPlanilla[]
  porDia: Record<string, ItemCalendario[]>
  conNota: Record<string, number>
  seleccionado: string
  pincel: Pincel
  editable: boolean
  compacta: boolean
  onSeleccionar: (fecha: string) => void
  onAbrir: (persona: PersonaPlanilla, fecha: string) => void
  /** `gesto` agrupa las celdas de un mismo arrastre (un solo deshacer). */
  onPintar: (persona: PersonaPlanilla, fecha: string, gesto: number) => void
}) {
  const hoy = hoyStr()
  const [agendaAbierta, setAgendaAbierta] = useState(false)

  // Pintar arrastrando (solo mouse: en táctil el arrastre es el scroll).
  const gestoRef = useRef(0)
  const arrastreRef = useRef<{ gesto: number; vistas: Set<string> } | null>(null)
  const pintadaEnDownRef = useRef<string | null>(null)
  useEffect(() => {
    const soltar = () => { arrastreRef.current = null }
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', soltar)
    return () => { window.removeEventListener('pointerup', soltar); window.removeEventListener('pointercancel', soltar) }
  }, [])

  const anchoNombre = compacta ? 172 : 204
  const anchoTotal = compacta ? 46 : 62
  const cols = `${anchoNombre}px repeat(7, minmax(${compacta ? 68 : 96}px, 1fr)) ${anchoTotal}px`

  const feriadoDe = (f: string) => (porDia[f] ?? []).find(it => it.capa === 'feriados')
  const fondoCol = (f: string, i: number) =>
    f === seleccionado ? TINTE_SEL
    : f === hoy ? TINTE_HOY
    : feriadoDe(f) ? CAPA_POR_ID.feriados.color + '0a'
    : i >= 5 ? 'var(--bg)' : 'transparent'
  /** Marco de la columna seleccionada: dos líneas de acento de arriba a abajo. */
  const marcoCol = (f: string, extra = '') =>
    f === seleccionado ? `inset 2px 0 0 var(--accent), inset -2px 0 0 var(--accent)${extra}` : undefined

  const avisoDeCelda = (miembroId: string, f: string) => {
    const l = avisos.filter(a => a.miembroId === miembroId && a.fecha === f)
    return l.length ? l.map(a => a.texto).join(' · ') : undefined
  }

  // Agenda de la semana: una barra por ítem (los de varios días cruzan columnas).
  const unicos = semana.flatMap(f => porDia[f] ?? []).filter((v, i, a) => a.findIndex(x => x.id === v.id) === i)
  const segs = segmentosSemana(semana, unicos, { incluirUnDia: true })
  const carriles = segs.length ? Math.max(...segs.map(s => s.carril)) + 1 : 0
  const carrilesVisibles = agendaAbierta ? carriles : Math.min(carriles, CARRILES_MAX)

  const borde = '1px solid var(--border)'
  const celdaNombre: React.CSSProperties = {
    position: 'sticky', left: 0, zIndex: 2, background: 'var(--surface)', borderRight: borde,
  }

  const horasSemana = semana.reduce((s, f) => s + (cobertura[f]?.horas ?? 0), 0)

  return (
    <div style={{ border: borde, borderRadius: 12, background: 'var(--surface)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
      <div className="hide-scrollbar" style={{ overflowX: 'auto' }}>
        <div role="grid" aria-label="Turnos de la semana" style={{ display: 'grid', gridTemplateColumns: cols, minWidth: 'min-content' }}>

          {/* ── Cabecera de días ── */}
          <div role="row" style={{ display: 'contents' }}>
            <div role="columnheader" style={{ ...celdaNombre, zIndex: 3, display: 'flex', alignItems: 'flex-end', padding: '0 12px 9px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Equipo · {personas.length}
            </div>
            {semana.map((f, i) => {
              const esHoy = f === hoy
              const sel = f === seleccionado
              const feriado = feriadoDe(f)
              const notas = conNota[f] ?? 0
              return (
                <button
                  key={f}
                  type="button"
                  role="columnheader"
                  aria-selected={sel}
                  aria-label={`${fechaLarga(f)}${esHoy ? ', hoy' : ''}${feriado ? `, ${feriado.titulo}` : ''}`}
                  onClick={() => onSeleccionar(f)}
                  className="turno-dia"
                  style={{
                    border: 'none', borderLeft: i > 0 ? borde : 'none', cursor: 'pointer', fontFamily: 'inherit',
                    background: fondoCol(f, i), boxShadow: marcoCol(f, ', inset 0 2px 0 var(--accent)'),
                    padding: '9px 4px 7px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 700, color: esHoy || sel ? 'var(--accent)' : i >= 5 ? 'var(--text-2)' : 'var(--text-3)' }}>
                    {DIAS_CORTO[i]}
                    {notas > 0 && <span className="material-symbols-outlined" title={`${notas} ${notas === 1 ? 'nota' : 'notas'}`} style={{ fontSize: 13, color: 'var(--text-3)' }}>sticky_note_2</span>}
                  </span>
                  <span style={{
                    minWidth: 30, height: 30, lineHeight: '30px', borderRadius: 15, textAlign: 'center', padding: '0 4px',
                    fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                    background: esHoy ? 'var(--navy)' : 'transparent',
                    color: esHoy ? '#fff' : feriado ? CAPA_POR_ID.feriados.color : 'var(--text-1)',
                  }}>
                    {Number(f.slice(8))}
                  </span>
                </button>
              )
            })}
            <div role="columnheader" style={{ borderLeft: borde, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 9, fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              {compacta ? 'Hs' : 'Horas'}
            </div>
          </div>

          {/* ── Banda Agenda (reflejo del Calendario) ── */}
          <div role="row" style={{ display: 'contents' }}>
            <div style={{ ...celdaNombre, borderTop: borde, padding: '7px 12px', display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>calendar_month</span>
              Agenda
              {carriles > CARRILES_MAX && (
                <button type="button" onClick={() => setAgendaAbierta(v => !v)} aria-label={agendaAbierta ? 'Mostrar menos' : 'Mostrar toda la agenda'}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 0, display: 'flex' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{agendaAbierta ? 'expand_less' : 'expand_more'}</span>
                </button>
              )}
            </div>
            <div style={{ gridColumn: '2 / span 7', position: 'relative', borderTop: borde, minHeight: 34 }}>
              {/* Franjas de fondo: continúan las columnas (tinte + líneas) por detrás de las barras */}
              <div aria-hidden style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                {semana.map((f, i) => (
                  <div key={f} style={{ borderLeft: i > 0 ? borde : 'none', background: fondoCol(f, i), boxShadow: marcoCol(f) }} />
                ))}
              </div>
              {carriles === 0 ? (
                <div style={{ position: 'relative', padding: '9px 12px', fontSize: 12, color: 'var(--text-3)' }}>
                  Nada agendado esta semana
                </div>
              ) : (
                <div style={{
                  position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                  gridAutoRows: BARRA_H, rowGap: 3, padding: '6px 0',
                }}>
                  {segs.filter(s => s.carril < carrilesVisibles).map(s => {
                    const color = colorItem(s.item)
                    return (
                      <button
                        key={s.item.id}
                        type="button"
                        onClick={() => onSeleccionar(s.item.dia < semana[0] ? semana[0] : s.item.dia)}
                        title={s.item.titulo + (s.item.meta ? ` · ${s.item.meta}` : '')}
                        style={{
                          gridColumn: `${s.colInicio + 1} / span ${s.colFin - s.colInicio + 1}`, gridRow: s.carril + 1,
                          margin: `0 ${s.continuaDespues ? 0 : 4}px 0 ${s.continuaAntes ? 0 : 4}px`,
                          display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px', minWidth: 0,
                          border: 'none', borderLeft: s.continuaAntes ? 'none' : `3px solid ${color}`, background: color + '26',
                          borderRadius: `${s.continuaAntes ? 0 : 5}px ${s.continuaDespues ? 0 : 5}px ${s.continuaDespues ? 0 : 5}px ${s.continuaAntes ? 0 : 5}px`,
                          fontSize: 11.5, fontWeight: 700, color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 13, color, flexShrink: 0 }}>{iconoItem(s.item)}</span>
                        {!s.item.todoElDia && (
                          <span style={{ color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{horaCorta(s.item.hora_inicio)}</span>
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.item.titulo}</span>
                      </button>
                    )
                  })}
                  {!agendaAbierta && carriles > CARRILES_MAX && semana.map((f, i) => {
                    const ocultos = segs.filter(s => s.carril >= CARRILES_MAX && s.colInicio <= i && s.colFin >= i).length
                    return ocultos > 0 ? (
                      <button key={f} type="button" onClick={() => setAgendaAbierta(true)} style={{
                        gridColumn: i + 1, gridRow: CARRILES_MAX + 1, background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textAlign: 'left', padding: '0 8px', fontFamily: 'inherit',
                      }}>+{ocultos} más</button>
                    ) : null
                  })}
                </div>
              )}
            </div>
            <div style={{ borderTop: borde, borderLeft: borde }} />
          </div>

          {/* ── Una fila por persona ── */}
          {personas.map((p, fila) => {
            const total = horasPersona(p.id, semana, idx, horarios)
            const pasado = total > HORAS_SEMANA_MAX
            // Línea más gruesa entre la agenda y el equipo: son dos bloques distintos.
            const bordeFila = fila === 0 ? '2px solid var(--border)' : borde
            return (
              <div key={p.id} role="row" className="turno-fila" style={{ display: 'contents' }}>
                <div role="rowheader" className="turno-nombre" style={{ ...celdaNombre, borderTop: bordeFila, padding: compacta ? '6px 8px' : '6px 12px', display: 'flex', alignItems: 'center', gap: compacta ? 7 : 9, minWidth: 0 }}>
                  <Avatar name={p.nombre} size={compacta ? 26 : 30} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</div>
                    {(p.puesto || p.esYo) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, fontSize: 11, color: 'var(--text-3)' }}>
                        {p.esYo && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'rgba(67,97,160,.12)', borderRadius: 99, padding: '0 6px', flexShrink: 0 }}>Vos</span>}
                        {p.puesto && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.puesto}</span>}
                      </div>
                    )}
                  </div>
                </div>
                {semana.map((f, i) => {
                  const k = claveTurno(p.id, f)
                  const t = idx[k]
                  const estilo: React.CSSProperties = {
                    borderTop: bordeFila, borderLeft: i > 0 ? borde : 'none', background: fondoCol(f, i), boxShadow: marcoCol(f),
                    padding: 3, minHeight: 54, display: 'flex',
                  }
                  const contenido = t
                    ? <TurnoPill turno={t} horarios={horarios} aviso={avisoDeCelda(p.id, f)} compacta={compacta} />
                    : editable ? <span className="material-symbols-outlined turno-add" style={{ fontSize: 18, color: 'var(--text-3)', margin: 'auto' }}>{pincel && pincel !== 'borrar' ? 'brush' : 'add'}</span> : null
                  if (!editable) return <div key={f} role="gridcell" style={estilo}>{contenido}</div>
                  return (
                    <div key={f} role="gridcell" style={estilo}>
                      <button
                        type="button"
                        className="turno-celda"
                        aria-label={`${p.nombre}, ${fechaLarga(f)}: ${t ? t.turno_tipo : 'sin turno'}`}
                        onPointerDown={e => {
                          if (!pincel || e.pointerType !== 'mouse' || e.button !== 0) return
                          const gesto = ++gestoRef.current
                          arrastreRef.current = { gesto, vistas: new Set([k]) }
                          pintadaEnDownRef.current = k
                          onPintar(p, f, gesto)
                        }}
                        onPointerEnter={() => {
                          const a = arrastreRef.current
                          if (!a || !pincel || a.vistas.has(k)) return
                          a.vistas.add(k)
                          onPintar(p, f, a.gesto)
                        }}
                        onClick={() => {
                          // El mouse ya pintó en el pointerdown; acá llegan táctil y teclado.
                          if (pintadaEnDownRef.current === k) { pintadaEnDownRef.current = null; return }
                          pintadaEnDownRef.current = null
                          if (pincel) onPintar(p, f, ++gestoRef.current)
                          else onAbrir(p, f)
                        }}
                        style={{
                          flex: 1, minWidth: 0, display: 'flex', padding: 0, border: 'none', borderRadius: 9, background: 'transparent',
                          fontFamily: 'inherit', cursor: pincel ? (pincel === 'borrar' ? 'not-allowed' : 'copy') : 'pointer',
                        }}
                      >
                        {contenido}
                      </button>
                    </div>
                  )
                })}
                <div role="gridcell" title={pasado ? `Más de ${HORAS_SEMANA_MAX} h en la semana` : undefined} style={{
                  borderTop: bordeFila, borderLeft: borde, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                  color: pasado ? 'var(--amber-fg)' : total > 0 ? 'var(--text-1)' : 'var(--text-3)',
                }}>
                  {total > 0 ? fmtHoras(total).replace(' h', '') : '—'}
                </div>
              </div>
            )
          })}

          {/* ── Cobertura por día ── */}
          <div role="row" style={{ display: 'contents' }}>
            <div style={{ ...celdaNombre, borderTop: '2px solid var(--border)', padding: '10px 12px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'flex', alignItems: 'center' }}>
              Cobertura
            </div>
            {semana.map((f, i) => {
              const c = cobertura[f]
              return (
                <div key={f} title={c ? `Mañana ${c.porTipo.mañana} · Tarde ${c.porTipo.tarde} · Noche ${c.porTipo.noche} · Franco ${c.porTipo.franco}${c.porTipo.vacaciones ? ` · Vacaciones ${c.porTipo.vacaciones}` : ''}` : undefined}
                  style={{
                    borderTop: '2px solid var(--border)', borderLeft: i > 0 ? borde : 'none', background: fondoCol(f, i),
                    boxShadow: marcoCol(f, ', inset 0 -2px 0 var(--accent)'), padding: '8px 8px 9px', display: 'flex', flexDirection: 'column', gap: 5,
                  }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: c?.personas ? 'var(--text-1)' : 'var(--text-3)', lineHeight: 1 }}>{c?.personas ?? 0}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c?.personas ? `· ${fmtHoras(c.horas)}` : 'sin turnos'}
                    </span>
                  </div>
                  <BarraCobertura porTipo={c?.porTipo ?? { mañana: 0, tarde: 0, noche: 0, franco: 0, vacaciones: 0 }} total={c?.personas ?? 0} />
                </div>
              )
            })}
            <div style={{ borderTop: '2px solid var(--border)', borderLeft: borde, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
              {horasSemana > 0 ? fmtHoras(horasSemana).replace(' h', '') : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
