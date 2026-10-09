'use client'

// Vista de factura como ticket — panel lateral de Compras en escritorio (idea de Fudo).
// Una sola mirada: quién la cargó, cuánto, cómo se pagó, qué impuestos tiene, qué
// mercadería trae y a qué producto de stock quedó vinculada cada línea.
// Solo lectura + acciones rápidas; editar abre el detalle completo.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Num } from '@/components/ui'
import type { Factura, FacturaItem, FacturaPago, CategoriaGasto, MedioPago } from '@/types'

const fmt = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtFecha = (d?: string | null) => d ? new Date(d.length === 10 ? d + 'T12:00' : d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

const ESTADO: Record<string, { label: string; bg: string; fg: string; banda: string }> = {
  pendiente: { label: 'A pagar', bg: 'var(--amber-bg)', fg: 'var(--amber-fg)', banda: 'var(--amber-bg)' },
  confirmada: { label: 'Confirmada', bg: 'var(--green-bg)', fg: 'var(--green-fg)', banda: 'var(--green-bg)' },
  observada: { label: 'Observada', bg: 'var(--red-bg)', fg: 'var(--red-fg)', banda: 'var(--red-bg)' },
  pagada: { label: 'Pagado', bg: 'var(--green-bg)', fg: 'var(--green-fg)', banda: 'var(--blue-bg)' },
}
const TIPO: Record<string, string> = { A: 'Factura A', B: 'Factura B', C: 'Factura C', X: 'Factura X', remito: 'Remito', ticket: 'Ticket' }

function Fila({ k, v, fuerte }: { k: string; v: React.ReactNode; fuerte?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', fontSize: 13 }}>
      <span style={{ color: fuerte ? 'var(--text-1)' : 'var(--text-2)', fontWeight: fuerte ? 700 : 500 }}>{k}</span>
      <span style={{ color: 'var(--text-1)', fontWeight: fuerte ? 700 : 600, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{v}</span>
    </div>
  )
}

function Bloque({ icono, titulo, derecha, children }: { icono: string; titulo: string; derecha?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6, marginBottom: 4, borderBottom: '1px solid var(--border)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--text-2)' }}>{icono}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', flex: 1 }}>{titulo}</span>
        {derecha}
      </div>
      {children}
    </div>
  )
}

export default function FacturaTicket({
  factura, categorias, medios, productosPorId, fetchItems, onEditar, onEliminar, onMarcarPagada, onCerrar,
}: {
  factura: Factura
  categorias: CategoriaGasto[]
  medios: MedioPago[]
  productosPorId: Map<string, string>
  fetchItems: (facturaId: string) => Promise<FacturaItem[]>
  onEditar: () => void
  onEliminar: () => void
  onMarcarPagada: () => void
  onCerrar: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<FacturaItem[] | null>(null)
  const [pagos, setPagos] = useState<FacturaPago[] | null>(null)
  const [masDatos, setMasDatos] = useState(true)

  useEffect(() => {
    let vivo = true
    fetchItems(factura.id).then(r => { if (vivo) setItems(r) }).catch(() => { if (vivo) setItems([]) })
    supabase.from('factura_pagos').select('id, factura_id, fecha_pago, importe, medio_pago, caja')
      .eq('factura_id', factura.id).order('fecha_pago')
      .then(({ data }) => { if (vivo) setPagos((data ?? []) as FacturaPago[]) })
    return () => { vivo = false }
  }, [factura.id, fetchItems, supabase])

  const st = ESTADO[factura.status ?? 'pendiente'] ?? ESTADO.pendiente
  const cat = factura.categoria_gasto_id ? categorias.find(c => c.id === factura.categoria_gasto_id) : null
  const medio = factura.medio_pago_id ? medios.find(m => m.id === factura.medio_pago_id)?.nombre : null
  const porPagar = factura.status !== 'pagada'
  const iibb = factura.percepcion_iibb ?? 0
  const gan = factura.percepcion_ganancias ?? 0
  const otras = factura.otras_percepciones ?? 0
  const neto = factura.subtotal ?? 0
  const iva = factura.iva_total ?? 0
  const hayImpuestos = iva > 0 || iibb > 0 || gan > 0 || otras > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface)', borderLeft: '1px solid var(--border)' }}>
      <div style={{ background: st.banda, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-1)' }}>
            {factura.external_id ? `ID ${factura.external_id}` : (TIPO[factura.tipo_factura ?? ''] ?? 'Comprobante')}
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: st.bg, color: st.fg }}>{st.label}</span>
        <button onClick={onCerrar} title="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-2)', display: 'flex' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 16px 16px' }}>
        {factura.creado_por && <Fila k="Creado por" v={factura.creado_por} />}
        <Fila k="Fecha de registro" v={fmtFecha(factura.created_at)} />
        <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />
        <Fila k="Fecha" v={fmtFecha(factura.fecha_factura)} />
        <Fila k="Importe" v={<Num>{fmt(factura.total)}</Num>} fuerte />
        <Fila k="Proveedor" v={factura.proveedor_nombre} />
        <Fila k="Categoría" v={cat?.nombre ?? '—'} />
        {factura.sector && <Fila k="Sector" v={factura.sector} />}
        {factura.notas && <Fila k="Comentario" v={factura.notas} />}

        <button onClick={() => setMasDatos(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', background: 'none', border: 'none', padding: '8px 0 2px', cursor: 'pointer', color: 'var(--accent)', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>
          Más datos
          <span className="material-symbols-outlined" style={{ fontSize: 18, marginLeft: 'auto' }}>{masDatos ? 'expand_less' : 'expand_more'}</span>
        </button>
        {masDatos && (
          <>
            <Fila k="Fecha de vencimiento" v={fmtFecha(factura.fecha_vencimiento)} />
            <Fila k="Tipo de comprobante" v={TIPO[factura.tipo_factura ?? ''] ?? factura.tipo_factura ?? '—'} />
            <Fila k="N° de comprobante" v={factura.numero_factura ?? '—'} />
            {factura.proveedor_cuit && <Fila k="CUIT" v={factura.proveedor_cuit} />}
            <Fila k="Condición" v={factura.condicion_pago === 'cuenta_corriente' ? 'Cuenta corriente' : factura.condicion_pago === 'contado' ? 'Contado' : factura.condicion_pago ?? '—'} />
          </>
        )}

        <Bloque icono="payments" titulo="Pagos">
          {pagos === null ? (
            <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '6px 0' }}>Cargando…</div>
          ) : pagos.length > 0 ? pagos.map(p => (
            <div key={p.id} style={{ display: 'flex', gap: 8, padding: '5px 0', fontSize: 13, alignItems: 'baseline' }}>
              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{fmtFecha(p.fecha_pago)}</span>
              <span style={{ flex: 1, minWidth: 0, color: 'var(--text-1)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.medio_pago ?? '—'}</span>
              <Num><span style={{ fontWeight: 700 }}>{fmt(p.importe)}</span></Num>
            </div>
          )) : (
            <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '6px 0' }}>
              {factura.status === 'pagada' ? `Pagada${medio ? ` · ${medio}` : ''} — sin detalle de pago` : 'Todavía sin pagos'}
            </div>
          )}
          {porPagar && (
            <button onClick={onMarcarPagada}
              style={{ width: '100%', marginTop: 6, padding: '8px', borderRadius: 8, border: 'none', background: '#1e40af', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Marcar como pagada
            </button>
          )}
        </Bloque>

        {hayImpuestos && (
          <Bloque icono="receipt_long" titulo="Impuestos y percepciones">
            {neto > 0 && <Fila k="Neto" v={<Num>{fmt(neto)}</Num>} />}
            <Fila k="IVA" v={<Num>{iva > 0 ? fmt(iva) : '-'}</Num>} fuerte />
            <Fila k="IIBB" v={<Num>{iibb > 0 ? fmt(iibb) : '-'}</Num>} fuerte />
            <Fila k="Ganancias" v={<Num>{gan > 0 ? fmt(gan) : '-'}</Num>} fuerte />
            <Fila k="Otras percepciones" v={<Num>{otras > 0 ? fmt(otras) : '-'}</Num>} fuerte />
          </Bloque>
        )}

        <Bloque icono="shopping_cart" titulo="Detalle de mercadería">
          {items === null ? (
            <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '6px 0' }}>Cargando…</div>
          ) : items.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '6px 0' }}>Esta factura no tiene líneas de mercadería.</div>
          ) : items.map(it => {
            const vinc = it.producto_id ? productosPorId.get(it.producto_id) : null
            const variacion = it.precio_anterior && it.precio_anterior > 0 ? ((it.precio_unitario - it.precio_anterior) / it.precio_anterior) * 100 : null
            return (
              <div key={it.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                <Num><span style={{ color: 'var(--text-2)', minWidth: 40, display: 'inline-block' }}>{Number(it.cantidad).toLocaleString('es-AR')} {it.unidad === 'unid.' || it.unidad === 'u' ? 'u.' : it.unidad}</span></Num>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-1)', textTransform: 'uppercase', fontSize: 12, lineHeight: 1.3 }}>{it.producto_nombre}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                    {vinc ? (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: 'var(--green-bg)', color: 'var(--green-fg)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>link</span>{vinc}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: 'var(--amber-bg)', color: 'var(--amber-fg)' }}>Sin vincular</span>
                    )}
                    {variacion !== null && Math.abs(variacion) >= 1 && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: variacion > 15 ? '#ef4444' : variacion > 0 ? '#f59e0b' : '#10b981' }}>
                        {variacion > 0 ? '+' : ''}{variacion.toFixed(0)}% vs. anterior
                      </span>
                    )}
                  </div>
                </div>
                <Num><span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{fmt(it.subtotal ?? it.cantidad * it.precio_unitario)}</span></Num>
              </div>
            )
          })}
        </Bloque>

        {factura.imagen_url && (
          <Bloque icono="description" titulo="Comprobante" derecha={
            <a href={factura.imagen_url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-2)', display: 'flex' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>visibility</span>
            </a>
          }><span /></Bloque>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border)', justifyContent: 'flex-end', flexShrink: 0 }}>
        <button onClick={onEliminar} title="Eliminar"
          style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
        </button>
        <button onClick={onEditar}
          style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: 'var(--red-bg)', color: 'var(--red-fg)', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>Editar
        </button>
      </div>
    </div>
  )
}
