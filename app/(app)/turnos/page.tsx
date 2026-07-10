'use client'

import PageTransition from '@/components/PageTransition'
import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  useEquipo, TURNO_CONFIG, NIVELES_ACCESO, PUESTO_TEMPLATES,
  type Miembro, type Puesto, type TurnoTipo, type Turno,
} from '@/lib/hooks/useEquipo'
import { useFichaje, type FichajeDia } from '@/lib/hooks/useFichaje'
import { useAuth } from '@/lib/auth/context'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { MODULO_CONFIG } from '@/lib/constants'

// ── Constantes ──

const PLAZAS_OPS = ['parrilla', 'frios', 'calientes', 'pase', 'pasteleria', 'panaderia', 'linea']

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const TURNO_TIPOS = Object.keys(TURNO_CONFIG) as TurnoTipo[]

// Módulos que el dueño puede asignar a un puesto
const MODULOS_ASIGNABLES = [
  'home', 'operaciones', 'recetario', 'stock', 'pedidos',
  'haccp', 'reportes', 'calendario', 'carta', 'pase',
  'facturas', 'produccion', 'merma', 'equipo', 'ventas',
] as const

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
function getInitials(nombre: string, apellido: string) {
  return ((nombre?.[0] ?? '') + (apellido?.[0] ?? '')).toUpperCase()
}

function nivelLabel(nivel: string) {
  return NIVELES_ACCESO.find(n => n.value === nivel)?.label ?? nivel
}
function nivelColor(nivel: string) {
  return NIVELES_ACCESO.find(n => n.value === nivel)?.color ?? '#6b7280'
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
const btnPrimary: React.CSSProperties = {
  padding: '12px 20px', borderRadius: 12, background: 'var(--navy)',
  color: '#fff', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer',
  width: '100%', textAlign: 'center',
}
const btnSecondary: React.CSSProperties = {
  padding: '12px 20px', borderRadius: 12, background: 'var(--surface)',
  color: 'var(--text-1)', fontSize: 14, fontWeight: 600,
  border: '1px solid var(--border)', cursor: 'pointer', width: '100%', textAlign: 'center',
}
const btnDanger: React.CSSProperties = {
  padding: '12px 20px', borderRadius: 12, background: '#fee2e2',
  color: '#dc2626', fontSize: 14, fontWeight: 600, border: 'none',
  cursor: 'pointer', width: '100%', textAlign: 'center',
}

// ── Types internos ──

type Tab = 'equipo' | 'turnos' | 'fichajes' | 'puestos'
type EquipoView = 'list' | 'ficha' | 'nuevo'
type PuestosView = 'list' | 'detalle' | 'nuevo' | 'template'

interface MiembroForm {
  nombre: string; apellido: string; rol: string; puesto_id: string
  plaza_asignada: string; telefono: string; email: string; fecha_ingreso: string
  costo_hora: string
}
const EMPTY_MIEMBRO_FORM: MiembroForm = {
  nombre: '', apellido: '', rol: '', puesto_id: '',
  plaza_asignada: '', telefono: '', email: '', fecha_ingreso: '',
  costo_hora: '',
}

interface PuestoForm {
  nombre: string; descripcion: string; nivel: string
  plaza_default: string; permisos_app: string[]; tareas_funciones: string
}
const EMPTY_PUESTO_FORM: PuestoForm = {
  nombre: '', descripcion: '', nivel: 'cocinero',
  plaza_default: '', permisos_app: [], tareas_funciones: '',
}

// ══════════════════════════════════════════════════════════════
// FORM COMPONENTS — fuera de TurnosPage para identidad estable
// React nunca remonta estos componentes al re-renderizar TurnosPage,
// por eso el teclado no se cierra al tipear.
// ══════════════════════════════════════════════════════════════

function MiembroFormDatos({
  form, setForm, isAdmin,
}: {
  form: MiembroForm
  setForm: React.Dispatch<React.SetStateAction<MiembroForm>>
  isAdmin: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Nombre *</label>
          <input style={fieldStyle} value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Apellido *</label>
          <input style={fieldStyle} value={form.apellido}
            onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))} placeholder="Apellido" />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Teléfono</label>
        <input style={fieldStyle} value={form.telefono}
          onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="Teléfono" type="tel" />
      </div>
      <div>
        <label style={labelStyle}>Email</label>
        <input style={fieldStyle} value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@ejemplo.com" type="email" />
      </div>
      <div>
        <label style={labelStyle}>Fecha de ingreso</label>
        <input style={fieldStyle} value={form.fecha_ingreso}
          onChange={e => setForm(f => ({ ...f, fecha_ingreso: e.target.value }))} type="date" />
      </div>
      {isAdmin && (
        <div>
          <label style={labelStyle}>Costo por hora ($) — solo vos lo ves</label>
          <input style={fieldStyle} value={form.costo_hora} inputMode="decimal" type="number"
            onChange={e => setForm(f => ({ ...f, costo_hora: e.target.value }))} placeholder="Ej: 3500" />
        </div>
      )}
    </div>
  )
}

function PuestoFormBody({
  form, setForm,
}: {
  form: PuestoForm
  setForm: React.Dispatch<React.SetStateAction<PuestoForm>>
}) {
  function toggleModulo(modulo: string) {
    setForm(f => ({
      ...f,
      permisos_app: f.permisos_app.includes(modulo)
        ? f.permisos_app.filter(m => m !== modulo)
        : [...f.permisos_app, modulo],
    }))
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={labelStyle}>Nombre del puesto *</label>
        <input style={fieldStyle} value={form.nombre}
          onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Parrillero" />
      </div>
      <div>
        <label style={labelStyle}>Descripción</label>
        <textarea style={{ ...fieldStyle, minHeight: 60, resize: 'vertical' }} value={form.descripcion}
          onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Descripción del puesto y responsabilidades" />
      </div>
      <div>
        <label style={labelStyle}>Nivel de acceso</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {NIVELES_ACCESO.map(n => (
            <button key={n.value} type="button"
              onClick={() => setForm(f => ({ ...f, nivel: n.value }))}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12,
                border: `2px solid ${form.nivel === n.value ? n.color : 'var(--border)'}`,
                background: form.nivel === n.value ? n.color + '11' : 'var(--surface)',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: n.color, flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', flex: 1 }}>{n.label}</span>
              {form.nivel === n.value && (
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: n.color }}>check</span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label style={labelStyle}>Plaza OPS por defecto</label>
        <select style={fieldStyle} value={form.plaza_default}
          onChange={e => setForm(f => ({ ...f, plaza_default: e.target.value }))}>
          <option value="">Sin plaza fija (rota entre plazas)</option>
          {PLAZAS_OPS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>
      </div>
      <div>
        <label style={{ ...labelStyle, marginBottom: 8 }}>Módulos visibles en la app</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {MODULOS_ASIGNABLES.map(mod => {
            const cfg = MODULO_CONFIG[mod as keyof typeof MODULO_CONFIG]
            const active = form.permisos_app.includes(mod)
            return (
              <button key={mod} type="button" onClick={() => toggleModulo(mod)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12,
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: active ? 'var(--navy)' + '11' : 'var(--surface)',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: active ? 'var(--navy)' : 'var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: active ? '#fff' : 'var(--text-3)' }}>
                    {cfg?.icon ?? 'widgets'}
                  </span>
                </div>
                <span style={{ fontSize: 14, fontWeight: active ? 600 : 400, color: active ? 'var(--text-1)' : 'var(--text-2)', flex: 1 }}>
                  {cfg?.label ?? mod}
                </span>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: active ? 'var(--navy)' : 'transparent',
                  border: active ? 'none' : '2px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {active && <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>check</span>}
                </div>
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <label style={labelStyle}>Tareas y funciones (una por línea)</label>
        <textarea style={{ ...fieldStyle, minHeight: 80, resize: 'vertical' }} value={form.tareas_funciones}
          onChange={e => setForm(f => ({ ...f, tareas_funciones: e.target.value }))}
          placeholder={'Mise en place de parrilla\nControl de temperaturas\nLimpiar estación al cierre'} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════

export default function TurnosPage() {
  const {
    miembros, turnos, puestos, loading,
    crearMiembro, actualizarMiembro, actualizarOverridesMiembro, desactivarMiembro,
    fetchTurnos, fetchTurnosMes, asignarTurno, limpiarTurno,
    crearPuesto, actualizarPuesto, eliminarPuesto, getModulosMiembro,
  } = useEquipo()
  const { user } = useAuth()
  const { isAdmin } = usePermisos()
  const { fetchQuienEstaAdentro, fetchHistorial, guardarFichajeManual } = useFichaje()

  const [tab, setTab] = useState<Tab>('equipo')

  useEffect(() => {
    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'turnos',
      tab,
      totalMiembros: miembros.length,
      totalPuestos: puestos.length,
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [tab, miembros.length, puestos.length])

  // ── Equipo state ──
  const [equipoView, setEquipoView] = useState<EquipoView>('list')
  const [selectedMiembro, setSelectedMiembro] = useState<Miembro | null>(null)
  const [editingMiembro, setEditingMiembro] = useState(false)
  const [miembroForm, setMiembroForm] = useState<MiembroForm>(EMPTY_MIEMBRO_FORM)
  const [saving, setSaving] = useState(false)
  // form step: 'datos' | 'puesto'
  const [formStep, setFormStep] = useState<'datos' | 'puesto'>('datos')

  // ── Invitar state ──
  const [showInvitar, setShowInvitar] = useState(false)
  const [invEmail, setInvEmail] = useState('')
  const [invRol, setInvRol] = useState('cocinero')
  const [invNombre, setInvNombre] = useState('')
  const [inviting, setInviting] = useState(false)
  const [toast, setToast] = useState('')

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

  // ── Puestos state ──
  const [puestosView, setPuestosView] = useState<PuestosView>('list')
  const [selectedPuesto, setSelectedPuesto] = useState<Puesto | null>(null)
  const [editingPuesto, setEditingPuesto] = useState(false)
  const [puestoForm, setPuestoForm] = useState<PuestoForm>(EMPTY_PUESTO_FORM)

  // ── Override state (lifted from FichaMiembroView to evitar remount en cada keystroke) ──
  const [overrideMode, setOverrideMode] = useState(false)
  const [localExtra, setLocalExtra] = useState<string[]>([])
  const [localRestringidos, setLocalRestringidos] = useState<string[]>([])
  const [savingOverride, setSavingOverride] = useState(false)

  useEffect(() => { fetchTurnos(weekStart, weekEnd) }, [weekStart, weekEnd, fetchTurnos])
  useEffect(() => {
    setEquipoView('list'); setSelectedMiembro(null); setEditingMiembro(false)
    setPuestosView('list'); setSelectedPuesto(null); setEditingPuesto(false)
    setOverrideMode(false)
  }, [tab])

  const turnoMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const t of turnos) m[`${t.miembro_id}_${t.fecha}`] = t.turno_tipo
    return m
  }, [turnos])

  const puestoName = useCallback((puestoId: string | null) => {
    if (!puestoId) return '—'
    return puestos.find(p => p.id === puestoId)?.nombre ?? '—'
  }, [puestos])

  const miembroCountByPuesto = useMemo(() => {
    const m: Record<string, number> = {}
    for (const mi of miembros) {
      if (mi.puesto_id) m[mi.puesto_id] = (m[mi.puesto_id] ?? 0) + 1
    }
    return m
  }, [miembros])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  // ── Handlers: Equipo ──

  function openFicha(m: Miembro) {
    setSelectedMiembro(m); setEditingMiembro(false); setEquipoView('ficha')
    setLocalExtra(m.modulos_extra); setLocalRestringidos(m.modulos_restringidos)
    setOverrideMode(false)
  }

  function startEditMiembro() {
    if (!selectedMiembro) return
    setMiembroForm({
      nombre: selectedMiembro.nombre, apellido: selectedMiembro.apellido,
      rol: selectedMiembro.rol ?? '', puesto_id: selectedMiembro.puesto_id ?? '',
      plaza_asignada: selectedMiembro.plaza_asignada ?? '',
      telefono: selectedMiembro.telefono ?? '', email: selectedMiembro.email ?? '',
      fecha_ingreso: selectedMiembro.fecha_ingreso ?? '',
      costo_hora: selectedMiembro.costo_hora != null ? String(selectedMiembro.costo_hora) : '',
    })
    setEditingMiembro(true)
  }

  async function saveEditMiembro() {
    if (!selectedMiembro) return
    setSaving(true)
    try {
      // Auto-assign plaza from puesto if not set manually
      const puesto = puestos.find(p => p.id === miembroForm.puesto_id)
      const plaza = miembroForm.plaza_asignada || puesto?.plaza_default || null
      await actualizarMiembro(selectedMiembro.id, {
        nombre: miembroForm.nombre, apellido: miembroForm.apellido,
        rol: miembroForm.rol || undefined,
        puesto_id: miembroForm.puesto_id || null,
        plaza_asignada: plaza,
        telefono: miembroForm.telefono || null,
        email: miembroForm.email || null,
        fecha_ingreso: miembroForm.fecha_ingreso || null,
        costo_hora: miembroForm.costo_hora !== '' ? parseFloat(miembroForm.costo_hora) : null,
      })
      setEditingMiembro(false); setEquipoView('list'); setSelectedMiembro(null)
    } catch (e: any) { alert(e.message) }
    setSaving(false)
  }

  async function handleDesactivar() {
    if (!selectedMiembro) return
    if (!confirm(`¿Desactivar a ${selectedMiembro.nombre} ${selectedMiembro.apellido}?`)) return
    try {
      await desactivarMiembro(selectedMiembro.id)
      setEquipoView('list'); setSelectedMiembro(null)
    } catch (e: any) { alert(e.message) }
  }

  function toggleExtra(modulo: string) {
    if (!selectedMiembro) return
    const puesto = puestos.find(p => p.id === selectedMiembro.puesto_id)
    const baseModulos = puesto?.permisos_app ?? []
    if (baseModulos.includes(modulo)) {
      setLocalRestringidos(prev =>
        prev.includes(modulo) ? prev.filter(x => x !== modulo) : [...prev, modulo]
      )
    } else {
      setLocalExtra(prev =>
        prev.includes(modulo) ? prev.filter(x => x !== modulo) : [...prev, modulo]
      )
    }
  }

  function moduloState(modulo: string): 'puesto' | 'extra' | 'restringido' | 'off' {
    if (!selectedMiembro) return 'off'
    const puesto = puestos.find(p => p.id === selectedMiembro.puesto_id)
    const enPuesto = (puesto?.permisos_app ?? []).includes(modulo)
    if (localRestringidos.includes(modulo)) return 'restringido'
    if (enPuesto) return 'puesto'
    if (localExtra.includes(modulo)) return 'extra'
    return 'off'
  }

  async function saveOverrides() {
    if (!selectedMiembro) return
    setSavingOverride(true)
    try {
      await actualizarOverridesMiembro(selectedMiembro.id, localExtra, localRestringidos)
      setOverrideMode(false)
      showToast('Permisos actualizados')
    } catch (e: any) { alert(e.message) }
    setSavingOverride(false)
  }

  function openNuevoMiembro() {
    setMiembroForm(EMPTY_MIEMBRO_FORM); setFormStep('datos'); setEquipoView('nuevo')
  }

  async function saveNuevoMiembro() {
    if (!miembroForm.nombre.trim() || !miembroForm.apellido.trim()) {
      alert('Nombre y apellido son obligatorios'); return
    }
    setSaving(true)
    try {
      const puesto = puestos.find(p => p.id === miembroForm.puesto_id)
      const plaza = miembroForm.plaza_asignada || puesto?.plaza_default || null
      const nivel = puesto?.nivel ?? 'cocinero'
      await crearMiembro({
        auth_user_id: null,
        nombre: miembroForm.nombre.trim(), apellido: miembroForm.apellido.trim(),
        rol: nivel,
        puesto_id: miembroForm.puesto_id || null,
        plaza_asignada: plaza, telefono: miembroForm.telefono || null,
        email: miembroForm.email || null,
        fecha_ingreso: miembroForm.fecha_ingreso || null, foto_url: null,
        costo_hora: miembroForm.costo_hora !== '' ? parseFloat(miembroForm.costo_hora) : null,
      })
      setEquipoView('list')
      showToast(`${miembroForm.nombre} agregado al equipo`)
    } catch (e: any) { alert(e.message) }
    setSaving(false)
  }

  async function handleInvitar() {
    if (!invEmail.trim()) return
    setInviting(true)
    try {
      const res = await fetch('/api/invitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invEmail.trim(), rol: invRol, nombre: invNombre.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      showToast(`Invitación enviada a ${invEmail}`)
      setShowInvitar(false); setInvEmail(''); setInvNombre('')
    } catch (e: any) { showToast('Error: ' + e.message) }
    finally { setInviting(false) }
  }

  // ── Handlers: Turnos ──

  async function handleCycleTurno(miembroId: string, fecha: string, currentTipo: TurnoTipo | undefined) {
    const idx = currentTipo ? TURNO_TIPOS.indexOf(currentTipo) : -1
    const next = TURNO_TIPOS[(idx + 1) % TURNO_TIPOS.length]
    try {
      await asignarTurno(miembroId, fecha, next)
      await fetchTurnos(weekStart, weekEnd)
    } catch (e: any) { alert(e.message) }
  }

  async function handleClearTurno(miembroId: string, fecha: string) {
    try {
      await limpiarTurno(miembroId, fecha)
      await fetchTurnos(weekStart, weekEnd)
    } catch {}
  }

  // ── Handlers: Puestos ──

  function openPuestoDetalle(p: Puesto) {
    setSelectedPuesto(p); setEditingPuesto(false); setPuestosView('detalle')
  }

  function startEditPuesto() {
    if (!selectedPuesto) return
    setPuestoForm({
      nombre: selectedPuesto.nombre,
      descripcion: selectedPuesto.descripcion ?? '',
      nivel: selectedPuesto.nivel ?? 'cocinero',
      plaza_default: selectedPuesto.plaza_default ?? '',
      permisos_app: selectedPuesto.permisos_app ?? [],
      tareas_funciones: (selectedPuesto.tareas_funciones ?? []).join('\n'),
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
        nivel: puestoForm.nivel,
        plaza_default: puestoForm.plaza_default || null,
        permisos_app: puestoForm.permisos_app,
        tareas_funciones: puestoForm.tareas_funciones.split('\n').map(s => s.trim()).filter(Boolean),
      })
      setEditingPuesto(false); setPuestosView('list'); setSelectedPuesto(null)
    } catch (e: any) { alert(e.message) }
    setSaving(false)
  }

  async function saveNuevoPuesto() {
    if (!puestoForm.nombre.trim()) { alert('El nombre es obligatorio'); return }
    setSaving(true)
    try {
      await crearPuesto({
        nombre: puestoForm.nombre.trim(),
        descripcion: puestoForm.descripcion || null,
        nivel: puestoForm.nivel,
        plaza_default: puestoForm.plaza_default || null,
        permisos_app: puestoForm.permisos_app,
        tareas_funciones: puestoForm.tareas_funciones.split('\n').map(s => s.trim()).filter(Boolean),
      })
      setPuestosView('list')
      showToast(`Puesto "${puestoForm.nombre}" creado`)
    } catch (e: any) { alert(e.message) }
    setSaving(false)
  }

  function applyTemplate(tpl: typeof PUESTO_TEMPLATES[0]) {
    setPuestoForm({
      nombre: tpl.nombre,
      descripcion: tpl.descripcion,
      nivel: tpl.nivel,
      plaza_default: tpl.plaza_default ?? '',
      permisos_app: [...tpl.permisos_app],
      tareas_funciones: tpl.tareas_funciones.join('\n'),
    })
    setPuestosView('nuevo')
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  return (
    <PageTransition>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      {/* HEADER */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
        <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0, marginBottom: 14 }}>Equipo</h1>
        <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: 3 }}>
          {(['equipo', 'turnos', 'fichajes', 'puestos'] as Tab[]).map(t => (
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
              {t === 'equipo' ? 'Equipo' : t === 'turnos' ? 'Turnos' : t === 'fichajes' ? 'Fichajes' : 'Puestos'}
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
            {tab === 'equipo' && TabEquipo()}
            {tab === 'turnos' && TabTurnos()}
            {tab === 'fichajes' && TabFichajes()}
            {tab === 'puestos' && TabPuestos()}
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
  // TAB: EQUIPO
  // ══════════════════════════════════════════════════════════════

  function TabEquipo() {
    if (equipoView === 'ficha' && selectedMiembro) return FichaMiembroView()
    if (equipoView === 'nuevo') return NuevoMiembroView()

    return (
      <>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {miembros.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
            No hay miembros del equipo
          </div>
        )}

        {miembros.map(m => {
          const puesto = puestos.find(p => p.id === m.puesto_id)
          return (
            <div
              key={m.id}
              onClick={() => openFicha(m)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: 14,
                background: 'var(--surface)', borderRadius: 14,
                border: '1px solid var(--border)', cursor: 'pointer',
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: nivelColor(puesto?.nivel ?? 'cocinero'),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 15, fontWeight: 700, flexShrink: 0,
              }}>
                {getInitials(m.nombre, m.apellido)}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>
                  {m.nombre} {m.apellido}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  {puesto?.nombre ?? '—'}{m.plaza_asignada ? ` · ${m.plaza_asignada.split(',').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' · ')}` : ''}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                {puesto && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                    background: nivelColor(puesto.nivel) + '22',
                    color: nivelColor(puesto.nivel), whiteSpace: 'nowrap',
                  }}>
                    {nivelLabel(puesto.nivel)}
                  </span>
                )}
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                  background: m.activo ? '#d1fae5' : '#fee2e2',
                  color: m.activo ? '#065f46' : '#991b1b',
                }}>
                  {m.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>
          )
        })}

        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button onClick={openNuevoMiembro} style={{ ...btnPrimary, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person_add</span>
            Agregar
          </button>
          <button onClick={() => setShowInvitar(true)} style={{ ...btnPrimary, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--accent)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>mail</span>
            Invitar
          </button>
        </div>
      </div>

      {/* Modal invitar */}
      {showInvitar && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200 }} onClick={() => setShowInvitar(false)} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201, background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '24px 16px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Invitar al equipo</h3>
              <button onClick={() => setShowInvitar(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-3)' }}>close</span>
              </button>
            </div>
            <div>
              <label style={labelStyle}>Nombre (opcional)</label>
              <input value={invNombre} onChange={e => setInvNombre(e.target.value)} placeholder="Juan" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email *</label>
              <input value={invEmail} onChange={e => setInvEmail(e.target.value)} placeholder="juan@email.com" type="email" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Nivel de acceso</label>
              <select value={invRol} onChange={e => setInvRol(e.target.value)} style={fieldStyle}>
                {NIVELES_ACCESO.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
              </select>
            </div>
            <button
              onClick={handleInvitar} disabled={inviting || !invEmail.trim()}
              style={{ ...btnPrimary, opacity: inviting || !invEmail.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>send</span>
              {inviting ? 'Enviando...' : 'Enviar invitación'}
            </button>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, textAlign: 'center' }}>
              El empleado recibirá un email para crear su cuenta.
            </p>
          </div>
        </>
      )}
      </>
    )
  }

  // ── FICHA MIEMBRO ──

  function FichaMiembroView() {
    const m = selectedMiembro!
    const puesto = puestos.find(p => p.id === m.puesto_id)
    const modulos = getModulosMiembro(m)

    if (editingMiembro) {
      return (
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <button onClick={() => setEditingMiembro(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>arrow_back</span>
            </button>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Editar miembro</h2>
          </div>
          <MiembroFormDatos form={miembroForm} setForm={setMiembroForm} isAdmin={isAdmin} />
          <div style={{ marginTop: 12 }}>
            {MiembroFormPuesto()}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={() => setEditingMiembro(false)} style={btnSecondary}>Cancelar</button>
            <button onClick={saveEditMiembro} disabled={saving} style={btnPrimary}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </div>
      )
    }

    return (
      <div style={{ padding: 16 }}>
        {/* Back */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <button onClick={() => { setEquipoView('list'); setSelectedMiembro(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>arrow_back</span>
          </button>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Ficha</h2>
        </div>

        {/* Avatar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20, gap: 8 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: nivelColor(puesto?.nivel ?? 'cocinero'),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 24, fontWeight: 700,
          }}>
            {getInitials(m.nombre, m.apellido)}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)' }}>{m.nombre} {m.apellido}</div>
          {puesto && (
            <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20, background: nivelColor(puesto.nivel) + '22', color: nivelColor(puesto.nivel) }}>
              {puesto.nombre}
            </span>
          )}
        </div>

        {/* Info */}
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Nivel de acceso', value: nivelLabel(puesto?.nivel ?? m.rol) },
            { label: 'Plaza/s OPS', value: m.plaza_asignada ? m.plaza_asignada.split(',').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' · ') : '—' },
            { label: 'Teléfono', value: m.telefono ?? '—' },
            { label: 'Email', value: m.email ?? '—' },
            { label: 'Ingreso', value: m.fecha_ingreso ?? '—' },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>{r.label}</span>
              <span style={{ fontSize: 14, color: 'var(--text-1)', fontWeight: 500 }}>{r.value}</span>
            </div>
          ))}
        </div>

        {/* Módulos que puede ver */}
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Acceso a módulos</div>
            <button
              onClick={() => { setOverrideMode(v => !v); setLocalExtra(m.modulos_extra); setLocalRestringidos(m.modulos_restringidos) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}
            >
              {overrideMode ? 'Cancelar' : 'Personalizar'}
            </button>
          </div>

          {overrideMode ? (
            <>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 12px' }}>
                Azul = del puesto · Verde = agregado · Tachado = bloqueado
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {MODULOS_ASIGNABLES.map(mod => {
                  const cfg = MODULO_CONFIG[mod as keyof typeof MODULO_CONFIG]
                  const state = moduloState(mod)
                  return (
                    <button
                      key={mod}
                      onClick={() => toggleExtra(mod)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                        borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left',
                        background:
                          state === 'puesto' ? '#e0e7ff' :
                          state === 'extra' ? '#d1fae5' :
                          state === 'restringido' ? '#fee2e2' : 'var(--bg)',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{
                        fontSize: 18,
                        color: state === 'puesto' ? '#4338ca' : state === 'extra' ? '#065f46' : state === 'restringido' ? '#dc2626' : 'var(--text-3)',
                      }}>
                        {cfg?.icon ?? 'widgets'}
                      </span>
                      <span style={{
                        fontSize: 13, fontWeight: 500,
                        color: state === 'restringido' ? '#dc2626' : 'var(--text-1)',
                        textDecoration: state === 'restringido' ? 'line-through' : 'none',
                        flex: 1,
                      }}>
                        {cfg?.label ?? mod}
                      </span>
                      {state === 'puesto' && <span style={{ fontSize: 10, color: '#4338ca', fontWeight: 600 }}>PUESTO</span>}
                      {state === 'extra' && <span style={{ fontSize: 10, color: '#065f46', fontWeight: 600 }}>EXTRA</span>}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={saveOverrides} disabled={savingOverride}
                style={{ ...btnPrimary, marginTop: 14 }}
              >
                {savingOverride ? 'Guardando...' : 'Guardar permisos'}
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {modulos.length === 0
                ? <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Sin módulos asignados</span>
                : modulos.map(mod => {
                    const cfg = MODULO_CONFIG[mod as keyof typeof MODULO_CONFIG]
                    const isExtra = m.modulos_extra.includes(mod)
                    return (
                      <span key={mod} style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: 12, fontWeight: 500, padding: '4px 10px', borderRadius: 8,
                        background: isExtra ? '#d1fae5' : '#e0e7ff',
                        color: isExtra ? '#065f46' : '#4338ca',
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{cfg?.icon ?? 'widgets'}</span>
                        {cfg?.label ?? mod}
                      </span>
                    )
                  })
              }
            </div>
          )}
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={startEditMiembro} style={btnPrimary}>Editar datos</button>
          <button onClick={handleDesactivar} style={btnDanger}>Desactivar</button>
        </div>
      </div>
    )
  }

  // ── NUEVO MIEMBRO (2 pasos) ──

  function NuevoMiembroView() {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => formStep === 'datos' ? setEquipoView('list') : setFormStep('datos')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>arrow_back</span>
          </button>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
            {formStep === 'datos' ? 'Nuevo miembro' : 'Asignar puesto'}
          </h2>
          {/* Indicador de paso */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {(['datos', 'puesto'] as const).map((s, i) => (
              <div key={s} style={{ width: 8, height: 8, borderRadius: '50%', background: formStep === s ? 'var(--navy)' : 'var(--border)' }} />
            ))}
          </div>
        </div>

        {formStep === 'datos' && (
          <>
            <MiembroFormDatos form={miembroForm} setForm={setMiembroForm} isAdmin={isAdmin} />
            <button
              onClick={() => {
                if (!miembroForm.nombre.trim() || !miembroForm.apellido.trim()) { alert('Nombre y apellido son obligatorios'); return }
                setFormStep('puesto')
              }}
              style={{ ...btnPrimary, marginTop: 16 }}
            >
              Continuar →
            </button>
          </>
        )}

        {formStep === 'puesto' && (
          <>
            {MiembroFormPuesto()}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setEquipoView('list')} style={btnSecondary}>Cancelar</button>
              <button onClick={saveNuevoMiembro} disabled={saving} style={btnPrimary}>
                {saving ? 'Guardando...' : 'Agregar al equipo'}
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── FORM: puesto del miembro ──

  function MiembroFormPuesto() {
    const puestoSelected = puestos.find(p => p.id === miembroForm.puesto_id)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Selector de puesto */}
        <div>
          <label style={labelStyle}>Puesto</label>
          {puestos.length === 0 ? (
            <div style={{ padding: '12px 14px', borderRadius: 12, border: '1px dashed var(--border)', color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }}>
              No hay puestos creados todavía.<br />
              <button onClick={() => { setTab('puestos'); setPuestosView('template') }} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, marginTop: 4 }}>
                Crear un puesto →
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {puestos.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setMiembroForm(f => {
                    const deselecting = f.puesto_id === p.id
                    return {
                      ...f,
                      puesto_id: deselecting ? '' : p.id,
                      // Al seleccionar: mantener plazas existentes o usar default del puesto
                      // Al deseleccionar: limpiar plazas
                      plaza_asignada: deselecting ? '' : (f.plaza_asignada || p.plaza_default || ''),
                    }
                  })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    borderRadius: 12, border: `2px solid ${miembroForm.puesto_id === p.id ? nivelColor(p.nivel) : 'var(--border)'}`,
                    background: miembroForm.puesto_id === p.id ? nivelColor(p.nivel) + '11' : 'var(--surface)',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: nivelColor(p.nivel) + '22',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: nivelColor(p.nivel) }}>work</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{p.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                      {nivelLabel(p.nivel)}{p.plaza_default ? ` · ${p.plaza_default}` : ''}
                    </div>
                  </div>
                  {miembroForm.puesto_id === p.id && (
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: nivelColor(p.nivel) }}>check_circle</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Vista previa de módulos del puesto */}
        {puestoSelected && (
          <div style={{ background: '#f0f4ff', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#4338ca', marginBottom: 8 }}>
              Módulos incluidos con este puesto
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(puestoSelected.permisos_app ?? []).map(mod => {
                const cfg = MODULO_CONFIG[mod as keyof typeof MODULO_CONFIG]
                return (
                  <span key={mod} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#e0e7ff', color: '#4338ca', fontWeight: 500 }}>
                    {cfg?.label ?? mod}
                  </span>
                )
              })}
              {(puestoSelected.permisos_app ?? []).length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Sin módulos configurados</span>
              )}
            </div>
          </div>
        )}

        {/* Plazas OPS — multi-select */}
        <div>
          <label style={labelStyle}>
            Plazas OPS{puestoSelected?.plaza_default ? ` (por defecto: ${puestoSelected.plaza_default})` : ''}
          </label>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 8px' }}>
            Seleccioná todas las plazas que cubre. La primera es la principal en el checklist.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {PLAZAS_OPS.map(p => {
              const selectedPlazas = miembroForm.plaza_asignada.split(',').map(s => s.trim()).filter(Boolean)
              const isSelected = selectedPlazas.includes(p)
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setMiembroForm(f => {
                      const current = f.plaza_asignada.split(',').map(s => s.trim()).filter(Boolean)
                      const nowSelected = current.includes(p)
                      const next = nowSelected ? current.filter(v => v !== p) : [...current, p]
                      return { ...f, plaza_asignada: next.join(',') }
                    })
                  }}
                  style={{
                    padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                    background: isSelected ? 'var(--navy)' : 'var(--bg)',
                    color: isSelected ? '#fff' : 'var(--text-2)',
                    fontSize: 13, fontWeight: 600,
                    border: `1px solid ${isSelected ? 'var(--navy)' : 'var(--border)'}`,
                  }}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              )
            })}
          </div>
          {!miembroForm.plaza_asignada && (
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '6px 0 0' }}>Sin plaza fija — rota entre plazas</p>
          )}
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

  // "Mis fichajes" (todos los roles) + "quién está adentro" (solo admin) al entrar al tab
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

  // ══════════════════════════════════════════════════════════════
  // TAB: PUESTOS
  // ══════════════════════════════════════════════════════════════

  function TabPuestos() {
    if (puestosView === 'detalle' && selectedPuesto) return PuestoDetalleView()
    if (puestosView === 'nuevo') return NuevoPuestoView()
    if (puestosView === 'template') return TemplatePicker()

    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {puestos.length === 0 && (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)', fontSize: 13 }}>
            Sin puestos creados todavía.<br />Empezá desde un template o creá uno propio.
          </div>
        )}

        {puestos.map(p => {
          const count = miembroCountByPuesto[p.id] ?? 0
          return (
            <div
              key={p.id}
              onClick={() => openPuestoDetalle(p)}
              style={{
                padding: 14, background: 'var(--surface)', borderRadius: 14,
                border: '1px solid var(--border)', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>{p.nombre}</div>
                  {p.descripcion && (
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.descripcion}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 10 }}>
                  {p.plaza_default && (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: '#dbeafe', color: '#1e40af' }}>
                      {p.plaza_default}
                    </span>
                  )}
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: nivelColor(p.nivel) + '22', color: nivelColor(p.nivel) }}>
                    {nivelLabel(p.nivel)}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(p.permisos_app ?? []).slice(0, 5).map(mod => {
                    const cfg = MODULO_CONFIG[mod as keyof typeof MODULO_CONFIG]
                    return (
                      <span key={mod} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#f3f4f6', color: 'var(--text-2)' }}>
                        {cfg?.label ?? mod}
                      </span>
                    )
                  })}
                  {(p.permisos_app ?? []).length > 5 && (
                    <span style={{ fontSize: 10, color: 'var(--text-3)', padding: '2px 4px' }}>+{(p.permisos_app ?? []).length - 5}</span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0, marginLeft: 8 }}>
                  {count} {count === 1 ? 'miembro' : 'miembros'}
                </span>
              </div>
            </div>
          )
        })}

        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button onClick={() => setPuestosView('template')} style={{ ...btnSecondary, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span>
            Desde template
          </button>
          <button onClick={() => { setPuestoForm(EMPTY_PUESTO_FORM); setPuestosView('nuevo') }} style={{ ...btnPrimary, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            Crear propio
          </button>
        </div>
      </div>
    )
  }

  // ── TEMPLATE PICKER ──

  function TemplatePicker() {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => setPuestosView('list')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>arrow_back</span>
          </button>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Elegir template</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 16px' }}>
          Seleccioná un punto de partida. Vas a poder personalizar módulos y permisos antes de guardar.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {PUESTO_TEMPLATES.map(tpl => (
            <button
              key={tpl.nombre}
              onClick={() => applyTemplate(tpl)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: nivelColor(tpl.nivel) + '22',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: nivelColor(tpl.nivel) }}>
                  {tpl.icon}
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{tpl.nombre}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{tpl.descripcion}</div>
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: nivelColor(tpl.nivel) + '22', color: nivelColor(tpl.nivel) }}>
                    {nivelLabel(tpl.nivel)}
                  </span>
                  {tpl.plaza_default && (
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: '#dbeafe', color: '#1e40af' }}>
                      {tpl.plaza_default}
                    </span>
                  )}
                  <span style={{ fontSize: 9, color: 'var(--text-3)', padding: '2px 4px' }}>
                    {tpl.permisos_app.length} módulos
                  </span>
                </div>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)', flexShrink: 0 }}>chevron_right</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── NUEVO / EDITAR PUESTO ──

  function NuevoPuestoView() {
    const isEdit = editingPuesto && selectedPuesto !== null
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => { if (isEdit) { setEditingPuesto(false) } else { setPuestosView('list') } }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>arrow_back</span>
          </button>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
            {isEdit ? `Editar: ${selectedPuesto?.nombre}` : 'Nuevo puesto'}
          </h2>
        </div>
        <PuestoFormBody form={puestoForm} setForm={setPuestoForm} />
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={() => isEdit ? setEditingPuesto(false) : setPuestosView('list')} style={btnSecondary}>Cancelar</button>
          <button onClick={isEdit ? saveEditPuesto : saveNuevoPuesto} disabled={saving} style={btnPrimary}>
            {saving ? 'Guardando...' : 'Guardar puesto'}
          </button>
        </div>
      </div>
    )
  }

  // ── PUESTO DETALLE ──

  function PuestoDetalleView() {
    const p = selectedPuesto!
    const miembrosDelPuesto = miembros.filter(m => m.puesto_id === p.id)

    if (editingPuesto) return NuevoPuestoView()

    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <button onClick={() => { setPuestosView('list'); setSelectedPuesto(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>arrow_back</span>
          </button>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0, flex: 1 }}>{p.nombre}</h2>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: nivelColor(p.nivel) + '22', color: nivelColor(p.nivel) }}>
            {nivelLabel(p.nivel)}
          </span>
        </div>

        {/* Info básica */}
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
          {p.descripcion && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 4 }}>Descripción</div>
              <div style={{ fontSize: 14, color: 'var(--text-1)' }}>{p.descripcion}</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 2 }}>Plaza OPS por defecto</div>
            <div style={{ fontSize: 14, color: 'var(--text-1)', fontWeight: 500 }}>{p.plaza_default ?? 'Rota entre plazas'}</div>
          </div>
          {(p.tareas_funciones ?? []).length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>Tareas y funciones</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {p.tareas_funciones!.map((t, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--text-1)' }}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Módulos */}
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10 }}>
            Módulos habilitados ({(p.permisos_app ?? []).length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(p.permisos_app ?? []).length === 0 && (
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Sin módulos configurados</span>
            )}
            {(p.permisos_app ?? []).map(mod => {
              const cfg = MODULO_CONFIG[mod as keyof typeof MODULO_CONFIG]
              return (
                <span key={mod} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500, padding: '5px 10px', borderRadius: 8, background: '#e0e7ff', color: '#4338ca' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{cfg?.icon ?? 'widgets'}</span>
                  {cfg?.label ?? mod}
                </span>
              )
            })}
          </div>
        </div>

        {/* Miembros asignados */}
        {miembrosDelPuesto.length > 0 && (
          <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10 }}>
              Miembros ({miembrosDelPuesto.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {miembrosDelPuesto.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: nivelColor(p.nivel), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {getInitials(m.nombre, m.apellido)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{m.nombre} {m.apellido}</div>
                    {m.plaza_asignada && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{m.plaza_asignada.split(',').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' · ')}</div>}
                  </div>
                  {(m.modulos_extra.length > 0 || m.modulos_restringidos.length > 0) && (
                    <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>Personalizado</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={startEditPuesto} style={{ ...btnPrimary, flex: 1 }}>Editar puesto</button>
          {miembrosDelPuesto.length === 0 && (
            <button
              onClick={async () => {
                if (!confirm(`¿Eliminar el puesto "${p.nombre}"?`)) return
                try {
                  await eliminarPuesto(p.id)
                  setPuestosView('list'); setSelectedPuesto(null)
                  showToast('Puesto eliminado')
                } catch (e: any) { alert(e.message) }
              }}
              style={{ ...btnDanger, flex: 0, padding: '12px 16px', width: 'auto' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
            </button>
          )}
        </div>
      </div>
    )
  }
}
