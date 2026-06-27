'use client'

import { useMemo, useState } from 'react'

export interface CartItem {
  producto_id: string
  nombre: string
  unidad: string
  precio_unitario: number
  proveedor_id: string | null
  cantidad: number
}

interface ProveedorLite {
  id: string
  nombre: string
}

interface Props {
  cart: CartItem[]
  proveedores: ProveedorLite[]
  onUpdateQty: (productoId: string, cantidad: number) => void
  onRemove: (productoId: string) => void
  onClear: () => void
  onConfirm: (notas: string) => Promise<void>
  open: boolean
  onToggle: (open: boolean) => void
}

function fmtP(n: number) {
  if (!n) return '$0'
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

const SIN_PROVEEDOR = '__sin__'

export default function CarritoCompras({
  cart, proveedores, onUpdateQty, onRemove, onClear, onConfirm, open, onToggle,
}: Props) {
  const [saving, setSaving] = useState(false)
  const [notas, setNotas] = useState('')

  const provName = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of proveedores) m.set(p.id, p.nombre)
    return m
  }, [proveedores])

  const totalGeneral = cart.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0)
  const nItems = cart.length

  // Group by proveedor
  const grupos = useMemo(() => {
    const map = new Map<string, CartItem[]>()
    for (const it of cart) {
      const key = it.proveedor_id ?? SIN_PROVEEDOR
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(it)
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      nombre: key === SIN_PROVEEDOR ? 'Sin proveedor asignado' : (provName.get(key) ?? 'Proveedor'),
      items,
      subtotal: items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0),
    }))
  }, [cart, provName])

  async function handleConfirm() {
    setSaving(true)
    try {
      await onConfirm(notas)
      setNotas('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Botón flotante del carrito */}
      {nItems > 0 && !open && (
        <button
          onClick={() => onToggle(true)}
          style={{
            position: 'fixed', bottom: 110, right: 16, zIndex: 90,
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--navy)', color: '#fff', border: 'none',
            borderRadius: 999, padding: '12px 18px', cursor: 'pointer',
            boxShadow: '0 6px 24px rgba(0,0,0,.35)', fontFamily: 'inherit',
          }}
        >
          <span style={{ position: 'relative', display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>shopping_cart</span>
            <span style={{
              position: 'absolute', top: -7, right: -9, background: '#ef4444', color: '#fff',
              borderRadius: 999, minWidth: 17, height: 17, fontSize: 10, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
            }}>{nItems}</span>
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{fmtP(totalGeneral)}</span>
        </button>
      )}

      {/* Bottom sheet del carrito */}
      {open && (
        <div
          onClick={() => onToggle(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 300, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg)', borderRadius: '20px 20px 0 0', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
          >
            {/* Header */}
            <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--accent)' }}>shopping_cart</span>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Carrito de compras</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{nItems} producto{nItems !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <button onClick={() => onToggle(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-2)', display: 'flex' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
              </button>
            </div>

            {/* Items agrupados por proveedor */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px' }}>
              {nItems === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 40, opacity: 0.4 }}>remove_shopping_cart</span>
                  <p style={{ fontSize: 13, marginTop: 8 }}>El carrito está vacío</p>
                </div>
              ) : grupos.map(grupo => (
                <div key={grupo.key} style={{ marginBottom: 16 }}>
                  {/* Encabezado proveedor */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 15, color: grupo.key === SIN_PROVEEDOR ? '#f59e0b' : 'var(--accent)' }}>
                        {grupo.key === SIN_PROVEEDOR ? 'help' : 'local_shipping'}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{grupo.nombre}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', fontFamily: "'DM Mono', monospace" }}>{fmtP(grupo.subtotal)}</span>
                  </div>

                  {/* Items del grupo */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {grupo.items.map(it => (
                      <div key={it.producto_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.nombre}</p>
                          <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '1px 0 0' }}>
                            {fmtP(it.precio_unitario)} / {it.unidad}
                            {it.precio_unitario === 0 && <span style={{ color: '#f59e0b', marginLeft: 4 }}>· sin precio</span>}
                          </p>
                        </div>

                        {/* Stepper de cantidad */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <button
                            onClick={() => onUpdateQty(it.producto_id, Math.max(0, +(it.cantidad - 1).toFixed(2)))}
                            style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>remove</span>
                          </button>
                          <input
                            type="number"
                            value={it.cantidad}
                            onChange={e => onUpdateQty(it.producto_id, Math.max(0, parseFloat(e.target.value) || 0))}
                            style={{ width: 48, textAlign: 'center', fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace", background: 'var(--bg)', color: 'var(--text-1)', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 2px', outline: 'none' }}
                          />
                          <button
                            onClick={() => onUpdateQty(it.producto_id, +(it.cantidad + 1).toFixed(2))}
                            style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                          </button>
                        </div>

                        {/* Subtotal item */}
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', fontFamily: "'DM Mono', monospace", minWidth: 60, textAlign: 'right', flexShrink: 0 }}>
                          {fmtP(it.cantidad * it.precio_unitario)}
                        </span>

                        {/* Eliminar */}
                        <button onClick={() => onRemove(it.producto_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-3)', flexShrink: 0, display: 'flex' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {nItems > 0 && (
                <>
                  <input
                    value={notas}
                    onChange={e => setNotas(e.target.value)}
                    placeholder="Notas para el pedido (opcional)…"
                    style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none', marginTop: 4 }}
                  />
                  <button
                    onClick={onClear}
                    style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>delete</span>
                    Vaciar carrito
                  </button>
                </>
              )}
            </div>

            {/* Footer con total + crear pedido */}
            {nItems > 0 && (
              <div style={{ padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
                    Total estimado {grupos.length > 1 && <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>· {grupos.length} pedidos</span>}
                  </span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', fontFamily: "'DM Mono', monospace" }}>{fmtP(totalGeneral)}</span>
                </div>
                <button
                  onClick={handleConfirm}
                  disabled={saving}
                  style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 19 }}>{saving ? 'progress_activity' : 'check_circle'}</span>
                  {saving ? 'Creando pedido…' : grupos.length > 1 ? `Crear ${grupos.length} pedidos` : 'Crear pedido'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
