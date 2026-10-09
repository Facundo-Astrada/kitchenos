'use client'

// Botón "Filtros" + popover de la lista de Compras. Los valores viven en la
// pantalla (alimentan la consulta a la base); acá solo se editan.

import { useState } from 'react'
import type { CategoriaGasto, MedioPago, TipoFactura } from '@/types'

export interface ValoresFiltros {
  categoria: string
  estado: string
  proveedor: string
  medio: string
  tipo: string
  desde: string
  hasta: string
}

export const FILTROS_VACIOS: ValoresFiltros = { categoria: '', estado: '', proveedor: '', medio: '', tipo: '', desde: '', hasta: '' }

const ESTADOS: Array<[string, string]> = [['pendiente', 'Pendiente'], ['confirmada', 'Confirmada'], ['pagada', 'Pagada'], ['observada', 'Observada']]
const TIPOS: Array<[TipoFactura, string]> = [['A', 'Factura A'], ['B', 'Factura B'], ['C', 'Factura C'], ['X', 'Factura X'], ['remito', 'Remito'], ['ticket', 'Ticket']]

const sel: React.CSSProperties = { padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', outline: 'none', width: '100%' }

export default function FiltrosCompras({ valores, onChange, categorias, proveedores, medios }: {
  valores: ValoresFiltros
  onChange: (v: ValoresFiltros) => void
  categorias: CategoriaGasto[]
  proveedores: Array<{ id: string; nombre: string }>
  medios: MedioPago[]
}) {
  const [abierto, setAbierto] = useState(false)
  const n = Object.values(valores).filter(Boolean).length
  const set = (k: keyof ValoresFiltros) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => onChange({ ...valores, [k]: e.target.value })

  return (
    <div style={{ position: 'relative', marginLeft: 'auto' }}>
      <button
        onClick={() => setAbierto(v => !v)}
        className="px-[10px] py-[4px] rounded-full border-none cursor-pointer text-[11px] font-semibold"
        style={{ display: 'flex', alignItems: 'center', gap: 4, background: n > 0 ? 'white' : 'rgba(255,255,255,0.15)', color: n > 0 ? 'var(--navy)' : 'rgba(255,255,255,0.7)' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>tune</span>
        Filtros{n > 0 && <span>· {n}</span>}
      </button>

      {abierto && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setAbierto(false)} />
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 200, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, width: 260, boxShadow: 'var(--shadow-3)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <select value={valores.categoria} onChange={set('categoria')} style={sel}>
              <option value="">Categoría: todas</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <select value={valores.estado} onChange={set('estado')} style={sel}>
              <option value="">Estado: todos</option>
              {ESTADOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={valores.proveedor} onChange={set('proveedor')} style={sel}>
              <option value="">Proveedor: todos</option>
              {proveedores.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
            </select>
            <select value={valores.medio} onChange={set('medio')} style={sel}>
              <option value="">Medio de pago: todos</option>
              {medios.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
            <select value={valores.tipo} onChange={set('tipo')} style={sel}>
              <option value="">Comprobante: todos</option>
              {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 6 }}>
              <label style={{ flex: 1, fontSize: 10, fontWeight: 700, color: 'var(--text-3)' }}>DESDE
                <input type="date" value={valores.desde} onChange={set('desde')} style={{ ...sel, marginTop: 2 }} />
              </label>
              <label style={{ flex: 1, fontSize: 10, fontWeight: 700, color: 'var(--text-3)' }}>HASTA
                <input type="date" value={valores.hasta} onChange={set('hasta')} style={{ ...sel, marginTop: 2 }} />
              </label>
            </div>
            {n > 0 && (
              <button onClick={() => onChange(FILTROS_VACIOS)}
                style={{ ...sel, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'transparent', border: 'none', color: 'var(--accent)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>Limpiar filtros
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
