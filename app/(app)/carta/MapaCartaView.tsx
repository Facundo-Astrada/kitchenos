'use client'

// Mapa de la carta (PLAN-DESARROLLO-PLATOS-2026-10, Fase 3). Los platos de la
// carta como círculos del color de su grupo, sin recuadros, para aprovechar el
// espacio; Principales primero y bebidas/cafetería plegadas al final (el chef
// viene a ver los platos). Tocar un plato abre al lado una ventanita con sus
// componentes (los del mise), con quién los comparte y una nota de seguimiento;
// "Abrir ficha" muestra la ficha completa centrada, encima del mapa.
// Registro Preparación. Todo CSS, sin librerías de gráficos. Hover/foco de los
// círculos y el desvanecido de las filas con scroll viven en globals.css
// (.mapa-plato, .mapa-fila-scroll).
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

const VENTANA = { width: 340, height: 500 }

/**
 * Colores de grupo: los 6 de la paleta fija (Avatar) y, del 7.º en adelante,
 * los mismos oscurecidos hacia el navy — así una carta con 10 grupos no repite
 * color (Bros tenía Principales y Pastas en el mismo verde). Sin hex nuevos.
 */
function colorDeIndice(i: number): string {
  const base = AVATAR_PALETTE[i % AVATAR_PALETTE.length]
  return i < AVATAR_PALETTE.length ? base : `color-mix(in srgb, ${base} 58%, var(--navy))`
}

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
type EstadoCirculo = 'normal' | 'elegido' | 'relacionado' | 'apagado'

const tituloSeccion: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }

const chip: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 600, padding: '5px 12px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
  minHeight: 32, whiteSpace: 'nowrap', flexShrink: 0,
}

function plazaLegible(p: string | null): string {
  if (!p) return ''
  return p.charAt(0).toUpperCase() + p.slice(1)
}

// ── Círculo de un plato ──────────────────────────────────────────────────

function CirculoPlato({ punto, color, tam, estado, badge, onTocar }: {
  punto: Punto; color: string; tam: number; estado: EstadoCirculo; badge?: number; onTocar: () => void
}) {
  const resaltado = estado === 'elegido' || estado === 'relacionado'
  return (
    <button
      type="button"
      className="mapa-plato"
      onClick={e => { e.stopPropagation(); onTocar() }}
      title={punto.disponible ? punto.nombre : `${punto.nombre} (sin stock)`}
      aria-pressed={estado === 'elegido'}
      data-plato-id={punto.id}
      style={{
        ['--plato-color' as string]: color,
        position: 'relative', width: tam, height: tam, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
        background: punto.idea ? 'var(--surface)' : `color-mix(in srgb, ${color} ${resaltado ? 32 : 16}%, var(--surface))`,
        border: estado === 'elegido' ? '3px solid var(--navy)'
          : punto.idea ? `2px dashed ${color}` : `2px solid color-mix(in srgb, ${color} ${resaltado ? 100 : 50}%, transparent)`,
        boxShadow: estado === 'elegido' ? 'var(--shadow-3)' : resaltado ? 'var(--shadow-2)' : 'none',
        opacity: estado === 'apagado' ? 0.32 : 1, padding: 8, fontFamily: 'inherit', color: 'var(--text)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <span style={{
        fontSize: tam >= 90 ? 12.5 : 11.5, fontWeight: 700, lineHeight: 1.15, textAlign: 'center', textWrap: 'balance',
        display: '-webkit-box', WebkitLineClamp: tam >= 90 ? 4 : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        textDecoration: punto.disponible ? 'none' : 'line-through', overflowWrap: 'anywhere',
      }}>
        {punto.nombre}
      </span>
      {badge != null && badge > 0 && (
        <span aria-label={`${badge} componentes en común`} style={{
          position: 'absolute', top: -3, right: -3, minWidth: 22, height: 22, borderRadius: 99, padding: '0 6px',
          background: 'var(--navy)', color: '#fff', fontSize: 11.5, fontWeight: 800, boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px var(--bg)',
        }}>{badge}</span>
      )}
    </button>
  )
}

// ── Ventanita del plato ──────────────────────────────────────────────────
// Orden por lo que se mira primero: qué lleva (componentes del mise) → con
// quién lo comparte → la nota. La acción principal (abrir la ficha) va arriba,
// a la vista; etiquetas y grupo, que se tocan poco, al pie.

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
    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Cabecera + acción principal */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ width: 12, height: 12, borderRadius: 99, background: color, marginTop: 6, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', lineHeight: 1.25, textWrap: 'balance' }}>{punto.nombre}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 3 }}>
            {punto.idea ? 'Idea en desarrollo' : punto.categoria}
            {punto.precio != null && punto.precio > 0 && <> · {fmtMoney(punto.precio)}</>}
            {verCostos && fc != null && <> · FC {Math.round(fc)}%</>}
            {!punto.disponible && <> · sin stock</>}
          </div>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
        </button>
      </div>
      <button type="button" onClick={onAbrirFicha} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, borderRadius: 10, border: 'none',
        background: 'var(--navy)', color: '#fff', fontWeight: 700, fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{punto.idea ? 'edit_note' : 'open_in_full'}</span>
        {punto.idea ? 'Ver en En desarrollo' : 'Abrir ficha'}
      </button>

      <div>
        <div style={tituloSeccion}>Componentes del mise</div>
        {punto.componentes.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Todavía no tiene componentes cargados.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {punto.componentes.map(c => {
              const compartido = compartidosSet.has(c.clave)
              return (
                <button key={c.clave} type="button" onClick={() => onElegirComponente(c.clave)}
                  title={compartido ? 'También lo usan otros platos — tocá para verlos' : 'Solo lo usa este plato'}
                  style={{ ...chip, fontSize: 12, padding: '4px 10px', minHeight: 30, whiteSpace: 'normal', textAlign: 'left',
                    border: compartido ? '1px solid transparent' : '1px solid var(--border)',
                    background: compartido ? 'var(--navy)' : 'var(--surface)', color: compartido ? '#fff' : 'var(--text)' }}>
                  {c.nombre}{c.plaza && <span style={{ opacity: 0.7, fontWeight: 500 }}> · {plazaLegible(c.plaza)}</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <div style={tituloSeccion}>
          Comparte componentes con{compartidos.length > 0 && <span style={{ fontWeight: 500 }}> · {compartidos.length} {compartidos.length === 1 ? 'plato' : 'platos'}</span>}
        </div>
        {compartidos.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
            {punto.componentes.length === 0 ? 'Sin componentes no se puede saber.' : 'Ningún otro plato usa sus componentes.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {compartidos.slice(0, 8).map(c => {
              const otro = puntosPorId.get(c.platoId)
              if (!otro) return null
              return (
                <button key={c.platoId} type="button" onClick={() => onElegirPlato(c.platoId)} style={{
                  display: 'grid', gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr)', gap: 10, alignItems: 'baseline',
                  textAlign: 'left', padding: '6px 0', background: 'none', border: 'none', borderTop: '1px solid var(--border)',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                }}>
                  <span style={{ fontWeight: 700, color: 'var(--navy-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{otro.nombre}</span>
                  <span style={{ color: 'var(--text-2)', lineHeight: 1.35 }}>{c.componentes.map(k => k.nombre).join(', ')}</span>
                </button>
              )
            })}
            {compartidos.length > 8 && <div style={{ fontSize: 12, color: 'var(--text-2)', paddingTop: 4 }}>y {compartidos.length - 8} más</div>}
          </div>
        )}
      </div>

      {!punto.idea && (
        <>
          <div>
            <label htmlFor={`nota-${punto.id}`} style={{ ...tituloSeccion, display: 'block' }}>Nota de seguimiento</label>
            <textarea id={`nota-${punto.id}`} value={nota} rows={3} placeholder="Cómo sale, qué probar, qué cambiar…"
              onChange={e => setNota(e.target.value)}
              onBlur={() => { if (nota !== inicial) onGuardarNota(nota) }}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13.5, lineHeight: 1.45, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {ETIQUETAS.map(t => {
                const on = punto.tags.includes(t.key)
                return (
                  <button key={t.key} type="button" aria-pressed={on}
                    onClick={() => onCambiarTags(on ? punto.tags.filter(x => x !== t.key) : [...punto.tags, t.key])}
                    style={{ ...chip, fontSize: 11.5, padding: '3px 9px', minHeight: 28, border: on ? '1px solid transparent' : '1px solid var(--border)',
                      background: on ? 'var(--green-bg)' : 'transparent', color: on ? 'var(--green-fg)' : 'var(--text-2)' }}>
                    {on && '✓ '}{t.label}
                  </button>
                )
              })}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600 }}>
              Grupo
              <select value={punto.categoria} onChange={e => onCambiarGrupo(e.target.value)}
                style={{ flex: 1, minWidth: 0, minHeight: 36, padding: '0 8px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit' }}>
                {!categorias.some(c => c.nombre === punto.categoria) && <option value={punto.categoria}>{punto.categoria}</option>}
                {categorias.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
              </select>
            </label>
          </div>
        </>
      )}
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

  // Con filtros activos se OCULTA lo que no cumple (antes se apagaba y el tablero
  // quedaba lleno de fantasmas: "6 de 50"). Los grupos que quedan sin platos se van.
  const filtrando = filtros.length > 0
  const visiblesLista = useMemo(() => (filtrando ? puntos.filter(p => cumpleFiltros(p.tags, filtros)) : puntos), [puntos, filtros, filtrando])
  const gruposTodos = useMemo(() => armarGrupos(categorias, puntos), [categorias, puntos])
  const grupos = useMemo(() => armarGrupos(categorias, visiblesLista), [categorias, visiblesLista])
  const conPlatos = grupos.filter(g => g.platos.length > 0)
  const principales = conPlatos.filter(g => g.plano === 'platos')
  const secundarios = conPlatos.filter(g => g.plano === 'secundario')
  const nSecundarios = secundarios.reduce((a, g) => a + g.platos.length, 0)
  // Grupos sin ningún plato (recién creados o en desuso): una línea chica, no un hueco grande.
  const vacios = gruposTodos.filter(g => g.platos.length === 0)

  // Color fijo por grupo: sale de su lugar en carta_categorias, no del orden en pantalla.
  const colorDe = useMemo(() => {
    const m = new Map<string, string>()
    const ordenadas = [...categorias].sort((a, b) => a.orden - b.orden)
    ordenadas.forEach((c, i) => m.set(c.nombre, colorDeIndice(i)))
    let extra = ordenadas.length
    for (const g of gruposTodos) if (!m.has(g.nombre)) m.set(g.nombre, colorDeIndice(extra++))
    return m
  }, [categorias, gruposTodos])

  const top = useMemo(() => masCompartidos(indice).slice(0, 16), [indice])

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

  // Escape cierra la ventanita (la ficha centrada maneja su propio Escape).
  useEffect(() => {
    if (!sel) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSel(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel])

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

  const escala = anchoTablero < 520 ? 0.8 : 1

  function renderGrupo(g: (typeof grupos)[number], tamBase: number) {
    const color = colorDe.get(g.nombre) ?? 'var(--accent)'
    const tam = Math.round((/principal/i.test(g.nombre) ? tamBase + 14 : tamBase) * escala)
    return (
      <section key={g.nombre} aria-label={g.nombre} style={{ flex: '0 1 auto', minWidth: 0, maxWidth: '100%' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px', fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 99, background: color }} />
          {g.nombre}
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{g.platos.length}</span>
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {g.platos.map(p => (
            <CirculoPlato key={p.id} punto={p} color={color} tam={tam} estado={estadoDe(p)}
              badge={sel?.tipo === 'plato' ? badges.get(p.id) : undefined}
              onTocar={() => (sel?.tipo === 'plato' && sel.id === p.id ? setSel(null) : elegirPlato(p.id))} />
          ))}
        </div>
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

  const etiquetaFila: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--text-2)', flexShrink: 0, marginRight: 4 }

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

      <div style={{ padding: '14px 20px 100px', maxWidth: 1400, margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* ── Barra: filtros y componentes compartidos ── */}
        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={etiquetaFila}>Filtrar</span>
            {ETIQUETAS.map(t => {
              const on = filtros.includes(t.key)
              return (
                <button key={t.key} type="button" aria-pressed={on} onClick={() => setFiltros(f => on ? f.filter(x => x !== t.key) : [...f, t.key])}
                  style={{ ...chip, border: on ? '1px solid transparent' : '1px solid var(--border)', background: on ? 'var(--navy)' : 'var(--surface)', color: on ? '#fff' : 'var(--text)' }}>
                  {t.label}
                </button>
              )
            })}
            {filtrando && (
              <span style={{ fontSize: 13, color: 'var(--text-2)', marginLeft: 6 }}>
                <b style={{ color: 'var(--text)' }}>{visiblesLista.length}</b> de {puntos.length} platos ·{' '}
                <button type="button" onClick={() => setFiltros([])} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--navy-ink)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, textDecoration: 'underline' }}>quitar filtros</button>
              </span>
            )}
            <span style={{ flex: 1 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer', flexShrink: 0, minHeight: 32 }}>
              <input type="checkbox" checked={mostrarIdeas} onChange={e => setMostrarIdeas(e.target.checked)} />
              Ideas en desarrollo
            </label>
          </div>

          {top.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={etiquetaFila}>Compartidos</span>
              <div className="hide-scrollbar mapa-fila-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', minWidth: 0, paddingRight: 40 }}>
                {top.map(e => {
                  const on = sel?.tipo === 'componente' && sel.clave === e.componente.clave
                  return (
                    <button key={e.componente.clave} type="button" aria-pressed={on} onClick={() => setSel(on ? null : { tipo: 'componente', clave: e.componente.clave })}
                      title={`${e.componente.nombre}: ${e.platoIds.length} platos`}
                      style={{ ...chip, border: on ? '1px solid transparent' : '1px solid var(--border)', background: on ? 'var(--navy)' : 'var(--surface)', color: on ? '#fff' : 'var(--text)' }}>
                      {e.componente.nombre} <span style={{ opacity: 0.6, fontWeight: 500 }}>{e.platoIds.length}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {componenteElegido && (
            <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--blue-bg)', fontSize: 13.5, color: 'var(--blue-fg)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1 }}>
                <b>{componenteElegido.componente.nombre}</b>
                {componenteElegido.componente.plaza && <> ({plazaLegible(componenteElegido.componente.plaza)})</>}
                {' '}se usa en {componenteElegido.platoIds.length} {componenteElegido.platoIds.length === 1 ? 'plato' : 'platos'} — resaltados abajo
              </span>
              <button type="button" onClick={() => setSel(null)} aria-label="Quitar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', padding: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>
          )}
        </div>

        {/* ── Tablero ── */}
        <div ref={tableroRef} style={{ position: 'relative', minWidth: 0 }}>
          {conPlatos.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>
              {filtrando ? 'Ningún plato cumple todos esos filtros.' : 'Todavía no hay platos en la carta.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '28px 44px', alignItems: 'flex-start' }}>
              {principales.map(g => renderGrupo(g, 84))}
            </div>
          )}

          {/* Grupos vacíos + crear uno nuevo (ej. Guarnición 2) */}
          {!filtrando && (
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 24 }}>
              {vacios.map(g => (
                <span key={g.nombre} title="Grupo sin platos — mové platos acá desde su ventana" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-2)', padding: '5px 12px', borderRadius: 99, border: '1px dashed var(--border)', minHeight: 32, boxSizing: 'border-box' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: colorDe.get(g.nombre) }} />
                  {g.nombre} · vacío
                </span>
              ))}
              {creandoGrupo ? (
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input autoFocus value={nuevoGrupo} onChange={e => setNuevoGrupo(e.target.value)} aria-label="Nombre del grupo nuevo"
                    onKeyDown={e => { if (e.key === 'Enter') agregarGrupo(); if (e.key === 'Escape') { setCreandoGrupo(false); setNuevoGrupo('') } }}
                    placeholder="Ej. Guarnición 2"
                    style={{ width: 170, minHeight: 32, padding: '0 10px', borderRadius: 99, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                  <button type="button" onClick={agregarGrupo} disabled={!nuevoGrupo.trim()} style={{ ...chip, border: '1px solid transparent', background: 'var(--navy)', color: '#fff', opacity: nuevoGrupo.trim() ? 1 : 0.4 }}>Crear</button>
                  <button type="button" onClick={() => { setCreandoGrupo(false); setNuevoGrupo('') }} style={{ ...chip, border: 'none', background: 'none', color: 'var(--text-2)' }}>Cancelar</button>
                </span>
              ) : (
                <button type="button" onClick={() => setCreandoGrupo(true)} style={{ ...chip, display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--navy-ink)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 17 }}>add</span>
                  Nuevo grupo
                </button>
              )}
            </div>
          )}

          {/* Bebidas y cafetería: segundo plano, plegadas */}
          {secundarios.length > 0 && (
            <details onClick={e => e.stopPropagation()} open={filtrando || undefined} style={{ marginTop: 28, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--text-2)', minHeight: 32, display: 'list-item' }}>
                {secundarios.map(g => g.nombre).join(' y ')} <span style={{ fontWeight: 500 }}>· {nSecundarios}</span>
              </summary>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '22px 40px', marginTop: 14 }}>
                {secundarios.map(g => renderGrupo(g, 68))}
              </div>
            </details>
          )}

          {/* Ventanita al lado del plato (pantallas anchas) */}
          {ventana && ventanaFlotante && ventanaPos && (
            <div role="dialog" aria-label={elegido?.nombre} onClick={e => e.stopPropagation()} style={{
              position: 'absolute', left: ventanaPos.left, top: ventanaPos.top, width: VENTANA.width, maxHeight: VENTANA.height,
              overflowY: 'auto', zIndex: 20, background: 'var(--surface)', borderRadius: 16, boxShadow: 'var(--shadow-3)',
              padding: 16, boxSizing: 'border-box', overscrollBehavior: 'contain',
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
