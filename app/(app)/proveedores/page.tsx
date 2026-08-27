'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useProveedores } from '@/lib/hooks/useProveedores'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import type { Proveedor, Factura, ProveedorIncidencia, TipoIncidenciaProveedor } from '@/types'
import PageHeader from '@/components/shell/PageHeader'
import ActionButton from '@/components/shell/ActionButton'
import { Avatar } from '@/components/ui'
import ImportadorArchivo, { UndoBanner } from '@/components/importador/ImportadorArchivo'
import { exportarExcel, fechaArchivo } from '@/lib/exportar'

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const COLORES_AVATAR = ['#4361a0', '#0891b2', '#059669', '#d97706', '#dc2626', '#4361a0', '#be185d']
function avatarColor(nombre: string) {
  let h = 0
  for (let i = 0; i < nombre.length; i++) h = nombre.charCodeAt(i) + ((h << 5) - h)
  return COLORES_AVATAR[Math.abs(h) % COLORES_AVATAR.length]
}
function initials(nombre: string) {
  return nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

interface FormProv {
  nombre: string
  rubro: string
  telefono: string
  dias_entrega: string[]
  horario_entrega: string
}
const FORM_EMPTY: FormProv = { nombre: '', rubro: '', telefono: '', dias_entrega: [], horario_entrega: '' }

const TIPO_INCIDENCIA_LABEL: Record<TipoIncidenciaProveedor, [string, string]> = {
  faltante: ['faltante', 'faltantes'],
  calidad: ['problema de calidad', 'problemas de calidad'],
  fuera_de_horario: ['entrega fuera de horario', 'entregas fuera de horario'],
  precio: ['diferencia de precio', 'diferencias de precio'],
  devolucion: ['devolución', 'devoluciones'],
}
const TIPO_INCIDENCIA_OPTIONS: { value: TipoIncidenciaProveedor; label: string }[] = [
  { value: 'faltante', label: 'Faltante' },
  { value: 'calidad', label: 'Calidad' },
  { value: 'fuera_de_horario', label: 'Fuera de horario' },
  { value: 'precio', label: 'Diferencia de precio' },
  { value: 'devolucion', label: 'Devolución' },
]

function resumenIncidencias(items: ProveedorIncidencia[]): string {
  if (items.length === 0) return 'Sin incidencias en los últimos 90 días'
  const porTipo = new Map<TipoIncidenciaProveedor, number>()
  let totalImporte = 0
  for (const it of items) {
    porTipo.set(it.tipo, (porTipo.get(it.tipo) ?? 0) + 1)
    if (it.importe) totalImporte += it.importe
  }
  const partes = Array.from(porTipo.entries()).map(([tipo, n]) => {
    const [singular, plural] = TIPO_INCIDENCIA_LABEL[tipo] ?? [tipo, tipo]
    return `${n} ${n === 1 ? singular : plural}`
  })
  if (totalImporte > 0) partes.push(`$${totalImporte.toLocaleString('es-AR')} en diferencias`)
  return partes.join(' · ')
}

export default function ProveedoresPage({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter()
  const RESTAURANTE_ID = useRestauranteId()
  const { proveedores, loading, error, agregarProveedor, actualizarProveedor, eliminarProveedor, fetchFacturas, guardarFactura, fetchIncidencias, agregarIncidencia, refetch: refetchProveedores } = useProveedores()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [facturas, setFacturas] = useState<Record<string, Factura[]>>({})
  const [incidencias, setIncidencias] = useState<Record<string, ProveedorIncidencia[]>>({})

  // Modal cargar incidencia
  const [incModalProv, setIncModalProv] = useState<Proveedor | null>(null)
  const [incForm, setIncForm] = useState({ tipo: 'faltante' as TipoIncidenciaProveedor, producto_nombre: '', cantidad_esperada: '', cantidad_recibida: '', importe: '', nota: '' })
  const [incSaving, setIncSaving] = useState(false)
  const [incError, setIncError] = useState<string | null>(null)

  // Modal add/edit
  const [modalOpen, setModalOpen] = useState(false)
  const [editProv, setEditProv] = useState<Proveedor | null>(null)
  const [form, setForm] = useState<FormProv>(FORM_EMPTY)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Invoice scanner
  const [scanOpen, setScanOpen] = useState(false)
  const [scanProvId, setScanProvId] = useState<string | null>(null)
  const [scanProvNombre, setScanProvNombre] = useState('')
  const [scanFile, setScanFile] = useState<File | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{
    proveedor: string; fecha: string; numero_factura: string;
    items: { producto_nombre?: string; descripcion?: string; cantidad: number; unidad: string; precio_unitario: number; subtotal: number }[];
    total: number; moneda: string
  } | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showImportador, setShowImportador] = useState(false)

  const activos = useMemo(() => proveedores.filter(p => p.activo), [proveedores])

  useEffect(() => {
    const sinTelefono = activos.filter(p => !p.telefono).length
    const conDiasEntrega = activos.filter(p => p.dias_entrega && p.dias_entrega.length > 0).length
    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'proveedores',
      total: activos.length,
      sinTelefono,
      conDiasEntrega,
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [activos])

  // ── Expand / facturas / incidencias ──
  async function toggleExpand(id: string) {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (!facturas[id]) {
      try {
        const f = await fetchFacturas(id)
        setFacturas(prev => ({ ...prev, [id]: f }))
      } catch { /* ignore */ }
    }
    if (!incidencias[id]) {
      try {
        const inc = await fetchIncidencias(id)
        setIncidencias(prev => ({ ...prev, [id]: inc }))
      } catch { /* ignore */ }
    }
  }

  function openIncidencia(p: Proveedor) {
    setIncModalProv(p)
    setIncForm({ tipo: 'faltante', producto_nombre: '', cantidad_esperada: '', cantidad_recibida: '', importe: '', nota: '' })
    setIncError(null)
  }
  async function handleSaveIncidencia() {
    if (!incModalProv) return
    if (!incForm.producto_nombre.trim()) { setIncError('El producto es obligatorio'); return }
    setIncSaving(true)
    setIncError(null)
    try {
      await agregarIncidencia({
        proveedor_id: incModalProv.id,
        producto_nombre: incForm.producto_nombre.trim(),
        tipo: incForm.tipo,
        cantidad_esperada: incForm.cantidad_esperada ? parseFloat(incForm.cantidad_esperada) : null,
        cantidad_recibida: incForm.cantidad_recibida ? parseFloat(incForm.cantidad_recibida) : null,
        importe: incForm.importe ? parseFloat(incForm.importe) : null,
        nota: incForm.nota.trim() || null,
      })
      const inc = await fetchIncidencias(incModalProv.id)
      setIncidencias(prev => ({ ...prev, [incModalProv.id]: inc }))
      setIncModalProv(null)
    } catch (e: unknown) {
      setIncError(e instanceof Error ? e.message : 'Error al guardar')
    } finally { setIncSaving(false) }
  }

  // ── Modal ──
  function openAdd() {
    setEditProv(null)
    setForm(FORM_EMPTY)
    setFormError(null)
    setModalOpen(true)
  }
  function openEdit(p: Proveedor) {
    setEditProv(p)
    setForm({ nombre: p.nombre, rubro: p.rubro ?? '', telefono: p.telefono ?? '', dias_entrega: p.dias_entrega ?? [], horario_entrega: p.horario_entrega ?? '' })
    setFormError(null)
    setModalOpen(true)
  }
  function toggleDia(d: string) {
    setForm(f => ({
      ...f,
      dias_entrega: f.dias_entrega.includes(d)
        ? f.dias_entrega.filter(x => x !== d)
        : [...f.dias_entrega, d],
    }))
  }
  async function handleSave() {
    if (!form.nombre.trim()) { setFormError('El nombre es obligatorio'); return }
    setSaving(true)
    setFormError(null)
    try {
      if (editProv) {
        await actualizarProveedor(editProv.id, form)
      } else {
        await agregarProveedor({ ...form, created_at: new Date().toISOString() })
      }
      setModalOpen(false)
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Error al guardar')
    } finally { setSaving(false) }
  }
  async function handleDelete() {
    if (!deleteId) return
    await eliminarProveedor(deleteId)
    setDeleteId(null)
    setModalOpen(false)
  }

  // ── Scanner ──
  function openScan(provId: string | null, provNombre: string) {
    setScanProvId(provId)
    setScanProvNombre(provNombre)
    setScanFile(null)
    setScanResult(null)
    setScanError(null)
    setScanning(false)
    setScanOpen(true)
  }
  async function handleScan() {
    if (!scanFile) return
    setScanning(true)
    setScanError(null)
    try {
      const fd = new FormData()
      fd.append('imagen', scanFile)
      const res = await fetch('/api/facturas', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (data.raw) throw new Error('No se pudo parsear la factura')
      setScanResult(data)
    } catch (e: unknown) {
      setScanError(e instanceof Error ? e.message : 'Error al escanear')
    } finally { setScanning(false) }
  }
  async function handleSaveScan() {
    if (!scanResult) return
    setSaving(true)
    try {
      await guardarFactura({
        proveedor_id: scanProvId,
        proveedor_nombre: scanResult.proveedor || scanProvNombre,
        fecha: scanResult.fecha || null,
        numero_factura: scanResult.numero_factura || '',
        items: scanResult.items || [],
        total: scanResult.total || 0,
        moneda: scanResult.moneda || 'ARS',
      })
      setScanOpen(false)
    } catch (e: unknown) {
      setScanError(e instanceof Error ? e.message : 'Error al guardar')
    } finally { setSaving(false) }
  }

  async function exportXLSX() {
    await exportarExcel(`proveedores_${fechaArchivo()}.xlsx`, [{
      nombre: 'Proveedores',
      filas: proveedores.map(p => ({
        'Nombre': p.nombre,
        'Rubro': p.rubro ?? '',
        'Teléfono': p.telefono ?? '',
        'Días de entrega': (p.dias_entrega ?? []).join(', '),
        'Activo': p.activo ? 'Sí' : 'No',
      })),
    }])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {!embedded && <PageHeader
        title="Proveedores"
        icon="storefront"
        subtitle={loading ? '…' : `${activos.length} activo${activos.length !== 1 ? 's' : ''}`}
        onBack={() => router.back()}
        actions={
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={exportXLSX}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 8, background: 'rgba(255,255,255,.15)', color: '#fff', border: '1px solid rgba(255,255,255,.25)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>table_view</span>
              Exportar
            </button>
            <button
              onClick={() => setShowImportador(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 8, background: 'rgba(255,255,255,.15)', color: '#fff', border: '1px solid rgba(255,255,255,.25)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload_file</span>
              Importar
            </button>
            <ActionButton icon="add" label="Agregar proveedor" onClick={openAdd} />
          </div>
        }
        below={
          <button
            onClick={() => openScan(null, '')}
            style={{
              width: '100%', background: 'linear-gradient(135deg, #1e293b, #312e81)',
              border: '1px solid rgba(255,255,255,.15)', borderRadius: 12, padding: '12px 14px',
              display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#a78bfa' }}>document_scanner</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>Escanear factura con IA</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)' }}>Foto → datos automáticos</div>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'rgba(255,255,255,.4)' }}>chevron_right</span>
          </button>
        }
      />}

      {/* ── Add button when embedded ── */}
      {embedded && (
        <div style={{ padding: '8px 14px 0', flexShrink: 0, display: 'flex', gap: 8 }}>
          <button onClick={() => setShowImportador(true)} style={{ flex: 1, padding: '11px 14px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', fontFamily: 'inherit' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>upload_file</span>
            Importar
          </button>
          <button onClick={openAdd} style={{ flex: 1, padding: '11px 14px', borderRadius: 12, background: 'var(--navy)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', fontFamily: 'inherit' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            Agregar
          </button>
        </div>
      )}

      <UndoBanner tipo="proveedores" onUndo={() => refetchProveedores()} />

      {/* ── Body ── */}
      <div data-coach-target="proveedores-lista" style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '12px 14px 80px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--text-3)', display: 'block', marginBottom: 8 }}>hourglass_empty</span>
            <p style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>Cargando proveedores…</p>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <p style={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>{error}</p>
          </div>
        ) : activos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📦</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Sin proveedores aún</div>
            <p style={{ fontSize: 11, marginTop: 6, color: '#64748b' }}>Tocá + para agregar uno</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activos.map(p => {
              const isOpen = expandedId === p.id
              return (
                <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                  {/* Card principal */}
                  <button
                    onClick={() => toggleExpand(p.id)}
                    style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '14px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}
                  >
                    <Avatar name={p.nombre} size={40} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{p.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                        {p.rubro}{(p.dias_entrega ?? []).length > 0 && ` · ${(p.dias_entrega ?? []).join(', ')}`}
                      </div>
                    </div>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)', transition: 'transform .2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>
                      expand_more
                    </span>
                  </button>

                  {/* Detalle expandido */}
                  {isOpen && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px' }}>
                      {p.telefono && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>phone</span>
                          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{p.telefono}</span>
                        </div>
                      )}

                      {/* Facturas recientes */}
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)', marginBottom: 6 }}>Facturas recientes</div>
                      {(facturas[p.id] ?? []).length === 0 ? (
                        <p style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic', marginBottom: 10 }}>Sin facturas cargadas</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                          {(facturas[p.id] ?? []).slice(0, 3).map(f => (
                            <div key={f.id} style={{ fontSize: 11, color: 'var(--text-2)', display: 'flex', justifyContent: 'space-between' }}>
                              <span>{f.numero_factura || 'S/N'} · {f.fecha_factura || '—'}</span>
                              <span style={{ fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>${f.total.toLocaleString('es-AR')}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Incidencias (90 días) */}
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)', marginBottom: 6 }}>Incidencias (90 días)</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <p style={{ fontSize: 11, color: 'var(--text-2)', flex: 1, margin: 0 }}>
                          {resumenIncidencias(incidencias[p.id] ?? [])}
                        </p>
                        <button
                          onClick={() => openIncidencia(p)}
                          style={{ flexShrink: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px', fontSize: 10, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          + Incidencia
                        </button>
                      </div>

                      {/* Acciones */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        {p.telefono && (
                          <a
                            href={`https://wa.me/${p.telefono.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ flex: 1, background: '#25d366', border: 'none', borderRadius: 8, padding: '8px', fontSize: 11, fontWeight: 700, color: '#fff', textAlign: 'center', textDecoration: 'none', cursor: 'pointer' }}
                          >
                            WhatsApp
                          </a>
                        )}
                        <button
                          onClick={() => openScan(p.id, p.nombre)}
                          style={{ flex: 1, background: 'var(--navy)', border: 'none', borderRadius: 8, padding: '8px', fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          Subir factura
                        </button>
                        <button
                          onClick={() => openEdit(p)}
                          style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-2)' }}>edit</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Modal add/edit proveedor ── */}
      {modalOpen && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} onClick={() => setModalOpen(false)} />
          <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: '16px 16px 0 0', padding: '20px 16px 32px', maxHeight: '85%', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
                {editProv ? 'Editar proveedor' : 'Nuevo proveedor'}
              </h2>
              {editProv && (
                <button onClick={() => setDeleteId(editProv.id)} style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#ef4444', fontFamily: 'inherit' }}>
                  Eliminar
                </button>
              )}
            </div>

            {formError && (
              <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#ef4444' }}>{formError}</div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={labelStyle}>Nombre *</span>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Waggon, Carnelandia…" style={inputStyle} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={labelStyle}>Rubro</span>
                  <input value={form.rubro} onChange={e => setForm(f => ({ ...f, rubro: e.target.value }))} placeholder="Ej: Carnes, Verduras…" style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={labelStyle}>Teléfono</span>
                  <input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="+54 351…" style={inputStyle} />
                </label>
              </div>
              <div>
                <span style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>Días de entrega</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {DIAS.map(d => (
                    <button
                      key={d}
                      onClick={() => toggleDia(d)}
                      style={{
                        padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                        background: form.dias_entrega.includes(d) ? 'var(--navy)' : 'var(--bg)',
                        color: form.dias_entrega.includes(d) ? '#fff' : 'var(--text-2)',
                        border: `1px solid ${form.dias_entrega.includes(d) ? 'var(--navy)' : 'var(--border)'}`,
                      }}
                    >{d}</button>
                  ))}
                </div>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={labelStyle}>Horario de entrega</span>
                <input value={form.horario_entrega} onChange={e => setForm(f => ({ ...f, horario_entrega: e.target.value }))} placeholder="Ej: 8 a 11 hs" style={inputStyle} />
              </label>
            </div>

            <div style={{ position: 'sticky', bottom: 0, background: 'var(--surface)', paddingTop: 12, marginTop: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{ width: '100%', background: 'var(--navy)', border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', opacity: saving ? .6 : 1, fontFamily: 'inherit' }}>
                {saving ? 'Guardando…' : editProv ? 'Guardar cambios' : 'Agregar proveedor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteId && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }} onClick={() => setDeleteId(null)} />
          <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 16, padding: 24, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,.4)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>Eliminar proveedor</h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 20px' }}>Se desactiva el proveedor. ¿Confirmás?</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteId(null)} style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 11, fontSize: 13, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={handleDelete} style={{ flex: 1, background: '#ef4444', border: 'none', borderRadius: 10, padding: 11, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal cargar incidencia ── */}
      {incModalProv && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} onClick={() => setIncModalProv(null)} />
          <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: '16px 16px 0 0', padding: '20px 16px 32px', maxHeight: '85%', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 4px' }}>Nueva incidencia</h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 16px' }}>{incModalProv.nombre}</p>

            {incError && (
              <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#ef4444' }}>{incError}</div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <span style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>Tipo</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {TIPO_INCIDENCIA_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setIncForm(f => ({ ...f, tipo: opt.value }))}
                      style={{
                        padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                        background: incForm.tipo === opt.value ? 'var(--navy)' : 'var(--bg)',
                        color: incForm.tipo === opt.value ? '#fff' : 'var(--text-2)',
                        border: `1px solid ${incForm.tipo === opt.value ? 'var(--navy)' : 'var(--border)'}`,
                      }}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={labelStyle}>Producto *</span>
                <input value={incForm.producto_nombre} onChange={e => setIncForm(f => ({ ...f, producto_nombre: e.target.value }))} placeholder="Ej: Bife de chorizo" style={inputStyle} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={labelStyle}>Cant. esperada</span>
                  <input type="number" value={incForm.cantidad_esperada} onChange={e => setIncForm(f => ({ ...f, cantidad_esperada: e.target.value }))} style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={labelStyle}>Cant. recibida</span>
                  <input type="number" value={incForm.cantidad_recibida} onChange={e => setIncForm(f => ({ ...f, cantidad_recibida: e.target.value }))} style={inputStyle} />
                </label>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={labelStyle}>Importe (opcional)</span>
                <input type="number" value={incForm.importe} onChange={e => setIncForm(f => ({ ...f, importe: e.target.value }))} placeholder="$" style={inputStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={labelStyle}>Nota</span>
                <input value={incForm.nota} onChange={e => setIncForm(f => ({ ...f, nota: e.target.value }))} placeholder="Opcional" style={inputStyle} />
              </label>
            </div>

            <div style={{ position: 'sticky', bottom: 0, background: 'var(--surface)', paddingTop: 12, marginTop: 8 }}>
              <button onClick={handleSaveIncidencia} disabled={incSaving} style={{ width: '100%', background: 'var(--navy)', border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', opacity: incSaving ? .6 : 1, fontFamily: 'inherit' }}>
                {incSaving ? 'Guardando…' : 'Guardar incidencia'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Invoice scanner modal ── */}
      {scanOpen && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} onClick={() => setScanOpen(false)} />
          <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: '16px 16px 0 0', padding: '20px 16px 32px', maxHeight: '90%', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 4px' }}>Escanear factura</h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 16px' }}>
              {scanProvNombre ? `Proveedor: ${scanProvNombre}` : 'Subí una foto y la IA extrae los datos'}
            </p>

            {!scanResult ? (
              <>
                {/* Drop zone */}
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: '2px dashed var(--border)', borderRadius: 14, padding: '32px 16px',
                    textAlign: 'center', cursor: 'pointer', background: 'var(--bg)', marginBottom: 12,
                  }}
                >
                  <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => setScanFile(e.target.files?.[0] ?? null)} />
                  <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--text-3)', display: 'block', marginBottom: 8 }}>photo_camera</span>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                    {scanFile ? scanFile.name : 'Tocá para subir foto'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>JPG, PNG o WebP</div>
                </div>

                {scanError && (
                  <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#ef4444' }}>{scanError}</div>
                )}

                <button
                  onClick={handleScan}
                  disabled={!scanFile || scanning}
                  style={{
                    width: '100%', background: scanning ? '#64748b' : 'linear-gradient(135deg, #4361a0, #4361a0)',
                    border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700,
                    color: '#fff', cursor: scanFile ? 'pointer' : 'default', opacity: scanFile ? 1 : .5, fontFamily: 'inherit',
                  }}
                >
                  {scanning ? 'Analizando con IA…' : 'Escanear factura ✨'}
                </button>
              </>
            ) : (
              <>
                {/* Resultado */}
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{scanResult.proveedor}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{scanResult.fecha}</span>
                  </div>
                  {scanResult.numero_factura && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>Nº {scanResult.numero_factura}</div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {scanResult.items.map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-2)' }}>
                        <span>{item.cantidad} {item.unidad} {item.producto_nombre || item.descripcion}</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>${item.subtotal.toLocaleString('es-AR')}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Total</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', fontFamily: "'DM Mono', monospace" }}>${scanResult.total.toLocaleString('es-AR')}</span>
                  </div>
                </div>

                {scanError && (
                  <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#ef4444' }}>{scanError}</div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setScanResult(null)} style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 11, fontSize: 13, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>Re-escanear</button>
                  <button onClick={handleSaveScan} disabled={saving} style={{ flex: 1, background: 'var(--navy)', border: 'none', borderRadius: 10, padding: 11, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? .6 : 1 }}>
                    {saving ? 'Guardando…' : 'Guardar factura'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Importador Excel ── */}
      {showImportador && (
        <ImportadorArchivo
          tipo="proveedores"
          restauranteId={RESTAURANTE_ID}
          onImportCompleto={() => setShowImportador(false)}
          onClose={() => setShowImportador(false)}
        />
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.06em' }
const inputStyle: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', width: '100%', boxSizing: 'border-box' }
