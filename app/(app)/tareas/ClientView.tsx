'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth/context'
import { useTareas } from '@/lib/hooks/useTareas'
import { useRecetas } from '@/lib/hooks/useRecetas'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { createClient } from '@/lib/supabase/client'
import { syncMiseDesdeTarea } from '@/lib/ops/syncMise'
import { OpsToggle } from '@/components/ops/OpsToggle'
import { SeccionOps } from '@/components/ops/SeccionOps'
import { EventoBanner } from '@/components/ops/EventoBanner'
import type { Tarea, OpsModo, OpsEstado, TareaPrioridad } from '@/types'

const PRIO_SORT: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 }

type ColumnaDef = { id: string; label: string; sublabel?: string; color: string }

function getToday() { return new Date().toISOString().split('T')[0] }
function fmtFecha(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

// ── Prioridades (orden de display) ───────────────────────────
const PRIORIDADES = [
  { id: 'critica',  label: 'SP',  sublabel: 'Super Prioridad', color: '#ef4444' },
  { id: 'alta',     label: 'P',   sublabel: 'Prioridad',       color: '#f97316' },
  { id: 'media',    label: 'REF', sublabel: 'Refuerzo',        color: '#3b82f6' },
  { id: 'baja',     label: 'Check',sublabel: 'Check',           color: '#64748b' },
] as const

// Secciones usadas solo para EventoBanner y handleGenerarLista
const SECCIONES_CARTA = [
  { id: 'caliente', label: 'Cocina Caliente', color: '#ef4444' },
  { id: 'fria',     label: 'Cocina Fría',     color: '#0ea5e9' },
  { id: 'pasteleria', label: 'Pastelería',    color: '#ec4899' },
  { id: 'salon',    label: 'Salón',           color: '#8b5cf6' },
  { id: 'general',  label: 'General',         color: '#64748b' },
] as const
const SECCIONES_MENU = [
  { id: 'apetizer', label: 'Apetizer', color: '#0ea5e9' },
  { id: 'entrada',  label: 'Entrada',  color: '#8b5cf6' },
  { id: 'proteina', label: 'Proteína', color: '#ef4444' },
  { id: 'pasta',    label: 'Pasta',    color: '#f97316' },
  { id: 'veggie',   label: 'Veggie',   color: '#22c55e' },
  { id: 'postre',   label: 'Postre',   color: '#ec4899' },
] as const

// ── Main Page ─────────────────────────────────────────────────
export default function TareasPage({ embedded }: { embedded?: boolean } = {}) {
  const { perfil } = useAuth()
  const restauranteId = useRestauranteId()
  const { tareas, loading, agregarTarea, cambiarEstado, eliminarTarea } = useTareas()
  const { recetas } = useRecetas()
  const recetasSimple = useMemo(() => recetas.map(r => ({ id: r.id, nombre: r.nombre })), [recetas])

  const today = getToday()

  // Modo — persiste en localStorage
  const [modo, setModo] = useState<OpsModo>(() => {
    if (typeof window === 'undefined') return 'carta'
    return (localStorage.getItem('ops_modo') as OpsModo) ?? 'carta'
  })

  function handleModoChange(m: OpsModo) {
    setModo(m)
    localStorage.setItem('ops_modo', m)
  }

  // ── Reordenar columnas (drag & drop) — orden persistido por restaurante+modo ──
  const [ordenSecciones, setOrdenSecciones] = useState<string[]>([])
  const [draggingSecId, setDraggingSecId] = useState<string | null>(null)
  const [overSecId, setOverSecId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const secDropZonesRef = useRef<Map<string, HTMLElement>>(new Map())

  useEffect(() => {
    if (!restauranteId) return
    try {
      const raw = localStorage.getItem(`ops_orden_secciones_${restauranteId}_${modo}`)
      setOrdenSecciones(raw ? JSON.parse(raw) : [])
    } catch {
      setOrdenSecciones([])
    }
  }, [restauranteId, modo])

  const registerSecZone = useCallback((id: string, el: HTMLElement | null) => {
    if (el) secDropZonesRef.current.set(id, el)
    else secDropZonesRef.current.delete(id)
  }, [])

  // ── Screen context para Kitchen Coach ─────────────────────────
  // Embebido dentro de OPS, el dueño del contexto es operaciones/page.tsx
  // (escribe screen:'operaciones' para que cargue el tour cross-tab). Acá
  // solo escribimos si la vista corre standalone, para no pisarlo.
  useEffect(() => {
    if (embedded) return
    const topCriticas = tareas.filter(t => t.prioridad === 'critica' && t.estado !== 'listo').map(t => t.titulo).slice(0, 3)
    const { total, listos } = (() => {
      const totalHoy = tareas.filter((t) => t.turno_fecha === today && !t.parent_id)
      return { total: totalHoy.length, listos: totalHoy.filter(t => t.estado === 'listo').length }
    })()
    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'tareas',
      modo,
      total,
      listos,
      pendientesTotal: tareas.filter(t => t.estado !== 'listo').length,
      topCriticas,
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [tareas, modo, today, embedded])

  const { topLevel, subtareasByParent, statsHoy, ayerDuplicadosIds } = useMemo(() => {
    // Ayer = carryover de un solo día: una tarea no completada se arrastra al día
    // siguiente y nada más. Evita que las pendientes se apilen indefinidamente.
    const ayer = (() => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] })()
    const todasHoyModo = tareas.filter((t) => t.modo === modo && !t.parent_id && t.turno_fecha === today)
    const clavesHoyModo = new Set(todasHoyModo.map((t) => t.titulo.trim().toLowerCase()))
    const ayerCandidates = tareas.filter((t) =>
      t.modo === modo && !t.parent_id && t.turno_fecha === ayer && t.estado !== 'listo'
    )
    // Si hoy ya existe una tarea con el mismo título (mismo modo), la de ayer es un
    // duplicado: se oculta acá y se borra de DB abajo (ver activarMenu, que ahora
    // siempre crea la de hoy en vez de saltearla).
    const ayerDuplicados: Tarea[] = []
    const ayerNoDuplicados: Tarea[] = []
    for (const t of ayerCandidates) {
      if (clavesHoyModo.has(t.titulo.trim().toLowerCase())) ayerDuplicados.push(t)
      else ayerNoDuplicados.push(t)
    }
    const hoyCandidates = [...todasHoyModo, ...ayerNoDuplicados].sort((a, b) => {
      // Turno actual primero
      const aHoy = a.turno_fecha === today
      const bHoy = b.turno_fecha === today
      if (aHoy && !bHoy) return -1
      if (!aHoy && bHoy) return 1
      return 0
    })
    const subs = tareas.filter((t) => t.parent_id != null)
    const subMap: Record<string, Tarea[]> = {}
    for (const s of subs) {
      const pid = s.parent_id!
      if (!subMap[pid]) subMap[pid] = []
      subMap[pid].push(s)
    }
    const totalHoy = tareas.filter((t) => t.turno_fecha === today && !t.parent_id)
    const listosHoy = totalHoy.filter((t) => t.estado === 'listo').length
    return {
      topLevel: hoyCandidates,
      subtareasByParent: subMap,
      statsHoy: { listos: listosHoy, total: totalHoy.length },
      ayerDuplicadosIds: ayerDuplicados.map((t) => t.id),
    }
  }, [tareas, modo, today])

  // Red de seguridad: si quedó un duplicado de ayer (mismo título+modo que uno de
  // hoy) que activarMenu no haya limpiado, lo borramos acá — fire-and-forget vía
  // la función del hook (nunca insert/delete directo, ver .claude/docs/hooks.md §4).
  const ayerDuplicadosBorrados = useRef<Set<string>>(new Set())
  useEffect(() => {
    for (const id of ayerDuplicadosIds) {
      if (ayerDuplicadosBorrados.current.has(id)) continue
      ayerDuplicadosBorrados.current.add(id)
      eliminarTarea(id).catch(() => {})
    }
  }, [ayerDuplicadosIds, eliminarTarea])

  // ── Agregar item a sección de prioridad ───────────────────────
  const handleAddItem = useCallback(async (prioridad: string, titulo: string, recetaId?: string) => {
    await agregarTarea({
      titulo,
      modo,
      seccion: 'general',
      turno_fecha: today,
      estado: 'pendiente',
      status: 'pendiente',
      prioridad: prioridad as TareaPrioridad,
      categoria: 'produccion',
      asignado_a: null,
      creado_por: perfil?.miembro_id ?? null,
      descripcion: null,
      plaza: null,
      fecha_limite: null,
      tiempo_estimado_min: null,
      receta_id: recetaId ?? null,
      checklist: [],
    })
  }, [agregarTarea, modo, today, perfil])

  // ── Agregar sub-tarea ─────────────────────────────────────────
  const handleAddSubtarea = useCallback(async (parentId: string, titulo: string) => {
    const parent = tareas.find((t) => t.id === parentId)
    if (!parent) return
    await agregarTarea({
      titulo,
      modo: parent.modo ?? modo,
      seccion: parent.seccion ?? 'general',
      parent_id: parentId,
      turno_fecha: today,
      estado: 'pendiente',
      status: 'pendiente',
      prioridad: 'baja',
      categoria: 'produccion',
      asignado_a: null,
      creado_por: perfil?.miembro_id ?? null,
      descripcion: null,
      plaza: null,
      fecha_limite: null,
      tiempo_estimado_min: null,
      receta_id: null,
      checklist: [],
    })
  }, [agregarTarea, tareas, modo, today, perfil])

  // ── Sync bidireccional con Mise ───────────────────────────────
  // Al cambiar estado de tarea, refleja en checklist_registros el item vinculado por FK.
  const handleEstadoChange = useCallback(async (id: string, estado: OpsEstado) => {
    await cambiarEstado(id, estado)
    const tarea = tareas.find(t => t.id === id)
    if (!tarea?.checklist_item_id) return
    await syncMiseDesdeTarea(createClient(), tarea.checklist_item_id, today, estado === 'listo')
  }, [cambiarEstado, tareas, today])

  // ── Generar lista desde evento ────────────────────────────────
  const secciones = (modo === 'menu' || modo === 'evento') ? [...SECCIONES_MENU] : [...SECCIONES_CARTA]

  const handleGenerarLista = useCallback(async (seccionIds: string[], eventoTitulo: string) => {
    for (const seccionId of seccionIds) {
      const secLabel = secciones.find(s => s.id === seccionId)?.label ?? seccionId
      await agregarTarea({
        titulo: `${secLabel} — ${eventoTitulo}`,
        modo,
        seccion: seccionId,
        turno_fecha: today,
        estado: 'pendiente',
        status: 'pendiente',
        prioridad: 'baja',
        categoria: 'produccion',
        asignado_a: null,
        creado_por: perfil?.miembro_id ?? null,
        descripcion: null,
        plaza: null,
        fecha_limite: null,
        tiempo_estimado_min: null,
        receta_id: null,
        checklist: [],
      })
    }
  }, [agregarTarea, modo, today, perfil, secciones])

  // ── Columnas a renderizar: mismo agrupamiento de siempre (prioridad en modo
  // carta, sección dinámica en modo menú/evento), reordenadas según lo que el
  // usuario haya arrastrado (persistido en localStorage, por restaurante+modo).
  const columnasBase = useMemo<ColumnaDef[]>(() => {
    if (modo === 'menu' || modo === 'evento') {
      const conocidas = new Set<string>(SECCIONES_MENU.map(s => s.id))
      const presentes: string[] = []
      for (const t of topLevel) { const s = (t.seccion ?? '').trim(); if (s && !presentes.includes(s)) presentes.push(s) }
      return [
        ...SECCIONES_MENU.filter(s => presentes.includes(s.id)),
        ...presentes.filter(s => !conocidas.has(s)).map(s => ({ id: s, label: s, color: '#64748b' })),
      ]
    }
    return PRIORIDADES.map(p => ({ id: p.id, label: p.label, sublabel: p.sublabel, color: p.color }))
  }, [modo, topLevel])

  const columnas = useMemo<ColumnaDef[]>(() => {
    if (ordenSecciones.length === 0) return columnasBase
    const pos = new Map(ordenSecciones.map((id, i) => [id, i]))
    return [...columnasBase].sort((a, b) => {
      const pa = pos.has(a.id) ? pos.get(a.id)! : Infinity
      const pb = pos.has(b.id) ? pos.get(b.id)! : Infinity
      return pa - pb
    })
  }, [columnasBase, ordenSecciones])

  function itemsDeColumna(col: ColumnaDef): Tarea[] {
    if (modo === 'menu' || modo === 'evento') {
      return topLevel
        .filter((t) => (t.seccion ?? '') === col.id)
        .sort((a, b) => (PRIO_SORT[a.prioridad ?? 'baja'] ?? 3) - (PRIO_SORT[b.prioridad ?? 'baja'] ?? 3))
    }
    return topLevel.filter((t) => (t.prioridad ?? 'baja') === col.id)
  }

  function handleSecPointerDown(id: string, e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    setDraggingSecId(id)
    setDragOffset({ dx: 0, dy: 0 })
  }

  function handleSecPointerMove(e: React.PointerEvent) {
    if (!dragStartRef.current || !draggingSecId) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    setDragOffset({ dx, dy })
    let found: string | null = null
    for (const [id, el] of secDropZonesRef.current.entries()) {
      if (id === draggingSecId) continue
      const rect = el.getBoundingClientRect()
      if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        found = id
        break
      }
    }
    setOverSecId(found)
  }

  function handleSecPointerUp(e: React.PointerEvent) {
    const el = e.currentTarget as HTMLElement
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId)
    if (draggingSecId && overSecId && draggingSecId !== overSecId) {
      const idsActuales = columnasBase.map(c => c.id)
      const base = ordenSecciones.length ? ordenSecciones : idsActuales
      const withAll = [...base, ...idsActuales.filter(id => !base.includes(id))]
      const from = withAll.indexOf(draggingSecId)
      const to = withAll.indexOf(overSecId)
      if (from !== -1 && to !== -1) {
        const next = [...withAll]
        next.splice(from, 1)
        next.splice(to, 0, draggingSecId)
        setOrdenSecciones(next)
        if (restauranteId) {
          try { localStorage.setItem(`ops_orden_secciones_${restauranteId}_${modo}`, JSON.stringify(next)) } catch {}
        }
      }
    }
    dragStartRef.current = null
    setDraggingSecId(null)
    setDragOffset(null)
    setOverSecId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div data-coach-target="tareas-header" style={{
        background: 'var(--navy)',
        padding: `${embedded ? 0 : 46}px 16px 12px`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Producción</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 1 }}>
              {fmtFecha(today)}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <OpsToggle value={modo} onChange={handleModoChange} />
          </div>
        </div>

        {/* Stats turno */}
        {statsHoy.total > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,.08)', borderRadius: 10, padding: '6px 10px',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'rgba(255,255,255,.5)' }}>
              today
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.55)' }}>
              Hoy: <strong style={{ color: '#fff' }}>{statsHoy.listos}/{statsHoy.total}</strong> listos
            </span>
            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,.15)', borderRadius: 99 }}>
              <div style={{
                width: `${statsHoy.total > 0 ? (statsHoy.listos / statsHoy.total) * 100 : 0}%`,
                height: '100%', background: '#22c55e', borderRadius: 99, transition: 'width .3s',
              }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Lista agrupada por prioridad ── */}
      <div data-coach-target="tareas-lista" style={{ flex: 1, overflowY: 'auto', padding: '10px 12px 120px' }}>
        {restauranteId && (
          <EventoBanner
            restauranteId={restauranteId}
            modo={modo}
            onGenerarLista={handleGenerarLista}
          />
        )}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
            Cargando...
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, alignItems: 'start' }}>
            {columnas.map((col) => {
              const items = itemsDeColumna(col)
              const isDragging = draggingSecId === col.id
              const isOver = overSecId === col.id && draggingSecId !== null && draggingSecId !== col.id
              return (
                <div
                  key={col.id}
                  ref={(el) => registerSecZone(col.id, el)}
                  {...(col.id === 'critica' ? { 'data-coach-target': 'prod-seccion-sp' } : {})}
                  style={{
                    transform: isDragging && dragOffset ? `translate(${dragOffset.dx}px, ${dragOffset.dy}px)` : undefined,
                    position: isDragging ? 'relative' : undefined,
                    zIndex: isDragging ? 30 : undefined,
                    opacity: isDragging ? 0.85 : 1,
                    outline: isOver ? '2px dashed var(--navy)' : undefined,
                    outlineOffset: isOver ? 2 : undefined,
                    borderRadius: isOver ? 14 : undefined,
                  }}
                >
                  <SeccionOps
                    titulo={col.label}
                    sublabel={col.sublabel}
                    color={col.color}
                    items={items}
                    subtareasByParent={subtareasByParent}
                    onAddItem={(titulo, recetaId) => handleAddItem(modo === 'carta' ? col.id : 'media', titulo, recetaId)}
                    onEstadoChange={(id, estado) => handleEstadoChange(id, estado as OpsEstado)}
                    onAddSubtarea={handleAddSubtarea}
                    modo={modo}
                    showSeccionChip={modo === 'carta'}
                    showPrioChip={modo !== 'carta'}
                    recetas={recetasSimple}
                    dragHandleProps={{
                      onPointerDown: (e) => handleSecPointerDown(col.id, e),
                      onPointerMove: handleSecPointerMove,
                      onPointerUp: handleSecPointerUp,
                      onPointerCancel: handleSecPointerUp,
                    }}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
