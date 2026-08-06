'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTareas } from '@/lib/hooks/useTareas'
import { useEquipo } from '@/lib/hooks/useEquipo'
import { usePlazasCustom } from '@/lib/hooks/usePlazasCustom'
import { useTurnosServicio } from '@/lib/hooks/useTurnosServicio'
import { useCierresTurno } from '@/lib/hooks/useCierresTurno'
import { nextEstado } from '@/components/ops/ItemOps'
import { todasLasPlazas, plazaLabel, plazaIcon, plazaColor } from '@/lib/constants'
import { hoyOperativo, sumarDias, turnoActivo } from '@/lib/ops/turnos'
import type { Tarea, OpsEstado, Plaza } from '@/types'

// ══════════════════════════════════════════════════════════════
// EL MURO — MURO-PLAN.md F3. Tablet colgada en la cocina, para toda la
// cocina (no una por plaza — eso ya lo resuelve el modo foco de
// ProduccionBoard). El jefe mira y también toca.
//
// Muestra Producción (tareas), NO el Mise: los estados pendiente/en_curso/
// listo/duda que se tocan acá son de `tareas` (OpsEstado). El Mise tiene su
// propio modelo (completado: boolean) sin "en curso" ni "duda", así que
// mezclar los dos en la misma columna habría roto la interacción de tocar
// un ítem para ciclar su estado.
//
// Reglas de layout (ver plan, no negociables):
// - Nunca scrollea en la vista general. Si no entra, se reduce lo que se
//   muestra (los listos colapsan a un contador), no se agrega scroll.
// - Columnas = plazas del restaurante, TODAS, en el orden de siempre.
// - Tipografía para leer a dos metros.
// ══════════════════════════════════════════════════════════════

const SIN_PLAZA = '__sin_plaza__'
const PRIO_ORDEN: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 }
const AMBAR = '#f59e0b'
const AZUL = '#3b82f6'
const VERDE = '#22c55e'

function minutosDesde(iso: string | null | undefined, ahoraMs: number): number | null {
  if (!iso) return null
  return Math.max(0, Math.round((ahoraMs - new Date(iso).getTime()) / 60000))
}
function fmtHace(mins: number): string {
  if (mins < 1) return 'recién'
  if (mins < 60) return `${mins}′`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h${m > 0 ? m + 'm' : ''}`
}
function primerNombre(nombreCompleto: string): string {
  return nombreCompleto.trim().split(/\s+/)[0] || nombreCompleto
}

interface ColumnaMuro {
  key: string
  label: string
  icono: string
  color: string
  pendientes: Tarea[]
  listasCount: number
  total: number
}

// ── Wake lock — tipado propio: la API es reciente y no siempre está en el
// lib DOM del proyecto. Degrada en silencio donde no exista (tablet vieja,
// Safari, permiso denegado, etc.) — no hay nada que avisar, la pantalla
// simplemente se apaga sola como cualquier tablet.
interface WakeLockSentinelLike { release: () => Promise<void> }
function pedirWakeLock(): Promise<WakeLockSentinelLike | null> {
  const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } }
  if (!nav.wakeLock) return Promise.resolve(null)
  return nav.wakeLock.request('screen').catch(() => null)
}

export default function MuroPage() {
  const { tareas, loading, cambiarEstado, refetch } = useTareas()
  const { miembros } = useEquipo()
  const { plazasCustom } = usePlazasCustom()
  const { turnosActivos } = useTurnosServicio()
  const { entregaDe, mutate: refetchCierres } = useCierresTurno()

  // ── Tick — recalcula "hace cuánto" y fuerza el rollover de jornada. Una
  // pantalla que nadie toca no se re-renderiza sola: sin este timer, a las
  // 05:00 el muro seguía mostrando la jornada de ayer indefinidamente.
  const [ahoraMs, setAhoraMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAhoraMs(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  const ahora = useMemo(() => new Date(ahoraMs), [ahoraMs])
  const today = useMemo(() => hoyOperativo(ahora), [ahora])
  const turnoHoy = useMemo(() => turnoActivo(ahora, turnosActivos), [ahora, turnosActivos])

  // ── Wake lock + refetch al volver de suspensión. El navegador suelta el
  // wake lock solo cuando la pestaña deja de estar visible (no hay forma de
  // evitarlo), así que hay que volver a pedirlo — y aprovechar el mismo
  // evento para refrescar: si la tablet se suspendió, el canal de realtime
  // se cayó con ella.
  useEffect(() => {
    let sentinel: WakeLockSentinelLike | null = null
    pedirWakeLock().then(s => { sentinel = s })
    function onVisible() {
      if (document.visibilityState !== 'visible') return
      pedirWakeLock().then(s => { sentinel = s })
      refetch()
      refetchCierres()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      sentinel?.release().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nombrePorId = useMemo(() => {
    const m = new Map<string, string>()
    for (const persona of miembros) m.set(persona.id, primerNombre(persona.nombre))
    return m
  }, [miembros])

  // ── Producción del día — Carta solamente (agrupada por plaza). Menú/Evento
  // se agrupan por paso, no por plaza, y mezclarlos en las mismas columnas
  // rompería tanto el layout como "tocar para ciclar estado" (que necesita
  // un solo tipo de ítem por columna). Mismo carryover de un día que
  // Producción: hoy + lo de ayer que no se completó.
  const ayer = useMemo(() => sumarDias(today, -1), [today])
  const topLevel = useMemo(() => {
    const esCarta = (t: Tarea) => (t.modo ?? 'carta') === 'carta'
    const hoyC = tareas.filter(t => esCarta(t) && !t.parent_id && t.turno_fecha === today)
    const clavesHoy = new Set(hoyC.map(t => t.titulo.trim().toLowerCase()))
    const ayerC = tareas.filter(t =>
      esCarta(t) && !t.parent_id && t.turno_fecha === ayer && t.estado !== 'listo' &&
      !clavesHoy.has(t.titulo.trim().toLowerCase())
    )
    return [...hoyC, ...ayerC]
  }, [tareas, today, ayer])

  const columnas = useMemo<ColumnaMuro[]>(() => {
    const porPlaza = new Map<string, Tarea[]>()
    for (const t of topLevel) {
      const key = (t.plaza ?? '').trim() || SIN_PLAZA
      const arr = porPlaza.get(key)
      if (arr) arr.push(t)
      else porPlaza.set(key, [t])
    }
    const orden = todasLasPlazas(plazasCustom).map(String)
    const keys = [
      ...orden,
      ...[...porPlaza.keys()].filter(k => k !== SIN_PLAZA && !orden.includes(k)),
    ]
    if (porPlaza.has(SIN_PLAZA)) keys.push(SIN_PLAZA)

    return keys.map(key => {
      const items = porPlaza.get(key) ?? []
      const pendientes = items
        .filter(i => i.estado !== 'listo')
        .sort((a, b) => (PRIO_ORDEN[a.prioridad ?? 'baja'] ?? 3) - (PRIO_ORDEN[b.prioridad ?? 'baja'] ?? 3))
      const esSinPlaza = key === SIN_PLAZA
      return {
        key,
        label: esSinPlaza ? 'Sin plaza' : plazaLabel(key as Plaza, plazasCustom),
        icono: esSinPlaza ? 'help_outline' : plazaIcon(key as Plaza, plazasCustom),
        color: esSinPlaza ? '#94a3b8' : plazaColor(key as Plaza, plazasCustom),
        pendientes,
        listasCount: items.length - pendientes.length,
        total: items.length,
      }
    })
  }, [topLevel, plazasCustom])

  // Con muchas plazas, las vacías se encogen a una tira angosta — dan lugar
  // a las que sí tienen trabajo pendiente sin desaparecer del todo.
  const encogerVacias = columnas.length > 5

  // ── Franja de alertas — dudas de toda la plaza, más recientes primero ──
  const dudas = useMemo(() =>
    topLevel
      .filter(t => t.estado === 'duda')
      .sort((a, b) => (b.estado_at ?? '').localeCompare(a.estado_at ?? '')),
    [topLevel]
  )

  // ── Foco — una plaza a pantalla completa, con sus listos incluidos ──
  const [foco, setFoco] = useState<string | null>(null)
  const columnaFoco = foco ? columnas.find(c => c.key === foco) ?? null : null
  useEffect(() => { if (foco && !columnaFoco) setFoco(null) }, [foco, columnaFoco])
  const itemsFoco = useMemo(() => {
    if (!columnaFoco) return []
    const key = columnaFoco.key
    const esSinPlaza = key === SIN_PLAZA
    return topLevel
      .filter(t => ((t.plaza ?? '').trim() || SIN_PLAZA) === key || (esSinPlaza && !t.plaza))
      .sort((a, b) => {
        if (a.estado === 'listo' && b.estado !== 'listo') return 1
        if (a.estado !== 'listo' && b.estado === 'listo') return -1
        return (PRIO_ORDEN[a.prioridad ?? 'baja'] ?? 3) - (PRIO_ORDEN[b.prioridad ?? 'baja'] ?? 3)
      })
  }, [columnaFoco, topLevel])

  const handleTap = useCallback((item: Tarea) => {
    cambiarEstado(item.id, nextEstado((item.estado as OpsEstado) ?? 'pendiente'))
  }, [cambiarEstado])
  const handleHold = useCallback((item: Tarea) => {
    if (item.estado === 'duda') return
    cambiarEstado(item.id, 'duda')
  }, [cambiarEstado])

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.4)', fontSize: 15 }}>
        Cargando el muro…
      </div>
    )
  }

  if (columnaFoco) {
    return (
      <FocoPlaza
        columna={columnaFoco}
        items={itemsFoco}
        nombrePorId={nombrePorId}
        ahoraMs={ahoraMs}
        onVolver={() => setFoco(null)}
        onTap={handleTap}
        onHold={handleHold}
      />
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '14px 16px 10px' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexShrink: 0, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-.01em' }}>Muro</span>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,.45)', textTransform: 'capitalize' }}>
            {ahora.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' })}
          </span>
          {turnoHoy && (
            <span style={{
              fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
              background: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.75)',
            }}>
              {turnoHoy.nombre}
            </span>
          )}
        </div>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,.85)', fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
          {ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* ── Franja de alertas — solo si hay dudas ── */}
      {dudas.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, overflowX: 'auto', flexShrink: 0, marginBottom: 10,
          paddingBottom: 2,
        }}>
          {dudas.slice(0, 4).map(d => {
            const plazaKey = (d.plaza ?? '').trim() || SIN_PLAZA
            const label = plazaKey === SIN_PLAZA ? 'Sin plaza' : plazaLabel(plazaKey as Plaza, plazasCustom)
            const quien = d.estado_por ? nombrePorId.get(d.estado_por) : null
            const mins = minutosDesde(d.estado_at, ahoraMs)
            return (
              <div key={d.id} style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderRadius: 10,
                background: 'rgba(245,158,11,.14)', border: `1px solid ${AMBAR}55`,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: AMBAR }}>warning</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{label}</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,.7)' }}>{d.titulo}</span>
                {(quien || mins !== null) && (
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
                    {quien ?? ''}{quien && mins !== null ? ' · ' : ''}{mins !== null ? fmtHace(mins) : ''}
                  </span>
                )}
              </div>
            )
          })}
          {dudas.length > 4 && (
            <div style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', padding: '8px 14px',
              borderRadius: 10, background: 'rgba(245,158,11,.1)', color: AMBAR,
              fontSize: 13, fontWeight: 700,
            }}>
              +{dudas.length - 4} más
            </div>
          )}
        </div>
      )}

      {/* ── Columnas por plaza ── */}
      <div style={{ flex: 1, display: 'flex', gap: 10, minHeight: 0 }}>
        {columnas.map(col => (
          <ColumnaMuroView
            key={col.key}
            columna={col}
            angosta={encogerVacias && col.pendientes.length === 0}
            nombrePorId={nombrePorId}
            ahoraMs={ahoraMs}
            onFoco={() => setFoco(col.key)}
            onTap={handleTap}
            onHold={handleHold}
          />
        ))}
        {columnas.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.35)', fontSize: 15 }}>
            No hay producción cargada para hoy.
          </div>
        )}
      </div>

      {/* ── Franja de entregas ── */}
      {turnoHoy && (
        <div style={{
          flexShrink: 0, marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap',
          padding: '8px 4px 2px', borderTop: '1px solid rgba(255,255,255,.08)',
        }}>
          {columnas.filter(c => c.key !== SIN_PLAZA).map(c => {
            const entrega = entregaDe(today, turnoHoy.id, c.key)
            const nombre = entrega?.cerrado_por ? nombrePorId.get(entrega.cerrado_por) : null
            return (
              <span key={c.key} style={{ fontSize: 12, color: 'rgba(255,255,255,.45)' }}>
                <span style={{ fontWeight: 700, color: entrega ? VERDE : 'rgba(255,255,255,.35)' }}>{c.label}</span>
                {' '}
                {entrega
                  ? `${new Date(entrega.cerrado_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}${nombre ? ` ${nombre}` : ''}`
                  : '—'}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Una columna (plaza) ──────────────────────────────────────────────────
function ColumnaMuroView({
  columna, angosta, nombrePorId, ahoraMs, onFoco, onTap, onHold,
}: {
  columna: ColumnaMuro
  angosta: boolean
  nombrePorId: Map<string, string>
  ahoraMs: number
  onFoco: () => void
  onTap: (item: Tarea) => void
  onHold: (item: Tarea) => void
}) {
  if (angosta) {
    return (
      <button
        onClick={onFoco}
        style={{
          flex: '0 0 60px', display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 6, borderRadius: 12, border: '1px solid rgba(255,255,255,.08)',
          background: 'rgba(255,255,255,.03)', cursor: 'pointer', padding: '10px 4px',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: columna.color }}>{columna.icono}</span>
        <span style={{
          fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.5)',
          writingMode: 'vertical-rl', textOrientation: 'mixed', letterSpacing: '.04em',
        }}>
          {columna.label}
        </span>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: VERDE }}>check_circle</span>
      </button>
    )
  }

  return (
    <div style={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
      borderRadius: 14, border: '1px solid rgba(255,255,255,.08)',
      background: 'rgba(255,255,255,.03)', overflow: 'hidden',
    }}>
      <button
        onClick={onFoco}
        style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
          borderBottom: '1px solid rgba(255,255,255,.06)',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 22, color: columna.color, flexShrink: 0 }}>{columna.icono}</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '.03em', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {columna.label}
        </span>
        <span style={{
          fontSize: 13, fontFamily: "'DM Mono', monospace", fontWeight: 700, flexShrink: 0,
          color: columna.total > 0 && columna.listasCount === columna.total ? VERDE : 'rgba(255,255,255,.5)',
        }}>
          {columna.listasCount}/{columna.total}
        </span>
      </button>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {columna.pendientes.map(item => (
          <FilaMuro key={item.id} item={item} nombrePorId={nombrePorId} ahoraMs={ahoraMs} onTap={onTap} onHold={onHold} />
        ))}
        {columna.pendientes.length === 0 && columna.total === 0 && (
          <div style={{ padding: '10px 6px', fontSize: 13, color: 'rgba(255,255,255,.3)' }}>Sin preparaciones</div>
        )}
        {columna.listasCount > 0 && (
          <button
            onClick={onFoco}
            style={{
              marginTop: columna.pendientes.length > 0 ? 4 : 0, display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 6px', borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer',
              color: VERDE, fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
            +{columna.listasCount} {columna.listasCount === 1 ? 'lista' : 'listas'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Una fila — tilde + nombre + (si en_curso/duda) quién y hace cuánto ──
function FilaMuro({
  item, nombrePorId, ahoraMs, onTap, onHold,
}: {
  item: Tarea
  nombrePorId: Map<string, string>
  ahoraMs: number
  onTap: (item: Tarea) => void
  onHold: (item: Tarea) => void
}) {
  const estado: OpsEstado = (item.estado as OpsEstado) ?? 'pendiente'
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdFired = useRef(false)

  function startHold() {
    holdFired.current = false
    holdTimer.current = setTimeout(() => { holdFired.current = true; onHold(item) }, 600)
  }
  function clearHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current)
  }
  function handleClick() {
    if (holdFired.current) { holdFired.current = false; return }
    onTap(item)
  }

  const quien = (estado === 'en_curso' || estado === 'duda') && item.estado_por
    ? nombrePorId.get(item.estado_por)
    : null
  const mins = (estado === 'en_curso' || estado === 'duda') ? minutosDesde(item.estado_at, ahoraMs) : null

  // La fila condensada nunca incluye 'listo' (se filtra antes de llegar acá),
  // pero el foco de plaza sí lo incluye a propósito — necesita su propio
  // círculo lleno con tilde, si no un ítem terminado se ve igual que uno sin
  // empezar y "con sus listos incluidos" no serviría de nada.
  const color = estado === 'duda' ? AMBAR : estado === 'en_curso' ? AZUL : estado === 'listo' ? VERDE : 'rgba(255,255,255,.3)'
  const icono = estado === 'duda' ? 'help' : estado === 'en_curso' ? 'more_horiz' : estado === 'listo' ? 'check' : null

  return (
    <button
      onClick={handleClick}
      onMouseDown={startHold} onMouseUp={clearHold} onMouseLeave={clearHold}
      onTouchStart={startHold} onTouchEnd={(e) => { clearHold(); if (holdFired.current) e.preventDefault() }}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '9px 8px', borderRadius: 8, border: 'none', textAlign: 'left',
        background: estado === 'duda' ? 'rgba(245,158,11,.1)' : estado === 'en_curso' ? 'rgba(59,130,246,.08)' : 'none',
        cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
        opacity: estado === 'listo' ? .6 : 1,
      }}
    >
      <span style={{
        flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
        background: icono ? color : 'transparent', border: `2px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icono && <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#fff' }}>{icono}</span>}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 600, color: '#fff',
          textDecoration: estado === 'listo' ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.titulo}
        </div>
        {(quien || mins !== null) && (
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.45)', marginTop: 1 }}>
            {quien ?? ''}{quien && mins !== null ? ' · ' : ''}{mins !== null ? fmtHace(mins) : ''}
          </div>
        )}
      </span>
    </button>
  )
}

// ── Foco — una plaza a pantalla completa, con sus listos incluidos ──
function FocoPlaza({
  columna, items, nombrePorId, ahoraMs, onVolver, onTap, onHold,
}: {
  columna: ColumnaMuro
  items: Tarea[]
  nombrePorId: Map<string, string>
  ahoraMs: number
  onVolver: () => void
  onTap: (item: Tarea) => void
  onHold: (item: Tarea) => void
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '14px 16px' }}>
      <button
        onClick={onVolver}
        style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
          padding: '8px 14px', borderRadius: 10, marginBottom: 12,
          background: 'rgba(255,255,255,.08)', border: 'none', color: 'rgba(255,255,255,.75)',
          fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
        Todo el turno
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginBottom: 10 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 30, color: columna.color }}>{columna.icono}</span>
        <span style={{ fontSize: 24, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '.02em' }}>
          {columna.label}
        </span>
        <span style={{ fontSize: 16, fontFamily: "'DM Mono', monospace", color: 'rgba(255,255,255,.5)', fontWeight: 700 }}>
          {columna.listasCount}/{columna.total}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(item => (
          <FilaMuro key={item.id} item={item} nombrePorId={nombrePorId} ahoraMs={ahoraMs} onTap={onTap} onHold={onHold} />
        ))}
        {items.length === 0 && (
          <div style={{ padding: '10px 6px', fontSize: 14, color: 'rgba(255,255,255,.3)' }}>Sin preparaciones</div>
        )}
      </div>
    </div>
  )
}
