'use client'

// Ficha de un miembro del equipo — alta, edición y permisos (override sobre
// el puesto). Movido de turnos/page.tsx (S6, sep 2026): el manejo de
// personas y sus accesos vive en Organigrama, Turnos quedó solo con la
// grilla de turnos y el fichaje. Reemplaza la grilla de cartas de
// OrganigramaPage cuando está montado (mismo patrón que tenía TabEquipo:
// content-swap dentro de la misma pestaña, no un modal aparte).

import { useState } from 'react'
import PhotoPicker from '@/components/ui/PhotoPicker'
import { MODULO_CONFIG } from '@/lib/constants'
import type { Miembro, Puesto } from '@/lib/hooks/useEquipo'
import {
  PLAZAS_OPS, MODULOS_ASIGNABLES, PRENDAS_UNIFORME, getInitials, nivelLabel, nivelColor,
  fieldStyle, labelStyle, btnPrimary, btnSecondary, btnDanger,
  type MiembroForm, EMPTY_MIEMBRO_FORM, uniformeFormFromRecord, uniformeRecordFromForm,
} from './equipoShared'

// ══════════════════════════════════════════════════════════════
// FORM COMPONENTS — fuera del panel para identidad estable
// React nunca los remonta al re-renderizar el panel, por eso el
// teclado no se cierra al tipear.
// ══════════════════════════════════════════════════════════════

function MiembroFormDatos({
  form, setForm, isAdmin, fotoPath,
}: {
  form: MiembroForm
  setForm: React.Dispatch<React.SetStateAction<MiembroForm>>
  isAdmin: boolean
  fotoPath: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <PhotoPicker
          currentUrl={form.foto_url}
          path={fotoPath}
          size={90}
          onUploaded={url => setForm(f => ({ ...f, foto_url: url }))}
          onRemoved={() => setForm(f => ({ ...f, foto_url: null }))}
        />
      </div>
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
      <div>
        <label style={{ ...labelStyle, marginBottom: 8 }}>Uniforme prestado</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {PRENDAS_UNIFORME.map(p => (
            <div key={p.key}>
              <label style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2, display: 'block' }}>{p.label}</label>
              <input
                style={fieldStyle} type="number" min={0} inputMode="numeric"
                value={form.uniforme[p.key] ?? ''}
                onChange={e => setForm(f => ({ ...f, uniforme: { ...f.uniforme, [p.key]: e.target.value } }))}
                placeholder="0"
              />
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '6px 0 0' }}>
          Cantidad prestada — sirve para reclamarlas si la persona se va.
        </p>
      </div>
      <div>
        <label style={labelStyle}>Observaciones</label>
        <textarea
          style={{ ...fieldStyle, minHeight: 70, resize: 'vertical' }}
          value={form.observaciones}
          onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
          placeholder="Notas para el equipo: ausentismo, llamados de atención, lo que haga falta recordar"
        />
      </div>
    </div>
  )
}

function MiembroFormPuesto({
  miembroForm, setMiembroForm, puestos, onIrACrearPuesto,
}: {
  miembroForm: MiembroForm
  setMiembroForm: React.Dispatch<React.SetStateAction<MiembroForm>>
  puestos: Puesto[]
  onIrACrearPuesto: () => void
}) {
  const puestoSelected = puestos.find(p => p.id === miembroForm.puesto_id)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Selector de puesto */}
      <div>
        <label style={labelStyle}>Puesto</label>
        {puestos.length === 0 ? (
          <div style={{ padding: '12px 14px', borderRadius: 12, border: '1px dashed var(--border)', color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }}>
            No hay puestos creados todavía.<br />
            <button onClick={onIrACrearPuesto} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, marginTop: 4 }}>
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
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue-fg)', marginBottom: 8 }}>
            Módulos incluidos con este puesto
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(puestoSelected.permisos_app ?? []).map(mod => {
              const cfg = MODULO_CONFIG[mod as keyof typeof MODULO_CONFIG]
              return (
                <span key={mod} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'var(--blue-bg)', color: 'var(--blue-fg)', fontWeight: 500 }}>
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
// PANEL PRINCIPAL
// ══════════════════════════════════════════════════════════════

export interface FichaMiembroPanelProps {
  /** null = alta de un miembro nuevo */
  miembro: Miembro | null
  puestos: Puesto[]
  isAdmin: boolean
  /** Abre directo en "Personalizar" — reemplaza el deep-link viejo a /turnos */
  initialOverrideMode?: boolean
  getModulosMiembro: (m: Miembro) => string[]
  crearMiembro: (datos: Omit<Miembro, 'id' | 'restaurante_id' | 'created_at' | 'activo' | 'modulos_extra' | 'modulos_restringidos' | 'ver_costos' | 'objetivos'>) => Promise<unknown>
  actualizarMiembro: (id: string, datos: Partial<Omit<Miembro, 'id' | 'restaurante_id' | 'created_at'>>) => Promise<unknown>
  actualizarOverridesMiembro: (id: string, modulosExtra: string[], modulosRestringidos: string[], verCostos: boolean | null) => Promise<unknown>
  desactivarMiembro: (id: string) => Promise<unknown>
  /** Vuelve a poner `activo: true` a alguien desactivado (chip "Inactivos" de Plantel). */
  reactivarMiembro: (id: string) => Promise<unknown>
  onClose: () => void
  onToast: (msg: string) => void
  onIrACrearPuesto: () => void
}

export function FichaMiembroPanel({
  miembro, puestos, isAdmin, initialOverrideMode = false, getModulosMiembro,
  crearMiembro, actualizarMiembro, actualizarOverridesMiembro, desactivarMiembro, reactivarMiembro,
  onClose, onToast, onIrACrearPuesto,
}: FichaMiembroPanelProps) {
  const esNuevo = miembro === null

  const [editingMiembro, setEditingMiembro] = useState(false)
  const [miembroForm, setMiembroForm] = useState<MiembroForm>(EMPTY_MIEMBRO_FORM)
  const [saving, setSaving] = useState(false)
  const [formStep, setFormStep] = useState<'datos' | 'puesto'>('datos')

  const [overrideMode, setOverrideMode] = useState(initialOverrideMode)
  const [localExtra, setLocalExtra] = useState<string[]>(miembro?.modulos_extra ?? [])
  const [localRestringidos, setLocalRestringidos] = useState<string[]>(miembro?.modulos_restringidos ?? [])
  const [localVerCostos, setLocalVerCostos] = useState<boolean | null>(miembro?.ver_costos ?? null)
  const [savingOverride, setSavingOverride] = useState(false)

  // Path estable para PhotoPicker mientras el miembro nuevo todavía no tiene id.
  // useState con inicializador perezoso, no useRef(`...${Date.now()}`): ese
  // segundo patrón evalúa Date.now() en cada render (impuro) aunque el ref
  // solo use el valor del primero.
  const [nuevoMiembroFotoPath] = useState(() => `equipo/new-${Date.now()}`)

  function startEditMiembro() {
    if (!miembro) return
    setMiembroForm({
      nombre: miembro.nombre, apellido: miembro.apellido,
      rol: miembro.rol ?? '', puesto_id: miembro.puesto_id ?? '',
      plaza_asignada: miembro.plaza_asignada ?? '',
      telefono: miembro.telefono ?? '', email: miembro.email ?? '',
      fecha_ingreso: miembro.fecha_ingreso ?? '',
      costo_hora: miembro.costo_hora != null ? String(miembro.costo_hora) : '',
      foto_url: miembro.foto_url ?? null,
      observaciones: miembro.observaciones ?? '',
      uniforme: uniformeFormFromRecord(miembro.uniforme),
    })
    setEditingMiembro(true)
  }

  async function saveEditMiembro() {
    if (!miembro) return
    setSaving(true)
    try {
      const puesto = puestos.find(p => p.id === miembroForm.puesto_id)
      const plaza = miembroForm.plaza_asignada || puesto?.plaza_default || null
      await actualizarMiembro(miembro.id, {
        nombre: miembroForm.nombre, apellido: miembroForm.apellido,
        rol: miembroForm.rol || undefined,
        puesto_id: miembroForm.puesto_id || null,
        plaza_asignada: plaza,
        telefono: miembroForm.telefono || null,
        email: miembroForm.email || null,
        fecha_ingreso: miembroForm.fecha_ingreso || null,
        costo_hora: miembroForm.costo_hora !== '' ? parseFloat(miembroForm.costo_hora) : null,
        foto_url: miembroForm.foto_url,
        observaciones: miembroForm.observaciones || null,
        uniforme: uniformeRecordFromForm(miembroForm.uniforme),
      })
      setEditingMiembro(false)
      onClose()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error al guardar') }
    setSaving(false)
  }

  async function handleDesactivar() {
    if (!miembro) return
    if (!confirm(`¿Desactivar a ${miembro.nombre} ${miembro.apellido}?`)) return
    try {
      await desactivarMiembro(miembro.id)
      onClose()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error al desactivar') }
  }

  async function handleReactivar() {
    if (!miembro) return
    try {
      await reactivarMiembro(miembro.id)
      onToast(`${miembro.nombre} reactivado`)
      onClose()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error al reactivar') }
  }

  function toggleExtra(modulo: string) {
    if (!miembro) return
    const puesto = puestos.find(p => p.id === miembro.puesto_id)
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
    if (!miembro) return 'off'
    const puesto = puestos.find(p => p.id === miembro.puesto_id)
    const enPuesto = (puesto?.permisos_app ?? []).includes(modulo)
    if (localRestringidos.includes(modulo)) return 'restringido'
    if (enPuesto) return 'puesto'
    if (localExtra.includes(modulo)) return 'extra'
    return 'off'
  }

  async function saveOverrides() {
    if (!miembro) return
    setSavingOverride(true)
    try {
      await actualizarOverridesMiembro(miembro.id, localExtra, localRestringidos, localVerCostos)
      setOverrideMode(false)
      onToast('Permisos actualizados')
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error al guardar permisos') }
    setSavingOverride(false)
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
        fecha_ingreso: miembroForm.fecha_ingreso || null, foto_url: miembroForm.foto_url,
        costo_hora: miembroForm.costo_hora !== '' ? parseFloat(miembroForm.costo_hora) : null,
        observaciones: miembroForm.observaciones || null,
        uniforme: uniformeRecordFromForm(miembroForm.uniforme),
      })
      onToast(`${miembroForm.nombre} agregado al equipo`)
      onClose()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error al crear') }
    setSaving(false)
  }

  // ── NUEVO MIEMBRO (2 pasos) ──
  if (esNuevo) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => formStep === 'datos' ? onClose() : setFormStep('datos')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>arrow_back</span>
          </button>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
            {formStep === 'datos' ? 'Nuevo miembro' : 'Asignar puesto'}
          </h2>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {(['datos', 'puesto'] as const).map(s => (
              <div key={s} style={{ width: 8, height: 8, borderRadius: '50%', background: formStep === s ? 'var(--navy)' : 'var(--border)' }} />
            ))}
          </div>
        </div>

        {formStep === 'datos' && (
          <>
            <MiembroFormDatos form={miembroForm} setForm={setMiembroForm} isAdmin={isAdmin} fotoPath={nuevoMiembroFotoPath} />
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
            <MiembroFormPuesto miembroForm={miembroForm} setMiembroForm={setMiembroForm} puestos={puestos} onIrACrearPuesto={onIrACrearPuesto} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={onClose} style={btnSecondary}>Cancelar</button>
              <button onClick={saveNuevoMiembro} disabled={saving} style={btnPrimary}>
                {saving ? 'Guardando...' : 'Agregar al equipo'}
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  const m = miembro
  const puesto = puestos.find(p => p.id === m.puesto_id)
  const modulos = getModulosMiembro(m)

  // ── EDITAR DATOS ──
  if (editingMiembro) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => setEditingMiembro(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>arrow_back</span>
          </button>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Editar miembro</h2>
        </div>
        <MiembroFormDatos form={miembroForm} setForm={setMiembroForm} isAdmin={isAdmin} fotoPath={`equipo/${m.id}`} />
        <div style={{ marginTop: 12 }}>
          <MiembroFormPuesto miembroForm={miembroForm} setMiembroForm={setMiembroForm} puestos={puestos} onIrACrearPuesto={onIrACrearPuesto} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={() => setEditingMiembro(false)} style={btnSecondary}>Cancelar</button>
          <button onClick={saveEditMiembro} disabled={saving} style={btnPrimary}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    )
  }

  // ── FICHA ──
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0, flex: 1 }}>Ficha</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>close</span>
        </button>
      </div>

      {/* Avatar */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20, gap: 8 }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%', overflow: 'hidden',
          background: nivelColor(puesto?.nivel ?? 'cocinero'),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 24, fontWeight: 700,
        }}>
          {m.foto_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : getInitials(m.nombre, m.apellido)}
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
          {
            label: 'Uniforme',
            value: m.uniforme == null
              ? 'Sin cargar'
              : Object.entries(m.uniforme).filter(([, n]) => n > 0).length === 0
                ? 'Nada prestado'
                : PRENDAS_UNIFORME
                    .filter(p => (m.uniforme?.[p.key] ?? 0) > 0)
                    .map(p => `${p.label} ×${m.uniforme![p.key]}`)
                    .join(' · '),
          },
        ].map(r => (
          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>{r.label}</span>
            <span style={{ fontSize: 14, color: 'var(--text-1)', fontWeight: 500, textAlign: 'right' }}>{r.value}</span>
          </div>
        ))}
      </div>

      {/* Observaciones */}
      {m.observaciones && (
        <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber-bg)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--amber-fg)' }}>sticky_note_2</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber-fg)' }}>Observaciones</span>
          </div>
          <p style={{ fontSize: 13, color: '#78350f', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{m.observaciones}</p>
        </div>
      )}

      {/* Módulos que puede ver */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Acceso a módulos</div>
          <button
            onClick={() => { setOverrideMode(v => !v); setLocalExtra(m.modulos_extra); setLocalRestringidos(m.modulos_restringidos); setLocalVerCostos(m.ver_costos) }}
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
                        state === 'puesto' ? 'var(--blue-bg)' :
                        state === 'extra' ? 'var(--green-bg)' :
                        state === 'restringido' ? 'var(--red-bg)' : 'var(--bg)',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{
                      fontSize: 18,
                      color: state === 'puesto' ? 'var(--blue-fg)' : state === 'extra' ? '#065f46' : state === 'restringido' ? 'var(--red-fg)' : 'var(--text-3)',
                    }}>
                      {cfg?.icon ?? 'widgets'}
                    </span>
                    <span style={{
                      fontSize: 13, fontWeight: 500,
                      color: state === 'restringido' ? 'var(--red-fg)' : 'var(--text-1)',
                      textDecoration: state === 'restringido' ? 'line-through' : 'none',
                      flex: 1,
                    }}>
                      {cfg?.label ?? mod}
                    </span>
                    {state === 'puesto' && <span style={{ fontSize: 10, color: 'var(--blue-fg)', fontWeight: 600 }}>PUESTO</span>}
                    {state === 'extra' && <span style={{ fontSize: 10, color: '#065f46', fontWeight: 600 }}>EXTRA</span>}
                  </button>
                )
              })}
            </div>
            {/* Override de costos: cicla hereda -> si -> no. Aparte de la
                grilla de modulos porque no es una pantalla, es la plata. */}
            {(() => {
              const puestoDe = puestos.find(pu => pu.id === m.puesto_id)
              const heredado = puestoDe?.ver_costos ?? false
              const efectivo = localVerCostos ?? heredado
              const etiqueta = localVerCostos === null
                ? `Hereda del puesto (${heredado ? 've costos' : 'no ve'})`
                : localVerCostos ? 'Ve costos (forzado)' : 'No ve costos (bloqueado)'
              return (
                <button
                  onClick={() => setLocalVerCostos(prev => prev === null ? true : prev ? false : null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginTop: 12,
                    borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%',
                    border: localVerCostos === null ? '1px dashed var(--border)' : '1px solid rgba(245,158,11,.45)',
                    background: efectivo ? 'rgba(245,158,11,.10)' : 'var(--bg)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: efectivo ? '#f59e0b' : 'var(--text-3)' }}>payments</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>Costos y food cost</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{etiqueta}</div>
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>swap_horiz</span>
                </button>
              )
            })()}
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
                      background: isExtra ? 'var(--green-bg)' : 'var(--blue-bg)',
                      color: isExtra ? '#065f46' : 'var(--blue-fg)',
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
        {m.activo ? (
          <button onClick={handleDesactivar} style={btnDanger}>Desactivar</button>
        ) : (
          <button onClick={handleReactivar} style={{ ...btnPrimary, background: '#10b981' }}>Reactivar</button>
        )}
      </div>
    </div>
  )
}
