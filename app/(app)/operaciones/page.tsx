'use client'

import { useState, useMemo, useEffect } from 'react'
import ChecklistPage from '@/app/(app)/checklist/ClientView'
import TareasPage from '@/app/(app)/tareas/ClientView'
import ProduccionPage from '@/app/(app)/produccion/page'
import { useEventoItems } from '@/lib/hooks/useEventoItems'
import type { EventoItem, EventoItemStatus } from '@/types'

type Tab = 'produccion' | 'mise' | 'planificacion'
type SubTabPlan = 'menu' | 'eventos'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'produccion',    label: 'Producción',   icon: 'task_alt' },
  { id: 'mise',          label: 'Mise',         icon: 'playlist_add_check' },
  { id: 'planificacion', label: 'Planificación', icon: 'factory' },
]

// ── Helpers ──────────────────────────────────────────────────
function fmtDate(d: Date) {
  return d.toISOString().split('T')[0]
}

// ══════════════════════════════════════════════════════════════
// EVENTOS VIEW
// ══════════════════════════════════════════════════════════════
interface ItemForm {
  plato_nombre: string
  componente_nombre: string
  plaza: string
  cantidad_personas: string
  notas: string
}

function EventosView() {
  const [fecha, setFecha] = useState(() => fmtDate(new Date()))
  const { items, loading, fetchEventoItems, crearEventoItem, updateStatus, eliminarEventoItem } = useEventoItems()
  const [modalOpen, setModalOpen] = useState(false)
  const [eventoNombre, setEventoNombre] = useState('')
  const [itemsForm, setItemsForm] = useState<ItemForm[]>([
    { plato_nombre: '', componente_nombre: '', plaza: '', cantidad_personas: '', notas: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  // Reagrupar items por evento_nombre
  const grupos = useMemo(() => {
    const map = new Map<string, EventoItem[]>()
    for (const item of items) {
      const list = map.get(item.evento_nombre) ?? []
      list.push(item)
      map.set(item.evento_nombre, list)
    }
    return [...map.entries()]
  }, [items])

  function handleChangeFecha(newFecha: string) {
    setFecha(newFecha)
    fetchEventoItems(newFecha)
  }

  function addItemRow() {
    setItemsForm(prev => [
      ...prev,
      { plato_nombre: '', componente_nombre: '', plaza: '', cantidad_personas: '', notas: '' },
    ])
  }

  function removeItemRow(idx: number) {
    setItemsForm(prev => prev.filter((_, i) => i !== idx))
  }

  function updateItemRow(idx: number, field: keyof ItemForm, value: string) {
    setItemsForm(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row))
  }

  async function handleGuardar() {
    if (!eventoNombre.trim()) { showToast('Ingresá el nombre del evento'); return }
    const validItems = itemsForm.filter(r => r.plato_nombre.trim() && r.componente_nombre.trim())
    if (validItems.length === 0) { showToast('Agregá al menos un ítem con plato y componente'); return }

    setSaving(true)
    try {
      for (const row of validItems) {
        await crearEventoItem({
          evento_nombre: eventoNombre.trim(),
          fecha,
          plato_nombre: row.plato_nombre.trim(),
          componente_nombre: row.componente_nombre.trim(),
          plaza: row.plaza.trim() || null,
          cantidad_personas: row.cantidad_personas ? Number(row.cantidad_personas) : null,
          notas: row.notas.trim() || null,
          status: 'pendiente',
        })
      }
      await fetchEventoItems(fecha)
      setModalOpen(false)
      setEventoNombre('')
      setItemsForm([{ plato_nombre: '', componente_nombre: '', plaza: '', cantidad_personas: '', notas: '' }])
      showToast('Evento guardado')
    } catch (e: unknown) {
      showToast('Error: ' + (e instanceof Error ? e.message : 'desconocido'))
    } finally {
      setSaving(false)
    }
  }

  async function handleCycleStatus(item: EventoItem) {
    const next: EventoItemStatus =
      item.status === 'pendiente' ? 'en_proceso'
        : item.status === 'en_proceso' ? 'listo'
          : 'pendiente'
    try {
      await updateStatus(item.id, next)
    } catch (e: unknown) {
      showToast('Error: ' + (e instanceof Error ? e.message : 'desconocido'))
    }
  }

  async function handleEliminar(id: string) {
    try {
      await eliminarEventoItem(id)
      showToast('Eliminado')
    } catch (e: unknown) {
      showToast('Error: ' + (e instanceof Error ? e.message : 'desconocido'))
    }
  }

  function statusIcon(s: EventoItemStatus) {
    if (s === 'listo') return 'check_circle'
    if (s === 'en_proceso') return 'pending'
    return 'radio_button_unchecked'
  }

  function statusColor(s: EventoItemStatus) {
    if (s === 'listo') return '#22c55e'
    if (s === 'en_proceso') return '#3b82f6'
    return 'var(--border)'
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    fontSize: 13,
    color: 'var(--text-1)',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', paddingBottom: 140 }}>
      {/* Selector de fecha */}
      <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>event</span>
        <input
          type="date"
          value={fecha}
          onChange={e => handleChangeFecha(e.target.value)}
          style={{
            padding: '5px 10px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            fontSize: 13,
            color: 'var(--text-1)',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Contenido */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)', fontSize: 13 }}>
          Cargando...
        </div>
      ) : grupos.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '60px 24px', textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-3)' }}>celebration</span>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', margin: 0 }}>No hay eventos para este día</p>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>Tocá el botón + para cargar un evento</p>
        </div>
      ) : (
        <div style={{ padding: '0 12px' }}>
          {grupos.map(([eventoNombreGrupo, grupoItems]) => {
            const total = grupoItems.length
            const listos = grupoItems.filter(i => i.status === 'listo').length
            const pct = total > 0 ? (listos / total) * 100 : 0
            const isCollapsed = collapsed[eventoNombreGrupo] ?? false
            const cantPersonas = grupoItems.find(i => i.cantidad_personas != null)?.cantidad_personas

            return (
              <div
                key={eventoNombreGrupo}
                style={{
                  marginBottom: 10,
                  borderRadius: 14,
                  overflow: 'hidden',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                }}
              >
                {/* Header del grupo — colapsable */}
                <button
                  onClick={() => setCollapsed(prev => ({ ...prev, [eventoNombreGrupo]: !prev[eventoNombreGrupo] }))}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 14px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)', flexShrink: 0 }}>celebration</span>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{eventoNombreGrupo}</div>
                    {cantPersonas != null && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                        {cantPersonas} personas
                      </div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: "'DM Mono', monospace",
                    color: listos === total ? '#22c55e' : 'var(--text-3)',
                    flexShrink: 0,
                  }}>
                    {listos}/{total}
                  </span>
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: 18,
                      color: 'var(--text-3)',
                      transition: 'transform .15s',
                      transform: isCollapsed ? 'rotate(-90deg)' : 'none',
                      flexShrink: 0,
                    }}
                  >
                    expand_more
                  </span>
                </button>

                {/* Barra de progreso */}
                <div style={{ height: 2, background: 'var(--border)' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: '#22c55e', transition: 'width .3s' }} />
                </div>

                {/* Items */}
                {!isCollapsed && (
                  <div style={{ padding: '4px 8px 8px' }}>
                    {grupoItems.map(item => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 6px',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        {/* Status toggle */}
                        <button
                          onClick={() => handleCycleStatus(item)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: 22, color: statusColor(item.status), transition: 'color .15s' }}
                          >
                            {statusIcon(item.status)}
                          </span>
                        </button>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: item.status === 'listo' ? '#15803d' : 'var(--text-1)',
                            textDecoration: item.status === 'listo' ? 'line-through' : 'none',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {item.plato_nombre}
                            {item.componente_nombre && (
                              <span style={{ fontWeight: 400, color: 'var(--text-3)', marginLeft: 4 }}>
                                — {item.componente_nombre}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                            {item.plaza && (
                              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)' }}>
                                {item.plaza}
                              </span>
                            )}
                            {item.notas && (
                              <span style={{ fontSize: 10, color: 'var(--text-3)', fontStyle: 'italic' }}>
                                {item.notas}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Eliminar */}
                        <button
                          onClick={() => handleEliminar(item.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 4,
                            flexShrink: 0,
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ef4444' }}>delete</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* FAB + */}
      <button
        onClick={() => setModalOpen(true)}
        style={{
          position: 'fixed',
          bottom: 110,
          right: 16,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'var(--accent)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(0,0,0,.2)',
          zIndex: 40,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 26, color: '#fff' }}>add</span>
      </button>

      {/* Modal crear evento */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,.5)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}
        >
          <div style={{
            background: 'var(--surface)',
            borderRadius: '20px 20px 0 0',
            padding: '20px 16px 36px',
            width: '100%',
            maxWidth: 500,
            maxHeight: '90vh',
            overflowY: 'auto',
          }}>
            {/* Cabecera modal */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Nuevo evento</h2>
              <button
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-3)' }}>close</span>
              </button>
            </div>

            {/* Nombre del evento */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 4 }}>
                Nombre del evento
              </label>
              <input
                autoFocus
                value={eventoNombre}
                onChange={e => setEventoNombre(e.target.value)}
                placeholder="Ej: Boda García, Cena corporativa"
                style={fieldStyle}
              />
            </div>

            {/* Fecha */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 4 }}>
                Fecha
              </label>
              <input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                style={fieldStyle}
              />
            </div>

            {/* Items del evento */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 8 }}>
                Items ({itemsForm.filter(r => r.plato_nombre.trim() && r.componente_nombre.trim()).length} válidos)
              </label>

              {itemsForm.map((row, idx) => (
                <div
                  key={idx}
                  style={{
                    marginBottom: 10,
                    padding: 10,
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>Ítem {idx + 1}</span>
                    {itemsForm.length > 1 && (
                      <button
                        onClick={() => removeItemRow(idx)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ef4444' }}>close</span>
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input
                      value={row.plato_nombre}
                      onChange={e => updateItemRow(idx, 'plato_nombre', e.target.value)}
                      placeholder="Plato (ej: Lomo a la sal)"
                      style={fieldStyle}
                    />
                    <input
                      value={row.componente_nombre}
                      onChange={e => updateItemRow(idx, 'componente_nombre', e.target.value)}
                      placeholder="Componente (ej: Salsa chimichurri)"
                      style={fieldStyle}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={row.plaza}
                        onChange={e => updateItemRow(idx, 'plaza', e.target.value)}
                        placeholder="Plaza (opcional)"
                        style={{ ...fieldStyle, flex: 1 }}
                      />
                      <input
                        type="number"
                        value={row.cantidad_personas}
                        onChange={e => updateItemRow(idx, 'cantidad_personas', e.target.value)}
                        placeholder="Personas"
                        min={1}
                        style={{ ...fieldStyle, width: 100, flex: 'none' }}
                      />
                    </div>
                    <input
                      value={row.notas}
                      onChange={e => updateItemRow(idx, 'notas', e.target.value)}
                      placeholder="Notas (opcional)"
                      style={fieldStyle}
                    />
                  </div>
                </div>
              ))}

              <button
                onClick={addItemRow}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: 8,
                  border: '1px dashed var(--border)',
                  background: 'transparent',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-2)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                Agregar ítem
              </button>
            </div>

            {/* Acciones */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setModalOpen(false)}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-2)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardar}
                disabled={saving}
                style={{
                  flex: 2,
                  padding: '11px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--navy)',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#fff',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Guardando...' : 'Guardar evento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 999,
          padding: '8px 16px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          color: '#fff',
          background: toast.startsWith('Error') ? '#ef4444' : '#22c55e',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// OPERACIONES PAGE (tab container principal)
// ══════════════════════════════════════════════════════════════
export default function OperacionesPage() {
  const [tab, setTab] = useState<Tab>('produccion')
  const [subTabPlan, setSubTabPlan] = useState<SubTabPlan>('menu')

  // Write screen context for KitchenCoach on tab change
  useEffect(() => {
    try {
      localStorage.setItem('kc_screen_context', JSON.stringify({
        screen: 'operaciones',
        tab,
        ...(tab === 'planificacion' ? { subTab: subTabPlan } : {}),
      }))
    } catch { /* ignore */ }
  }, [tab, subTabPlan])

  // Dispatch welcome event on first OPS visit
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem('kc_ops_welcomed')) return
    localStorage.setItem('kc_ops_welcomed', '1')
    setTimeout(() => window.dispatchEvent(new CustomEvent('kc-welcome-ops')), 900)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab header */}
      <div style={{ background: 'var(--navy)', padding: '46px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6, paddingBottom: 10 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              data-coach-target={`ops-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                padding: '8px 4px', borderRadius: 99, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                background: tab === t.id ? '#fff' : 'rgba(255,255,255,.12)',
                color: tab === t.id ? 'var(--navy)' : 'rgba(255,255,255,.65)',
                transition: 'all .15s',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Sub-tabs dentro de Planificación */}
        {tab === 'planificacion' && (
          <div style={{ display: 'flex', gap: 5, paddingBottom: 8 }}>
            {([
              { id: 'menu' as SubTabPlan, label: 'Menú', icon: 'restaurant_menu' },
              { id: 'eventos' as SubTabPlan, label: 'Eventos', icon: 'celebration' },
            ]).map(st => (
              <button
                key={st.id}
                data-coach-target={`plan-sub-${st.id}`}
                onClick={() => setSubTabPlan(st.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '5px 12px', borderRadius: 99, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                  background: subTabPlan === st.id ? 'var(--accent)' : 'rgba(255,255,255,.1)',
                  color: subTabPlan === st.id ? '#fff' : 'rgba(255,255,255,.55)',
                  transition: 'all .15s',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{st.icon}</span>
                {st.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab panels */}
      <div style={{ flex: 1, overflow: 'hidden', display: tab === 'produccion' ? 'flex' : 'none', flexDirection: 'column' }}>
        <TareasPage embedded />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: tab === 'mise' ? 'flex' : 'none', flexDirection: 'column' }}>
        <ChecklistPage embedded />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: tab === 'planificacion' ? 'flex' : 'none', flexDirection: 'column' }}>
        {/* Sub-panel Menú */}
        <div style={{ flex: 1, overflow: subTabPlan === 'menu' ? 'auto' : 'hidden', display: subTabPlan === 'menu' ? 'block' : 'none' }}>
          <ProduccionPage embedded />
        </div>
        {/* Sub-panel Eventos */}
        <div style={{ flex: 1, overflow: subTabPlan === 'eventos' ? 'auto' : 'hidden', display: subTabPlan === 'eventos' ? 'block' : 'none' }}>
          <EventosView />
        </div>
      </div>
    </div>
  )
}
