'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMesas } from '@/lib/hooks/useMesas'
import { useCarta } from '@/lib/hooks/useCarta'
import { useComandas, type NuevoComandaItem } from '@/lib/hooks/useComandas'
import { useCuenta, calcularResumen, type PagoInput, type ResultadoFiscal } from '@/lib/hooks/useCuenta'
import { useMediosPago } from '@/lib/hooks/useMediosPago'
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { createClient } from '@/lib/supabase/client'
import { fetchEscPosBytes, printViaUSB, printViaBluetooth, downloadEscPosBytes, supportsWebUSB, supportsWebBluetooth } from '@/lib/print/escpos'
import VistaCaja from '@/components/salon/VistaCaja'
import KitchenCoachFAB from '@/components/coach/KitchenCoachFAB'
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
  const anchoUi = Math.max(mesa.ancho ?? 9, 6)
  const altoUi = Math.max(mesa.alto ?? 9, 6)
  const forma = mesa.forma ?? 'cuadrada'
  const rotacion = mesa.rotacion ?? 0
  return (
    <button
      onClick={() => onTap(mesa)}
      style={{
        position: 'absolute',
        left: `${mesa.pos_x}%`,
        top: `${mesa.pos_y}%`,
        width: `${anchoUi}%`,
        aspectRatio: forma === 'rectangular' ? `${anchoUi} / ${altoUi}` : '1 / 1',
        minWidth: 64,
        minHeight: 64,
        borderRadius: forma === 'redonda' ? '50%' : 16,
        transform: `rotate(${rotacion}deg)`,
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
      <span style={{ fontSize: 22, fontWeight: 700, transform: `rotate(${-rotacion}deg)` }}>{mesa.numero}</span>
      <span style={{ fontSize: 12, opacity: 0.8, transform: `rotate(${-rotacion}deg)` }}>{mesa.capacidad ?? '-'}p</span>
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

// ── interfaces internas de cobro ──────────────────────────────────────────────

interface LineaPago {
  id: string         // clave local
  medio_id: string
  monto: string      // string para el input
}

// ── Ticket post-cobro ────────────────────────────────────────────────────────

function TicketCobro({
  mesa, resumenLineas, subtotal, propinaMonto, total, pagos, vuelto, fiscal, onVolver,
}: {
  mesa: Mesa
  resumenLineas: { nombre: string; cantidad: number; subtotal: number }[]
  subtotal: number
  propinaMonto: number
  total: number
  pagos: { nombre: string; monto: number }[]
  vuelto: number
  fiscal?: ResultadoFiscal
  onVolver: () => void
}) {
  const hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  const RESTAURANTE_ID = useRestauranteId()
  const [nombreLocal, setNombreLocal] = useState('KitchenOS')
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const supabase = createClient()
    supabase.from('restaurantes').select('nombre').eq('id', RESTAURANTE_ID).maybeSingle()
      .then(({ data }) => { if (data?.nombre) setNombreLocal(data.nombre) })
  }, [RESTAURANTE_ID])

  const [printing, setPrinting] = useState(false)
  const [printError, setPrintError] = useState<string | null>(null)
  const supportsUSB = supportsWebUSB()
  const supportsBT  = supportsWebBluetooth()

  function ticketPayload() {
    return {
      mode: 'generate', tipo: 'cliente',
      data: {
        nombreLocal,
        mesa: String(mesa.numero),
        items: resumenLineas.map(l => ({
          nombre: l.nombre, cantidad: l.cantidad,
          precio: l.cantidad > 0 ? l.subtotal / l.cantidad : 0,
        })),
        subtotal, propina: propinaMonto, total, pagos, vuelto,
        ...(fiscal?.cae ? {
          cae: fiscal.cae,
          ...(fiscal.cae_vencimiento ? { caeVto: fiscal.cae_vencimiento } : {}),
          ...(fiscal.numero ? { numeroComprobante: fiscal.numero } : {}),
          ...(fiscal.qr_data ? { qrData: fiscal.qr_data } : {}),
        } : {}),
      },
    }
  }

  async function handlePrint(method: 'usb' | 'bluetooth') {
    setPrinting(true)
    setPrintError(null)
    try {
      const bytes = await fetchEscPosBytes(ticketPayload())
      if (method === 'usb') await printViaUSB(bytes)
      else await printViaBluetooth(bytes)
    } catch (e: unknown) {
      setPrintError(e instanceof Error ? e.message : 'Error al imprimir')
    } finally {
      setPrinting(false)
    }
  }

  async function handleDownload() {
    setPrinting(true)
    setPrintError(null)
    try {
      const bytes = await fetchEscPosBytes(ticketPayload())
      downloadEscPosBytes(bytes, `ticket-mesa-${mesa.numero}.bin`)
    } catch (e: unknown) {
      setPrintError(e instanceof Error ? e.message : 'Error al descargar')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '46px 20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Encabezado */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#2e7d32', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, color: '#fff' }}>check_circle</span>
          </div>
          <p style={{ fontSize: 26, fontWeight: 800, color: '#fff' }}>Cobrado</p>
          <p style={{ color: '#aaa', marginTop: 4 }}>Mesa {mesa.numero} · {hora}</p>
        </div>

        {/* Detalle de ítems */}
        <div style={{ background: '#1a1a1a', borderRadius: 14, overflow: 'hidden' }}>
          {resumenLineas.map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: i < resumenLineas.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
              <span style={{ color: '#aaa' }}>{l.cantidad}× {l.nombre}</span>
              <span style={{ color: '#fff' }}>{formatPesos(l.subtotal)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #333' }}>
            <span style={{ color: '#aaa' }}>Subtotal</span>
            <span style={{ color: '#fff' }}>{formatPesos(subtotal)}</span>
          </div>
          {propinaMonto > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px' }}>
              <span style={{ color: '#aaa' }}>Propina</span>
              <span style={{ color: '#c9a227' }}>{formatPesos(propinaMonto)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#222', borderTop: '1px solid #333' }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>Total</span>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 20 }}>{formatPesos(total)}</span>
          </div>
        </div>

        {/* Pagos registrados */}
        <div style={{ background: '#1a1a1a', borderRadius: 14, overflow: 'hidden' }}>
          <p style={{ color: '#aaa', fontSize: 13, padding: '10px 16px 4px' }}>Pagos</p>
          {pagos.map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #2a2a2a' }}>
              <span style={{ color: '#fff' }}>{p.nombre}</span>
              <span style={{ color: '#fff', fontWeight: 700 }}>{formatPesos(p.monto)}</span>
            </div>
          ))}
          {vuelto > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#1e3320', borderTop: '1px solid #2e7d32' }}>
              <span style={{ color: '#4caf50', fontWeight: 700 }}>Vuelto</span>
              <span style={{ color: '#4caf50', fontWeight: 800, fontSize: 18 }}>{formatPesos(vuelto)}</span>
            </div>
          )}
        </div>

        {/* Comprobante fiscal */}
        {fiscal && fiscal.estado === 'emitido' && fiscal.cae && (
          <div style={{ background: '#1a1a1a', borderRadius: 14, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span className="material-symbols-outlined" style={{ color: '#4caf50', fontSize: 20 }}>verified</span>
              <span style={{ color: '#4caf50', fontWeight: 700, fontSize: 14 }}>Comprobante electrónico emitido</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#aaa', fontSize: 13 }}>CAE</span>
              <span style={{ color: '#fff', fontSize: 13, fontFamily: 'monospace' }}>{fiscal.cae}</span>
            </div>
            {fiscal.numero && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#aaa', fontSize: 13 }}>Nro. comprobante</span>
                <span style={{ color: '#fff', fontSize: 13 }}>{fiscal.numero}</span>
              </div>
            )}
            {fiscal.cae_vencimiento && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: fiscal.qr_data ? 12 : 0 }}>
                <span style={{ color: '#aaa', fontSize: 13 }}>Vto. CAE</span>
                <span style={{ color: '#aaa', fontSize: 13 }}>
                  {`${fiscal.cae_vencimiento.slice(6,8)}/${fiscal.cae_vencimiento.slice(4,6)}/${fiscal.cae_vencimiento.slice(0,4)}`}
                </span>
              </div>
            )}
            {/* QR AFIP */}
            {fiscal.qr_data && (
              <div style={{ textAlign: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(fiscal.qr_data)}`}
                  alt="QR AFIP"
                  width={160}
                  height={160}
                  style={{ display: 'block', margin: '0 auto', borderRadius: 8 }}
                />
                <p style={{ color: '#555', fontSize: 11, marginTop: 6 }}>Escanear para verificar en AFIP</p>
              </div>
            )}
          </div>
        )}

        {fiscal && fiscal.estado === 'pendiente' && (
          <div style={{ background: '#1a1010', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ color: '#e57373', fontSize: 20 }}>warning</span>
            <div>
              <p style={{ color: '#e57373', fontWeight: 600, fontSize: 14 }}>Comprobante fiscal pendiente</p>
              <p style={{ color: '#aaa', fontSize: 12 }}>Se emitirá automáticamente cuando ARCA esté disponible</p>
            </div>
          </div>
        )}

        {/* Imprimir ticket */}
        <div style={{ background: '#1a1a1a', borderRadius: 14, padding: 16 }}>
          <p style={{ color: '#aaa', fontSize: 13, marginBottom: 12 }}>Imprimir ticket</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {supportsUSB && (
              <button onClick={() => { void handlePrint('usb') }} disabled={printing}
                style={{ minHeight: 64, borderRadius: 12, background: '#1c2d4a', border: 'none', color: '#fff', fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: printing ? 0.6 : 1 }}>
                <span className="material-symbols-outlined">print</span>
                {printing ? 'Imprimiendo...' : 'Imprimir por USB'}
              </button>
            )}
            {supportsBT && (
              <button onClick={() => { void handlePrint('bluetooth') }} disabled={printing}
                style={{ minHeight: 64, borderRadius: 12, background: '#1c2d4a', border: 'none', color: '#fff', fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: printing ? 0.6 : 1 }}>
                <span className="material-symbols-outlined">bluetooth</span>
                {printing ? 'Conectando...' : 'Imprimir por Bluetooth'}
              </button>
            )}
            <button onClick={() => { void handleDownload() }} disabled={printing}
              style={{ minHeight: 64, borderRadius: 12, background: '#2a2a2a', border: 'none', color: '#fff', fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: printing ? 0.6 : 1 }}>
              <span className="material-symbols-outlined">download</span>
              Descargar .bin
            </button>
          </div>
          {printError && <p style={{ color: '#e57373', fontSize: 13, marginTop: 10 }}>{printError}</p>}
        </div>
      </div>

      <div style={{ padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', flexShrink: 0 }}>
        <button onClick={onVolver}
          style={{ width: '100%', minHeight: 68, borderRadius: 14, background: '#1a1a1a', border: '2px solid #2a2a2a', color: '#fff', fontSize: 20, fontWeight: 700 }}>
          Volver al mapa
        </button>
      </div>
    </div>
  )
}

// ── VistaCuenta principal ────────────────────────────────────────────────────

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
  const [cobrando, setCobrando] = useState(false)
  const [subVista, setSubVista] = useState<'cuenta' | 'cobro' | 'ticket'>('cuenta')

  // Multi-medio: array de líneas de pago
  const [lineasPago, setLineasPago] = useState<LineaPago[]>([])
  // Resultado del cobro para el ticket
  const [resultadoCobro, setResultadoCobro] = useState<{
    pagos: { nombre: string; monto: number }[]
    vuelto: number
    propinaMonto: number
    fiscal?: ResultadoFiscal
  } | null>(null)

  const propinaMonto = useMemo(() => {
    if (propinaCustom !== '') return Number(propinaCustom) || 0
    return Math.round(resumen.subtotal * propinaPct / 100)
  }, [resumen.subtotal, propinaPct, propinaCustom])

  const total = resumen.subtotal + propinaMonto
  const porPersona = divisiones > 1 ? total / divisiones : null

  // Totales del cobro
  const sumaCobrada = useMemo(() =>
    lineasPago.reduce((s, l) => s + (Number(l.monto) || 0), 0),
    [lineasPago]
  )
  const faltante = total - sumaCobrada
  const vuelto = sumaCobrada > total ? sumaCobrada - total : 0
  const cobradoCompleto = sumaCobrada >= total && lineasPago.every(l => l.medio_id)

  const mediosMap = useMemo(() =>
    Object.fromEntries(medios.map(m => [m.id, m.nombre])),
    [medios]
  )

  // Al entrar al cobro inicializar con una línea por el total completo
  function abrirCobro() {
    if (medios.length > 0) {
      setLineasPago([{ id: '1', medio_id: medios[0].id, monto: String(Math.round(total)) }])
    } else {
      setLineasPago([{ id: '1', medio_id: '', monto: String(Math.round(total)) }])
    }
    setSubVista('cobro')
  }

  function agregarLineaPago() {
    const resto = Math.max(0, total - sumaCobrada)
    const nuevoMedioId = medios.find(m => !lineasPago.some(l => l.medio_id === m.id))?.id ?? medios[0]?.id ?? ''
    setLineasPago(prev => [...prev, { id: String(Date.now()), medio_id: nuevoMedioId, monto: String(Math.round(resto)) }])
  }

  function actualizarLinea(id: string, campo: Partial<LineaPago>) {
    setLineasPago(prev => prev.map(l => l.id === id ? { ...l, ...campo } : l))
  }

  function quitarLinea(id: string) {
    setLineasPago(prev => {
      const next = prev.filter(l => l.id !== id)
      // recalcular monto de la primera línea si solo queda una
      if (next.length === 1) {
        return [{ ...next[0], monto: String(Math.round(total)) }]
      }
      return next
    })
  }

  async function onCobrar() {
    if (!cobradoCompleto) return
    setCobrando(true)
    try {
      const pagos: PagoInput[] = lineasPago.map(l => ({
        medio_id: l.medio_id,
        monto: Number(l.monto) || 0,
      }))
      const { fiscal } = await cobrarCuenta({ cuentaId, mesaId: mesa.id, pagos, propina: propinaMonto, total: resumen.subtotal })
      setResultadoCobro({
        pagos: lineasPago.map(l => ({ nombre: mediosMap[l.medio_id] ?? 'Pago', monto: Number(l.monto) || 0 })),
        vuelto,
        propinaMonto,
        fiscal,
      })
      setSubVista('ticket')
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al cobrar')
    } finally {
      setCobrando(false)
    }
  }

  // ── Ticket ────────────────────────────────────────────────────────────────
  if (subVista === 'ticket' && resultadoCobro) {
    return (
      <TicketCobro
        mesa={mesa}
        resumenLineas={resumen.lineas}
        subtotal={resumen.subtotal}
        propinaMonto={resultadoCobro.propinaMonto}
        total={total}
        pagos={resultadoCobro.pagos}
        vuelto={resultadoCobro.vuelto}
        fiscal={resultadoCobro.fiscal}
        onVolver={onCobrado}
      />
    )
  }

  // ── Cobro (multi-medio + vuelto) ──────────────────────────────────────────
  if (subVista === 'cobro') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '46px 16px 14px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setSubVista('cuenta')} style={{ minWidth: 44, minHeight: 44, color: '#fff', background: 'transparent', border: 'none' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28 }}>arrow_back</span>
          </button>
          <p style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>Cobrar — Mesa {mesa.numero}</p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Resumen del total */}
          <div style={{ background: '#1a1a1a', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#aaa' }}>Subtotal</span>
              <span style={{ color: '#fff' }}>{formatPesos(resumen.subtotal)}</span>
            </div>
            {propinaMonto > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#aaa' }}>Propina</span>
                <span style={{ color: '#c9a227' }}>{formatPesos(propinaMonto)}</span>
              </div>
            )}
            <div style={{ height: 1, background: '#333', margin: '8px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#fff', fontSize: 20, fontWeight: 800 }}>Total</span>
              <span style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>{formatPesos(total)}</span>
            </div>
          </div>

          {/* Líneas de pago */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lineasPago.map((linea, idx) => (
              <div key={linea.id} style={{ background: '#1a1a1a', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#aaa', fontSize: 13 }}>Pago {idx + 1}</span>
                  {lineasPago.length > 1 && (
                    <button onClick={() => quitarLinea(linea.id)} style={{ background: 'none', color: '#a04343', minWidth: 36, minHeight: 36 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                    </button>
                  )}
                </div>
                {/* Selector de medio */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {medios.map(m => (
                    <button key={m.id} onClick={() => actualizarLinea(linea.id, { medio_id: m.id })}
                      style={{ flex: '1 1 auto', minHeight: 44, borderRadius: 10, background: linea.medio_id === m.id ? '#4361a0' : '#2a2a2a', border: `1.5px solid ${linea.medio_id === m.id ? '#4361a0' : 'transparent'}`, color: '#fff', fontSize: 15, fontWeight: 600 }}>
                      {m.nombre}
                    </button>
                  ))}
                </div>
                {/* Monto */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: '#aaa', fontSize: 16 }}>$</span>
                  <input
                    type="number"
                    value={linea.monto}
                    onChange={e => actualizarLinea(linea.id, { monto: e.target.value })}
                    placeholder="0"
                    style={{ flex: 1, minHeight: 52, borderRadius: 10, background: '#2a2a2a', color: '#fff', border: 'none', padding: '0 14px', fontSize: 20, fontWeight: 700 }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Botón agregar medio */}
          {medios.length > lineasPago.length && (
            <button onClick={agregarLineaPago}
              style={{ minHeight: 52, borderRadius: 12, background: 'transparent', border: '1.5px dashed #333', color: '#aaa', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span className="material-symbols-outlined">add</span>
              Agregar otro medio
            </button>
          )}

          {/* Estado del cobro */}
          <div style={{ background: '#1a1a1a', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#aaa' }}>Cobrado</span>
              <span style={{ color: cobradoCompleto ? '#4caf50' : '#fff', fontWeight: 700 }}>{formatPesos(sumaCobrada)}</span>
            </div>
            {faltante > 0.5 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#e57373' }}>Falta</span>
                <span style={{ color: '#e57373', fontWeight: 700 }}>{formatPesos(faltante)}</span>
              </div>
            )}
            {vuelto > 0.5 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 8, borderTop: '1px solid #333' }}>
                <span style={{ color: '#4caf50', fontWeight: 700, fontSize: 18 }}>Vuelto</span>
                <span style={{ color: '#4caf50', fontWeight: 800, fontSize: 20 }}>{formatPesos(vuelto)}</span>
              </div>
            )}
          </div>

          <div style={{ height: 16 }} />
        </div>

        <div style={{ padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', flexShrink: 0 }}>
          <button onClick={onCobrar} disabled={cobrando || !cobradoCompleto}
            style={{ width: '100%', minHeight: 68, borderRadius: 14, background: cobradoCompleto ? '#2e7d32' : '#2a2a2a', color: '#fff', fontSize: 22, fontWeight: 800, opacity: cobrando ? 0.6 : 1 }}>
            {cobrando ? 'Registrando...' : cobradoCompleto ? `Confirmar cobro ${formatPesos(total)}` : `Falta ${formatPesos(faltante)}`}
          </button>
        </div>
      </div>
    )
  }

  // ── Cuenta (ítems + propina + división) ──────────────────────────────────
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
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {PROPINA_PRESETS.map(pct => (
              <button key={pct} onClick={() => { setPropinaPct(pct); setPropinaCustom('') }}
                style={{ flex: 1, minHeight: 48, borderRadius: 10, background: propinaPct === pct && propinaCustom === '' ? '#4361a0' : '#2a2a2a', color: '#fff', fontSize: 15, fontWeight: 600 }}>
                {pct === 0 ? 'Sin propina' : `${pct}%`}
              </button>
            ))}
          </div>
          <input
            value={propinaCustom}
            onChange={e => { setPropinaCustom(e.target.value); if (e.target.value) setPropinaPct(-1) }}
            placeholder="$ Monto personalizado"
            type="number"
            style={{ width: '100%', minHeight: 44, borderRadius: 10, background: '#2a2a2a', color: '#fff', border: propinaCustom ? '1px solid #4361a0' : 'none', padding: '0 12px', fontSize: 16 }}
          />
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
          {porPersona && (
            <p style={{ color: '#c9a227', textAlign: 'center', fontSize: 18, fontWeight: 700, marginTop: 12 }}>
              {formatPesos(porPersona)} por persona
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
        <button onClick={abrirCobro}
          style={{ width: '100%', minHeight: 68, borderRadius: 14, background: '#4361a0', color: '#fff', fontSize: 22, fontWeight: 800 }}>
          <span className="material-symbols-outlined" style={{ verticalAlign: 'middle', marginRight: 8 }}>payment</span>
          Cobrar {formatPesos(total)}
        </button>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

type Vista = 'mapa' | 'mesa' | 'cuenta' | 'caja'

export default function SalonPage() {
  const router  = useRouter()
  const { mesas, loading: loadingMesas, abrirCuenta, liberarMesa } = useMesas()
  const { items: cartaItems, loading: loadingCarta } = useCarta()
  const { comandas, crearComanda, agregarItems, enviarComanda } = useComandas()
  const { pedirCuenta } = useCuenta()
  const online = useOnlineStatus()

  const [vista, setVista] = useState<Vista>('mapa')
  const [mesaActiva, setMesaActiva] = useState<Mesa | null>(null)
  const [cuentaId, setCuentaId] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [categoriaActiva, setCategoriaActiva] = useState<string>('Todos')
  const [itemParaAgregar, setItemParaAgregar] = useState<CartaItem | null>(null)
  const [draft, setDraft] = useState<DraftItem[]>([])
  const [enviando, setEnviando] = useState(false)
  const [pidiendoCuenta, setPidiendoCuenta] = useState(false)

  // Categorías únicas de la carta
  const categorias = useMemo(() => {
    const cats = [...new Set(cartaItems.map(i => i.categoria).filter(Boolean))].sort()
    return ['Todos', ...cats]
  }, [cartaItems])

  const itemsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return cartaItems.filter(i => {
      const matchQ = !q || i.nombre.toLowerCase().includes(q)
      const matchCat = categoriaActiva === 'Todos' || i.categoria === categoriaActiva
      return matchQ && matchCat
    })
  }, [cartaItems, busqueda, categoriaActiva])

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

  // Kitchen Coach (Sesión 3 C4, jul 2026) — contexto solo en el mapa del salón, NO en KDS
  // (regla de ui.md: cero distracciones en la pantalla de despacho).
  const totalEnCurso = useMemo(() => calcularResumen(comandas).subtotal, [comandas])
  useEffect(() => {
    if (vista !== 'mapa') return
    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'salon',
      mesasOcupadas: mesas.filter(m => m.estado !== 'libre').length,
      mesasLibres: mesas.filter(m => m.estado === 'libre').length,
      cuentasPedidas: mesas.filter(m => m.estado === 'cuenta_pedida').length,
      kpis: { totalEnCurso: Math.round(totalEnCurso) },
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [vista, mesas, totalEnCurso])

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
      // Prep-list viva: fire-and-forget (actualiza demanda en checklist)
      fetch('/api/salon/prep-list-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: draft.map(d => ({ carta_item_id: d.carta_item_id, cantidad: d.cantidad })) }),
      }).catch(() => {})
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
        <div data-coach-target="salon-topbar" style={{ padding: '46px 16px 14px', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div>
            <p style={{ fontSize: 24, fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>Salón</p>
            {totalEnCurso > 0 && (
              <p style={{ fontSize: 13, color: '#4caf50', fontWeight: 600, marginTop: 2 }}>{formatPesos(totalEnCurso)} en curso</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => router.push('/kds')} title="Ir a KDS" aria-label="Ir a KDS"
              style={{ minWidth: 44, minHeight: 44, background: '#1a1a1a', borderRadius: 12, border: 'none', color: '#aaa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24 }}>kitchen</span>
            </button>
            <button onClick={() => setVista('caja')} title="Caja" aria-label="Caja"
              style={{ minWidth: 44, minHeight: 44, background: '#1a1a1a', borderRadius: 12, border: 'none', color: '#aaa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24 }}>point_of_sale</span>
            </button>
            <button onClick={() => router.push('/salon/config')} title="Configurar mesas" aria-label="Configurar mesas"
              style={{ minWidth: 44, minHeight: 44, background: '#1a1a1a', borderRadius: 12, border: 'none', color: '#aaa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24 }}>settings</span>
            </button>
          </div>
        </div>
        {mesas.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 56, color: '#444' }}>table_restaurant</span>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: 0, textAlign: 'center' }}>No hay mesas cargadas</p>
            <p style={{ fontSize: 13, color: '#888', margin: 0, textAlign: 'center' }}>Configurá el mapa de mesas para usar el salón</p>
            <button
              onClick={() => router.push('/salon/config')}
              style={{ marginTop: 8, minHeight: 64, padding: '0 28px', borderRadius: 14, border: 'none', background: '#1a1a1a', color: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}
            >
              Configurar mesas
            </button>
          </div>
        ) : (
          <div data-coach-target="salon-mapa" style={{ flex: 1, overflow: 'auto', position: 'relative', minHeight: 600 }}>
            {mesas.map(m => (
              <MesaBoton key={m.id} mesa={m} hayListos={mesasConListos.has(m.id)} onTap={onTapMesa} />
            ))}
          </div>
        )}
        <KitchenCoachFAB />
      </div>
    )
  }

  // ── Vista caja ────────────────────────────────────────────────────────────

  if (vista === 'caja') {
    return <VistaCaja onVolver={() => setVista('mapa')} />
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

      <div style={{ padding: '0 16px 8px', flexShrink: 0 }}>
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar en la carta..."
          style={{ width: '100%', minHeight: 48, borderRadius: 12, background: '#1a1a1a', color: '#fff', border: '1px solid #2a2a2a', padding: '0 16px', fontSize: 17 }} />
      </div>

      {/* Tabs de categoría */}
      {categorias.length > 2 && (
        <div style={{ padding: '0 16px 8px', flexShrink: 0, overflowX: 'auto', display: 'flex', gap: 8 }}>
          {categorias.map(cat => (
            <button key={cat} onClick={() => setCategoriaActiva(cat)}
              style={{ flexShrink: 0, minHeight: 38, padding: '0 16px', borderRadius: 20, background: categoriaActiva === cat ? '#4361a0' : '#1a1a1a', color: categoriaActiva === cat ? '#fff' : '#aaa', fontSize: 14, fontWeight: categoriaActiva === cat ? 700 : 500, border: 'none', whiteSpace: 'nowrap' }}>
              {cat}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loadingCarta ? (
          <p style={{ color: '#666' }}>Cargando carta...</p>
        ) : itemsFiltrados.length === 0 ? (
          <p style={{ color: '#555', textAlign: 'center', padding: 24 }}>
            {busqueda ? `Sin resultados para "${busqueda}"` : 'Sin ítems en esta categoría'}
          </p>
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
