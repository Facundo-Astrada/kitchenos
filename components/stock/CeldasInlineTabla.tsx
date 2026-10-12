'use client'

// Celdas de edición in-situ para la tabla de Insumos — un click, sin pasar
// por el modal grande. Categoría/Proveedor son <select> nativos (el browser
// ya resuelve "un click abre el desplegable" solo); Precio es un input con
// su propio estado de foco, igual al patrón que ya usan Stock y Mínimo en
// ClientView.tsx pero autocontenido (no hace falta levantar el estado).

import { useState } from 'react'
import { parsePrecio } from '@/lib/unidades'

type ProveedorOpcion = { id: string; nombre: string }

export function CeldaCategoria({ categoria, opciones, canEdit, onChange, onNueva }: {
  categoria: string
  opciones: string[]
  canEdit: boolean
  onChange: (value: string) => void
  onNueva: () => void
}) {
  return (
    <select
      value={categoria || ''}
      disabled={!canEdit}
      onChange={e => e.target.value === '__new__' ? onNueva() : onChange(e.target.value)}
      title={canEdit ? 'Tocá para cambiar la categoría' : undefined}
      style={{ fontSize: 12, color: 'var(--text-2)', background: 'transparent', border: 'none', outline: 'none', appearance: 'none', width: '100%', padding: 0, cursor: canEdit ? 'pointer' : 'default', fontFamily: 'inherit' }}
    >
      <option value="">—</option>
      {opciones.map(c => <option key={c} value={c}>{c}</option>)}
      {canEdit && <option value="__new__">+ Nueva categoría…</option>}
    </select>
  )
}

export function CeldaProveedor({ proveedorId, opciones, canEdit, onChange, onNuevo }: {
  proveedorId: string | null | undefined
  opciones: ProveedorOpcion[]
  canEdit: boolean
  onChange: (value: string | null) => void
  onNuevo: () => void
}) {
  const actual = opciones.find(pr => pr.id === proveedorId)
  return (
    <select
      value={proveedorId ?? ''}
      disabled={!canEdit}
      onChange={e => e.target.value === '__new__' ? onNuevo() : onChange(e.target.value || null)}
      title={canEdit ? 'Tocá para cambiar el proveedor' : actual?.nombre}
      style={{ fontSize: 12, color: 'var(--text-2)', background: 'transparent', border: 'none', outline: 'none', appearance: 'none', width: '100%', padding: 0, cursor: canEdit ? 'pointer' : 'default', fontFamily: 'inherit', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
    >
      <option value="">Sin proveedor</option>
      {opciones.map(pr => <option key={pr.id} value={pr.id}>{pr.nombre}</option>)}
      {canEdit && <option value="__new__">+ Nuevo proveedor…</option>}
    </select>
  )
}

export function CeldaPrecio({ precio, canEdit, onGuardar }: {
  precio: number | null
  canEdit: boolean
  onGuardar: (precio: number) => void | Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')

  async function commit() {
    setEditing(false)
    const n = parsePrecio(value)
    if (n >= 0) await onGuardar(n)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      readOnly={!canEdit}
      value={editing ? value : String(precio ?? 0)}
      onFocus={e => { if (canEdit) { setEditing(true); setValue(String(precio ?? 0)); e.currentTarget.select() } }}
      onChange={e => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setEditing(false); e.currentTarget.blur() } }}
      title="Tocá para editar precio"
      style={{
        width: '100%', textAlign: 'right', padding: '3px 4px',
        fontSize: 12, fontWeight: 500, fontFamily: "'DM Mono', monospace",
        color: editing ? 'var(--text-1)' : 'var(--text-2)',
        background: editing ? 'var(--bg)' : 'transparent',
        border: `1px solid ${editing ? 'var(--border)' : 'transparent'}`,
        borderRadius: 5, outline: 'none', cursor: canEdit ? 'pointer' : 'default',
      }}
    />
  )
}
