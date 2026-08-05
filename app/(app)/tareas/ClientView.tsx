'use client'

import { useState, useMemo, useCallback, useEffect, useRef, type CSSProperties } from 'react'
import { useAuth } from '@/lib/auth/context'
import { useTareas } from '@/lib/hooks/useTareas'
import { useRecetasLite } from '@/lib/hooks/useRecetasLite'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { createClient } from '@/lib/supabase/client'
import { syncMiseDesdeTarea } from '@/lib/ops/syncMise'
import { OpsToggle, type OpsToggleValue } from '@/components/ops/OpsToggle'
import { SeccionOps, type DragHandleProps } from '@/components/ops/SeccionOps'
import { ItemOps } from '@/components/ops/ItemOps'
import type { CrearTareaSheetConfirmData } from '@/components/ops/CrearTareaSheet'
import { QuickAdd } from '@/components/ops/QuickAdd'
import { EventoBanner } from '@/components/ops/EventoBanner'
import { ProduccionBoard, type NuevaTareaBoard } from '@/components/ops/ProduccionBoard'
import { NotaImportanteCard } from '@/components/ops/NotaImportanteCard'
import { useHaccp, type HaccpLimpieza } from '@/lib/hooks/useHaccp'
import { limpiezaTocaFecha } from '@/lib/haccp/recurrencia'
import { hoyOperativo, sumarDias } from '@/lib/ops/turnos'
import { useTurnosServicio } from '@/lib/hooks/useTurnosServicio'
import type { Tarea, OpsModo, OpsEstado, TareaPrioridad } from '@/types'

const PEDIDOS_COL_ID = '__pedidos__'
const LIMPIEZA_COL_ID = '__limpieza__'

const PRIO_SORT: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 }

type ColumnaDef = { id: string; label: string; sublabel?: string; color: string }

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
  const { tareas, loading, agregarTarea, actualizarTarea, cambiarEstado, eliminarTarea } = useTareas()
  const { recetas } = useRecetasLite()
  const recetasSimple = useMemo(() => recetas.map(r => ({ id: r.id, nombre: r.nombre })), [recetas])
  const { limpieza, registrarLimpieza, crearTareaLimpieza } = useHaccp()
  const { turnosActivos } = useTurnosServicio()

  const today = hoyOperativo()

  // Modo — persiste en localStorage. 'todo' es una vista que combina
  // Carta+Menú+Evento; nunca se guarda como modo real de una tarea (ver modoStorage).
  const [modo, setModo] = useState<OpsToggleValue>(() => {
    if (typeof window === 'undefined') return 'carta'
    return (localStorage.getItem('ops_modo') as OpsToggleValue) ?? 'carta'
  })
  // modo concreto a usar al crear/mover tareas (una tarea no puede pertenecer a "todo")
  const modoStorage: OpsModo = modo === 'todo' ? 'carta' : modo

  function handleModoChange(m: OpsToggleValue) {
    setModo(m)
    localStorage.setItem('ops_modo', m)
  }

  const [toast, setToast] = useState('')
  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  // `tareas` y `turnosActivos` se leen por ref dentro de los callbacks que bajan
  // como props hasta ItemOps (memoizado): `tareas` cambia en cada tilde, así que
  // tenerlas en las deps recrearía los callbacks y re-renderizaría los ~70 ítems
  // en cada toque — exactamente la demora que se sentía en servicio.
  const tareasRef = useRef(tareas)
  useEffect(() => { tareasRef.current = tareas }, [tareas])
  const turnosActivosRef = useRef(turnosActivos)
  useEffect(() => { turnosActivosRef.current = turnosActivos }, [turnosActivos])

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
      pendientesTotal: tareas.filter(t => t.estado !== 'listo' && t.categoria !== 'pedido_nota').length,
      topCriticas,
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [tareas, modo, today, embedded])

  const { topLevel, subtareasByParent, statsHoy, ayerDuplicadosIds } = useMemo(() => {
    // Ayer = carryover de un solo día: una tarea no completada se arrastra al día
    // siguiente y nada más. Evita que las pendientes se apilen indefinidamente.
    const ayer = sumarDias(today, -1)
    // 'todo' junta Carta+Menú+Evento — no filtra por modo, solo por fecha/estado.
    const todasHoyModo = tareas.filter((t) => (modo === 'todo' || t.modo === modo) && !t.parent_id && t.turno_fecha === today)
    const clavesHoyModo = new Set(todasHoyModo.map((t) => t.titulo.trim().toLowerCase()))
    const ayerCandidates = tareas.filter((t) =>
      (modo === 'todo' || t.modo === modo) && !t.parent_id && t.turno_fecha === ayer && t.estado !== 'listo'
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
  // modoOverride: al agregar desde un recuadro de "Todo" (Carta/Menú/Evento),
  // la tarea tiene que guardarse con el modo de ESE recuadro, no con modoStorage.
  const handleAddItem = useCallback(async (prioridad: string, titulo: string, recetaId?: string, modoOverride?: OpsModo) => {
    await agregarTarea({
      titulo,
      modo: modoOverride ?? modoStorage,
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
  }, [agregarTarea, modoStorage, today, perfil])

  // Alta desde una columna del board de "Todo": la columna define el destino
  // completo (modo + plaza + paso), así que lo que se escribe en la columna
  // Parrilla nace con plaza='parrilla' — antes toda alta manual iba con
  // plaza=null y quedaba fuera de cualquier agrupación por plaza.
  const handleAddItemBoard = useCallback(async (nueva: NuevaTareaBoard) => {
    await agregarTarea({
      titulo: nueva.titulo,
      modo: nueva.modo,
      seccion: nueva.seccion ?? 'general',
      plaza: nueva.plaza,
      turno_fecha: today,
      estado: 'pendiente',
      status: 'pendiente',
      prioridad: nueva.prioridad,
      categoria: 'produccion',
      asignado_a: null,
      creado_por: perfil?.miembro_id ?? null,
      descripcion: null,
      fecha_limite: null,
      tiempo_estimado_min: null,
      receta_id: nueva.recetaId ?? null,
      checklist: [],
    })
  }, [agregarTarea, today, perfil])

  // ── Agregar sub-tarea ─────────────────────────────────────────
  // Igual que handleEstadoChange: `tareas` por ref para no recrear el callback
  // en cada tilde (ItemOps está memoizado).
  const handleAddSubtarea = useCallback(async (parentId: string, titulo: string) => {
    const parent = tareasRef.current.find((t) => t.id === parentId)
    if (!parent) return
    await agregarTarea({
      titulo,
      modo: parent.modo ?? modoStorage,
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
  }, [agregarTarea, modoStorage, today, perfil])

  // ── Sync bidireccional con Mise ───────────────────────────────
  // Al cambiar estado de tarea, refleja en checklist_registros el item vinculado por FK.
  const handleEstadoChange = useCallback(async (id: string, estado: OpsEstado) => {
    await cambiarEstado(id, estado)
    const tarea = tareasRef.current.find(t => t.id === id)
    if (!tarea?.checklist_item_id) return
    await syncMiseDesdeTarea(createClient(), tarea.checklist_item_id, today, estado === 'listo', turnosActivosRef.current)
  }, [cambiarEstado, today])

  // ── Cambiar prioridad directo desde la card de OPS (Menú/Evento) ──────
  const handlePrioridadChange = useCallback((id: string, prioridad: TareaPrioridad) => {
    actualizarTarea(id, { prioridad })
  }, [actualizarTarea])

  // ── Crear tarea desde un componente de OPS — hoy (duplicado ad hoc) o
  // mañana ("pase de turno"), vinculada al mismo componente (receta_id/
  // plaza/sección). Para mañana, el próximo turno la ve directo en su
  // Producción del día siguiente, sin depender de que alguien avise de
  // palabra — categoria='pase_turno' la distingue de las tareas normales
  // (mismo patrón que categoria='pedido_nota'). Sin menu_id a propósito:
  // no activa por sí sola la vista "menú activo" de Planificación, que
  // depende de que el menú se reactive explícitamente ese día.
  const handleCrearTareaDesdeItem = useCallback(async (item: Tarea, data: CrearTareaSheetConfirmData) => {
    let turnoFecha = today
    if (data.dia === 'manana') {
      turnoFecha = sumarDias(today, 1)
    }
    await agregarTarea({
      titulo: item.titulo,
      descripcion: data.nota,
      status: 'pendiente',
      prioridad: data.prioridad,
      categoria: data.dia === 'manana' ? 'pase_turno' : 'produccion',
      plaza: item.plaza ?? null,
      receta_id: item.receta_id ?? null,
      seccion: item.seccion ?? 'general',
      modo: item.modo ?? modoStorage,
      turno_fecha: turnoFecha,
      menu_id: null,
      estado: 'pendiente',
      cantidad: data.cantidad,
      asignado_a: null, creado_por: perfil?.miembro_id ?? null,
      fecha_limite: null, tiempo_estimado_min: null, checklist: [],
    })
    showToast(data.dia === 'manana' ? `Programado para mañana — ${item.titulo}` : `Tarea creada — ${item.titulo}`)
  }, [agregarTarea, today, modoStorage, perfil])

  // ── Generar lista desde evento ────────────────────────────────
  const secciones = (modo === 'menu' || modo === 'evento') ? [...SECCIONES_MENU] : [...SECCIONES_CARTA]

  const handleGenerarLista = useCallback(async (seccionIds: string[], eventoTitulo: string) => {
    for (const seccionId of seccionIds) {
      const secLabel = secciones.find(s => s.id === seccionId)?.label ?? seccionId
      await agregarTarea({
        titulo: `${secLabel} — ${eventoTitulo}`,
        modo: modoStorage,
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
  }, [agregarTarea, modoStorage, today, perfil, secciones])

  // ── Columnas a renderizar, reordenadas según lo que el usuario haya
  // arrastrado (persistido en localStorage, por restaurante+modo):
  // - Carta: prioridad (SP/P/REF/Check) + Pedidos + Limpieza.
  // - Menú/Evento: sección dinámica del menú activo + Pedidos + Limpieza (antes
  //   faltaban acá — una limpieza de rutina cargada en HACCP quedaba invisible
  //   en Producción salvo que se cambiara a modo Carta o Todo).
  // - Todo: no usa estas columnas — lo arma ProduccionBoard (bandas Carta por
  //   plaza / Menú y Evento por paso / Otros).
  const columnasBase = useMemo<ColumnaDef[]>(() => {
    if (modo === 'menu' || modo === 'evento') {
      const conocidas = new Set<string>(SECCIONES_MENU.map(s => s.id))
      const presentes: string[] = []
      for (const t of topLevel) { const s = (t.seccion ?? '').trim(); if (s && !presentes.includes(s)) presentes.push(s) }
      return [
        ...SECCIONES_MENU.filter(s => presentes.includes(s.id)),
        ...presentes.filter(s => !conocidas.has(s)).map(s => ({ id: s, label: s, color: '#64748b' })),
        { id: PEDIDOS_COL_ID, label: 'Pedidos', color: '#0ea5e9' },
        { id: LIMPIEZA_COL_ID, label: 'Limpieza', color: '#10b981' },
      ]
    }
    // modo === 'carta' — 'todo' no pasa por acá: lo renderiza ProduccionBoard.
    return [
      ...PRIORIDADES.map(p => ({ id: p.id, label: p.label, sublabel: p.sublabel, color: p.color })),
      { id: PEDIDOS_COL_ID, label: 'Pedidos', color: '#0ea5e9' },
      { id: LIMPIEZA_COL_ID, label: 'Limpieza', color: '#10b981' },
    ]
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

  // ── Recuadro Pedidos: notas libres, no accionan nada — se anotan y se
  // borran cuando ya se resolvieron. Reusa `tareas` (categoria='pedido_nota'),
  // sin turno_fecha/carryover: no son tareas de producción, son anotaciones.
  const pedidoNotas = useMemo(
    () => tareas.filter((t) => t.categoria === 'pedido_nota').sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')),
    [tareas]
  )

  const handleAgregarNotaPedido = useCallback(async (titulo: string) => {
    await agregarTarea({
      titulo,
      modo: modoStorage,
      seccion: 'general',
      turno_fecha: null,
      estado: 'pendiente',
      status: 'pendiente',
      prioridad: 'baja',
      categoria: 'pedido_nota',
      asignado_a: null,
      creado_por: perfil?.miembro_id ?? null,
      descripcion: null,
      plaza: null,
      fecha_limite: null,
      tiempo_estimado_min: null,
      receta_id: null,
      checklist: [],
    })
  }, [agregarTarea, modoStorage, perfil])

  // ── Recuadro Limpieza: limpiezas de HACCP que tocan hoy, de todas las
  // áreas/plazas del restaurante (sin filtrar, a diferencia del tab Rutina
  // del Mise). Tildar acá llama al mismo registrarLimpieza() de la pantalla
  // real de HACCP — no duplica el registro, solo lo expone acá también.
  const limpiezasHoy = useMemo(() => {
    const hoy = new Date()
    return limpieza.filter((l) => limpiezaTocaFecha(l, hoy))
  }, [limpieza])

  // Alta rápida de limpieza desde OPS: sin frecuencia/área, se crea diaria y
  // general (mismo default que ofrece el formulario real de HACCP), para no
  // pedir un formulario completo acá — se puede afinar después en HACCP.
  const handleAgregarLimpieza = useCallback(async (titulo: string) => {
    await crearTareaLimpieza({
      area: 'General',
      tarea_limpieza: titulo,
      frecuencia: 'diaria',
      dia_semana: null,
      dia_mes: null,
      sync_ops: true,
      usuario_id: null,
    })
  }, [crearTareaLimpieza])

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
        <div className="ops-header-row" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Producción</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 1 }}>
              {fmtFecha(today)}
            </div>
          </div>
          <div className="ops-toggle-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
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
            modo={modoStorage}
            onGenerarLista={handleGenerarLista}
          />
        )}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
            Cargando...
          </div>
        ) : modo === 'todo' ? (
          <ProduccionBoard
            tareas={topLevel}
            subtareasByParent={subtareasByParent}
            onAddItem={handleAddItemBoard}
            onEstadoChange={handleEstadoChange}
            onAddSubtarea={handleAddSubtarea}
            onPrioridadChange={handlePrioridadChange}
            onCrearTareaDesdeItem={handleCrearTareaDesdeItem}
            recetas={recetasSimple}
            restauranteId={restauranteId}
            otros={
              <>
                <NotaImportanteCard />
                <NotaPedidosCard
                  notas={pedidoNotas}
                  onAgregar={handleAgregarNotaPedido}
                  onEliminar={eliminarTarea}
                />
                <LimpiezaCard
                  items={limpiezasHoy}
                  onRegistrar={registrarLimpieza}
                  onAgregar={handleAgregarLimpieza}
                />
              </>
            }
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, alignItems: 'start' }}>
            {columnas.map((col) => {
              const isDragging = draggingSecId === col.id
              const isOver = overSecId === col.id && draggingSecId !== null && draggingSecId !== col.id
              const dragHandleProps: DragHandleProps = {
                onPointerDown: (e) => handleSecPointerDown(col.id, e),
                onPointerMove: handleSecPointerMove,
                onPointerUp: handleSecPointerUp,
                onPointerCancel: handleSecPointerUp,
              }
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
                  {col.id === PEDIDOS_COL_ID ? (
                    <NotaPedidosCard
                      notas={pedidoNotas}
                      onAgregar={handleAgregarNotaPedido}
                      onEliminar={eliminarTarea}
                      dragHandleProps={dragHandleProps}
                    />
                  ) : col.id === LIMPIEZA_COL_ID ? (
                    <LimpiezaCard
                      items={limpiezasHoy}
                      onRegistrar={registrarLimpieza}
                      onAgregar={handleAgregarLimpieza}
                      dragHandleProps={dragHandleProps}
                    />
                  ) : (
                    <SeccionOps
                      titulo={col.label}
                      sublabel={col.sublabel}
                      color={col.color}
                      items={itemsDeColumna(col)}
                      subtareasByParent={subtareasByParent}
                      onAddItem={(titulo, recetaId) => handleAddItem((modo === 'menu' || modo === 'evento') ? 'media' : col.id, titulo, recetaId)}
                      onEstadoChange={handleEstadoChange}
                      onAddSubtarea={handleAddSubtarea}
                      onPrioridadChange={handlePrioridadChange}
                      onCrearTareaDesdeItem={handleCrearTareaDesdeItem}
                      modo={modoStorage}
                      showSeccionChip={!(modo === 'menu' || modo === 'evento')}
                      showPrioChip={modo === 'menu' || modo === 'evento'}
                      recetas={recetasSimple}
                      dragHandleProps={dragHandleProps}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[999] px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: '#22c55e' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

const cardShellStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  overflow: 'hidden',
  marginBottom: 8,
}
const cardHeaderStyle = (draggable: boolean): CSSProperties => ({
  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 14px',
  background: 'none', border: 'none', cursor: draggable ? 'grab' : 'pointer',
  WebkitTapHighlightColor: 'transparent',
  touchAction: draggable ? 'none' : undefined,
})

// ── Recuadro "Pedidos" — notas libres, sin estado/checkbox (no acciona nada) ──
function NotaPedidosCard({
  notas, onAgregar, onEliminar, dragHandleProps,
}: {
  notas: Tarea[]
  onAgregar: (titulo: string) => Promise<void>
  onEliminar: (id: string) => void
  dragHandleProps?: DragHandleProps
}) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div style={cardShellStyle}>
      <button onClick={() => setCollapsed(v => !v)} {...dragHandleProps} style={cardHeaderStyle(!!dragHandleProps)}>
        {dragHandleProps && (
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)', flexShrink: 0 }}>drag_indicator</span>
        )}
        <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#0ea5e9', flexShrink: 0 }}>shopping_cart</span>
        <span style={{ flex: 1, textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Pedidos
        </span>
        <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: 'var(--text-3)', fontWeight: 700 }}>
          {notas.length}
        </span>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }}>
          expand_more
        </span>
      </button>
      <div style={{ height: 2, background: '#0ea5e9' }} />
      {!collapsed && (
        <div style={{ padding: '6px 10px 10px' }}>
          {notas.map((n) => (
            <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 4px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{n.titulo}</span>
              <button onClick={() => onEliminar(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 2, flexShrink: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
              </button>
            </div>
          ))}
          {notas.length === 0 && (
            <div style={{ padding: '8px 2px', fontSize: 12, color: 'var(--text-3)' }}>Sin pedidos anotados</div>
          )}
          <div style={{ marginTop: 4 }}>
            <QuickAdd placeholder="Anotar pedido..." onSave={onAgregar} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Recuadro "Limpieza" — limpiezas de HACCP que tocan hoy, todas las plazas.
// Tildar acá llama al mismo registrarLimpieza() de la pantalla real de HACCP.
function LimpiezaCard({
  items, onRegistrar, onAgregar, dragHandleProps,
}: {
  items: HaccpLimpieza[]
  onRegistrar: (id: string) => void
  onAgregar: (titulo: string) => Promise<void>
  dragHandleProps?: DragHandleProps
}) {
  const [collapsed, setCollapsed] = useState(false)
  const hechaHoy = (l: HaccpLimpieza) =>
    !!l.ultimo_registro && (Date.now() - new Date(l.ultimo_registro).getTime()) < 86_400_000
  const listas = items.filter(hechaHoy).length

  return (
    <div style={cardShellStyle}>
      <button onClick={() => setCollapsed(v => !v)} {...dragHandleProps} style={cardHeaderStyle(!!dragHandleProps)}>
        {dragHandleProps && (
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)', flexShrink: 0 }}>drag_indicator</span>
        )}
        <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#10b981', flexShrink: 0 }}>cleaning_services</span>
        <span style={{ flex: 1, textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Limpieza
        </span>
        <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: listas === items.length && items.length > 0 ? '#22c55e' : 'var(--text-3)', fontWeight: 700 }}>
          {listas}/{items.length}
        </span>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }}>
          expand_more
        </span>
      </button>
      <div style={{ height: 2, background: '#10b981' }} />
      {!collapsed && (
        <div style={{ padding: '6px 10px 10px' }}>
          {items.map((l) => {
            const hecha = hechaHoy(l)
            return (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 4px', borderBottom: '1px solid var(--border)' }}>
                <button
                  onClick={() => onRegistrar(l.id)}
                  style={{
                    width: 22, height: 22, borderRadius: 6, border: 'none', flexShrink: 0,
                    background: hecha ? '#10b981' : 'var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
                  }}
                >
                  {hecha && <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>check</span>}
                </button>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{l.area}: {l.tarea_limpieza}</span>
              </div>
            )
          })}
          {items.length === 0 && (
            <div style={{ padding: '8px 2px', fontSize: 12, color: 'var(--text-3)' }}>Sin limpiezas para hoy</div>
          )}
          <div style={{ marginTop: 4 }}>
            <QuickAdd placeholder="Agregar limpieza..." onSave={onAgregar} />
          </div>
        </div>
      )}
    </div>
  )
}
