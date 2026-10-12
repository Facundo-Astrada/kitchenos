'use client'

// Una fila de la tabla de Insumos — extraída de stock/ClientView.tsx (oct
// 2026) porque el renglón del .map() venía creciendo cada vez que se sumaba
// un campo editable inline (Categoría, Proveedor, Sector, Unidad, Precio) y
// ya había pisado el techo de líneas del ratchet tres veces en la misma
// sesión. Acá entra entera de una vez: `p` + un puñado de flags/listas
// compartidas + los handlers ya definidos en ClientView (la mayoría se pasan
// tal cual, sin envolver — sus firmas ya calzan).

import type { ProductoConEstado } from '@/lib/hooks/useStock'
import NivelRing from './NivelRing'
import { CeldaCategoria, CeldaProveedor, CeldaSector, CeldaUnidad, CeldaPrecio } from './CeldasInlineTabla'

function fmtValor(n: number) {
  if (!n || n === 0) return '—'
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

// stock_actual === 0 y sin precio y no es producción/fuera de uso: igual que
// esPendiente() en ClientView.tsx — se pasa ya calculado para no duplicar la
// regla acá adentro.
function EstadoBadge({ p, pendiente }: { p: ProductoConEstado; pendiente: boolean }) {
  if (p.fuera_de_uso) return (
    <span style={{ background: 'rgba(148,163,184,.15)', border: '1px solid rgba(148,163,184,.3)', borderRadius: 6, padding: '2px 6px', fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>Fuera de uso</span>
  )
  if (pendiente) return (
    <span style={{ background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 6, padding: '2px 6px', fontSize: 9, fontWeight: 700, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>Pendiente</span>
  )
  if (p.estado === 'alto') return (
    <span style={{ background: 'rgba(56,189,248,.15)', border: '1px solid rgba(56,189,248,.3)', borderRadius: 6, padding: '2px 6px', fontSize: 9, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>Alto</span>
  )
  if (p.estado !== 'ok') return (
    <span style={{ background: 'rgba(245,158,11,.15)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 6, padding: '2px 6px', fontSize: 9, fontWeight: 700, color: '#fcd34d', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>Bajo</span>
  )
  return (
    <span style={{ background: 'rgba(74,222,128,.1)', border: '1px solid rgba(74,222,128,.25)', borderRadius: 6, padding: '2px 6px', fontSize: 9, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>OK</span>
  )
}

type EditThr = { id: string; min: string } | null

type Props = {
  p: ProductoConEstado
  index: number
  isDesktop: boolean
  isNarrow: boolean
  canEdit: boolean
  isAdmin: boolean
  puedeEliminar: boolean
  verCostos: boolean
  pendiente: boolean
  bajo: boolean
  mostrarRecetas: boolean
  usoRecetasCount: number
  categoriasNombres: string[]
  proveedores: { id: string; nombre: string }[]
  sectores: { id: string; nombre: string }[]
  estaEnCarrito: boolean
  editingId: string | null
  editValue: string
  editThr: EditThr
  onOpenEdit: (p: ProductoConEstado) => void
  onInlineCategoria: (p: ProductoConEstado, value: string) => void
  onNuevaCategoria: (p: ProductoConEstado) => void
  onInlineProveedor: (p: ProductoConEstado, value: string | null) => void
  onNuevoProveedor: (p: ProductoConEstado) => void
  onInlineSector: (p: ProductoConEstado, value: string | null) => void
  onNuevoSector: (p: ProductoConEstado) => void
  onInlineUnidad: (p: ProductoConEstado, value: string) => void
  onGuardarPrecio: (id: string, datos: { precio_unitario: number }) => void | Promise<void>
  onStartEdit: (p: ProductoConEstado) => void
  onEditValueChange: (v: string) => void
  onCommitEdit: (id: string) => void
  onCancelEdit: () => void
  onEditThrFocus: (p: ProductoConEstado) => void
  onEditThrChange: (v: string) => void
  onEditThrCancel: () => void
  onGuardarUmbrales: () => void
  onAddToCart: (p: ProductoConEstado) => void
  onOpenMerma: (p: ProductoConEstado) => void
  onDelete: (id: string) => void
}

export default function FilaProductoInsumo({
  p, index, isDesktop, isNarrow, canEdit, isAdmin, puedeEliminar, verCostos,
  pendiente, bajo, mostrarRecetas, usoRecetasCount, categoriasNombres, proveedores, sectores,
  estaEnCarrito, editingId, editValue, editThr,
  onOpenEdit, onInlineCategoria, onNuevaCategoria, onInlineProveedor, onNuevoProveedor,
  onInlineSector, onNuevoSector, onInlineUnidad, onGuardarPrecio,
  onStartEdit, onEditValueChange, onCommitEdit, onCancelEdit,
  onEditThrFocus, onEditThrChange, onEditThrCancel, onGuardarUmbrales,
  onAddToCart, onOpenMerma, onDelete,
}: Props) {
  const val = (p.precio_unitario ?? 0) > 0 ? p.stock_actual * (p.precio_unitario ?? 0) : 0

  return (
    <tr
      onDoubleClick={() => canEdit && onOpenEdit(p)}
      style={{
        borderBottom: '1px solid var(--border)',
        background: pendiente ? 'rgba(239,68,68,0.07)' : index % 2 === 0 ? 'var(--surface)' : 'var(--bg)',
        cursor: canEdit ? 'pointer' : 'default',
        opacity: p.fuera_de_uso ? 0.55 : 1,
      }}
    >
      {/* Producto */}
      <td style={{ padding: '11px 8px 11px 12px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.25, display: 'flex', alignItems: 'center', gap: 6 }}>
            {p.nombre}
            {p.es_produccion && (
              <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', padding: '1px 5px', borderRadius: 4, background: 'rgba(16,185,129,.12)', color: '#10b981', flexShrink: 0 }}>
                Producción
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
            {!isDesktop && `${p.categoria} · `}{p.unidad_uso ?? p.unidad}{mostrarRecetas && ` · en ${usoRecetasCount} receta${usoRecetasCount === 1 ? '' : 's'}`}
            {val > 0 && verCostos && !isDesktop && <span style={{ color: 'var(--accent)', fontWeight: 700, marginLeft: 6, fontFamily: "'DM Mono', monospace" }}>{fmtValor(val)}</span>}
          </div>
          {isNarrow && (
            <div style={{ fontSize: 9.5, color: 'var(--text-3)', marginTop: 2, fontFamily: "'DM Mono', monospace", display: 'flex', gap: 8 }}>
              <span>mín <b style={{ color: '#d97706' }}>{p.stock_minimo ?? 0}</b></span>
            </div>
          )}
        </div>
      </td>
      {/* Categoría/Proveedor/Sector — un click edita in situ, sin pasar por el modal */}
      {isDesktop && (
        <td style={{ padding: '11px 8px' }} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
          <CeldaCategoria
            categoria={p.categoria}
            opciones={categoriasNombres}
            canEdit={canEdit}
            onChange={v => onInlineCategoria(p, v)}
            onNueva={() => onNuevaCategoria(p)}
          />
          {val > 0 && verCostos && (
            <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, marginTop: 1, fontFamily: "'DM Mono', monospace" }}>{fmtValor(val)}</div>
          )}
        </td>
      )}
      {isDesktop && (
        <td style={{ padding: '11px 8px', maxWidth: 0 }} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
          <CeldaProveedor
            proveedorId={p.proveedor_id}
            opciones={proveedores}
            canEdit={canEdit}
            onChange={v => onInlineProveedor(p, v)}
            onNuevo={() => onNuevoProveedor(p)}
          />
        </td>
      )}
      {isDesktop && (
        <td style={{ padding: '11px 8px', maxWidth: 0 }} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
          <CeldaSector
            sectorId={p.sector_id}
            opciones={sectores}
            canEdit={canEdit}
            onChange={v => onInlineSector(p, v)}
            onNuevo={() => onNuevoSector(p)}
          />
        </td>
      )}
      {/* Nivel — anillo compacto stock vs mínimo (solo desktop) */}
      {isDesktop && (
        <td style={{ padding: '11px 8px' }}>
          <NivelRing stockActual={p.stock_actual} stockMinimo={p.stock_minimo} bajo={bajo} />
        </td>
      )}
      {/* Precio — un click edita in situ, mismo patrón que Stock/Mínimo */}
      {verCostos && (
        <td style={{ padding: '11px 8px 11px 4px', textAlign: 'right' }} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
          <CeldaPrecio precio={p.precio_unitario} canEdit={canEdit} onGuardar={precio => onGuardarPrecio(p.id, { precio_unitario: precio })} />
        </td>
      )}
      {/* Stock + umbrales editables — HORIZONTAL alineado */}
      <td style={{ padding: '8px 6px', background: 'color-mix(in srgb, var(--accent) 6%, transparent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {/* Número de stock — input siempre montado: onFocus abre teclado nativo en el mismo gesto */}
          <div style={{ width: isDesktop ? 86 : isNarrow ? 50 : 54, display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 3, flexShrink: 0 }}>
            <input
              type="text"
              inputMode="decimal"
              readOnly={!canEdit}
              value={editingId === p.id ? editValue : String(p.stock_actual)}
              onFocus={e => { if (canEdit) { onStartEdit(p); e.currentTarget.select() } }}
              onChange={e => onEditValueChange(e.target.value)}
              onBlur={() => { if (editingId === p.id) onCommitEdit(p.id) }}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') { onCancelEdit(); e.currentTarget.blur() }
              }}
              onClick={e => e.stopPropagation()}
              title="Tocá para editar stock"
              style={{
                width: isDesktop ? 54 : isNarrow ? 50 : 54, textAlign: 'right', padding: isNarrow ? '3px 3px' : '3px 4px',
                fontSize: isDesktop ? 14 : 16,
                fontWeight: 800, fontFamily: "'DM Mono', monospace", lineHeight: 1.1,
                color: editingId === p.id ? '#fff' : (bajo ? '#d97706' : 'var(--text-1)'),
                background: editingId === p.id ? 'var(--navy)' : 'transparent',
                border: editingId === p.id ? '1px solid rgba(255,255,255,.3)' : '1px solid transparent',
                borderRadius: 6, outline: 'none',
                cursor: canEdit ? 'pointer' : 'default',
              }}
            />
            {isDesktop && <CeldaUnidad unidad={p.unidad} canEdit={canEdit} onChange={v => onInlineUnidad(p, v)} />}
          </div>

          {!isNarrow && <div style={{ width: 1, alignSelf: 'stretch', minHeight: 22, background: 'var(--border)', opacity: 0.6 }} />}

          {!isNarrow && (
            <div style={{ width: 52, textAlign: 'left', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
              <span style={{ fontSize: 9.5, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>mín </span>
              <input
                type="text"
                inputMode="decimal"
                readOnly={!canEdit}
                value={editThr?.id === p.id ? editThr.min : String(p.stock_minimo ?? 0)}
                onFocus={e => { if (canEdit) { onEditThrFocus(p); e.currentTarget.select() } }}
                onChange={e => onEditThrChange(e.target.value)}
                onBlur={() => { if (editThr?.id === p.id) onGuardarUmbrales() }}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { onEditThrCancel(); e.currentTarget.blur() } }}
                title="Tocá para editar el mínimo"
                style={{
                  width: 32, textAlign: 'left', padding: '1px 2px',
                  fontSize: isDesktop ? 10 : 16,
                  fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#d97706',
                  background: editThr?.id === p.id ? 'var(--bg)' : 'transparent',
                  border: `1px solid ${editThr?.id === p.id ? 'var(--border)' : 'transparent'}`,
                  borderRadius: 5, outline: 'none', cursor: canEdit ? 'pointer' : 'default',
                }}
              />
            </div>
          )}
        </div>
      </td>
      {/* Estado */}
      <td style={{ padding: '11px 4px', textAlign: 'center' }}>
        <EstadoBadge p={p} pendiente={pendiente} />
      </td>
      {/* Acciones */}
      {isAdmin && (
        <td style={{ padding: '11px 4px', textAlign: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {!p.fuera_de_uso && (
              <button
                onClick={(e) => { e.stopPropagation(); onAddToCart(p) }}
                aria-label="Agregar al carrito de compras"
                title="Agregar al pedido"
                disabled={estaEnCarrito}
                style={{ background: 'none', border: 'none', cursor: estaEnCarrito ? 'default' : 'pointer', padding: 0, display: 'flex' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 19, color: estaEnCarrito ? 'var(--accent)' : bajo ? 'var(--accent)' : 'var(--text-3)' }}>
                  {estaEnCarrito ? 'shopping_cart' : 'add_shopping_cart'}
                </span>
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onOpenMerma(p) }}
              aria-label="Registrar merma"
              title="Registrar merma"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--text-3)' }}>delete_sweep</span>
            </button>
            {puedeEliminar && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(p.id) }}
                aria-label="Eliminar producto"
                title="Eliminar producto"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--text-3)' }}>delete</span>
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  )
}
