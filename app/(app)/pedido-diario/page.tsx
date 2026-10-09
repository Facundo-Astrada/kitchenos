'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageTransition from '@/components/PageTransition'
import { FilterChips, EmptyState, Modal, Num, Toast } from '@/components/ui'
import { usePedidoDiario } from '@/lib/hooks/usePedidoDiario'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { fechaEnTz } from '@/lib/ops/turnos'
import {
  ajustarCantidad, armarMensaje, avance, cantidadInicialSinConteo, diasDesde, pasoCantidad,
  proponerConConteo, telefonoWhatsApp, textoAntiguedad, textoCorte, totalEstimado, type LineaPedido,
} from '@/lib/pedidoDiario/calculo'
import { seccionesPorUbicacion } from '@/lib/pedidoDiario/secciones'
import type { Producto } from '@/types'

const SIN_PROVEEDOR = '__sin_proveedor__'
const fmtMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
const fmtCant = (n: number) => String(Number.isInteger(n) ? n : Number(n.toFixed(2))).replace('.', ',')

interface Borrador {
  lineas: Record<string, LineaPedido>
  hay: Record<string, string>
  notas: Record<string, string>
  /** proveedor → id del pedido ya creado (el modal puede reabrirse sin duplicarlo) */
  enviados: Record<string, string>
}
const VACIO: Borrador = { lineas: {}, hay: {}, notas: {}, enviados: {} }

function fechaLarga(d: Date) {
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

export default function PedidoDiarioPage() {
  const rid = useRestauranteId()
  const router = useRouter()
  const {
    productos, ultimaPedida, fechaPrecio, proveedores, sectores, estantes, grupos,
    loading, error, conteoActivo, setConteoActivo, registrarPedido,
  } = usePedidoDiario()

  const ahora = useMemo(() => new Date(), [])
  const hoy = fechaEnTz(ahora)
  const claveBorrador = rid ? `pedido-diario-borrador-${rid}-${hoy}` : null

  const [borrador, setBorrador] = useState<Borrador>(VACIO)
  const [proveedorActivo, setProveedorActivo] = useState<string>('')
  const [cierreAbierto, setCierreAbierto] = useState(false)
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const borradorCargado = useRef<string | null>(null)

  // Borrador local: si interrumpen al cocinero, vuelve a donde estaba.
  useEffect(() => {
    if (!claveBorrador || borradorCargado.current === claveBorrador) return
    borradorCargado.current = claveBorrador
    try {
      const raw = localStorage.getItem(claveBorrador)
      if (raw) setBorrador({ ...VACIO, ...(JSON.parse(raw) as Partial<Borrador>) })
    } catch { /* sin storage: arranca vacío */ }
  }, [claveBorrador])

  const actualizar = useCallback((fn: (b: Borrador) => Borrador) => {
    setBorrador(prev => {
      const next = fn(prev)
      if (claveBorrador) { try { localStorage.setItem(claveBorrador, JSON.stringify(next)) } catch { /* ignorar */ } }
      return next
    })
  }, [claveBorrador])

  const nombreProveedor = useMemo(() => new Map(proveedores.map(p => [p.id, p.nombre])), [proveedores])

  // Un grupo por proveedor; los productos sin proveedor van aparte, al final.
  const porProveedor = useMemo(() => {
    const m = new Map<string, Producto[]>()
    for (const p of productos) {
      const k = p.proveedor_id && nombreProveedor.has(p.proveedor_id) ? p.proveedor_id : SIN_PROVEEDOR
      const l = m.get(k) ?? []
      l.push(p)
      m.set(k, l)
    }
    return m
  }, [productos, nombreProveedor])

  const chips = useMemo(() => {
    const ids = [...porProveedor.keys()].sort((a, b) =>
      a === SIN_PROVEEDOR ? 1 : b === SIN_PROVEEDOR ? -1 : (nombreProveedor.get(a) ?? '').localeCompare(nombreProveedor.get(b) ?? '', 'es'))
    return ids.map(id => ({ value: id, label: id === SIN_PROVEEDOR ? 'Sin proveedor' : (nombreProveedor.get(id) ?? '') }))
  }, [porProveedor, nombreProveedor])

  const activo = chips.some(c => c.value === proveedorActivo) ? proveedorActivo : (chips[0]?.value ?? '')
  const productosActivos = useMemo(() => porProveedor.get(activo) ?? [], [porProveedor, activo])
  const proveedor = activo && activo !== SIN_PROVEEDOR ? proveedores.find(p => p.id === activo) : undefined

  const secciones = useMemo(() => seccionesPorUbicacion(
    productosActivos,
    sectores.map(s => ({ id: s.id, nombre: s.nombre, orden: s.orden })),
    estantes.map(e => ({ id: e.id, nombre: e.nombre, orden: e.orden, sector_id: e.sector_id })),
    grupos.map(g => ({ id: g.id, nombre: g.nombre, orden: g.orden, estante_id: g.estante_id, sector_id: g.sector_id })),
  ), [productosActivos, sectores, estantes, grupos])

  const ids = useMemo(() => productosActivos.map(p => p.id), [productosActivos])
  const precios = useMemo(() => Object.fromEntries(productos.map(p => [p.id, p.precio_unitario])), [productos])
  const progreso = avance(borrador.lineas, ids)
  const total = totalEstimado(
    Object.fromEntries(ids.filter(id => borrador.lineas[id]).map(id => [id, borrador.lineas[id]])), precios)

  // ── Acciones por producto ──
  const marcarHay = (p: Producto) => actualizar(b => ({ ...b, lineas: { ...b.lineas, [p.id]: { estado: 'hay', cantidad: 0 } } }))
  const marcarPedir = (p: Producto) => actualizar(b => ({
    ...b,
    lineas: { ...b.lineas, [p.id]: { estado: 'pedir', cantidad: b.lineas[p.id]?.cantidad || cantidadInicialSinConteo(p, ultimaPedida[p.id]) } },
  }))
  const cambiarCantidad = (p: Producto, delta: number) => actualizar(b => {
    const actual = b.lineas[p.id]?.cantidad ?? 0
    return { ...b, lineas: { ...b.lineas, [p.id]: { estado: 'pedir', cantidad: ajustarCantidad(actual, delta) } } }
  })
  const contar = (p: Producto, txt: string) => actualizar(b => {
    const hay = { ...b.hay, [p.id]: txt }
    const n = Number(txt.replace(',', '.'))
    if (txt.trim() === '' || Number.isNaN(n) || n < 0) {
      const { [p.id]: _quitada, ...resto } = b.lineas
      void _quitada
      return { ...b, hay, lineas: resto }
    }
    return { ...b, hay, lineas: { ...b.lineas, [p.id]: proponerConConteo(n, p) } }
  })

  // ── Cierre ──
  const itemsDelPedido = useMemo(() => productosActivos
    .filter(p => borrador.lineas[p.id]?.estado === 'pedir' && borrador.lineas[p.id].cantidad > 0)
    .map(p => ({ producto_id: p.id, producto_nombre: p.nombre, cantidad: borrador.lineas[p.id].cantidad, unidad: p.unidad, precio_estimado: p.precio_unitario })),
  [productosActivos, borrador.lineas])

  const nombreActivo = activo === SIN_PROVEEDOR ? 'Sin proveedor' : (proveedor?.nombre ?? '')
  const nota = borrador.notas[activo] ?? ''
  const mensaje = armarMensaje({
    proveedor: nombreActivo, fecha: fechaLarga(ahora),
    items: itemsDelPedido.map(i => ({ nombre: i.producto_nombre, cantidad: i.cantidad, unidad: i.unidad })),
    nota,
  })

  // Crea el pedido una sola vez por proveedor y día, aunque se toquen Copiar y WhatsApp.
  async function asegurarRegistro() {
    if (borrador.enviados[activo] || itemsDelPedido.length === 0) return
    setGuardando(true)
    try {
      const conteos: Record<string, number> = {}
      if (conteoActivo) {
        for (const p of productosActivos) {
          const n = Number((borrador.hay[p.id] ?? '').replace(',', '.'))
          if ((borrador.hay[p.id] ?? '').trim() !== '' && !Number.isNaN(n) && n >= 0) conteos[p.id] = n
        }
      }
      const id = await registrarPedido({
        proveedorId: activo === SIN_PROVEEDOR ? null : activo,
        proveedorNombre: nombreActivo, items: itemsDelPedido, nota, conteos,
      })
      actualizar(b => ({ ...b, enviados: { ...b.enviados, [activo]: id } }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'desconocido'
      setToast({ msg: `No se pudo guardar el pedido (${msg}). El mensaje se puede enviar igual.`, error: true })
    } finally {
      setGuardando(false)
    }
  }

  async function copiar() {
    await asegurarRegistro()
    try {
      await navigator.clipboard.writeText(mensaje)
      setToast({ msg: 'Pedido copiado' })
    } catch {
      setToast({ msg: 'No se pudo copiar. Seleccioná el texto y copialo.', error: true })
    }
  }

  async function whatsapp() {
    await asegurarRegistro()
    const tel = telefonoWhatsApp(proveedor?.telefono)
    const texto = encodeURIComponent(mensaje)
    window.open(tel ? `https://wa.me/${tel}?text=${texto}` : `https://wa.me/?text=${texto}`, '_blank')
  }

  const corte = textoCorte(proveedor?.hora_corte_pedido, ahora)
  const yaEnviado = !!borrador.enviados[activo]

  return (
    <PageTransition>
      <div style={{ background: 'var(--bg)', minHeight: '100dvh', paddingBottom: 24 }}>
        {/* Header */}
        <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/facturas?tab=pedidos" aria-label="Volver a Compras" style={{ color: '#fff', display: 'flex' }}>
              <span className="material-symbols-outlined">arrow_back</span>
            </Link>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Pedido diario</div>
              <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 12 }}>{fechaLarga(ahora)}{corte ? ` · ${corte}` : ''}</div>
            </div>
            <button
              type="button"
              onClick={() => { void setConteoActivo(!conteoActivo) }}
              aria-pressed={conteoActivo}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 12px', borderRadius: 22, cursor: 'pointer',
                border: '1px solid rgba(255,255,255,.35)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                background: conteoActivo ? '#fff' : 'transparent', color: conteoActivo ? 'var(--navy-ink)' : '#fff',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>inventory</span>
              Contar
            </button>
          </div>
          {chips.length > 1 && (
            <div style={{ marginTop: 12 }}>
              <FilterChips chips={chips} active={activo} onChange={setProveedorActivo} context="onDark" />
            </div>
          )}
        </div>

        {/* Avance */}
        {ids.length > 0 && (
          <div style={{ padding: '12px 16px 4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
              <span><Num>{progreso.revisados}</Num> de <Num>{progreso.total}</Num> revisados</span>
              {conteoActivo && <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>Anotá lo que hay</span>}
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progreso.total ? (progreso.revisados / progreso.total) * 100 : 0}%`, background: progreso.completo ? '#10b981' : 'var(--accent)', transition: 'width .2s' }} />
            </div>
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div style={{ padding: 16, color: 'var(--text-3)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ animation: 'spin 1s linear infinite' }}>progress_activity</span> Cargando…
          </div>
        ) : error ? (
          <EmptyState icon="error" title="No se pudo cargar el pedido" subtitle={error} />
        ) : productos.length === 0 ? (
          <EmptyState
            icon="shopping_basket"
            title="Todavía no hay productos en el pedido diario"
            subtitle="En Stock, abrí un producto y activá “Entra en el pedido diario”. Cargale también mínimo, máximo y proveedor."
            cta={{ label: 'Ir a Stock', onClick: () => router.push('/stock') }}
          />
        ) : (
          <div style={{ padding: '8px 14px 0' }}>
            {secciones.map(sec => (
              <section key={sec.clave}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-3)', padding: '14px 2px 6px' }}>
                  {sec.titulo}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sec.productos.map(p => {
                    const l = borrador.lineas[p.id]
                    const dias = diasDesde(fechaPrecio[p.id], ahora)
                    const paso = pasoCantidad(p.unidad)
                    return (
                      <div key={p.id} style={{
                        background: 'var(--surface)', borderRadius: 14, padding: 12,
                        border: `1px solid ${l?.estado === 'pedir' ? 'var(--accent)' : 'var(--border)'}`,
                        opacity: l?.estado === 'hay' ? 0.7 : 1,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)' }}>{p.nombre}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                            <Num>{fmtMoney(p.precio_unitario)}</Num>/{p.unidad}
                            <span style={{ color: dias != null && dias > 7 ? 'var(--amber-fg)' : 'var(--text-3)' }}> · {textoAntiguedad(dias)}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 8px' }}>
                          mín <Num>{fmtCant(p.stock_minimo)}</Num>{p.stock_maximo != null ? <> · máx <Num>{fmtCant(p.stock_maximo)}</Num></> : null} {p.unidad}
                          {!conteoActivo && <> · en stock <Num>{fmtCant(p.stock_actual)}</Num></>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {conteoActivo && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
                              Hay
                              <input
                                type="text" inputMode="decimal" value={borrador.hay[p.id] ?? ''}
                                onChange={e => contar(p, e.target.value)}
                                placeholder="0"
                                aria-label={`Cuánto ${p.nombre} hay`}
                                style={{ width: 64, height: 48, textAlign: 'center', fontSize: 16, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontFamily: 'inherit' }}
                              />
                              {p.unidad}
                            </label>
                          )}
                          <div style={{ flex: 1 }} />
                          {l?.estado === 'pedir' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <button type="button" onClick={() => cambiarCantidad(p, -paso)} aria-label="Menos" style={botonRedondo}>
                                <span className="material-symbols-outlined">remove</span>
                              </button>
                              <div style={{ minWidth: 46, textAlign: 'center', fontWeight: 700, fontSize: 16 }}><Num>{fmtCant(l.cantidad)}</Num></div>
                              <button type="button" onClick={() => cambiarCantidad(p, paso)} aria-label="Más" style={botonRedondo}>
                                <span className="material-symbols-outlined">add</span>
                              </button>
                            </div>
                          )}
                          <button
                            type="button" onClick={() => marcarHay(p)} aria-pressed={l?.estado === 'hay'} aria-label={`${p.nombre}: hay suficiente`}
                            style={{ ...botonEstado, background: l?.estado === 'hay' ? '#10b981' : 'var(--bg)', color: l?.estado === 'hay' ? '#fff' : 'var(--text-1)', borderColor: l?.estado === 'hay' ? '#10b981' : 'var(--border)' }}
                          >
                            <span className="material-symbols-outlined">check</span>
                          </button>
                          <button
                            type="button" onClick={() => marcarPedir(p)} aria-pressed={l?.estado === 'pedir'}
                            style={{ ...botonEstado, padding: '0 16px', background: l?.estado === 'pedir' ? 'var(--accent)' : 'var(--bg)', color: l?.estado === 'pedir' ? '#fff' : 'var(--text-1)', borderColor: l?.estado === 'pedir' ? 'var(--accent)' : 'var(--border)' }}
                          >
                            Pedir
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Barra inferior */}
        {productos.length > 0 && !loading && (
          <div style={{
            position: 'sticky', bottom: 'var(--toast-bottom)', zIndex: 90, marginTop: 16,
            padding: '10px 16px', background: 'var(--surface)', borderTop: '1px solid var(--border)', boxShadow: 'var(--shadow-3)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}><Num>{itemsDelPedido.length}</Num> para pedir</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)' }}><Num>{fmtMoney(total)}</Num> <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)' }}>estimado</span></div>
            </div>
            <button
              type="button" disabled={!progreso.completo} onClick={() => setCierreAbierto(true)}
              style={{
                minHeight: 52, padding: '0 22px', borderRadius: 14, border: 'none', fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
                background: progreso.completo ? 'var(--accent)' : 'var(--border)', color: progreso.completo ? '#fff' : 'var(--text-3)',
                cursor: progreso.completo ? 'pointer' : 'not-allowed',
              }}
            >
              {yaEnviado ? 'Ver pedido' : 'Terminar'}
            </button>
          </div>
        )}
      </div>

      {/* Cierre: el pedido completo + nota + copiar / WhatsApp */}
      <Modal open={cierreAbierto} onClose={() => setCierreAbierto(false)} center maxWidth={460}>
        <div style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text-1)' }}>Pedido · {nombreActivo}</div>
            <button type="button" onClick={() => setCierreAbierto(false)} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', minHeight: 44, minWidth: 44 }}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          {itemsDelPedido.length === 0 ? (
            <div style={{ padding: '18px 0', color: 'var(--text-2)', fontSize: 14 }}>
              Hoy no hace falta pedir nada de {nombreActivo}. Todo está en su mínimo.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>{fechaLarga(ahora)}</div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                {itemsDelPedido.map((it, i) => (
                  <div key={it.producto_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', fontSize: 14, borderTop: i ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ color: 'var(--text-1)' }}>{it.producto_nombre}</span>
                    <span style={{ fontWeight: 700 }}><Num>{fmtCant(it.cantidad)}</Num> {it.unidad}</span>
                  </div>
                ))}
              </div>
              <textarea
                value={nota}
                onChange={e => actualizar(b => ({ ...b, notas: { ...b.notas, [activo]: e.target.value } }))}
                placeholder="Agregar un texto al pedido (opcional)"
                rows={2}
                style={{ width: '100%', marginTop: 12, padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 14, resize: 'none', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 12, color: 'var(--text-3)', margin: '8px 0 14px' }}>
                Total estimado <Num>{fmtMoney(total)}</Num> · no se incluye en el mensaje al proveedor.
                {yaEnviado && ' Pedido ya guardado en Compras.'}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" disabled={guardando} onClick={() => { void copiar() }} style={{ ...botonCierre, background: 'var(--bg)', color: 'var(--text-1)', border: '1px solid var(--border)' }}>
                  <span className="material-symbols-outlined">content_copy</span> Copiar
                </button>
                <button type="button" disabled={guardando} onClick={() => { void whatsapp() }} style={{ ...botonCierre, background: '#25d366', color: '#fff', border: 'none' }}>
                  <span className="material-symbols-outlined">send</span> WhatsApp
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {toast && <Toast msg={toast.msg} variant={toast.error ? 'error' : 'default'} onDone={() => setToast(null)} />}
    </PageTransition>
  )
}

const botonRedondo: CSSProperties = {
  width: 44, height: 44, borderRadius: 22, border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text-1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const botonEstado: CSSProperties = {
  minWidth: 56, height: 52, borderRadius: 12, border: '1px solid var(--border)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
}
const botonCierre: CSSProperties = {
  flex: 1, minHeight: 52, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
}
