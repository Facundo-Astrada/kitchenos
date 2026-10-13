'use client'

// Nota del chef de un ingrediente (ingredientes.nota). La cantidad dice
// cuánto; la nota dice cómo o cuál: "2 unidades, maduras y dulces", "tostado",
// "sin semillas". Tres piezas para que se vea y se cargue igual en la ficha,
// en el alta de receta, en la carga rápida y en el drawer de receta de OPS.

import { useRef, useState, type CSSProperties, type Ref } from 'react'

export const NOTA_INGREDIENTE_MAX = 160
export const NOTA_INGREDIENTE_PLACEHOLDER = 'Nota del chef: maduras, tostado, sin semillas…'

/** Botón de la fila que abre la nota. Queda marcado cuando ya hay una cargada. */
export function NotaIngredienteBoton({ activa, onClick, size = 32 }: {
  activa: boolean
  onClick: () => void
  size?: number
}) {
  const label = activa ? 'Editar la nota del chef' : 'Agregar una nota del chef'
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick() }}
      title={label}
      aria-label={label}
      style={{
        width: size, height: size, flexShrink: 0, borderRadius: 8, border: 'none', cursor: 'pointer', padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: activa ? 'rgba(67,97,160,.12)' : 'transparent',
        color: activa ? 'var(--accent)' : 'var(--text-3)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: Math.round(size * 0.6) }}>edit_note</span>
    </button>
  )
}

/** La nota en modo lectura. No se trunca: quien cocina la tiene que leer entera. */
export function NotaIngredienteTexto({ nota, onClick, style }: {
  nota: string
  onClick?: () => void
  style?: CSSProperties
}) {
  const base: CSSProperties = {
    display: 'flex', alignItems: 'flex-start', gap: 5, width: 'fit-content', maxWidth: '100%',
    padding: '4px 9px 4px 7px', borderRadius: 8, border: 'none', background: 'rgba(67,97,160,.08)',
    color: 'var(--text-2)', fontSize: 12.5, fontWeight: 500, lineHeight: 1.35, textAlign: 'left', fontFamily: 'inherit',
    ...style,
  }
  const contenido = (
    <>
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 15, color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>edit_note</span>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{nota}</span>
    </>
  )
  return onClick
    ? <button type="button" onClick={onClick} title="Editar la nota" style={{ ...base, cursor: 'pointer' }}>{contenido}</button>
    : <div style={base}>{contenido}</div>
}

/** Campo de una línea, controlado. Lo usan las filas de alta (el padre es dueño del valor). */
export function NotaIngredienteCampo({ value, onChange, onEnter, onEscape, onBlur, onFocus, inputRef, style }: {
  value: string
  onChange: (v: string) => void
  onEnter?: () => void
  onEscape?: () => void
  onBlur?: () => void
  onFocus?: () => void
  inputRef?: Ref<HTMLInputElement>
  style?: CSSProperties
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, ...style }}>
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16, color: 'var(--accent)', flexShrink: 0 }}>edit_note</span>
      <input
        ref={inputRef}
        value={value}
        maxLength={NOTA_INGREDIENTE_MAX}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); onEnter?.() }
          else if (e.key === 'Escape' && onEscape) { e.preventDefault(); e.stopPropagation(); onEscape() }
        }}
        placeholder={NOTA_INGREDIENTE_PLACEHOLDER}
        aria-label="Nota del chef"
        enterKeyHint="done"
        autoComplete="off"
        style={{
          flex: 1, minWidth: 0, border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent',
          outline: 'none', padding: '4px 2px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)',
        }}
      />
    </div>
  )
}

/**
 * Campo que guarda solo al salir (o con Enter) si el texto cambió — para los
 * editores sin botón Guardar (RecetaQuickEditModal). El padre lo remonta con
 * `key` cuando la nota cambia desde afuera.
 */
export function NotaIngredienteAutoguardado({ nota, onGuardar, onSalirVacio, inputRef, style }: {
  nota: string
  onGuardar: (texto: string) => void
  onSalirVacio?: () => void
  inputRef?: Ref<HTMLInputElement>
  style?: CSSProperties
}) {
  const [texto, setTexto] = useState(nota)
  function alSalir() {
    const limpio = texto.trim()
    if (limpio !== nota.trim()) onGuardar(limpio)
    if (!limpio) onSalirVacio?.()
  }
  return (
    <NotaIngredienteCampo
      value={texto}
      onChange={setTexto}
      onBlur={alSalir}
      onEnter={() => (document.activeElement as HTMLElement | null)?.blur()}
      inputRef={inputRef}
      style={style}
    />
  )
}

/**
 * Editor de una nota ya guardada (ficha de receta): arranca con el valor
 * actual y avisa una sola vez al terminar. Enter o salir del campo guarda,
 * Escape descarta.
 */
export function NotaIngredienteEditor({ inicial, onGuardar, onCancelar, inputRef, style }: {
  inicial: string
  onGuardar: (texto: string) => void
  onCancelar: () => void
  inputRef?: Ref<HTMLInputElement>
  style?: CSSProperties
}) {
  const [texto, setTexto] = useState(inicial)
  // Enter dispara el guardado y, al desmontarse el campo, llega también el
  // blur: sin este corte se guardaría dos veces (o después de un Escape).
  const cerrado = useRef(false)
  function cerrar(guardar: boolean) {
    if (cerrado.current) return
    cerrado.current = true
    if (guardar) onGuardar(texto)
    else onCancelar()
  }
  return (
    <NotaIngredienteCampo
      value={texto}
      onChange={setTexto}
      onEnter={() => cerrar(true)}
      onBlur={() => cerrar(true)}
      onEscape={() => cerrar(false)}
      inputRef={inputRef}
      style={style}
    />
  )
}
