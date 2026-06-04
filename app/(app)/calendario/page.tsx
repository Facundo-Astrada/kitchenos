'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  useCalendario,
  TIPO_CONFIG,
  type EventoCalendario,
  type TipoEvento,
} from '@/lib/hooks/useCalendario'

/* ─── Helpers ─── */

const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const DIAS_NOMBRE = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const HORAS = Array.from({ length: 17 }, (_, i) => i + 7) // 7..23

function pad2(n: number) { return String(n).padStart(2, '0') }

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

function isSameDay(a: string, b: string) {
  return a === b
}

const today = () => {
  const d = new Date()
  return toDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/* Build calendar grid — returns array of {day, month, year, inMonth} for 6 rows x 7 cols */
function buildGrid(month: number, year: number) {
  const firstDay = new Date(year, month - 1, 1)
  let startDow = firstDay.getDay() // 0=Sun
  startDow = startDow === 0 ? 6 : startDow - 1 // Mon=0
  const daysInMonth = new Date(year, month, 0).getDate()

  // prev month
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const daysInPrev = new Date(prevYear, prevMonth, 0).getDate()

  const cells: { day: number; month: number; year: number; inMonth: boolean }[] = []

  // fill leading days from prev month
  for (let i = startDow - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, month: prevMonth, year: prevYear, inMonth: false })
  }
  // current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, month, year, inMonth: true })
  }
  // trailing days
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  let trailing = 1
  while (cells.length < 42) {
    cells.push({ day: trailing++, month: nextMonth, year: nextYear, inMonth: false })
  }
  return cells
}

function getWeekDates(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  let dow = d.getDay()
  dow = dow === 0 ? 6 : dow - 1 // Mon=0
  const monday = new Date(d)
  monday.setDate(d.getDate() - dow)
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday)
    dd.setDate(monday.getDate() + i)
    return {
      dateStr: toDateStr(dd.getFullYear(), dd.getMonth() + 1, dd.getDate()),
      dayNum: dd.getDate(),
      dayName: DIAS_NOMBRE[i],
    }
  })
}

/* ─── Styles ─── */

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text-1)',
  fontSize: 14,
  outline: 'none',
}

const btnPrimary: React.CSSProperties = {
  background: 'var(--navy)',
  color: '#fff',
  borderRadius: 12,
  padding: '12px 20px',
  border: 'none',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 12,
  border: '1px solid var(--border)',
}

/* ─── Page ─── */

export default function CalendarioPage() {
  const now = new Date()
  const [currentMonth, setCurrentMonth] = useState(now.getMonth() + 1)
  const [currentYear, setCurrentYear] = useState(now.getFullYear())
  const [selectedDate, setSelectedDate] = useState<string>(today())
  const [view, setView] = useState<'mes' | 'semana'>('mes')
  const [showForm, setShowForm] = useState(false)
  const [editEvento, setEditEvento] = useState<EventoCalendario | null>(null)

  const {
    eventos, proveedores, loading,
    fetchEventos, crearEvento, actualizarEvento, eliminarEvento,
  } = useCalendario()

  /* Fetch on month change */
  useEffect(() => {
    fetchEventos(currentMonth, currentYear)
  }, [currentMonth, currentYear, fetchEventos])

  /* Navigation */
  const goMonth = (dir: number) => {
    let m = currentMonth + dir
    let y = currentYear
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    setCurrentMonth(m)
    setCurrentYear(y)
  }

  /* Events by date map */
  const eventosByDate = useMemo(() => {
    const map: Record<string, EventoCalendario[]> = {}
    for (const ev of eventos) {
      const key = ev.fecha_inicio
      if (!map[key]) map[key] = []
      map[key].push(ev)
    }
    return map
  }, [eventos])

  const grid = useMemo(() => buildGrid(currentMonth, currentYear), [currentMonth, currentYear])

  useEffect(() => {
    const hoyStr = today()
    const eventosHoy = (eventosByDate[hoyStr] ?? []).length
    const eventosProximos = Object.entries(eventosByDate)
      .filter(([k]) => k >= hoyStr)
      .flatMap(([, evs]) => evs)
      .slice(0, 3)
      .map(ev => ({ titulo: ev.titulo, fecha: ev.fecha_inicio }))
    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'calendario',
      totalEventos: eventos.length,
      eventosHoy,
      eventosProximos,
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [eventos, eventosByDate])
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate])
  const selectedEvents = eventosByDate[selectedDate] ?? []

  /* Form state */
  const [formData, setFormData] = useState({
    titulo: '',
    tipo: 'otro' as TipoEvento,
    fecha_inicio: today(),
    hora_inicio: '08:00',
    hora_fin: '09:00',
    descripcion: '',
    proveedor_id: '',
    recurrente: false,
    frecuencia: 'semanal',
  })

  const openNewForm = () => {
    setEditEvento(null)
    setFormData({
      titulo: '',
      tipo: 'otro',
      fecha_inicio: selectedDate,
      hora_inicio: '08:00',
      hora_fin: '09:00',
      descripcion: '',
      proveedor_id: '',
      recurrente: false,
      frecuencia: 'semanal',
    })
    setShowForm(true)
  }

  const openEditForm = (ev: EventoCalendario) => {
    if (ev._fromPedido) return
    setEditEvento(ev)
    setFormData({
      titulo: ev.titulo,
      tipo: ev.tipo,
      fecha_inicio: ev.fecha_inicio,
      hora_inicio: ev.hora_inicio?.slice(0, 5) ?? '08:00',
      hora_fin: ev.hora_fin?.slice(0, 5) ?? '09:00',
      descripcion: ev.descripcion ?? '',
      proveedor_id: ev.proveedor_id ?? '',
      recurrente: ev.recurrente,
      frecuencia: ev.frecuencia ?? 'semanal',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    const payload: any = {
      titulo: formData.titulo,
      tipo: formData.tipo,
      fecha_inicio: formData.fecha_inicio,
      fecha_fin: null,
      hora_inicio: formData.hora_inicio + ':00',
      hora_fin: formData.hora_fin + ':00',
      descripcion: formData.descripcion || null,
      recurrente: formData.recurrente,
      frecuencia: formData.recurrente ? formData.frecuencia : null,
      color: TIPO_CONFIG[formData.tipo].color,
      proveedor_id: formData.tipo === 'entrega_proveedor' && formData.proveedor_id ? formData.proveedor_id : null,
      usuario_id: null,
    }

    try {
      if (editEvento) {
        await actualizarEvento(editEvento.id, payload)
      } else {
        await crearEvento(payload)
      }
      setShowForm(false)
      fetchEventos(currentMonth, currentYear)
    } catch (e) {
      console.error(e)
    }
  }

  const handleDelete = async () => {
    if (!editEvento) return
    try {
      await eliminarEvento(editEvento.id)
      setShowForm(false)
      fetchEventos(currentMonth, currentYear)
    } catch (e) {
      console.error(e)
    }
  }

  /* ─── Render: Form overlay ─── */
  if (showForm) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
        {/* Header */}
        <div style={{ background: 'var(--navy)', padding: '46px 16px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24 }}>arrow_back</span>
            </button>
            <h1 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: 0 }}>
              {editEvento ? 'Editar evento' : 'Nuevo evento'}
            </h1>
          </div>
          {editEvento && (
            <button onClick={handleDelete} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>delete</span>
            </button>
          )}
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Título */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Título</label>
            <input
              style={fieldStyle}
              placeholder="Nombre del evento"
              value={formData.titulo}
              onChange={e => setFormData(p => ({ ...p, titulo: e.target.value }))}
            />
          </div>

          {/* Tipo pills */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Tipo</label>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {(Object.keys(TIPO_CONFIG) as TipoEvento[]).map(t => {
                const cfg = TIPO_CONFIG[t]
                const sel = formData.tipo === t
                return (
                  <button
                    key={t}
                    onClick={() => setFormData(p => ({ ...p, tipo: t }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 14px', borderRadius: 20,
                      border: sel ? `2px solid ${cfg.color}` : '1px solid var(--border)',
                      background: sel ? cfg.color + '18' : 'var(--surface)',
                      color: sel ? cfg.color : 'var(--text-2)',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{cfg.icon}</span>
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Fecha */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Fecha inicio</label>
            <input
              type="date"
              style={fieldStyle}
              value={formData.fecha_inicio}
              onChange={e => setFormData(p => ({ ...p, fecha_inicio: e.target.value }))}
            />
          </div>

          {/* Hora inicio / fin */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Hora inicio</label>
              <input
                type="time"
                style={fieldStyle}
                value={formData.hora_inicio}
                onChange={e => setFormData(p => ({ ...p, hora_inicio: e.target.value }))}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Hora fin</label>
              <input
                type="time"
                style={fieldStyle}
                value={formData.hora_fin}
                onChange={e => setFormData(p => ({ ...p, hora_fin: e.target.value }))}
              />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Descripción</label>
            <textarea
              style={{ ...fieldStyle, minHeight: 80, resize: 'vertical' }}
              placeholder="Notas adicionales..."
              value={formData.descripcion}
              onChange={e => setFormData(p => ({ ...p, descripcion: e.target.value }))}
            />
          </div>

          {/* Proveedor dropdown (only if entrega_proveedor) */}
          {formData.tipo === 'entrega_proveedor' && (
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Proveedor</label>
              <select
                style={fieldStyle}
                value={formData.proveedor_id}
                onChange={e => setFormData(p => ({ ...p, proveedor_id: e.target.value }))}
              >
                <option value="">Seleccionar proveedor</option>
                {proveedores.map(pv => (
                  <option key={pv.id} value={pv.id}>{pv.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {/* Recurrente */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>Recurrente</label>
            <button
              onClick={() => setFormData(p => ({ ...p, recurrente: !p.recurrente }))}
              style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: formData.recurrente ? 'var(--navy)' : 'var(--border)',
                position: 'relative', transition: 'background .2s',
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: 9, background: '#fff',
                position: 'absolute', top: 3,
                left: formData.recurrente ? 23 : 3,
                transition: 'left .2s',
              }} />
            </button>
          </div>

          {formData.recurrente && (
            <div style={{ display: 'flex', gap: 8 }}>
              {['diaria', 'semanal', 'mensual'].map(f => (
                <button
                  key={f}
                  onClick={() => setFormData(p => ({ ...p, frecuencia: f }))}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 600,
                    border: formData.frecuencia === f ? '2px solid var(--navy)' : '1px solid var(--border)',
                    background: formData.frecuencia === f ? 'var(--navy)' : 'var(--surface)',
                    color: formData.frecuencia === f ? '#fff' : 'var(--text-2)',
                    cursor: 'pointer', textTransform: 'capitalize',
                  }}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button
              onClick={() => setShowForm(false)}
              style={{
                flex: 1, padding: '12px 20px', borderRadius: 12, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text-2)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!formData.titulo.trim()}
              style={{
                ...btnPrimary,
                flex: 1,
                opacity: formData.titulo.trim() ? 1 : 0.5,
              }}
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ─── Render: Main calendar ─── */
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      {/* ── Header ── */}
      <div style={{ background: 'var(--navy)', padding: '46px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 }}>Calendario</h1>
          <button onClick={openNewForm} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            Nuevo evento
          </button>
        </div>

        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => goMonth(-1)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>chevron_left</span>
          </button>
          <span style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>
            {MESES[currentMonth - 1]} {currentYear}
          </span>
          <button onClick={() => goMonth(1)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>chevron_right</span>
          </button>
        </div>

        {/* View toggle pills */}
        <div style={{ display: 'flex', gap: 0, marginTop: 12, background: 'rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden' }}>
          {(['mes', 'semana'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                flex: 1, padding: '8px 0', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: view === v ? 'rgba(255,255,255,0.25)' : 'transparent',
                color: '#fff',
              }}
            >
              {v === 'mes' ? 'Mes' : 'Semana'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: 16 }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)', fontSize: 13 }}>
            Cargando...
          </div>
        )}

        {!loading && view === 'mes' && (
          <>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
              {DIAS_SEMANA.map((d, i) => (
                <div key={i} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', padding: '4px 0' }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
              {grid.map((cell, i) => {
                const dateStr = toDateStr(cell.year, cell.month, cell.day)
                const isToday = dateStr === today()
                const isSelected = dateStr === selectedDate
                const dayEvents = eventosByDate[dateStr] ?? []

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(dateStr)}
                    style={{
                      background: isSelected ? 'var(--navy)' : 'transparent',
                      border: 'none',
                      borderRadius: 10,
                      padding: '6px 2px',
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      minHeight: 44,
                    }}
                  >
                    <span style={{
                      fontSize: 14,
                      fontWeight: isToday ? 700 : 400,
                      color: isSelected ? '#fff' : !cell.inMonth ? 'var(--text-3)' : 'var(--text-1)',
                      width: 28, height: 28, lineHeight: '28px', textAlign: 'center',
                      borderRadius: 14,
                      background: isToday && !isSelected ? 'var(--navy)' : 'transparent',
                      ...(isToday && !isSelected ? { color: '#fff' } : {}),
                    }}>
                      {cell.day}
                    </span>
                    {/* Event dots */}
                    {dayEvents.length > 0 && (
                      <div style={{ display: 'flex', gap: 3 }}>
                        {dayEvents.slice(0, 3).map((ev, j) => (
                          <div
                            key={j}
                            style={{
                              width: 6, height: 6, borderRadius: 3,
                              background: ev.color || TIPO_CONFIG[ev.tipo]?.color || '#6b7280',
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Selected day event list */}
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 10 }}>
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>

              {selectedEvents.length === 0 && (
                <div style={{ ...cardStyle, padding: 24, textAlign: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--text-3)' }}>event_available</span>
                  <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '8px 0 0' }}>Sin eventos este día</p>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedEvents.map(ev => {
                  const cfg = TIPO_CONFIG[ev.tipo] ?? TIPO_CONFIG.otro
                  return (
                    <button
                      key={ev.id}
                      onClick={() => openEditForm(ev)}
                      style={{
                        ...cardStyle,
                        padding: '12px 14px',
                        display: 'flex', alignItems: 'center', gap: 12,
                        borderLeft: `4px solid ${ev.color || cfg.color}`,
                        cursor: ev._fromPedido ? 'default' : 'pointer',
                        textAlign: 'left', width: '100%',
                      }}
                    >
                      <div style={{
                        width: 38, height: 38, borderRadius: 10,
                        background: (ev.color || cfg.color) + '18',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: ev.color || cfg.color }}>
                          {ev._fromPedido ? 'local_shipping' : cfg.icon}
                        </span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ev.titulo}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                            {ev.hora_inicio?.slice(0, 5)} - {ev.hora_fin?.slice(0, 5)}
                          </span>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
                            background: (ev.color || cfg.color) + '18',
                            color: ev.color || cfg.color,
                          }}>
                            {cfg.label}
                          </span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* ── Weekly view ── */}
        {!loading && view === 'semana' && (
          <div>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(7,1fr)', gap: 0, marginBottom: 8 }}>
              <div />
              {weekDates.map(wd => {
                const isToday_ = wd.dateStr === today()
                const isSel = wd.dateStr === selectedDate
                return (
                  <button
                    key={wd.dateStr}
                    onClick={() => setSelectedDate(wd.dateStr)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 0',
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>{wd.dayName}</span>
                    <span style={{
                      fontSize: 14, fontWeight: isToday_ ? 700 : 500,
                      width: 28, height: 28, lineHeight: '28px', textAlign: 'center',
                      borderRadius: 14,
                      background: isSel ? 'var(--navy)' : isToday_ ? 'var(--navy)' : 'transparent',
                      color: (isSel || isToday_) ? '#fff' : 'var(--text-1)',
                    }}>
                      {wd.dayNum}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Time grid */}
            <div style={{ position: 'relative', overflowY: 'auto', maxHeight: 'calc(100dvh - 280px)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(7,1fr)', gap: 0 }}>
                {HORAS.map(h => (
                  <div key={h} style={{ display: 'contents' }}>
                    {/* Hour label */}
                    <div style={{
                      fontSize: 11, color: 'var(--text-3)', textAlign: 'right', paddingRight: 8,
                      height: 48, lineHeight: '48px', borderTop: '1px solid var(--border)',
                    }}>
                      {pad2(h)}:00
                    </div>
                    {/* Day columns */}
                    {weekDates.map(wd => {
                      const dayEvts = (eventosByDate[wd.dateStr] ?? []).filter(ev => {
                        const evHour = parseInt(ev.hora_inicio?.slice(0, 2) ?? '0', 10)
                        return evHour === h
                      })
                      return (
                        <div
                          key={wd.dateStr + h}
                          style={{
                            height: 48,
                            borderTop: '1px solid var(--border)',
                            borderLeft: '1px solid var(--border)',
                            position: 'relative',
                            padding: 1,
                          }}
                        >
                          {dayEvts.map(ev => {
                            const cfg = TIPO_CONFIG[ev.tipo] ?? TIPO_CONFIG.otro
                            return (
                              <button
                                key={ev.id}
                                onClick={() => openEditForm(ev)}
                                style={{
                                  width: '100%',
                                  background: (ev.color || cfg.color) + '30',
                                  borderLeft: `3px solid ${ev.color || cfg.color}`,
                                  borderRadius: 4,
                                  padding: '2px 3px',
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: ev.color || cfg.color,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  textAlign: 'left',
                                  border: 'none',
                                  borderLeftStyle: 'solid',
                                  borderLeftWidth: 3,
                                  borderLeftColor: ev.color || cfg.color,
                                  cursor: ev._fromPedido ? 'default' : 'pointer',
                                  height: '100%',
                                  display: 'block',
                                }}
                              >
                                {ev.titulo}
                              </button>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
