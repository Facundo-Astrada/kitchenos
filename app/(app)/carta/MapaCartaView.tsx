'use client'

// Mapa de la carta (PLAN-DESARROLLO-PLATOS-2026-10, Fase 3). Los platos de la
// carta como círculos del color de su grupo, sin recuadros, para aprovechar el
// espacio; Principales primero y bebidas/cafetería plegadas al final (el chef
// viene a ver los platos). Tocar un plato abre al lado una ventanita con sus
// componentes (los del mise), con quién los comparte y una nota de seguimiento;
// "Abrir ficha" muestra la ficha completa centrada, encima del mapa.
// Registro Preparación. Todo CSS, sin librerías de gráficos.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AVATAR_PALETTE, Modal } from '@/components/ui'
import type { CartaCategoria, CartaItemEnriquecido, CartaItemDB } from '@/lib/hooks/useCarta'
import { usePlatosDesarrollo } from '@/lib/hooks/usePlatosDesarrollo'
import {
  armarGrupos, compartidosCon, componentesDeFicha, componentesDePlato, cumpleFiltros, indiceCompartidos,
  masCompartidos, posicionVentana, type Compartido, type Componente,
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

const VENTANA = { width: 330, height: 440 }

/** Un círculo del mapa: plato de la carta o idea en desarrollo. */
interface Punto {
  id: string
  nombre: string
  categoria: string
  tags: string[]
  componentes: Componente[]
  precio: number | null
  disponible: boolean
  idea: boolean
  item?: CartaItemEnriquecido
}

type Seleccion = { tipo: 'plato'; id: string } | { tipo: 'componente'; clave: string } | null
type EstadoCirculo = 'normal' | 'elegido' | 'relacionado' | 'apagado' | 'filtrado'

const etiquetaSeccion: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6,
}

const chip: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
  minHeight: 30, whiteSpace: 'nowrap', flexShrink: 0,
}

function plazaLegible(p: string | null): string {
  if (!p) return ''
  return p.charAt(0).toUpperCase() + p.slice(1)
}

// ── Círculo de un plato ──────────────────────────────────────────────────

function CirculoPlato({ punto, color, tam, estado, badge, onTocar }: {
  punto: Punto; color: string; tam: number; estado: EstadoCirculo; badge?: number; onTocar: () => void
}) {
  const opacidad = estado === 'filtrado' ? 0.15 : estado === 'apagado' ? 0.32 : 1
  const resaltado = estado === 'elegido' || estado === 'relacionado'
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onTocar() }}
      title={punto.nombre}
      data-plato-id={punto.id}
      style={{
        position: 'relative', width: tam, height: tam, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
        background: punto.idea ? 'var(--surface)' : `color-mix(in srgb, ${color} ${resaltado ? 30 : 16}%, var(--surface))`,
        border: estado === 'elegido' ? '3px solid var(--navy)'
          : punto.idea ? `2px dashed ${color}` : `2px solid color-mix(in srgb, ${color} ${resaltado ? 100 : 55}%, transparent)`,
        boxShadow: estado === 'elegido' ? 'var(--shadow-3)' : resaltado ? 'var(--shadow-2)' : 'none',
        opacity: opacidad, padding: 7, fontFamily: 'inherit', color: 'var(--text)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'opacity 200ms, background 200ms, box-shadow 200ms',
      }}
    >
      <span style={{
        fontSize: tam >= 90 ? 12 : 11, fontWeight: 700, lineHeight: 1.15, textAlign: 'center',
        display: '-webkit-box', WebkitLineClamp: tam >= 90 ? 4 : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        textDecoration: punto.disponible ? 'none' : 'line-through',
      }}>
        {punto.nombre}
      </span>
      {badge != null && badge > 0 && (
        <span style={{
          position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, borderRadius: 99, padding: '0 5px',
          background: 'var(--navy)', color: '#fff', fontSize: 11, fontWeight: 800, boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{badge}</span>
      )}
    </button>
  )
}

// ── Ventanita del plato ──────────────────────────────────────────────────

function VentanaPlato({
  punto, color, compartidos, puntosPorId, categorias, verCostos, onCerrar, onElegirPlato, onElegirComponente,
  onAbrirFicha, onGuardarNota, onCambiarGrupo, onCambiarTags,
}: {
  punto: Punto
  color: string
  compartidos: Compartido[]
  puntosPorId: Map<string, Punto>
  categorias: CartaCategoria[]
  verCostos: boolean
  onCerrar: () => void
  onElegirPlato: (id: string) => void
  onElegirComponente: (clave: string) => void
  onAbrirFicha: () => void
  onGuardarNota: (nota: string) => void
  onCambiarGrupo: (categoria: string) => void
  onCambiarTags: (tags: string[]) => void
}) {
  const inicial = punto.item?.nota_chef ?? ''
  const [nota, setNota] = useState(inicial)
  const notaRef = useRef(nota)
  useEffect(() => { notaRef.current = nota }, [nota])
  // Guarda al cerrar/cambiar de plato si quedó algo sin guardar (el blur no corre si se desmonta).
  useEffect(() => () => {
    if (punto.item && notaRef.current !== inicial) onGuardarNota(notaRef.current)
  }, [punto.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const compartidosSet = useMemo(() => {
    const s = new Set<string>()
    for (const c of compartidos) for (const k of c.componentes) s.add(k.clave)
    return s
  }, [compartidos])
  const fc = punto.item?.food_cost_pct

  return (
    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ width: 12, height: 12, borderRadius: 99, background: color, marginTop: 5, flexShrink: 0 }} />
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
                onClick={() => onCambiarTags(on ? punto.tags.filter(x => x !== t.key) : [...punto.tags, t.key])}
                style={{ ...chip, fontSize: 11, padding: '3px 8px', minHeight: 26, border: on ? 'none' : '1px dashed var(--border)',
                  background: on ? 'var(--green-bg)' : 'transparent', color: on ? 'var(--green-fg)' : 'var(--text-3)' }}>
                {t.label}
              </button>
            )
          })}
        </div>
      )}

      <div>
        <div style={etiquetaSeccion}>Componentes · lo que se prepara en el mise</div>
        {punto.componentes.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Sin componentes cargados.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {punto.componentes.map(c => {
              const compartido = compartidosSet.has(c.clave)
              return (
                <button key={c.clave} type="button" onClick={() => onElegirComponente(c.clave)}
                  title={compartido ? 'También lo usan otros platos — tocá para verlos' : 'Solo lo usa este plato'}
                  style={{ ...chip, fontSize: 11.5, padding: '4px 9px', minHeight: 28, whiteSpace: 'normal', textAlign: 'left',
                    border: compartido ? 'none' : '1px solid var(--border)',
                    background: compartido ? 'var(--navy)' : 'var(--surface)', color: compartido ? '#fff' : 'var(--text-2)' }}>
                  {c.nombre}{c.plaza && <span style={{ opacity: 0.65, fontWeight: 500 }}> · {plazaLegible(c.plaza)}</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <div style={etiquetaSeccion}>Comparte componentes con</div>
        {compartidos.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            {punto.componentes.length === 0 ? 'No se puede saber sin componentes.' : 'Ningún otro plato usa sus componentes.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 140, overflowY: 'auto' }}>
            {compartidos.map(c => {
              const otro = puntosPorId.get(c.platoId)
              if (!otro) return null
              return (
                <button key={c.platoId} type="button" onClick={() => onElegirPlato(c.platoId)} style={{
                  display: 'flex', gap: 8, alignItems: 'baseline', textAlign: 'left', padding: '5px 0', background: 'none',
                  border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5,
                }}>
                  <span style={{ fontWeight: 700, color: 'var(--navy-ink)', flex: '0 0 auto', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{otro.nombre}</span>
                  <span style={{ color: 'var(--text-2)', lineHeight: 1.35 }}>{c.componentes.map(k => k.nombre).join(', ')}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {!punto.idea && (
        <div>
          <div style={etiquetaSeccion}>Nota de seguimiento</div>
          <textarea value={nota} rows={3} placeholder="Para vos: cómo sale, qué probar, qué cambiar…"
            onChange={e => setNota(e.target.value)}
            onBlur={() => { if (nota !== inicial) onGuardarNota(nota) }}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, lineHeight: 1.4, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {!punto.idea && (
          <select value={punto.categoria} onChange={e => onCambiarGrupo(e.target.value)} aria-label="Grupo"
            style={{ flex: 1, minWidth: 0, minHeight: 40, padding: '0 8px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit' }}>
            {!categorias.some(c => c.nombre === punto.categoria) && <option value={punto.categoria}>{punto.categoria}</option>}
            {categorias.map(c => <option key={c.id} value={c.nombre}>Grupo: {c.nombre}</option>)}
          </select>
        )}
        <button type="button" onClick={onAbrirFicha} style={{ flex: punto.idea ? 1 : '0 0 auto', minHeight: 40, padding: '0 14px', borderRadius: 10, border: 'none', background: 'var(--navy)', color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {punto.idea ? 'Ver en En desarrollo' : 'Abrir ficha'}
        </button>
      </div>
    </div>
  )
}

// ── Pantalla ─────────────────────────────────────────────────────────────

export default function MapaCartaView({
  items, categorias, nombreReceta, verCostos, onBack, onOpenPlato, onOpenDesarrollo,
  actualizarItem, actualizarTags, crearCategoria, onToast,
}: {
  items: CartaItemEnriquecido[]
  categorias: CartaCategoria[]
  nombreReceta: (id: string) => string | undefined
  verCostos: boolean
  onBack: () => void
  /** Abre la ficha completa del plato (centrada, encima del mapa). */
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
  const [nuevoGrupo, setNuevoGrupo] = useState('')
  const [creandoGrupo, setCreandoGrupo] = useState(false)
  const [ventanaPos, setVentanaPos] = useState<{ left: number; top: number } | null>(null)
  const [anchoTablero, setAnchoTablero] = useState(1000)
  const tableroRef = useRef<HTMLDivElement>(null)

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

  const puntos = useMemo(() => {
    const ps: Punto[] = []
    for (const base of items) {
      const i = overrides[base.id] ? { ...base, ...overrides[base.id] } : base
      ps.push({
        id: i.id, nombre: i.nombre, categoria: i.categoria, tags: i.tags ?? [], precio: i.precio_venta,
        disponible: i.disponible, idea: false, item: i, componentes: componentesDePlato(i, nombreReceta),
      })
    }
    if (mostrarIdeas) {
      for (const p of ideas ?? []) {
        if (p.estado !== 'idea' && p.estado !== 'prueba') continue
        ps.push({
          id: `idea:${p.id}`, nombre: p.nombre, categoria: p.categoria ?? 'Ideas', tags: [], precio: null, disponible: true,
          idea: true, componentes: componentesDeFicha(p.ficha.componentes, nombreReceta),
        })
      }
    }
    return ps
  }, [items, ideas, mostrarIdeas, nombreReceta, overrides])

  const puntosPorId = useMemo(() => new Map(puntos.map(p => [p.id, p])), [puntos])
  const indice = useMemo(() => indiceCompartidos(puntos), [puntos])
  const grupos = useMemo(() => armarGrupos(categorias, puntos), [categorias, puntos])
  const principales = grupos.filter(g => g.plano === 'platos')
  const secundarios = grupos.filter(g => g.plano === 'secundario')
  const nSecundarios = secundarios.reduce((a, g) => a + g.platos.length, 0)

  // Color fijo por grupo: sale de su lugar en carta_categorias, no del orden en pantalla.
  const colorDe = useMemo(() => {
    const m = new Map<string, string>()
    const ordenadas = [...categorias].sort((a, b) => a.orden - b.orden)
    ordenadas.forEach((c, i) => m.set(c.nombre, AVATAR_PALETTE[i % AVATAR_PALETTE.length]))
    let extra = ordenadas.length
    for (const g of grupos) if (!m.has(g.nombre)) m.set(g.nombre, AVATAR_PALETTE[extra++ % AVATAR_PALETTE.length])
    return m
  }, [categorias, grupos])

  const top = useMemo(() => masCompartidos(indice).slice(0, 14), [indice])

  const { relacionados, badges } = useMemo(() => {
    const rel = new Set<string>()
    const bad = new Map<string, number>()
    if (sel?.tipo === 'plato') {
      for (const c of compartidosCon(sel.id, indice)) { rel.add(c.platoId); bad.set(c.platoId, c.componentes.length) }
    } else if (sel?.tipo === 'componente') {
      for (const id of indice.porComponente.get(sel.clave)?.platoIds ?? []) rel.add(id)
    }
    return { relacionados: rel, badges: bad }
  }, [sel, indice])

  const visibles = useMemo(() => puntos.filter(p => cumpleFiltros(p.tags, filtros)).length, [puntos, filtros])
  const elegido = sel?.tipo === 'plato' ? puntosPorId.get(sel.id) ?? null : null
  const componenteElegido = sel?.tipo === 'componente' ? indice.porComponente.get(sel.clave) ?? null : null
  const compartidosElegido = useMemo(() => elegido ? compartidosCon(elegido.id, indice) : [], [elegido, indice])

  useEffect(() => {
    const el = tableroRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setAnchoTablero(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const ventanaFlotante = anchoTablero >= 640

  const ubicarVentana = useCallback((id: string) => {
    const tablero = tableroRef.current
    const circulo = tablero?.querySelector<HTMLElement>(`[data-plato-id="${CSS.escape(id)}"]`)
    if (!tablero || !circulo) { setVentanaPos(null); return }
    const t = tablero.getBoundingClientRect()
    const c = circulo.getBoundingClientRect()
    setVentanaPos(posicionVentana(
      { left: c.left - t.left, top: c.top - t.top, width: c.width, height: c.height },
      { width: t.width, height: Math.max(t.height, VENTANA.height + 20) }, VENTANA,
    ))
  }, [])

  function elegirPlato(id: string) {
    setSel({ tipo: 'plato', id })
    requestAnimationFrame(() => ubicarVentana(id))
  }

  function estadoDe(p: Punto): EstadoCirculo {
    if (!cumpleFiltros(p.tags, filtros)) return 'filtrado'
    if (!sel) return 'normal'
    if (sel.tipo === 'plato' && sel.id === p.id) return 'elegido'
    return relacionados.has(p.id) ? 'relacionado' : 'apagado'
  }

  async function agregarGrupo() {
    const n = nuevoGrupo.trim()
    if (!n) return
    if (categorias.some(c => c.nombre.toLowerCase() === n.toLowerCase())) { onToast('Ese grupo ya existe'); return }
    try { await crearCategoria(n); setNuevoGrupo(''); setCreandoGrupo(false); onToast(`Grupo "${n}" creado — mové platos desde su ventana`) }
    catch { onToast('No se pudo crear el grupo') }
  }

  function renderGrupo(g: (typeof grupos)[number], tamBase: number) {
    const color = colorDe.get(g.nombre) ?? 'var(--accent)'
    // En el celular, círculos más chicos: entran 4 por fila en vez de 3.
    const escala = anchoTablero < 520 ? 0.8 : 1
    const tam = Math.round((/principal/i.test(g.nombre) ? tamBase + 14 : tamBase) * escala)
    return (
      <section key={g.nombre} style={{ flex: '0 1 auto', minWidth: 0, maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 99, background: color }} />
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{g.nombre}</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{g.platos.length}</span>
        </div>
        {g.platos.length === 0 ? (
          <div style={{ width: tam * 2, height: tam, borderRadius: 99, border: `2px dashed color-mix(in srgb, ${color} 45%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: 10, boxSizing: 'border-box' }}>
            Vacío — mové platos desde su ventana
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {g.platos.map(p => (
              <CirculoPlato key={p.id} punto={p} color={color} tam={tam} estado={estadoDe(p)}
                badge={sel?.tipo === 'plato' ? badges.get(p.id) : undefined}
                onTocar={() => (sel?.tipo === 'plato' && sel.id === p.id ? setSel(null) : elegirPlato(p.id))} />
            ))}
          </div>
        )}
      </section>
    )
  }

  const ventana = elegido && (
    <VentanaPlato
      key={elegido.id}
      punto={elegido}
      color={colorDe.get(elegido.categoria) ?? 'var(--accent)'}
      compartidos={compartidosElegido}
      puntosPorId={puntosPorId}
      categorias={categorias}
      verCostos={verCostos}
      onCerrar={() => setSel(null)}
      onElegirPlato={elegirPlato}
      onElegirComponente={clave => setSel({ tipo: 'componente', clave })}
      onAbrirFicha={() => (elegido.idea ? onOpenDesarrollo() : onOpenPlato(elegido.id))}
      onGuardarNota={nota => { const v = nota.trim() || null; aplicar(elegido.id, { nota_chef: v }, () => actualizarItem(elegido.id, { nota_chef: v }), 'No se pudo guardar la nota') }}
      onCambiarGrupo={categoria => { aplicar(elegido.id, { categoria }, () => actualizarItem(elegido.id, { categoria }), 'No se pudo mover el plato'); requestAnimationFrame(() => requestAnimationFrame(() => ubicarVentana(elegido.id))) }}
      onCambiarTags={tags => { aplicar(elegido.id, { tags }, () => actualizarTags(elegido.id, tags), 'No se pudieron guardar las etiquetas') }}
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
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Tus platos por grupo y los componentes que comparten</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 16px 100px', maxWidth: 1400, margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ── Barra: filtros, componentes compartidos, grupos ── */}
        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="hide-scrollbar" style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto' }}>
            <span style={{ ...etiquetaSeccion, marginBottom: 0, flexShrink: 0, marginRight: 4 }}>Filtrar</span>
            {ETIQUETAS.map(t => {
              const on = filtros.includes(t.key)
              return (
                <button key={t.key} type="button" onClick={() => setFiltros(f => on ? f.filter(x => x !== t.key) : [...f, t.key])}
                  style={{ ...chip, border: on ? 'none' : '1px solid var(--border)', background: on ? 'var(--navy)' : 'var(--surface)', color: on ? '#fff' : 'var(--text-2)' }}>
                  {t.label}
                </button>
              )
            })}
            {filtros.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0, marginLeft: 4 }}>
                {visibles} de {puntos.length} · <button type="button" onClick={() => setFiltros([])} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--navy-ink)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>limpiar</button>
              </span>
            )}
            <span style={{ flex: 1 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-2)', cursor: 'pointer', flexShrink: 0 }}>
              <input type="checkbox" checked={mostrarIdeas} onChange={e => setMostrarIdeas(e.target.checked)} />
              Ideas en desarrollo
            </label>
          </div>

          {top.length > 0 && (
            <div className="hide-scrollbar" style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto' }}>
              <span style={{ ...etiquetaSeccion, marginBottom: 0, flexShrink: 0, marginRight: 4 }}>Componentes compartidos</span>
              {top.map(e => {
                const on = sel?.tipo === 'componente' && sel.clave === e.componente.clave
                return (
                  <button key={e.componente.clave} type="button" onClick={() => setSel(on ? null : { tipo: 'componente', clave: e.componente.clave })}
                    style={{ ...chip, border: on ? 'none' : '1px solid var(--border)', background: on ? 'var(--navy)' : 'var(--surface)', color: on ? '#fff' : 'var(--text-2)' }}>
                    {e.componente.nombre} · {e.platoIds.length}
                  </button>
                )
              })}
            </div>
          )}

          {componenteElegido && (
            <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--blue-bg)', fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1 }}>
                <b>{componenteElegido.componente.nombre}</b>
                {componenteElegido.componente.plaza && <> ({plazaLegible(componenteElegido.componente.plaza)})</>}
                {' '}se usa en {componenteElegido.platoIds.length} {componenteElegido.platoIds.length === 1 ? 'plato' : 'platos'}
              </span>
              <button type="button" onClick={() => setSel(null)} aria-label="Quitar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', display: 'flex', padding: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>
          )}
        </div>

        {/* ── Tablero ── */}
        <div ref={tableroRef} style={{ position: 'relative', minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '22px 36px', alignItems: 'flex-start' }}>
            {principales.map(g => renderGrupo(g, 84))}

            {/* Grupo nuevo (ej. Guarnición 2) */}
            <section onClick={e => e.stopPropagation()} style={{ flex: '0 0 auto' }}>
              <div style={{ height: 18, marginBottom: 8 }} />
              {creandoGrupo ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input autoFocus value={nuevoGrupo} onChange={e => setNuevoGrupo(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') agregarGrupo(); if (e.key === 'Escape') setCreandoGrupo(false) }}
                    placeholder="Nombre (ej. Guarnición 2)"
                    style={{ width: 190, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                  <button type="button" onClick={agregarGrupo} disabled={!nuevoGrupo.trim()} style={{ minHeight: 36, padding: '0 12px', borderRadius: 10, border: 'none', background: 'var(--navy)', color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', opacity: nuevoGrupo.trim() ? 1 : 0.4 }}>Crear</button>
                </div>
              ) : (
                <button type="button" onClick={() => setCreandoGrupo(true)} style={{
                  width: 84, height: 84, borderRadius: '50%', border: '2px dashed var(--border)', background: 'transparent', cursor: 'pointer',
                  color: 'var(--text-3)', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22 }}>add</span>
                  Grupo
                </button>
              )}
            </section>
          </div>

          {/* Bebidas y cafetería: segundo plano, plegadas */}
          {secundarios.length > 0 && (
            <details onClick={e => e.stopPropagation()} style={{ marginTop: 28, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)', listStyle: 'revert' }}>
                {secundarios.map(g => g.nombre).join(' y ')} · {nSecundarios}
              </summary>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px 32px', marginTop: 12 }}>
                {secundarios.map(g => renderGrupo(g, 64))}
              </div>
            </details>
          )}

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
