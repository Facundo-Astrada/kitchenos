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
    miembros, turnos, loading,
    fetchTurnos, fetchTurnosMes, asignarTurno, limpiarTurno,
  } = useEquipo()
  const { user } = useAuth()
  const { isAdmin } = usePermisos()
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

  const turnoMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const t of turnos) m[`${t.miembro_id}_${t.fecha}`] = t.turno_tipo
    return m
  }, [turnos])

  // ── Handlers: Turnos ──

  async function handleCycleTurno(miembroId: string, fecha: string, currentTipo: TurnoTipo | undefined) {
    const idx = currentTipo ? TURNO_TIPOS.indexOf(currentTipo) : -1
    const next = TURNO_TIPOS[(idx + 1) % TURNO_TIPOS.length]
    try {
      await asignarTurno(miembroId, fecha, next)
      await fetchTurnos(weekStart, weekEnd)
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error al asignar turno') }
  }

  async function handleClearTurno(miembroId: string, fecha: string) {
    try {
      await limpiarTurno(miembroId, fecha)
      await fetchTurnos(weekStart, weekEnd)
    } catch {}
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
    return (
      <div style={{ padding: 16 }}>
        {/* Selector de semana */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <button onClick={() => setWeekOffset(o => o - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
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
          <button onClick={() => setWeekOffset(o => o + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>chevron_right</span>
          </button>
        </div>

        {/* Grilla */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 400 }}>
            <thead>
              <tr>
                <th style={{ width: 70, padding: '6px 4px', fontSize: 11, color: 'var(--text-3)', textAlign: 'left', fontWeight: 600, position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 2 }} />
                {weekDates.map((d, i) => (
                  <th key={i} style={{ padding: '6px 2px', fontSize: 11, color: 'var(--text-3)', textAlign: 'center', fontWeight: 600 }}>
                    <div>{DIAS[i]}</div>
                    <div style={{ fontWeight: 700, color: 'var(--text-2)' }}>{d.getDate()}</div>
                  </th>
                ))}
                <th style={{ width: 36, padding: '6px 2px', fontSize: 9, color: 'var(--text-3)', textAlign: 'center', fontWeight: 700 }}>Hs</th>
              </tr>
            </thead>
            <tbody>
              {miembros.map(m => (
                <tr key={m.id}>
                  <td style={{ padding: '4px 4px', fontSize: 12, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 70, position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1 }}>
                    {m.nombre.slice(0, 3)}.{m.apellido?.[0] ?? ''}
                  </td>
                  {weekDates.map((d, i) => {
                    const dateStr = fmtDate(d)
                    const tipo = turnoMap[`${m.id}_${dateStr}`] as TurnoTipo | undefined
                    return (
                      <td key={i} style={{ padding: 2, textAlign: 'center' }}>
                        <div
                          onClick={() => handleCycleTurno(m.id, dateStr, tipo)}
                          onTouchStart={() => { longPressTimer.current = setTimeout(() => handleClearTurno(m.id, dateStr), 600) }}
                          onTouchEnd={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }}
                          onTouchMove={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }}
                          style={{
                            width: 44, height: 44, borderRadius: 10,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', margin: '0 auto',
                            background: tipo ? TURNO_CONFIG[tipo].bg : 'var(--surface)',
                            border: tipo ? 'none' : '1px dashed var(--border)',
                            color: tipo ? TURNO_CONFIG[tipo].color : 'var(--text-3)',
                            fontSize: tipo ? 15 : 18, fontWeight: 700,
                            userSelect: 'none', WebkitUserSelect: 'none',
                          }}
                        >
                          {tipo ? TURNO_CONFIG[tipo].label : '+'}
                        </div>
                      </td>
                    )
                  })}
                  <td style={{ padding: '4px 2px', textAlign: 'center' }}>
                    {(() => {
                      const HOURS: Record<string, number> = { mañana: 8, tarde: 8, noche: 8, franco: 0, vacaciones: 0 }
                      let total = 0
                      weekDates.forEach(d => { const t = turnoMap[`${m.id}_${fmtDate(d)}`]; if (t) total += HOURS[t] ?? 0 })
                      return (
                        <span style={{ fontSize: 11, fontWeight: 700, color: total > 48 ? '#ef4444' : total > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
                          {total}
                        </span>
                      )
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {miembros.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
            Agrega miembros del equipo primero
          </div>
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
                  const HOURS: Record<string, number> = { mañana: 8, tarde: 8, noche: 8, franco: 0, vacaciones: 0 }
                  const mTurnos = turnosMes.filter(t => t.miembro_id === m.id)
                  const totalHs = mTurnos.reduce((acc, t) => acc + (HOURS[t.turno_tipo] ?? 0), 0)
                  const dias = mTurnos.filter(t => t.turno_tipo !== 'franco' && t.turno_tipo !== 'vacaciones').length
                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)', gap: 10 }}>
                      <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{m.nombre} {m.apellido}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{dias} días</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: totalHs > 176 ? '#ef4444' : totalHs > 0 ? 'var(--navy)' : 'var(--text-3)', minWidth: 40, textAlign: 'right' }}>
                        {totalHs}h
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
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
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', minWidth: 40, textAlign: 'right' }}>
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
                  <button onClick={() => abrirEdicionFichaje()} style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', background: 'none', border: 'none', cursor: 'pointer' }}>
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
        {editandoFichaje && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.5)' }} onClick={() => setEditandoFichaje(null)} />
            <div style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
              background: 'var(--surface)', borderRadius: '20px 20px 0 0',
              padding: '20px 20px', paddingBottom: 'max(env(safe-area-inset-bottom, 20px), 20px)',
            }}>
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
          </>
        )}
      </div>
    )
  }
}
