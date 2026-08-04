'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  useCalendario,
  TIPO_CONFIG,
  type EventoCalendario,
  type TipoEvento,
} from '@/lib/hooks/useCalendario'
import { useTareas } from '@/lib/hooks/useTareas'
import { useMenus, type MenuConPreparaciones } from '@/lib/hooks/useMenus'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { useSheetOpenWhen } from '@/lib/ui/chrome'
import { createClient } from '@/lib/supabase/client'
import { activarMenuParaFechas, rangoFechas } from '@/lib/menus/activarMenu'

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
  const router = useRouter()
  const now = new Date()
  const [currentMonth, setCurrentMonth] = useState(now.getMonth() + 1)
  const [currentYear, setCurrentYear] = useState(now.getFullYear())
  const [selectedDate, setSelectedDate] = useState<string>(today())
  const [view, setView] = useState<'mes' | 'semana'>('mes')
  const [showForm, setShowForm] = useState(false)
  const [editEvento, setEditEvento] = useState<EventoCalendario | null>(null)

  const {
    eventos, proveedores, notas, loading,
    fetchEventos, crearEvento, actualizarEvento, eliminarEvento, guardarNota,
  } = useCalendario()
  const { agregarTarea } = useTareas()
  const { menus: catalogoMenus } = useMenus()
  const RESTAURANTE_ID = useRestauranteId()
  const isDesktop = useIsDesktop()
  useSheetOpenWhen(showForm)

  /* ── Planificar menú: activa un Menú del catálogo para un rango de días ── */
  const [showMenuPlan, setShowMenuPlan] = useState(false)
  useSheetOpenWhen(showMenuPlan)
  const [menuPlanMenuId, setMenuPlanMenuId] = useState('')
  const [menuPlanDesde, setMenuPlanDesde] = useState('')
  const [menuPlanHasta, setMenuPlanHasta] = useState('')
  const [activandoMenu, setActivandoMenu] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const openMenuPlan = () => {
    setMenuPlanMenuId('')
    setMenuPlanDesde(selectedDate)
    setMenuPlanHasta(selectedDate)
    setShowMenuPlan(true)
  }

  const handleActivarMenuRango = async () => {
    if (!RESTAURANTE_ID || !menuPlanMenuId) return
    const menu = catalogoMenus.find(m => m.id === menuPlanMenuId)
    if (!menu) return
    if (menu.preparaciones.length === 0) { showToast('Ese menú no tiene preparaciones cargadas'); return }
    if (menuPlanHasta < menuPlanDesde) { showToast('La fecha "hasta" no puede ser anterior a "desde"'); return }
    setActivandoMenu(true)
    try {
      const supabase = createClient()
      const fechas = rangoFechas(menuPlanDesde, menuPlanHasta)
      const { totalTareas, diasActivados, diasYaActivos } = await activarMenuParaFechas(supabase, RESTAURANTE_ID, menu, fechas)
      setShowMenuPlan(false)
      fetchEventos(currentMonth, currentYear)
      if (diasActivados === 0) showToast('Ese menú ya estaba activo en esas fechas')
      else if (fechas.length === 1) showToast(`Menú activado · ${totalTareas} ${totalTareas === 1 ? 'tarea' : 'tareas'} en Producción`)
      else showToast(`Menú activado en ${diasActivados} ${diasActivados === 1 ? 'día' : 'días'}${diasYaActivos > 0 ? ` (${diasYaActivos} ya activos)` : ''}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al activar el menú'
      showToast('Error: ' + msg)
    } finally {
      setActivandoMenu(false)
    }
  }

  /* ── Notas del día seleccionado — autoguardado ── */
  const [notaDraft, setNotaDraft] = useState('')
  const [notaToast, setNotaToast] = useState<string | null>(null)
  const notaTextareaRef = useRef<HTMLTextAreaElement>(null)
  const lastSelectedDateRef = useRef<string>('')
  const notaDebounced = useDebounce(notaDraft, 800)

  useEffect(() => {
    if (lastSelectedDateRef.current === selectedDate) return
    lastSelectedDateRef.current = selectedDate
    setNotaDraft(notas[selectedDate]?.contenido ?? '')
  }, [selectedDate, notas])

  useEffect(() => {
    const actual = notas[selectedDate]?.contenido ?? ''
    if (notaDebounced === actual) return
    if (lastSelectedDateRef.current !== selectedDate) return
    guardarNota(selectedDate, notaDebounced)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notaDebounced])

  useEffect(() => {
    if (!notaToast) return
    const t = setTimeout(() => setNotaToast(null), 2200)
    return () => clearTimeout(t)
  }, [notaToast])

  const convertirLineaEnTarea = async () => {
    const ta = notaTextareaRef.current
    if (!ta) return
    const cursor = ta.selectionStart ?? notaDraft.length
    const antes = notaDraft.slice(0, cursor)
    const inicioLinea = antes.lastIndexOf('\n') + 1
    const finLinea = notaDraft.indexOf('\n', cursor)
    const linea = notaDraft.slice(inicioLinea, finLinea === -1 ? undefined : finLinea).trim()
    if (!linea) {
      setNotaToast('Ubicá el cursor en una línea con texto')
      return
    }
    try {
      await agregarTarea({
        titulo: linea.slice(0, 120),
        descripcion: `Desde nota del calendario (${selectedDate})`,
        status: 'pendiente',
        estado: 'pendiente',
        prioridad: 'media',
        categoria: 'general',
        seccion: 'general',
        fecha_limite: selectedDate,
      })
      setNotaToast('Tarea creada')
    } catch {
      setNotaToast('No se pudo crear la tarea')
    }
  }

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

  const goHoy = () => {
    const n = new Date()
    setCurrentMonth(n.getMonth() + 1)
    setCurrentYear(n.getFullYear())
    setSelectedDate(today())
  }

  const esMesActual = currentMonth === now.getMonth() + 1 && currentYear === now.getFullYear()

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
    const diasConNota = Object.values(notas).filter(n => n.contenido.trim() !== '').length
    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'calendario',
      totalEventos: eventos.length,
      eventosHoy,
      eventosProximos,
      diaSeleccionado: selectedDate,
      notaDiaSeleccionado: notas[selectedDate]?.contenido?.slice(0, 300) || null,
      diasConNotaEsteMes: diasConNota,
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [eventos, eventosByDate, notas, selectedDate])
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

  /* Click en un día vacío de la grilla — crear directo, sin pasar por el FAB */
  const openNewFormFor = (dateStr: string) => {
    setSelectedDate(dateStr)
    setEditEvento(null)
    setFormData({
      titulo: '',
      tipo: 'otro',
      fecha_inicio: dateStr,
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
    if (ev._fromMenu) { router.push('/operaciones?tab=planificacion'); return }
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
    const formFields = (
      <>
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
      </>
    )

    if (isDesktop) {
      return (
        <div
          onClick={() => setShowForm(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 18, width: '100%', maxWidth: 560,
              maxHeight: 'calc(100dvh - 48px)', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              padding: '18px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
                {editEvento ? 'Editar evento' : 'Nuevo evento'}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {editEvento && (
                  <button onClick={handleDelete} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', padding: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>delete</span>
                  </button>
                )}
                <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', padding: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
                </button>
              </div>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {formFields}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
        {/* Header */}
        <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
          {formFields}
        </div>
      </div>
    )
  }

  /* ─── Render: Planificar menú (rango de días) ─── */
  if (showMenuPlan) {
    const menuSeleccionado = catalogoMenus.find(m => m.id === menuPlanMenuId) ?? null
    const cantidadDias = menuPlanDesde && menuPlanHasta && menuPlanHasta >= menuPlanDesde
      ? rangoFechas(menuPlanDesde, menuPlanHasta).length
      : 0

    const menuPlanFields = (
      <>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Desde</label>
            <input
              type="date"
              style={fieldStyle}
              value={menuPlanDesde}
              onChange={e => setMenuPlanDesde(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Hasta</label>
            <input
              type="date"
              style={fieldStyle}
              value={menuPlanHasta}
              onChange={e => setMenuPlanHasta(e.target.value)}
            />
          </div>
        </div>

        {cantidadDias > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {cantidadDias === 1 ? 'Se activa 1 día' : `Se activa en ${cantidadDias} días`}
          </div>
        )}

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Menú</label>
          {catalogoMenus.length === 0 ? (
            <div style={{ ...cardStyle, padding: 20, textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--text-3)' }}>menu_book</span>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '6px 0 0' }}>No hay menús en el catálogo. Armá uno en Carta → Menús.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {catalogoMenus.map((menu: MenuConPreparaciones) => {
                const sel = menuPlanMenuId === menu.id
                return (
                  <button
                    key={menu.id}
                    onClick={() => setMenuPlanMenuId(menu.id)}
                    style={{
                      textAlign: 'left', background: sel ? 'rgba(67,97,160,0.08)' : 'var(--surface)',
                      border: sel ? '2px solid var(--navy)' : '1px solid var(--border)',
                      borderRadius: 12, padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '.04em',
                        background: menu.tipo === 'evento' ? 'rgba(139,92,246,.14)' : 'rgba(14,165,233,.14)',
                        color: menu.tipo === 'evento' ? '#8b5cf6' : '#0ea5e9',
                      }}>
                        {menu.tipo === 'evento' ? 'Evento' : 'Fijo'}
                      </span>
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{menu.nombre}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{menu.preparaciones.length} prep.</span>
                    </div>
                    {menu.descripcion && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{menu.descripcion}</div>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button
            onClick={() => setShowMenuPlan(false)}
            style={{
              flex: 1, padding: '12px 20px', borderRadius: 12, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text-2)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleActivarMenuRango}
            disabled={!menuSeleccionado || activandoMenu || cantidadDias === 0}
            style={{
              ...btnPrimary,
              flex: 1,
              opacity: (!menuSeleccionado || activandoMenu || cantidadDias === 0) ? 0.5 : 1,
            }}
          >
            {activandoMenu ? 'Activando...' : 'Activar menú'}
          </button>
        </div>
      </>
    )

    if (isDesktop) {
      return (
        <div
          onClick={() => setShowMenuPlan(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 18, width: '100%', maxWidth: 560,
              maxHeight: 'calc(100dvh - 48px)', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              padding: '18px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Planificar menú</h2>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>Activa un menú del catálogo para un rango de días</p>
              </div>
              <button onClick={() => setShowMenuPlan(false)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', padding: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
              </button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {menuPlanFields}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
        <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setShowMenuPlan(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>arrow_back</span>
          </button>
          <div>
            <h1 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: 0 }}>Planificar menú</h1>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, margin: '2px 0 0' }}>Activa un menú para un rango de días</p>
          </div>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {menuPlanFields}
        </div>
      </div>
    )
  }

  /* ─── Render: Main calendar ─── */
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      {/* ── Header ── */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 }}>Calendario</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={openMenuPlan} title="Planificar menú" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 10, padding: isDesktop ? '8px 14px' : '8px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>restaurant_menu</span>
              {isDesktop && 'Planificar menú'}
            </button>
            <button onClick={openNewForm} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
              Nuevo evento
            </button>
          </div>
        </div>

        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
          {!esMesActual && (
            <button
              onClick={goHoy}
              style={{
                background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
                borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Hoy
            </button>
          )}
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

        {!loading && view === 'mes' && (() => {
          const maxPills = isDesktop ? 3 : 2

          const notasPanel = (
            <div style={{ ...cardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit_note</span>
                  Notas del día
                </div>
                {notaToast && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{notaToast}</span>}
              </div>
              <textarea
                ref={notaTextareaRef}
                value={notaDraft}
                onChange={e => setNotaDraft(e.target.value)}
                placeholder="Anotá pendientes de la semana, lo que se habló en una reunión..."
                style={{
                  width: '100%', minHeight: isDesktop ? 200 : 90, resize: 'vertical',
                  border: '1px solid var(--border)', borderRadius: 10, padding: 10,
                  fontSize: 13, color: 'var(--text-1)', background: 'var(--bg)', outline: 'none',
                  fontFamily: 'inherit', lineHeight: 1.5,
                }}
              />
              <button
                onClick={convertirLineaEnTarea}
                disabled={!notaDraft.trim()}
                style={{
                  alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6,
                  background: 'none', border: '1px solid var(--border)', borderRadius: 8,
                  padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text-2)',
                  cursor: notaDraft.trim() ? 'pointer' : 'default', opacity: notaDraft.trim() ? 1 : 0.5,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>task_alt</span>
                Convertir línea en tarea
              </button>
            </div>
          )

          const eventsList = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedEvents.length === 0 && (
                <div style={{ ...cardStyle, padding: 24, textAlign: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--text-3)' }}>event_available</span>
                  <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '8px 0 0' }}>Sin eventos este día</p>
                </div>
              )}
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
                        {ev._fromPedido ? 'local_shipping' : ev._fromMenu ? 'restaurant_menu' : cfg.icon}
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
          )

          const diaHeading = (
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', textTransform: 'capitalize' }}>
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          )

          return (
            <div style={isDesktop ? { display: 'flex', gap: 20, alignItems: 'flex-start' } : undefined}>
              <div style={{ flex: isDesktop ? 2 : undefined, minWidth: 0 }}>
                {/* Day headers */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 3, marginBottom: 4 }}>
                  {DIAS_SEMANA.map((d, i) => (
                    <div key={i} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', padding: '4px 0' }}>
                      {d}
                    </div>
                  ))}
                </div>

                {/* Calendar grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 3 }}>
                  {grid.map((cell, i) => {
                    const dateStr = toDateStr(cell.year, cell.month, cell.day)
                    const isToday = dateStr === today()
                    const isSelected = dateStr === selectedDate
                    const dayEvents = eventosByDate[dateStr] ?? []
                    const tieneNota = !!notas[dateStr]?.contenido?.trim()

                    return (
                      <div key={i} style={{ position: 'relative' }}>
                        <button
                          onClick={() => setSelectedDate(dateStr)}
                          style={{
                            width: '100%',
                            background: isSelected ? 'rgba(67,97,160,0.12)' : 'transparent',
                            border: isSelected ? '2px solid var(--navy)' : '1px solid var(--border)',
                            borderRadius: 10,
                            padding: isSelected ? '3px 5px 5px' : '4px 6px 6px',
                            cursor: 'pointer',
                            display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 3,
                            minHeight: isDesktop ? 118 : 64,
                            textAlign: 'left',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{
                              fontSize: 13,
                              fontWeight: isToday ? 700 : 500,
                              color: !cell.inMonth ? 'var(--text-3)' : 'var(--text-1)',
                              width: 22, height: 22, lineHeight: '22px', textAlign: 'center',
                              borderRadius: 11,
                              background: isToday ? 'var(--navy)' : 'transparent',
                              ...(isToday ? { color: '#fff' } : {}),
                            }}>
                              {cell.day}
                            </span>
                            {tieneNota && (
                              <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--text-3)' }}>edit_note</span>
                            )}
                          </div>

                          {dayEvents.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {dayEvents.slice(0, maxPills).map((ev, j) => {
                                const color = ev.color || TIPO_CONFIG[ev.tipo]?.color || '#6b7280'
                                return (
                                  <div
                                    key={j}
                                    style={{
                                      fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 4,
                                      background: color + '20', color, borderLeft: `2px solid ${color}`,
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {ev.titulo}
                                  </div>
                                )
                              })}
                              {dayEvents.length > maxPills && (
                                <span style={{ fontSize: 10, color: 'var(--text-3)', paddingLeft: 5 }}>
                                  +{dayEvents.length - maxPills} más
                                </span>
                              )}
                            </div>
                          )}
                        </button>

                        <button
                          onClick={(e) => { e.stopPropagation(); openNewFormFor(dateStr) }}
                          title="Nuevo evento este día"
                          style={{
                            position: 'absolute', bottom: 3, right: 3,
                            width: 18, height: 18, borderRadius: 9, border: 'none',
                            background: 'var(--surface)', color: 'var(--text-3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>add</span>
                        </button>
                      </div>
                    )
                  })}
                </div>

                {!isDesktop && (
                  <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {diaHeading}
                    {notasPanel}
                    {eventsList}
                  </div>
                )}
              </div>

              {isDesktop && (
                <div style={{ flex: 1, minWidth: 300, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {diaHeading}
                  {notasPanel}
                  {eventsList}
                </div>
              )}
            </div>
          )
        })()}

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

      {toast && (
        <div style={{
          position: 'fixed', bottom: 'max(env(safe-area-inset-bottom), 16px)', left: '50%', transform: 'translateX(-50%)',
          zIndex: 3000, padding: '10px 18px', borderRadius: 12, fontSize: 13, fontWeight: 600, color: '#fff',
          background: toast.startsWith('Error') ? '#ef4444' : 'var(--navy)', boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          maxWidth: '90vw', textAlign: 'center',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
