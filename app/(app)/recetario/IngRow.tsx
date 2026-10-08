'use client'

// Fila de ingrediente del alta de receta (Nueva receta en recetario/page.tsx).
// Separada de page.tsx por el ratchet de líneas (lib/ingenieria/ratchets.test.ts).
// Nombre con sugerencias de Stock + recetas al tipear, cantidad que acepta la
// unidad escrita ("500 g"), y chip de unidad.

import { useState, useEffect, useCallback } from 'react'
import type { RecetaConCosto } from '@/lib/hooks/useRecetas'
import { buscarSugerenciasIngrediente, type SugerenciaIngrediente } from '@/lib/recetas/sugerencias'
import { SugerenciasIngrediente, ofrecerNuevo } from '@/components/recetas/SugerenciasIngrediente'
import { normalizarBusqueda } from '@/lib/texto'
import { separarCantidadUnidad } from '@/lib/unidades'
import { parseNum } from './shared'

const UNIDADES = ['kg', 'g', 'l', 'ml', 'u']
const btnClear: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }

export interface FormIng {
  id: number
  cantidad: string
  unidad: string
  nombre: string
  costo_unitario: number
  grupo: string
  // Producto de Stock elegido de la lista (y la unidad en que está su precio).
  // Antes solo se copiaban nombre/unidad/precio y el vínculo se perdía.
  producto_id?: string | null
  unidad_costo?: string | null
  // Receta elegida como ingrediente (subreceta) — se costea por gramo.
  tipo?: 'producto' | 'subreceta'
  subreceta_id?: string | null
  // Vínculo por IA (Nueva receta importada): candidatos para elegir cuando la
  // IA dudó, y si el vínculo actual lo puso la IA sola.
  opcionesIA?: SugerenciaIngrediente[]
  vinculoIA?: boolean
}

// Lo que cambia en la fila al vincularla a un producto o receta. Lo usan el
// desplegable, los chips de "¿Cuál usás?" y el vínculo automático de la IA.
export function patchVinculo(ing: Pick<FormIng, 'unidad' | 'cantidad'>, s: SugerenciaIngrediente): Partial<FormIng> {
  if (s.tipo === 'subreceta') {
    return {
      nombre: s.nombre, tipo: 'subreceta', subreceta_id: s.id, producto_id: null,
      costo_unitario: s.costoUnitario, unidad_costo: 'g',
      unidad: UNIDADES_SUBRECETA.includes(ing.unidad) ? ing.unidad : 'g',
      opcionesIA: undefined, vinculoIA: false,
    }
  }
  // La unidad del producto solo se sugiere si todavía no hay cantidad cargada.
  return {
    nombre: s.nombre, tipo: 'producto', producto_id: s.id, subreceta_id: null,
    unidad_costo: s.unidad, costo_unitario: s.costoUnitario,
    ...(parseNum(ing.cantidad) > 0 ? {} : { unidad: s.unidad }),
    opcionesIA: undefined, vinculoIA: false,
  }
}

// ════════════════════════════════════════════════════════════════════
// FILA DE INGREDIENTE — velocidad máxima
// [Nombre] | [Cantidad·numpad] [kg] [✓ o ×]
// Activa: ✓ confirma + crea siguiente + focus nombre
// Inactiva: × elimina fila
// Toca fuera de ingredientes → deja de agregar
// ════════════════════════════════════════════════════════════════════

interface IngRowProps {
  ing: FormIng
  idx: number
  isLast: boolean
  isActive: boolean
  stockProductos: { id: string; nombre: string; unidad: string; precio_unitario: number }[]
  recetas: RecetaConCosto[]
  cantidadRefs: React.MutableRefObject<Map<number, HTMLInputElement>>
  nombreRefs: React.MutableRefObject<Map<number, HTMLInputElement>>
  onUpdate: (id: number, patch: Partial<FormIng>) => void
  onRemove: (id: number) => void
  onConfirm: (id: number) => void
  onFocusRow: (id: number | null) => void
}

// Una subreceta se costea por peso (ver CargaRapidaIngredientes.tsx).
export const UNIDADES_SUBRECETA = ['g', 'kg']

export function IngRow({ ing, idx, isLast, isActive, stockProductos, recetas, cantidadRefs, nombreRefs, onUpdate, onRemove, onConfirm, onFocusRow }: IngRowProps) {
  const [suggestions, setSuggestions] = useState<SugerenciaIngrediente[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  // Opción resaltada con ↑/↓ (suggestions.length = "insumo nuevo"), -1 = ninguna.
  const [activa, setActiva] = useState(-1)
  const [nombreFocused, setNombreFocused] = useState(false)
  const esSubreceta = ing.tipo === 'subreceta'
  const vinculado = esSubreceta ? !!ing.subreceta_id : !!ing.producto_id

  function buscar(q: string) {
    const items = buscarSugerenciasIngrediente(q, stockProductos, recetas)
    setSuggestions(items)
    // Si hay una coincidencia exacta queda resaltada: Enter la elige.
    setActiva(items.length > 0 && normalizarBusqueda(items[0].nombre) === normalizarBusqueda(q) ? 0 : -1)
    setShowSuggestions(!!q.trim())
  }

  // Si Stock/recetas terminan de cargar con el campo activo, rehacer la búsqueda.
  useEffect(() => {
    if (nombreFocused && ing.nombre.trim() && !vinculado) buscar(ing.nombre)
  }, [stockProductos, recetas]) // eslint-disable-line react-hooks/exhaustive-deps

  const cantRef = useCallback((el: HTMLInputElement | null) => {
    if (el) cantidadRefs.current.set(ing.id, el)
    else cantidadRefs.current.delete(ing.id)
  }, [ing.id, cantidadRefs])

  const nomRef = useCallback((el: HTMLInputElement | null) => {
    if (el) nombreRefs.current.set(ing.id, el)
    else nombreRefs.current.delete(ing.id)
  }, [ing.id, nombreRefs])

  function focusCantidad() {
    setTimeout(() => cantidadRefs.current.get(ing.id)?.focus(), 30)
  }

  function handleNombreChange(val: string) {
    // Tipear después de elegir desvincula: si no, quedaría guardado el
    // producto/receta anterior con un nombre que ya no le corresponde.
    // El precio también se limpia: quedaba el del producto anterior sin su
    // unidad y "250 g" de leche a $1.764/l se costeaba como 250 litros.
    onUpdate(ing.id, {
      nombre: val, tipo: 'producto', producto_id: null, subreceta_id: null, unidad_costo: null,
      costo_unitario: 0, opcionesIA: undefined, vinculoIA: false,
    })
    buscar(val)
  }

  function selectSuggestion(s: SugerenciaIngrediente) {
    onUpdate(ing.id, patchVinculo(ing, s))
    setShowSuggestions(false)
    focusCantidad()
  }

  function elegirNuevo() {
    setShowSuggestions(false)
    focusCantidad()
  }

  function handleNombreKeyDown(e: React.KeyboardEvent) {
    const total = suggestions.length + (ofrecerNuevo(ing.nombre, suggestions) ? 1 : 0)
    if (e.key === 'ArrowDown' && total > 0) {
      e.preventDefault()
      if (!showSuggestions) { buscar(ing.nombre); return }
      setActiva(a => Math.min(a + 1, total - 1))
    } else if (e.key === 'ArrowUp' && showSuggestions) {
      e.preventDefault()
      setActiva(a => Math.max(a - 1, -1))
    } else if (e.key === 'Escape' && showSuggestions) {
      e.preventDefault()
      e.stopPropagation()
      setShowSuggestions(false)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (showSuggestions && activa >= 0 && activa < suggestions.length) { selectSuggestion(suggestions[activa]); return }
      setShowSuggestions(false)
      focusCantidad()
    }
  }

  const unidades = esSubreceta ? UNIDADES_SUBRECETA : UNIDADES

  function handleCantidadChange(raw: string) {
    const val = raw.replace(/[^0-9.,a-zA-Z ]/g, '')
    const { unidad } = separarCantidadUnidad(val)
    onUpdate(ing.id, unidad && unidades.includes(unidad) && unidad !== ing.unidad
      ? { cantidad: val, unidad }
      : { cantidad: val })
  }

  // Al salir del campo queda solo el número (la unidad ya pasó al selector).
  function normalizarCantidad() {
    const { numero } = separarCantidadUnidad(ing.cantidad)
    if (numero !== ing.cantidad) onUpdate(ing.id, { cantidad: numero })
  }

  function handleCantidadKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      normalizarCantidad()
      onConfirm(ing.id)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        background: isActive ? 'rgba(28,45,74,.04)' : 'transparent',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        transition: 'background .15s',
      }}>

        {/* Vínculo: insumo de Stock o receta. Sin ícono = texto suelto, que al
            guardar se vincula por nombre exacto o se crea en Stock. */}
        {vinculado && (
          <span
            className="material-symbols-outlined"
            title={ing.vinculoIA ? 'Vinculado por la IA — tocá el nombre para cambiarlo' : esSubreceta ? 'Receta del recetario' : 'Vinculado a Stock'}
            style={{ fontSize: 14, paddingLeft: 10, flexShrink: 0, color: esSubreceta ? 'var(--accent)' : '#10b981' }}
          >
            {esSubreceta ? 'menu_book' : 'inventory_2'}
          </span>
        )}

        {/* Nombre ingrediente — PRIMERO */}
        <input
          ref={nomRef}
          value={ing.nombre}
          onChange={e => handleNombreChange(e.target.value)}
          onKeyDown={handleNombreKeyDown}
          onFocus={() => {
            setNombreFocused(true)
            onFocusRow(ing.id)
            if (ing.nombre.trim() && !vinculado) buscar(ing.nombre)
          }}
          onBlur={() => { setNombreFocused(false); setTimeout(() => setShowSuggestions(false), 150) }}
          placeholder={idx === 0 ? 'Ingrediente o receta…' : ''}
          enterKeyHint="next"
          autoComplete="off"
          style={{
            flex: 1, border: 'none', background: 'transparent', outline: 'none',
            padding: vinculado ? '9px 8px 9px 6px' : '9px 8px 9px 10px', fontSize: 12, fontFamily: 'inherit',
            color: 'var(--text-1)', minWidth: 0,
          }}
        />

        {/* Separador */}
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        {/* Cantidad — acepta coma y punto, y la unidad escrita al lado:
            "500 g" o "1,5l" cambia la unidad sin ir al selector. */}
        <input
          ref={cantRef}
          type="text"
          inputMode="decimal"
          value={ing.cantidad}
          onChange={e => handleCantidadChange(e.target.value)}
          onFocus={() => onFocusRow(ing.id)}
          onBlur={normalizarCantidad}
          onKeyDown={handleCantidadKeyDown}
          placeholder="0"
          enterKeyHint="done"
          style={{
            width: 58, border: 'none', background: 'transparent', outline: 'none',
            padding: '9px 4px 9px 6px', fontSize: 13, fontWeight: 700,
            fontFamily: "'DM Mono', monospace", color: 'var(--text-1)', textAlign: 'right',
          }}
        />

        {/* Unidad — antes era texto gris que abría un popover al tocarlo, y no
            se notaba que se podía cambiar. Select nativo con forma de chip:
            en el celular abre la rueda del sistema, en desktop un desplegable. */}
        <label
          title="Unidad en que cargás la cantidad — el costo se convierte solo"
          style={{
            position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0,
            margin: '0 6px 0 2px', borderRadius: 6, cursor: 'pointer',
            border: '1px solid var(--border)', background: 'var(--bg)',
          }}
        >
          <select
            value={unidades.includes(ing.unidad) ? ing.unidad : ''}
            onChange={e => onUpdate(ing.id, { unidad: e.target.value })}
            onFocus={() => onFocusRow(ing.id)}
            aria-label="Unidad"
            style={{
              appearance: 'none', WebkitAppearance: 'none', border: 'none', outline: 'none',
              background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 11.5, fontWeight: 700, color: 'var(--text-1)',
              padding: '5px 20px 5px 8px', minWidth: 44,
            }}
          >
            {!unidades.includes(ing.unidad) && <option value="" disabled>{ing.unidad || '—'}</option>}
            {unidades.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <span className="material-symbols-outlined" style={{
            position: 'absolute', right: 3, fontSize: 15, color: 'var(--text-3)', pointerEvents: 'none',
          }}>expand_more</span>
        </label>

        {/* ✓ (activa) o × (inactiva) — mismo lugar */}
        {isActive ? (
          <button
            onClick={() => onConfirm(ing.id)}
            style={{
              background: 'var(--navy)', border: 'none', cursor: 'pointer',
              padding: '0', width: 36, height: '100%', minHeight: 38,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, borderRadius: '0 6px 6px 0',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fff' }}>check</span>
          </button>
        ) : (
          <button
            onClick={() => onRemove(ing.id)}
            style={{
              ...btnClear, padding: '8px 8px 8px 2px', opacity: .3, flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#ef4444' }}>close</span>
          </button>
        )}
      </div>

      {/* La IA dudó entre varios insumos: se elige con un toque. Va en el
          flujo (no flotante) para que no tape la fila de abajo. */}
      {!vinculado && ing.opcionesIA && ing.opcionesIA.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
          padding: '2px 10px 9px', background: 'rgba(245,158,11,.06)',
          borderBottom: isLast ? 'none' : '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#b45309', display: 'flex', alignItems: 'center', gap: 3 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>help</span>
            ¿Cuál usás?
          </span>
          {ing.opcionesIA.map(s => (
            <button
              key={`${s.tipo}:${s.id}`}
              onClick={() => onUpdate(ing.id, patchVinculo(ing, s))}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 99,
                border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: 'var(--text-1)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: s.tipo === 'subreceta' ? 'var(--accent)' : 'var(--text-3)' }}>
                {s.tipo === 'subreceta' ? 'menu_book' : 'inventory_2'}
              </span>
              {s.nombre}
              {s.costoUnitario > 0 && (
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{s.detalle}</span>
              )}
            </button>
          ))}
          <button
            onClick={() => onUpdate(ing.id, { opcionesIA: undefined })}
            style={{ padding: '5px 8px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, color: 'var(--text-3)' }}
          >
            Ninguno, es nuevo
          </button>
        </div>
      )}

      {/* Sugerencias de Stock + recetas, mientras se tipea */}
      {showSuggestions && (
        <SugerenciasIngrediente
          items={suggestions}
          query={ing.nombre}
          activo={activa}
          onSelect={selectSuggestion}
          onNuevo={elegirNuevo}
          onHover={setActiva}
        />
      )}
    </div>
  )
}
