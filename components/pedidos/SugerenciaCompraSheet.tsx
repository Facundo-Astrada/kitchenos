'use client'

import { useEffect, useState } from 'react'
import type { SugerenciaCompraResultado, SugerenciaCompraItem } from '@/lib/compras/sugerencia'

function labelEntrega(dias: number | null): string {
  if (dias === null) return 'sin días de entrega cargados'
  if (dias === 0) return 'entrega hoy'
  if (dias === 1) return 'entrega mañana'
  return `entrega en ${dias} días`
}

interface Props {
  onCrearPedido: (datos: { proveedorId: string | null; proveedorNombre: string; items: { producto_nombre: string; producto_id: string | null; cantidad: number; unidad: string; precio_estimado: number }[] }) => void
  onClose: () => void
}

export default function SugerenciaCompraSheet({ onCrearPedido, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SugerenciaCompraResultado | null>(null)
  const [seleccion, setSeleccion] = useState<Record<string, { checked: boolean; cantidad: number }>>({})

  useEffect(() => {
    let cancel = false
    fetch('/api/compras/sugerencia')
      .then(r => r.json())
      .then((d: SugerenciaCompraResultado & { error?: string }) => {
        if (cancel) return
        if (d.error) { setError(d.error); return }
        setData(d)
        const sel: Record<string, { checked: boolean; cantidad: number }> = {}
        for (const g of d.grupos) for (const it of g.items) sel[it.productoId] = { checked: true, cantidad: it.aPedir }
        setSeleccion(sel)
      })
      .catch((e: Error) => !cancel && setError(e.message))
      .finally(() => !cancel && setLoading(false))
    return () => { cancel = true }
  }, [])

  function crearPedidoDeGrupo(proveedorId: string | null, proveedorNombre: string, items: SugerenciaCompraItem[]) {
    const elegidos = items.filter(it => seleccion[it.productoId]?.checked && seleccion[it.productoId].cantidad > 0)
    if (elegidos.length === 0) return
    onCrearPedido({
      proveedorId,
      proveedorNombre,
      items: elegidos.map(it => ({
        producto_nombre: it.nombre,
        producto_id: it.productoId,
        cantidad: seleccion[it.productoId].cantidad,
        unidad: it.unidad,
        precio_estimado: it.precioUnitario,
      })),
    })
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 16px 12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#8b5cf6' }}>auto_awesome</span>
              Sugerir pedido
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {data ? `Según lo que conviene producir para ${data.fechaObjetivo}` : 'Calculando…'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-3)' }}>close</span>
          </button>
        </div>

        {data?.narracionFactor && (
          <div style={{
            margin: '10px 16px 0', padding: '10px 12px', borderRadius: 10,
            background: 'rgba(20,184,166,.1)', display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#0d9488', flexShrink: 0, marginTop: 1 }}>event_seat</span>
            <span style={{ fontSize: 12, color: '#0d9488', fontWeight: 600, lineHeight: 1.4 }}>{data.narracionFactor}</span>
          </div>
        )}

        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px' }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Calculando consumo previsto…</span>
              <style>{'@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}'}</style>
            </div>
          )}
          {error && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#ef4444' }}>{error}</div>
          )}
          {!loading && !error && data && data.grupos.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 16px', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--text-3)' }}>inventory_2</span>
              <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', margin: 0, maxWidth: 300 }}>
                Con el stock actual no hace falta comprar nada para lo que conviene producir mañana (o no hay suficientes recetas con ingredientes vinculados a productos y receta.porciones cargado).
              </p>
            </div>
          )}
          {!loading && !error && data && data.grupos.map(g => {
            const totalGrupo = g.items.filter(it => seleccion[it.productoId]?.checked).length
            return (
              <div key={g.proveedorId ?? 'sin-proveedor'} style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{g.proveedorNombre}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{labelEntrega(g.diasHastaEntrega)}</div>
                  </div>
                  <button
                    onClick={() => crearPedidoDeGrupo(g.proveedorId, g.proveedorNombre, g.items)}
                    disabled={totalGrupo === 0}
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: 'none', fontFamily: 'inherit',
                      fontSize: 11, fontWeight: 700, cursor: totalGrupo === 0 ? 'default' : 'pointer',
                      background: totalGrupo === 0 ? 'var(--border)' : 'var(--navy)',
                      color: totalGrupo === 0 ? 'var(--text-3)' : '#fff',
                    }}
                  >
                    Crear pedido ({totalGrupo})
                  </button>
                </div>
                {g.items.map(it => {
                  const sel = seleccion[it.productoId] ?? { checked: false, cantidad: it.aPedir }
                  return (
                    <div key={it.productoId} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <button
                        onClick={() => setSeleccion(prev => ({ ...prev, [it.productoId]: { ...sel, checked: !sel.checked } }))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: sel.checked ? '#22c55e' : 'var(--border)' }}>
                          {sel.checked ? 'check_circle' : 'radio_button_unchecked'}
                        </span>
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{it.nombre}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                          consumo previsto {it.consumoPrevisto} {it.unidad} · stock {it.stockActual}
                        </div>
                      </div>
                      <input
                        type="number"
                        value={sel.cantidad}
                        onChange={e => setSeleccion(prev => ({ ...prev, [it.productoId]: { ...sel, cantidad: parseFloat(e.target.value) || 0 } }))}
                        style={{
                          width: 64, padding: '6px 4px', textAlign: 'center', borderRadius: 8, border: '1px solid var(--border)',
                          background: 'var(--bg)', color: 'var(--text-1)', fontSize: 13, fontFamily: "'DM Mono', monospace",
                        }}
                      />
                      <span style={{ fontSize: 10, color: 'var(--text-3)', width: 28 }}>{it.unidad}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
          {data && data.recetasSinPorciones > 0 && (
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
              {data.recetasSinPorciones} receta{data.recetasSinPorciones > 1 ? 's' : ''} sugerida{data.recetasSinPorciones > 1 ? 's' : ''} para producción no tiene{data.recetasSinPorciones > 1 ? 'n' : ''} "porciones" cargado — no se pudo calcular su consumo de insumos.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
