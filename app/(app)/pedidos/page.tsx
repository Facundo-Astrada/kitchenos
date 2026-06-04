'use client'

import PageTransition from '@/components/PageTransition'
import { motion } from 'motion/react'
import { useState, useMemo, useCallback, useEffect } from 'react'
import { usePedidos } from '@/lib/hooks/usePedidos'
import { useProveedores } from '@/lib/hooks/useProveedores'
import { createClient } from '@/lib/supabase/client'
import type { Pedido, PedidoItem, EstadoPedido, Proveedor } from '@/types'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import PageHeader from '@/components/shell/PageHeader'
import ActionButton from '@/components/shell/ActionButton'

// ── Helpers ─────────────────────────────────────────────
const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const date = new Date(d + 'T12:00:00')
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}
const fmtMoney = (n: number) =>
  n > 0 ? `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—'

const STATUS_COLORS: Record<EstadoPedido, { bg: string; text: string; label: string }> = {
  borrador: { bg: '#e8e8e8', text: '#666', label: 'Borrador' },
  enviado:  { bg: '#dbeafe', text: '#1d4ed8', label: 'Enviado' },
  parcial:  { bg: '#fef3c7', text: '#92400e', label: 'Parcial' },
  recibido: { bg: '#d1fae5', text: '#065f46', label: 'Recibido' },
}

// ── PDF Export ──────────────────────────────────────────
async function exportPedidoPDF(pedido: Pedido, items: PedidoItem[]) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF()

  // Header
  doc.setFillColor(30, 41, 59) // navy
  doc.rect(0, 0, 210, 38, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.text('Pedido', 14, 18)
  doc.setFontSize(10)
  doc.text(`Proveedor: ${pedido.proveedor_nombre}`, 14, 28)
  doc.text(`Fecha: ${fmtDate(pedido.fecha_pedido)}`, 14, 34)
  if (pedido.fecha_entrega_esperada) {
    doc.text(`Entrega esperada: ${fmtDate(pedido.fecha_entrega_esperada)}`, 100, 28)
  }
  doc.text(`Estado: ${STATUS_COLORS[pedido.status as EstadoPedido].label}`, 100, 34)

  doc.setTextColor(0, 0, 0)

  // Items table
  autoTable(doc, {
    startY: 44,
    head: [['#', 'Producto', 'Cantidad', 'Unidad', 'Precio Est.', 'Subtotal']],
    body: items.map((it, i) => [
      i + 1,
      it.producto_nombre ?? '',
      it.cantidad,
      it.unidad ?? '',
      fmtMoney(it.precio_estimado ?? 0),
      fmtMoney(it.cantidad * (it.precio_estimado ?? 0)),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 41, 59] },
  })

  // Total
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = ((doc as any).lastAutoTable?.finalY as number) ?? 120
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(`Total estimado: ${fmtMoney(pedido.total_estimado ?? 0)}`, 14, finalY + 12)

  // Notes
  if (pedido.notas) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Notas: ${pedido.notas}`, 14, finalY + 22)
  }

  // Footer
  doc.setFontSize(7)
  doc.setTextColor(150)
  doc.text('Generado por KitchenOS', 14, 285)

  doc.save(`pedido-${(pedido.proveedor_nombre ?? '').replace(/\s/g, '_')}-${pedido.fecha_pedido}.pdf`)
}

// ── WhatsApp Export ─────────────────────────────────────
function buildWhatsAppText(pedido: Pedido, items: PedidoItem[]) {
  let msg = `*Pedido - ${pedido.proveedor_nombre}*\n`
  msg += `Fecha: ${fmtDate(pedido.fecha_pedido)}\n`
  if (pedido.fecha_entrega_esperada) msg += `Entrega esperada: ${fmtDate(pedido.fecha_entrega_esperada)}\n`
  msg += `\n`
  items.forEach((it, i) => {
    msg += `${i + 1}. ${it.producto_nombre} — ${it.cantidad} ${it.unidad}`
    if ((it.precio_estimado ?? 0) > 0) msg += ` ($${it.precio_estimado})`
    msg += `\n`
  })
  msg += `\n*Total estimado: ${fmtMoney(pedido.total_estimado ?? 0)}*`
  if (pedido.notas) msg += `\n\nNotas: ${pedido.notas}`
  return msg
}

// ── Badge Component ─────────────────────────────────────
function StatusBadge({ status }: { status: EstadoPedido }) {
  const c = STATUS_COLORS[status]
  return (
    <span style={{
      background: c.bg, color: c.text,
      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
    }}>{c.label}</span>
  )
}

// ── Pedido Card ─────────────────────────────────────────
function PedidoCard({ pedido, onClick, onWhatsApp, onPDF }: {
  pedido: Pedido; onClick: () => void; onWhatsApp: () => void; onPDF: () => void
}) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      <button onClick={onClick} style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 14px 10px', width: '100%', textAlign: 'left',
        background: 'none', border: 'none', cursor: 'pointer',
      }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10,
          background: 'var(--navy)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>local_shipping</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)' }}>
              {pedido.proveedor_nombre}
            </span>
            <StatusBadge status={pedido.status as EstadoPedido} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {fmtDate(pedido.fecha_pedido)}
              {pedido.fecha_entrega_esperada && ` → ${fmtDate(pedido.fecha_entrega_esperada)}`}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>
              {fmtMoney(pedido.total_estimado ?? 0)}
            </span>
          </div>
        </div>
      </button>
      {/* Quick actions */}
      <div style={{ padding: '0 14px 10px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={e => { e.stopPropagation(); onWhatsApp() }} style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '9px 14px', borderRadius: 8, minHeight: 44,
          background: '#25D366', color: '#fff', border: 'none',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chat</span>
          WhatsApp
        </button>
        <button onClick={e => { e.stopPropagation(); onPDF() }} style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '9px 14px', borderRadius: 8, minHeight: 44,
          background: 'var(--surface)', color: 'var(--text-2)',
          border: '1px solid var(--border)',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>picture_as_pdf</span>
          PDF
        </button>
      </div>
    </div>
  )
}

// ── Item Row in form ────────────────────────────────────
interface ItemForm {
  producto_nombre: string
  cantidad: string
  unidad: string
  precio_estimado: string
  producto_id: string | null
}

const EMPTY_ITEM: ItemForm = { producto_nombre: '', cantidad: '', unidad: 'kg', precio_estimado: '', producto_id: null }

// ── Nuevo Pedido View ───────────────────────────────────
function NuevoPedidoView({
  proveedores,
  onCrear,
  onCancel,
}: {
  proveedores: Proveedor[]
  onCrear: (datos: Parameters<ReturnType<typeof usePedidos>['crearPedido']>[0]) => Promise<string>
  onCancel: () => void
}) {
  const RESTAURANTE_ID = useRestauranteId()
  const { fetchProductosProveedor } = usePedidos()
  const supabase = createClient()
  const [proveedorId, setProveedorId] = useState('')
  const [proveedorNombre, setProveedorNombre] = useState('')
  const [proveedorSearch, setProveedorSearch] = useState('')
  const [showProvList, setShowProvList] = useState(false)
  const [facturasProvList, setFacturasProvList] = useState<{ nombre: string; id: string | null }[]>([])

  // Cargar proveedores únicos desde facturas (una sola vez)
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const sb = createClient()
    sb.from('facturas')
      .select('proveedor_nombre, proveedor_id')
      .eq('restaurante_id', RESTAURANTE_ID)
      .order('proveedor_nombre')
      .then(({ data }) => {
        if (!data) return
        const seen = new Set<string>()
        const result: { nombre: string; id: string | null }[] = []
        for (const f of data as { proveedor_nombre: string; proveedor_id: string | null }[]) {
          if (!seen.has(f.proveedor_nombre)) {
            seen.add(f.proveedor_nombre)
            result.push({ nombre: f.proveedor_nombre, id: f.proveedor_id })
          }
        }
        setFacturasProvList(result)
      })
  }, [RESTAURANTE_ID])
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<ItemForm[]>([{ ...EMPTY_ITEM }])
  const [sugerencias, setSugerencias] = useState<{ producto_nombre: string; unidad: string; precio_unitario: number }[]>([])
  const [saving, setSaving] = useState(false)
  const [activeItemIdx, setActiveItemIdx] = useState<number | null>(null)
  const [stockSuggestions, setStockSuggestions] = useState<{ nombre: string; unidad: string; precio_unitario: number }[]>([])

  const searchStock = async (query: string) => {
    if (query.length < 2) { setStockSuggestions([]); return }
    const { data } = await supabase.from('productos')
      .select('nombre, unidad, precio_unitario')
      .eq('restaurante_id', RESTAURANTE_ID)
      .ilike('nombre', `%${query}%`)
      .limit(5)
    setStockSuggestions((data ?? []) as { nombre: string; unidad: string; precio_unitario: number }[])
  }

  const allProveedores = useMemo(() => {
    const seen = new Set<string>()
    const result: { nombre: string; id: string | null }[] = []
    for (const p of proveedores) {
      const key = p.nombre.toLowerCase()
      if (!seen.has(key)) { seen.add(key); result.push({ nombre: p.nombre, id: p.id }) }
    }
    for (const f of facturasProvList) {
      const key = f.nombre.toLowerCase()
      if (!seen.has(key)) { seen.add(key); result.push({ nombre: f.nombre, id: f.id }) }
    }
    return result
  }, [proveedores, facturasProvList])

  const provFiltrados = useMemo(() => {
    if (!proveedorSearch.trim()) return allProveedores
    const q = proveedorSearch.toLowerCase()
    return allProveedores.filter(p => p.nombre.toLowerCase().includes(q))
  }, [allProveedores, proveedorSearch])

  const selectProveedor = useCallback(async (nombre: string, id: string | null) => {
    setProveedorId(id ?? '')
    setProveedorNombre(nombre)
    setProveedorSearch(nombre)
    setShowProvList(false)
    const prods = await fetchProductosProveedor(nombre)
    setSugerencias(prods)
  }, [fetchProductosProveedor])

  const addSugerencia = (s: { producto_nombre: string; unidad: string; precio_unitario: number }) => {
    setItems(prev => {
      const emptyIdx = prev.findIndex(it => !it.producto_nombre)
      const newItem: ItemForm = {
        producto_nombre: s.producto_nombre,
        cantidad: '1',
        unidad: s.unidad,
        precio_estimado: String(s.precio_unitario),
        producto_id: null,
      }
      if (emptyIdx >= 0) {
        const copy = [...prev]
        copy[emptyIdx] = newItem
        return copy
      }
      return [...prev, newItem]
    })
  }

  const updateItem = (idx: number, field: keyof ItemForm, value: string) => {
    setItems(prev => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], [field]: value }
      return copy
    })
  }

  const removeItem = (idx: number) => {
    setItems(prev => prev.length <= 1 ? [{ ...EMPTY_ITEM }] : prev.filter((_, i) => i !== idx))
  }

  const total = useMemo(() =>
    items.reduce((s, it) => s + (parseFloat(it.cantidad) || 0) * (parseFloat(it.precio_estimado) || 0), 0)
  , [items])

  const filledItems = items.filter(it => it.producto_nombre && parseFloat(it.cantidad) > 0)
  const canSave = proveedorSearch.trim() && filledItems.length > 0

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await onCrear({
        proveedor_id: proveedorId || null,
        proveedor_nombre: proveedorNombre || proveedorSearch,
        fecha_entrega_esperada: fechaEntrega || null,
        notas: notas || null,
        items: filledItems
          .map(it => ({
            producto_nombre: it.producto_nombre,
            producto_id: it.producto_id,
            cantidad: parseFloat(it.cantidad),
            unidad: it.unidad,
            precio_estimado: parseFloat(it.precio_estimado) || 0,
          })),
      })
    } catch {
      alert('Error al crear pedido')
    } finally {
      setSaving(false)
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, display: 'block',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 12,
    border: '1.5px solid var(--border)', background: 'var(--surface)',
    fontSize: 14, color: 'var(--text-1)',
  }

  const innerInputStyle: React.CSSProperties = {
    padding: '8px 10px', borderRadius: 8,
    border: '1.5px solid var(--border)', fontSize: 13, color: 'var(--text-1)',
    background: 'var(--bg)',
  }

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: '46px 16px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>Nuevo pedido</span>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Proveedor search */}
        <div>
          <label style={labelStyle}>Proveedor</label>
          <input
            value={proveedorSearch}
            onChange={e => { setProveedorSearch(e.target.value); setProveedorId(''); setProveedorNombre(''); setShowProvList(true) }}
            onFocus={() => setShowProvList(true)}
            onBlur={() => setTimeout(() => setShowProvList(false), 150)}
            placeholder="Buscar o escribir proveedor..."
            style={inputStyle}
          />
          {showProvList && (provFiltrados.length > 0 || proveedorSearch.trim()) && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, marginTop: 4, maxHeight: 180, overflowY: 'auto',
            }}>
              {provFiltrados.map(p => (
                <button key={p.nombre} onMouseDown={e => { e.preventDefault(); selectProveedor(p.nombre, p.id) }} style={{
                  display: 'block', width: '100%', padding: '10px 14px',
                  textAlign: 'left', border: 'none', background: 'none',
                  fontSize: 14, color: 'var(--text-1)', cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                </button>
              ))}
              {provFiltrados.length === 0 && proveedorSearch.trim() && (
                <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-3)' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>{proveedorSearch}</span> — nuevo proveedor
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sugerencias from past invoices */}
        {sugerencias.length > 0 && (
          <div>
            <label style={labelStyle}>
              Productos frecuentes de {proveedorNombre}:
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {sugerencias.map(s => (
                <button key={s.producto_nombre} onClick={() => addSugerencia(s)} style={{
                  padding: '8px 12px', borderRadius: 10, fontSize: 13,
                  border: '1.5px solid var(--navy)', background: 'var(--surface)',
                  color: 'var(--text-1)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'background 0.15s',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--navy)' }}>add_circle</span>
                  <span style={{ fontWeight: 600 }}>{s.producto_nombre}</span>
                  <span style={{ color: 'var(--text-3)', fontSize: 12 }}>
                    {fmtMoney(s.precio_unitario)}/{s.unidad}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Fecha entrega */}
        <div>
          <label style={labelStyle}>Fecha entrega esperada</label>
          <input
            type="date"
            value={fechaEntrega}
            onChange={e => setFechaEntrega(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Items */}
        <div>
          <label style={{ ...labelStyle, marginBottom: 8 }}>
            Productos ({items.filter(it => it.producto_nombre).length})
          </label>

          {items.map((item, idx) => (
            <div key={idx} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 14, marginBottom: 8,
            }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    placeholder="Producto"
                    value={item.producto_nombre}
                    onChange={e => {
                      updateItem(idx, 'producto_nombre', e.target.value)
                      setActiveItemIdx(idx)
                      searchStock(e.target.value)
                    }}
                    onFocus={() => setActiveItemIdx(idx)}
                    onBlur={() => { setTimeout(() => setActiveItemIdx(null), 200) }}
                    style={{ ...innerInputStyle, width: '100%' }}
                  />
                  {activeItemIdx === idx && stockSuggestions.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0,
                      background: 'var(--surface)', border: '1.5px solid var(--navy)',
                      borderRadius: 10, marginTop: 4, zIndex: 20,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                      maxHeight: 180, overflowY: 'auto',
                    }}>
                      {stockSuggestions.map(s => (
                        <button
                          key={s.nombre}
                          onMouseDown={e => {
                            e.preventDefault()
                            updateItem(idx, 'producto_nombre', s.nombre)
                            updateItem(idx, 'unidad', s.unidad)
                            updateItem(idx, 'precio_estimado', String(s.precio_unitario))
                            setStockSuggestions([])
                            setActiveItemIdx(null)
                          }}
                          style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            width: '100%', padding: '10px 12px',
                            textAlign: 'left', border: 'none', background: 'none',
                            fontSize: 13, color: 'var(--text-1)', cursor: 'pointer',
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{s.nombre}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                            {fmtMoney(s.precio_unitario)}/{s.unidad}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => removeItem(idx)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>close</span>
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  placeholder="Cant."
                  type="number"
                  inputMode="decimal"
                  value={item.cantidad}
                  onChange={e => updateItem(idx, 'cantidad', e.target.value)}
                  style={{ ...innerInputStyle, width: 70 }}
                />
                <select
                  value={item.unidad}
                  onChange={e => updateItem(idx, 'unidad', e.target.value)}
                  style={{ ...innerInputStyle, width: 70, padding: '8px 6px' }}
                >
                  {['kg', 'u', 'lt', 'g', 'ml', 'docena', 'paquete', 'caja', 'bolsa'].map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <div style={{ position: 'relative', flex: 1 }}>
                  <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-3)' }}>$</span>
                  <input
                    placeholder="Precio"
                    type="number"
                    inputMode="decimal"
                    value={item.precio_estimado}
                    onChange={e => updateItem(idx, 'precio_estimado', e.target.value)}
                    style={{ ...innerInputStyle, width: '100%', paddingLeft: 20 }}
                  />
                </div>
              </div>
              {(parseFloat(item.cantidad) > 0 && parseFloat(item.precio_estimado) > 0) && (
                <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--navy)', fontWeight: 600, marginTop: 6 }}>
                  Subtotal: {fmtMoney(parseFloat(item.cantidad) * parseFloat(item.precio_estimado))}
                </div>
              )}
            </div>
          ))}

          <button onClick={() => setItems(prev => [...prev, { ...EMPTY_ITEM }])} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: '1px dashed var(--border)',
            borderRadius: 12, padding: '10px 14px', width: '100%',
            fontSize: 13, color: 'var(--text-2)', cursor: 'pointer',
            justifyContent: 'center',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            Agregar producto
          </button>
        </div>

        {/* Notas */}
        <div>
          <label style={labelStyle}>Notas (opcional)</label>
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            rows={2}
            placeholder="Instrucciones especiales..."
            style={{
              ...inputStyle,
              fontSize: 13, resize: 'vertical',
            }}
          />
        </div>

        {/* Preview summary */}
        {filledItems.length > 0 && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 16, textAlign: 'center',
          }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}>
              {filledItems.length} {filledItems.length === 1 ? 'producto' : 'productos'}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)' }}>
              {fmtMoney(total)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
              Después de crear podrás enviar por WhatsApp o PDF
            </div>
          </div>
        )}

        {/* Total + Confirm */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'var(--surface)', borderTop: '1px solid var(--border)',
          padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom, 12px), 12px)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          zIndex: 110,
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Total estimado</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{fmtMoney(total)}</div>
          </div>
          <button
            disabled={!canSave || saving}
            onClick={handleSave}
            style={{
              padding: '13px 28px', borderRadius: 12,
              background: canSave ? 'var(--navy)' : '#ccc',
              color: '#fff', border: 'none', fontWeight: 700,
              fontSize: 14, cursor: canSave ? 'pointer' : 'default',
              opacity: saving ? 0.6 : 1,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {saving ? 'Guardando...' : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
                Confirmar pedido
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Detail View ─────────────────────────────────────────
function DetailView({
  pedido,
  items,
  proveedor,
  onBack,
  onEnviar,
  onRecibir,
  onEliminar,
}: {
  pedido: Pedido
  items: PedidoItem[]
  proveedor: Proveedor | undefined
  onBack: () => void
  onEnviar: () => void
  onRecibir: () => void
  onEliminar: () => void
}) {
  const handleWhatsApp = () => {
    const text = encodeURIComponent(buildWhatsAppText(pedido, items))
    const phone = proveedor?.telefono?.replace(/\D/g, '') || ''
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`
    window.open(url, '_blank')
  }

  const handlePDF = () => exportPedidoPDF(pedido, items)

  return (
    <div style={{ paddingBottom: 90 }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: '46px 16px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>{pedido.proveedor_nombre}</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
            {fmtDate(pedido.fecha_pedido)}
            {pedido.fecha_entrega_esperada && ` - Entrega: ${fmtDate(pedido.fecha_entrega_esperada)}`}
          </div>
        </div>
        <StatusBadge status={pedido.status as EstadoPedido} />
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleWhatsApp} style={{
            flex: 1, padding: '10px 0', borderRadius: 10,
            background: '#25D366', color: '#fff', border: 'none',
            fontWeight: 600, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chat</span>
            WhatsApp
          </button>
          <button onClick={handlePDF} style={{
            flex: 1, padding: '10px 0', borderRadius: 10,
            background: 'var(--surface)', color: 'var(--text-1)',
            border: '1px solid var(--border)',
            fontWeight: 600, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>picture_as_pdf</span>
            PDF
          </button>
        </div>

        {/* Items list */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid var(--border)',
            fontSize: 12, fontWeight: 600, color: 'var(--text-2)',
          }}>
            Productos ({items.length})
          </div>
          {items.map((it, i) => (
            <div key={it.id} style={{
              padding: '10px 14px', display: 'flex', justifyContent: 'space-between',
              borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
                  {it.producto_nombre}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {it.cantidad} {it.unidad}
                  {it.recibido && (
                    <span style={{ color: '#059669', marginLeft: 6 }}>
                      Recibido{it.cantidad_recibida != null ? `: ${it.cantidad_recibida} ${it.unidad}` : ''}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
                  {fmtMoney(it.cantidad * (it.precio_estimado ?? 0))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  {fmtMoney(it.precio_estimado ?? 0)}/{it.unidad ?? ''}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', padding: '12px 14px',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        }}>
          <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>Total estimado</span>
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)' }}>
            {fmtMoney(pedido.total_estimado ?? 0)}
          </span>
        </div>

        {/* Notas */}
        {pedido.notas && (
          <div style={{
            padding: '10px 14px', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 12,
            fontSize: 13, color: 'var(--text-2)',
          }}>
            <span style={{ fontWeight: 600 }}>Notas:</span> {pedido.notas}
          </div>
        )}

        {/* Status actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {pedido.status === 'borrador' && (
            <button onClick={onEnviar} style={{
              padding: '12px', borderRadius: 10,
              background: '#1d4ed8', color: '#fff', border: 'none',
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>send</span>
              Marcar como enviado
            </button>
          )}
          {(pedido.status === 'enviado' || pedido.status === 'parcial') && (
            <button onClick={onRecibir} style={{
              padding: '12px', borderRadius: 10,
              background: '#059669', color: '#fff', border: 'none',
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>inventory_2</span>
              Recibir mercaderia
            </button>
          )}
          {pedido.status === 'borrador' && (
            <button onClick={onEliminar} style={{
              padding: '10px', borderRadius: 10,
              background: 'none', color: '#ef4444',
              border: '1px solid #fecaca',
              fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>
              Eliminar pedido
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Recibir View ────────────────────────────────────────
function RecibirView({
  pedido,
  items: initialItems,
  onBack,
  onConfirm,
}: {
  pedido: Pedido
  items: PedidoItem[]
  onBack: () => void
  onConfirm: (items: PedidoItem[]) => Promise<void>
}) {
  const [items, setItems] = useState<PedidoItem[]>(initialItems.map(it => ({ ...it })))
  const [saving, setSaving] = useState(false)

  const toggleRecibido = (idx: number) => {
    setItems(prev => {
      const copy = [...prev]
      copy[idx] = {
        ...copy[idx],
        recibido: !copy[idx].recibido,
        cantidad_recibida: !copy[idx].recibido ? copy[idx].cantidad : null,
      }
      return copy
    })
  }

  const setCantidad = (idx: number, val: string) => {
    setItems(prev => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], cantidad_recibida: val ? parseFloat(val) : null }
      return copy
    })
  }

  const handleConfirm = async () => {
    setSaving(true)
    try { await onConfirm(items) } finally { setSaving(false) }
  }

  const recibidos = items.filter(it => it.recibido).length

  return (
    <div style={{ paddingBottom: 90 }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: '46px 16px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>Recibir mercaderia</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{pedido.proveedor_nombre}</div>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{
          padding: '10px 14px', background: '#dbeafe', borderRadius: 10,
          fontSize: 13, color: '#1d4ed8', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>info</span>
          Marca los productos recibidos y ajusta cantidades si es necesario
        </div>

        {items.map((it, idx) => (
          <div key={it.id} style={{
            background: 'var(--surface)', border: `1px solid ${it.recibido ? '#059669' : 'var(--border)'}`,
            borderRadius: 10, padding: 12, marginBottom: 8,
            transition: 'border-color 0.2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => toggleRecibido(idx)} style={{
                width: 28, height: 28, borderRadius: 8, border: 'none',
                background: it.recibido ? '#059669' : '#e5e7eb',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}>
                {it.recibido && (
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>check</span>
                )}
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>
                  {it.producto_nombre}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  Pedido: {it.cantidad} {it.unidad}
                </div>
              </div>
            </div>
            {it.recibido && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 38 }}>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Recibido:</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={it.cantidad_recibida ?? ''}
                  onChange={e => setCantidad(idx, e.target.value)}
                  style={{
                    width: 80, padding: '6px 8px', borderRadius: 8,
                    border: '1px solid #059669', fontSize: 13, color: 'var(--text-1)',
                    background: 'var(--bg)',
                  }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{it.unidad}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Confirm bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        zIndex: 50,
      }}>
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
          {recibidos}/{items.length} recibidos
        </div>
        <button
          disabled={recibidos === 0 || saving}
          onClick={handleConfirm}
          style={{
            padding: '12px 24px', borderRadius: 10,
            background: recibidos > 0 ? '#059669' : '#ccc',
            color: '#fff', border: 'none', fontWeight: 700,
            fontSize: 14, cursor: recibidos > 0 ? 'pointer' : 'default',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Procesando...' : 'Confirmar recepcion'}
        </button>
      </div>
    </div>
  )
}

// ── Toast ────────────────────────────────────────────────
function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t) }, [onDone])
  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      background: '#1e293b', color: '#fff', padding: '10px 20px',
      borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 100,
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    }}>
      {msg}
    </div>
  )
}

// ── MAIN PAGE ───────────────────────────────────────────
type View = 'list' | 'nuevo' | 'detail' | 'recibir'

export default function PedidosPage() {
  const RESTAURANTE_ID = useRestauranteId()
  const { pedidos, loading, crearPedido, actualizarStatus, recibirPedido, eliminarPedido, fetchItems } = usePedidos()
  const { proveedores } = useProveedores()

  const [view, setView] = useState<View>('list')
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null)
  const [selectedItems, setSelectedItems] = useState<PedidoItem[]>([])
  const [toast, setToast] = useState('')
  const [filter, setFilter] = useState<'todos' | EstadoPedido>('todos')

  const filtered = useMemo(() => {
    if (filter === 'todos') return pedidos
    return pedidos.filter(p => p.status === filter)
  }, [pedidos, filter])

  useEffect(() => {
    const borradores = pedidos.filter(p => p.status === 'borrador').length
    const enviados = pedidos.filter(p => p.status === 'enviado').length
    const pendienteRecepcion = pedidos.filter(p => p.status === 'enviado' || p.status === 'parcial').length
    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'pedidos',
      total: pedidos.length,
      borradores,
      enviados,
      pendienteRecepcion,
      filter,
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [pedidos, filter])

  const openDetail = async (pedido: Pedido) => {
    const items = await fetchItems(pedido.id)
    setSelectedPedido(pedido)
    setSelectedItems(items)
    setView('detail')
  }

  const handleCrear = async (datos: Parameters<typeof crearPedido>[0]) => {
    const id = await crearPedido(datos)
    setToast('Pedido confirmado')
    setView('list')
    return id
  }

  const handleEnviar = async () => {
    if (!selectedPedido) return
    await actualizarStatus(selectedPedido.id, 'enviado')
    setToast('Pedido marcado como enviado')
    setView('list')
  }

  const handleRecibir = async (items: PedidoItem[]) => {
    if (!selectedPedido) return
    const status = await recibirPedido(selectedPedido.id, items)
    setToast(status === 'recibido' ? 'Pedido recibido completo' : 'Pedido recibido parcialmente')
    setView('list')
  }

  const handleEliminar = async () => {
    if (!selectedPedido) return
    if (!confirm('Eliminar este pedido?')) return
    await eliminarPedido(selectedPedido.id)
    setToast('Pedido eliminado')
    setView('list')
  }

  const handleQuickWhatsApp = async (pedido: Pedido) => {
    const items = await fetchItems(pedido.id)
    const prov = proveedores.find(p => p.id === pedido.proveedor_id)
    const text = encodeURIComponent(buildWhatsAppText(pedido, items))
    const phone = prov?.telefono?.replace(/\D/g, '') || ''
    window.open(phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`, '_blank')
  }

  const handleQuickPDF = async (pedido: Pedido) => {
    const items = await fetchItems(pedido.id)
    exportPedidoPDF(pedido, items)
  }

  // ── Recibir View ──
  if (view === 'recibir' && selectedPedido) {
    return (
      <>
        <RecibirView
          pedido={selectedPedido}
          items={selectedItems}
          onBack={() => setView('detail')}
          onConfirm={handleRecibir}
        />
        {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      </>
    )
  }

  // ── Detail View ──
  if (view === 'detail' && selectedPedido) {
    const prov = proveedores.find(p => p.id === selectedPedido.proveedor_id)
    return (
      <>
        <DetailView
          pedido={selectedPedido}
          items={selectedItems}
          proveedor={prov}
          onBack={() => setView('list')}
          onEnviar={handleEnviar}
          onRecibir={() => setView('recibir')}
          onEliminar={handleEliminar}
        />
        {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      </>
    )
  }

  // ── Nuevo View ──
  if (view === 'nuevo') {
    return (
      <>
        <NuevoPedidoView
          proveedores={proveedores}
          onCrear={handleCrear}
          onCancel={() => setView('list')}
        />
        {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      </>
    )
  }

  // ── List View ──
  return (
    <PageTransition>
    <div className="scroll-body">
      <PageHeader
        title="Pedidos"
        icon="shopping_cart"
        subtitle={loading ? '…' : `${pedidos.length} pedido${pedidos.length !== 1 ? 's' : ''}`}
        actions={<ActionButton icon="add" label="Nuevo pedido" onClick={() => setView('nuevo')} />}
        below={
          <div data-coach-target="pedidos-filtros" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {(['todos', 'borrador', 'enviado', 'parcial', 'recibido'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '5px 12px', borderRadius: 20, border: 'none',
                  background: filter === f ? '#fff' : 'rgba(255,255,255,0.12)',
                  color: filter === f ? 'var(--navy)' : 'rgba(255,255,255,0.8)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  fontFamily: 'inherit',
                }}
              >
                {f === 'todos' ? 'Todos' : STATUS_COLORS[f].label}
              </button>
            ))}
          </div>
        }
      />

      {/* Content */}
      <div data-coach-target="pedidos-lista" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
            Cargando...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 40,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--text-3)' }}>
              local_shipping
            </span>
            <p style={{ color: 'var(--text-3)', fontSize: 13 }}>
              {filter === 'todos' ? 'No hay pedidos todavia' : `No hay pedidos ${STATUS_COLORS[filter].label.toLowerCase()}`}
            </p>
            <button onClick={() => setView('nuevo')} style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: 'var(--navy)', color: '#fff', fontWeight: 600,
              fontSize: 13, cursor: 'pointer', marginTop: 4,
            }}>
              Crear primer pedido
            </button>
          </div>
        ) : (
          <motion.div
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
            initial="hidden"
            animate="show"
          >
            {filtered.map(p => (
              <motion.div
                key={p.id}
                variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.2 } } }}
              >
                <PedidoCard
                  pedido={p}
                  onClick={() => openDetail(p)}
                  onWhatsApp={() => handleQuickWhatsApp(p)}
                  onPDF={() => handleQuickPDF(p)}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
    </PageTransition>
  )
}
