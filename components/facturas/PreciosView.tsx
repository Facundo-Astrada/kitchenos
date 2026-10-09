'use client'

// Pestaña "Precios" de Compras. Lo que queda por decidir después de importar facturas:
//  1. Cambios de precio grandes (> UMBRAL_REVISION_PCT) que NO se aplicaron solos:
//     aplicar / mantener / "no es este producto" (desvincula la línea).
//  2. Cambios aplicados de los últimos 60 días, con "deshacer".
//  3. Líneas de factura sin producto de stock, separadas por tipo (mercadería,
//     bebidas, limpieza, otros gastos), con la sugerencia a un toque. Lo que se
//     vincula queda en producto_alias: el próximo import lo reconoce solo.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/supabase/paginate'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { sugerirProductos, normAlias } from '@/lib/facturas/sugerirProducto'
import { SegmentedTabs, FilterChips, EmptyState, Num, ConfirmSheet } from '@/components/ui'

type ProductoLite = { id: string; nombre: string; unidad: string; precio_unitario: number | null }

type Cambio = {
  id: string
  producto_id: string
  precio_anterior: number | null
  precio_nuevo: number
  variacion_porcentaje: number | null
  fecha: string
  factura_id: string | null
  estado: 'aplicado' | 'pendiente' | 'descartado'
  origen: string | null
}

type Tipo = 'mercaderia' | 'bebidas' | 'limpieza' | 'otros'

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
  tipo: Tipo
}

const fmt = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: n < 100 ? 2 : 0 })
const fmtFecha = (d: string) => new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })

// Categoría de Fudo → tipo. Lo que no se reconoce (o facturas sin categoría) cuenta como mercadería.
const BEBIDAS = ['vino', 'bebida', 'cerveza', 'licor', 'destilad', 'agua', 'gaseosa']
const LIMPIEZA = ['limpieza', 'descartable']
const OTROS = ['egreso', 'impuesto', 'servicio', 'mantenimiento', 'equipamiento', 'honorario', 'vajilla', 'utensil', 'mano de obra', 'alquiler', 'suscrip', 'software', 'publicidad', 'marketing', 'bancari', 'comision']
function tipoDe(categoria: string | null | undefined): Tipo {
  const c = normAlias(categoria ?? '')
  if (!c) return 'mercaderia'
  if (BEBIDAS.some(k => c.includes(k))) return 'bebidas'
  if (LIMPIEZA.some(k => c.includes(k))) return 'limpieza'
  if (OTROS.some(k => c.includes(k))) return 'otros'
  return 'mercaderia'
}
const TIPO_LABEL: Record<Tipo, string> = { mercaderia: 'Mercadería', bebidas: 'Bebidas y vinos', limpieza: 'Limpieza y descartables', otros: 'Otros gastos' }

const btn = (bg: string, color: string, borde = 'none'): React.CSSProperties => ({ padding: '6px 10px', borderRadius: 8, border: borde, background: bg, color, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' })

export default function PreciosView({ productos, showToast, onCambio }: {
  productos: ProductoLite[]
  showToast: (msg: string) => void
  /** Avisa que cambió un precio o un producto de stock, para que el padre refresque. */
  onCambio?: () => void
}) {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])
  const [sub, setSub] = useState<'cambios' | 'sueltos'>('cambios')

  const [cambios, setCambios] = useState<Cambio[]>([])
  const [nombresExtra, setNombresExtra] = useState<Map<string, ProductoLite>>(new Map())
  const [cargandoC, setCargandoC] = useState(true)
  const [filtro, setFiltro] = useState<'todos' | 'suben' | 'bajan' | 'grandes'>('todos')
  const [orden, setOrden] = useState<'reciente' | 'variacion'>('variacion')

  const [sueltos, setSueltos] = useState<Suelto[]>([])
  const [cargandoS, setCargandoS] = useState(true)
  const [tipo, setTipo] = useState<Tipo>('mercaderia')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [confirmarCrear, setConfirmarCrear] = useState(false)

  const productosRef = useRef(productos)
  useEffect(() => { productosRef.current = productos }, [productos])

  const productoDe = useMemo(() => {
    const m = new Map(nombresExtra)
    for (const p of productos) m.set(p.id, p)
    return m
  }, [productos, nombresExtra])

  const cargarCambios = useCallback(async () => {
    if (!RESTAURANTE_ID) return
    const desde = new Date(Date.now() - 60 * 86400000).toISOString()
    const { data } = await supabase.from('precio_historial')
      .select('id, producto_id, precio_anterior, precio_nuevo, variacion_porcentaje, fecha, factura_id, estado, origen')
      .eq('restaurante_id', RESTAURANTE_ID)
      .or(`fecha.gte.${desde},estado.eq.pendiente`)
      .order('fecha', { ascending: false }).limit(800)
    const filas = (data ?? []) as Cambio[]
    setCambios(filas)
    // Productos que no vienen en la lista de stock (inactivos, fuera de uso): traer su nombre igual.
    const conocidos = new Set(productosRef.current.map(p => p.id))
    const faltan = Array.from(new Set(filas.map(c => c.producto_id).filter(id => !conocidos.has(id))))
    if (faltan.length > 0) {
      const { data: extra } = await supabase.from('productos').select('id, nombre, unidad, precio_unitario').in('id', faltan.slice(0, 300))
      setNombresExtra(new Map(((extra ?? []) as ProductoLite[]).map(p => [p.id, p])))
    }
    setCargandoC(false)
  }, [RESTAURANTE_ID, supabase])

  const cargarSueltos = useCallback(async () => {
    if (!RESTAURANTE_ID) return
    const desde = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)
    type Fac = { proveedor_nombre: string; fecha_factura: string | null; categoria_origen: string | null }
    type Fila = { id: string; producto_nombre: string; unidad: string | null; precio_unitario: number; subtotal: number | null; facturas: Fac | Fac[] }
    try {
      const filas = await fetchAllRows<Fila>((from, to) =>
        supabase.from('factura_items')
          .select('id, producto_nombre, unidad, precio_unitario, subtotal, facturas!inner(proveedor_nombre, fecha_factura, categoria_origen, restaurante_id)')
          .is('producto_id', null).gt('precio_unitario', 0)
          .eq('facturas.restaurante_id', RESTAURANTE_ID).gte('facturas.fecha_factura', desde)
          .range(from, to) as unknown as PromiseLike<{ data: Fila[] | null; error: { message: string } | null }>
      )
      const mapa = new Map<string, Suelto>()
      for (const it of filas) {
        const f = Array.isArray(it.facturas) ? it.facturas[0] : it.facturas
        const k = normAlias(it.producto_nombre)
        if (!k) continue
        const fecha = f?.fecha_factura ?? ''
        const prev = mapa.get(k)
        if (!prev) {
          mapa.set(k, { clave: k, nombre: it.producto_nombre, ids: [it.id], veces: 1, gasto: it.subtotal ?? 0, ultimoPrecio: it.precio_unitario, unidad: it.unidad ?? 'u', proveedor: f?.proveedor_nombre ?? '', fecha, tipo: tipoDe(f?.categoria_origen) })
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

  // Los loaders solo setean estado después de un await (fetch a la base); la regla no lo distingue.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargarCambios(); void cargarSueltos() }, [cargarCambios, cargarSueltos])

  const pendientes = useMemo(() => cambios.filter(c => c.estado === 'pendiente'), [cambios])
  const aplicados = useMemo(() => cambios.filter(c => c.estado === 'aplicado' && (c.precio_anterior ?? 0) > 0), [cambios])

  const cambiosVista = useMemo(() => {
    let l = aplicados
    if (filtro === 'suben') l = l.filter(c => (c.variacion_porcentaje ?? 0) > 0)
    if (filtro === 'bajan') l = l.filter(c => (c.variacion_porcentaje ?? 0) < 0)
    if (filtro === 'grandes') l = l.filter(c => Math.abs(c.variacion_porcentaje ?? 0) >= 15)
    return [...l].sort((a, b) => orden === 'variacion'
      ? Math.abs(b.variacion_porcentaje ?? 0) - Math.abs(a.variacion_porcentaje ?? 0)
      : b.fecha.localeCompare(a.fecha))
  }, [aplicados, filtro, orden])

  const kpi = useMemo(() => ({
    total: aplicados.length,
    suben: aplicados.filter(c => (c.variacion_porcentaje ?? 0) > 0).length,
    bajan: aplicados.filter(c => (c.variacion_porcentaje ?? 0) < 0).length,
    mayor: aplicados.reduce((m, c) => Math.max(m, c.variacion_porcentaje ?? 0), 0),
  }), [aplicados])

  const porTipo = useMemo(() => {
    const m: Record<Tipo, Suelto[]> = { mercaderia: [], bebidas: [], limpieza: [], otros: [] }
    for (const s of sueltos) m[s.tipo].push(s)
    return m
  }, [sueltos])
  const sueltosVista = porTipo[tipo]

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const texto = await res.text()
    let data: Record<string, unknown> = {}
    try { data = JSON.parse(texto) } catch { throw new Error('El servidor no respondió a tiempo. Probá de nuevo.') }
    if (!res.ok) throw new Error(String(data.error || 'Error'))
    return data
  }

  async function resolver(c: Cambio, accion: 'aplicar' | 'descartar' | 'desvincular') {
    setTrabajando(c.id)
    try {
      await post('/api/facturas/resolver-precio', { historial_id: c.id, accion })
      const nombre = productoDe.get(c.producto_id)?.nombre ?? 'el producto'
      showToast(accion === 'aplicar' ? `✓ ${nombre} pasa a ${fmt(c.precio_nuevo)}` : accion === 'descartar' ? `✓ ${nombre} conserva su precio` : `✓ Esa línea ya no se vincula a ${nombre}`)
      await cargarCambios()
      if (accion !== 'descartar') { onCambio?.(); if (accion === 'desvincular') void cargarSueltos() }
    } catch (e) { showToast(e instanceof Error ? e.message : 'No se pudo resolver') }
    setTrabajando(null)
  }

  async function deshacer(c: Cambio) {
    setTrabajando(c.id)
    try {
      const data = await post('/api/facturas/revertir-precio', { historial_id: c.id })
      showToast(`✓ Precio devuelto a ${fmt(Number(data.precio))}`)
      await cargarCambios(); onCambio?.()
    } catch (e) { showToast(e instanceof Error ? e.message : 'No se pudo deshacer') }
    setTrabajando(null)
  }

  async function vincular(s: Suelto, productoId: string) {
    setTrabajando(s.clave)
    try {
      const data = await post('/api/facturas/vincular-items', { producto_id: productoId, item_ids: s.ids }) as { precio?: { anterior: number; nuevo: number }; sin_convertir?: boolean }
      const p = productoDe.get(productoId)
      const extra = data.precio ? ` · precio ${fmt(data.precio.anterior)} → ${fmt(data.precio.nuevo)}` : data.sin_convertir ? ' · el precio no se tocó (unidad distinta)' : ''
      showToast(`✓ "${s.nombre}" → ${p?.nombre ?? 'producto'}${extra}`)
      setAbierto(null); setBusqueda('')
      setSueltos(prev => prev.filter(x => x.clave !== s.clave))
      if (data.precio) { void cargarCambios(); onCambio?.() }
    } catch (e) { showToast(e instanceof Error ? e.message : 'No se pudo vincular') }
    setTrabajando(null)
  }

  async function crear(lista: Suelto[], categoria: string) {
    setTrabajando('crear')
    try {
      const data = await post('/api/facturas/crear-productos', {
        categoria,
        grupos: lista.map(s => ({ nombre: s.nombre, unidad: s.unidad, precio: s.ultimoPrecio, item_ids: s.ids })),
      }) as { creados: number; errores: string[] }
      showToast(`✓ ${data.creados} producto${data.creados !== 1 ? 's' : ''} creado${data.creados !== 1 ? 's' : ''} en stock${data.errores.length ? ` · ${data.errores.length} con error` : ''}`)
      const hechos = new Set(lista.map(s => s.clave))
      setSueltos(prev => prev.filter(x => !hechos.has(x.clave)))
      setAbierto(null)
      onCambio?.()
    } catch (e) { showToast(e instanceof Error ? e.message : 'No se pudieron crear') }
    setTrabajando(null)
  }

  async function autoVincular() {
    setTrabajando('auto')
    try {
      const data = await post('/api/facturas/auto-vincular', {}) as { vinculadas: number; nombres: number }
      showToast(data.vinculadas > 0 ? `✓ ${data.vinculadas} líneas vinculadas (${data.nombres} descripciones)` : 'No había vínculos seguros nuevos')
      await cargarSueltos()
    } catch (e) { showToast(e instanceof Error ? e.message : 'No se pudo vincular') }
    setTrabajando(null)
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
      <SegmentedTabs variant="onLight" active={sub} onChange={setSub}
        tabs={[
          { id: 'cambios', label: `Cambios de precio${pendientes.length ? ` · ${pendientes.length} a revisar` : ''}`, icon: 'trending_up' },
          { id: 'sueltos', label: `Sin vincular${porTipo.mercaderia.length ? ` · ${porTipo.mercaderia.length}` : ''}`, icon: 'link_off' },
        ]} />

      {sub === 'cambios' && (
        <div style={{ marginTop: 12 }}>
          {pendientes.length > 0 && (
            <div style={{ background: 'var(--amber-bg)', borderRadius: 14, padding: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--amber-fg)' }}>rule</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--amber-fg)' }}>{pendientes.length} cambio{pendientes.length !== 1 ? 's' : ''} grande{pendientes.length !== 1 ? 's' : ''} sin aplicar</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--amber-fg)', opacity: 0.85, marginBottom: 10 }}>
                Más de ±50%: casi siempre es una unidad mal leída o una línea que no es ese producto. El precio de stock no cambió hasta que lo confirmes.
              </div>
              {pendientes.map(c => {
                const p = productoDe.get(c.producto_id)
                const v = c.variacion_porcentaje ?? 0
                const ocupado = trabajando === c.id
                return (
                  <div key={c.id} style={{ background: 'var(--surface)', borderRadius: 10, padding: '10px 12px', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ flex: 1, minWidth: 140, fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{p?.nombre ?? 'Producto'}{p ? <span style={{ fontWeight: 500, color: 'var(--text-3)' }}> · por {p.unidad}</span> : null}</span>
                      <Num><span style={{ fontSize: 12, color: 'var(--text-3)' }}>{fmt(c.precio_anterior ?? 0)}</span></Num>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-3)' }}>arrow_forward</span>
                      <Num><span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{fmt(c.precio_nuevo)}</span></Num>
                      <span style={{ fontSize: 12, fontWeight: 800, color: v > 0 ? '#ef4444' : '#10b981' }}>{v > 0 ? '+' : ''}{v.toFixed(0)}%</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', margin: '3px 0 8px' }}>
                      Línea de factura: <b style={{ color: 'var(--text-2)' }}>{c.origen ?? '—'}</b> · {fmtFecha(c.fecha)}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', opacity: ocupado ? 0.5 : 1 }}>
                      <button disabled={ocupado} onClick={() => resolver(c, 'aplicar')} style={btn('var(--navy)', '#fff')}>Aplicar precio</button>
                      <button disabled={ocupado} onClick={() => resolver(c, 'descartar')} style={btn('var(--bg)', 'var(--text-1)', '1px solid var(--border)')}>Mantener el actual</button>
                      <button disabled={ocupado} onClick={() => resolver(c, 'desvincular')} style={btn('transparent', 'var(--red-fg)', '1px solid var(--border)')}>No es este producto</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8, marginBottom: 12 }}>
            {[
              { l: 'Aplicados (60 días)', v: String(kpi.total), c: 'var(--text-1)' },
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
            const p = productoDe.get(c.producto_id)
            const v = c.variacion_porcentaje ?? 0
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.nombre ?? 'Producto eliminado'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fmtFecha(c.fecha)}{p ? ` · por ${p.unidad}` : ''}{c.origen ? ` · ${c.origen}` : c.factura_id ? '' : ' · ajuste manual'}
                  </div>
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <FilterChips active={tipo} onChange={v => { setTipo(v as Tipo); setAbierto(null) }}
                chips={(Object.keys(TIPO_LABEL) as Tipo[]).map(t => ({ value: t, label: `${TIPO_LABEL[t]} · ${porTipo[t].length}` }))} />
            </div>
            <button onClick={autoVincular} disabled={trabajando === 'auto'} style={{ ...btn('var(--navy)', '#fff'), opacity: trabajando === 'auto' ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_fix_high</span>
              {trabajando === 'auto' ? 'Vinculando…' : 'Vincular lo seguro'}
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 10px' }}>
            {tipo === 'otros'
              ? 'Servicios, impuestos y gastos que no son mercadería: no van a stock. Están acá solo para que los veas.'
              : tipo === 'bebidas'
                ? 'Vinos y bebidas de tus facturas que no están en stock. Podés crearlos todos de una vez (stock 0, precio de la última compra).'
                : 'Líneas de tus facturas (últimos 4 meses) sin producto de stock, de lo que más gastaste a lo que menos. Vinculá una vez: se actualiza el precio y los próximos imports la reconocen.'}
          </p>

          {tipo === 'bebidas' && porTipo.bebidas.length > 0 && (
            <button onClick={() => setConfirmarCrear(true)} disabled={trabajando === 'crear'}
              style={{ ...btn('var(--accent)', '#fff'), width: '100%', padding: '10px', marginBottom: 10, opacity: trabajando === 'crear' ? 0.6 : 1 }}>
              {trabajando === 'crear' ? 'Creando…' : `Crear los ${porTipo.bebidas.length} como productos de stock (Bebidas)`}
            </button>
          )}

          {cargandoS ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Cargando…</div>
          ) : sueltosVista.length === 0 ? (
            <EmptyState icon="link" title="Nada por vincular acá" subtitle="Todas las líneas recientes de este tipo ya tienen producto." />
          ) : sueltosVista.slice(0, 150).map(s => {
            const abre = abierto === s.clave
            const sug = tipo === 'otros' ? undefined : sugerirProductos(s.nombre, productos, 1)[0]
            const cands = abre
              ? (busqueda.trim()
                ? productos.filter(p => normAlias(p.nombre).includes(normAlias(busqueda))).slice(0, 8)
                : sugerirProductos(s.nombre, productos, 6).map(x => x.producto))
              : []
            const ocupado = trabajando === s.clave
            return (
              <div key={s.clave} style={{ marginBottom: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', opacity: ocupado ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
                  <button onClick={() => { setAbierto(abre ? null : s.clave); setBusqueda('') }}
                    style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, fontFamily: 'inherit' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.proveedor} · {s.veces} compra{s.veces !== 1 ? 's' : ''} · último {fmt(s.ultimoPrecio)}/{s.unidad}</div>
                  </button>
                  {sug && sug.puntaje >= 0.6 && !abre && (
                    <button disabled={ocupado} onClick={() => vincular(s, sug.producto.id)} title="Vincular a este producto"
                      style={{ ...btn('var(--green-bg)', 'var(--green-fg)'), display: 'flex', alignItems: 'center', gap: 4, maxWidth: 200, overflow: 'hidden' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>link</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{sug.producto.nombre}</span>
                    </button>
                  )}
                  <Num><span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy-ink)' }}>{fmt(s.gasto)}</span></Num>
                  {tipo !== 'otros' && (
                    <button onClick={() => { setAbierto(abre ? null : s.clave); setBusqueda('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>{abre ? 'expand_less' : 'expand_more'}</span>
                    </button>
                  )}
                </div>
                {abre && tipo !== 'otros' && (
                  <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--border)' }}>
                    <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar producto de stock…"
                      style={{ width: '100%', margin: '10px 0 8px', padding: '9px 11px', fontSize: 16, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit' }} />
                    {cands.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '4px 0 8px' }}>Sin coincidencias. Probá otra palabra o crealo.</div>
                    ) : cands.map(p => (
                      <button key={p.id} onClick={() => vincular(s, p.id)} disabled={ocupado}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 4, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}>{p.nombre}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmt(p.precio_unitario ?? 0)}/{p.unidad}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>Vincular</span>
                      </button>
                    ))}
                    <button onClick={() => crear([s], tipo === 'bebidas' ? 'Bebidas' : tipo === 'limpieza' ? 'Limpieza' : 'Otros')} disabled={ocupado || trabajando === 'crear'}
                      style={{ ...btn('var(--navy)', '#fff'), marginTop: 6 }}>
                      Crear &ldquo;{s.nombre}&rdquo; como producto nuevo
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {confirmarCrear && (
        <ConfirmSheet
          icon="add_box" iconColor="var(--accent)"
          title={`¿Crear ${porTipo.bebidas.length} productos?`}
          body="Se agregan a Stock en la categoría Bebidas, con stock 0 y el precio de la última compra. Las líneas de factura quedan vinculadas y los próximos imports los reconocen."
          confirmLabel="Crear" confirmColor="var(--accent)"
          onCancel={() => setConfirmarCrear(false)}
          onConfirm={() => { setConfirmarCrear(false); void crear(porTipo.bebidas, 'Bebidas') }}
        />
      )}
    </div>
  )
}
