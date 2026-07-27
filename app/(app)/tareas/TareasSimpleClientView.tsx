'use client'

import { useState, useMemo, type CSSProperties } from 'react'
import PageTransition from '@/components/PageTransition'
import { SheetChrome } from '@/lib/ui/chrome'
import { EmptyState, FilterChips, HeaderAction } from '@/components/ui'
import type { FilterChip } from '@/components/ui'
import { useTareas } from '@/lib/hooks/useTareas'
import type { Tarea, TareaPrioridad } from '@/types'

// Lista de tareas simple para perfil 'emprendimiento' — ve/carga/edita lo que
// hay que hacer, sin conceptos de OPS (plaza, menú, turno). Reusa la misma
// tabla `tareas` que OPS (lib/hooks/useTareas.ts) pero con su propia UI,
// ignorando los campos de mise que esta pantalla no necesita.

type FiltroEstado = 'pendientes' | 'completadas' | 'todas'

const FILTROS: FilterChip<FiltroEstado>[] = [
  { value: 'pendientes', label: 'Pendientes' },
  { value: 'completadas', label: 'Completadas' },
  { value: 'todas', label: 'Todas' },
]

const PRIORIDADES: { value: TareaPrioridad; label: string; color: string }[] = [
  { value: 'alta', label: 'Alta', color: '#dc2626' },
  { value: 'media', label: 'Media', color: '#d97706' },
  { value: 'baja', label: 'Baja', color: '#64748b' },
]

function estaCompletada(t: Tarea): boolean {
  return t.estado === 'listo' || t.status === 'completada'
}

function fmtFechaCorta(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

function estaVencida(t: Tarea): boolean {
  if (!t.fecha_limite || estaCompletada(t)) return false
  return t.fecha_limite < new Date().toISOString().slice(0, 10)
}

const inputStyle: CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--surface)',
  fontSize: 14, color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}
const labelStyle: CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, display: 'block',
}

export default function TareasSimpleClientView() {
  const { tareas, loading, agregarTarea, actualizarTarea, cambiarEstado, eliminarTarea } = useTareas()
  const [filtro, setFiltro] = useState<FiltroEstado>('pendientes')
  const [sheetTarea, setSheetTarea] = useState<Tarea | 'nueva' | null>(null)
  const [saving, setSaving] = useState(false)

  const visibles = useMemo(() => {
    const base = tareas.filter(t => {
      if (filtro === 'todas') return true
      const completada = estaCompletada(t)
      return filtro === 'completadas' ? completada : !completada
    })
    return [...base].sort((a, b) => {
      const fa = a.fecha_limite ?? '9999-99-99'
      const fb = b.fecha_limite ?? '9999-99-99'
      if (fa !== fb) return fa < fb ? -1 : 1
      return (b.created_at ?? '').localeCompare(a.created_at ?? '')
    })
  }, [tareas, filtro])

  async function handleToggle(t: Tarea) {
    await cambiarEstado(t.id, estaCompletada(t) ? 'pendiente' : 'listo')
  }

  async function handleGuardar(datos: { titulo: string; descripcion: string; fechaLimite: string; prioridad: TareaPrioridad }) {
    setSaving(true)
    try {
      if (sheetTarea && sheetTarea !== 'nueva') {
        await actualizarTarea(sheetTarea.id, {
          titulo: datos.titulo,
          descripcion: datos.descripcion || null,
          fecha_limite: datos.fechaLimite || null,
          prioridad: datos.prioridad,
        })
      } else {
        await agregarTarea({
          titulo: datos.titulo,
          descripcion: datos.descripcion || null,
          fecha_limite: datos.fechaLimite || null,
          prioridad: datos.prioridad,
          status: 'pendiente',
          estado: 'pendiente',
          seccion: 'general',
        })
      }
      setSheetTarea(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleEliminar() {
    if (!sheetTarea || sheetTarea === 'nueva') return
    await eliminarTarea(sheetTarea.id)
    setSheetTarea(null)
  }

  return (
    <PageTransition>
      <div className="flex flex-col h-full" style={{ overflow: 'hidden' }}>
        <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 12px', flexShrink: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Tareas</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>
                Lo que hay que hacer
              </div>
            </div>
            <HeaderAction label="Nueva" onClick={() => setSheetTarea('nueva')} />
          </div>
          <FilterChips chips={FILTROS} active={filtro} onChange={setFiltro} context="onDark" />
        </div>

        <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
          {loading && <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Cargando…</p>}

          {!loading && visibles.length === 0 && (
            <EmptyState
              icon="checklist"
              title={filtro === 'completadas' ? 'Sin tareas completadas' : 'Sin tareas pendientes'}
              subtitle={
                filtro === 'completadas'
                  ? undefined
                  : 'Cargá lo que tengas que hacer — pedirle algo a un proveedor, preparar un lote, llamar a un cliente.'
              }
              cta={filtro !== 'completadas' ? { label: 'Nueva tarea', onClick: () => setSheetTarea('nueva') } : undefined}
            />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibles.map(t => (
              <TareaRow key={t.id} tarea={t} onToggle={() => handleToggle(t)} onEdit={() => setSheetTarea(t)} />
            ))}
          </div>
        </div>
      </div>

      {sheetTarea && (
        <SheetChrome>
          <TareaSheet
            tarea={sheetTarea === 'nueva' ? null : sheetTarea}
            saving={saving}
            onClose={() => setSheetTarea(null)}
            onGuardar={handleGuardar}
            onEliminar={sheetTarea !== 'nueva' ? handleEliminar : undefined}
          />
        </SheetChrome>
      )}
    </PageTransition>
  )
}

// ── Fila de tarea — nivel de módulo (evita remount por foco, ver hooks.md) ──
function TareaRow({ tarea, onToggle, onEdit }: { tarea: Tarea; onToggle: () => void; onEdit: () => void }) {
  const completada = estaCompletada(tarea)
  const vencida = estaVencida(tarea)
  const prioridadCfg = PRIORIDADES.find(p => p.value === tarea.prioridad)

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '12px 14px', borderRadius: 12,
        background: 'var(--surface)', border: '1px solid var(--border)',
        opacity: completada ? 0.6 : 1,
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1,
          border: completada ? 'none' : '2px solid var(--border)',
          background: completada ? '#16a34a' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', padding: 0,
        }}
      >
        {completada && <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#fff' }}>check</span>}
      </button>

      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onEdit}>
        <p style={{
          fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0,
          textDecoration: completada ? 'line-through' : 'none',
        }}>
          {tarea.titulo}
        </p>
        {tarea.descripcion && (
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {tarea.descripcion}
          </p>
        )}
        {(tarea.fecha_limite || prioridadCfg) && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {tarea.fecha_limite && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                background: vencida ? 'rgba(220,38,38,.12)' : 'rgba(100,116,139,.12)',
                color: vencida ? '#dc2626' : 'var(--text-3)',
              }}>
                {fmtFechaCorta(tarea.fecha_limite)}
              </span>
            )}
            {prioridadCfg && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                background: `${prioridadCfg.color}18`, color: prioridadCfg.color,
              }}>
                {prioridadCfg.label}
              </span>
            )}
          </div>
        )}
      </div>

      <button onClick={onEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0, padding: 4 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
      </button>
    </div>
  )
}

// ── Sheet crear/editar — nivel de módulo (inputs con foco, ver hooks.md) ──
function TareaSheet({
  tarea, saving, onClose, onGuardar, onEliminar,
}: {
  tarea: Tarea | null
  saving: boolean
  onClose: () => void
  onGuardar: (datos: { titulo: string; descripcion: string; fechaLimite: string; prioridad: TareaPrioridad }) => void
  onEliminar?: () => void
}) {
  const [titulo, setTitulo] = useState(tarea?.titulo ?? '')
  const [descripcion, setDescripcion] = useState(tarea?.descripcion ?? '')
  const [fechaLimite, setFechaLimite] = useState(tarea?.fecha_limite ?? '')
  const [prioridad, setPrioridad] = useState<TareaPrioridad>((tarea?.prioridad as TareaPrioridad) ?? 'media')

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 16px 12px', flexShrink: 0 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
            {tarea ? 'Editar tarea' : 'Nueva tarea'}
          </p>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Título</label>
            <input
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Ej: Pedirle harina a La Mensola"
              style={inputStyle}
              autoFocus
            />
          </div>
          <div>
            <label style={labelStyle}>Descripción (opcional)</label>
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          <div>
            <label style={labelStyle}>Fecha límite (opcional)</label>
            <input type="date" value={fechaLimite} onChange={e => setFechaLimite(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Prioridad</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {PRIORIDADES.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPrioridad(p.value)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    border: prioridad === p.value ? `1px solid ${p.color}` : '1px solid var(--border)',
                    background: prioridad === p.value ? `${p.color}18` : 'var(--bg)',
                    color: prioridad === p.value ? p.color : 'var(--text-2)',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: 16, paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => onGuardar({ titulo, descripcion, fechaLimite, prioridad })}
            disabled={saving || !titulo.trim()}
            style={{
              width: '100%', padding: 13, borderRadius: 12, border: 'none',
              background: 'var(--navy)', color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', opacity: (saving || !titulo.trim()) ? 0.6 : 1, fontFamily: 'inherit',
            }}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          {onEliminar && (
            <button
              onClick={onEliminar}
              style={{
                width: '100%', padding: 12, borderRadius: 12,
                border: '1px solid rgba(220,38,38,.3)', background: 'none', color: '#dc2626',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Eliminar tarea
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: 12, borderRadius: 12,
              background: 'transparent', border: '1px solid var(--border)',
              fontSize: 13, color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
