'use client'

// Las tres acciones masivas de Stock (Asignar sector, Asignar proveedor,
// Marcar producción) comparten el mismo patrón: filtrar → seleccionar
// productos → aplicar un UPDATE en lote. Viven en un solo sheet parametrizado
// por `mode` en vez de 3 sheets casi idénticos — extraído de ClientView.tsx
// (oct 2026) para no pisar el techo de líneas de refactor-kos.md §4.

import { useEffect, useState } from 'react'
import { SheetChrome } from '@/lib/ui/chrome'
import { createClient } from '@/lib/supabase/client'
import type { ProductoConEstado } from '@/lib/hooks/useStock'
import type { StockSector, Proveedor } from '@/types'

export type BulkMode = 'sector' | 'proveedor' | 'produccion' | null

type Props = {
  mode: BulkMode
  onClose: () => void
  filtered: ProductoConEstado[]
  sectores: StockSector[]
  proveedores: Proveedor[]
  refetch: () => void
  setToast: (msg: string | null) => void
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '9px 10px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

function fmtPrecio(n: number) {
  if (!n || n === 0) return '—'
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

export default function AsignacionesMasivas({ mode, onClose, filtered, sectores, proveedores, refetch, setToast }: Props) {
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [sectorParaAsignar, setSectorParaAsignar] = useState('')
  const [proveedorParaAsignar, setProveedorParaAsignar] = useState('')
  const [saving, setSaving] = useState(false)

  // Al abrir: limpia la selección — salvo "Marcar producción", que pre-tilda
  // los candidatos típicos (categoría "Otros" + sin precio, el patrón de un
  // fondo/salsa/puré cargado a mano sin categorizar ni costear por factura).
  // Solo corre al cambiar `mode`, no en cada cambio de `filtered` — si el
  // usuario retoca los filtros con el sheet abierto no se le pisa lo tildado.
  useEffect(() => {
    if (mode === 'produccion') {
      const candidatos = filtered.filter(p =>
        !p.fuera_de_uso && !p.es_produccion && p.categoria === 'Otros' && !((p.precio_unitario ?? 0) > 0)
      )
      setSeleccionados(new Set(candidatos.map(p => p.id)))
    } else {
      setSeleccionados(new Set())
    }
    setSectorParaAsignar('')
    setProveedorParaAsignar('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  if (!mode) return null

  const isProduccion = mode === 'produccion'
  const pool = isProduccion
    ? filtered.filter(p => !p.fuera_de_uso && !p.es_produccion)
    : filtered.filter(p => !p.fuera_de_uso)

  function toggleSeleccionado(id: string) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function rowMeta(p: ProductoConEstado): { label: string; destacado: boolean } {
    if (mode === 'sector') {
      const s = sectores.find(x => x.id === p.sector_id)
      return { label: s ? s.nombre : 'Sin sector', destacado: !!s }
    }
    if (mode === 'proveedor') {
      const pr = proveedores.find(x => x.id === p.proveedor_id)
      return { label: pr ? pr.nombre : 'Sin proveedor', destacado: !!pr }
    }
    return { label: `${p.categoria || 'Sin categoría'}${p.precio_unitario ? ` · ${fmtPrecio(p.precio_unitario)}` : ' · sin precio'}`, destacado: false }
  }

  async function aplicar() {
    if (!seleccionados.size) return
    if (mode === 'sector' && !sectorParaAsignar) return
    if (mode === 'proveedor' && !proveedorParaAsignar) return
    setSaving(true)
    try {
      const supabase = createClient()
      const patch = mode === 'sector'
        ? { sector_id: sectorParaAsignar }
        : mode === 'proveedor'
          ? { proveedor_id: proveedorParaAsignar === '__sin__' ? null : proveedorParaAsignar }
          : { es_produccion: true }
      const { error } = await supabase.from('productos').update(patch).in('id', Array.from(seleccionados))
      if (error) throw error
      const n = seleccionados.size
      const destino = mode === 'sector' ? 'asignado' + (n !== 1 ? 's' : '') + ' a sector'
        : mode === 'proveedor' ? 'asignado' + (n !== 1 ? 's' : '') + ' a proveedor'
        : 'marcado' + (n !== 1 ? 's' : '') + ' como producción'
      setToast(`${n} producto${n !== 1 ? 's' : ''} ${destino}`)
      setTimeout(() => setToast(null), 3000)
      onClose()
      refetch()
    } catch (e) {
      const accion = mode === 'sector' ? 'asignar sector' : mode === 'proveedor' ? 'asignar proveedor' : 'marcar producción'
      setToast(`Error al ${accion}: ` + (e instanceof Error ? e.message : 'desconocido'))
      setTimeout(() => setToast(null), 3500)
    }
    setSaving(false)
  }

  const titulo = mode === 'sector' ? 'Asignar sector' : mode === 'proveedor' ? 'Asignar proveedor' : 'Marcar producción'
  const subtitulo = isProduccion
    ? 'Pasan a la pestaña Producciones — pre-tildados los sin categoría/precio (Otros, $0)'
    : 'Tocá los productos para seleccionarlos'
  const checkColor = isProduccion ? '#10b981' : 'var(--accent)'
  const aplicarDisabled = !seleccionados.size || saving
    || (mode === 'sector' && !sectorParaAsignar)
    || (mode === 'proveedor' && !proveedorParaAsignar)

  return (
    <SheetChrome>
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>{titulo}</div>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>{subtitulo}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.7)', fontSize: 22 }}>close</span>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {pool.map(p => {
            const sel = seleccionados.has(p.id)
            const { label, destacado } = rowMeta(p)
            return (
              <button
                key={p.id}
                onClick={() => toggleSeleccionado(p.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: sel ? (isProduccion ? 'rgba(16,185,129,.08)' : 'rgba(67,97,160,.1)') : 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', opacity: destacado && !sel ? 0.5 : 1 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: sel ? checkColor : 'var(--text-3)' }}>
                  {sel ? 'check_box' : 'check_box_outline_blank'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', textDecoration: destacado && !sel ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</div>
                  <div style={{ fontSize: 10, color: destacado ? 'var(--accent)' : 'var(--text-3)', fontWeight: destacado ? 700 : 400 }}>{label}</div>
                </div>
              </button>
            )
          })}
          {pool.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
              No hay productos para mostrar con los filtros actuales
            </div>
          )}
        </div>
        <div style={{ padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', flexShrink: 0, borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>{seleccionados.size} seleccionado{seleccionados.size !== 1 ? 's' : ''}</div>
          {isProduccion ? (
            <button
              onClick={aplicar}
              disabled={aplicarDisabled}
              style={{ width: '100%', padding: '12px 18px', borderRadius: 10, background: aplicarDisabled ? 'var(--border)' : '#10b981', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: aplicarDisabled ? 'default' : 'pointer', fontFamily: 'inherit' }}
            >
              {saving ? 'Guardando…' : `Marcar ${seleccionados.size || ''} como producción`}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={mode === 'sector' ? sectorParaAsignar : proveedorParaAsignar}
                onChange={e => mode === 'sector' ? setSectorParaAsignar(e.target.value) : setProveedorParaAsignar(e.target.value)}
                style={{ ...inputStyle, flex: 1, appearance: 'auto', cursor: 'pointer' }}
              >
                <option value="">{mode === 'sector' ? 'Elegir sector…' : 'Elegir proveedor…'}</option>
                {mode === 'proveedor' && <option value="__sin__">Sin proveedor</option>}
                {mode === 'sector'
                  ? sectores.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)
                  : proveedores.map(pr => <option key={pr.id} value={pr.id}>{pr.nombre}</option>)}
              </select>
              <button
                onClick={aplicar}
                disabled={aplicarDisabled}
                style={{ padding: '0 18px', borderRadius: 10, background: aplicarDisabled ? 'var(--border)' : 'var(--navy)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: aplicarDisabled ? 'default' : 'pointer', fontFamily: 'inherit' }}
              >
                {saving ? 'Guardando…' : 'Asignar'}
              </button>
            </div>
          )}
        </div>
      </div>
    </SheetChrome>
  )
}
