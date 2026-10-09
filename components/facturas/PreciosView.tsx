'use client'

// Pestaña "Precios" de Compras. Dos preguntas que quedan después de importar facturas:
//  1. ¿Qué precios de stock se movieron? (precio_historial) — con "Deshacer".
//  2. ¿Qué mercadería compré que no está vinculada a un producto? — se vincula una
//     vez y el alias queda guardado: el próximo import la reconoce sola.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/supabase/paginate'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { resolverProductosDeItems } from '@/lib/facturas/matching'
import { SegmentedTabs, FilterChips, EmptyState, Num } from '@/components/ui'

type ProductoLite = { id: string; nombre: string; unidad: string; precio_unitario: number | null }

type Cambio = {
  id: string
  producto_id: string
  precio_anterior: number | null
  precio_nuevo: number
  variacion_porcentaje: number | null
  fecha: string
  factura_id: string | null
}

type Suelto = {
  clave: string
  nombre: string
  ids: string[]
  veces: number
  gasto: number
  ultimoPrecio: number
  unidad: string
  proveedor: string
  fecha: string
}

const fmt = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: n < 100 ? 2 : 0 })
const fmtFecha = (d: string) => new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })

function norm(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Candidatos para vincular: ordena el stock por palabras en común con la descripción de la factura.
function candidatos(nombre: string, productos: ProductoLite[], busqueda: string): ProductoLite[] {
  const q = norm(busqueda)
  if (q) return productos.filter(p => norm(p.nombre).includes(q)).slice(0, 8)
  const palabras = norm(nombre).split(' ').filter(w => w.length >= 3)
  return productos
    .map(p => {
      const pn = norm(p.nombre)
      const score = palabras.reduce((s, w) => s + (pn.includes(w) ? 1 : 0), 0)
      return { p, score }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(x => x.p)
}

export default function PreciosView({ productos, showToast, onCambio }: {
  productos: ProductoLite[]
  showToast: (msg: string) => void
  /** Avisa que cambió un precio de stock, para que el padre refresque el stock. */
  onCambio?: () => void
}) {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])
  const [sub, setSub] = useState<'cambios' | 'sueltos'>('cambios')

  const [cambios, setCambios] = useState<Cambio[]>([])
  const [cargandoC, setCargandoC] = useState(true)
  const [filtro, setFiltro] = useState<'todos' | 'suben' | 'bajan' | 'grandes'>('todos')
  const [orden, setOrden] = useState<'reciente' | 'variacion'>('variacion')

  const [sueltos, setSueltos] = useState<Suelto[]>([])
  const [cargandoS, setCargandoS] = useState(true)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [ocultos, setOcultos] = useState<Set<string>>(new Set())

  const nombreDe = useMemo(() => new Map(productos.map(p => [p.id, p])), [productos])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('kos_precios_ocultos')
      if (raw) setOcultos(new Set(JSON.parse(raw) as string[]))
    } catch { /* sin storage */ }
  }, [])

  const cargarCambios = useCallback(async () => {
    if (!RESTAURANTE_ID) return
    setCargandoC(true)
    const desde = new Date(Date.now() - 60 * 86400000).toISOString()
    const { data } = await supabase.from('precio_historial')
      .select('id, producto_id, precio_anterior, precio_nuevo, variacion_porcentaje, fecha, factura_id')
      .eq('restaurante_id', RESTAURANTE_ID).gte('fecha', desde)
      .order('fecha', { ascending: false }).limit(500)
    setCambios((data ?? []) as Cambio[])
    setCargandoC(false)
  }, [RESTAURANTE_ID, supabase])

  const cargarSueltos = useCallback(async () => {
    if (!RESTAURANTE_ID) return
    setCargandoS(true)
    const desde = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)
    type Fila = { id: string; producto_nombre: string; cantidad: number; unidad: string | null; precio_unitario: number; subtotal: number | null; facturas: { proveedor_nombre: string; fecha_factura: string | null } | { proveedor_nombre: string; fecha_factura: string | null }[] }
    try {
      const filas = await fetchAllRows<Fila>((from, to) =>
        supabase.from('factura_items')
          .select('id, producto_nombre, cantidad, unidad, precio_unitario, subtotal, facturas!inner(proveedor_nombre, fecha_factura, restaurante_id)')
          .is('producto_id', null).gt('precio_unitario', 0)
          .eq('facturas.restaurante_id', RESTAURANTE_ID).gte('facturas.fecha_factura', desde)
          .range(from, to) as unknown as PromiseLike<{ data: Fila[] | null; error: { message: string } | null }>
      )
      const mapa = new Map<string, Suelto>()
      for (const it of filas) {
        const f = Array.isArray(it.facturas) ? it.facturas[0] : it.facturas
        const k = norm(it.producto_nombre)
        if (!k) continue
        const fecha = f?.fecha_factura ?? ''
        const prev = mapa.get(k)
        if (!prev) {
          mapa.set(k, { clave: k, nombre: it.producto_nombre, ids: [it.id], veces: 1, gasto: it.subtotal ?? 0, ultimoPrecio: it.precio_unitario, unidad: it.unidad ?? 'u', proveedor: f?.proveedor_nombre ?? '', fecha })
        } else {
          prev.ids.push(it.id); prev.veces++; prev.gasto += it.subtotal ?? 0
          if (fecha > prev.fecha) { prev.fecha = fecha; prev.ultimoPrecio = it.precio_unitario; prev.unidad = it.unidad ?? prev.unidad; prev.proveedor = f?.proveedor_nombre ?? prev.proveedor }
        }
      }
      setSueltos(Array.from(mapa.values()).sort((a, b) => b.gasto - a.gasto))
    } catch (e) {
      console.error('[PreciosView] sueltos:', e)
      showToast('No se pudieron cargar los ítems sin vincular')
    }
    setCargandoS(false)
  }, [RESTAURANTE_ID, supabase, showToast])

  useEffect(() => { void cargarCambios(); void cargarSueltos() }, [cargarCambios, cargarSueltos])

  const cambiosVista = useMemo(() => {
    let l = cambios.filter(c => (c.precio_anterior ?? 0) > 0)
    if (filtro === 'suben') l = l.filter(c => (c.variacion_porcentaje ?? 0) > 0)
    if (filtro === 'bajan') l = l.filter(c => (c.variacion_porcentaje ?? 0) < 0)
    if (filtro === 'grandes') l = l.filter(c => Math.abs(c.variacion_porcentaje ?? 0) >= 15)
    return [...l].sort((a, b) => orden === 'variacion'
      ? Math.abs(b.variacion_porcentaje ?? 0) - Math.abs(a.variacion_porcentaje ?? 0)
      : b.fecha.localeCompare(a.fecha))
  }, [cambios, filtro, orden])

  const kpi = useMemo(() => {
    const l = cambios.filter(c => (c.precio_anterior ?? 0) > 0)
    return {
      total: l.length,
      suben: l.filter(c => (c.variacion_porcentaje ?? 0) > 0).length,
      bajan: l.filter(c => (c.variacion_porcentaje ?? 0) < 0).length,
      mayor: l.reduce((m, c) => Math.max(m, c.variacion_porcentaje ?? 0), 0),
    }
  }, [cambios])

  async function deshacer(c: Cambio) {
    setTrabajando(c.id)
    try {
      const res = await fetch('/api/facturas/revertir-precio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ historial_id: c.id }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      showToast(`✓ Precio devuelto a ${fmt(data.precio)}`)
      await cargarCambios()
      onCambio?.()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo deshacer')
    }
    setTrabajando(null)
  }

  async function vincular(s: Suelto, productoId: string) {
    setTrabajando(s.clave)
    try {
      const res = await fetch('/api/facturas/vincular-items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ producto_id: productoId, item_ids: s.ids }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      const p = nombreDe.get(productoId)
      const extra = data.precio ? ` · precio ${fmt(data.precio.anterior)} → ${fmt(data.precio.nuevo)}` : data.sin_convertir ? ' · el precio no se tocó (unidad distinta, cargá el peso por unidad en Stock)' : ''
      showToast(`✓ "${s.nombre}" vinculado a ${p?.nombre ?? 'producto'}${extra}`)
      setAbierto(null); setBusqueda('')
      setSueltos(prev => prev.filter(x => x.clave !== s.clave))
      if (data.precio) { await cargarCambios(); onCambio?.() }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo vincular')
    }
    setTrabajando(null)
  }

  async function crearYVincular(s: Suelto) {
    if (!RESTAURANTE_ID) return
    setTrabajando(s.clave)
    try {
      const { items } = await resolverProductosDeItems({
        supabase, restauranteId: RESTAURANTE_ID,
        items: [{ producto_nombre: s.nombre, cantidad: 1, unidad: s.unidad, precio_unitario: s.ultimoPrecio, alicuota_iva: 0, subtotal: s.ultimoPrecio }],
      })
      const id = items[0]?.producto_id
      if (!id) throw new Error('No se pudo crear el producto')
      await vincular(s, id)
      onCambio?.()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo crear el producto')
      setTrabajando(null)
    }
  }

  function ocultar(s: Suelto) {
    const n = new Set(ocultos); n.add(s.clave)
    setOcultos(n)
    try { localStorage.setItem('kos_precios_ocultos', JSON.stringify(Array.from(n))) } catch { /* sin storage */ }
  }

  const sueltosVista = sueltos.filter(s => !ocultos.has(s.clave))

  return (
    <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
      <SegmentedTabs variant="onLight" active={sub} onChange={setSub}
        tabs={[{ id: 'cambios', label: `Cambios de precio${kpi.total ? ` · ${kpi.total}` : ''}`, icon: 'trending_up' }, { id: 'sueltos', label: `Sin vincular${sueltosVista.length ? ` · ${sueltosVista.length}` : ''}`, icon: 'link_off' }]} />

      {sub === 'cambios' && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8, marginBottom: 12 }}>
            {[
              { l: 'Cambios (60 días)', v: String(kpi.total), c: 'var(--text-1)' },
              { l: 'Suben', v: String(kpi.suben), c: '#f59e0b' },
              { l: 'Bajan', v: String(kpi.bajan), c: '#10b981' },
              { l: 'Mayor suba', v: kpi.mayor > 0 ? `+${kpi.mayor.toFixed(0)}%` : '—', c: kpi.mayor >= 15 ? '#ef4444' : 'var(--text-1)' },
            ].map(k => (
              <div key={k.l} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 10px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{k.l}</div>
                <Num><div style={{ fontSize: 18, fontWeight: 800, color: k.c }}>{k.v}</div></Num>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <FilterChips active={filtro} onChange={v => setFiltro(v as typeof filtro)}
                chips={[{ value: 'todos', label: 'Todos' }, { value: 'suben', label: 'Suben' }, { value: 'bajan', label: 'Bajan' }, { value: 'grandes', label: '±15% o más' }]} />
            </div>
            <button onClick={() => setOrden(o => o === 'variacion' ? 'reciente' : 'variacion')}
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 99, padding: '5px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
              Orden: {orden === 'variacion' ? 'mayor variación' : 'más recientes'}
            </button>
          </div>

          {cargandoC ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Cargando…</div>
          ) : cambiosVista.length === 0 ? (
            <EmptyState icon="sell" title="Sin cambios de precio" subtitle="Cuando importes facturas, acá ves qué precios de stock se movieron y podés deshacer alguno." />
          ) : cambiosVista.map(c => {
            const p = nombreDe.get(c.producto_id)
            const v = c.variacion_porcentaje ?? 0
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.nombre ?? 'Producto'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtFecha(c.fecha)}{p ? ` · por ${p.unidad}` : ''}{c.factura_id ? '' : ' · ajuste manual'}</div>
                </div>
                <Num><span style={{ fontSize: 12, color: 'var(--text-3)' }}>{fmt(c.precio_anterior ?? 0)}</span></Num>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-3)' }}>arrow_forward</span>
                <Num><span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{fmt(c.precio_nuevo)}</span></Num>
                <span style={{ minWidth: 46, textAlign: 'right', fontSize: 12, fontWeight: 800, color: Math.abs(v) >= 15 ? (v > 0 ? '#ef4444' : '#10b981') : v > 0 ? '#f59e0b' : '#10b981' }}>
                  {v > 0 ? '+' : ''}{v.toFixed(0)}%
                </span>
                <button onClick={() => deshacer(c)} disabled={trabajando === c.id} title="Volver al precio anterior"
                  style={{ border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 8, padding: '5px 8px', cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center', opacity: trabajando === c.id ? 0.5 : 1 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>undo</span>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {sub === 'sueltos' && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 10px' }}>
            Mercadería de tus facturas (últimos 4 meses) que no está vinculada a un producto de stock, de lo que más gastaste a lo que menos.
            Vinculala una vez: se actualiza el precio y los próximos imports la reconocen solos.
          </p>
          {cargandoS ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Cargando…</div>
          ) : sueltosVista.length === 0 ? (
            <EmptyState icon="link" title="Todo vinculado" subtitle="No hay mercadería suelta en las facturas recientes." />
          ) : sueltosVista.slice(0, 120).map(s => {
            const abre = abierto === s.clave
            const cands = abre ? candidatos(s.nombre, productos, busqueda) : []
            return (
              <div key={s.clave} style={{ marginBottom: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <button onClick={() => { setAbierto(abre ? null : s.clave); setBusqueda('') }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.proveedor} · {s.veces} compra{s.veces !== 1 ? 's' : ''} · último {fmt(s.ultimoPrecio)}/{s.unidad}</div>
                  </div>
                  <Num><span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy-ink)' }}>{fmt(s.gasto)}</span></Num>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>{abre ? 'expand_less' : 'expand_more'}</span>
                </button>
                {abre && (
                  <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--border)' }}>
                    <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar producto de stock…"
                      style={{ width: '100%', margin: '10px 0 8px', padding: '9px 11px', fontSize: 16, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit' }} />
                    {cands.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '4px 0 8px' }}>Sin coincidencias. Probá otra palabra o creá el producto.</div>
                    ) : cands.map(p => (
                      <button key={p.id} onClick={() => vincular(s, p.id)} disabled={trabajando === s.clave}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 4, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}>{p.nombre}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmt(p.precio_unitario ?? 0)}/{p.unidad}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>Vincular</span>
                      </button>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => crearYVincular(s)} disabled={trabajando === s.clave}
                        style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: 'var(--navy)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Crear producto nuevo
                      </button>
                      <button onClick={() => ocultar(s)}
                        style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        No es mercadería — ocultar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
