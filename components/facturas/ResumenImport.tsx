'use client'

// Resumen post-import de facturas (Fudo y demás POS): qué entró, qué se
// actualizó, qué precios de stock se movieron y qué ítems quedaron sin producto.
// Compartido por ExcelPOSImportModal y ImportadorUniversal.

import { Num } from '@/components/ui'

export interface ResultadoImport {
  importadas: number
  actualizadas?: number
  sin_cambios?: number
  items: number
  omitidas: number
  cambios_precio?: Array<{ producto: string; unidad: string; precio_anterior: number; precio_nuevo: number; delta_pct: number; pendiente?: boolean; origen?: string }>
  total_cambios_precio?: number
  sin_vincular?: Array<{ nombre: string; veces: number; gasto: number; ultimo_precio: number; unidad: string }>
  total_sin_vincular?: number
}

const fmt = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: n < 100 ? 2 : 0 })

export default function ResumenImport({ r, onVerPrecios }: { r: ResultadoImport; onVerPrecios?: () => void }) {
  const todos = r.cambios_precio ?? []
  const aRevisar = todos.filter(c => c.pendiente)
  const cambios = todos.filter(c => !c.pendiente)
  const totalCambios = (r.total_cambios_precio ?? todos.length) - aRevisar.length
  const sinVincular = r.total_sin_vincular ?? 0
  const sube = cambios.filter(c => c.delta_pct > 0).length
  const baja = cambios.filter(c => c.delta_pct < 0).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: 'rgba(22,101,52,.1)', border: '1px solid rgba(22,101,52,.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green-fg)', marginBottom: 10 }}>✓ Importación completada</div>
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-1)', fontSize: 14, lineHeight: 1.8 }}>
          <li>{r.importadas} facturas nuevas</li>
          {(r.actualizadas ?? 0) > 0 && <li>{r.actualizadas} ya estaban cargadas y se actualizaron (pago, vencimiento, impuestos)</li>}
          {(r.sin_cambios ?? 0) > 0 && <li>{r.sin_cambios} ya estaban cargadas y no cambiaron</li>}
          <li>{r.items} ítems de mercadería</li>
          {r.omitidas > 0 && <li>{r.omitidas} omitidas (canceladas o vacías)</li>}
        </ul>
      </div>

      {aRevisar.length > 0 && (
        <div style={{ background: 'var(--amber-bg)', borderRadius: 12, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--amber-fg)' }}>rule</span>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber-fg)' }}>
              {aRevisar.length} cambio{aRevisar.length !== 1 ? 's' : ''} de más de ±50% quedaron sin aplicar
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--amber-fg)', opacity: 0.85, marginTop: 4 }}>
            {aRevisar.slice(0, 4).map(c => `${c.producto} (${c.delta_pct > 0 ? '+' : ''}${c.delta_pct.toFixed(0)}%)`).join(' · ')}{aRevisar.length > 4 ? '…' : ''}
          </div>
          {onVerPrecios && (
            <button onClick={onVerPrecios} style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--amber-fg)', fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'inherit' }}>
              Revisarlos
            </button>
          )}
        </div>
      )}

      {totalCambios > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>sell</span>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
              {totalCambios} precio{totalCambios !== 1 ? 's' : ''} de stock actualizado{totalCambios !== 1 ? 's' : ''}
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>{sube} suben · {baja} bajan</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {cambios.slice(0, 8).map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 12 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-1)', fontWeight: 600 }}>{c.producto}</span>
                <Num><span style={{ color: 'var(--text-3)' }}>{fmt(c.precio_anterior)}</span></Num>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-3)' }}>arrow_forward</span>
                <Num><span style={{ color: 'var(--text-1)', fontWeight: 700 }}>{fmt(c.precio_nuevo)}</span></Num>
                <span style={{ minWidth: 48, textAlign: 'right', fontWeight: 700, color: c.delta_pct > 15 ? '#ef4444' : c.delta_pct > 0 ? '#f59e0b' : '#10b981' }}>
                  {c.delta_pct > 0 ? '+' : ''}{c.delta_pct.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
          {onVerPrecios && (
            <button onClick={onVerPrecios} style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
              Ver todos los cambios y deshacer alguno →
            </button>
          )}
        </div>
      )}

      {sinVincular > 0 && (
        <div style={{ background: 'var(--amber-bg)', borderRadius: 12, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--amber-fg)' }}>link_off</span>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber-fg)' }}>
              {sinVincular} producto{sinVincular !== 1 ? 's' : ''} de las facturas no están en tu stock
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--amber-fg)', opacity: 0.85, marginTop: 4 }}>
            Esos precios no se actualizaron. Vinculalos una vez y los próximos imports los reconocen solos.
          </div>
          {onVerPrecios && (
            <button onClick={onVerPrecios} style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--amber-fg)', fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'inherit' }}>
              Vincular ahora
            </button>
          )}
        </div>
      )}
    </div>
  )
}
