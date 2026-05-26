'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { useChecklist } from '@/lib/hooks/useChecklist'
import { useRecetas } from '@/lib/hooks/useRecetas'
import { useTareas } from '@/lib/hooks/useTareas'
import { createClient } from '@/lib/supabase/client'
import { ProductoMiseCard, PLAZA_TO_SECCION } from '@/components/mise/ProductoMiseCard'
import type { PlatoPlaza, CrearTareaParams } from '@/components/mise/ProductoMiseCard'
import { useProduccionRegistros } from '@/lib/hooks/useProduccionRegistros'
import type { Plaza, MisePlaceItem, MisePrioridad, ChecklistSeccionConfig, RutinaFrecuencia } from '@/types'

// ── Constants ──
const PLAZAS: Plaza[] = ['parrilla', 'frios', 'calientes', 'pase', 'pasteleria', 'panaderia']
const PLAZA_LABELS: Record<Plaza, string> = {
  parrilla: 'Parrilla', frios: 'Fríos', calientes: 'Calientes',
  pase: 'Pase', pasteleria: 'Pastelería', panaderia: 'Panadería',
}
const PLAZA_ICONS: Record<Plaza, string> = {
  parrilla: 'local_fire_department', frios: 'ac_unit', calientes: 'soup_kitchen',
  pase: 'room_service', pasteleria: 'cake', panaderia: 'bakery_dining',
}
const UNIDADES = ['u', 'kg', 'g', 'l', 'ml', 'pax', 'porc', 'bandeja', 'gastro', 'tupper']

// SP → P → REF (no CHK) — cycling
const PRIO_CYCLE: MisePrioridad[] = ['sp', 'p', 'ref']
const PRIO_CFG: Record<string, { label: string; color: string; bg: string }> = {
  sp:  { label: 'SP',  color: '#ef4444', bg: 'rgba(239,68,68,.13)' },
  p:   { label: 'P',   color: '#f97316', bg: 'rgba(249,115,22,.13)' },
  ref: { label: 'REF', color: '#3b82f6', bg: 'rgba(59,130,246,.13)' },
  chk: { label: 'OK',  color: '#22c55e', bg: 'rgba(34,197,94,.13)' },
}
const PRIO_SORT: Record<string, number> = { sp: 0, p: 1, ref: 2, chk: 3 }
const FREQ_LABELS: Record<RutinaFrecuencia, string> = {
  diaria: 'Diaria', semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual',
}
const DEFAULT_SECCIONES = [
  { nombre: 'Heladera',       icono: 'kitchen',     orden: 0 },
  { nombre: 'Secos / Tuppers', icono: 'inventory_2', orden: 1 },
  { nombre: 'Congelados',     icono: 'severe_cold',  orden: 2 },
  { nombre: 'Estación',       icono: 'countertops',  orden: 3 },
]

type Tab = 'apertura' | 'cierre' | 'rutina'
function getToday() { return new Date().toISOString().split('T')[0] }
function fmtFecha(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}
function getSeccionColor(nombre: string): string {
  const n = nombre.toLowerCase()
  if (n.includes('heladera')) return '#378ADD'
  if (n.includes('seco') || n.includes('tupper')) return '#EF9F27'
  if (n.includes('congel')) return '#1D9E75'
  if (n.includes('estaci')) return '#7F77DD'
  return '#94a3b8'
}
function daysAgo(isoStr: string | null) {
  if (!isoStr) return null
  const d = Math.floor((Date.now() - new Date(isoStr).getTime()) / 86400000)
  if (d === 0) return 'Hoy'
  if (d === 1) return 'Ayer'
  return `Hace ${d} días`
}
function nextPrio(current: string): MisePrioridad {
  const idx = PRIO_CYCLE.indexOf(current as MisePrioridad)
  return PRIO_CYCLE[(idx + 1) % PRIO_CYCLE.length]
}

const btnReset: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'inherit',
}

// ══════════════════════════════════════════════════════════════
export default function ChecklistPage({ embedded }: { embedded?: boolean } = {}) {
  const router = useRouter()
  const { perfil: authPerfil } = useAuth()
  const {
    secciones, items, registros, rutinas, rutinaRegistros, loading,
    fetchAll, fetchRegistros,
    agregarSeccion, actualizarSeccion, eliminarSeccion, reordenarSecciones,
    agregarItem, actualizarItem, eliminarItem, upsertRegistro,
    agregarRutina, eliminarRutina, toggleRutina,
  } = useChecklist()
  const { recetas } = useRecetas()
  const { tareas, agregarTarea } = useTareas()
  const { rendimientoMap } = useProduccionRegistros()

  // Build receta info map (id → { porciones, pesoPorcion }) for MiseCard display
  const recetaInfoMap = useMemo(() => {
    const m: Record<string, { porciones?: number | null; pesoPorcion?: number | null }> = {}
    for (const r of recetas) {
      const ings = r.ingredientes ?? []
      const porciones = r.porciones ?? null
      let pesoPorcion: number | null = null
      if (porciones && porciones > 0 && ings.length > 0) {
        const UNIDADES_G: Record<string, number> = { g: 1, kg: 1000, ml: 1, lt: 1000, l: 1000 }
        const totalG = ings.reduce((s, i) => {
          const factor = UNIDADES_G[i.unidad] ?? 0
          return s + (parseFloat(String(i.cantidad)) || 0) * factor
        }, 0)
        if (totalG > 0) pesoPorcion = Math.round(totalG / porciones)
      }
      m[r.id] = { porciones, pesoPorcion }
    }
    return m
  }, [recetas])

  // ── plato_plazas map (receta_id → PlatoPlaza[]) ──────────────
  const [platoPlazoMap, setPlatoPlazoMap] = useState<Record<string, PlatoPlaza[]>>({})

  useEffect(() => {
    const supabase = createClient()
    supabase.from('plato_plazas').select('*').then(({ data }) => {
      if (!data) return
      const map: Record<string, PlatoPlaza[]> = {}
      for (const pp of data as PlatoPlaza[]) {
        if (!map[pp.plato_id]) map[pp.plato_id] = []
        map[pp.plato_id].push(pp)
      }
      setPlatoPlazoMap(map)
    })
  }, [])

  const autoPlaza = (PLAZAS as readonly string[]).includes(authPerfil?.rol ?? '') ? (authPerfil!.rol as Plaza) : null
  const [plaza, setPlaza] = useState<Plaza | null>(autoPlaza)
  const [tab, setTab] = useState<Tab>('apertura')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [showAddSheet, setShowAddSheet] = useState<string | null>(null)
  const [showSectionEditor, setShowSectionEditor] = useState(false)
  const [showAddRutina, setShowAddRutina] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const fecha = getToday()
  const turno = tab === 'rutina' ? 'apertura' : tab

  useEffect(() => { if (plaza) fetchAll(fecha, turno) }, [plaza, tab, fecha, fetchAll, turno])

  const plazaSecciones = useMemo(() =>
    secciones.filter(s => s.plaza === plaza).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)), [secciones, plaza])

  const seedingRef = useRef(false)
  useEffect(() => {
    if (!plaza || loading || seedingRef.current) return
    if (!secciones.some(s => s.plaza === plaza)) {
      seedingRef.current = true
      ;(async () => {
        for (const def of DEFAULT_SECCIONES) await agregarSeccion({ ...def, plaza })
        seedingRef.current = false
      })()
    }
  }, [plaza, loading, secciones, agregarSeccion])

  const plazaItems = useMemo(() => items.filter(i => i.plaza === plaza), [items, plaza])

  const grouped = useMemo(() => {
    const map: Record<string, MisePlaceItem[]> = {}
    plazaSecciones.forEach(s => { map[s.id] = [] })
    plazaItems.forEach(i => { const sid = i.seccion_id ?? ''; if (map[sid]) map[sid].push(i) })
    for (const k of Object.keys(map)) map[k].sort((a, b) => (PRIO_SORT[a.prioridad] ?? 3) - (PRIO_SORT[b.prioridad] ?? 3))
    return map
  }, [plazaItems, plazaSecciones])

  const regMap = useMemo(() => {
    const m: Record<string, { completado: boolean; cantidad_actual: number | null }> = {}
    registros.forEach(r => { m[r.checklist_item_id] = { completado: r.completado, cantidad_actual: r.cantidad_actual ?? null } })
    return m
  }, [registros])

  const plazaRutinas = useMemo(() => rutinas.filter(r => r.plaza === plaza), [rutinas, plaza])
  const rutinaRegSet = useMemo(() => {
    const s = new Set<string>()
    rutinaRegistros.forEach(r => { if (r.completado) s.add(r.rutina_id) })
    return s
  }, [rutinaRegistros])

  const total = plazaItems.length
  const done = plazaItems.filter(i => regMap[i.id]?.completado).length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  // Set of item names that already have a pending/in-progress tarea today
  const tareasHoySet = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const s = new Set<string>()
    for (const t of tareas) {
      if (t.turno_fecha === today && t.estado !== 'listo') {
        const nombre = t.titulo.replace(/^Producción: /, '')
        s.add(nombre.toLowerCase())
      }
    }
    return s
  }, [tareas])

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 2500); return () => clearTimeout(t) }
  }, [toast])

  // ── Drag-to-move between sections ───────────────────────────
  const [dragging, setDragging] = useState<{ item: MisePlaceItem; y: number; overSecId: string | null } | null>(null)
  const draggingRef = useRef<typeof dragging>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const secElRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const actualizarItemRef = useRef(actualizarItem)
  useEffect(() => { draggingRef.current = dragging }, [dragging])
  useEffect(() => { actualizarItemRef.current = actualizarItem }, [actualizarItem])

  useEffect(() => {
    if (!dragging) return
    // Mutable current-Y so the RAF loop always reads the latest value
    const currentY = { value: dragging.y }
    let rafId: number

    // Continuous scroll loop — runs every frame while dragging
    const scrollLoop = () => {
      const sc = scrollContainerRef.current
      if (sc) {
        const r = sc.getBoundingClientRect()
        const ZONE = 90  // px from edge that triggers auto-scroll
        const y = currentY.value
        if (y < r.top + ZONE && y > r.top) {
          const intensity = 1 - (y - r.top) / ZONE
          sc.scrollTop -= 3 + intensity * 10
        } else if (y > r.bottom - ZONE && y < r.bottom) {
          const intensity = 1 - (r.bottom - y) / ZONE
          sc.scrollTop += 3 + intensity * 10
        }
      }
      rafId = requestAnimationFrame(scrollLoop)
    }
    rafId = requestAnimationFrame(scrollLoop)

    const onMove = (e: TouchEvent) => {
      e.preventDefault()
      const t = e.touches[0]
      currentY.value = t.clientY
      let overSecId: string | null = null
      secElRefs.current.forEach((el, secId) => {
        const r = el.getBoundingClientRect()
        if (t.clientY >= r.top && t.clientY <= r.bottom) overSecId = secId
      })
      setDragging(prev => prev ? { ...prev, y: t.clientY, overSecId } : null)
    }
    const onEnd = () => {
      cancelAnimationFrame(rafId)
      const d = draggingRef.current
      if (d?.overSecId && d.overSecId !== d.item.seccion_id) {
        actualizarItemRef.current(d.item.id, { seccion_id: d.overSecId })
      }
      setDragging(null)
    }
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    return () => {
      cancelAnimationFrame(rafId)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
  }, [!!dragging]) // eslint-disable-line react-hooks/exhaustive-deps

  const startLongPress = useCallback((item: MisePlaceItem, y: number) => {
    longPressTimer.current = setTimeout(() => {
      navigator.vibrate?.(30)
      setDragging({ item, y, overSecId: item.seccion_id ?? null })
    }, 400)
  }, [])

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }, [])

  const today = new Date().toISOString().split('T')[0]

  const handleCrearTarea = useCallback(async (params: CrearTareaParams) => {
    const titulo = `Producción: ${params.titulo}`
    await agregarTarea({
      titulo,
      descripcion: params.cantidad != null ? `Preparar ${params.cantidad}` : null,
      status: 'pendiente',
      prioridad: params.prioridad === 'sp' ? 'alta' : params.prioridad === 'p' ? 'media' : 'baja',
      categoria: 'produccion',
      plaza: params.plaza,
      receta_id: params.receta_id,
      seccion: params.seccion,
      modo: 'carta',
      turno_fecha: today,
      estado: 'pendiente',
      cantidad: params.cantidad,
      asignado_a: null, creado_por: authPerfil?.miembro_id ?? null,
      fecha_limite: null, tiempo_estimado_min: null, checklist: [],
    })
    // Sub-tasks for each extra plaza
    if (params.plazas.length > 1) {
      for (const pp of params.plazas.slice(1)) {
        await agregarTarea({
          titulo: `[${pp.plaza}] ${params.titulo}`,
          descripcion: pp.instruccion ?? null,
          status: 'pendiente',
          prioridad: 'baja',
          categoria: 'produccion',
          plaza: pp.plaza,
          receta_id: params.receta_id,
          seccion: params.seccion,
          modo: 'carta',
          turno_fecha: today,
          estado: 'pendiente',
          cantidad: null,
          asignado_a: null, creado_por: authPerfil?.miembro_id ?? null,
          fecha_limite: null, tiempo_estimado_min: null, checklist: [],
        })
      }
    }
  }, [agregarTarea, authPerfil, today])

  // ── Plaza selector ──
  if (!plaza) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ background: 'var(--navy)', padding: `${embedded ? 0 : 46}px 16px 20px`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!embedded && (
              <button onClick={() => router.back()} style={btnReset}>
                <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.7)', fontSize: 22 }}>arrow_back</span>
              </button>
            )}
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Checklist de Plaza</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 2 }}>Seleccioná tu plaza</div>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {PLAZAS.map(p => (
              <button key={p} onClick={() => setPlaza(p)} style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 14px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#4361a0' }}>{PLAZA_ICONS[p]}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{PLAZA_LABELS[p]}</span>
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{items.filter(i => i.plaza === p).length} items</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Main checklist view ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: `${embedded ? 0 : 46}px 16px 0`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10 }}>
          <button onClick={() => setPlaza(null)} style={btnReset}>
            <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.7)', fontSize: 22 }}>arrow_back</span>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>{PLAZA_LABELS[plaza]}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 1 }}>{fmtFecha(fecha)}</div>
          </div>
          <button onClick={() => setShowSectionEditor(true)} style={{ ...btnReset, background: 'rgba(255,255,255,.1)', borderRadius: 8, padding: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'rgba(255,255,255,.7)' }}>settings</span>
          </button>
        </div>

        {/* Tabs — pills */}
        <div style={{ paddingBottom: 10 }}>
          <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,.12)', borderRadius: 999, padding: 2, gap: 0 }}>
            {(['apertura', 'cierre', 'rutina'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '5px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.07em',
                fontFamily: 'inherit',
                background: tab === t ? '#fff' : 'transparent',
                color: tab === t ? 'var(--navy)' : 'rgba(255,255,255,.55)',
                transition: 'all .15s',
                WebkitTapHighlightColor: 'transparent',
              }}>
                {t === 'apertura' ? 'Apertura' : t === 'cierre' ? 'Cierre' : 'Rutina'}
              </button>
            ))}
          </div>
        </div>

        {/* Overall progress bar */}
        {tab !== 'rutina' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,.15)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: '#22c55e', borderRadius: 99, transition: 'width .3s' }} />
            </div>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', fontFamily: "'DM Mono', monospace" }}>{done}/{total}</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div ref={scrollContainerRef} style={{ flex: 1, overflow: 'auto', padding: '10px 12px', paddingBottom: 120 }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>Cargando...</div>
        )}

        {/* ── APERTURA / CIERRE ── */}
        {!loading && tab !== 'rutina' && plazaSecciones.map(sec => {
          const secItems = grouped[sec.id] ?? []
          const secDone = secItems.filter(i => regMap[i.id]?.completado).length
          const isCollapsed = collapsed[sec.id] ?? false
          const secColor = getSeccionColor(sec.nombre)
          const secPct = secItems.length > 0 ? secDone / secItems.length : 0

          const isDragTarget = dragging !== null && dragging.overSecId === sec.id && dragging.item.seccion_id !== sec.id
          return (
            <div
              key={sec.id}
              ref={el => { if (el) secElRefs.current.set(sec.id, el as HTMLDivElement); else secElRefs.current.delete(sec.id) }}
              style={{
                background: 'var(--surface)',
                border: isDragTarget ? '2px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: 14, overflow: 'hidden', marginBottom: 8,
                transition: 'border-color .1s',
              }}
            >
              {/* Section header */}
              <button
                onClick={() => setCollapsed(prev => ({ ...prev, [sec.id]: !prev[sec.id] }))}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: secColor, flexShrink: 0 }} />
                <span style={{ flex: 1, textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  {sec.nombre}
                </span>
                <span style={{
                  fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 700,
                  color: secDone === secItems.length && secItems.length > 0 ? '#22c55e' : 'var(--text-3)',
                }}>{secDone}/{secItems.length}</span>
                <span className="material-symbols-outlined" style={{
                  fontSize: 18, color: 'var(--text-3)',
                  transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s',
                }}>expand_more</span>
              </button>

              {/* Progress bar */}
              <div style={{ height: 2, background: 'var(--border)' }}>
                <div style={{ width: `${secPct * 100}%`, height: '100%', background: secColor, transition: 'width .3s' }} />
              </div>

              {!isCollapsed && (
                <div style={{ padding: '6px 10px 10px' }}>
                  {secItems.length === 0 && (
                    <div style={{ padding: '8px 2px', fontSize: 12, color: 'var(--text-3)' }}>
                      Sin items en esta sección
                    </div>
                  )}
                  {secItems.map(item => (
                    <div
                      key={item.id}
                      onTouchStart={e => startLongPress(item, e.touches[0].clientY)}
                      onTouchMove={cancelLongPress}
                      onTouchEnd={cancelLongPress}
                      style={{
                        opacity: dragging?.item.id === item.id ? 0.35 : 1,
                        transition: 'opacity .15s',
                        touchAction: dragging ? 'none' : 'auto',
                      }}
                    >
                      <ProductoMiseCard
                        item={item}
                        reg={regMap[item.id]}
                        fecha={fecha}
                        turno={turno}
                        recetaInfo={item.receta_id ? recetaInfoMap[item.receta_id] : undefined}
                        platoPlazo={item.receta_id ? (platoPlazoMap[item.receta_id] ?? []) : []}
                        hasTareaPendiente={tareasHoySet.has(item.nombre.toLowerCase())}
                        rendimientoPromedio={item.receta_id ? rendimientoMap[item.receta_id] : null}
                        onUpsert={upsertRegistro}
                        onCrearTarea={handleCrearTarea}
                        onPrioChange={async (i, prio) => {
                          await actualizarItem(i.id, { prioridad: prio })
                          if ((prio === 'sp' || prio === 'p') && !tareasHoySet.has(i.nombre.toLowerCase())) {
                            const plazoPlazas = i.receta_id ? (platoPlazoMap[i.receta_id] ?? []) : []
                            const primaryPlaza = plazoPlazas.length > 0 ? plazoPlazas[0].plaza : i.plaza
                            await handleCrearTarea({
                              titulo: i.nombre,
                              seccion: PLAZA_TO_SECCION[primaryPlaza] ?? 'general',
                              prioridad: prio,
                              cantidad: i.cantidad > 0 ? i.cantidad : null,
                              receta_id: i.receta_id ?? null,
                              plaza: primaryPlaza,
                              plazas: plazoPlazas,
                            })
                          }
                        }}
                        onDelete={eliminarItem}
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => setShowAddSheet(sec.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '8px 4px',
                      background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginTop: 4,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>add</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Agregar</span>
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {/* ── RUTINA ── */}
        {!loading && tab === 'rutina' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {plazaRutinas.length === 0 && (
              <div style={{ padding: '40px 12px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
                Sin tareas de rutina configuradas
              </div>
            )}
            {plazaRutinas.map(rut => {
              const done = rutinaRegSet.has(rut.id)
              const lastDone = daysAgo(rut.ultima_vez ?? null)
              return (
                <div key={rut.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px',
                  background: done ? 'rgba(34,197,94,.04)' : 'var(--surface)',
                  border: `1px solid ${done ? 'rgba(34,197,94,.22)' : 'var(--border)'}`,
                  borderRadius: 14, opacity: done ? 0.7 : 1, transition: 'all .2s',
                }}>
                  <button onClick={() => toggleRutina(rut.id, fecha, !done)} style={{ ...btnReset, flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{
                      fontSize: 24, color: done ? '#22c55e' : 'var(--border)', transition: 'color .15s',
                    }}>{done ? 'check_circle' : 'radio_button_unchecked'}</span>
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', textDecoration: done ? 'line-through' : 'none' }}>
                      {rut.nombre}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
                      {FREQ_LABELS[rut.frecuencia as RutinaFrecuencia]}{lastDone ? ` · Últ: ${lastDone}` : ' · Nunca hecha'}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                    background: rut.frecuencia === 'diaria' ? 'rgba(239,68,68,.1)' : rut.frecuencia === 'semanal' ? 'rgba(59,130,246,.1)' : 'rgba(148,163,184,.1)',
                    color: rut.frecuencia === 'diaria' ? '#ef4444' : rut.frecuencia === 'semanal' ? '#3b82f6' : '#94a3b8',
                  }}>{FREQ_LABELS[rut.frecuencia as RutinaFrecuencia].toUpperCase()}</span>
                  <button onClick={() => eliminarRutina(rut.id)} style={{ ...btnReset, flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)', opacity: 0.35 }}>close</span>
                  </button>
                </div>
              )
            })}
            <button onClick={() => setShowAddRutina(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 4px',
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginTop: 4,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>add</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Agregar rutina</span>
            </button>
          </div>
        )}
      </div>

      {/* Drag ghost */}
      {dragging && (
        <div style={{
          position: 'fixed',
          top: dragging.y - 28,
          left: 16, right: 16,
          zIndex: 500,
          pointerEvents: 'none',
          background: 'var(--navy)',
          borderRadius: 12,
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 12px 32px rgba(0,0,0,.4)',
          transform: 'scale(1.03)',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'rgba(255,255,255,.5)' }}>drag_indicator</span>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#fff' }}>{dragging.item.nombre}</span>
          {dragging.overSecId && dragging.overSecId !== dragging.item.seccion_id && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', fontWeight: 600 }}>
              → {plazaSecciones.find(s => s.id === dragging.overSecId)?.nombre}
            </span>
          )}
        </div>
      )}

      {/* Sheets */}
      {showAddSheet && (
        <AddItemSheet
          seccionId={showAddSheet}
          seccionNombre={plazaSecciones.find(s => s.id === showAddSheet)?.nombre ?? ''}
          plaza={plaza}
          recetas={recetas.map(r => ({ ...r, porciones: r.porciones ?? undefined }))}
          onSave={async d => {
            await agregarItem(d)
            if (d.prioridad === 'sp' || d.prioridad === 'p') {
              const plazoPlazas = d.receta_id ? (platoPlazoMap[d.receta_id] ?? []) : []
              const primaryPlaza = plazoPlazas.length > 0 ? plazoPlazas[0].plaza : d.plaza
              await handleCrearTarea({
                titulo: d.nombre,
                seccion: PLAZA_TO_SECCION[primaryPlaza] ?? 'general',
                prioridad: d.prioridad,
                cantidad: d.cantidad > 0 ? d.cantidad : null,
                receta_id: d.receta_id ?? null,
                plaza: primaryPlaza,
                plazas: plazoPlazas,
              })
              setToast(`Agregado a checklist y tareas: ${d.nombre}`)
            } else {
              setToast(`Agregado: ${d.nombre}`)
            }
            setShowAddSheet(null)
          }}
          onClose={() => setShowAddSheet(null)}
        />
      )}
      {showSectionEditor && (
        <SectionEditor
          secciones={plazaSecciones} items={plazaItems} plaza={plaza}
          onAdd={agregarSeccion} onUpdate={actualizarSeccion}
          onDelete={eliminarSeccion} onReorder={reordenarSecciones}
          onClose={() => setShowSectionEditor(false)}
        />
      )}
      {showAddRutina && (
        <AddRutinaSheet plaza={plaza} onSave={async d => { await agregarRutina(d); setShowAddRutina(false) }} onClose={() => setShowAddRutina(false)} />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 90, left: 16, right: 16, zIndex: 300,
          background: '#22c55e', color: '#fff', borderRadius: 12,
          padding: '12px 16px', fontSize: 13, fontWeight: 600, textAlign: 'center',
          boxShadow: '0 8px 24px rgba(34,197,94,.3)',
        }}>{toast}</div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Add Item Sheet — simplified
// ══════════════════════════════════════════════════════════════
function AddItemSheet({ seccionId, seccionNombre, plaza, recetas, onSave, onClose }: {
  seccionId: string; seccionNombre: string; plaza: Plaza
  recetas: { id: string; nombre: string; porciones?: number }[]
  onSave: (d: { plaza: Plaza; seccion_id: string; nombre: string; cantidad: number; unidad: string; prioridad: MisePrioridad; ubicacion?: string; receta_id?: string }) => Promise<void>
  onClose: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [unidad, setUnidad] = useState('u')
  const [prioridad, setPrioridad] = useState<MisePrioridad>('p')
  const [recetaId, setRecetaId] = useState<string | null>(null)
  const [showSug, setShowSug] = useState(false)
  const [saving, setSaving] = useState(false)

  const sugs = useMemo(() => {
    if (!nombre || nombre.length < 2) return []
    const q = nombre.toLowerCase()
    return recetas.filter(r => r.nombre.toLowerCase().includes(q)).slice(0, 5)
  }, [nombre, recetas])

  const selectReceta = (r: typeof recetas[0]) => {
    setNombre(r.nombre); setRecetaId(r.id); setShowSug(false)
    if (r.porciones) setCantidad(String(r.porciones))
    setPrioridad('p')
  }

  const handleSave = async () => {
    if (!nombre.trim()) return
    setSaving(true)
    try {
      await onSave({ plaza, seccion_id: seccionId, nombre: nombre.trim(), cantidad: parseFloat(cantidad) || 0, unidad, prioridad, receta_id: recetaId || undefined })
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border)' }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 16 }}>
            Agregar a {seccionNombre}
          </div>

          {/* Name with recipe suggestions */}
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <label style={lbl}>Nombre</label>
            {recetaId ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, background: 'rgba(67,97,160,.07)', border: '1px solid rgba(67,97,160,.2)', borderRadius: 10, padding: '8px 12px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#4361a0' }}>restaurant_menu</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{nombre}</span>
                <button onClick={() => { setRecetaId(null); setNombre('') }} style={btnReset}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>close</span>
                </button>
              </div>
            ) : (
              <>
                <input
                  value={nombre}
                  onChange={e => { setNombre(e.target.value); setShowSug(true) }}
                  onFocus={() => setShowSug(true)}
                  placeholder="Ej: Salsa criolla, Lechuga..."
                  style={{ ...inp, marginTop: 6 }}
                  autoFocus
                />
                {showSug && sugs.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, marginTop: 2, boxShadow: '0 8px 24px rgba(0,0,0,.12)', maxHeight: 180, overflow: 'auto' }}>
                    {sugs.map(r => (
                      <button key={r.id} onClick={() => selectReceta(r)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#4361a0' }}>restaurant_menu</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{r.nombre}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Priority */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Prioridad</label>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {(['sp', 'p', 'ref', 'chk'] as MisePrioridad[]).map(pr => {
                const cfg = PRIO_CFG[pr]
                return (
                  <button key={pr} onClick={() => setPrioridad(pr)} style={{
                    flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 12, fontWeight: 800,
                    background: prioridad === pr ? cfg.bg : 'var(--bg)',
                    color: prioridad === pr ? cfg.color : 'var(--text-3)',
                    outline: prioridad === pr ? `2px solid ${cfg.color}50` : 'none',
                    transition: 'all .15s',
                  }}>{cfg.label}</button>
                )
              })}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 5 }}>
              {prioridad === 'sp' ? 'Sin Preparar — urgente, irá a tareas' : prioridad === 'p' ? 'Preparar — irá a tareas' : prioridad === 'ref' ? 'Refrigerar/Controlar' : 'Todo bien — sin acción requerida'}
            </div>
          </div>

          {/* Quantity + unit */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Cantidad estándar</label>
              <input type="number" value={cantidad} onChange={e => setCantidad(e.target.value)} placeholder="0" style={{ ...inp, marginTop: 6, fontFamily: "'DM Mono', monospace" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Unidad</label>
              <select value={unidad} onChange={e => setUnidad(e.target.value)} style={{ ...inp, marginTop: 6 }}>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 16px', paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={handleSave}
            disabled={!nombre.trim() || saving}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
              background: nombre.trim() ? 'linear-gradient(135deg, var(--navy), #4361a0)' : 'var(--border)',
              color: nombre.trim() ? '#fff' : 'var(--text-3)',
              fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
              cursor: nombre.trim() ? 'pointer' : 'default',
              opacity: saving ? 0.6 : 1, transition: 'all .15s',
            }}
          >
            {saving ? 'Guardando...' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Add Rutina Sheet
// ══════════════════════════════════════════════════════════════
function AddRutinaSheet({ plaza, onSave, onClose }: {
  plaza: Plaza
  onSave: (d: { nombre: string; plaza: Plaza; frecuencia: RutinaFrecuencia }) => Promise<void>
  onClose: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [frecuencia, setFrecuencia] = useState<RutinaFrecuencia>('semanal')
  const [saving, setSaving] = useState(false)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border)' }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 14 }}>Agregar tarea de rutina</div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Nombre</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Limpieza de campana..." style={{ ...inp, marginTop: 6 }} autoFocus />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Frecuencia</label>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {(['diaria', 'semanal', 'quincenal', 'mensual'] as RutinaFrecuencia[]).map(f => (
                <button key={f} onClick={() => setFrecuencia(f)} style={{
                  flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 10, fontWeight: 700,
                  background: frecuencia === f ? 'var(--navy)' : 'var(--bg)',
                  color: frecuencia === f ? '#fff' : 'var(--text-3)', transition: 'all .15s',
                }}>{FREQ_LABELS[f]}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: '12px 16px', paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={async () => { if (!nombre.trim()) return; setSaving(true); try { await onSave({ nombre: nombre.trim(), plaza, frecuencia }) } finally { setSaving(false) } }}
            disabled={!nombre.trim() || saving}
            style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: nombre.trim() ? 'linear-gradient(135deg, var(--navy), #4361a0)' : 'var(--border)', color: nombre.trim() ? '#fff' : 'var(--text-3)', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: nombre.trim() ? 'pointer' : 'default', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Guardando...' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Section Editor
// ══════════════════════════════════════════════════════════════
const ICON_OPTIONS = ['kitchen', 'inventory_2', 'severe_cold', 'countertops', 'local_bar', 'cake', 'thermostat', 'shelves', 'water_drop', 'local_fire_department', 'blender', 'grocery']

function SectionEditor({ secciones, items, plaza, onAdd, onUpdate, onDelete, onReorder, onClose }: {
  secciones: ChecklistSeccionConfig[]; items: MisePlaceItem[]; plaza: Plaza
  onAdd: (d: { nombre: string; icono: string; orden: number; plaza: Plaza }) => Promise<string>
  onUpdate: (id: string, d: Partial<{ nombre: string; icono: string; orden: number }>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReorder: (u: { id: string; orden: number }[]) => Promise<void>
  onClose: () => void
}) {
  const [editList, setEditList] = useState(secciones.map(s => ({ ...s })))
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('inventory_2')
  const [saving, setSaving] = useState(false)

  const moveUp = (idx: number) => { if (idx === 0) return; const l = [...editList]; [l[idx-1], l[idx]] = [l[idx], l[idx-1]]; setEditList(l) }
  const moveDown = (idx: number) => { if (idx >= editList.length-1) return; const l = [...editList]; [l[idx], l[idx+1]] = [l[idx+1], l[idx]]; setEditList(l) }

  const handleSave = async () => {
    setSaving(true)
    try {
      const currentIds = new Set(editList.map(s => s.id))
      for (const o of secciones) { if (!currentIds.has(o.id)) await onDelete(o.id) }
      for (const s of editList.filter(s => s.id.startsWith('new_'))) {
        const idx = editList.indexOf(s)
        s.id = await onAdd({ nombre: s.nombre, icono: s.icono, orden: idx, plaza })
      }
      const updates: { id: string; orden: number }[] = []
      for (let i = 0; i < editList.length; i++) {
        const s = editList[i]
        if (s.id.startsWith('new_')) continue
        const o = secciones.find(x => x.id === s.id)
        if (o && (o.nombre !== s.nombre || o.icono !== s.icono)) await onUpdate(s.id, { nombre: s.nombre, icono: s.icono })
        updates.push({ id: s.id, orden: i })
      }
      if (updates.length) await onReorder(updates)
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border)' }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 14 }}>Editar secciones</div>
          {editList.map((sec, idx) => {
            const hasItems = items.some(i => i.seccion_id === sec.id)
            return (
              <div key={sec.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <select value={sec.icono} onChange={e => { const l = [...editList]; l[idx] = { ...l[idx], icono: e.target.value }; setEditList(l) }} style={{ ...inp, width: 44, padding: '6px 2px', fontSize: 11 }}>
                  {ICON_OPTIONS.map(ic => <option key={ic} value={ic}>{ic.slice(0, 8)}</option>)}
                </select>
                <input value={sec.nombre} onChange={e => { const l = [...editList]; l[idx] = { ...l[idx], nombre: e.target.value }; setEditList(l) }} style={{ ...inp, flex: 1, padding: '6px 8px', fontSize: 13 }} />
                <button onClick={() => moveUp(idx)} disabled={idx === 0} style={{ ...btnReset, opacity: idx === 0 ? 0.2 : 1 }}><span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>arrow_upward</span></button>
                <button onClick={() => moveDown(idx)} disabled={idx >= editList.length-1} style={{ ...btnReset, opacity: idx >= editList.length-1 ? 0.2 : 1 }}><span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>arrow_downward</span></button>
                <button onClick={() => { if (!hasItems) setEditList(editList.filter((_, i) => i !== idx)) }} disabled={hasItems} style={{ ...btnReset, opacity: hasItems ? 0.15 : 1 }}><span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>delete</span></button>
              </div>
            )
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0' }}>
            <select value={newIcon} onChange={e => setNewIcon(e.target.value)} style={{ ...inp, width: 44, padding: '6px 2px', fontSize: 11 }}>
              {ICON_OPTIONS.map(ic => <option key={ic} value={ic}>{ic.slice(0, 8)}</option>)}
            </select>
            <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) { setEditList([...editList, { id: `new_${Date.now()}`, nombre: newName.trim(), icono: newIcon, orden: editList.length, plaza, restaurante_id: '', created_at: '' }]); setNewName('') } }} placeholder="Nueva sección..." style={{ ...inp, flex: 1, padding: '6px 8px', fontSize: 13 }} />
            <button onClick={() => { if (!newName.trim()) return; setEditList([...editList, { id: `new_${Date.now()}`, nombre: newName.trim(), icono: newIcon, orden: editList.length, plaza, restaurante_id: '', created_at: '' }]); setNewName('') }} disabled={!newName.trim()} style={{ ...btnReset, background: '#4361a0', borderRadius: 8, padding: 6, opacity: newName.trim() ? 1 : 0.3 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>add</span>
            </button>
          </div>
        </div>
        <div style={{ padding: '12px 16px', paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))', borderTop: '1px solid var(--border)' }}>
          <button onClick={handleSave} disabled={saving} style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, var(--navy), #4361a0)', color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Style constants ──
const inp: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', width: '100%', boxSizing: 'border-box' }
const lbl: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em' }

// suppress unused import warnings — these are used implicitly via string refs
void nextPrio
