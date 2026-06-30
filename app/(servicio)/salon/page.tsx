'use client'

import { useState, useMemo } from 'react'
import { useMesas } from '@/lib/hooks/useMesas'
import { useCarta } from '@/lib/hooks/useCarta'
import { useComandas, type NuevoComandaItem } from '@/lib/hooks/useComandas'
import { useCuenta, calcularResumen, type PagoInput } from '@/lib/hooks/useCuenta'
import { useMediosPago } from '@/lib/hooks/useMediosPago'
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus'
import type { Mesa, CartaItem, EstadoMesa, TipoModificador, Comanda, EstadoComandaItem } from '@/types'

// ─── helpers visuales ─────────────────────────────────────────────────────────

const ESTADO_ITEM_LABEL: Record<EstadoComandaItem, string> = {
  pendiente: 'Pendiente',
  en_prep: 'En cocina',
  listo: 'Listo',
  bumpeado: 'Servido',
}

const ESTADO_ITEM_COLOR: Record<EstadoComandaItem, string> = {
  pendiente: '#666',
  en_prep: '#a07a20',
  listo: '#2e7d32',
  bumpeado: '#444',
}

const ESTADO_MESA_COLOR: Record<EstadoMesa, string> = {
  libre: '#2a2a2a',
  ocupada: '#4361a0',
  cuenta_pedida: '#a04343',
}

function formatPesos(n: number) {
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

// ─── sub-componentes (nivel módulo) ──────────────────────────────────────────

function PedidoEnCursoPanel({ comandas }: { comandas: Comanda[] }) {
  if (comandas.length === 0) return null
  return (
    <div style={{ flexShrink: 0, padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 14, opacity: 0.7, color: '#fff' }}>Pedido en curso</p>
      {comandas.map(c => (
        <div key={c.id} style={{ background: '#1a1a1a', borderRadius: 12, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(c.items ?? []).map(item => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 16, color: '#fff' }}>{item.cantidad}× {item.carta_item?.nombre ?? 'Ítem'}</span>
              <span style={{ fontSize: 13, color: ESTADO_ITEM_COLOR[item.estado], fontWeight: 700 }}>{ESTADO_ITEM_LABEL[item.estado]}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function MesaBoton({ mesa, hayListos, onTap }: { mesa: Mesa; hayListos: boolean; onTap: (mesa: Mesa) => void }) {
  return (
    <button
      onClick={() => onTap(mesa)}
      style={{
        position: 'absolute',
        left: `${mesa.pos_x}%`,
        top: `${mesa.pos_y}%`,
        width: 72,
        height: 72,
        borderRadius: 16,
        background: ESTADO_MESA_COLOR[mesa.estado],
        border: `2px solid ${hayListos ? '#2e7d32' : 'rgba(255,255,255,0.15)'}`,
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}
    >
      <span style={{ fontSize: 22, fontWeight: 700 }}>{mesa.numero}</span>
      <span style={{ fontSize: 12, opacity: 0.8 }}>{mesa.capacidad ?? '-'}p</span>
      {hayListos && (
        <span style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%', background: '#2e7d32', border: '2px solid #111' }} />
      )}
    </button>
  )
}

function CartaItemBoton({ item, onTap }: { item: CartaItem; onTap: (item: CartaItem) => void }) {
  return (
    <button
      onClick={() => onTap(item)}
      disabled={!item.disponible}
      style={{
        width: '100%', minHeight: 64, padding: '10px 16px', borderRadius: 12,
        background: '#1a1a1a', border: '1px solid #2a2a2a',
        color: item.disponible ? '#fff' : '#666',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', gap: 12,
      }}
    >
      <span style={{ fontSize: 18, fontWeight: 600 }}>{item.nombre}</span>
      <span style={{ fontSize: 16, opacity: 0.7, flexShrink: 0 }}>
        {item.disponible ? formatPesos(item.precio_venta ?? 0) : '86'}
      </span>
    </button>
  )
}

interface DraftItem {
  key: string
  carta_item_id: string
  nombre: string
  cantidad: number
  estacion_default_id?: string | null
  notas: string
  modificadores: { tipo: TipoModificador; texto: string }[]
}

function DraftItemRow({ item, onQuitar }: { item: DraftItem; onQuitar: (key: string) => void }) {
  return (
    <div style={{ background: '#1a1a1a', borderRadius: 12, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 18, fontWeight: 600 }}>{item.cantidad}× {item.nombre}</span>
        <button onClick={() => onQuitar(item.key)} style={{ minWidth: 44, minHeight: 44, color: '#a04343', background: 'transparent', border: 'none' }}>
          <span className="material-symbols-outlined">delete</span>
        </button>
      </div>
      {item.modificadores.map((m, i) => (
        <span key={i} style={{ fontSize: 14, opacity: 0.75 }}>
          {m.tipo === 'con' ? 'Con' : m.tipo === 'sin' ? 'Sin' : 'Extra'} {m.texto}
        </span>
      ))}
      {item.notas && <span style={{ fontSize: 14, opacity: 0.75, fontStyle: 'italic' }}>"{item.notas}"</span>}
    </div>
  )
}

function AgregarItemSheet({
  item, onCancelar, onAgregar,
}: {
  item: CartaItem
  onCancelar: () => void
  onAgregar: (draft: Omit<DraftItem, 'key' | 'carta_item_id' | 'nombre' | 'estacion_default_id'>) => void
}) {
  const [cantidad, setCantidad] = useState(1)
  const [notas, setNotas] = useState('')
  const [modTipo, setModTipo] = useState<TipoModificador>('sin')
  const [modTexto, setModTexto] = useState('')
  const [modificadores, setModificadores] = useState<{ tipo: TipoModificador; texto: string }[]>([])

  function agregarModificador() {
    if (!modTexto.trim()) return
    setModificadores(prev => [...prev, { tipo: modTipo, texto: modTexto.trim() }])
    setModTexto('')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: '#161616', width: '100%', maxHeight: '85vh', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 16px 0', flexShrink: 0 }}>
          <p style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{item.nombre}</p>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
            <button onClick={() => setCantidad(c => Math.max(1, c - 1))} style={{ width: 56, height: 56, borderRadius: 12, background: '#2a2a2a', color: '#fff', fontSize: 28 }}>−</button>
            <span style={{ fontSize: 28, fontWeight: 700, color: '#fff', minWidth: 40, textAlign: 'center' }}>{cantidad}</span>
            <button onClick={() => setCantidad(c => c + 1)} style={{ width: 56, height: 56, borderRadius: 12, background: '#2a2a2a', color: '#fff', fontSize: 28 }}>+</button>
          </div>
          <div>
            <p style={{ fontSize: 14, opacity: 0.7, color: '#fff', marginBottom: 8 }}>Modificador</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {(['con', 'sin', 'extra'] as TipoModificador[]).map(t => (
                <button key={t} onClick={() => setModTipo(t)} style={{ flex: 1, minHeight: 44, borderRadius: 10, background: modTipo === t ? '#4361a0' : '#2a2a2a', color: '#fff', fontSize: 16, textTransform: 'capitalize' }}>
                  {t}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={modTexto} onChange={e => setModTexto(e.target.value)} placeholder="ej. cebolla"
                style={{ flex: 1, minHeight: 44, borderRadius: 10, background: '#2a2a2a', color: '#fff', border: 'none', padding: '0 12px', fontSize: 16 }} />
              <button onClick={agregarModificador} style={{ minWidth: 56, minHeight: 44, borderRadius: 10, background: '#2a2a2a', color: '#fff' }}>
                <span className="material-symbols-outlined">add</span>
              </button>
            </div>
            {modificadores.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {modificadores.map((m, i) => (
                  <span key={i} style={{ fontSize: 14, color: '#fff', background: '#2a2a2a', borderRadius: 8, padding: '6px 10px' }}>{m.tipo} {m.texto}</span>
                ))}
              </div>
            )}
          </div>
          <div>
            <p style={{ fontSize: 14, opacity: 0.7, color: '#fff', marginBottom: 8 }}>Nota</p>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="ej. a punto, sin sal" rows={2}
              style={{ width: '100%', borderRadius: 10, background: '#2a2a2a', color: '#fff', border: 'none', padding: 12, fontSize: 16, resize: 'none' }} />
          </div>
        </div>
        <div style={{ padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', display: 'flex', gap: 12, flexShrink: 0 }}>
          <button onClick={onCancelar} style={{ flex: 1, minHeight: 56, borderRadius: 12, background: '#2a2a2a', color: '#fff', fontSize: 18 }}>Cancelar</button>
          <button onClick={() => onAgregar({ cantidad, notas: notas.trim(), modificadores })}
            style={{ flex: 2, minHeight: 56, borderRadius: 12, background: '#4361a0', color: '#fff', fontSize: 18, fontWeight: 700 }}>
            Agregar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Vista de Cuenta ──────────────────────────────────────────────────────────

const PROPINA_PRESETS = [0, 10, 15, 20]

function VistaCuenta({
  mesa, cuentaId, comandas, onVolver, onCobrado,
}: {
  mesa: Mesa
  cuentaId: string
  comandas: Comanda[]
  onVolver: () => void
  onCobrado: () => void
}) {
  const { cobrarCuenta } = useCuenta()
  const { medios } = useMediosPago()

  const resumen = useMemo(() => calcularResumen(comandas), [comandas])

  const [propinaPct, setPropinaPct] = useState(10)
  const [propinaCustom, setPropinaCustom] = useState('')
  const [divisiones, setDivisiones] = useState(1)
  const [medioId, setMedioId] = useState<string | null>(null)
  const [cobrando, setCobrando] = useState(false)
  const [vista, setVista] = useState<'cuenta' | 'cobro'>('cuenta')

  const propinaMonto = useMemo(() => {
    if (propinaCustom !== '') return Number(propinaCustom) || 0
    return Math.round(resumen.subtotal * propinaPct / 100)
  }, [resumen.subtotal, propinaPct, propinaCustom])

  const total = resumen.subtotal + propinaMonto
  const porPersona = divisiones > 1 ? total / divisiones : null

  async function onCobrar() {
    if (!medioId) { alert('Elegí un medio de pago'); return }
    setCobrando(true)
    try {
      const pagos: PagoInput[] = [{ medio_id: medioId, monto: total }]
      await cobrarCuenta({ cuentaId, mesaId: mesa.id, pagos, propina: propinaMonto, total: resumen.subtotal })
      onCobrado()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al cobrar')
    } finally {
      setCobrando(false)
    }
  }

  if (vista === 'cobro') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '46px 16px 14px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setVista('cuenta')} style={{ minWidth: 44, minHeight: 44, color: '#fff', background: 'transparent', border: 'none' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28 }}>arrow_back</span>
          </button>
          <p style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>Cobrar — Mesa {mesa.numero}</p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
          {/* Totales */}
          <div style={{ background: '#1a1a1a', borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: '#aaa' }}>Subtotal</span>
              <span style={{ color: '#fff', fontWeight: 600 }}>{formatPesos(resumen.subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: '#aaa' }}>Propina ({propinaPct}%)</span>
              <span style={{ color: '#fff', fontWeight: 600 }}>{formatPesos(propinaMonto)}</span>
            </div>
            <div style={{ height: 1, background: '#333', margin: '8px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>Total</span>
              <span style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>{formatPesos(total)}</span>
            </div>
            {porPersona && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ color: '#aaa' }}>Por persona ({divisiones})</span>
                <span style={{ color: '#c9a227', fontWeight: 700 }}>{formatPesos(porPersona)}</span>
              </div>
            )}
          </div>

          {/* Medio de pago */}
          <p style={{ color: '#aaa', fontSize: 14, marginBottom: 10 }}>Medio de pago</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {medios.length === 0
              ? <p style={{ color: '#666' }}>No hay medios de pago configurados</p>
              : medios.map(m => (
                <button key={m.id} onClick={() => setMedioId(m.id)}
                  style={{ minHeight: 60, borderRadius: 12, background: medioId === m.id ? '#4361a0' : '#1a1a1a', border: `2px solid ${medioId === m.id ? '#4361a0' : '#2a2a2a'}`, color: '#fff', fontSize: 18, fontWeight: 600 }}>
                  {m.nombre}
                </button>
              ))
            }
          </div>
        </div>

        <div style={{ padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', flexShrink: 0 }}>
          <button onClick={onCobrar} disabled={cobrando || !medioId}
            style={{ width: '100%', minHeight: 68, borderRadius: 14, background: medioId ? '#2e7d32' : '#2a2a2a', color: '#fff', fontSize: 22, fontWeight: 800, opacity: cobrando ? 0.6 : 1 }}>
            {cobrando ? 'Registrando...' : `Cobrar ${formatPesos(total)}`}
          </button>
        </div>
      </div>
    )
  }

  // Vista cuenta (detalle de ítems + propina + división)
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '46px 16px 14px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onVolver} style={{ minWidth: 44, minHeight: 44, color: '#fff', background: 'transparent', border: 'none' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 28 }}>arrow_back</span>
        </button>
        <p style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>Cuenta — Mesa {mesa.numero}</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Líneas de la cuenta */}
        <div style={{ background: '#1a1a1a', borderRadius: 14, overflow: 'hidden' }}>
          {resumen.lineas.length === 0
            ? <p style={{ color: '#666', padding: 16 }}>Sin ítems aún</p>
            : resumen.lineas.map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: i < resumen.lineas.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
                <span style={{ color: '#fff', fontSize: 16 }}>{l.cantidad}× {l.nombre}</span>
                <span style={{ color: '#aaa', fontSize: 15 }}>{formatPesos(l.subtotal)}</span>
              </div>
            ))
          }
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #333', background: '#222' }}>
            <span style={{ color: '#fff', fontWeight: 700 }}>Subtotal</span>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>{formatPesos(resumen.subtotal)}</span>
          </div>
        </div>

        {/* Propina */}
        <div style={{ background: '#1a1a1a', borderRadius: 14, padding: 16 }}>
          <p style={{ color: '#aaa', fontSize: 14, marginBottom: 12 }}>Propina</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: propinaCustom !== '' ? 0 : 8 }}>
            {PROPINA_PRESETS.map(pct => (
              <button key={pct} onClick={() => { setPropinaPct(pct); setPropinaCustom('') }}
                style={{ flex: 1, minHeight: 48, borderRadius: 10, background: propinaPct === pct && propinaCustom === '' ? '#4361a0' : '#2a2a2a', color: '#fff', fontSize: 15, fontWeight: 600 }}>
                {pct === 0 ? 'Sin propina' : `${pct}%`}
              </button>
            ))}
          </div>
          {propinaCustom !== '' && (
            <p style={{ color: '#aaa', fontSize: 13, marginTop: 4 }}>Monto personalizado</p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              value={propinaCustom}
              onChange={e => { setPropinaCustom(e.target.value); if (e.target.value) setPropinaPct(-1) }}
              placeholder="$ Monto personalizado"
              type="number"
              style={{ flex: 1, minHeight: 44, borderRadius: 10, background: '#2a2a2a', color: '#fff', border: propinaCustom ? '1px solid #4361a0' : 'none', padding: '0 12px', fontSize: 16 }}
            />
          </div>
          {propinaMonto > 0 && (
            <p style={{ color: '#c9a227', fontSize: 15, marginTop: 8, textAlign: 'right', fontWeight: 600 }}>+ {formatPesos(propinaMonto)}</p>
          )}
        </div>

        {/* División */}
        <div style={{ background: '#1a1a1a', borderRadius: 14, padding: 16 }}>
          <p style={{ color: '#aaa', fontSize: 14, marginBottom: 12 }}>Dividir entre</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, justifyContent: 'center' }}>
            <button onClick={() => setDivisiones(d => Math.max(1, d - 1))}
              style={{ width: 52, height: 52, borderRadius: 12, background: '#2a2a2a', color: '#fff', fontSize: 28 }}>−</button>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 32, fontWeight: 800, color: '#fff' }}>{divisiones}</p>
              <p style={{ fontSize: 13, color: '#aaa' }}>{divisiones === 1 ? 'persona' : 'personas'}</p>
            </div>
            <button onClick={() => setDivisiones(d => d + 1)}
              style={{ width: 52, height: 52, borderRadius: 12, background: '#2a2a2a', color: '#fff', fontSize: 28 }}>+</button>
          </div>
          {divisiones > 1 && (
            <p style={{ color: '#c9a227', textAlign: 'center', fontSize: 18, fontWeight: 700, marginTop: 12 }}>
              {formatPesos(total / divisiones)} por persona
            </p>
          )}
        </div>

        {/* Total */}
        <div style={{ background: '#222', borderRadius: 14, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>Total</span>
          <span style={{ color: '#fff', fontSize: 26, fontWeight: 800 }}>{formatPesos(total)}</span>
        </div>

        <div style={{ height: 16 }} />
      </div>

      <div style={{ padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', flexShrink: 0 }}>
        <button onClick={() => setVista('cobro')}
          style={{ width: '100%', minHeight: 68, borderRadius: 14, background: '#4361a0', color: '#fff', fontSize: 22, fontWeight: 800 }}>
          <span className="material-symbols-outlined" style={{ verticalAlign: 'middle', marginRight: 8 }}>payment</span>
          Cobrar {formatPesos(total)}
        </button>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

type Vista = 'mapa' | 'mesa' | 'cuenta'

export default function SalonPage() {
  const { mesas, loading: loadingMesas, abrirCuenta, liberarMesa } = useMesas()
  const { items: cartaItems, loading: loadingCarta } = useCarta()
  const { comandas, crearComanda, agregarItems, enviarComanda } = useComandas()
  const { pedirCuenta } = useCuenta()
  const online = useOnlineStatus()

  const [vista, setVista] = useState<Vista>('mapa')
  const [mesaActiva, setMesaActiva] = useState<Mesa | null>(null)
  const [cuentaId, setCuentaId] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [itemParaAgregar, setItemParaAgregar] = useState<CartaItem | null>(null)
  const [draft, setDraft] = useState<DraftItem[]>([])
  const [enviando, setEnviando] = useState(false)
  const [pidiendoCuenta, setPidiendoCuenta] = useState(false)

  const itemsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return cartaItems
    return cartaItems.filter(i => i.nombre.toLowerCase().includes(q))
  }, [cartaItems, busqueda])

  const comandasMesaActiva = useMemo(() => {
    if (!mesaActiva) return []
    return comandas.filter(c => c.mesa_id === mesaActiva.id && (c.items?.length ?? 0) > 0)
  }, [comandas, mesaActiva])

  // Para cada mesa: tiene algún ítem en estado 'listo' que no está bumpeado
  const mesasConListos = useMemo(() => {
    const set = new Set<string>()
    for (const c of comandas) {
      if (!c.mesa_id) continue
      const hayListos = (c.items ?? []).some(i => i.estado === 'listo')
      if (hayListos) set.add(c.mesa_id)
    }
    return set
  }, [comandas])

  async function onTapMesa(mesa: Mesa) {
    try {
      const id = await abrirCuenta(mesa.id)
      setCuentaId(id)
      setMesaActiva(mesa)
      setDraft([])
      setVista('mesa')
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al abrir la mesa')
    }
  }

  function volverAlMapa() {
    setMesaActiva(null)
    setCuentaId(null)
    setDraft([])
    setBusqueda('')
    setVista('mapa')
  }

  function onAgregarDraft(parcial: Omit<DraftItem, 'key' | 'carta_item_id' | 'nombre' | 'estacion_default_id'>) {
    if (!itemParaAgregar) return
    setDraft(prev => [...prev, {
      key: `${itemParaAgregar.id}-${Date.now()}`,
      carta_item_id: itemParaAgregar.id,
      nombre: itemParaAgregar.nombre,
      estacion_default_id: itemParaAgregar.estacion_default_id ?? null,
      ...parcial,
    }])
    setItemParaAgregar(null)
  }

  async function onEnviar() {
    if (!cuentaId || !mesaActiva || draft.length === 0) return
    if (!online) { alert('Sin conexión: no se pueden crear comandas nuevas. Esperá a reconectar.'); return }
    setEnviando(true)
    try {
      const comandaId = await crearComanda({ origen: 'salon', mesa_id: mesaActiva.id, cuenta_id: cuentaId })
      const items: NuevoComandaItem[] = draft.map(d => ({
        carta_item_id: d.carta_item_id,
        cantidad: d.cantidad,
        estacion_id: d.estacion_default_id,
        notas: d.notas || null,
        modificadores: d.modificadores,
      }))
      await agregarItems(comandaId, items)
      await enviarComanda(comandaId)
      setDraft([])
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al enviar la comanda')
    } finally {
      setEnviando(false)
    }
  }

  async function onPedirCuenta() {
    if (!mesaActiva) return
    setPidiendoCuenta(true)
    try {
      await pedirCuenta(mesaActiva.id)
      setMesaActiva(prev => prev ? { ...prev, estado: 'cuenta_pedida' } : prev)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error')
    } finally {
      setPidiendoCuenta(false)
    }
  }

  async function onCobrado() {
    if (mesaActiva) await liberarMesa(mesaActiva.id).catch(() => {})
    volverAlMapa()
  }

  // ── Mapa ──────────────────────────────────────────────────────────────────

  if (loadingMesas) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>Cargando mesas...</div>
  }

  if (vista === 'mapa') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '46px 16px 14px', flexShrink: 0 }}>
          <p style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>Salón</p>
        </div>
        {mesas.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>No hay mesas cargadas</div>
        ) : (
          <div style={{ flex: 1, overflow: 'auto', position: 'relative', minHeight: 600 }}>
            {mesas.map(m => (
              <MesaBoton key={m.id} mesa={m} hayListos={mesasConListos.has(m.id)} onTap={onTapMesa} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Vista cuenta ──────────────────────────────────────────────────────────

  if (vista === 'cuenta' && mesaActiva && cuentaId) {
    return (
      <VistaCuenta
        mesa={mesaActiva}
        cuentaId={cuentaId}
        comandas={comandasMesaActiva}
        onVolver={() => setVista('mesa')}
        onCobrado={onCobrado}
      />
    )
  }

  // ── Vista mesa ────────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '46px 16px 14px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={volverAlMapa} style={{ minWidth: 44, minHeight: 44, color: '#fff', background: 'transparent', border: 'none' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 28 }}>arrow_back</span>
        </button>
        <p style={{ fontSize: 22, fontWeight: 700, color: '#fff', flex: 1 }}>Mesa {mesaActiva?.numero}</p>
        {/* Botón Ver cuenta */}
        {comandasMesaActiva.length > 0 && (
          <button onClick={() => setVista('cuenta')}
            style={{ minHeight: 44, padding: '0 14px', borderRadius: 10, background: '#2a2a2a', color: '#fff', fontSize: 14, fontWeight: 600 }}>
            <span className="material-symbols-outlined" style={{ verticalAlign: 'middle', marginRight: 4, fontSize: 18 }}>receipt_long</span>
            Ver cuenta
          </button>
        )}
        {/* Botón Pedir cuenta */}
        {mesaActiva?.estado === 'ocupada' && comandasMesaActiva.length > 0 && (
          <button onClick={onPedirCuenta} disabled={pidiendoCuenta}
            style={{ minHeight: 44, padding: '0 14px', borderRadius: 10, background: '#a04343', color: '#fff', fontSize: 14, fontWeight: 600 }}>
            {pidiendoCuenta ? '...' : 'Pedir cuenta'}
          </button>
        )}
      </div>

      <PedidoEnCursoPanel comandas={comandasMesaActiva} />

      <div style={{ padding: '0 16px 12px', flexShrink: 0 }}>
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar en la carta..."
          style={{ width: '100%', minHeight: 52, borderRadius: 12, background: '#1a1a1a', color: '#fff', border: '1px solid #2a2a2a', padding: '0 16px', fontSize: 18 }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loadingCarta ? (
          <p style={{ color: '#666' }}>Cargando carta...</p>
        ) : (
          itemsFiltrados.map(item => <CartaItemBoton key={item.id} item={item} onTap={setItemParaAgregar} />)
        )}
      </div>

      {draft.length > 0 && (
        <div style={{ flexShrink: 0, maxHeight: '35vh', overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #2a2a2a' }}>
          {draft.map(d => <DraftItemRow key={d.key} item={d} onQuitar={key => setDraft(prev => prev.filter(x => x.key !== key))} />)}
        </div>
      )}

      <div style={{ padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', flexShrink: 0 }}>
        <button onClick={onEnviar} disabled={draft.length === 0 || enviando || !online}
          style={{ width: '100%', minHeight: 64, borderRadius: 14, fontSize: 20, fontWeight: 700, background: draft.length === 0 || !online ? '#2a2a2a' : '#4361a0', color: '#fff', opacity: enviando ? 0.6 : 1 }}>
          {!online ? 'Sin conexión' : enviando ? 'Enviando...' : `Enviar comanda${draft.length ? ` (${draft.length})` : ''}`}
        </button>
      </div>

      {itemParaAgregar && (
        <AgregarItemSheet item={itemParaAgregar} onCancelar={() => setItemParaAgregar(null)} onAgregar={onAgregarDraft} />
      )}
    </div>
  )
}
