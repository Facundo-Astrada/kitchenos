'use client'

// Mapa de la carta (PLAN-DESARROLLO-PLATOS-2026-10, Fase 3) — reemplaza la
// órbita de satélites. Sigue el boceto del chef: filtros y grupos a la
// izquierda; en el tablero, las bebidas en una franja y cada grupo de la carta
// como una burbuja con sus platos. Tocar un plato abre al lado una ventanita
// con su info, con quién comparte componentes/ingredientes y una nota de
// seguimiento. Registro Preparación. Todo CSS, sin librerías de gráficos.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AVATAR_PALETTE, Modal } from '@/components/ui'
import type { CartaCategoria, CartaItemEnriquecido, CartaItemDB } from '@/lib/hooks/useCarta'
import { usePlatosDesarrollo } from '@/lib/hooks/usePlatosDesarrollo'
import {
  armarGrupos, compartidosCon, cumpleFiltros, indiceCompartidos, itemsDeFicha, itemsDePlato, masCompartidos,
  posicionVentana, type ItemCompartible, type RecetaParaMapa,
} from '@/lib/carta/mapaCarta'
import { fmtMoney } from './cards'

const ETIQUETAS = [
  { key: 's/tacc', label: 'S/TACC' },
  { key: 'vegano', label: 'Vegano' },
  { key: 'vegetariano', label: 'Vegetariano' },
  { key: 'keto', label: 'Keto' },
  { key: 'picante', label: 'Picante' },
  { key: 'sin lactosa', label: 'Sin lactosa' },
]

const VENTANA = { width: 330, height: 420 }

/** Un punto del tablero: plato de la carta o idea en desarrollo. */
interface Punto {
  id: string
  nombre: string
  categoria: string
  tags: string[]
  componentes: string[]
  precio: number | null
  disponible: boolean
  idea: boolean
  item?: CartaItemEnriquecido
}

type Seleccion = { tipo: 'plato'; id: string } | { tipo: 'item'; clave: string } | null

const etiquetaSeccion: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6,
}

const chipBase: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', minHeight: 30,
}

// ── Círculo de un plato ──────────────────────────────────────────────────

function CirculoPlato({ punto, color, tam, estado, badge, onTocar }: {
  punto: Punto
  color: string
  tam: number
  estado: 'normal' | 'elegido' | 'relacionado' | 'apagado' | 'filtrado'
  badge?: number
  onTocar: (el: HTMLElement) => void
}) {
  const opacidad = estado === 'filtrado' ? 0.18 : estado === 'apagado' ? 0.38 : 1
  const borde = estado === 'elegido' ? '3px solid var(--navy)'
    : estado === 'relacionado' ? '2.5px solid var(--accent)'
    : punto.idea ? `1.5px dashed ${color}` : `1.5px solid color-mix(in srgb, ${color} 55%, transparent)`
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onTocar(e.currentTarget) }}
      title={punto.nombre}
      data-plato-id={punto.id}
      style={{
        position: 'relative', width: tam, height: tam, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
        background: estado === 'relacionado' ? 'color-mix(in srgb, var(--accent) 12%, var(--surface))' : 'var(--surface)',
        border: borde, boxShadow: estado === 'elegido' ? 'var(--shadow-2)' : 'var(--shadow-1)', opacity: opacidad,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6, fontFamily: 'inherit', color: 'var(--text)',
        transition: 'opacity 200ms, border-color 200ms',
      }}
    >
      <span style={{
        fontSize: tam >= 90 ? 12 : 10.5, fontWeight: 700, lineHeight: 1.15, textAlign: 'center',
        display: '-webkit-box', WebkitLineClamp: tam >= 90 ? 4 : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        textDecoration: punto.disponible ? 'none' : 'line-through',
      }}>
        {punto.nombre}
      </span>
      {badge != null && badge > 0 && (
        <span style={{
          position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 99, padding: '0 5px',
          background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
        }}>{badge}</span>
      )}
    </button>
  )
}

// ── Ventanita del plato ──────────────────────────────────────────────────

function VentanaPlato({
  punto, compartidos, puntosPorId, categorias, verCostos, onCerrar, onElegirPlato, onElegirItem, onAbrirFicha,
  onGuardarNota, onCambiarGrupo, onCambiarTags,
}: {
  punto: Punto
  compartidos: { platoId: string; items: ItemCompartible[] }[]
  puntosPorId: Map<string, Punto>
  categorias: CartaCategoria[]
  verCostos: boolean
  onCerrar: () => void
  onElegirPlato: (id: string) => void
  onElegirItem: (clave: string) => void
  onAbrirFicha: (id: string) => void
  onGuardarNota: (id: string, nota: string) => void
  onCambiarGrupo: (id: string, categoria: string) => void
  onCambiarTags: (id: string, tags: string[]) => void
}) {
  const inicial = punto.item?.nota_chef ?? ''
  const [nota, setNota] = useState(inicial)
  const notaRef = useRef(nota)
  useEffect(() => { notaRef.current = nota }, [nota])
  // Guarda al cerrar/cambiar de plato si quedó algo sin guardar (el blur no corre si se desmonta).
  useEffect(() => () => {
    if (punto.item && notaRef.current !== inicial) onGuardarNota(punto.id, notaRef.current)
  }, [punto.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fc = punto.item?.food_cost_pct

  return (
    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', lineHeight: 1.25 }}>{punto.nombre}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            {punto.idea ? 'Idea en desarrollo' : punto.categoria}
            {punto.precio != null && punto.precio > 0 && <> · {fmtMoney(punto.precio)}</>}
            {verCostos && fc != null && <> · FC {Math.round(fc)}%</>}
            {!punto.disponible && <> · sin stock (86)</>}
          </div>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 2, display: 'flex' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
        </button>
      </div>

      {/* Etiquetas — se tocan para prender/apagar (alimentan los filtros) */}
      {!punto.idea && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {ETIQUETAS.map(t => {
            const on = punto.tags.includes(t.key)
            return (
              <button key={t.key} type="button"
                onClick={() => onCambiarTags(punto.id, on ? punto.tags.filter(x => x !== t.key) : [...punto.tags, t.key])}
                style={{ ...chipBase, fontSize: 11, padding: '3px 8px', minHeight: 26, border: on ? 'none' : '1px dashed var(--border)',
                  background: on ? 'var(--green-bg)' : 'transparent', color: on ? 'var(--green-fg)' : 'var(--text-3)' }}>
                {t.label}
              </button>
            )
          })}
        </div>
      )}

      {punto.componentes.length > 0 && (
        <div>
          <div style={etiquetaSeccion}>Componentes</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.45 }}>{punto.componentes.join(' · ')}</div>
        </div>
      )}

      <div>
        <div style={etiquetaSeccion}>Comparte con</div>
        {compartidos.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            {punto.componentes.length === 0 ? 'Sin componentes cargados: no se puede saber.' : 'Ningún otro plato usa sus componentes.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 150, overflowY: 'auto' }}>
            {compartidos.slice(0, 12).map(c => {
              const otro = puntosPorId.get(c.platoId)
              if (!otro) return null
              return (
                <div key={c.platoId} style={{ display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 12.5, padding: '3px 0' }}>
                  <button type="button" onClick={() => onElegirPlato(c.platoId)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, color: 'var(--navy-ink)', fontSize: 12.5, textAlign: 'left', flexShrink: 0, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {otro.nombre}
                  </button>
                  <span style={{ color: 'var(--text-2)', lineHeight: 1.35 }}>
                    {c.items.map((it, i) => (
                      <span key={it.clave}>
                        {i > 0 && ', '}
                        <button type="button" onClick={() => onElegirItem(it.clave)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: 'var(--text-2)', fontWeight: it.via === 'componente' ? 700 : 400, textDecoration: 'underline dotted' }}>
                          {it.nombre}
                        </button>
                      </span>
                    ))}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {!punto.idea && (
        <>
          <div>
            <div style={etiquetaSeccion}>Nota de seguimiento</div>
            <textarea value={nota} rows={3} placeholder="Para vos: cómo sale, qué probar, qué cambiar…"
              onChange={e => setNota(e.target.value)}
              onBlur={() => { if (nota !== inicial) onGuardarNota(punto.id, nota) }}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, lineHeight: 1.4, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={punto.categoria} onChange={e => onCambiarGrupo(punto.id, e.target.value)} aria-label="Grupo"
              style={{ flex: 1, minWidth: 0, minHeight: 40, padding: '0 8px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit' }}>
              {!categorias.some(c => c.nombre === punto.categoria) && <option value={punto.categoria}>{punto.categoria}</option>}
              {categorias.map(c => <option key={c.id} value={c.nombre}>Grupo: {c.nombre}</option>)}
            </select>
            <button type="button" onClick={() => onAbrirFicha(punto.id)} style={{ minHeight: 40, padding: '0 14px', borderRadius: 10, border: 'none', background: 'var(--navy)', color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Abrir ficha
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Pantalla ─────────────────────────────────────────────────────────────

export default function MapaCartaView({
  items, categorias, recetasPorId, verCostos, onBack, onOpenPlato, onOpenDesarrollo,
  actualizarItem, actualizarTags, crearCategoria, onToast,
}: {
  items: CartaItemEnriquecido[]
  categorias: CartaCategoria[]
  recetasPorId: Map<string, RecetaParaMapa>
  verCostos: boolean
  onBack: () => void
  onOpenPlato: (id: string) => void
  onOpenDesarrollo: () => void
  actualizarItem: (id: string, datos: Partial<Omit<CartaItemDB, 'id' | 'restaurante_id' | 'created_at'>>) => Promise<void>
  actualizarTags: (id: string, tags: string[]) => Promise<void>
  crearCategoria: (nombre: string) => Promise<void>
  onToast: (msg: string) => void
}) {
  const { platos: ideas } = usePlatosDesarrollo()
  const [filtros, setFiltros] = useState<string[]>([])
  const [mostrarIdeas, setMostrarIdeas] = useState(true)
  const [sel, setSel] = useState<Seleccion>(null)
  const [busquedaItem, setBusquedaItem] = useState('')
  const [nuevoGrupo, setNuevoGrupo] = useState('')
  const [ventanaPos, setVentanaPos] = useState<{ left: number; top: number } | null>(null)
  const [anchoTablero, setAnchoTablero] = useState(1000)
  const [anchoPagina, setAnchoPagina] = useState(1200)
  const tableroRef = useRef<HTMLDivElement>(null)
  const paginaRef = useRef<HTMLDivElement>(null)

  const recetaPorId = useCallback((id: string) => recetasPorId.get(id), [recetasPorId])

  // Cambios optimistas: actualizarItem recarga la carta entera (varios segundos con
  // componentes y costos), así que el grupo, la nota y las etiquetas se pintan ya y
  // se deshacen si la escritura falla.
  type Override = { categoria?: string; nota_chef?: string | null; tags?: string[] }
  const [overrides, setOverrides] = useState<Record<string, Override>>({})
  const aplicar = useCallback(async (id: string, cambio: Override, escribir: () => Promise<void>, error: string) => {
    const previo = overrides[id]
    setOverrides(o => ({ ...o, [id]: { ...o[id], ...cambio } }))
    try { await escribir() } catch { setOverrides(o => ({ ...o, [id]: previo ?? {} })); onToast(error) }
  }, [overrides, onToast])

  // Platos de la carta + ideas, con lo que tiene adentro cada uno.
  const { puntos, itemsPorPunto } = useMemo(() => {
    const ps: Punto[] = []
    const its: { id: string; items: ItemCompartible[] }[] = []
    for (const base of items) {
      const i = overrides[base.id] ? { ...base, ...overrides[base.id] } : base
      ps.push({
        id: i.id, nombre: i.nombre, categoria: i.categoria, tags: i.tags ?? [], precio: i.precio_venta,
        disponible: i.disponible, idea: false, item: i,
        componentes: i.plato_recetas.map(pr => pr.receta?.nombre ?? recetasPorId.get(pr.receta_id)?.nombre).filter((x): x is string => !!x),
      })
      its.push({ id: i.id, items: itemsDePlato(i, recetaPorId) })
    }
    if (mostrarIdeas) {
      for (const p of ideas ?? []) {
        if (p.estado !== 'idea' && p.estado !== 'prueba') continue
        const id = `idea:${p.id}`
        ps.push({
          id, nombre: p.nombre, categoria: p.categoria ?? 'Ideas', tags: [], precio: null, disponible: true, idea: true,
          componentes: p.ficha.componentes.map(c => c.nombre).filter(Boolean),
        })
        its.push({ id, items: itemsDeFicha(p.ficha.componentes, recetaPorId) })
      }
    }
    return { puntos: ps, itemsPorPunto: its }
  }, [items, ideas, mostrarIdeas, recetasPorId, recetaPorId, overrides])

  const puntosPorId = useMemo(() => new Map(puntos.map(p => [p.id, p])), [puntos])
  const indice = useMemo(() => indiceCompartidos(itemsPorPunto), [itemsPorPunto])
  // Como en el boceto: franjas arriba y Principales en el medio de los grupos.
  const grupos = useMemo(() => {
    const g = armarGrupos(categorias, puntos)
    const franjas = g.filter(x => x.forma === 'franja')
    const resto = g.filter(x => x.forma === 'grupo')
    const iP = resto.findIndex(x => /principal/i.test(x.nombre))
    if (iP < 0) return g
    const [principal] = resto.splice(iP, 1)
    resto.splice(Math.floor(resto.length / 2), 0, principal)
    return [...franjas, ...resto]
  }, [categorias, puntos])
  // Color fijo por grupo: sale de su lugar en carta_categorias, no del orden en pantalla
  // (que cambia al centrar Principales o al crear un grupo).
  const colorDe = useMemo(() => {
    const m = new Map<string, string>()
    const ordenadas = [...categorias].sort((a, b) => a.orden - b.orden)
    ordenadas.forEach((c, i) => m.set(c.nombre, AVATAR_PALETTE[i % AVATAR_PALETTE.length]))
    let extra = ordenadas.length
    for (const g of grupos) if (!m.has(g.nombre)) m.set(g.nombre, AVATAR_PALETTE[extra++ % AVATAR_PALETTE.length])
    return m
  }, [categorias, grupos])

  const top = useMemo(() => masCompartidos(indice), [indice])
  const itemsBuscados = useMemo(() => {
    const q = busquedaItem.trim().toLowerCase()
    const base = q ? [...indice.porItem.values()].filter(e => e.item.nombre.toLowerCase().includes(q)).sort((a, b) => b.platoIds.length - a.platoIds.length) : top
    return base.slice(0, 14)
  }, [busquedaItem, indice, top])

  // Qué resaltar según la selección.
  const { relacionados, badges } = useMemo(() => {
    const rel = new Set<string>()
    const bad = new Map<string, number>()
    if (sel?.tipo === 'plato') {
      for (const c of compartidosCon(sel.id, indice)) { rel.add(c.platoId); bad.set(c.platoId, c.items.length) }
    } else if (sel?.tipo === 'item') {
      for (const id of indice.porItem.get(sel.clave)?.platoIds ?? []) rel.add(id)
    }
    return { relacionados: rel, badges: bad }
  }, [sel, indice])

  const visibles = useMemo(() => puntos.filter(p => cumpleFiltros(p.tags, filtros)).length, [puntos, filtros])
  const elegido = sel?.tipo === 'plato' ? puntosPorId.get(sel.id) ?? null : null
  const itemElegido = sel?.tipo === 'item' ? indice.porItem.get(sel.clave) ?? null : null
  const compartidosElegido = useMemo(() => elegido ? compartidosCon(elegido.id, indice) : [], [elegido, indice])

  useEffect(() => {
    const el = tableroRef.current
    const pag = paginaRef.current
    if (!el || !pag) return
    const ro = new ResizeObserver(() => { setAnchoTablero(el.clientWidth); setAnchoPagina(pag.clientWidth) })
    ro.observe(el)
    ro.observe(pag)
    return () => ro.disconnect()
  }, [])
  const alCostado = anchoPagina >= 1040
  const ventanaFlotante = anchoTablero >= 640

  function ubicarVentana(id: string) {
    const tablero = tableroRef.current
    const circulo = tablero?.querySelector<HTMLElement>(`[data-plato-id="${CSS.escape(id)}"]`)
    if (!tablero || !circulo) { setVentanaPos(null); return }
    const t = tablero.getBoundingClientRect()
    const c = circulo.getBoundingClientRect()
    setVentanaPos(posicionVentana(
      { left: c.left - t.left, top: c.top - t.top, width: c.width, height: c.height },
      { width: t.width, height: Math.max(t.height, VENTANA.height + 20) }, VENTANA,
    ))
  }

  function elegirPlato(id: string) {
    setSel({ tipo: 'plato', id })
    // El círculo puede estar en otra parte del tablero: ubicar después del render.
    requestAnimationFrame(() => ubicarVentana(id))
  }

  function estadoDe(p: Punto): 'normal' | 'elegido' | 'relacionado' | 'apagado' | 'filtrado' {
    if (!cumpleFiltros(p.tags, filtros)) return 'filtrado'
    if (!sel) return 'normal'
    if (sel.tipo === 'plato' && sel.id === p.id) return 'elegido'
    return relacionados.has(p.id) ? 'relacionado' : 'apagado'
  }

  async function agregarGrupo() {
    const n = nuevoGrupo.trim()
    if (!n) return
    if (categorias.some(c => c.nombre.toLowerCase() === n.toLowerCase())) { onToast('Ese grupo ya existe'); return }
    try { await crearCategoria(n); setNuevoGrupo(''); onToast(`Grupo "${n}" creado — mové platos desde su ventana`) }
    catch { onToast('No se pudo crear el grupo') }
  }

  const ventana = elegido && (
    <VentanaPlato
      key={elegido.id}
      punto={elegido}
      compartidos={compartidosElegido}
      puntosPorId={puntosPorId}
      categorias={categorias}
      verCostos={verCostos}
      onCerrar={() => setSel(null)}
      onElegirPlato={elegirPlato}
      onElegirItem={clave => setSel({ tipo: 'item', clave })}
      onAbrirFicha={id => (elegido.idea ? onOpenDesarrollo() : onOpenPlato(id))}
      onGuardarNota={(id, nota) => { const v = nota.trim() || null; aplicar(id, { nota_chef: v }, () => actualizarItem(id, { nota_chef: v }), 'No se pudo guardar la nota') }}
      onCambiarGrupo={(id, categoria) => { aplicar(id, { categoria }, () => actualizarItem(id, { categoria }), 'No se pudo mover el plato'); requestAnimationFrame(() => requestAnimationFrame(() => ubicarVentana(id))) }}
      onCambiarTags={(id, tags) => { aplicar(id, { tags }, () => actualizarTags(id, tags), 'No se pudieron guardar las etiquetas') }}
    />
  )

  return (
    <div className="scroll-body" onClick={() => setSel(null)}>
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} aria-label="Volver" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 22 }}>arrow_back</span>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Mapa de la carta</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Grupos, filtros y lo que comparten tus platos</div>
          </div>
        </div>
      </div>

      <div ref={paginaRef} style={{ padding: '14px 14px 100px', display: 'flex', flexDirection: alCostado ? 'row' : 'column', gap: 14, alignItems: alCostado ? 'flex-start' : 'stretch', maxWidth: 1400, margin: '0 auto', boxSizing: 'border-box' }}>
        {/* ── Columna izquierda: filtros, compartidos, grupos ── */}
        <aside onClick={e => e.stopPropagation()} style={{ flex: alCostado ? '0 0 260px' : '0 0 auto', position: alCostado ? 'sticky' : 'static', top: 12,
          // Al costado: columna. Arriba (pantalla angosta o Coach abierto): bloques lado a lado, para no comerse el alto.
          ...(alCostado ? { display: 'flex', flexDirection: 'column' as const } : { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', alignItems: 'start' }), gap: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-1)', padding: 12 }}>
          <div>
            <div style={etiquetaSeccion}>Filtrar</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ETIQUETAS.map(t => {
                const on = filtros.includes(t.key)
                return (
                  <button key={t.key} type="button" onClick={() => setFiltros(f => on ? f.filter(x => x !== t.key) : [...f, t.key])}
                    style={{ ...chipBase, border: on ? 'none' : '1px solid var(--border)', background: on ? 'var(--navy)' : 'var(--surface)', color: on ? '#fff' : 'var(--text-2)' }}>
                    {t.label}
                  </button>
                )
              })}
            </div>
            {filtros.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
                {visibles} de {puntos.length} platos · <button type="button" onClick={() => setFiltros([])} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--navy-ink)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>limpiar</button>
              </div>
            )}
          </div>

          <div>
            <div style={etiquetaSeccion}>¿Quién usa…?</div>
            <input value={busquedaItem} onChange={e => setBusquedaItem(e.target.value)} placeholder="Ingrediente o preparación"
              style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 6 }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {itemsBuscados.map(e => {
                const on = sel?.tipo === 'item' && sel.clave === e.item.clave
                return (
                  <button key={e.item.clave} type="button" onClick={() => setSel(on ? null : { tipo: 'item', clave: e.item.clave })}
                    title={e.item.via === 'componente' ? 'Preparación (componente)' : 'Ingrediente dentro de los componentes'}
                    style={{ ...chipBase, fontSize: 11.5, padding: '4px 9px', minHeight: 28, border: on ? 'none' : '1px solid var(--border)',
                      background: on ? 'var(--accent)' : 'var(--surface)', color: on ? '#fff' : 'var(--text-2)', fontWeight: e.item.via === 'componente' ? 700 : 500 }}>
                    {e.item.nombre} · {e.platoIds.length}
                  </button>
                )
              })}
              {itemsBuscados.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Nada compartido con ese nombre.</span>}
            </div>
            {indice.comunes.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.4 }}>
                No vinculan por estar en casi todo: {indice.comunes.slice(0, 6).map(i => i.nombre.toLowerCase()).join(', ')}{indice.comunes.length > 6 ? '…' : ''}
              </div>
            )}
          </div>

          <div>
            <div style={etiquetaSeccion}>Grupos</div>
            <div style={{ display: 'flex', flexDirection: alCostado ? 'column' : 'row', flexWrap: 'wrap', gap: alCostado ? 2 : 10 }}>
              {grupos.map(g => (
                <div key={g.nombre} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '3px 0' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 99, background: colorDe.get(g.nombre), flexShrink: 0 }} />
                  <span style={{ flex: alCostado ? 1 : 'none', color: 'var(--text)' }}>{g.nombre}</span>
                  <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{g.platos.length}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input value={nuevoGrupo} onChange={e => setNuevoGrupo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') agregarGrupo() }}
                placeholder="Nuevo grupo (ej. Guarnición 2)"
                style={{ flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
              <button type="button" onClick={agregarGrupo} disabled={!nuevoGrupo.trim()} aria-label="Agregar grupo"
                style={{ width: 36, minHeight: 36, borderRadius: 10, border: 'none', background: 'var(--navy)', color: '#fff', cursor: 'pointer', opacity: nuevoGrupo.trim() ? 1 : 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
              </button>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={mostrarIdeas} onChange={e => setMostrarIdeas(e.target.checked)} />
            Mostrar ideas en desarrollo <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 99, border: '1.5px dashed var(--text-3)' }} />
          </label>
        </aside>

        {/* ── Tablero ── */}
        <div ref={tableroRef} style={{ flex: '1 1 auto', position: 'relative', minWidth: 0 }}>
          {itemElegido && (
            <div onClick={e => e.stopPropagation()} style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 10%, var(--surface))', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1 }}><b>{itemElegido.item.nombre}</b> está en {itemElegido.platoIds.length} {itemElegido.platoIds.length === 1 ? 'plato' : 'platos'}{itemElegido.item.via === 'ingrediente' ? ' (como ingrediente de sus componentes)' : ''}</span>
              <button type="button" onClick={() => setSel(null)} aria-label="Quitar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', display: 'flex', padding: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
            {grupos.map(g => {
              const color = colorDe.get(g.nombre) ?? 'var(--accent)'
              const esFranja = g.forma === 'franja'
              const esPrincipal = /principal/i.test(g.nombre)
              const tam = esFranja ? 64 : esPrincipal ? 104 : 80
              return (
                <section key={g.nombre} style={{
                  flex: esFranja ? '1 1 100%' : esPrincipal ? '2 1 360px' : '1 1 220px',
                  border: `2px solid ${color}`, borderRadius: esFranja ? 999 : 40, padding: esFranja ? '10px 22px' : '14px 18px 18px',
                  background: `color-mix(in srgb, ${color} 5%, transparent)`, minWidth: 0,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10, textAlign: esFranja ? 'left' : 'center' }}>
                    {g.nombre} <span style={{ fontWeight: 600, opacity: 0.7 }}>· {g.platos.length}</span>
                  </div>
                  {g.platos.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '8px 0' }}>Grupo vacío — mové platos acá desde su ventana.</div>
                  ) : (
                    <div className={esFranja ? 'hide-scrollbar' : undefined} style={{
                      display: 'flex', gap: 10, justifyContent: esFranja ? 'flex-start' : 'center',
                      flexWrap: esFranja ? 'nowrap' : 'wrap', overflowX: esFranja ? 'auto' : 'visible', padding: 4,
                    }}>
                      {g.platos.map(p => (
                        <CirculoPlato key={p.id} punto={p} color={color} tam={tam} estado={estadoDe(p)}
                          badge={sel?.tipo === 'plato' ? badges.get(p.id) : undefined}
                          onTocar={() => (sel?.tipo === 'plato' && sel.id === p.id ? setSel(null) : elegirPlato(p.id))} />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </div>

          {/* Ventanita al lado del plato (pantallas anchas) */}
          {ventana && ventanaFlotante && ventanaPos && (
            <div onClick={e => e.stopPropagation()} style={{
              position: 'absolute', left: ventanaPos.left, top: ventanaPos.top, width: VENTANA.width, maxHeight: VENTANA.height,
              overflowY: 'auto', zIndex: 20, background: 'var(--surface)', borderRadius: 16, boxShadow: 'var(--shadow-3)',
              border: '1px solid var(--border)', padding: 14, boxSizing: 'border-box',
            }}>
              {ventana}
            </div>
          )}
        </div>
      </div>

      {/* En el celular, la misma ventana como hoja de abajo */}
      {ventana && !ventanaFlotante && (
        <Modal open onClose={() => setSel(null)}>
          <div style={{ padding: 16 }}>{ventana}</div>
        </Modal>
      )}
    </div>
  )
}
