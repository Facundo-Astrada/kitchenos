'use client'

import { KeyboardEvent, ClipboardEvent, Ref } from 'react'

interface Props {
  texto: string
  nivel: number
  completado?: boolean
  placeholder?: string
  inputRef?: Ref<HTMLInputElement>
  onChangeTexto: (texto: string) => void
  onToggleCompletado?: () => void
  // (textoAntes, textoDespues) — Enter parte la línea en el cursor
  onEnter: (textoAntes: string, textoDespues: string) => void
  onIndent: () => void
  onOutdent: () => void
  onBackspaceEmpty: () => void
  onDelete?: () => void
  onPasteMultiline?: (lineas: string[]) => boolean // true = ya lo manejó, no pegar default
  onBlurCommit?: () => void
}

// Línea de un documento de Bitácora — igual de comportamiento para una fila
// persistida o para la línea "draft" del final (ver EntradaDoc). Siempre
// montada (no condicional a un estado "editando"): el teclado móvil se
// cierra si el input se desmonta/remonta entre foco y foco (ver
// feedback_mobile_keyboard_inline_edit).
export default function ItemLinea({
  texto, nivel, completado, placeholder, inputRef,
  onChangeTexto, onToggleCompletado, onEnter, onIndent, onOutdent,
  onBackspaceEmpty, onDelete, onPasteMultiline, onBlurCommit,
}: Props) {
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const el = e.currentTarget
    if (e.key === 'Enter') {
      e.preventDefault()
      const pos = el.selectionStart ?? texto.length
      onEnter(texto.slice(0, pos), texto.slice(pos))
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) onOutdent(); else onIndent()
      return
    }
    if (e.key === 'Backspace' && texto === '' && el.selectionStart === 0 && el.selectionEnd === 0) {
      e.preventDefault()
      onBackspaceEmpty()
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const texto = e.clipboardData.getData('text')
    if (!texto.includes('\n') || !onPasteMultiline) return
    const lineas = texto.split(/\r?\n/)
    const manejado = onPasteMultiline(lineas)
    if (manejado) e.preventDefault()
  }

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        paddingLeft: nivel * 22,
        opacity: completado ? 0.55 : 1,
      }}
      className="bitacora-item-linea"
    >
      {onToggleCompletado ? (
        <button
          type="button"
          onClick={onToggleCompletado}
          aria-label={completado ? 'Marcar como pendiente' : 'Marcar como resuelto'}
          style={{
            flexShrink: 0, width: 18, height: 18, borderRadius: 5, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: completado ? 'none' : '1.5px solid var(--border)',
            background: completado ? 'var(--accent)' : 'transparent',
          }}
        >
          {completado && <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#fff' }}>check</span>}
        </button>
      ) : (
        <span style={{ flexShrink: 0, width: 18, display: 'flex', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          {nivel > 0 ? '–' : '·'}
        </span>
      )}
      <input
        ref={inputRef}
        value={texto}
        onChange={e => onChangeTexto(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={onBlurCommit}
        placeholder={placeholder}
        style={{
          flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
          fontSize: 14, fontFamily: 'inherit', color: 'var(--text-1)', padding: '5px 0',
          textDecoration: completado ? 'line-through' : 'none',
        }}
      />
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Eliminar línea"
          className="bitacora-item-delete"
          style={{
            flexShrink: 0, width: 22, height: 22, borderRadius: 6, cursor: 'pointer',
            background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-3)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
        </button>
      )}
      <style>{`
        .bitacora-item-delete { opacity: 0; transition: opacity .12s; }
        .bitacora-item-linea:hover .bitacora-item-delete { opacity: 1; }
        @media (hover: none) { .bitacora-item-delete { opacity: .5; } }
      `}</style>
    </div>
  )
}
