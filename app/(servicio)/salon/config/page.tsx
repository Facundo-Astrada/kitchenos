'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'

type Tab = 'mesas' | 'medios' | 'estaciones'

interface Mesa       { id: string; numero: string; sector: string; capacidad: number; estado: string }
interface MedioPago  { id: string; nombre: string; activo: boolean }
interface Estacion   { id: string; nombre: string; pantalla_asignada: string }

// ── Mesa form (nivel módulo) ─────────────────────────────────────────────────
function MesaForm({
  form, setForm, onGuardar, onCancelar, guardando,
}: {
  form: Partial<Mesa>
  setForm: React.Dispatch<React.SetStateAction<Partial<Mesa>>>
  onGuardar: () => void
  onCancelar: () => void
  guardando: boolean
}) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--accent)' }}>
      <p style={{ fontWeight: 700, color: 'var(--text-1)' }}>{form.id ? 'Editar mesa' : 'Nueva mesa'}</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Número / nombre</span>
          <input value={form.numero ?? ''} onChange={e => setForm(p => ({ ...p, numero: e.target.value }))}
            placeholder="1, A1, Barra..." style={inputStyle} />
        </label>
        <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Sector</span>
          <input value={form.sector ?? ''} onChange={e => setForm(p => ({ ...p, sector: e.target.value }))}
            placeholder="Salón, Terraza..." style={inputStyle} />
        </label>
        <label style={{ width: 80, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Capacidad</span>
          <input type="number" min={1} value={form.capacidad ?? 4} onChange={e => setForm(p => ({ ...p, capacidad: parseInt(e.target.value) || 4 }))}
            style={inputStyle} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancelar} style={{ flex: 1, minHeight: 44, borderRadius: 10, background: 'var(--bg)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
          Cancelar
        </button>
        <button onClick={onGuardar} disabled={guardando || !form.numero}
          style={{ flex: 2, minHeight: 44, borderRadius: 10, background: 'var(--navy)', color: '#fff', fontWeight: 700, opacity: guardando ? 0.6 : 1 }}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  minHeight: 44, borderRadius: 10, background: 'var(--bg)', color: 'var(--text-1)',
  border: '1px solid var(--border)', padding: '0 12px', fontSize: 15, width: '100%',
}

export default function SalonConfigPage() {
  const router  = useRouter()
  const RID     = useRestauranteId()
  const supabase = createClient()
  const [tab,    setTab]    = useState<Tab>('mesas')

  // Mesas
  const [mesas,    setMesas]    = useState<Mesa[]>([])
  const [mesaForm, setMesaForm] = useState<Partial<Mesa>>({})
  const [showMesaForm, setShowMesaForm] = useState(false)
  const [guardandoMesa, setGuardandoMesa] = useState(false)

  // Medios de pago
  const [medios,      setMedios]      = useState<MedioPago[]>([])
  const [nuevoMedio,  setNuevoMedio]  = useState('')
  const [guardandoMedio, setGuardandoMedio] = useState(false)

  // Estaciones KDS
  const [estaciones,    setEstaciones]    = useState<Estacion[]>([])
  const [nuevaEstacion, setNuevaEstacion] = useState('')
  const [guardandoEst,  setGuardandoEst]  = useState(false)

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchMesas = useCallback(async () => {
    if (!RID) return
    const { data } = await supabase.from('mesas').select('*').eq('restaurante_id', RID).order('sector').order('numero')
    setMesas((data ?? []) as Mesa[])
  }, [RID, supabase])

  const fetchMedios = useCallback(async () => {
    if (!RID) return
    const { data } = await supabase.from('medios_pago').select('*').eq('restaurante_id', RID).order('nombre')
    setMedios((data ?? []) as MedioPago[])
  }, [RID, supabase])

  const fetchEstaciones = useCallback(async () => {
    if (!RID) return
    const { data } = await supabase.from('estaciones').select('*').eq('restaurante_id', RID).order('nombre')
    setEstaciones((data ?? []) as Estacion[])
  }, [RID, supabase])

  useEffect(() => { fetchMesas(); fetchMedios(); fetchEstaciones() }, [fetchMesas, fetchMedios, fetchEstaciones])

  // ── Mesas ────────────────────────────────────────────────────────────────────

  async function guardarMesa() {
    if (!RID || !mesaForm.numero) return
    setGuardandoMesa(true)
    try {
      if (mesaForm.id) {
        await supabase.from('mesas').update({ numero: mesaForm.numero, sector: mesaForm.sector ?? '', capacidad: mesaForm.capacidad ?? 4 }).eq('id', mesaForm.id)
      } else {
        await supabase.from('mesas').insert({ restaurante_id: RID, numero: mesaForm.numero, sector: mesaForm.sector ?? 'Salón', capacidad: mesaForm.capacidad ?? 4, estado: 'libre' })
      }
      setMesaForm({})
      setShowMesaForm(false)
      await fetchMesas()
    } finally { setGuardandoMesa(false) }
  }

  async function eliminarMesa(id: string) {
    if (!confirm('¿Eliminar esta mesa?')) return
    await supabase.from('mesas').delete().eq('id', id)
    await fetchMesas()
  }

  // ── Medios de pago ───────────────────────────────────────────────────────────

  async function guardarMedio() {
    if (!RID || !nuevoMedio.trim()) return
    setGuardandoMedio(true)
    try {
      await supabase.from('medios_pago').insert({ restaurante_id: RID, nombre: nuevoMedio.trim(), activo: true })
      setNuevoMedio('')
      await fetchMedios()
    } finally { setGuardandoMedio(false) }
  }

  async function toggleMedio(id: string, activo: boolean) {
    await supabase.from('medios_pago').update({ activo: !activo }).eq('id', id)
    await fetchMedios()
  }

  async function eliminarMedio(id: string) {
    if (!confirm('¿Eliminar este medio de pago?')) return
    await supabase.from('medios_pago').delete().eq('id', id)
    await fetchMedios()
  }

  // ── Estaciones KDS ───────────────────────────────────────────────────────────

  async function guardarEstacion() {
    if (!RID || !nuevaEstacion.trim()) return
    setGuardandoEst(true)
    try {
      await supabase.from('estaciones').insert({ restaurante_id: RID, nombre: nuevaEstacion.trim(), pantalla_asignada: nuevaEstacion.trim().toLowerCase().replace(/\s+/g, '_') })
      setNuevaEstacion('')
      await fetchEstaciones()
    } finally { setGuardandoEst(false) }
  }

  async function eliminarEstacion(id: string) {
    if (!confirm('¿Eliminar esta estación?')) return
    await supabase.from('estaciones').delete().eq('id', id)
    await fetchEstaciones()
  }

  // ── Sectores agrupados ───────────────────────────────────────────────────────

  const sectores = useMemo(() => {
    const map: Record<string, Mesa[]> = {}
    for (const m of mesas) {
      const s = m.sector || 'Sin sector'
      if (!map[s]) map[s] = []
      map[s].push(m)
    }
    return map
  }, [mesas])

  // ── UI ───────────────────────────────────────────────────────────────────────

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, minHeight: 44, background: active ? 'var(--navy)' : 'transparent',
    color: active ? '#fff' : 'var(--text-2)', border: 'none', fontWeight: active ? 700 : 500, fontSize: 14,
  })

  return (
    <div style={{ background: '#111', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: '46px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#fff', minWidth: 44, minHeight: 44 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 28 }}>arrow_back</span>
        </button>
        <p style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>Configuración del salón</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: '#1a1a1a', borderBottom: '1px solid #2a2a2a' }}>
        {(['mesas', 'medios', 'estaciones'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
            {t === 'mesas' ? 'Mesas' : t === 'medios' ? 'Medios de pago' : 'Estaciones KDS'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── MESAS ─────────────────────────────────────────────────────────── */}
        {tab === 'mesas' && (
          <>
            {showMesaForm
              ? <MesaForm form={mesaForm} setForm={setMesaForm} onGuardar={guardarMesa} onCancelar={() => { setShowMesaForm(false); setMesaForm({}) }} guardando={guardandoMesa} />
              : (
                <button onClick={() => { setMesaForm({}); setShowMesaForm(true) }}
                  style={{ minHeight: 52, borderRadius: 12, background: '#1a1a1a', border: '1.5px dashed #333', color: '#aaa', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined">add</span> Agregar mesa
                </button>
              )
            }

            {Object.entries(sectores).map(([sector, mesasDelSector]) => (
              <div key={sector}>
                <p style={{ color: '#666', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{sector}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                  {mesasDelSector.map(m => (
                    <div key={m.id} style={{ background: '#1a1a1a', borderRadius: 12, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <p style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Mesa {m.numero}</p>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => { setMesaForm(m); setShowMesaForm(true) }}
                            style={{ background: 'none', border: 'none', color: '#aaa', padding: 4 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                          </button>
                          <button onClick={() => eliminarMesa(m.id)}
                            style={{ background: 'none', border: 'none', color: '#e57373', padding: 4 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                          </button>
                        </div>
                      </div>
                      <p style={{ color: '#666', fontSize: 13 }}>{m.capacidad} pers.</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {mesas.length === 0 && !showMesaForm && (
              <p style={{ color: '#555', textAlign: 'center', padding: 32 }}>No hay mesas configuradas aún</p>
            )}
          </>
        )}

        {/* ── MEDIOS DE PAGO ───────────────────────────────────────────────── */}
        {tab === 'medios' && (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={nuevoMedio} onChange={e => setNuevoMedio(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') guardarMedio() }}
                placeholder="Efectivo, Débito, MP, QR..."
                style={{ ...inputStyle, flex: 1 }} />
              <button onClick={guardarMedio} disabled={guardandoMedio || !nuevoMedio.trim()}
                style={{ minWidth: 52, minHeight: 44, borderRadius: 10, background: 'var(--navy)', color: '#fff', fontWeight: 700, opacity: guardandoMedio ? 0.6 : 1 }}>
                <span className="material-symbols-outlined">add</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {medios.map(m => (
                <div key={m.id} style={{ background: '#1a1a1a', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: m.activo ? '#1e3320' : '#2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: m.activo ? '#4caf50' : '#555' }}>
                      {m.nombre.toLowerCase().includes('efectivo') ? 'payments' : m.nombre.toLowerCase().includes('débito') || m.nombre.toLowerCase().includes('credito') ? 'credit_card' : 'qr_code'}
                    </span>
                  </div>
                  <span style={{ color: '#fff', flex: 1, fontWeight: 600 }}>{m.nombre}</span>
                  <button onClick={() => toggleMedio(m.id, m.activo)} style={{ background: m.activo ? '#1e3320' : '#2a2a2a', border: 'none', borderRadius: 8, padding: '6px 12px', color: m.activo ? '#4caf50' : '#555', fontSize: 13 }}>
                    {m.activo ? 'Activo' : 'Inactivo'}
                  </button>
                  <button onClick={() => eliminarMedio(m.id)} style={{ background: 'none', border: 'none', color: '#e57373', padding: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                  </button>
                </div>
              ))}
              {medios.length === 0 && <p style={{ color: '#555', textAlign: 'center', padding: 24 }}>Sin medios de pago. Agregá al menos uno para poder cobrar.</p>}
            </div>
          </>
        )}

        {/* ── ESTACIONES KDS ──────────────────────────────────────────────── */}
        {tab === 'estaciones' && (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={nuevaEstacion} onChange={e => setNuevaEstacion(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') guardarEstacion() }}
                placeholder="Parrilla, Frío, Pastelería..."
                style={{ ...inputStyle, flex: 1 }} />
              <button onClick={guardarEstacion} disabled={guardandoEst || !nuevaEstacion.trim()}
                style={{ minWidth: 52, minHeight: 44, borderRadius: 10, background: 'var(--navy)', color: '#fff', fontWeight: 700, opacity: guardandoEst ? 0.6 : 1 }}>
                <span className="material-symbols-outlined">add</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {estaciones.map(e => (
                <div key={e.id} style={{ background: '#1a1a1a', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="material-symbols-outlined" style={{ color: '#4361a0', fontSize: 22 }}>kitchen</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#fff', fontWeight: 700 }}>{e.nombre}</p>
                    <p style={{ color: '#555', fontSize: 12 }}>pantalla: {e.pantalla_asignada}</p>
                  </div>
                  <button onClick={() => eliminarEstacion(e.id)} style={{ background: 'none', border: 'none', color: '#e57373', padding: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                  </button>
                </div>
              ))}
              {estaciones.length === 0 && (
                <div style={{ background: '#1a1010', borderRadius: 12, padding: '14px 16px' }}>
                  <p style={{ color: '#e57373', fontWeight: 600 }}>Sin estaciones KDS</p>
                  <p style={{ color: '#aaa', fontSize: 13, marginTop: 4 }}>Las estaciones definen a qué pantalla de KDS va cada ítem de la carta. Creá una y luego asignala en cada ítem de la carta.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

