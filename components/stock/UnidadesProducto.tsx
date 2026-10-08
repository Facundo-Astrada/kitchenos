'use client'

import { useState } from 'react'
import { parsePrecio } from '@/lib/unidades'

// "Unidades y envase" de la ficha de producto en Stock. Antes vivían dentro de
// "Más opciones" (y el envase en un segundo desplegable): nadie las
// encontraba, y son justo lo que hace que una receta en unidades o una factura
// por pack cuadren con el stock. Separado de stock/ClientView.tsx por el techo
// de líneas (ratchets.test.ts).
//
// El modelo: la Unidad del producto es en la que se usa y se cuenta (la hoja
// de nori = "unidad") y el precio es el de ESA unidad. El envase es cómo se
// compra: "pack de 12". Con eso una factura de 1 pack entra como 12 unidades
// a precio/12 (lib/stock/precios.ts → aUnidadDelProducto).

export interface UnidadesProductoValores {
  peso_por_unidad_g: string
  unidad_compra: string
  cantidad_por_envase: string
}

// Unidades del selector que en realidad son envases: si alguien elige "caja"
// como Unidad, el costo de las recetas sale por caja entera.
const ENVASES = ['caja', 'bolsa', 'lata', 'botella', 'docena', 'pack']

function fmt(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

export function UnidadesProductoFields({ unidad, valores, onChange, precio, onPrecio, labelStyle, inputStyle }: {
  /** Unidad principal del producto (la del precio). */
  unidad: string
  valores: UnidadesProductoValores
  onChange: (patch: Partial<UnidadesProductoValores>) => void
  /** Precio unitario del form (texto, coma decimal) — el del pack se reparte en él. */
  precio: string
  onPrecio: (v: string) => void
  labelStyle: React.CSSProperties
  inputStyle: React.CSSProperties
}) {
  const cpe = parsePrecio(valores.cantidad_por_envase)
  const envase = valores.unidad_compra.trim()
  const conEnvase = !!envase && cpe > 0
  const unidadEsEnvase = ENVASES.includes(unidad.toLowerCase())

  // Precio del pack: se muestra derivado (precio × cantidad) salvo mientras se
  // tipea, para no reformatear bajo el dedo.
  const [packTipeado, setPackTipeado] = useState<string | null>(null)
  const precioN = parsePrecio(precio)
  const packDerivado = conEnvase && precioN > 0 ? String(Math.round(precioN * cpe * 100) / 100).replace('.', ',') : ''

  function cambiarPack(v: string) {
    setPackTipeado(v)
    const pack = parsePrecio(v)
    if (cpe > 0) onPrecio(pack > 0 ? String(Math.round((pack / cpe) * 100) / 100).replace('.', ',') : '')
  }

  const resumen: string[] = []
  if (conEnvase) resumen.push(`1 ${envase} = ${fmt(cpe)} ${unidad}${precioN > 0 ? ` → $${fmt(precioN)} c/${unidad}` : ''}`)
  if (valores.peso_por_unidad_g.trim()) {
    const g = parsePrecio(valores.peso_por_unidad_g)
    if (g > 0) resumen.push(`1 unidad pesa ${fmt(g)} g`)
  }

  const campo: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 12,
      background: 'var(--bg)', border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--accent)' }}>scale</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>Unidades y envase</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>· para que recetas y facturas cuadren</span>
      </div>

      {unidadEsEnvase && (
        <div style={{ display: 'flex', gap: 6, padding: '7px 9px', borderRadius: 8, background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.3)', fontSize: 11.5, color: 'var(--text-1)', lineHeight: 1.4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#b45309', flexShrink: 0 }}>lightbulb</span>
          <span>
            ¿Lo comprás por {unidad}? Poné arriba <b>Unidad = unidad</b> (o kg) — lo que usás en las recetas —
            y acá <b>Se compra por {unidad}</b> con cuántas trae. Si no, cada receta lo costea por {unidad} entera.
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={campo}>
          <span style={labelStyle}>Se compra por</span>
          <input
            value={valores.unidad_compra}
            onChange={e => onChange({ unidad_compra: e.target.value })}
            placeholder="pack, caja, bolsa…"
            style={inputStyle}
          />
        </label>
        <label style={campo}>
          <span style={labelStyle}>Trae ({unidad})</span>
          <input
            type="text" inputMode="decimal"
            value={valores.cantidad_por_envase}
            onChange={e => onChange({ cantidad_por_envase: e.target.value })}
            placeholder="Ej: 12"
            style={inputStyle}
          />
        </label>
        {conEnvase && (
          <label style={campo}>
            <span style={labelStyle}>Precio del {envase} ($)</span>
            <input
              type="text" inputMode="decimal"
              value={packTipeado ?? packDerivado}
              onChange={e => cambiarPack(e.target.value)}
              onBlur={() => setPackTipeado(null)}
              placeholder="Ej: 10000"
              style={inputStyle}
            />
          </label>
        )}
        <label style={campo}>
          <span style={labelStyle}>Peso de 1 unidad (g)</span>
          <input
            type="text" inputMode="decimal"
            value={valores.peso_por_unidad_g}
            onChange={e => onChange({ peso_por_unidad_g: e.target.value })}
            placeholder={['kg', 'g'].includes(unidad.toLowerCase()) ? 'Ej: 1 diente = 10' : 'Ej: 1 unidad = 250'}
            style={inputStyle}
          />
        </label>
      </div>

      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.45, color: resumen.length ? 'var(--text-2)' : 'var(--text-3)' }}>
        {resumen.length
          ? resumen.join(' · ')
          : 'Opcional. El envase reparte el precio del pack en cada unidad y hace que una factura "1 pack" sume las unidades que trae; el peso sirve cuando una receta lo pide en gramos y acá está por unidad (o al revés).'}
      </p>
    </div>
  )
}
