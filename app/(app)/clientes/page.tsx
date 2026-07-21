'use client'

import { useState, useMemo, useEffect } from 'react'
import PageTransition from '@/components/PageTransition'
import { useClientes, GRUPO_LABELS, type ClienteConMetricas, type GrupoCliente } from '@/lib/hooks/useClientes'
import { useCuentaCorriente, type MovimientoCCEnriquecido } from '@/lib/hooks/useCuentaCorriente'
import { useMediosPago } from '@/lib/hooks/useMediosPago'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { SegmentedTabs, EmptyState, HeaderAction } from '@/components/ui'
import type { SegmentedTab } from '@/components/ui'
import type { TipoMovimientoCC } from '@/types'

function fmt(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR')
}
function fmtFecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function fmtFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const GRUPO_COLOR: Record<Exclude<GrupoCliente, null>, string> = {
  nuevo: '#16a34a', dormido: '#d97706', sin_compras: '#64748b',
}

type MainTab = 'clientes' | 'cc'
const MAIN_TABS: SegmentedTab<MainTab>[] = [
  { id: 'clientes', label: 'Clientes' },
  { id: 'cc', label: 'Cuentas Corrientes' },
]

const selStyle: React.CSSProperties = { padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }

export default function ClientesPage() {
  const [tab, setTab] = useState<MainTab>('clientes')

  // Permite que el tour del Kitchen Coach cambie de tab (ver requireTab en lib/coach/tours.ts).
  useEffect(() => {
    function handleSetTab(e: Event) {
      const { tab: t } = (e as CustomEvent<{ tab: string }>).detail
      if (t === 'clientes' || t === 'cc') setTab(t)
    }
    window.addEventListener('kc-set-tab', handleSetTab)
    return () => window.removeEventListener('kc-set-tab', handleSetTab)
  }, [])

  return (
    <PageTransition>
      <div className="flex flex-col h-full" style={{ overflow: 'hidden' }}>
        <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 12px', flexShrink: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Clientes</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>Base de clientes · Fiado</div>
            </div>
          </div>
          <div data-coach-target="clientes-tabs">
            <SegmentedTabs tabs={MAIN_TABS} active={tab} onChange={setTab} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {tab === 'clientes' ? <ClientesTab /> : <CuentasCorrientesTab />}
        </div>
      </div>
    </PageTransition>
  )
}

// ════════════════════════════════════════════════════════════
// CLIENTES — base con métricas + segmentos, ABM
// ════════════════════════════════════════════════════════════
function ClientesTab() {
  const { clientes, loading, crearCliente, actualizarCliente, desactivarCliente, fetchHistorialCompras } = useClientes()
  const { isAdmin } = usePermisos()
  const [search, setSearch] = useState('')
  const [verInactivos, setVerInactivos] = useState(false)
  const [cantFiltro, setCantFiltro] = useState('')
  const [ultimaFiltro, setUltimaFiltro] = useState('')
  const [origenFiltro, setOrigenFiltro] = useState('')
  const [grupoFiltro, setGrupoFiltro] = useState('')
  const [seleccion, setSeleccion] = useState<ClienteConMetricas | null>(null)
  const [creando, setCreando] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoTelefono, setNuevoTelefono] = useState('')
  const [saving, setSaving] = useState(false)

  const origenesDisponibles = useMemo(() => Array.from(new Set(clientes.map(c => c.origen))).sort(), [clientes])

  useEffect(() => {
    const dormidos = clientes.filter(c => c.grupo === 'dormido').map(c => c.nombre).slice(0, 6)
    const nuevos = clientes.filter(c => c.grupo === 'nuevo').map(c => c.nombre).slice(0, 6)
    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'clientes',
      tab: 'clientes',
      totalActivos: clientes.filter(c => c.activo).length,
      dormidos,
      sinCompras: clientes.filter(c => c.grupo === 'sin_compras').length,
      nuevos,
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [clientes])

  const filtered = useMemo(() => {
    let list = clientes
    if (!verInactivos) list = list.filter(c => c.activo)
    if (search.trim()) { const q = search.trim().toLowerCase(); list = list.filter(c => c.nombre.toLowerCase().includes(q) || (c.telefono ?? '').includes(q)) }
    if (origenFiltro) list = list.filter(c => c.origen === origenFiltro)
    if (grupoFiltro) list = list.filter(c => c.grupo === grupoFiltro)
    if (cantFiltro) {
      list = list.filter(c => {
        if (cantFiltro === '0') return c.cant_compras === 0
        if (cantFiltro === '1') return c.cant_compras === 1
        if (cantFiltro === '2-5') return c.cant_compras >= 2 && c.cant_compras <= 5
        if (cantFiltro === '6+') return c.cant_compras >= 6
        return true
      })
    }
    if (ultimaFiltro) {
      const now = Date.now()
      list = list.filter(c => {
        if (!c.ultima_compra) return ultimaFiltro === 'nunca'
        const dias = (now - new Date(c.ultima_compra).getTime()) / 86_400_000
        if (ultimaFiltro === '7d') return dias <= 7
        if (ultimaFiltro === '30d') return dias <= 30
        if (ultimaFiltro === '90d') return dias <= 90
        return true
      })
    }
    return list
  }, [clientes, verInactivos, search, origenFiltro, grupoFiltro, cantFiltro, ultimaFiltro])

  async function handleCrear() {
    if (!nuevoNombre.trim() || saving) return
    setSaving(true)
    try {
      await crearCliente({ nombre: nuevoNombre, telefono: nuevoTelefono || null })
      setNuevoNombre(''); setNuevoTelefono(''); setCreando(false)
    } finally { setSaving(false) }
  }

  if (seleccion) {
    return <ClienteDetalle cliente={clientes.find(c => c.id === seleccion.id) ?? seleccion} onBack={() => setSeleccion(null)} onUpdate={actualizarCliente} onDesactivar={desactivarCliente} fetchHistorial={fetchHistorialCompras} canEdit={isAdmin} />
  }

  return (
    <div style={{ padding: 16 }}>
      <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente…" style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)} />
          Inactivos
        </label>
        <div data-coach-target="clientes-nuevo">
          <HeaderAction label="Nuevo cliente" icon="add" onClick={() => setCreando(v => !v)} style={{ background: 'var(--navy)' }} />
        </div>
      </div>

      <div data-coach-target="clientes-filtros" className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
        <select value={cantFiltro} onChange={e => setCantFiltro(e.target.value)} style={selStyle}>
          <option value="">Cant. de compras: todas</option>
          <option value="0">0</option><option value="1">1</option><option value="2-5">2 a 5</option><option value="6+">6 o más</option>
        </select>
        <select value={ultimaFiltro} onChange={e => setUltimaFiltro(e.target.value)} style={selStyle}>
          <option value="">Última compra: todas</option>
          <option value="7d">Últimos 7 días</option><option value="30d">Últimos 30 días</option><option value="90d">Últimos 90 días</option><option value="nunca">Nunca compró</option>
        </select>
        {origenesDisponibles.length > 1 && (
          <select value={origenFiltro} onChange={e => setOrigenFiltro(e.target.value)} style={selStyle}>
            <option value="">Origen: todos</option>
            {origenesDisponibles.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <select value={grupoFiltro} onChange={e => setGrupoFiltro(e.target.value)} style={selStyle}>
          <option value="">Grupo: todos</option>
          {(Object.keys(GRUPO_LABELS) as (keyof typeof GRUPO_LABELS)[]).map(g => <option key={g} value={g}>{GRUPO_LABELS[g]}</option>)}
        </select>
      </div>

      {creando && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input autoFocus value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} placeholder="Nombre" style={{ ...inputStyle, flex: 2, minWidth: 140 }} />
          <input value={nuevoTelefono} onChange={e => setNuevoTelefono(e.target.value)} placeholder="Teléfono (opcional)" style={{ ...inputStyle, flex: 1, minWidth: 120 }} />
          <button onClick={handleCrear} disabled={!nuevoNombre.trim() || saving} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? .6 : 1 }}>Crear</button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="groups" title="Sin clientes" subtitle={clientes.length === 0 ? 'Creá tu primer cliente o vinculalo al cobrar en el Salón' : 'Sin resultados para estos filtros'} />
      ) : (
        <div data-coach-target="clientes-lista" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {filtered.map((c, i) => (
            <button key={c.id} onClick={() => setSeleccion(c)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '11px 12px', border: 'none', borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: c.activo ? 1 : .5 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{c.nombre}</span>
                  {c.grupo && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: `${GRUPO_COLOR[c.grupo]}18`, color: GRUPO_COLOR[c.grupo] }}>{GRUPO_LABELS[c.grupo]}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                  {c.telefono ? c.telefono + ' · ' : ''}Últ. compra: {fmtFecha(c.ultima_compra)} · {c.cant_compras} compra{c.cant_compras !== 1 ? 's' : ''}
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: "'DM Mono', monospace" }}>{fmt(c.total_gastado)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ClienteDetalle({ cliente, onBack, onUpdate, onDesactivar, fetchHistorial, canEdit }: {
  cliente: ClienteConMetricas
  onBack: () => void
  onUpdate: (id: string, datos: { nombre?: string; telefono?: string | null; email?: string | null; notas?: string | null }) => Promise<void>
  onDesactivar: (id: string) => Promise<void>
  fetchHistorial: (id: string) => Promise<{ id: string; total: number; cerrada_at: string; mesa: { numero: string } | null }[]>
  canEdit: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(cliente.nombre)
  const [telefono, setTelefono] = useState(cliente.telefono ?? '')
  const [email, setEmail] = useState(cliente.email ?? '')
  const [notas, setNotas] = useState(cliente.notas ?? '')
  const [saving, setSaving] = useState(false)
  const [historial, setHistorial] = useState<{ id: string; total: number; cerrada_at: string; mesa: { numero: string } | null }[]>([])
  const [histLoading, setHistLoading] = useState(true)

  useEffect(() => {
    setHistLoading(true)
    fetchHistorial(cliente.id).then(setHistorial).finally(() => setHistLoading(false))
  }, [cliente.id, fetchHistorial])

  async function guardar() {
    setSaving(true)
    try {
      await onUpdate(cliente.id, { nombre: nombre.trim(), telefono: telefono.trim() || null, email: email.trim() || null, notas: notas.trim() || null })
      setEditando(false)
    } finally { setSaving(false) }
  }

  return (
    <div style={{ padding: '0 16px 24px' }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 13, fontWeight: 600, padding: '16px 0', fontFamily: 'inherit' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>Volver
      </button>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
        {editando ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre" style={inputStyle} />
            <input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Teléfono" style={inputStyle} />
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
            <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas (alergias, preferencias…)" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditando(false)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={guardar} disabled={saving} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? .6 : 1 }}>{saving ? '…' : 'Guardar'}</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)' }}>{cliente.nombre}</span>
              {canEdit && (
                <button onClick={() => setEditando(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                </button>
              )}
            </div>
            {cliente.grupo && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: `${GRUPO_COLOR[cliente.grupo]}18`, color: GRUPO_COLOR[cliente.grupo] }}>{GRUPO_LABELS[cliente.grupo]}</span>}
            {[['Teléfono', cliente.telefono], ['Email', cliente.email], ['Origen', cliente.origen]].map(([label, val]) => val && (
              <div key={label} className="flex justify-between py-1" style={{ fontSize: 13, borderTop: '1px solid var(--border)', marginTop: 8 }}>
                <span style={{ color: 'var(--text-3)' }}>{label}</span>
                <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{val}</span>
              </div>
            ))}
            {cliente.notas && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3 }}>NOTAS</div>
                <div style={{ fontSize: 12, color: 'var(--text-1)' }}>{cliente.notas}</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Compras', value: String(cliente.cant_compras), color: 'var(--accent)' },
          { label: 'Total gastado', value: fmt(cliente.total_gastado), color: 'var(--navy)' },
          { label: 'Última compra', value: fmtFecha(cliente.ultima_compra), color: 'var(--text-1)' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 10px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>{k.label}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: k.color, fontFamily: "'DM Mono', monospace" }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Historial de compras</div>
      {histLoading ? (
        <div style={{ padding: 16, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>Cargando…</div>
      ) : historial.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>Sin compras registradas</div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          {historial.map((h, i) => (
            <div key={h.id} className="flex justify-between items-center" style={{ padding: '10px 12px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{fmtFechaHora(h.cerrada_at)}{h.mesa ? ` · Mesa ${h.mesa.numero}` : ''}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{fmt(h.total)}</span>
            </div>
          ))}
        </div>
      )}

      {canEdit && cliente.activo && (
        <button onClick={() => { if (confirm(`¿Desactivar a ${cliente.nombre}?`)) onDesactivar(cliente.id) }}
          style={{ fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
          Desactivar cliente
        </button>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// CUENTAS CORRIENTES — libro de fiado
// ════════════════════════════════════════════════════════════
function CuentasCorrientesTab() {
  const { movimientos, loading, saldoTotal, saldoPorCliente, registrarMovimiento, eliminarMovimiento } = useCuentaCorriente()
  const { clientes } = useClientes()
  const { medios } = useMediosPago()
  const [clienteFiltro, setClienteFiltro] = useState('')
  const [seleccion, setSeleccion] = useState<MovimientoCCEnriquecido | null>(null)
  const [showNueva, setShowNueva] = useState(false)

  const filtered = useMemo(() => clienteFiltro ? movimientos.filter(m => m.cliente_id === clienteFiltro) : movimientos, [movimientos, clienteFiltro])

  const clientesConNombre = useMemo(() => Array.from(new Set(movimientos.map(m => m.cliente_id)))
    .map(id => ({ id, nombre: movimientos.find(m => m.cliente_id === id)?.cliente_nombre ?? '—' }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [movimientos])

  useEffect(() => {
    const deudores = [...saldoPorCliente.entries()]
      .filter(([, saldo]) => saldo < 0)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 6)
      .map(([id, saldo]) => ({
        nombre: movimientos.find(m => m.cliente_id === id)?.cliente_nombre ?? '—',
        debe: Math.abs(saldo),
      }))
    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'clientes',
      tab: 'cc',
      saldoTotal,
      deudores,
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [movimientos, saldoPorCliente, saldoTotal])

  if (seleccion) {
    return (
      <div style={{ padding: '0 16px 24px' }}>
        <button onClick={() => setSeleccion(null)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 13, fontWeight: 600, padding: '16px 0', fontFamily: 'inherit' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>Volver
        </button>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4 }}>{seleccion.descripcion || (seleccion.tipo === 'cargo' ? 'Cargo' : 'Pago')}</div>
          {[
            ['Fecha de registro', fmtFechaHora(seleccion.created_at)],
            ['Cliente', seleccion.cliente_nombre],
            ['Tipo', seleccion.tipo === 'cargo' ? 'Cargo (venta a crédito)' : 'Pago'],
            ['Monto', (seleccion.tipo === 'pago' ? '+' : '−') + fmt(seleccion.monto)],
            ['Medio de pago', seleccion.medio_nombre ?? '—'],
            ['Fecha de pago', fmtFecha(seleccion.fecha_pago ?? null)],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between py-1" style={{ fontSize: 13, borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-3)' }}>{label}</span>
              <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{val}</span>
            </div>
          ))}
          {seleccion.cuenta_id && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)' }}>Vinculado a una venta del Salón</div>
          )}
          <button onClick={async () => { if (confirm('¿Eliminar este movimiento?')) { await eliminarMovimiento(seleccion.id); setSeleccion(null) } }}
            style={{ marginTop: 14, fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
            Eliminar movimiento
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 16 }}>
      <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
        <select value={clienteFiltro} onChange={e => setClienteFiltro(e.target.value)} style={{ ...selStyle, flex: 1, minWidth: 160 }}>
          <option value="">Cliente: todos</option>
          {clientesConNombre.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <div data-coach-target="cc-nueva">
          <HeaderAction label="Nueva transacción" icon="add" onClick={() => setShowNueva(true)} style={{ background: 'var(--navy)' }} />
        </div>
      </div>

      <div data-coach-target="cc-saldo" className="flex gap-3 mb-4" style={{ flexWrap: 'wrap' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', flex: 1, minWidth: 130 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Registros totales</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)' }}>{filtered.length}</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', flex: 1, minWidth: 130 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Saldo</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: (clienteFiltro ? (saldoPorCliente.get(clienteFiltro) ?? 0) : saldoTotal) < 0 ? '#dc2626' : '#16a34a' }}>
            {fmt(clienteFiltro ? (saldoPorCliente.get(clienteFiltro) ?? 0) : saldoTotal)}
          </div>
        </div>
      </div>

      {showNueva && (
        <NuevaTransaccionCC clientes={clientes} medios={medios} onClose={() => setShowNueva(false)}
          onSave={async (datos) => { await registrarMovimiento(datos); setShowNueva(false) }} />
      )}

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="account_balance_wallet" title="Sin movimientos" subtitle="Los cobros con Cuenta corriente en el Salón, y las transacciones manuales, aparecen acá" />
      ) : (
        <div data-coach-target="cc-lista" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {filtered.map((m, i) => (
            <button key={m.id} onClick={() => setSeleccion(m)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '11px 12px', border: 'none', borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{m.cliente_nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtFechaHora(m.created_at)}{m.descripcion ? ' · ' + m.descripcion : ''}</div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: m.tipo === 'pago' ? '#16a34a' : '#dc2626' }}>
                {m.tipo === 'pago' ? '+' : '−'}{fmt(m.monto)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function NuevaTransaccionCC({ clientes, medios, onClose, onSave }: {
  clientes: ClienteConMetricas[]
  medios: { id: string; nombre: string }[]
  onClose: () => void
  onSave: (datos: { clienteId: string; tipo: TipoMovimientoCC; monto: number; medioPagoId?: string | null; descripcion?: string | null }) => Promise<void>
}) {
  const [clienteId, setClienteId] = useState('')
  const [tipo, setTipo] = useState<TipoMovimientoCC>('pago')
  const [monto, setMonto] = useState('')
  const [medioPagoId, setMedioPagoId] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [saving, setSaving] = useState(false)

  const montoN = parseFloat(monto.replace(',', '.')) || 0
  const canSave = !!clienteId && montoN > 0

  async function handleSave() {
    if (!canSave || saving) return
    setSaving(true)
    try {
      await onSave({ clienteId, tipo, monto: montoN, medioPagoId: medioPagoId || null, descripcion: descripcion.trim() || null })
    } finally { setSaving(false) }
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Nueva transacción</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
        </button>
      </div>
      <select value={clienteId} onChange={e => setClienteId(e.target.value)} style={inputStyle}>
        <option value="">Elegir cliente…</option>
        {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <div className="flex gap-2">
        <button onClick={() => setTipo('pago')} style={{ flex: 1, padding: '9px', borderRadius: 8, border: `1.5px solid ${tipo === 'pago' ? '#16a34a' : 'var(--border)'}`, background: tipo === 'pago' ? 'rgba(22,163,74,.1)' : 'var(--bg)', color: tipo === 'pago' ? '#16a34a' : 'var(--text-2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Pago (cobra deuda)</button>
        <button onClick={() => setTipo('cargo')} style={{ flex: 1, padding: '9px', borderRadius: 8, border: `1.5px solid ${tipo === 'cargo' ? '#dc2626' : 'var(--border)'}`, background: tipo === 'cargo' ? 'rgba(220,38,38,.1)' : 'var(--bg)', color: tipo === 'cargo' ? '#dc2626' : 'var(--text-2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cargo (fía)</button>
      </div>
      <input value={monto} onChange={e => setMonto(e.target.value)} placeholder="Monto" inputMode="decimal" style={inputStyle} />
      {tipo === 'pago' && (
        <select value={medioPagoId} onChange={e => setMedioPagoId(e.target.value)} style={inputStyle}>
          <option value="">Medio de pago (opcional)</option>
          {medios.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
      )}
      <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Descripción (opcional)" style={inputStyle} />
      <button onClick={handleSave} disabled={!canSave || saving}
        style={{ padding: '10px', borderRadius: 8, border: 'none', background: canSave ? 'var(--navy)' : 'var(--border)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: canSave ? 'pointer' : 'default', fontFamily: 'inherit', opacity: saving ? .6 : 1 }}>
        {saving ? 'Guardando…' : 'Registrar'}
      </button>
    </div>
  )
}
