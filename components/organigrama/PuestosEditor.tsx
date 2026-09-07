'use client'

// Editor de puestos (crear/editar/templates/detalle) — movido de
// turnos/page.tsx (S6, sep 2026), junto con la ficha del equipo.

import { useState } from 'react'
import { MODULO_CONFIG, AREA_CATALOGO } from '@/lib/constants'
import {
  PUESTO_TEMPLATES, idsDescendientes, type Puesto, type Miembro, type PuestoTemplate,
} from '@/lib/hooks/useEquipo'
import { NIVELES_ACCESO } from '@/lib/hooks/useEquipo'
import {
  PLAZAS_OPS, MODULOS_ASIGNABLES, getInitials, nivelLabel, nivelColor,
  fieldStyle, labelStyle, btnPrimary, btnSecondary, btnDanger,
  type PuestoForm, EMPTY_PUESTO_FORM, objetivosDeForm,
} from './equipoShared'

// ══════════════════════════════════════════════════════════════
// FORM — fuera del panel para identidad estable
// ══════════════════════════════════════════════════════════════

export function PuestoFormBody({
  form, setForm, puestos, selfId,
}: {
  form: PuestoForm
  setForm: React.Dispatch<React.SetStateAction<PuestoForm>>
  puestos: Puesto[]
  selfId?: string
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
        <label style={{ ...labelStyle, marginBottom: 8 }}>Área</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {AREA_CATALOGO.map(a => {
            const active = form.area_key === a.key
            return (
              <button key={a.key} type="button"
                onClick={() => setForm(f => ({ ...f, area_key: active ? '' : a.key }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 20,
                  border: `1.5px solid ${active ? a.color : 'var(--border)'}`,
                  background: active ? a.color + '18' : 'var(--surface)',
                  color: active ? a.color : 'var(--text-2)',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{a.icon}</span>
                {a.nombre}
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <label style={labelStyle}>Reporta a</label>
        <select style={fieldStyle} value={form.reporta_a_puesto_id}
          onChange={e => setForm(f => ({ ...f, reporta_a_puesto_id: e.target.value }))}>
          <option value="">— Nadie (raíz del organigrama) —</option>
          {puestos
            .filter(p => p.id !== selfId && !(selfId && idsDescendientes(selfId, puestos).has(p.id)))
            .map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Plaza OPS por defecto</label>
        <select style={fieldStyle} value={form.plaza_default}
          onChange={e => setForm(f => ({ ...f, plaza_default: e.target.value }))}>
          <option value="">Sin plaza fija (rota entre plazas)</option>
          {PLAZAS_OPS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>
      </div>
      {puestos.some(p => p.id !== selfId) && (
        <div>
          <label style={labelStyle}>Clonar permisos de otro puesto</label>
          <select
            style={fieldStyle}
            value=""
            onChange={e => {
              const origen = puestos.find(p => p.id === e.target.value)
              if (!origen) return
              setForm(f => ({ ...f, permisos_app: [...origen.permisos_app], ver_costos: origen.ver_costos }))
            }}
          >
            <option value="">— Elegir puesto —</option>
            {puestos.filter(p => p.id !== selfId).map(p => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '4px 0 0' }}>
            Copia sus módulos visibles y acceso a información económica — podés ajustarlos después de clonar.
          </p>
        </div>
      )}
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
      {/* ── Ver costos ──────────────────────────────────────────────────
          Bloque aparte y no un modulo mas de la grilla de arriba: no es una
          pantalla que se muestra, es acceso a la plata del negocio (precios de
          compra, food cost, margen, stock valorizado). El admin tiene que ver
          que esta tomando la decision, no tildarlo de paso entre otros veinte. */}
      <div>
        <label style={{ ...labelStyle, marginBottom: 8 }}>Acceso a informacion economica</label>
        <button type="button" onClick={() => setForm(f => ({ ...f, ver_costos: !f.ver_costos }))}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12,
            border: form.ver_costos ? '1px solid rgba(245,158,11,.45)' : '1px solid var(--border)',
            cursor: 'pointer', textAlign: 'left', width: '100%',
            background: form.ver_costos ? 'rgba(245,158,11,.10)' : 'var(--surface)',
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: form.ver_costos ? '#f59e0b' : 'var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: form.ver_costos ? '#fff' : 'var(--text-3)' }}>payments</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: form.ver_costos ? 600 : 400, color: 'var(--text-1)' }}>
              Ve costos y food cost
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
              Precios de compra, costo de recetas, margen y stock valorizado
            </div>
          </div>
          <div style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
            background: form.ver_costos ? '#f59e0b' : 'transparent',
            border: form.ver_costos ? 'none' : '2px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {form.ver_costos && <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>check</span>}
          </div>
        </button>
      </div>
      <div>
        <label style={labelStyle}>Tareas y funciones (una por línea)</label>
        <textarea style={{ ...fieldStyle, minHeight: 80, resize: 'vertical' }} value={form.tareas_funciones}
          onChange={e => setForm(f => ({ ...f, tareas_funciones: e.target.value }))}
          placeholder={'Mise en place de parrilla\nControl de temperaturas\nLimpiar estación al cierre'} />
      </div>
      <div>
        <label style={{ ...labelStyle, marginBottom: 4 }}>Objetivos de venta (opcional)</label>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 10px', lineHeight: 1.4 }}>
          Solo tiene sentido en puestos de salón. Se muestran como referencia en Reportes → Personal, junto a la venta real — sin armar un ranking.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4, display: 'block' }}>% de comandas con postre</label>
            <input type="number" min={0} max={100} style={fieldStyle} value={form.obj_pct_postre}
              onChange={e => setForm(f => ({ ...f, obj_pct_postre: e.target.value }))} placeholder="Ej: 25" />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4, display: 'block' }}>% de comandas con café</label>
            <input type="number" min={0} max={100} style={fieldStyle} value={form.obj_pct_cafe}
              onChange={e => setForm(f => ({ ...f, obj_pct_cafe: e.target.value }))} placeholder="Ej: 25" />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4, display: 'block' }}>Ticket promedio ($)</label>
            <input type="number" min={0} style={fieldStyle} value={form.obj_ticket_promedio}
              onChange={e => setForm(f => ({ ...f, obj_ticket_promedio: e.target.value }))} placeholder="Ej: 12000" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// PANEL PRINCIPAL
// ══════════════════════════════════════════════════════════════

type PuestosView = 'list' | 'detalle' | 'nuevo' | 'template'

export interface PuestosEditorPanelProps {
  puestos: Puesto[]
  miembros: Miembro[]
  crearPuesto: (datos: Omit<Puesto, 'id' | 'restaurante_id' | 'created_at'>) => Promise<unknown>
  actualizarPuesto: (id: string, datos: Partial<Omit<Puesto, 'id' | 'restaurante_id' | 'created_at'>>) => Promise<unknown>
  eliminarPuesto: (id: string) => Promise<unknown>
  onToast: (msg: string) => void
}

export function PuestosEditorPanel({
  puestos, miembros, crearPuesto, actualizarPuesto, eliminarPuesto, onToast,
}: PuestosEditorPanelProps) {
  const [view, setView] = useState<PuestosView>('list')
  const [selectedPuesto, setSelectedPuesto] = useState<Puesto | null>(null)
  const [editingPuesto, setEditingPuesto] = useState(false)
  const [puestoForm, setPuestoForm] = useState<PuestoForm>(EMPTY_PUESTO_FORM)
  const [saving, setSaving] = useState(false)

  const miembroCountByPuesto: Record<string, number> = {}
  for (const mi of miembros) {
    if (mi.puesto_id) miembroCountByPuesto[mi.puesto_id] = (miembroCountByPuesto[mi.puesto_id] ?? 0) + 1
  }

  function openPuestoDetalle(p: Puesto) {
    setSelectedPuesto(p); setEditingPuesto(false); setView('detalle')
  }

  function startEditPuesto() {
    if (!selectedPuesto) return
    setPuestoForm({
      nombre: selectedPuesto.nombre,
      descripcion: selectedPuesto.descripcion ?? '',
      nivel: selectedPuesto.nivel ?? 'cocinero',
      plaza_default: selectedPuesto.plaza_default ?? '',
      permisos_app: selectedPuesto.permisos_app ?? [],
      ver_costos: selectedPuesto.ver_costos ?? false,
      tareas_funciones: (selectedPuesto.tareas_funciones ?? []).join('\n'),
      area_key: selectedPuesto.area_key ?? '',
      reporta_a_puesto_id: selectedPuesto.reporta_a_puesto_id ?? '',
      obj_pct_postre: selectedPuesto.objetivos?.pct_comandas_con_postre?.toString() ?? '',
      obj_pct_cafe: selectedPuesto.objetivos?.pct_comandas_con_cafe?.toString() ?? '',
      obj_ticket_promedio: selectedPuesto.objetivos?.ticket_promedio?.toString() ?? '',
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
        ver_costos: puestoForm.ver_costos,
        tareas_funciones: puestoForm.tareas_funciones.split('\n').map(s => s.trim()).filter(Boolean),
        area_key: puestoForm.area_key || null,
        reporta_a_puesto_id: puestoForm.reporta_a_puesto_id || null,
        objetivos: objetivosDeForm(puestoForm),
      })
      setEditingPuesto(false); setView('list'); setSelectedPuesto(null)
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error al guardar') }
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
        ver_costos: puestoForm.ver_costos,
        tareas_funciones: puestoForm.tareas_funciones.split('\n').map(s => s.trim()).filter(Boolean),
        area_key: puestoForm.area_key || null,
        reporta_a_puesto_id: puestoForm.reporta_a_puesto_id || null,
        orden: 0,
        objetivos: objetivosDeForm(puestoForm),
      })
      setView('list')
      onToast(`Puesto "${puestoForm.nombre}" creado`)
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error al crear') }
    setSaving(false)
  }

  function applyTemplate(tpl: PuestoTemplate) {
    setPuestoForm({
      nombre: tpl.nombre,
      descripcion: tpl.descripcion,
      nivel: tpl.nivel,
      plaza_default: tpl.plaza_default ?? '',
      permisos_app: [...tpl.permisos_app],
      // Las plantillas nunca otorgan costos: es una decision explicita del
      // admin, no algo que se arrastre por elegir un preset de puesto.
      ver_costos: false,
      tareas_funciones: tpl.tareas_funciones.join('\n'),
      area_key: tpl.area_key,
      reporta_a_puesto_id: '',
      obj_pct_postre: '', obj_pct_cafe: '', obj_ticket_promedio: '',
    })
    setView('nuevo')
  }

  // ── DETALLE ──
  if (view === 'detalle' && selectedPuesto) {
    if (editingPuesto) {
      return (
        <NuevoPuestoForm
          isEdit puestoNombre={selectedPuesto.nombre}
          form={puestoForm} setForm={setPuestoForm} puestos={puestos} selfId={selectedPuesto.id}
          saving={saving}
          onCancel={() => setEditingPuesto(false)}
          onSave={saveEditPuesto}
        />
      )
    }
    const p = selectedPuesto
    const miembrosDelPuesto = miembros.filter(m => m.puesto_id === p.id)
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <button onClick={() => { setView('list'); setSelectedPuesto(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>arrow_back</span>
          </button>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0, flex: 1 }}>{p.nombre}</h2>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: nivelColor(p.nivel) + '22', color: nivelColor(p.nivel) }}>
            {nivelLabel(p.nivel)}
          </span>
        </div>

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

        {(p.objetivos?.pct_comandas_con_postre != null || p.objetivos?.pct_comandas_con_cafe != null || p.objetivos?.ticket_promedio != null) && (
          <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10 }}>Objetivos de venta</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {p.objetivos?.pct_comandas_con_postre != null && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Postre</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>{p.objetivos.pct_comandas_con_postre}%</div>
                </div>
              )}
              {p.objetivos?.pct_comandas_con_cafe != null && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Café</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>{p.objetivos.pct_comandas_con_cafe}%</div>
                </div>
              )}
              {p.objetivos?.ticket_promedio != null && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Ticket promedio</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>${p.objetivos.ticket_promedio.toLocaleString('es-AR')}</div>
                </div>
              )}
            </div>
          </div>
        )}

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

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={startEditPuesto} style={{ ...btnPrimary, flex: 1 }}>Editar puesto</button>
          {miembrosDelPuesto.length === 0 && (
            <button
              onClick={async () => {
                if (!confirm(`¿Eliminar el puesto "${p.nombre}"?`)) return
                try {
                  await eliminarPuesto(p.id)
                  setView('list'); setSelectedPuesto(null)
                  onToast('Puesto eliminado')
                } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error al eliminar') }
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

  // ── NUEVO ──
  if (view === 'nuevo') {
    return (
      <NuevoPuestoForm
        isEdit={false} puestoNombre=""
        form={puestoForm} setForm={setPuestoForm} puestos={puestos} selfId={undefined}
        saving={saving}
        onCancel={() => setView('list')}
        onSave={saveNuevoPuesto}
      />
    )
  }

  // ── TEMPLATE PICKER ──
  if (view === 'template') {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
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

  // ── LISTA ──
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
        <button onClick={() => setView('template')} style={{ ...btnSecondary, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span>
          Desde template
        </button>
        <button onClick={() => { setPuestoForm(EMPTY_PUESTO_FORM); setView('nuevo') }} style={{ ...btnPrimary, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
          Crear propio
        </button>
      </div>
    </div>
  )
}

function NuevoPuestoForm({
  isEdit, puestoNombre, form, setForm, puestos, selfId, saving, onCancel, onSave,
}: {
  isEdit: boolean
  puestoNombre: string
  form: PuestoForm
  setForm: React.Dispatch<React.SetStateAction<PuestoForm>>
  puestos: Puesto[]
  selfId?: string
  saving: boolean
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>arrow_back</span>
        </button>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
          {isEdit ? `Editar: ${puestoNombre}` : 'Nuevo puesto'}
        </h2>
      </div>
      <PuestoFormBody form={form} setForm={setForm} puestos={puestos} selfId={selfId} />
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button onClick={onCancel} style={btnSecondary}>Cancelar</button>
        <button onClick={onSave} disabled={saving} style={btnPrimary}>
          {saving ? 'Guardando...' : 'Guardar puesto'}
        </button>
      </div>
    </div>
  )
}
