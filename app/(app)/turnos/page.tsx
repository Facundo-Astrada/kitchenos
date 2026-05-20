'use client'

import PageTransition from '@/components/PageTransition'
import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useEquipo, TURNO_CONFIG, type Miembro, type Puesto, type TurnoTipo } from '@/lib/hooks/useEquipo'

// ── Helpers ──

const PLAZAS = ['parrilla', 'frios', 'calientes', 'pase', 'pasteleria', 'panaderia']
const ROLES = ['chef', 'cocinero', 'ayudante', 'pastelero', 'panadero', 'parrillero', 'encargado', 'mozo']
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const TURNO_TIPOS = Object.keys(TURNO_CONFIG) as TurnoTipo[]

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

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function fmtDateShort(d: Date) {
  return `${d.getDate()}/${d.getMonth() + 1}`
}

function getInitials(nombre: string, apellido: string) {
  return ((nombre?.[0] ?? '') + (apellido?.[0] ?? '')).toUpperCase()
}

const ROL_COLORS: Record<string, string> = {
  chef: '#ef4444',
  cocinero: '#f59e0b',
  ayudante: '#10b981',
  pastelero: '#ec4899',
  panadero: '#8b5cf6',
  parrillero: '#f97316',
  encargado: '#3b82f6',
  mozo: '#4361a0',
}

function rolColor(rol: string) {
  return ROL_COLORS[rol?.toLowerCase()] ?? '#6b7280'
}

// ── Styles ──

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

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-2)',
  marginBottom: 4,
  display: 'block',
}

const btnPrimary: React.CSSProperties = {
  padding: '12px 20px',
  borderRadius: 12,
  background: 'var(--navy)',
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
  width: '100%',
  textAlign: 'center',
}

const btnSecondary: React.CSSProperties = {
  padding: '12px 20px',
  borderRadius: 12,
  background: 'var(--surface)',
  color: 'var(--text-1)',
  fontSize: 14,
  fontWeight: 600,
  border: '1px solid var(--border)',
  cursor: 'pointer',
  width: '100%',
  textAlign: 'center',
}

const btnDanger: React.CSSProperties = {
  padding: '12px 20px',
  borderRadius: 12,
  background: '#fee2e2',
  color: '#dc2626',
  fontSize: 14,
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
  width: '100%',
  textAlign: 'center',
}

// ── Types ──

type Tab = 'equipo' | 'turnos' | 'puestos'

type EquipoView = 'list' | 'ficha' | 'nuevo'
type PuestosView = 'list' | 'detalle' | 'nuevo'

interface MiembroForm {
  nombre: string
  apellido: string
  rol: string
  puesto_id: string
  plaza_asignada: string
  telefono: string
  email: string
  fecha_ingreso: string
}

const EMPTY_MIEMBRO_FORM: MiembroForm = {
  nombre: '',
  apellido: '',
  rol: '',
  puesto_id: '',
  plaza_asignada: '',
  telefono: '',
  email: '',
  fecha_ingreso: '',
}

interface PuestoForm {
  nombre: string
  descripcion: string
  tareas_funciones: string
  permisos_app: string
}

const EMPTY_PUESTO_FORM: PuestoForm = {
  nombre: '',
  descripcion: '',
  tareas_funciones: '',
  permisos_app: '',
}

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════

export default function TurnosPage() {
  const {
    miembros, turnos, puestos, loading,
    crearMiembro, actualizarMiembro, desactivarMiembro,
    fetchTurnos, asignarTurno, limpiarTurno,
    crearPuesto, actualizarPuesto,
  } = useEquipo()

  const [tab, setTab] = useState<Tab>('equipo')

  // ── Equipo state ──
  const [equipoView, setEquipoView] = useState<EquipoView>('list')
  const [selectedMiembro, setSelectedMiembro] = useState<Miembro | null>(null)
  const [editingMiembro, setEditingMiembro] = useState(false)
  const [miembroForm, setMiembroForm] = useState<MiembroForm>(EMPTY_MIEMBRO_FORM)
  const [saving, setSaving] = useState(false)

  // ── Turnos state ──
  const [weekOffset, setWeekOffset] = useState(0)
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset])
  const weekStart = fmtDate(weekDates[0])
  const weekEnd = fmtDate(weekDates[6])
  const [popupCell, setPopupCell] = useState<{ miembroId: string; fecha: string } | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Puestos state ──
  const [puestosView, setPuestosView] = useState<PuestosView>('list')
  const [selectedPuesto, setSelectedPuesto] = useState<Puesto | null>(null)
  const [editingPuesto, setEditingPuesto] = useState(false)
  const [puestoForm, setPuestoForm] = useState<PuestoForm>(EMPTY_PUESTO_FORM)

  // Fetch turnos on week change
  useEffect(() => {
    fetchTurnos(weekStart, weekEnd)
  }, [weekStart, weekEnd, fetchTurnos])

  // Reset sub-views when switching tabs
  useEffect(() => {
    setEquipoView('list')
    setSelectedMiembro(null)
    setEditingMiembro(false)
    setPuestosView('list')
    setSelectedPuesto(null)
    setEditingPuesto(false)
    setPopupCell(null)
  }, [tab])

  // ── Turno lookup helper ──
  const turnoMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const t of turnos) {
      m[`${t.miembro_id}_${t.fecha}`] = t.turno_tipo
    }
    return m
  }, [turnos])

  // ── Puesto name helper ──
  const puestoName = useCallback((puestoId: string | null) => {
    if (!puestoId) return '—'
    return puestos.find((p) => p.id === puestoId)?.nombre ?? '—'
  }, [puestos])

  // ── Miembro count per puesto ──
  const miembroCountByPuesto = useMemo(() => {
    const m: Record<string, number> = {}
    for (const mi of miembros) {
      if (mi.puesto_id) {
        m[mi.puesto_id] = (m[mi.puesto_id] ?? 0) + 1
      }
    }
    return m
  }, [miembros])

  // ════════════════════════════════════════════════
  // HANDLERS
  // ════════════════════════════════════════════════

  function openFicha(m: Miembro) {
    setSelectedMiembro(m)
    setEditingMiembro(false)
    setEquipoView('ficha')
  }

  function startEditMiembro() {
    if (!selectedMiembro) return
    setMiembroForm({
      nombre: selectedMiembro.nombre,
      apellido: selectedMiembro.apellido,
      rol: selectedMiembro.rol ?? '',
      puesto_id: selectedMiembro.puesto_id ?? '',
      plaza_asignada: selectedMiembro.plaza_asignada ?? '',
      telefono: selectedMiembro.telefono ?? '',
      email: selectedMiembro.email ?? '',
      fecha_ingreso: selectedMiembro.fecha_ingreso ?? '',
    })
    setEditingMiembro(true)
  }

  async function saveEditMiembro() {
    if (!selectedMiembro) return
    setSaving(true)
    try {
      await actualizarMiembro(selectedMiembro.id, {
        nombre: miembroForm.nombre,
        apellido: miembroForm.apellido,
        rol: miembroForm.rol || undefined,
        puesto_id: miembroForm.puesto_id || null,
        plaza_asignada: miembroForm.plaza_asignada || null,
        telefono: miembroForm.telefono || null,
        email: miembroForm.email || null,
        fecha_ingreso: miembroForm.fecha_ingreso || null,
      })
      setEditingMiembro(false)
      setEquipoView('list')
      setSelectedMiembro(null)
    } catch (e: any) {
      alert(e.message)
    }
    setSaving(false)
  }

  async function handleDesactivar() {
    if (!selectedMiembro) return
    if (!confirm(`¿Desactivar a ${selectedMiembro.nombre} ${selectedMiembro.apellido}?`)) return
    try {
      await desactivarMiembro(selectedMiembro.id)
      setEquipoView('list')
      setSelectedMiembro(null)
    } catch (e: any) {
      alert(e.message)
    }
  }

  function openNuevoMiembro() {
    setMiembroForm(EMPTY_MIEMBRO_FORM)
    setEquipoView('nuevo')
  }

  async function saveNuevoMiembro() {
    if (!miembroForm.nombre.trim() || !miembroForm.apellido.trim()) {
      alert('Nombre y apellido son obligatorios')
      return
    }
    setSaving(true)
    try {
      await crearMiembro({
        auth_user_id: null,
        nombre: miembroForm.nombre.trim(),
        apellido: miembroForm.apellido.trim(),
        rol: miembroForm.rol || '',
        puesto_id: miembroForm.puesto_id || null,
        plaza_asignada: miembroForm.plaza_asignada || null,
        telefono: miembroForm.telefono || null,
        email: miembroForm.email || null,
        fecha_ingreso: miembroForm.fecha_ingreso || null,
        foto_url: null,
      })
      setEquipoView('list')
    } catch (e: any) {
      alert(e.message)
    }
    setSaving(false)
  }

  async function handleAsignarTurno(miembroId: string, fecha: string, tipo: TurnoTipo) {
    try {
      await asignarTurno(miembroId, fecha, tipo)
      await fetchTurnos(weekStart, weekEnd)
    } catch (e: any) {
      alert(e.message)
    }
    setPopupCell(null)
  }

  async function handleCycleTurno(miembroId: string, fecha: string, currentTipo: TurnoTipo | undefined) {
    const idx = currentTipo ? TURNO_TIPOS.indexOf(currentTipo) : -1
    const next = TURNO_TIPOS[(idx + 1) % TURNO_TIPOS.length]
    try {
      await asignarTurno(miembroId, fecha, next)
      await fetchTurnos(weekStart, weekEnd)
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function handleClearTurno(miembroId: string, fecha: string) {
    try {
      await limpiarTurno(miembroId, fecha)
      await fetchTurnos(weekStart, weekEnd)
    } catch {
      // ignore silently
    }
  }

  function openPuestoDetalle(p: Puesto) {
    setSelectedPuesto(p)
    setEditingPuesto(false)
    setPuestosView('detalle')
  }

  function startEditPuesto() {
    if (!selectedPuesto) return
    setPuestoForm({
      nombre: selectedPuesto.nombre,
      descripcion: selectedPuesto.descripcion ?? '',
      tareas_funciones: (selectedPuesto.tareas_funciones ?? []).join('\n'),
      permisos_app: (selectedPuesto.permisos_app ?? []).join('\n'),
    })
    setEditingPuesto(true)
  }

  async function saveEditPuesto() {
    if (!selectedPuesto) return
    setSaving(true)
    try {
      await actualizarPuesto(selectedPuesto.id, {
        nombre: puestoForm.nombre,
        descripcion: puestoForm.descripcion || null,
        tareas_funciones: puestoForm.tareas_funciones.split('\n').map((s) => s.trim()).filter(Boolean),
        permisos_app: puestoForm.permisos_app.split('\n').map((s) => s.trim()).filter(Boolean),
      })
      setEditingPuesto(false)
      setPuestosView('list')
      setSelectedPuesto(null)
    } catch (e: any) {
      alert(e.message)
    }
    setSaving(false)
  }

  function openNuevoPuesto() {
    setPuestoForm(EMPTY_PUESTO_FORM)
    setPuestosView('nuevo')
  }

  async function saveNuevoPuesto() {
    if (!puestoForm.nombre.trim()) {
      alert('El nombre es obligatorio')
      return
    }
    setSaving(true)
    try {
      await crearPuesto({
        nombre: puestoForm.nombre.trim(),
        descripcion: puestoForm.descripcion || null,
        tareas_funciones: puestoForm.tareas_funciones.split('\n').map((s) => s.trim()).filter(Boolean),
        permisos_app: puestoForm.permisos_app.split('\n').map((s) => s.trim()).filter(Boolean),
      })
      setPuestosView('list')
    } catch (e: any) {
      alert(e.message)
    }
    setSaving(false)
  }

  // ════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════

  return (
    <PageTransition>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* ── HEADER ── */}
      <div style={{ background: 'var(--navy)', padding: '46px 16px 14px' }}>
        <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0, marginBottom: 14 }}>Equipo</h1>
        <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: 3 }}>
          {(['equipo', 'turnos', 'puestos'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: '8px 0',
                borderRadius: 8,
                border: 'none',
                background: tab === t ? '#fff' : 'transparent',
                color: tab === t ? 'var(--navy)' : 'rgba(255,255,255,0.7)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {t === 'equipo' ? 'Equipo' : t === 'turnos' ? 'Turnos' : 'Puestos'}
            </button>
          ))}
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 80px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--text-3)', fontSize: 32, animation: 'spin 1s linear infinite' }}>progress_activity</span>
          </div>
        ) : (
          <>
            {tab === 'equipo' && <TabEquipo />}
            {tab === 'turnos' && <TabTurnos />}
            {tab === 'puestos' && <TabPuestos />}
          </>
        )}
      </div>
    </div>
    </PageTransition>
  )

  // ══════════════════════════════════════════════════════════════
  // TAB: EQUIPO
  // ══════════════════════════════════════════════════════════════

  function TabEquipo() {
    if (equipoView === 'ficha' && selectedMiembro) return <FichaMiembroView />
    if (equipoView === 'nuevo') return <NuevoMiembroView />

    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {miembros.map((m) => (
          <div
            key={m.id}
            onClick={() => openFicha(m)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 14,
              background: 'var(--surface)',
              borderRadius: 14,
              border: '1px solid var(--border)',
              cursor: 'pointer',
            }}
          >
            {/* Avatar */}
            <div style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: rolColor(m.rol),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              flexShrink: 0,
            }}>
              {getInitials(m.nombre, m.apellido)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>
                {m.nombre} {m.apellido}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                {puestoName(m.puesto_id)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              {m.plaza_asignada && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: '#dbeafe',
                  color: '#1e40af',
                }}>
                  {m.plaza_asignada}
                </span>
              )}
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: 6,
                background: m.activo ? '#d1fae5' : '#fee2e2',
                color: m.activo ? '#065f46' : '#991b1b',
              }}>
                {m.activo ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          </div>
        ))}

        {miembros.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
            No hay miembros del equipo
          </div>
        )}

        <button onClick={openNuevoMiembro} style={{ ...btnPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
          Agregar miembro
        </button>
      </div>
    )
  }

  // ── FICHA MIEMBRO ──

  function FichaMiembroView() {
    const m = selectedMiembro!

    if (editingMiembro) {
      return (
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <button onClick={() => setEditingMiembro(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>arrow_back</span>
            </button>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Editar miembro</h2>
          </div>
          {renderMiembroForm()}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={() => setEditingMiembro(false)} style={btnSecondary}>Cancelar</button>
            <button onClick={saveEditMiembro} disabled={saving} style={btnPrimary}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </div>
      )
    }

    const rows: { label: string; value: string }[] = [
      { label: 'Nombre completo', value: `${m.nombre} ${m.apellido}` },
      { label: 'Rol', value: m.rol || '—' },
      { label: 'Puesto', value: puestoName(m.puesto_id) },
      { label: 'Plaza', value: m.plaza_asignada || '—' },
      { label: 'Teléfono', value: m.telefono || '—' },
      { label: 'Email', value: m.email || '—' },
      { label: 'Fecha de ingreso', value: m.fecha_ingreso || '—' },
    ]

    return (
      <div style={{ padding: 16 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <button onClick={() => { setEquipoView('list'); setSelectedMiembro(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>arrow_back</span>
          </button>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Ficha de empleado</h2>
        </div>

        {/* Large avatar */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: rolColor(m.rol),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 28,
            fontWeight: 700,
          }}>
            {getInitials(m.nombre, m.apellido)}
          </div>
        </div>

        {/* Info rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 16 }}>
          {rows.map((r) => (
            <div key={r.label}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 2 }}>{r.label}</div>
              <div style={{ fontSize: 14, color: 'var(--text-1)', fontWeight: 500 }}>{r.value}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          <button onClick={startEditMiembro} style={btnPrimary}>Editar</button>
          <button onClick={handleDesactivar} style={btnDanger}>Desactivar</button>
        </div>
      </div>
    )
  }

  // ── NUEVO MIEMBRO ──

  function NuevoMiembroView() {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => setEquipoView('list')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>arrow_back</span>
          </button>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Nuevo miembro</h2>
        </div>
        {renderMiembroForm()}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={() => setEquipoView('list')} style={btnSecondary}>Cancelar</button>
          <button onClick={saveNuevoMiembro} disabled={saving} style={btnPrimary}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    )
  }

  // ── MIEMBRO FORM (shared) ──

  function renderMiembroForm() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Nombre</label>
          <input
            style={fieldStyle}
            value={miembroForm.nombre}
            onChange={(e) => setMiembroForm({ ...miembroForm, nombre: e.target.value })}
            placeholder="Nombre"
          />
        </div>
        <div>
          <label style={labelStyle}>Apellido</label>
          <input
            style={fieldStyle}
            value={miembroForm.apellido}
            onChange={(e) => setMiembroForm({ ...miembroForm, apellido: e.target.value })}
            placeholder="Apellido"
          />
        </div>
        <div>
          <label style={labelStyle}>Rol / Plaza</label>
          <select
            style={fieldStyle}
            value={miembroForm.rol}
            onChange={(e) => {
              const val = e.target.value
              // Auto-assign plaza from role
              const plazaMatch = PLAZAS.includes(val) ? val : ''
              setMiembroForm({ ...miembroForm, rol: val, plaza_asignada: plazaMatch })
            }}
          >
            <option value="">Seleccionar...</option>
            <optgroup label="Jefatura">
              <option value="chef">Chef</option>
              <option value="encargado">Encargado</option>
            </optgroup>
            <optgroup label="Cocina">
              <option value="parrilla">Parrillero</option>
              <option value="calientes">Calientes</option>
              <option value="frios">Fríos</option>
              <option value="pastelero">Pastelero</option>
              <option value="panadero">Panadero</option>
              <option value="cocinero">Cocinero general</option>
            </optgroup>
            <optgroup label="Otros">
              <option value="ayudante">Ayudante</option>
              <option value="mozo">Mozo</option>
            </optgroup>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Teléfono</label>
          <input
            style={fieldStyle}
            value={miembroForm.telefono}
            onChange={(e) => setMiembroForm({ ...miembroForm, telefono: e.target.value })}
            placeholder="Teléfono"
            type="tel"
          />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input
            style={fieldStyle}
            value={miembroForm.email}
            onChange={(e) => setMiembroForm({ ...miembroForm, email: e.target.value })}
            placeholder="email@ejemplo.com"
            type="email"
          />
        </div>
        <div>
          <label style={labelStyle}>Fecha de ingreso</label>
          <input
            style={fieldStyle}
            value={miembroForm.fecha_ingreso}
            onChange={(e) => setMiembroForm({ ...miembroForm, fecha_ingreso: e.target.value })}
            type="date"
          />
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // TAB: TURNOS
  // ══════════════════════════════════════════════════════════════

  function TabTurnos() {
    return (
      <div style={{ padding: 16 }}>
        {/* Week selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>chevron_left</span>
          </button>
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={() => setWeekOffset(0)}
              style={{
                background: weekOffset === 0 ? 'var(--navy)' : 'var(--surface)',
                color: weekOffset === 0 ? '#fff' : 'var(--text-1)',
                border: weekOffset === 0 ? 'none' : '1px solid var(--border)',
                borderRadius: 8,
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                marginBottom: 4,
              }}
            >
              Esta semana
            </button>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {DIAS[0]} {fmtDateShort(weekDates[0])} - {DIAS[6]} {fmtDateShort(weekDates[6])}
            </div>
          </div>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>chevron_right</span>
          </button>
        </div>

        {/* Grid */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 400 }}>
            <thead>
              <tr>
                <th style={{ width: 70, padding: '6px 4px', fontSize: 11, color: 'var(--text-3)', textAlign: 'left', fontWeight: 600 }}></th>
                {weekDates.map((d, i) => (
                  <th key={i} style={{ padding: '6px 2px', fontSize: 11, color: 'var(--text-3)', textAlign: 'center', fontWeight: 600 }}>
                    <div>{DIAS[i]}</div>
                    <div style={{ fontWeight: 700, color: 'var(--text-2)' }}>{d.getDate()}</div>
                  </th>
                ))}
                <th style={{ width: 36, padding: '6px 2px', fontSize: 9, color: 'var(--text-3)', textAlign: 'center', fontWeight: 700, textTransform: 'uppercase' }}>Hs</th>
              </tr>
            </thead>
            <tbody>
              {miembros.map((m) => (
                <tr key={m.id}>
                  <td style={{ padding: '4px 4px', fontSize: 12, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 70 }}>
                    {m.nombre.slice(0, 3)}.{m.apellido?.[0] ?? ''}
                  </td>
                  {weekDates.map((d, i) => {
                    const dateStr = fmtDate(d)
                    const key = `${m.id}_${dateStr}`
                    const tipo = turnoMap[key] as TurnoTipo | undefined

                    return (
                      <td key={i} style={{ padding: 2, textAlign: 'center', position: 'relative' }}>
                        <div
                          onClick={() => handleCycleTurno(m.id, dateStr, tipo)}
                          onTouchStart={() => {
                            longPressTimer.current = setTimeout(() => handleClearTurno(m.id, dateStr), 600)
                          }}
                          onTouchEnd={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }}
                          onTouchMove={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }}
                          title={tipo ? `${TURNO_CONFIG[tipo].fullLabel} — mantené para borrar` : 'Toca para asignar turno'}
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
                  {/* Weekly hours */}
                  <td style={{ padding: '4px 2px', textAlign: 'center' }}>
                    {(() => {
                      const HOURS: Record<string, number> = { mañana: 8, tarde: 8, noche: 8, franco: 0, vacaciones: 0 }
                      let total = 0
                      weekDates.forEach(d => {
                        const t = turnoMap[`${m.id}_${fmtDate(d)}`]
                        if (t) total += HOURS[t] ?? 0
                      })
                      return (
                        <span style={{
                          fontSize: 11, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                          color: total > 48 ? '#ef4444' : total > 0 ? 'var(--text-1)' : 'var(--text-3)',
                        }}>
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
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // TAB: PUESTOS
  // ══════════════════════════════════════════════════════════════

  function TabPuestos() {
    if (puestosView === 'detalle' && selectedPuesto) return <PuestoDetalleView />
    if (puestosView === 'nuevo') return <NuevoPuestoView />

    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {puestos.map((p) => (
          <div
            key={p.id}
            onClick={() => openPuestoDetalle(p)}
            style={{
              padding: 14,
              background: 'var(--surface)',
              borderRadius: 14,
              border: '1px solid var(--border)',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>{p.nombre}</div>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: 6,
                background: '#f3f4f6',
                color: '#6b7280',
              }}>
                {miembroCountByPuesto[p.id] ?? 0} miembros
              </span>
            </div>
            {p.descripcion && (
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.descripcion}
              </div>
            )}
          </div>
        ))}

        {puestos.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
            No hay puestos definidos
          </div>
        )}

        <button onClick={openNuevoPuesto} style={{ ...btnPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
          Nuevo puesto
        </button>
      </div>
    )
  }

  // ── PUESTO DETALLE ──

  function PuestoDetalleView() {
    const p = selectedPuesto!

    if (editingPuesto) {
      return (
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <button onClick={() => setEditingPuesto(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>arrow_back</span>
            </button>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Editar puesto</h2>
          </div>
          {renderPuestoForm()}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={() => setEditingPuesto(false)} style={btnSecondary}>Cancelar</button>
            <button onClick={saveEditPuesto} disabled={saving} style={btnPrimary}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </div>
      )
    }

    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => { setPuestosView('list'); setSelectedPuesto(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>arrow_back</span>
          </button>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{p.nombre}</h2>
        </div>

        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {p.descripcion && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 4 }}>Descripción</div>
              <div style={{ fontSize: 14, color: 'var(--text-1)' }}>{p.descripcion}</div>
            </div>
          )}

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>Tareas y funciones</div>
            {(p.tareas_funciones && p.tareas_funciones.length > 0) ? (
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {p.tareas_funciones.map((t, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--text-1)' }}>{t}</li>
                ))}
              </ul>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Sin tareas definidas</div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>Permisos de app</div>
            {(p.permisos_app && p.permisos_app.length > 0) ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {p.permisos_app.map((perm, i) => (
                  <span key={i} style={{ fontSize: 12, fontWeight: 500, padding: '4px 10px', borderRadius: 8, background: '#e0e7ff', color: '#4338ca' }}>
                    {perm}
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Sin permisos definidos</div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 2 }}>Miembros asignados</div>
            <div style={{ fontSize: 14, color: 'var(--text-1)', fontWeight: 500 }}>{miembroCountByPuesto[p.id] ?? 0}</div>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <button onClick={startEditPuesto} style={btnPrimary}>Editar</button>
        </div>
      </div>
    )
  }

  // ── NUEVO PUESTO ──

  function NuevoPuestoView() {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => setPuestosView('list')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>arrow_back</span>
          </button>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Nuevo puesto</h2>
        </div>
        {renderPuestoForm()}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={() => setPuestosView('list')} style={btnSecondary}>Cancelar</button>
          <button onClick={saveNuevoPuesto} disabled={saving} style={btnPrimary}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    )
  }

  // ── PUESTO FORM (shared) ──

  function renderPuestoForm() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Nombre</label>
          <input
            style={fieldStyle}
            value={puestoForm.nombre}
            onChange={(e) => setPuestoForm({ ...puestoForm, nombre: e.target.value })}
            placeholder="Nombre del puesto"
          />
        </div>
        <div>
          <label style={labelStyle}>Descripción</label>
          <textarea
            style={{ ...fieldStyle, minHeight: 70, resize: 'vertical' }}
            value={puestoForm.descripcion}
            onChange={(e) => setPuestoForm({ ...puestoForm, descripcion: e.target.value })}
            placeholder="Descripción del puesto"
          />
        </div>
        <div>
          <label style={labelStyle}>Tareas y funciones (una por línea)</label>
          <textarea
            style={{ ...fieldStyle, minHeight: 90, resize: 'vertical' }}
            value={puestoForm.tareas_funciones}
            onChange={(e) => setPuestoForm({ ...puestoForm, tareas_funciones: e.target.value })}
            placeholder={'Preparar mise en place\nControlar temperaturas\nLimpiar estación'}
          />
        </div>
        <div>
          <label style={labelStyle}>Permisos de app (uno por línea)</label>
          <textarea
            style={{ ...fieldStyle, minHeight: 70, resize: 'vertical' }}
            value={puestoForm.permisos_app}
            onChange={(e) => setPuestoForm({ ...puestoForm, permisos_app: e.target.value })}
            placeholder={'stock.ver\nrecetas.ver\ntareas.editar'}
          />
        </div>
      </div>
    )
  }
}
