'use client'

// "Unidades y envase" de la ficha de producto en Stock: peso de 1 unidad
// (productos.peso_por_unidad_g) y unidad de compra (unidad_compra +
// cantidad_por_envase + unidad_uso). Antes vivían dentro de "Más opciones", y
// la unidad de compra en un segundo desplegable adentro: nadie las encontraba,
// y son justo lo que hace que una receta en unidades o una factura por caja
// cuadren con el stock. Ahora están a la vista, debajo de la unidad.
// Separado de stock/ClientView.tsx por el techo de líneas (ratchets.test.ts).

export interface UnidadesProductoValores {
  peso_por_unidad_g: string
  unidad_compra: string
  cantidad_por_envase: string
  unidad_uso: string
}

export function UnidadesProductoFields({ unidad, valores, onChange, unidadesUso, labelStyle, inputStyle }: {
  /** Unidad principal del producto (la del precio). */
  unidad: string
  valores: UnidadesProductoValores
  onChange: (patch: Partial<UnidadesProductoValores>) => void
  unidadesUso: string[]
  labelStyle: React.CSSProperties
  inputStyle: React.CSSProperties
}) {
  const porPeso = ['kg', 'g'].includes(unidad.toLowerCase())
  const usoEfectivo = valores.unidad_uso || unidad
  const resumen: string[] = []
  if (valores.peso_por_unidad_g.trim()) {
    const g = valores.peso_por_unidad_g.trim()
    resumen.push(`1 unidad pesa ${g} g → si una receta pide 2 u, se costean ${(parseFloat(g.replace(',', '.')) * 2 || 0).toLocaleString('es-AR')} g`)
  }
  if (valores.unidad_compra.trim() && valores.cantidad_por_envase.trim()) {
    resumen.push(`1 ${valores.unidad_compra.trim()} = ${valores.cantidad_por_envase.trim()} ${usoEfectivo}`)
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={campo}>
          <span style={labelStyle}>Peso de 1 unidad (g)</span>
          <input
            type="text" inputMode="decimal"
            value={valores.peso_por_unidad_g}
            onChange={e => onChange({ peso_por_unidad_g: e.target.value })}
            placeholder={porPeso ? 'Ej: 1 diente = 10' : 'Ej: 1 unidad = 250'}
            style={inputStyle}
          />
        </label>
        <label style={campo}>
          <span style={labelStyle}>Stock se mide en</span>
          <select
            value={valores.unidad_uso}
            onChange={e => onChange({ unidad_uso: e.target.value })}
            style={{ ...inputStyle, appearance: 'auto', cursor: 'pointer' }}
          >
            <option value="">{unidad} (la principal)</option>
            {unidadesUso.filter(u => u.toLowerCase() !== unidad.toLowerCase()).map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label style={campo}>
          <span style={labelStyle}>Se compra por</span>
          <input
            value={valores.unidad_compra}
            onChange={e => onChange({ unidad_compra: e.target.value })}
            placeholder="caja, pack, bolsa…"
            style={inputStyle}
          />
        </label>
        <label style={campo}>
          <span style={labelStyle}>Trae (por envase)</span>
          <input
            type="text" inputMode="decimal"
            value={valores.cantidad_por_envase}
            onChange={e => onChange({ cantidad_por_envase: e.target.value })}
            placeholder={`100 ${usoEfectivo}`}
            style={inputStyle}
          />
        </label>
      </div>

      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.45, color: resumen.length ? 'var(--text-2)' : 'var(--text-3)' }}>
        {resumen.length
          ? resumen.join(' · ')
          : 'Opcional. El peso sirve cuando las recetas lo cargan en unidades y acá está por peso (o al revés); el envase, cuando comprás por caja y usás por unidad.'}
      </p>
    </div>
  )
}
