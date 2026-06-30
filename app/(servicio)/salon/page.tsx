'use client'

import { useState, useMemo } from 'react'
import { useMesas } from '@/lib/hooks/useMesas'
import { useCarta } from '@/lib/hooks/useCarta'
import { useComandas, type NuevoComandaItem } from '@/lib/hooks/useComandas'
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus'
import type { Mesa, CartaItem, EstadoMesa, TipoModificador, Comanda, EstadoComandaItem } from '@/types'

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

interface DraftItem {
  key: string
  carta_item_id: string
  nombre: string
  cantidad: number
  estacion_default_id?: string | null
  notas: string
  modificadores: { tipo: TipoModificador; texto: string }[]
}

const ESTADO_MESA_COLOR: Record<EstadoMesa, string> = {
  libre: '#2a2a2a',
  ocupada: '#4361a0',
  cuenta_pedida: '#a04343',
}

function MesaBoton({ mesa, onTap }: { mesa: Mesa; onTap: (mesa: Mesa) => void }) {
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
        border: '2px solid rgba(255,255,255,0.15)',
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
    </button>
  )
}

function CartaItemBoton({ item, onTap }: { item: CartaItem; onTap: (item: CartaItem) => void }) {
  return (
    <button
      onClick={() => onTap(item)}
      disabled={!item.disponible}
      style={{
        width: '100%',
        minHeight: 64,
        padding: '10px 16px',
        borderRadius: 12,
        background: '#1a1a1a',
        border: '1px solid #2a2a2a',
        color: item.disponible ? '#fff' : '#666',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        textAlign: 'left',
        gap: 12,
      }}
    >
      <span style={{ fontSize: 18, fontWeight: 600 }}>{item.nombre}</span>
      <span style={{ fontSize: 16, opacity: 0.7, flexShrink: 0 }}>
        {item.disponible ? `$${item.precio_venta}` : '86'}
      </span>
    </button>
  )
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
      {item.notas && <span style={{ fontSize: 14, opacity: 0.75, fontStyle: 'italic' }}>“{item.notas}”</span>}
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
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
            <button onClick={() => setCantidad(c => Math.max(1, c - 1))} style={{ width: 56, height: 56, borderRadius: 12, background: '#2a2a2a', color: '#fff', fontSize: 28 }}>−</button>
            <span style={{ fontSize: 28, fontWeight: 700, color: '#fff', minWidth: 40, textAlign: 'center' }}>{cantidad}</span>
            <button onClick={() => setCantidad(c => c + 1)} style={{ width: 56, height: 56, borderRadius: 12, background: '#2a2a2a', color: '#fff', fontSize: 28 }}>+</button>
          </div>

          <div>
            <p style={{ fontSize: 14, opacity: 0.7, color: '#fff', marginBottom: 8 }}>Modificador</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {(['con', 'sin', 'extra'] as TipoModificador[]).map(t => (
                <button
                  key={t}
                  onClick={() => setModTipo(t)}
                  style={{
                    flex: 1, minHeight: 44, borderRadius: 10,
                    background: modTipo === t ? '#4361a0' : '#2a2a2a',
                    color: '#fff', fontSize: 16, textTransform: 'capitalize',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={modTexto}
                onChange={e => setModTexto(e.target.value)}
                placeholder="ej. cebolla"
                style={{ flex: 1, minHeight: 44, borderRadius: 10, background: '#2a2a2a', color: '#fff', border: 'none', padding: '0 12px', fontSize: 16 }}
              />
              <button onClick={agregarModificador} style={{ minWidth: 56, minHeight: 44, borderRadius: 10, background: '#2a2a2a', color: '#fff' }}>
                <span className="material-symbols-outlined">add</span>
              </button>
            </div>
            {modificadores.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {modificadores.map((m, i) => (
                  <span key={i} style={{ fontSize: 14, color: '#fff', background: '#2a2a2a', borderRadius: 8, padding: '6px 10px' }}>
                    {m.tipo} {m.texto}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <p style={{ fontSize: 14, opacity: 0.7, color: '#fff', marginBottom: 8 }}>Nota</p>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="ej. a punto, sin sal"
              rows={2}
              style={{ width: '100%', borderRadius: 10, background: '#2a2a2a', color: '#fff', border: 'none', padding: 12, fontSize: 16, resize: 'none' }}
            />
          </div>
        </div>
        <div style={{ padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', display: 'flex', gap: 12, flexShrink: 0 }}>
          <button onClick={onCancelar} style={{ flex: 1, minHeight: 56, borderRadius: 12, background: '#2a2a2a', color: '#fff', fontSize: 18 }}>Cancelar</button>
          <button
            onClick={() => onAgregar({ cantidad, notas: notas.trim(), modificadores })}
            style={{ flex: 2, minHeight: 56, borderRadius: 12, background: '#4361a0', color: '#fff', fontSize: 18, fontWeight: 700 }}
          >
            Agregar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SalonPage() {
  const { mesas, loading: loadingMesas, abrirCuenta } = useMesas()
  const { items: cartaItems, loading: loadingCarta } = useCarta()
  const { comandas, crearComanda, agregarItems, enviarComanda } = useComandas()
  const online = useOnlineStatus()

  const [mesaActiva, setMesaActiva] = useState<Mesa | null>(null)
  const [cuentaId, setCuentaId] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [itemParaAgregar, setItemParaAgregar] = useState<CartaItem | null>(null)
  const [draft, setDraft] = useState<DraftItem[]>([])
  const [enviando, setEnviando] = useState(false)

  const itemsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return cartaItems
    return cartaItems.filter(i => i.nombre.toLowerCase().includes(q))
  }, [cartaItems, busqueda])

  const comandasMesaActiva = useMemo(() => {
    if (!mesaActiva) return []
    return comandas.filter(c => c.mesa_id === mesaActiva.id && (c.items?.length ?? 0) > 0)
  }, [comandas, mesaActiva])

  async function onTapMesa(mesa: Mesa) {
    try {
      const id = await abrirCuenta(mesa.id)
      setCuentaId(id)
      setMesaActiva(mesa)
      setDraft([])
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al abrir la mesa')
    }
  }

  function volverAlMapa() {
    setMesaActiva(null)
    setCuentaId(null)
    setDraft([])
    setBusqueda('')
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

  function onQuitarDraft(key: string) {
    setDraft(prev => prev.filter(d => d.key !== key))
  }

  async function onEnviar() {
    if (!cuentaId || !mesaActiva || draft.length === 0) return
    if (!online) {
      alert('Sin conexión: no se pueden crear comandas nuevas. Esperá a reconectar.')
      return
    }
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
      volverAlMapa()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al enviar la comanda')
    } finally {
      setEnviando(false)
    }
  }

  if (loadingMesas) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
        Cargando mesas...
      </div>
    )
  }

  if (!mesaActiva) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '46px 16px 14px', flexShrink: 0 }}>
          <p style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>Salón</p>
        </div>
        {mesas.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
            No hay mesas cargadas todavía
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'auto', position: 'relative', minHeight: 600 }}>
            {mesas.map(m => <MesaBoton key={m.id} mesa={m} onTap={onTapMesa} />)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '46px 16px 14px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={volverAlMapa} style={{ minWidth: 44, minHeight: 44, color: '#fff', background: 'transparent', border: 'none' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 28 }}>arrow_back</span>
        </button>
        <p style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>Mesa {mesaActiva.numero}</p>
      </div>

      <PedidoEnCursoPanel comandas={comandasMesaActiva} />

      <div style={{ padding: '0 16px 12px', flexShrink: 0 }}>
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar en la carta..."
          style={{ width: '100%', minHeight: 52, borderRadius: 12, background: '#1a1a1a', color: '#fff', border: '1px solid #2a2a2a', padding: '0 16px', fontSize: 18 }}
        />
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
          {draft.map(d => <DraftItemRow key={d.key} item={d} onQuitar={onQuitarDraft} />)}
        </div>
      )}

      <div style={{ padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', flexShrink: 0 }}>
        <button
          onClick={onEnviar}
          disabled={draft.length === 0 || enviando || !online}
          style={{
            width: '100%', minHeight: 64, borderRadius: 14, fontSize: 20, fontWeight: 700,
            background: draft.length === 0 || !online ? '#2a2a2a' : '#4361a0',
            color: '#fff', opacity: enviando ? 0.6 : 1,
          }}
        >
          {!online ? 'Sin conexión' : enviando ? 'Enviando...' : `Enviar comanda${draft.length ? ` (${draft.length})` : ''}`}
        </button>
      </div>

      {itemParaAgregar && (
        <AgregarItemSheet
          item={itemParaAgregar}
          onCancelar={() => setItemParaAgregar(null)}
          onAgregar={onAgregarDraft}
        />
      )}
    </div>
  )
}
