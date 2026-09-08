'use client'

import PageTransition from '@/components/PageTransition'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { useHaccp, type HaccpEquipo, type HaccpTemperatura, type HaccpVencimiento, type HaccpLimpieza, type HaccpLimpiezaRegistro } from '@/lib/hooks/useHaccp'
import { limpiezaTocaFecha } from '@/lib/haccp/recurrencia'
import { useMerma } from '@/lib/hooks/useMerma'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { useAuth } from '@/lib/auth/context'
import { createClient } from '@/lib/supabase/client'
import { fetchEscPosBytes, printViaUSB, printViaBluetooth, downloadEscPosBytes, supportsWebUSB, supportsWebBluetooth } from '@/lib/print/escpos'
import { useImpresionConfig } from '@/lib/hooks/useImpresionConfig'
import { fechaEnTz, TZ_DEFAULT, hoyOperativo, sumarDias } from '@/lib/ops/turnos'
import { Modal } from '@/components/ui'

// ── Helpers ─────────────────────────────────────────────
const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const date = new Date(d + 'T12:00:00')
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}
const fmtShortDate = (d: string | null) => {
  if (!d) return '—'
  const date = new Date(d + 'T12:00:00')
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}
const fmtTime = (d: string) => {
  const date = new Date(d)
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}
const today = () => fechaEnTz(new Date(), TZ_DEFAULT)

const EQUIPO_ICONS: Record<string, string> = {
  camara: 'kitchen', freezer: 'ac_unit', heladera: 'thermostat',
  horno: 'local_fire_department', 'baño_maria': 'water_drop',
}

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00')
  const now = new Date()
  now.setHours(12, 0, 0, 0)
  return Math.floor((d.getTime() - now.getTime()) / 86400000)
}

function vencColor(days: number, status: string): { bg: string; text: string } {
  if (status === 'descartado') return { bg: '#f1f5f9', text: '#64748b' }
  if (status === 'vencido' || days < 0) return { bg: '#fee2e2', text: '#991b1b' }
  if (days <= 1) return { bg: '#fff7ed', text: '#9a3412' }
  if (days <= 3) return { bg: '#fefce8', text: '#854d0e' }
  return { bg: '#f0fdf4', text: '#166534' }
}

function timeAgo(d: string | null): string {
  if (!d) return 'Nunca realizada'
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return 'Hace ' + mins + ' min'
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return 'Hace ' + hrs + 'h'
  const days = Math.floor(hrs / 24)
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  return 'Hace ' + days + ' días'
}

const FREQ_LABELS: Record<string, string> = {
  cada_turno: 'Cada turno', diaria: 'Diaria', semanal: 'Semanal', mensual: 'Mensual',
}

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 12,
  border: '1.5px solid var(--border)', background: 'var(--surface)',
  fontSize: 14, color: 'var(--text-1)', outline: 'none',
}
const labelStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, display: 'block',
}

// ── Toast ───────────────────────────────────────────────
function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t) }, [onDone])
  return (
    <div style={{
      position: 'fixed', bottom: 'var(--toast-bottom)', left: '50%', transform: 'translateX(-50%)',
      background: '#1e293b', color: '#fff', padding: '10px 20px',
      borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 100,
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    }}>{msg}</div>
  )
}

// ── PDF Export ──────────────────────────────────────────
async function exportHaccpPDF(
  equipos: HaccpEquipo[],
  temperaturas: HaccpTemperatura[],
  vencimientos: HaccpVencimiento[],
  limpieza: HaccpLimpieza[],
) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF()
  doc.setFillColor(30, 41, 59)
  doc.rect(0, 0, 210, 32, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.text('Registro HACCP — El Rescoldo', 14, 15)
  doc.setFontSize(10)
  doc.text(`Fecha: ${fmtDate(today())}`, 14, 25)

  doc.setTextColor(0, 0, 0)
  let y = 38

  // Temperaturas
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('1. Control de Temperaturas', 14, y)
  y += 4

  const equipoMap: Record<string, HaccpEquipo> = {}
  for (const e of equipos) equipoMap[e.id] = e

  // Get latest temp per equipo
  const latestTemps: Record<string, HaccpTemperatura> = {}
  for (const t of temperaturas) {
    if (!latestTemps[t.equipo_id] || new Date(t.created_at) > new Date(latestTemps[t.equipo_id].created_at)) {
      latestTemps[t.equipo_id] = t
    }
  }

  autoTable(doc, {
    startY: y,
    head: [['Equipo', 'Temp °C', 'Rango', 'Estado', 'Hora']],
    body: equipos.map(e => {
      const t = latestTemps[e.id]
      return [
        e.nombre,
        t ? `${t.temperatura}°C` : 'Sin registro',
        `${e.temp_min} a ${e.temp_max}°C`,
        t ? (t.dentro_rango ? 'OK' : 'FUERA DE RANGO') : '—',
        t ? fmtTime(t.created_at) : '—',
      ]
    }),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 41, 59] },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY as number) ?? y + 40
  y += 10

  // Vencimientos
  if (y > 240) { doc.addPage(); y = 20 }
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('2. Control de Vencimientos', 14, y)
  y += 4

  autoTable(doc, {
    startY: y,
    head: [['Producto', 'Vencimiento', 'Lote', 'Ubicación', 'Estado']],
    body: vencimientos.map(v => [
      v.producto_nombre,
      fmtShortDate(v.fecha_vencimiento),
      v.lote || '—',
      v.ubicacion || '—',
      v.status.charAt(0).toUpperCase() + v.status.slice(1),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 41, 59] },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY as number) ?? y + 40
  y += 10

  // Limpieza
  if (y > 240) { doc.addPage(); y = 20 }
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('3. Control de Limpieza', 14, y)
  y += 4

  autoTable(doc, {
    startY: y,
    head: [['Área', 'Tarea', 'Frecuencia', 'Último registro']],
    body: limpieza.map(l => [
      l.area,
      l.tarea_limpieza,
      FREQ_LABELS[l.frecuencia] || l.frecuencia,
      l.ultimo_registro ? fmtDate(l.ultimo_registro.slice(0, 10)) + ' ' + fmtTime(l.ultimo_registro) : 'Sin registro',
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 41, 59] },
  })

  doc.setFontSize(7)
  doc.setTextColor(150)
  doc.text('Generado por KitchenOS — Apto para inspección de Bromatología', 14, 285)
  doc.save(`haccp-${today()}.pdf`)
}

// ── Registrar Temperaturas View ─────────────────────────
function RegistrarTempsView({
  equipos,
  onSave,
  onBack,
}: {
  equipos: HaccpEquipo[]
  onSave: (registros: { equipo_id: string; temperatura: number; observacion?: string; accion_correctiva?: string }[]) => Promise<void>
  onBack: () => void
}) {
  const [temps, setTemps] = useState<Record<string, string>>({})
  const [acciones, setAcciones] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const isOutOfRange = (equipoId: string, val: string) => {
    const e = equipos.find(eq => eq.id === equipoId)
    if (!e || !val) return false
    const n = parseFloat(val)
    return n < e.temp_min || n > e.temp_max
  }

  const filledCount = Object.values(temps).filter(v => v !== '').length

  const handleSave = async () => {
    const registros = equipos
      .filter(e => temps[e.id] && temps[e.id] !== '')
      .map(e => ({
        equipo_id: e.id,
        temperatura: parseFloat(temps[e.id]),
        accion_correctiva: acciones[e.id] || undefined,
      }))
    if (registros.length === 0) return
    const invalid = registros.find(r => r.temperatura < -40 || r.temperatura > 100)
    if (invalid) { alert(`Temperatura fuera del rango válido (-40 a 100°C)`); return }
    setSaving(true)
    try { await onSave(registros) } finally { setSaving(false) }
  }

  return (
    <div style={{ paddingBottom: 90 }}>
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>Registrar temperaturas</span>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ padding: '10px 14px', background: '#dbeafe', borderRadius: 10, fontSize: 13, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>info</span>
          Ingresá la temperatura actual de cada equipo
        </div>

        {equipos.filter(e => e.activo).map(e => {
          const outOfRange = isOutOfRange(e.id, temps[e.id] || '')
          return (
            <div key={e.id} style={{
              background: 'var(--surface)', border: `1.5px solid ${outOfRange ? '#ef4444' : 'var(--border)'}`,
              borderRadius: 12, padding: 14, transition: 'border-color 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: outOfRange ? '#ef4444' : 'var(--navy-ink)' }}>
                  {EQUIPO_ICONS[e.tipo] || 'thermostat'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>{e.nombre}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Rango: {e.temp_min}°C a {e.temp_max}°C</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    inputMode="decimal"
                    pattern="-?[0-9]*\.?[0-9]*"
                    placeholder="—"
                    value={temps[e.id] || ''}
                    onChange={ev => {
                      const v = ev.target.value
                      if (/^-?\d*\.?\d*$/.test(v)) setTemps(prev => ({ ...prev, [e.id]: v }))
                    }}
                    style={{
                      width: 70, padding: '8px 10px', borderRadius: 8, textAlign: 'center',
                      border: `1.5px solid ${outOfRange ? '#ef4444' : 'var(--border)'}`,
                      fontSize: 16, fontWeight: 700, color: outOfRange ? '#ef4444' : 'var(--text-1)',
                      background: outOfRange ? '#fee2e2' : 'var(--bg)',
                    }}
                  />
                  <span style={{ fontSize: 14, color: 'var(--text-3)', fontWeight: 600 }}>°C</span>
                </div>
              </div>
              {outOfRange && (
                <div style={{ marginTop: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', display: 'block', marginBottom: 4 }}>
                    ⚠️ Fuera de rango — Acción correctiva (obligatoria)
                  </label>
                  <textarea
                    value={acciones[e.id] || ''}
                    onChange={ev => setAcciones(prev => ({ ...prev, [e.id]: ev.target.value }))}
                    placeholder="Describir acción correctiva..."
                    rows={2}
                    style={{ ...fieldStyle, fontSize: 13, border: '1.5px solid #ef4444', background: '#fef2f2' }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ padding: '4px 16px 16px' }}>
        <button
          disabled={filledCount === 0 || saving}
          onClick={handleSave}
          style={{
            width: '100%', padding: '14px', borderRadius: 12,
            background: filledCount > 0 ? 'var(--navy)' : '#ccc',
            color: '#fff', border: 'none', fontWeight: 700, fontSize: 15,
            cursor: filledCount > 0 ? 'pointer' : 'default',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Guardando...' : `Guardar todo (${filledCount}/${equipos.filter(e => e.activo).length})`}
        </button>
      </div>
    </div>
  )
}

// ── Historial Equipo View ───────────────────────────────
function HistorialView({
  equipo,
  temperaturas,
  onBack,
}: {
  equipo: HaccpEquipo
  temperaturas: HaccpTemperatura[]
  onBack: () => void
}) {
  const history = useMemo(() =>
    temperaturas
      .filter(t => t.equipo_id === equipo.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 50)
  , [temperaturas, equipo.id])

  return (
    <div>
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>{equipo.nombre}</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
            Rango: {equipo.temp_min}°C a {equipo.temp_max}°C · {equipo.ubicacion}
          </div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
            Sin registros de temperatura
          </div>
        ) : history.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', background: 'var(--surface)',
            border: `1px solid ${t.dentro_rango ? 'var(--border)' : '#fecaca'}`,
            borderRadius: 10,
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: 5,
              background: t.dentro_rango ? '#22c55e' : '#ef4444',
              flexShrink: 0,
            }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: t.dentro_rango ? 'var(--text-1)' : '#ef4444' }}>
                {t.temperatura}°C
              </span>
              {t.accion_correctiva && (
                <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>
                  ⚠️ {t.accion_correctiva}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{fmtShortDate(t.created_at.slice(0, 10))}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtTime(t.created_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Config Equipos View ─────────────────────────────────
function ConfigEquiposView({
  equipos,
  onCrear,
  onEliminar,
  onBack,
}: {
  equipos: HaccpEquipo[]
  onCrear: (d: { nombre: string; tipo: string; temp_min: number; temp_max: number; ubicacion: string }) => Promise<void>
  onEliminar: (id: string) => Promise<void>
  onBack: () => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('camara')
  const [tempMin, setTempMin] = useState('')
  const [tempMax, setTempMax] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!nombre.trim()) return
    setSaving(true)
    try {
      await onCrear({ nombre: nombre.trim(), tipo, temp_min: parseFloat(tempMin) || 0, temp_max: parseFloat(tempMax) || 5, ubicacion: ubicacion.trim() })
      setNombre(''); setTempMin(''); setTempMax(''); setUbicacion(''); setShowForm(false)
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>Configurar equipos</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowForm(!showForm)} style={{
          background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
          padding: '6px 12px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          {showForm ? 'Cancelar' : '+ Agregar'}
        </button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {showForm && (
          <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del equipo" style={fieldStyle} />
            <select value={tipo} onChange={e => setTipo(e.target.value)} style={fieldStyle}>
              <option value="camara">Cámara</option>
              <option value="freezer">Freezer</option>
              <option value="heladera">Heladera</option>
              <option value="horno">Horno</option>
              <option value="baño_maria">Baño María</option>
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ ...labelStyle, fontSize: 11 }}>Temp mín °C</label>
                <input inputMode="decimal" pattern="-?[0-9]*\.?[0-9]*" value={tempMin} onChange={e => { if (/^-?\d*\.?\d*$/.test(e.target.value)) setTempMin(e.target.value) }} placeholder="0" style={fieldStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ ...labelStyle, fontSize: 11 }}>Temp máx °C</label>
                <input inputMode="decimal" pattern="-?[0-9]*\.?[0-9]*" value={tempMax} onChange={e => { if (/^-?\d*\.?\d*$/.test(e.target.value)) setTempMax(e.target.value) }} placeholder="5" style={fieldStyle} />
              </div>
            </div>
            <input value={ubicacion} onChange={e => setUbicacion(e.target.value)} placeholder="Ubicación" style={fieldStyle} />
            <button disabled={!nombre.trim() || saving} onClick={handleSave} style={{
              padding: '12px', borderRadius: 10, background: nombre.trim() ? 'var(--navy)' : '#ccc',
              color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}>
              {saving ? 'Guardando...' : 'Agregar equipo'}
            </button>
          </div>
        )}

        {equipos.filter(e => e.activo).map(e => (
          <div key={e.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 14px', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 12,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--navy-ink)' }}>
              {EQUIPO_ICONS[e.tipo] || 'thermostat'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>{e.nombre}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{e.temp_min}°C a {e.temp_max}°C · {e.ubicacion}</div>
            </div>
            <button onClick={() => { if (confirm('Eliminar equipo?')) onEliminar(e.id) }} style={{
              background: 'none', border: 'none', cursor: 'pointer',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>delete</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Nuevo Vencimiento View ──────────────────────────────
function fmtFechaISOaCorta(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const btnEtiqueta: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 12px', borderRadius: 10,
  fontSize: 13, fontWeight: 700, fontFamily: 'inherit', border: '1px solid rgba(67,97,160,.3)',
  background: 'rgba(67,97,160,.08)', color: '#4361a0', cursor: 'pointer', flex: 1,
}
const btnEtiquetaSecundario: React.CSSProperties = {
  ...btnEtiqueta, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)',
}

function NuevoVencView({
  onSave,
  onBack,
  restauranteNombre,
}: {
  onSave: (d: { producto_nombre: string; fecha_vencimiento: string; fecha_apertura?: string; lote?: string; ubicacion?: string }) => Promise<void>
  onBack: () => void
  restauranteNombre: string
}) {
  const { perfil } = useAuth()
  const { impresion } = useImpresionConfig()
  const [nombre, setNombre] = useState('')
  const [fechaVenc, setFechaVenc] = useState('')
  const [fechaAp, setFechaAp] = useState('')
  const [lote, setLote] = useState('')
  const [ubic, setUbic] = useState('')
  const [saving, setSaving] = useState(false)
  const [printingEtiqueta, setPrintingEtiqueta] = useState(false)
  const [etiquetaError, setEtiquetaError] = useState<string | null>(null)

  const puedeImprimir = !!nombre.trim() && !!fechaVenc
  const responsable = perfil ? `${perfil.nombre} ${perfil.apellido}`.trim() : null

  const handleSave = async () => {
    if (!nombre.trim() || !fechaVenc) return
    setSaving(true)
    try {
      await onSave({
        producto_nombre: nombre.trim(), fecha_vencimiento: fechaVenc,
        fecha_apertura: fechaAp || undefined, lote: lote || undefined, ubicacion: ubic || undefined,
      })
    } finally { setSaving(false) }
  }

  async function buildEtiquetaBytes() {
    return fetchEscPosBytes({
      mode: 'etiqueta',
      data: {
        restaurante: restauranteNombre || 'KitchenOS',
        nombreProduccion: nombre.trim(),
        fechaElaboracion: fmtFechaISOaCorta(fechaAp || new Date().toISOString().slice(0, 10)),
        fechaCaducidad: fmtFechaISOaCorta(fechaVenc),
        responsable,
      },
    })
  }

  async function handlePrintEtiqueta(method: 'usb' | 'bluetooth') {
    if (!puedeImprimir) return
    setPrintingEtiqueta(true)
    setEtiquetaError(null)
    try {
      const bytes = await buildEtiquetaBytes()
      if (method === 'usb') await printViaUSB(bytes)
      else await printViaBluetooth(bytes)
    } catch (e: unknown) {
      setEtiquetaError(e instanceof Error ? e.message : 'Error al imprimir')
    } finally {
      setPrintingEtiqueta(false)
    }
  }

  async function handleDownloadEtiqueta() {
    if (!puedeImprimir) return
    setPrintingEtiqueta(true)
    setEtiquetaError(null)
    try {
      const bytes = await buildEtiquetaBytes()
      downloadEscPosBytes(bytes, `etiqueta-${nombre.trim().toLowerCase().replace(/\s+/g, '-')}.bin`)
    } catch (e: unknown) {
      setEtiquetaError(e instanceof Error ? e.message : 'Error al descargar')
    } finally {
      setPrintingEtiqueta(false)
    }
  }

  return (
    <div style={{ paddingBottom: 90 }}>
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>Agregar vencimiento</span>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div><label style={labelStyle}>Producto</label><input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del producto" style={fieldStyle} /></div>
        <div><label style={labelStyle}>Fecha de vencimiento</label><input type="date" value={fechaVenc} onChange={e => setFechaVenc(e.target.value)} style={fieldStyle} /></div>
        <div><label style={labelStyle}>Fecha de apertura (opcional)</label><input type="date" value={fechaAp} onChange={e => setFechaAp(e.target.value)} style={fieldStyle} /></div>
        <div><label style={labelStyle}>Lote (opcional)</label><input value={lote} onChange={e => setLote(e.target.value)} placeholder="Ej: L-2026-0341" style={fieldStyle} /></div>
        <div><label style={labelStyle}>Ubicación (opcional)</label><input value={ubic} onChange={e => setUbic(e.target.value)} placeholder="Ej: Cámara 1" style={fieldStyle} /></div>

        {/* Imprimir etiqueta — no requiere guardar primero */}
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>Etiqueta de producción</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            {impresion.usb && supportsWebUSB() && (
              <button disabled={!puedeImprimir || printingEtiqueta} onClick={() => handlePrintEtiqueta('usb')} style={{ ...btnEtiqueta, opacity: puedeImprimir ? 1 : 0.5 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>print</span>
                {printingEtiqueta ? 'Imprimiendo...' : 'Imprimir'}
              </button>
            )}
            {impresion.bluetooth && supportsWebBluetooth() && (
              <button disabled={!puedeImprimir || printingEtiqueta} onClick={() => handlePrintEtiqueta('bluetooth')} style={{ ...btnEtiquetaSecundario, opacity: puedeImprimir ? 1 : 0.5 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>bluetooth</span>
                Bluetooth
              </button>
            )}
            {impresion.bin && (
              <button disabled={!puedeImprimir || printingEtiqueta} onClick={handleDownloadEtiqueta} style={{ ...btnEtiquetaSecundario, opacity: puedeImprimir ? 1 : 0.5 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
                Descargar .bin
              </button>
            )}
          </div>
          {!puedeImprimir && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Completá producto y fecha de vencimiento para imprimir</span>}
          {etiquetaError && <span style={{ fontSize: 11, color: '#ef4444' }}>{etiquetaError}</span>}
        </div>
      </div>
      <div style={{ padding: '4px 16px 16px' }}>
        <button disabled={!nombre.trim() || !fechaVenc || saving} onClick={handleSave} style={{
          width: '100%', padding: '14px', borderRadius: 12,
          background: (nombre.trim() && fechaVenc) ? 'var(--navy)' : '#ccc',
          color: '#fff', border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer',
        }}>
          {saving ? 'Guardando...' : 'Agregar'}
        </button>
      </div>
    </div>
  )
}

// ── Modal Tarea Limpieza (crear/editar) ─────────────────
const DIAS_SEMANA_LIMP = [
  { v: 1, l: 'Lun' }, { v: 2, l: 'Mar' }, { v: 3, l: 'Mié' }, { v: 4, l: 'Jue' },
  { v: 5, l: 'Vie' }, { v: 6, l: 'Sáb' }, { v: 0, l: 'Dom' },
]

function TareaLimpiezaModal({
  open, initial, areasExistentes, onSave, onClose,
}: {
  open: boolean
  initial: HaccpLimpieza | null
  areasExistentes: string[]
  onSave: (d: { area: string; tarea_limpieza: string; frecuencia: string; dias_semana: number[] | null; dia_mes: number | null; sync_ops: boolean }) => Promise<void>
  onClose: () => void
}) {
  const [area, setArea] = useState('')
  const [tarea, setTarea] = useState('')
  const [freq, setFreq] = useState('diaria')
  const [diasSemana, setDiasSemana] = useState<number[]>([1])
  const [diaMes, setDiaMes] = useState(1)
  const [syncOps, setSyncOps] = useState(true)
  const [saving, setSaving] = useState(false)

  // Precarga al abrir — en modo edición desde `initial`, en modo creación
  // en blanco. Sin esto, editar una tarea y después crear otra arrastraría
  // los valores de la anterior (el formulario no se desmonta, Modal solo
  // lo oculta/muestra).
  useEffect(() => {
    if (!open) return
    setArea(initial?.area ?? '')
    setTarea(initial?.tarea_limpieza ?? '')
    setFreq(initial?.frecuencia ?? 'diaria')
    setDiasSemana(initial?.dias_semana?.length ? initial.dias_semana : initial?.dia_semana != null ? [initial.dia_semana] : [1])
    setDiaMes(initial?.dia_mes ?? 1)
    setSyncOps(initial?.sync_ops ?? true)
  }, [open, initial])

  function toggleDia(v: number) {
    setDiasSemana(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v].sort())
  }

  const puedeGuardar = area.trim() && tarea.trim() && (freq !== 'semanal' || diasSemana.length > 0)

  return (
    <Modal open={open} onClose={onClose} maxWidth={480}>
      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>
            {initial ? 'Editar tarea de limpieza' : 'Nueva tarea de limpieza'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)' }}>close</span>
          </button>
        </div>

        <div>
          <label style={labelStyle}>Área</label>
          <input
            value={area} onChange={e => setArea(e.target.value)}
            placeholder="Ej: Cocina, Baños, Salón" style={fieldStyle}
            list="haccp-areas-existentes"
          />
          <datalist id="haccp-areas-existentes">
            {areasExistentes.map(a => <option key={a} value={a} />)}
          </datalist>
        </div>
        <div><label style={labelStyle}>Tarea</label><input value={tarea} onChange={e => setTarea(e.target.value)} placeholder="Describir la tarea..." style={fieldStyle} /></div>
        <div>
          <label style={labelStyle}>Frecuencia</label>
          <select value={freq} onChange={e => setFreq(e.target.value)} style={fieldStyle}>
            <option value="cada_turno">Cada turno</option>
            <option value="diaria">Diaria</option>
            <option value="semanal">Semanal</option>
            <option value="mensual">Mensual</option>
          </select>
        </div>

        {/* Días — multi-selección: "campana los lunes y jueves" es una sola
            tarea, no dos (S6/Bloque 3). */}
        {freq === 'semanal' && (
          <div>
            <label style={labelStyle}>¿Qué días de la semana?</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DIAS_SEMANA_LIMP.map(d => {
                const on = diasSemana.includes(d.v)
                return (
                  <button key={d.v} onClick={() => toggleDia(d.v)} style={{
                    flex: 1, minWidth: 44, padding: '8px 0', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${on ? 'var(--navy)' : 'var(--border)'}`,
                    background: on ? 'var(--navy)' : 'var(--surface)',
                    color: on ? '#fff' : 'var(--text-2)', fontSize: 12, fontWeight: 600,
                  }}>{d.l}</button>
                )
              })}
            </div>
          </div>
        )}

        {/* Day selector — mensual */}
        {freq === 'mensual' && (
          <div>
            <label style={labelStyle}>¿Qué día del mes?</label>
            <select value={diaMes} onChange={e => setDiaMes(Number(e.target.value))} style={fieldStyle}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>Día {d}</option>
              ))}
            </select>
          </div>
        )}

        {/* Sync OPS toggle */}
        <button onClick={() => setSyncOps(v => !v)} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12,
          border: `1px solid ${syncOps ? 'var(--accent)' : 'var(--border)'}`,
          background: syncOps ? 'rgba(67,97,160,0.08)' : 'var(--surface)', cursor: 'pointer', textAlign: 'left',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: syncOps ? 'var(--accent)' : 'var(--text-3)' }}>
            {syncOps ? 'check_box' : 'check_box_outline_blank'}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Mostrar en OPS</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Aparece como rutina en el Mise de Operaciones (plaza General), el día que corresponde</div>
          </div>
        </button>

        <button disabled={!puedeGuardar || saving} onClick={async () => {
          setSaving(true)
          try {
            await onSave({
              area: area.trim(), tarea_limpieza: tarea.trim(), frecuencia: freq,
              dias_semana: freq === 'semanal' ? diasSemana : null,
              dia_mes: freq === 'mensual' ? diaMes : null,
              sync_ops: syncOps,
            })
          } finally { setSaving(false) }
        }} style={{
          width: '100%', padding: '14px', borderRadius: 12,
          background: puedeGuardar ? 'var(--navy)' : '#ccc',
          color: '#fff', border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer',
        }}>
          {saving ? 'Guardando...' : initial ? 'Guardar cambios' : 'Agregar tarea'}
        </button>
      </div>
    </Modal>
  )
}

// ── MAIN PAGE ───────────────────────────────────────────
type View = 'main' | 'registrar' | 'historial' | 'config' | 'nuevoVenc'
type Tab = 'temperaturas' | 'vencimientos' | 'limpieza'

export default function HaccpPage() {
  const {
    equipos, temperaturas, vencimientos, limpieza, limpiezaRegistros, loading,
    crearEquipo, eliminarEquipo,
    registrarTemperaturas, fetchTemperaturas,
    crearVencimiento, descartarVencimiento,
    crearTareaLimpieza, actualizarTareaLimpieza, registrarLimpieza, quitarRegistroLimpieza,
    eliminarTareaLimpieza, fetchRegistrosRango,
  } = useHaccp()
  const { registrarMerma } = useMerma()
  const { isAdmin } = usePermisos()
  const isDesktop = useIsDesktop()

  const RESTAURANTE_ID = useRestauranteId()
  const [restauranteNombre, setRestauranteNombre] = useState('')
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const supabase = createClient()
    supabase.from('restaurantes').select('nombre').eq('id', RESTAURANTE_ID).maybeSingle()
      .then(({ data }) => setRestauranteNombre(data?.nombre ?? ''))
  }, [RESTAURANTE_ID])

  const [view, setView] = useState<View>('main')
  const [tab, setTab] = useState<Tab>('temperaturas')

  useEffect(() => {
    function handleSetTab(e: Event) {
      const { tab: t } = (e as CustomEvent<{ tab: string }>).detail
      if (t === 'temperaturas' || t === 'vencimientos' || t === 'limpieza') setTab(t as Tab)
    }
    window.addEventListener('kc-set-tab', handleSetTab)
    return () => window.removeEventListener('kc-set-tab', handleSetTab)
  }, [])
  const [selectedEquipo, setSelectedEquipo] = useState<HaccpEquipo | null>(null)
  const [toast, setToast] = useState('')
  const [limpSubTab, setLimpSubTab] = useState<'hoy' | 'semana' | 'todas'>('hoy')
  const [limpWeekOffset, setLimpWeekOffset] = useState(0)
  const [limpModalOpen, setLimpModalOpen] = useState(false)
  const [editandoLimp, setEditandoLimp] = useState<HaccpLimpieza | null>(null)
  const [registrosSemana, setRegistrosSemana] = useState<HaccpLimpiezaRegistro[]>([])

  const limpWeekDates = useMemo(() => {
    const hoy = hoyOperativo()
    const [y, m, d] = hoy.split('-').map(Number)
    const dow = new Date(y, m - 1, d).getDay() // 0=Dom..6=Sáb
    const diffToMon = dow === 0 ? -6 : 1 - dow
    const monday = sumarDias(hoy, diffToMon + limpWeekOffset * 7)
    return Array.from({ length: 7 }, (_, i) => sumarDias(monday, i))
  }, [limpWeekOffset])

  useEffect(() => {
    if (limpSubTab !== 'semana') return
    fetchRegistrosRango(limpWeekDates[0], limpWeekDates[6]).then(setRegistrosSemana)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limpSubTab, limpWeekDates[0], limpWeekDates[6]])

  // Get latest temp per equipo
  const latestTemps = useMemo(() => {
    const map: Record<string, HaccpTemperatura> = {}
    for (const t of temperaturas) {
      if (!map[t.equipo_id] || new Date(t.created_at) > new Date(map[t.equipo_id].created_at)) {
        map[t.equipo_id] = t
      }
    }
    return map
  }, [temperaturas])

  // Group limpieza by area
  const limpiezaByArea = useMemo(() => {
    const map: Record<string, HaccpLimpieza[]> = {}
    for (const l of limpieza) {
      if (!map[l.area]) map[l.area] = []
      map[l.area].push(l)
    }
    return map
  }, [limpieza])

  // ¿Toca esta tarea en un día dado? (lib/haccp/recurrencia.ts — misma regla en HACCP/Mise/OPS)
  const tareaTocaDia = useCallback((l: HaccpLimpieza, date: Date): boolean => limpiezaTocaFecha(l, date), [])

  // Vencimientos alerts count
  const vencAlerts = useMemo(() => vencimientos.filter(v => {
    if (v.status === 'descartado') return false
    const d = daysUntil(v.fecha_vencimiento)
    return d <= 3
  }).length, [vencimientos])

  useEffect(() => {
    const equiposFueraRango = equipos.filter(e => {
      const t = latestTemps[e.id]
      if (!t) return false
      return t.temperatura < e.temp_min || t.temperatura > e.temp_max
    }).map(e => e.nombre)
    const equiposSinRegistro = equipos.filter(e => e.activo && !latestTemps[e.id]).map(e => e.nombre)
    const vencEnRiesgo = vencimientos.filter(v => v.status !== 'descartado' && daysUntil(v.fecha_vencimiento) <= 3)
      .map(v => ({ nombre: v.producto_nombre, dias: daysUntil(v.fecha_vencimiento) }))
    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'haccp',
      tab,
      equipos: equipos.filter(e => e.activo).length,
      equiposFueraRango,
      equiposSinRegistro,
      vencEnRiesgo,
      alertasTotal: vencAlerts,
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [tab, equipos, latestTemps, vencimientos, vencAlerts])

  const handleRegistrar = async (registros: { equipo_id: string; temperatura: number; observacion?: string; accion_correctiva?: string }[]) => {
    await registrarTemperaturas(registros)
    await fetchTemperaturas()
    setToast(`${registros.length} temperaturas registradas`)
    setView('main')
  }

  const handleCrearVenc = async (d: { producto_nombre: string; fecha_vencimiento: string; fecha_apertura?: string; lote?: string; ubicacion?: string }) => {
    await crearVencimiento({ ...d, status: 'vigente', producto_id: null, usuario_id: null, fecha_apertura: d.fecha_apertura ?? null, lote: d.lote ?? null, ubicacion: d.ubicacion ?? null })
    setToast('Vencimiento agregado')
    setView('main')
  }

  const handleGuardarLimp = async (d: { area: string; tarea_limpieza: string; frecuencia: string; dias_semana: number[] | null; dia_mes: number | null; sync_ops: boolean }) => {
    const payload = { ...d, frecuencia: d.frecuencia as 'cada_turno' | 'diaria' | 'semanal' | 'mensual', dia_semana: d.dias_semana?.[0] ?? null, usuario_id: null }
    if (editandoLimp) {
      await actualizarTareaLimpieza(editandoLimp.id, payload)
      setToast('Tarea de limpieza actualizada')
    } else {
      await crearTareaLimpieza(payload)
      setToast(d.sync_ops ? 'Tarea agregada y enviada a OPS' : 'Tarea de limpieza agregada')
    }
    setLimpModalOpen(false)
    setEditandoLimp(null)
  }

  async function toggleRegistroLimpieza(limpiezaId: string, fecha: string, yaRegistrado: boolean) {
    if (yaRegistrado) await quitarRegistroLimpieza(limpiezaId, fecha)
    else await registrarLimpieza(limpiezaId, fecha)
  }

  // ── Sub views ──
  if (view === 'registrar') {
    return (
      <>
        <RegistrarTempsView equipos={equipos} onSave={handleRegistrar} onBack={() => setView('main')} />
        {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      </>
    )
  }
  if (view === 'historial' && selectedEquipo) {
    return <HistorialView equipo={selectedEquipo} temperaturas={temperaturas} onBack={() => setView('main')} />
  }
  if (view === 'config') {
    return (
      <>
        <ConfigEquiposView
          equipos={equipos}
          onCrear={async (d) => { await crearEquipo({ ...d, tipo: d.tipo as HaccpEquipo['tipo'], plaza: '' }); setToast('Equipo creado') }}
          onEliminar={async (id) => { await eliminarEquipo(id); setToast('Equipo eliminado') }}
          onBack={() => setView('main')}
        />
        {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      </>
    )
  }
  if (view === 'nuevoVenc') {
    return (
      <>
        <NuevoVencView onSave={handleCrearVenc} onBack={() => setView('main')} restauranteNombre={restauranteNombre} />
        {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      </>
    )
  }

  // ── MAIN ──
  return (
    <PageTransition>
    <div className="scroll-body">
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 20 }}>Limpieza y Mantenimiento</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>{fmtDate(today())}</div>
          </div>
          <button onClick={() => exportHaccpPDF(equipos, temperaturas, vencimientos, limpieza)} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 10,
            padding: '8px 14px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
            Exportar registro
          </button>
        </div>

        {/* Tabs */}
        <div data-coach-target="haccp-tabs" style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          {([
            { key: 'temperaturas', label: 'Temperaturas', icon: 'thermostat' },
            { key: 'vencimientos', label: 'Vencimientos', icon: 'event', badge: vencAlerts },
            { key: 'limpieza', label: 'Limpieza', icon: 'cleaning_services' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: '8px 6px', borderRadius: 10, border: 'none',
              background: tab === t.key ? '#fff' : 'rgba(255,255,255,0.12)',
              color: tab === t.key ? 'var(--navy)' : 'rgba(255,255,255,0.8)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              position: 'relative',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{t.icon}</span>
              {t.label}
              {'badge' in t && (t as { badge?: number }).badge !== undefined && (t as { badge?: number }).badge! > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -2, width: 18, height: 18, borderRadius: 9,
                  background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{(t as { badge?: number }).badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>Cargando...</div>
      ) : (
        <div style={{ padding: 16 }}>
          {/* ── TAB: TEMPERATURAS ── */}
          {tab === 'temperaturas' && (
            <div data-coach-target="haccp-temperaturas" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button data-coach-target="haccp-registrar" onClick={() => setView('registrar')} style={{
                  flex: 1, padding: '12px', borderRadius: 12, background: 'var(--navy)',
                  color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>edit_note</span>
                  Registrar temperaturas
                </button>
                {isAdmin && (
                <button onClick={() => setView('config')} style={{
                  width: 48, borderRadius: 12, background: 'var(--surface)',
                  border: '1px solid var(--border)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-2)' }}>settings</span>
                </button>
                )}
              </div>

              <div style={isDesktop ? { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 } : { display: 'contents' }}>
              {equipos.filter(e => e.activo).map(e => {
                const t = latestTemps[e.id]
                const ok = t ? t.dentro_rango : true
                return (
                  <button key={e.id} onClick={() => { setSelectedEquipo(e); setView('historial') }} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px',
                    background: 'var(--surface)', border: `1px solid ${ok ? 'var(--border)' : '#fecaca'}`,
                    borderRadius: 12, cursor: 'pointer', width: '100%', textAlign: 'left',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 24, color: ok ? 'var(--navy-ink)' : '#ef4444' }}>
                      {EQUIPO_ICONS[e.tipo] || 'thermostat'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>{e.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        {e.ubicacion} · {e.temp_min}°C a {e.temp_max}°C
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {t ? (
                        <>
                          <div style={{ fontSize: 18, fontWeight: 800, color: ok ? 'var(--text-1)' : '#ef4444' }}>
                            {t.temperatura}°C
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{timeAgo(t.created_at)}</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Sin registro</div>
                      )}
                    </div>
                    <div style={{
                      width: 10, height: 10, borderRadius: 5,
                      background: t ? (ok ? '#22c55e' : '#ef4444') : '#d1d5db',
                      flexShrink: 0,
                    }} />
                  </button>
                )
              })}
              </div>
            </div>
          )}

          {/* ── TAB: VENCIMIENTOS ── */}
          {tab === 'vencimientos' && (
            <div data-coach-target="haccp-vencimientos" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => setView('nuevoVenc')} style={{
                width: '100%', padding: '12px', borderRadius: 12, background: 'var(--navy)',
                color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
                Agregar vencimiento
              </button>

              {vencimientos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
                  No hay productos con vencimiento registrado
                </div>
              ) : (
              <div style={isDesktop ? { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 } : { display: 'contents' }}>
              {vencimientos.map(v => {
                const days = daysUntil(v.fecha_vencimiento)
                const c = vencColor(days, v.status)
                const statusLabel = v.status === 'descartado' ? 'Descartado'
                  : days < 0 ? 'Vencido'
                  : days === 0 ? 'Vence hoy'
                  : days === 1 ? 'Vence mañana'
                  : days <= 3 ? `Vence en ${days} días`
                  : `${days} días`

                return (
                  <div key={v.id} style={{
                    padding: '12px 14px', background: c.bg, border: `1px solid ${c.text}22`,
                    borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>{v.producto_nombre}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span>Vence: {fmtShortDate(v.fecha_vencimiento)}</span>
                        {v.lote && <span>Lote: {v.lote}</span>}
                        {v.ubicacion && <span>{v.ubicacion}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: c.text,
                        background: `${c.text}15`, padding: '2px 8px', borderRadius: 6,
                      }}>{statusLabel}</span>
                      {isAdmin && v.status !== 'descartado' && (
                        <button onClick={async () => {
                          await descartarVencimiento(v.id)
                          try {
                            await registrarMerma({
                              producto_nombre: v.producto_nombre,
                              producto_id: v.producto_id,
                              cantidad: 1,
                              unidad: 'u',
                              motivo: 'vencimiento',
                              motivo_detalle: `Descartado desde HACCP — Vto: ${fmtShortDate(v.fecha_vencimiento)}${v.lote ? ` — Lote: ${v.lote}` : ''}`,
                            })
                          } catch { /* merma is best-effort */ }
                          setToast('Producto descartado + merma registrada')
                        }} style={{
                          fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600,
                        }}>Descartar</button>
                      )}
                    </div>
                  </div>
                )
              })}
              </div>
              )}
            </div>
          )}

          {/* ── TAB: LIMPIEZA ── */}
          {tab === 'limpieza' && (
            <div data-coach-target="haccp-limpieza" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {isAdmin && (
              <button onClick={() => { setEditandoLimp(null); setLimpModalOpen(true) }} style={{
                width: '100%', padding: '12px', borderRadius: 12, background: 'var(--navy)',
                color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
                Nueva tarea de limpieza
              </button>
              )}

              {/* Sub-tabs Hoy / Semana / Todas */}
              <div style={{ display: 'flex', gap: 6, background: 'var(--bg)', borderRadius: 10, padding: 3 }}>
                {(['hoy', 'semana', 'todas'] as const).map(st => (
                  <button key={st} onClick={() => setLimpSubTab(st)} style={{
                    flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: limpSubTab === st ? 'var(--surface)' : 'transparent',
                    color: limpSubTab === st ? 'var(--navy-ink)' : 'var(--text-3)',
                    fontSize: 13, fontWeight: 600, textTransform: 'capitalize',
                    boxShadow: limpSubTab === st ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}>
                    {st}
                  </button>
                ))}
              </div>

              {/* ── HOY — lo que hay que hacer y nada más ── */}
              {limpSubTab === 'hoy' && (() => {
                const hoy = hoyOperativo()
                const hoyDate = new Date(hoy + 'T12:00:00')
                const registradosHoy = new Set(limpiezaRegistros.filter(r => r.fecha === hoy).map(r => r.limpieza_id))
                const tareasHoy = limpieza.filter(l => tareaTocaDia(l, hoyDate))
                const hechas = tareasHoy.filter(l => registradosHoy.has(l.id)).length
                const porArea: Record<string, HaccpLimpieza[]> = {}
                for (const l of tareasHoy) { (porArea[l.area] ??= []).push(l) }
                return (
                  <>
                    {tareasHoy.length > 0 && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        {hechas} de {tareasHoy.length} hechas hoy
                      </div>
                    )}
                    {tareasHoy.length === 0 && (
                      <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)', fontSize: 13 }}>
                        Nada para limpiar hoy
                      </div>
                    )}
                    {Object.entries(porArea).map(([area, tasks]) => (
                      <div key={area}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>cleaning_services</span>
                          {area}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {tasks.map(l => {
                            const hecha = registradosHoy.has(l.id)
                            return (
                              <button key={l.id} onClick={async () => {
                                await toggleRegistroLimpieza(l.id, hoy, hecha)
                                setToast(hecha ? 'Limpieza destildada' : 'Limpieza registrada')
                              }} style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', minHeight: 56,
                                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                                cursor: 'pointer', width: '100%', textAlign: 'left', fontFamily: 'inherit',
                              }}>
                                <div style={{
                                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                                  background: hecha ? '#059669' : '#e5e7eb',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                  {hecha && <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>check</span>}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-1)', textDecoration: hecha ? 'line-through' : 'none' }}>
                                    {l.tarea_limpieza}
                                  </div>
                                  <span style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--bg)', padding: '1px 6px', borderRadius: 4 }}>
                                    {FREQ_LABELS[l.frecuencia]}
                                  </span>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </>
                )
              })()}

              {/* ── SEMANA — el diagrama, área × 7 días ── */}
              {limpSubTab === 'semana' && (() => {
                const hoy = hoyOperativo()
                const registrosSet = new Set(registrosSemana.map(r => `${r.limpieza_id}|${r.fecha}`))
                const areas = Object.keys(limpiezaByArea)
                const diaCorto = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
                return (
                  <div>
                    {/* Nav semana */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <button onClick={() => setLimpWeekOffset(o => o - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>chevron_left</span>
                      </button>
                      <div style={{ textAlign: 'center' }}>
                        <button onClick={() => setLimpWeekOffset(0)} style={{
                          background: limpWeekOffset === 0 ? 'var(--navy)' : 'var(--surface)',
                          color: limpWeekOffset === 0 ? '#fff' : 'var(--text-1)',
                          border: limpWeekOffset === 0 ? 'none' : '1px solid var(--border)',
                          borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 4,
                        }}>Esta semana</button>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          {fmtShortDate(limpWeekDates[0])} — {fmtShortDate(limpWeekDates[6])}
                        </div>
                      </div>
                      <button onClick={() => setLimpWeekOffset(o => o + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>chevron_right</span>
                      </button>
                    </div>

                    {areas.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)', fontSize: 13 }}>
                        Agregá tareas para verlas en la semana
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <div style={{ minWidth: 480 }}>
                          {/* Header de días */}
                          <div style={{ display: 'grid', gridTemplateColumns: '76px repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
                            <div />
                            {limpWeekDates.map(d => {
                              const esHoy = d === hoy
                              return (
                                <div key={d} style={{
                                  textAlign: 'center', fontSize: 10, fontWeight: 700,
                                  color: esHoy ? 'var(--navy-ink)' : 'var(--text-3)',
                                  background: esHoy ? 'rgba(28,45,74,.08)' : 'transparent',
                                  borderRadius: 6, padding: '3px 0',
                                }}>
                                  {diaCorto[new Date(d + 'T12:00:00').getDay()]} {Number(d.slice(8, 10))}
                                </div>
                              )
                            })}
                          </div>

                          {/* Filas por área */}
                          {areas.map(area => (
                            <div key={area} style={{ display: 'grid', gridTemplateColumns: '76px repeat(7, 1fr)', gap: 3, marginBottom: 6 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', display: 'flex', alignItems: 'center', paddingRight: 4 }}>
                                {area}
                              </div>
                              {limpWeekDates.map(d => {
                                const date = new Date(d + 'T12:00:00')
                                const tareasDia = limpiezaByArea[area].filter(l => tareaTocaDia(l, date))
                                const esHoy = d === hoy
                                const esPasado = d < hoy
                                return (
                                  <div key={d} style={{
                                    background: esHoy ? 'rgba(28,45,74,.04)' : 'transparent',
                                    borderRadius: 6, padding: 2, minHeight: 30,
                                    display: 'flex', flexDirection: 'column', gap: 2,
                                  }}>
                                    {tareasDia.map(l => {
                                      const hecha = registrosSet.has(`${l.id}|${d}`)
                                      const atrasada = esPasado && !hecha
                                      return (
                                        <button
                                          key={l.id}
                                          title={l.tarea_limpieza}
                                          onClick={async () => {
                                            await toggleRegistroLimpieza(l.id, d, hecha)
                                            setRegistrosSemana(prev => hecha
                                              ? prev.filter(r => !(r.limpieza_id === l.id && r.fecha === d))
                                              : [...prev, { id: `tmp-${l.id}-${d}`, limpieza_id: l.id, fecha: d, completado: true, observacion: null, usuario_id: null, created_at: new Date().toISOString() }])
                                          }}
                                          style={{
                                            fontSize: 9, padding: '2px 4px', borderRadius: 4, border: 'none', cursor: 'pointer',
                                            textAlign: 'left', lineHeight: 1.25, fontFamily: 'inherit',
                                            background: hecha ? '#d1fae5' : atrasada ? '#fef3c7' : 'var(--bg)',
                                            color: hecha ? '#065f46' : atrasada ? '#92400e' : 'var(--text-2)',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                          }}
                                        >
                                          {l.tarea_limpieza}
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
                    )}
                  </div>
                )
              })()}

              {/* ── TODAS — el catálogo, editar y borrar ── */}
              {limpSubTab === 'todas' && Object.entries(limpiezaByArea).map(([area, tasks]) => (
                <div key={area}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>cleaning_services</span>
                    {area}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {tasks.map(l => {
                      const lastDone = l.ultimo_registro ? timeAgo(l.ultimo_registro) : 'Nunca'
                      const isRecent = l.ultimo_registro && (Date.now() - new Date(l.ultimo_registro).getTime()) < 86400000
                      return (
                        <div key={l.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                        }}>
                          <button onClick={async () => {
                            await registrarLimpieza(l.id)
                            setToast('Limpieza registrada')
                          }} style={{
                            width: 28, height: 28, borderRadius: 8, border: 'none',
                            background: isRecent ? '#059669' : '#e5e7eb',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', flexShrink: 0,
                          }}>
                            {isRecent && <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>check</span>}
                          </button>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-1)' }}>{l.tarea_limpieza}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', gap: 8, marginTop: 2 }}>
                              <span style={{
                                background: 'var(--bg)', padding: '1px 6px', borderRadius: 4,
                              }}>{FREQ_LABELS[l.frecuencia]}</span>
                              <span style={{ color: isRecent ? '#059669' : '#ef4444', fontWeight: 600 }}>
                                {lastDone}
                              </span>
                            </div>
                          </div>
                          {isAdmin && (
                          <button onClick={() => { setEditandoLimp(l); setLimpModalOpen(true) }} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                          }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>edit</span>
                          </button>
                          )}
                          {isAdmin && (
                          <button onClick={() => { if (confirm('Eliminar?')) eliminarTareaLimpieza(l.id) }} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                          }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>close</span>
                          </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

              <TareaLimpiezaModal
                open={limpModalOpen}
                initial={editandoLimp}
                areasExistentes={Array.from(new Set(limpieza.map(l => l.area))).sort()}
                onSave={handleGuardarLimp}
                onClose={() => { setLimpModalOpen(false); setEditandoLimp(null) }}
              />
            </div>
          )}
        </div>
      )}

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
    </PageTransition>
  )
}
