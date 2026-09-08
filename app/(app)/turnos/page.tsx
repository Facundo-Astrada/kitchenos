'use client'

import PageTransition from '@/components/PageTransition'
import { useState, useMemo, useEffect, useRef } from 'react'
import {
  useEquipo, TURNO_CONFIG,
  type TurnoTipo, type Turno,
} from '@/lib/hooks/useEquipo'
import { useFichaje, type FichajeDia } from '@/lib/hooks/useFichaje'
import { useAuth } from '@/lib/auth/context'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { Modal, Avatar } from '@/components/ui'

// ── Constantes ──

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const TURNO_TIPOS = Object.keys(TURNO_CONFIG) as TurnoTipo[]

// ── Helpers ──

function getWeekDates(offset: number): Date[] {
  const now = new Date()
  const day = now.getDay()
  const diffToMon = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diffToMon + offset * 7)
  monday.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function fmtDate(d: Date) { return d.toISOString().slice(0, 10) }
function fmtDateShort(d: Date) { return `${d.getDate()}/${d.getMonth() + 1}` }

// "09:00:00" (Postgres time) o "09:00" (input type=time) → "09:00"
function hhmm(t: string | null | undefined): string { return t ? t.slice(0, 5) : '' }

// Horas reales de un turno — hora_entrada/hora_salida si están cargadas
// (ya sea porque se tipearon o porque asignarTurno precargó el default del
// tipo), si no 8h de respaldo. Cruce de medianoche (noche 20→02) contado
// bien: la resta da negativo, se le suma un día.
function horasDeTurno(t: Turno | undefined, tipo: TurnoTipo | undefined): number {
  if (!tipo || tipo === 'franco' || tipo === 'vacaciones') return 0
  const entrada = hhmm(t?.hora_entrada) || TURNO_CONFIG[tipo].defaultHoras?.[0]
  const salida = hhmm(t?.hora_salida) || TURNO_CONFIG[tipo].defaultHoras?.[1]
  if (!entrada || !salida) return 8
  const [eh, em] = entrada.split(':').map(Number)
  const [sh, sm] = salida.split(':').map(Number)
  let mins = (sh * 60 + sm) - (eh * 60 + em)
  if (mins <= 0) mins += 24 * 60
  return mins / 60
}

// ── Estilos compartidos ──

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 12,
  border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text-1)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, display: 'block',
}

// ── Types internos ──

type Tab = 'turnos' | 'fichajes'

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════

export default function TurnosPage() {
  const {
    miembros, turnos, puestos, loading,
    fetchTurnos, fetchTurnosMes, asignarTurno, limpiarTurno, copiarSemanaAnterior,
  } = useEquipo()
  const { user } = useAuth()
  const { isAdmin } = usePermisos()
  const isDesktop = useIsDesktop()
  const { fetchQuienEstaAdentro, fetchHistorial, guardarFichajeManual } = useFichaje()

  const [tab, setTab] = useState<Tab>('turnos')

  useEffect(() => {
    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'turnos',
      tab,
      totalMiembros: miembros.length,
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [tab, miembros.length])

  // ── Turnos state ──
  const [weekOffset, setWeekOffset] = useState(0)
  const [showMesResumen, setShowMesResumen] = useState(false)
  const [turnosMes, setTurnosMes] = useState<Turno[]>([])
  const [loadingMes, setLoadingMes] = useState(false)
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset])
  const weekStart = fmtDate(weekDates[0])
  const weekEnd = fmtDate(weekDates[6])
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [diaMobileIdx, setDiaMobileIdx] = useState(0)
  const [copiando, setCopiando] = useState(false)
  const [editandoCelda, setEditandoCelda] = useState<{
    miembroId: string; miembroNombre: string; fecha: string
    tipo: TurnoTipo | null; horaEntrada: string; horaSalida: string
  } | null>(null)
  const [guardandoCelda, setGuardandoCelda] = useState(false)

  // ── Fichajes state ──
  const [quienAdentro, setQuienAdentro] = useState<(FichajeDia & { nombre: string })[]>([])
  const [loadingAdentro, setLoadingAdentro] = useState(false)
  const [personaHistorialId, setPersonaHistorialId] = useState<string | null>(null)
  const [historialPersona, setHistorialPersona] = useState<FichajeDia[]>([])
  const [misFichajes, setMisFichajes] = useState<FichajeDia[]>([])
  const [editandoFichaje, setEditandoFichaje] = useState<{ id?: string; usuarioId: string; fecha: string; entrada: string; salida: string } | null>(null)
  const [guardandoFichaje, setGuardandoFichaje] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { fetchTurnos(weekStart, weekEnd) }, [weekStart, weekEnd, fetchTurnos])

  // "Mis fichajes" (todos los roles) + "quién está adentro" (solo admin) al entrar al tab.
  // Bug real encontrado acá (S6, sep 2026): estos dos efectos estaban escritos
  // DESPUÉS del `return` del componente — código inalcanzable en JS, nunca se
  // ejecutaban. La pestaña Fichajes mostraba "sin fichajes"/"nadie adentro"
  // aunque hubiera datos reales. Movidos arriba, junto al resto de los hooks.
  useEffect(() => {
    if (tab !== 'fichajes') return
    if (isAdmin) {
      setLoadingAdentro(true)
      fetchQuienEstaAdentro().then(setQuienAdentro).finally(() => setLoadingAdentro(false))
    }
    if (user?.id) {
      const hasta = new Date().toISOString().slice(0, 10)
      const desdeD = new Date(); desdeD.setDate(desdeD.getDate() - 14)
      fetchHistorial(user.id, desdeD.toISOString().slice(0, 10), hasta).then(setMisFichajes)
    }
  }, [tab, isAdmin, user?.id, fetchQuienEstaAdentro, fetchHistorial])

  // Historial semanal de la persona elegida por el admin
  useEffect(() => {
    if (!personaHistorialId) { setHistorialPersona([]); return }
    const hasta = new Date().toISOString().slice(0, 10)
    const desdeD = new Date(); desdeD.setDate(desdeD.getDate() - 7)
    fetchHistorial(personaHistorialId, desdeD.toISOString().slice(0, 10), hasta).then(setHistorialPersona)
  }, [personaHistorialId, fetchHistorial])

  // Indexado por miembro+fecha — coberturaDia/totalDia/totalPersona y las
  // dos grillas (desktop/mobile) lo consultan en bucle, O(1) en vez de
  // escanear `turnos` por cada celda.
  const turnoPorClave = useMemo(() => {
    const m: Record<string, Turno> = {}
    for (const t of turnos) m[`${t.miembro_id}_${t.fecha}`] = t
    return m
  }, [turnos])

  // ── Handlers: Turnos ──

  function abrirEditorCelda(miembroId: string, miembroNombre: string, fecha: string, tipoActual: TurnoTipo | undefined, turno: Turno | undefined) {
    if (!isAdmin) return
    const tipo = tipoActual ?? null
    setEditandoCelda({
      miembroId, miembroNombre, fecha, tipo,
      horaEntrada: hhmm(turno?.hora_entrada) || (tipo ? TURNO_CONFIG[tipo].defaultHoras?.[0] ?? '' : ''),
      horaSalida: hhmm(turno?.hora_salida) || (tipo ? TURNO_CONFIG[tipo].defaultHoras?.[1] ?? '' : ''),
    })
  }

  function elegirTipoCelda(tipo: TurnoTipo) {
    setEditandoCelda(prev => prev && {
      ...prev, tipo,
      horaEntrada: prev.horaEntrada || TURNO_CONFIG[tipo].defaultHoras?.[0] || '',
      horaSalida: prev.horaSalida || TURNO_CONFIG[tipo].defaultHoras?.[1] || '',
    })
  }

  async function guardarCelda() {
    if (!editandoCelda?.tipo) return
    setGuardandoCelda(true)
    try {
      await asignarTurno(editandoCelda.miembroId, editandoCelda.fecha, editandoCelda.tipo, {
        hora_entrada: editandoCelda.horaEntrada || null,
        hora_salida: editandoCelda.horaSalida || null,
      })
      await fetchTurnos(weekStart, weekEnd)
      setEditandoCelda(null)
    } catch (e: unknown) {
      setToast(e instanceof Error ? e.message : 'Error al asignar turno')
    } finally {
      setGuardandoCelda(false)
    }
  }

  async function handleClearTurno(miembroId: string, fecha: string) {
    try {
      await limpiarTurno(miembroId, fecha)
      await fetchTurnos(weekStart, weekEnd)
    } catch {}
  }

  async function quitarCelda() {
    if (!editandoCelda) return
    setGuardandoCelda(true)
    try {
      await handleClearTurno(editandoCelda.miembroId, editandoCelda.fecha)
      setEditandoCelda(null)
    } finally {
      setGuardandoCelda(false)
    }
  }

  // Rellena la semana visible con los turnos de la anterior, corridos 7
  // días. Pide confirmación solo si la semana visible ya tiene algo cargado
  // — pisar sin avisar sería perder trabajo (DESIGN.md §7: undo/confirmación
  // en acciones que pueden perder datos, esto es gestión, no servicio).
  async function handleCopiarSemana() {
    if (turnos.length > 0 && !confirm('Esta semana ya tiene turnos cargados. ¿Reemplazar con los de la semana anterior?')) return
    setCopiando(true)
    try {
      const prevWeek = getWeekDates(weekOffset - 1)
      const n = await copiarSemanaAnterior(fmtDate(prevWeek[0]), fmtDate(prevWeek[6]))
      await fetchTurnos(weekStart, weekEnd)
      setToast(n > 0 ? `${n} turnos copiados` : 'La semana anterior no tenía turnos')
    } catch (e: unknown) {
      setToast(e instanceof Error ? e.message : 'Error al copiar la semana')
    } finally {
      setCopiando(false)
    }
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  return (
    <PageTransition>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      {/* HEADER */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
        <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0, marginBottom: 14 }}>Turnos</h1>
        <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: 3 }}>
          {(['turnos', 'fichajes'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                background: tab === t ? '#fff' : 'transparent',
                color: tab === t ? 'var(--navy)' : 'rgba(255,255,255,0.7)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {t === 'turnos' ? 'Turnos' : 'Fichajes'}
            </button>
          ))}
        </div>
      </div>

      {/* BODY */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 80px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--text-3)', fontSize: 32, animation: 'spin 1s linear infinite' }}>progress_activity</span>
          </div>
        ) : (
          <>
            {tab === 'turnos' && TabTurnos()}
            {tab === 'fichajes' && TabFichajes()}
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 'var(--toast-bottom)', left: '50%', transform: 'translateX(-50%)', background: 'var(--navy)', color: '#fff', padding: '10px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600, zIndex: 300, whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}
    </div>
    </PageTransition>
  )

  // ══════════════════════════════════════════════════════════════
  // TAB: TURNOS
  // ══════════════════════════════════════════════════════════════

  function TabTurnos() {
    function puestoDe(miembroId: string) {
      const m = miembros.find(x => x.id === miembroId)
      return m?.puesto_id ? puestos.find(p => p.id === m.puesto_id) : undefined
    }

    const coberturaDia = (d: Date) => {
      const dateStr = fmtDate(d)
      let personas = 0, horas = 0
      for (const m of miembros) {
        const t = turnoPorClave[`${m.id}_${dateStr}`]
        const tipo = t?.turno_tipo as TurnoTipo | undefined
        if (!tipo || tipo === 'franco' || tipo === 'vacaciones') continue
        personas++
        horas += horasDeTurno(t, tipo)
      }
      return { personas, horas }
    }

    const totalDia = (d: Date) => {
      const dateStr = fmtDate(d)
      let total = 0
      for (const m of miembros) {
        const t = turnoPorClave[`${m.id}_${dateStr}`]
        total += horasDeTurno(t, t?.turno_tipo as TurnoTipo | undefined)
      }
      return total
    }

    const totalPersona = (miembroId: string) => {
      let total = 0
      weekDates.forEach(d => {
        const t = turnoPorClave[`${miembroId}_${fmtDate(d)}`]
        total += horasDeTurno(t, t?.turno_tipo as TurnoTipo | undefined)
      })
      return total
    }

    return (
      <div style={{ padding: 16 }}>
        {/* Selector de semana + copiar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
          <button onClick={() => setWeekOffset(o => o - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>chevron_left</span>
          </button>
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={() => setWeekOffset(0)}
              style={{
                background: weekOffset === 0 ? 'var(--navy)' : 'var(--surface)',
                color: weekOffset === 0 ? '#fff' : 'var(--text-1)',
                border: weekOffset === 0 ? 'none' : '1px solid var(--border)',
                borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 4,
              }}
            >Esta semana</button>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {DIAS[0]} {fmtDateShort(weekDates[0])} — {DIAS[6]} {fmtDateShort(weekDates[6])}
            </div>
          </div>
          <button onClick={() => setWeekOffset(o => o + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>chevron_right</span>
          </button>
        </div>

        {isAdmin && miembros.length > 0 && (
          <button onClick={handleCopiarSemana} disabled={copiando} style={{
            display: 'flex', alignItems: 'center', gap: 6, margin: '0 auto 14px', background: 'none',
            border: '1px dashed var(--border)', borderRadius: 10, padding: '6px 12px',
            fontSize: 12, fontWeight: 600, color: 'var(--text-2)', cursor: copiando ? 'default' : 'pointer',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>content_copy</span>
            {copiando ? 'Copiando…' : 'Copiar semana anterior'}
          </button>
        )}

        {/* Leyenda */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {TURNO_TIPOS.map(tp => (
            <div key={tp} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-3)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: TURNO_CONFIG[tp].color, flexShrink: 0 }} />
              {TURNO_CONFIG[tp].fullLabel}
            </div>
          ))}
        </div>

        {miembros.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
            Agrega miembros del equipo primero
          </div>
        ) : isDesktop ? (
          /* ── DESKTOP: grilla completa ── */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={{ width: 160, padding: '6px 8px', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 2 }} />
                  {weekDates.map((d, i) => {
                    const esHoy = fmtDate(d) === fmtDate(new Date())
                    const cob = coberturaDia(d)
                    return (
                      <th key={i} style={{
                        padding: '6px 4px', textAlign: 'center', fontWeight: 600,
                        background: esHoy ? 'rgba(28,45,74,.06)' : 'transparent', borderRadius: 8,
                      }}>
                        <div style={{ fontSize: 11, color: esHoy ? 'var(--navy-ink)' : 'var(--text-3)' }}>{DIAS[i]}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: esHoy ? 'var(--navy-ink)' : 'var(--text-2)' }}>{d.getDate()}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 500, marginTop: 1 }}>
                          {cob.personas > 0 ? `${cob.personas} · ${Math.round(cob.horas)}h` : '—'}
                        </div>
                      </th>
                    )
                  })}
                  <th style={{ width: 44, padding: '6px 2px', fontSize: 9, color: 'var(--text-3)', textAlign: 'center', fontWeight: 700 }}>Hs</th>
                </tr>
              </thead>
              <tbody>
                {miembros.map(m => {
                  const puesto = puestoDe(m.id)
                  const nombreCompleto = `${m.nombre} ${m.apellido}`.trim()
                  const totalP = totalPersona(m.id)
                  return (
                    <tr key={m.id}>
                      <td style={{
                        padding: '6px 8px', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1,
                        display: 'flex', alignItems: 'center', gap: 8, minWidth: 160,
                      }}>
                        <Avatar name={nombreCompleto} size={28} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {nombreCompleto}
                          </div>
                          {puesto && (
                            <div style={{ fontSize: 9, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {puesto.nombre}
                            </div>
                          )}
                        </div>
                      </td>
                      {weekDates.map((d, i) => {
                        const dateStr = fmtDate(d)
                        const t = turnoPorClave[`${m.id}_${dateStr}`]
                        const tipo = t?.turno_tipo as TurnoTipo | undefined
                        const esHoy = dateStr === fmtDate(new Date())
                        return (
                          <td key={i} style={{ padding: 2, textAlign: 'center', background: esHoy ? 'rgba(28,45,74,.03)' : 'transparent' }}>
                            <button
                              onClick={() => abrirEditorCelda(m.id, nombreCompleto, dateStr, tipo, t)}
                              onTouchStart={() => { if (tipo) longPressTimer.current = setTimeout(() => handleClearTurno(m.id, dateStr), 600) }}
                              onTouchEnd={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }}
                              onTouchMove={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }}
                              style={{
                                width: '100%', minHeight: 44, borderRadius: 10, border: 'none', cursor: isAdmin ? 'pointer' : 'default',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                                background: tipo ? TURNO_CONFIG[tipo].bg : 'transparent',
                                fontFamily: 'inherit',
                              }}
                            >
                              {tipo ? (
                                <>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: TURNO_CONFIG[tipo].color }}>{TURNO_CONFIG[tipo].fullLabel}</span>
                                  {tipo !== 'franco' && tipo !== 'vacaciones' && (
                                    <span style={{ fontSize: 9, color: TURNO_CONFIG[tipo].color, opacity: .8 }}>
                                      {hhmm(t?.hora_entrada) || TURNO_CONFIG[tipo].defaultHoras?.[0]}–{hhmm(t?.hora_salida) || TURNO_CONFIG[tipo].defaultHoras?.[1]}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)', opacity: .4 }}>add</span>
                              )}
                            </button>
                          </td>
                        )
                      })}
                      <td style={{ padding: '4px 2px', textAlign: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: totalP > 48 ? '#b45309' : totalP > 0 ? 'var(--text-1)' : 'var(--text-3)' }} title={totalP > 48 ? 'Más de 48h semanales' : undefined}>
                          {Math.round(totalP)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                <tr>
                  <td style={{ padding: '6px 8px', position: 'sticky', left: 0, background: 'var(--bg)', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>
                    Total
                  </td>
                  {weekDates.map((d, i) => (
                    <td key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>
                      {Math.round(totalDia(d))}h
                    </td>
                  ))}
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          /* ── MOBILE: un día por pantalla ── */
          (() => {
            const d = weekDates[diaMobileIdx]
            const dateStr = fmtDate(d)
            const esHoy = dateStr === fmtDate(new Date())
            const cob = coberturaDia(d)
            function irDia(delta: 1 | -1) {
              const next = diaMobileIdx + delta
              if (next < 0) { setWeekOffset(o => o - 1); setDiaMobileIdx(6) }
              else if (next > 6) { setWeekOffset(o => o + 1); setDiaMobileIdx(0) }
              else setDiaMobileIdx(next)
            }
            return (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <button onClick={() => irDia(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>chevron_left</span>
                  </button>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: esHoy ? 'var(--navy-ink)' : 'var(--text-1)' }}>
                      {DIAS[diaMobileIdx]} {d.getDate()}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {cob.personas > 0 ? `${cob.personas} personas · ${Math.round(cob.horas)}h` : 'Sin turnos'}
                    </div>
                  </div>
                  <button onClick={() => irDia(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>chevron_right</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {miembros.map(m => {
                    const puesto = puestoDe(m.id)
                    const nombreCompleto = `${m.nombre} ${m.apellido}`.trim()
                    const t = turnoPorClave[`${m.id}_${dateStr}`]
                    const tipo = t?.turno_tipo as TurnoTipo | undefined
                    return (
                      <button
                        key={m.id}
                        onClick={() => abrirEditorCelda(m.id, nombreCompleto, dateStr, tipo, t)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', minHeight: 56,
                          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
                          cursor: isAdmin ? 'pointer' : 'default', width: '100%', textAlign: 'left', fontFamily: 'inherit',
                        }}
                      >
                        <Avatar name={nombreCompleto} size={32} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{nombreCompleto}</div>
                          {puesto && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{puesto.nombre}</div>}
                        </div>
                        {tipo ? (
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: TURNO_CONFIG[tipo].color }}>{TURNO_CONFIG[tipo].fullLabel}</div>
                            {tipo !== 'franco' && tipo !== 'vacaciones' && (
                              <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                                {hhmm(t?.hora_entrada) || TURNO_CONFIG[tipo].defaultHoras?.[0]}–{hhmm(t?.hora_salida) || TURNO_CONFIG[tipo].defaultHoras?.[1]}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)', opacity: .5 }}>add</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()
        )}

        {/* Resumen mensual */}
        {miembros.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <button
              onClick={async () => {
                if (!showMesResumen) {
                  setLoadingMes(true)
                  const now = new Date()
                  const data = await fetchTurnosMes(now.getMonth() + 1, now.getFullYear())
                  setTurnosMes(data); setLoadingMes(false)
                }
                setShowMesResumen(v => !v)
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: showMesResumen ? 'var(--navy)' : 'var(--surface)',
                color: showMesResumen ? '#fff' : 'var(--text-2)',
                border: `1px solid ${showMesResumen ? 'var(--navy)' : 'var(--border)'}`,
                borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>calendar_month</span>
              {loadingMes ? 'Cargando...' : showMesResumen ? 'Ocultar horas del mes' : 'Ver horas del mes'}
            </button>

            {showMesResumen && !loadingMes && (
              <div style={{ marginTop: 10, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
                </div>
                {miembros.map(m => {
                  const mTurnos = turnosMes.filter(t => t.miembro_id === m.id)
                  const totalHs = mTurnos.reduce((acc, t) => acc + horasDeTurno(t, t.turno_tipo as TurnoTipo), 0)
                  const dias = mTurnos.filter(t => t.turno_tipo !== 'franco' && t.turno_tipo !== 'vacaciones').length
                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)', gap: 10 }}>
                      <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{m.nombre} {m.apellido}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{dias} días</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: totalHs > 176 ? '#b45309' : totalHs > 0 ? 'var(--navy-ink)' : 'var(--text-3)', minWidth: 40, textAlign: 'right' }} title={totalHs > 176 ? 'Más de 176h en el mes' : undefined}>
                        {Math.round(totalHs)}h
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Editor de celda (crear/editar/quitar turno) */}
        <Modal open={!!editandoCelda} onClose={() => setEditandoCelda(null)} maxWidth={380}>
          {editandoCelda && (
            <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{editandoCelda.miembroNombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{new Date(editandoCelda.fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })}</div>
                </div>
                <button onClick={() => setEditandoCelda(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)' }}>close</span>
                </button>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TURNO_TIPOS.map(tp => {
                  const on = editandoCelda.tipo === tp
                  return (
                    <button key={tp} onClick={() => elegirTipoCelda(tp)} style={{
                      padding: '8px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1px solid ${on ? TURNO_CONFIG[tp].color : 'var(--border)'}`,
                      background: on ? TURNO_CONFIG[tp].bg : 'var(--surface)',
                      color: on ? TURNO_CONFIG[tp].color : 'var(--text-2)',
                      fontSize: 12, fontWeight: 700,
                    }}>{TURNO_CONFIG[tp].fullLabel}</button>
                  )
                })}
              </div>

              {editandoCelda.tipo && editandoCelda.tipo !== 'franco' && editandoCelda.tipo !== 'vacaciones' && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Entrada</label>
                    <input type="time" style={fieldStyle} value={editandoCelda.horaEntrada}
                      onChange={e => setEditandoCelda(prev => prev && { ...prev, horaEntrada: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Salida</label>
                    <input type="time" style={fieldStyle} value={editandoCelda.horaSalida}
                      onChange={e => setEditandoCelda(prev => prev && { ...prev, horaSalida: e.target.value })} />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={quitarCelda} disabled={guardandoCelda} style={{
                  flex: 1, padding: 13, borderRadius: 12, background: 'var(--bg)',
                  border: '1px solid var(--border)', fontSize: 13, fontWeight: 600,
                  color: 'var(--text-2)', cursor: 'pointer',
                }}>Quitar turno</button>
                <button onClick={guardarCelda} disabled={!editandoCelda.tipo || guardandoCelda} style={{
                  flex: 2, padding: 13, borderRadius: 12, background: editandoCelda.tipo ? 'var(--navy)' : 'var(--border)',
                  border: 'none', fontSize: 13, fontWeight: 700,
                  color: '#fff', cursor: editandoCelda.tipo ? 'pointer' : 'default', opacity: guardandoCelda ? 0.6 : 1,
                }}>{guardandoCelda ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // TAB: FICHAJES (M3)
  // ══════════════════════════════════════════════════════════════

  function toTimeInputValue(iso: string): string {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  function abrirEdicionFichaje(f?: FichajeDia) {
    const usuarioId = f?.usuario_id ?? personaHistorialId
    if (!usuarioId) return
    setEditandoFichaje({
      id: f?.id,
      usuarioId,
      fecha: f?.fecha ?? new Date().toISOString().slice(0, 10),
      entrada: f?.entrada ? toTimeInputValue(f.entrada) : '',
      salida: f?.salida ? toTimeInputValue(f.salida) : '',
    })
  }

  async function guardarEdicionFichaje() {
    if (!editandoFichaje) return
    setGuardandoFichaje(true)
    try {
      const entradaISO = editandoFichaje.entrada
        ? new Date(`${editandoFichaje.fecha}T${editandoFichaje.entrada}:00`).toISOString()
        : null
      const salidaISO = editandoFichaje.salida
        ? new Date(`${editandoFichaje.fecha}T${editandoFichaje.salida}:00`).toISOString()
        : null
      await guardarFichajeManual({
        id: editandoFichaje.id, usuarioId: editandoFichaje.usuarioId, fecha: editandoFichaje.fecha,
        entrada: entradaISO, salida: salidaISO,
      })
      setToast('Fichaje guardado')
      setEditandoFichaje(null)
      if (personaHistorialId) {
        const hasta = new Date().toISOString().slice(0, 10)
        const desdeD = new Date(); desdeD.setDate(desdeD.getDate() - 7)
        fetchHistorial(personaHistorialId, desdeD.toISOString().slice(0, 10), hasta).then(setHistorialPersona)
      }
    } catch (e: unknown) {
      setToast(e instanceof Error ? e.message : 'Error al guardar el fichaje')
    } finally {
      setGuardandoFichaje(false)
    }
  }

  function FilaFichaje({ f, onClick }: { f: FichajeDia; onClick?: () => void }) {
    return (
      <div
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
          cursor: onClick ? 'pointer' : 'default',
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--text-1)', flex: 1 }}>{f.fecha}</span>
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
          {f.entrada ? new Date(f.entrada).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—'}
          {' → '}
          {f.salida ? new Date(f.salida).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : 'en curso'}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy-ink)', minWidth: 40, textAlign: 'right' }}>
          {f.horas_total !== null ? `${f.horas_total.toFixed(1)}h` : '—'}
        </span>
        {f.editado_por && (
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-3)' }} title="Corregido manualmente">edit</span>
        )}
      </div>
    )
  }

  function TabFichajes() {
    const totalHorasMias = misFichajes.reduce((s, f) => s + (f.horas_total ?? 0), 0)

    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* Mis fichajes — visible para cualquier rol, sin costos */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>
            Mis fichajes (14 días) · {totalHorasMias.toFixed(1)}h
          </div>
          {misFichajes.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Sin fichajes registrados todavía</div>
          ) : (
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {misFichajes.map((f, i) => (
                <div key={f.id} style={{ borderBottom: i < misFichajes.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <FilaFichaje f={f} />
                </div>
              ))}
            </div>
          )}
        </div>

        {isAdmin && (
          <>
            {/* Quién está adentro ahora */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>
                Quién está adentro ahora
              </div>
              {loadingAdentro ? (
                <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Cargando...</div>
              ) : quienAdentro.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Nadie fichó entrada todavía hoy</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {quienAdentro.map(f => (
                    <div key={f.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12,
                      background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.25)',
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{f.nombre}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                        desde {new Date(f.entrada!).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Historial semanal por persona + edición manual */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: .5 }}>
                  Historial semanal por persona
                </span>
                {personaHistorialId && (
                  <button onClick={() => abrirEdicionFichaje()} style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy-ink)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    + Corregir
                  </button>
                )}
              </div>
              <select
                value={personaHistorialId ?? ''}
                onChange={e => setPersonaHistorialId(e.target.value || null)}
                style={{ ...fieldStyle, marginBottom: 10 }}
              >
                <option value="">Elegir persona…</option>
                {miembros.filter(m => m.auth_user_id).map(m => (
                  <option key={m.id} value={m.auth_user_id!}>{m.nombre} {m.apellido}</option>
                ))}
              </select>
              {personaHistorialId && (
                historialPersona.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Sin fichajes en los últimos 7 días</div>
                ) : (
                  <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                    {historialPersona.map((f, i) => (
                      <div key={f.id} style={{ borderBottom: i < historialPersona.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <FilaFichaje f={f} onClick={() => abrirEdicionFichaje(f)} />
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </>
        )}

        {/* Modal de edición manual (admin) */}
        <Modal open={!!editandoFichaje} onClose={() => setEditandoFichaje(null)} maxWidth={420}>
          {editandoFichaje && (
            <div style={{ padding: '20px 20px', paddingBottom: 'max(env(safe-area-inset-bottom, 20px), 20px)' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 14 }}>
                {editandoFichaje.id ? 'Corregir fichaje' : 'Agregar fichaje'} — {editandoFichaje.fecha}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Fecha</label>
                  <input type="date" style={fieldStyle} value={editandoFichaje.fecha}
                    onChange={e => setEditandoFichaje(prev => prev && { ...prev, fecha: e.target.value })} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Entrada</label>
                    <input type="time" style={fieldStyle} value={editandoFichaje.entrada}
                      onChange={e => setEditandoFichaje(prev => prev && { ...prev, entrada: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Salida</label>
                    <input type="time" style={fieldStyle} value={editandoFichaje.salida}
                      onChange={e => setEditandoFichaje(prev => prev && { ...prev, salida: e.target.value })} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button onClick={() => setEditandoFichaje(null)} style={{
                  flex: 1, padding: 14, borderRadius: 12, background: 'var(--bg)',
                  border: '1px solid var(--border)', fontSize: 14, fontWeight: 600,
                  color: 'var(--text-2)', cursor: 'pointer',
                }}>Cancelar</button>
                <button onClick={guardarEdicionFichaje} disabled={guardandoFichaje} style={{
                  flex: 1, padding: 14, borderRadius: 12, background: 'var(--navy)',
                  border: 'none', fontSize: 14, fontWeight: 700,
                  color: '#fff', cursor: 'pointer', opacity: guardandoFichaje ? 0.6 : 1,
                }}>{guardandoFichaje ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    )
  }
}
