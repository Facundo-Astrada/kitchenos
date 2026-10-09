'use client'

// Equivalencias "categoría de Fudo" → categoría de gasto de K-OS. Se guardan en
// restaurantes.configuracion.categorias_origen y las usa el import: una factura
// que entra sin categoría (ni por proveedor) toma la de su categoría de origen.
// Sin esto, Presupuesto/CMV no contaban la mayoría de las facturas importadas.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { normAlias } from '@/lib/facturas/sugerirProducto'
import type { CategoriaGasto } from '@/types'

type Fila = { origen: string; facturas: number; sinCategoria: number }

export default function MapeoCategoriasOrigen({ categorias, showToast }: {
  categorias: CategoriaGasto[]
  showToast: (msg: string) => void
}) {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])
  const [filas, setFilas] = useState<Fila[]>([])
  const [mapa, setMapa] = useState<Record<string, string>>({})
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!RESTAURANTE_ID) return
    const { data: rest } = await supabase.from('restaurantes').select('configuracion').eq('id', RESTAURANTE_ID).single()
    const cfg = (rest?.configuracion ?? {}) as { categorias_origen?: Record<string, string> }
    setMapa(cfg.categorias_origen ?? {})
    const conteo = new Map<string, Fila>()
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('facturas').select('categoria_origen, categoria_gasto_id')
        .eq('restaurante_id', RESTAURANTE_ID).not('categoria_origen', 'is', null).range(from, from + 999)
      for (const f of (data ?? []) as { categoria_origen: string; categoria_gasto_id: string | null }[]) {
        const x = conteo.get(f.categoria_origen) ?? { origen: f.categoria_origen, facturas: 0, sinCategoria: 0 }
        x.facturas++
        if (!f.categoria_gasto_id) x.sinCategoria++
        conteo.set(f.categoria_origen, x)
      }
      if (!data || data.length < 1000) break
    }
    setFilas(Array.from(conteo.values()).sort((a, b) => b.facturas - a.facturas))
  }, [RESTAURANTE_ID, supabase])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- setea estado recién después del fetch
  useEffect(() => { void cargar() }, [cargar])

  async function asignar(origen: string, categoriaId: string) {
    if (!RESTAURANTE_ID) return
    setGuardando(origen)
    const clave = normAlias(origen)
    const nuevo = { ...mapa }
    if (categoriaId) nuevo[clave] = categoriaId
    else delete nuevo[clave]
    const { data: rest } = await supabase.from('restaurantes').select('configuracion').eq('id', RESTAURANTE_ID).single()
    const cfg = (rest?.configuracion ?? {}) as Record<string, unknown>
    const { error } = await supabase.from('restaurantes').update({ configuracion: { ...cfg, categorias_origen: nuevo } }).eq('id', RESTAURANTE_ID)
    if (error) { showToast('No se pudo guardar'); setGuardando(null); return }
    setMapa(nuevo)
    // Completa las facturas de esa categoría que todavía no tienen una (no pisa las elegidas a mano).
    if (categoriaId) {
      await supabase.from('facturas').update({ categoria_gasto_id: categoriaId })
        .eq('restaurante_id', RESTAURANTE_ID).eq('categoria_origen', origen).is('categoria_gasto_id', null)
    }
    showToast(`✓ "${origen}" de Fudo → ${categorias.find(c => c.id === categoriaId)?.nombre ?? 'sin asignar'}`)
    await cargar()
    setGuardando(null)
  }

  if (filas.length === 0) return null
  const pendientes = filas.filter(f => !mapa[normAlias(f.origen)]).length

  return (
    <div style={{ marginBottom: 18, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <button onClick={() => setAbierto(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '11px 12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>swap_horiz</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Categorías de Fudo</span>
        {pendientes > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#d97706', borderRadius: 99, padding: '1px 7px' }}>{pendientes} sin asignar</span>}
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)', marginLeft: 'auto', transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>expand_more</span>
      </button>
      {abierto && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, padding: '8px 12px' }}>
            Cada factura importada de Fudo toma la categoría de gasto que elijas acá (si su proveedor no tiene una propia).
          </p>
          {filas.map(f => {
            const actual = mapa[normAlias(f.origen)] ?? ''
            return (
              <div key={f.origen} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', opacity: guardando === f.origen ? 0.6 : 1 }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{f.origen}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{f.facturas} facturas{f.sinCategoria ? ` · ${f.sinCategoria} sin categoría` : ''}</div>
                </div>
                <select value={actual} disabled={guardando === f.origen} onChange={e => asignar(f.origen, e.target.value)}
                  style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', minWidth: 180 }}>
                  <option value="">Sin asignar</option>
                  {categorias.filter(c => c.activa).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
