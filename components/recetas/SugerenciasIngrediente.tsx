'use client'

// Desplegable de sugerencias del campo "ingrediente" (Stock + recetas).
// Lo comparten la Nueva receta (IngRow) y la Carga rápida. La búsqueda y el
// orden viven en lib/recetas/sugerencias.ts; acá solo se dibuja.
//
// La última opción ("Usar «x» como insumo nuevo") deja explícito lo que pasa
// si no elegís nada: al guardar se crea en Stock (lib/recetas/vinculo.ts).
// Antes eso pasaba en silencio y así nacían duplicados como "papa" al lado de "Papa".

import type { SugerenciaIngrediente } from '@/lib/recetas/sugerencias'
import { normalizarBusqueda } from '@/lib/texto'

/** Si hay que ofrecer "insumo nuevo": no hay una sugerencia con el mismo nombre. */
export function ofrecerNuevo(query: string, items: SugerenciaIngrediente[]): boolean {
  const q = normalizarBusqueda(query)
  return !!q && !items.some(s => normalizarBusqueda(s.nombre) === q)
}

export function SugerenciasIngrediente({ items, query, activo, onSelect, onNuevo, onHover }: {
  items: SugerenciaIngrediente[]
  query: string
  /** Índice resaltado con el teclado (items.length = la opción "nuevo"), -1 = ninguno. */
  activo: number
  onSelect: (s: SugerenciaIngrediente) => void
  onNuevo: () => void
  onHover: (idx: number) => void
}) {
  const nuevo = ofrecerNuevo(query, items)
  if (items.length === 0 && !nuevo) return null

  const filaBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px',
    border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer',
    textAlign: 'left', fontFamily: 'inherit',
  }

  return (
    <div
      role="listbox"
      style={{
        position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 40,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,.14)', maxHeight: 300, overflowY: 'auto', marginTop: 2,
      }}
    >
      {items.map((s, i) => (
        <button
          key={`${s.tipo}:${s.id}`}
          role="option"
          aria-selected={activo === i}
          // mousedown/touchstart + preventDefault: elegir sin que el input pierda
          // el foco antes (el blur cerraría la lista y el click no llegaría).
          onMouseDown={e => { e.preventDefault(); onSelect(s) }}
          onTouchStart={e => { e.preventDefault(); onSelect(s) }}
          onMouseEnter={() => onHover(i)}
          style={{ ...filaBase, background: activo === i ? 'rgba(67,97,160,.09)' : 'transparent' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15, flexShrink: 0, color: s.tipo === 'subreceta' ? 'var(--accent)' : 'var(--text-3)' }}>
            {s.tipo === 'subreceta' ? 'menu_book' : 'inventory_2'}
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.nombre}
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 600, flexShrink: 0, fontFamily: "'DM Mono', monospace", color: s.costoUnitario > 0 ? 'var(--navy-ink)' : 'var(--text-3)' }}>
            {s.detalle}
          </span>
        </button>
      ))}
      {nuevo && (
        <button
          role="option"
          aria-selected={activo === items.length}
          onMouseDown={e => { e.preventDefault(); onNuevo() }}
          onTouchStart={e => { e.preventDefault(); onNuevo() }}
          onMouseEnter={() => onHover(items.length)}
          style={{ ...filaBase, borderBottom: 'none', background: activo === items.length ? 'rgba(67,97,160,.09)' : 'transparent' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15, flexShrink: 0, color: 'var(--text-3)' }}>add_circle</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Usar <b style={{ color: 'var(--text-1)' }}>«{query.trim()}»</b> como insumo nuevo
            </span>
            <span style={{ display: 'block', fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>Se crea en Stock al guardar la receta</span>
          </span>
        </button>
      )}
    </div>
  )
}
