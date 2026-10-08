'use client'

// Equivalencia unidad ↔ peso del producto (productos.peso_por_unidad_g). Con
// esto "2 u de ajo" en una receta se costea contra un precio por kg, y una
// factura en unidades suma a un producto que se lleva en kg. Vive aparte de
// stock/ClientView.tsx para no crecer ese archivo (techo en ratchets.test.ts).
export function PesoPorUnidadField({ value, onChange, labelStyle, inputStyle }: {
  value: string
  onChange: (v: string) => void
  labelStyle: React.CSSProperties
  inputStyle: React.CSSProperties
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={labelStyle}>Peso de 1 unidad (g)</span>
      <input
        type="text" inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Ej: 1 diente de ajo = 10"
        style={inputStyle}
      />
      <span style={{ fontSize: 10, color: 'var(--text-3)', paddingBottom: 6 }}>
        Para costear recetas que lo cargan en unidades cuando acá está por peso, o al revés
      </span>
    </label>
  )
}
