'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSheetOpenWhen } from '@/lib/ui/chrome'
import { useRouter } from 'next/navigation'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { useTareas } from '@/lib/hooks/useTareas'
import { useMenus, type MenuConPreparaciones } from '@/lib/hooks/useMenus'
import { useEquipo } from '@/lib/hooks/useEquipo'
import { createClient } from '@/lib/supabase/client'
import type { Tarea } from '@/types'
import { PLAZA_TO_SECCION } from '@/components/mise/ProductoMiseCard'
import SugerenciaProduccionSheet from '@/components/produccion/SugerenciaProduccionSheet'
import { ConfirmSheet } from '@/components/ui'
import { hoyOperativo, sumarDias } from '@/lib/ops/turnos'
import { activarMenuParaFechas } from '@/lib/menus/activarMenu'
import { estadoMiseMenu } from '@/lib/ops/menuMise'
import { tareaExistentePara } from '@/lib/ops/dedupeTareas'

// ── Helpers ─────────────────────────────────────────────────
// fmtDate formatea un Date arbitrario de navegación de calendario (siempre
// anclado a T12:00:00 local por los callers) — no es "ahora", así que no
// necesita hoyOperativo(). Lo que sí usa hoyOperativo() es cada lugar que
// hoy formatea `new Date()` (la hora real) para saber qué día es hoy.
function fmtDate(d: Date) {
  return d.toISOString().split('T')[0]
}
function fmtDateLabel(d: Date) {
  const hoy = hoyOperativo()
  const target = fmtDate(d)
  if (target === hoy) return 'Hoy'
  if (target === sumarDias(hoy, 1)) return 'Mañana'
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
}
function fmtMesLabel(mes: string) {
  const [y, m] = mes.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

// ── Tipos locales de Planificación ──────────────────────────
type TipoMenu = 'menu' | 'evento'
type FiltroTipo = 'todo' | TipoMenu

/** Un menú activo del día con sus tareas — un bloque visual propio. */
interface GrupoMenu {
  key: string          // menu_id
  nombre: string
  tipo: TipoMenu
  tareas: Tarea[]
}

// Paleta por tipo — la misma que usan el selector de menús del catálogo y
// el toggle de Producción, para que "evento violeta / menú celeste" sea
// una sola convención en toda la app.
const TIPO_CFG: Record<TipoMenu, { label: string; color: string; bg: string; border: string }> = {
  menu:   { label: 'Menú',   color: '#0284c7', bg: 'rgba(14,165,233,.10)',  border: 'rgba(14,165,233,.35)' },
  evento: { label: 'Evento', color: '#7c3aed', bg: 'rgba(139,92,246,.10)', border: 'rgba(139,92,246,.35)' },
}

// Ruta vieja /produccion → redirige a OPS. La implementación vive como <ProduccionView/>,
// que OPS renderiza embebida en su tab "Planificación".
export default function ProduccionRoute() {
  const router = useRouter()
  useEffect(() => { router.replace('/operaciones?tab=planificacion') }, [router])
  return null
}

// ══════════════════════════════════════════════════════════════
// PLANIFICACIÓN — activar menús del catálogo + sugerencia de producción.
// La ejecución (tildar) vive en el tab Producción (tabla `tareas`).
// La planilla legacy (platos_compuestos / produccion_diaria) se retiró en FASE 0.2.
// ══════════════════════════════════════════════════════════════
export function ProduccionView({ embedded }: { embedded?: boolean } = {}) {
  const router = useRouter()
  const RESTAURANTE_ID = useRestauranteId()
  const { agregarTarea, tareas, eliminarTarea, refetch: refetchTareas } = useTareas()
  const { menus: catalogoMenus, activarEnMise, desactivarEnMise } = useMenus()
  // Una sola puerta de activación por tipo (adenda 2026-08-20): un menú fijo
  // se activa por vigencia en el mise — Producción recibe solo lo que se
  // despacha desde ahí. Un evento se activa por fecha directo a Producción
  // (fuerza toda la lista sin contar heladera, que es justo lo que un
  // evento puntual necesita). El día/rango de arriba del picker solo aplica
  // a eventos: si el catálogo no tiene ninguno, no tiene sentido mostrarlo.
  const hayEventosEnCatalogo = useMemo(() => catalogoMenus.some(m => m.tipo === 'evento'), [catalogoMenus])
  const [miseSavingId, setMiseSavingId] = useState<string | null>(null)
  const { miembros } = useEquipo()

  const [showMenuPicker, setShowMenuPicker] = useState(false)
  useSheetOpenWhen(showMenuPicker)
  const [showSugerencia, setShowSugerencia] = useState(false)
  useSheetOpenWhen(showSugerencia)
  const [confirmVaciar, setConfirmVaciar] = useState<GrupoMenu | null>(null)
  useSheetOpenWhen(!!confirmVaciar)
  const [cargandoMenu, setCargandoMenu] = useState(false)
  const [fecha, setFecha] = useState(() => hoyOperativo())
  const [toast, setToast] = useState('')
  // Filtro por origen de la producción — mismo criterio que el toggle de Producción.
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todo')

  // ── Calendar state ──────────────────────────────────────────
  const [fechasMes, setFechasMes] = useState<Record<string, string[]>>({})
  const [mesActual, setMesActual] = useState(() => hoyOperativo().slice(0, 7))
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [diasSeleccionados, setDiasSeleccionados] = useState<Set<string>>(new Set())

  // Sync mesActual when fecha changes month
  useEffect(() => {
    const m = fecha.slice(0, 7)
    if (m !== mesActual) setMesActual(m)
  }, [fecha, mesActual])

  // Días del mes con menú activo (tareas con menu_id) → puntos del calendario
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const [y, mo] = mesActual.split('-')
    const from = `${mesActual}-01`
    const to = `${mesActual}-${String(new Date(Number(y), Number(mo), 0).getDate()).padStart(2, '0')}`
    const supabase = createClient()
    // Se trae también `modo` para distinguir en el calendario los días con menú
    // fijo de los días con evento — son dos cosas distintas de planificar y se
    // leen mal si comparten el mismo punto.
    supabase.from('tareas').select('turno_fecha, modo')
      .eq('restaurante_id', RESTAURANTE_ID)
      .not('menu_id', 'is', null)
      .gte('turno_fecha', from).lte('turno_fecha', to)
      .then(({ data }) => {
        const map: Record<string, string[]> = {}
        for (const r of (data ?? []) as { turno_fecha: string | null; modo: string | null }[]) {
          if (!r.turno_fecha) continue
          const tag = r.modo === 'evento' ? 'evento' : 'menu'
          const tags = map[r.turno_fecha] ?? []
          if (!tags.includes(tag)) tags.push(tag)
          map[r.turno_fecha] = tags
        }
        setFechasMes(map)
      })
  }, [RESTAURANTE_ID, mesActual, tareas])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  // ── Activar un menú del catálogo → crea las tareas en Producción ──
  async function activarMenu(menu: MenuConPreparaciones) {
    if (!RESTAURANTE_ID || menu.preparaciones.length === 0) { setShowMenuPicker(false); return }
    const fechas = (multiSelectMode && diasSeleccionados.size > 0) ? Array.from(diasSeleccionados).sort() : [fecha]
    setCargandoMenu(true)
    try {
      const supabase = createClient()
      const { totalTareas, diasActivados, diasYaActivos } = await activarMenuParaFechas(supabase, RESTAURANTE_ID, menu, fechas)
      refetchTareas()
      setShowMenuPicker(false)
      if (multiSelectMode) { setDiasSeleccionados(new Set()); setMultiSelectMode(false) }
      if (diasActivados === 0) showToast('Ese menú ya estaba activo en los días elegidos')
      else if (fechas.length === 1) showToast(`Menú activado · ${totalTareas} ${totalTareas === 1 ? 'tarea' : 'tareas'} en Producción`)
      else showToast(`Menú activado en ${diasActivados} ${diasActivados === 1 ? 'día' : 'días'}${diasYaActivos > 0 ? ` (${diasYaActivos} ya activos)` : ''}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message
        : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
        : 'desconocido'
      showToast('Error: ' + msg)
    } finally {
      setCargandoMenu(false)
    }
  }

  // ── Activar/sacar un menú del mise (checklist_items con apertura/cierre) —
  // acción independiente de "Activar" (tareas, arriba): un menú puede tener
  // tareas de un día puntual Y estar en el mise al mismo tiempo, no se pisan.
  // Mismo motor que Carta → Menús (lib/ops/menuMise.ts), ver hooks.md.
  async function handleActivarEnMise(e: React.MouseEvent, menu: MenuConPreparaciones) {
    e.stopPropagation()
    setMiseSavingId(menu.id)
    try {
      const res = await activarEnMise(menu)
      if (!res) return
      const sinOpsTxt = res.sinOps > 0 ? ` · ${res.sinOps} sin plaza (no van)` : ''
      showToast(`${res.creados} preparaciones al mise${sinOpsTxt}`)
    } catch (e: unknown) {
      showToast('Error: ' + (e instanceof Error ? e.message : 'desconocido'))
    } finally {
      setMiseSavingId(null)
    }
  }
  async function handleSacarMise(e: React.MouseEvent, menu: MenuConPreparaciones) {
    e.stopPropagation()
    setMiseSavingId(menu.id)
    try {
      await desactivarEnMise(menu.id)
      showToast('Sacado del mise')
    } catch (e: unknown) {
      showToast('Error: ' + (e instanceof Error ? e.message : 'desconocido'))
    } finally {
      setMiseSavingId(null)
    }
  }

  // ── E1: convertir la sugerencia de producción (motor de reglas) en tareas de OPS ──
  async function confirmarSugerencia(
    items: { recetaId: string; nombre: string; plaza: string; cantidad: number; unidad: string }[],
    fechaSugerida: string,
    diaLabel: string,
  ) {
    if (!RESTAURANTE_ID || items.length === 0) { setShowSugerencia(false); return }
    try {
      const supabase = createClient()
      // Lo que ya está cargado para esa fecha — la sugerencia insertaba en lote
      // sin preguntar, así que confirmarla dos veces (o confirmarla sobre un día
      // que ya tenía la producción despachada desde el mise) plantaba la misma
      // preparación de nuevo. Una preparación, un día, una fila: ver
      // lib/ops/dedupeTareas.ts.
      const { data: yaCargadas } = await supabase.from('tareas')
        .select('id, titulo, categoria, modo, plaza, seccion, menu_id, checklist_item_id, estado, turno_fecha, created_at, parent_id')
        .eq('restaurante_id', RESTAURANTE_ID).eq('turno_fecha', fechaSugerida).is('parent_id', null)
      const existentes = (yaCargadas ?? []) as Tarea[]

      const rows = items.map((it, i) => ({
        titulo: it.nombre,
        descripcion: `Sugerido por ventas históricas de los ${diaLabel}`,
        status: 'pendiente',
        estado: 'pendiente',
        prioridad: 'media',
        categoria: 'produccion',
        modo: 'carta',
        seccion: PLAZA_TO_SECCION[it.plaza] ?? 'general',
        plaza: it.plaza,
        asignado_a: null,
        receta_id: it.recetaId,
        cantidad: it.cantidad,
        turno_fecha: fechaSugerida,
        orden: i,
        restaurante_id: RESTAURANTE_ID,
      })).filter(r => !tareaExistentePara(existentes, r))

      if (rows.length > 0) {
        const { error } = await supabase.from('tareas').insert(rows)
        if (error) throw error
      }
      refetchTareas()
      setShowSugerencia(false)
      const omitidas = items.length - rows.length
      showToast(rows.length === 0
        ? `Todo eso ya estaba cargado para ${diaLabel}`
        : `${rows.length} ${rows.length === 1 ? 'tarea creada' : 'tareas creadas'} para ${diaLabel}${omitidas > 0 ? ` · ${omitidas} ya estaban` : ''}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message
        : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
        : 'desconocido'
      showToast('Error: ' + msg)
    }
  }

  // ── Tareas del menú activo para la fecha seleccionada ──
  const menuTareasDelDia = useMemo(
    () => tareas.filter(t => t.menu_id && t.turno_fecha === fecha && !t.parent_id),
    [tareas, fecha],
  )

  // ── Un bloque por menú activo ──────────────────────────────
  // Un día puede tener varios menús y varios eventos activos a la vez. Antes se
  // aplanaban todos en una sola lista por sección y las producciones del menú
  // fijo quedaban mezcladas con las del evento, sin forma de saber cuál era cuál.
  // Cada menú activo pasa a ser su propio bloque, y el filtro de arriba (Todo /
  // Menú / Evento) refleja el mismo criterio que el toggle de Producción.
  const gruposDelDia = useMemo<GrupoMenu[]>(() => {
    const m = new Map<string, GrupoMenu>()
    for (const t of [...menuTareasDelDia].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))) {
      const key = t.menu_id!
      let g = m.get(key)
      if (!g) {
        const cat = catalogoMenus.find(x => x.id === key)
        g = {
          key,
          nombre: cat?.nombre ?? t.descripcion ?? 'Menú del día',
          tipo: (t.modo === 'evento' || cat?.tipo === 'evento') ? 'evento' : 'menu',
          tareas: [],
        }
        m.set(key, g)
      }
      g.tareas.push(t)
    }
    // Menús primero, eventos después — el evento es lo excepcional del día.
    return [...m.values()].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'menu' ? -1 : 1))
  }, [menuTareasDelDia, catalogoMenus])

  const gruposVisibles = useMemo(
    () => filtroTipo === 'todo' ? gruposDelDia : gruposDelDia.filter(g => g.tipo === filtroTipo),
    [gruposDelDia, filtroTipo],
  )
  const conteoTipo = useMemo(() => ({
    todo: gruposDelDia.reduce((s, g) => s + g.tareas.length, 0),
    menu: gruposDelDia.filter(g => g.tipo === 'menu').reduce((s, g) => s + g.tareas.length, 0),
    evento: gruposDelDia.filter(g => g.tipo === 'evento').reduce((s, g) => s + g.tareas.length, 0),
  }), [gruposDelDia])
  const tareasVisibles = useMemo(() => gruposVisibles.flatMap(g => g.tareas), [gruposVisibles])

  // ── Reordenar secciones/ítems del menú del día (drag & drop en MenuActivoView) ──
  // Un solo campo `orden` (ya existente en `tareas`) codifica sección + posición dentro
  // de ella: al aplanar [sección1-item1, sección1-item2, sección2-item1, ...] el índice
  // en esa lista ES el nuevo `orden`. No hace falta una columna nueva para "orden de sección".
  async function reordenarMenuDelDia(cambios: { id: string; orden: number }[]) {
    if (cambios.length === 0) return
    try {
      const supabase = createClient()
      const { error } = await Promise.all(
        cambios.map(c => supabase.from('tareas').update({ orden: c.orden }).eq('id', c.id))
      ).then(results => {
        const withError = results.find(r => r.error)
        return { error: withError?.error ?? null }
      })
      if (error) throw error
      refetchTareas()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message
        : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
        : 'desconocido'
      showToast('Error al reordenar: ' + msg)
    }
  }

  // Vacía un menú/evento puntual del día — no todo lo cargado. Con varios menús
  // activos, "vaciar todo" borraba también el que no se quería tocar.
  function vaciarGrupo(grupo: GrupoMenu) {
    if (grupo.tareas.length === 0) return
    setConfirmVaciar(grupo)
  }

  async function confirmarVaciarGrupo() {
    const grupo = confirmVaciar
    if (!grupo) return
    setConfirmVaciar(null)
    const ids = grupo.tareas.map(t => t.id)
    try { for (const id of ids) await eliminarTarea(id); showToast(`"${grupo.nombre}" vaciado`) }
    catch (e: unknown) { showToast('Error: ' + (e instanceof Error ? e.message : 'desconocido')) }
  }

  function irAProduccion() {
    window.dispatchEvent(new CustomEvent('kc-set-tab', { detail: { tab: 'produccion' } }))
  }

  // ── Date navigation ───────────────────────────────────────
  function shiftDate(days: number) {
    const d = new Date(fecha + 'T12:00:00')
    d.setDate(d.getDate() + days)
    setFecha(fmtDate(d))
  }
  function shiftMes(months: number) {
    const [y, m] = mesActual.split('-').map(Number)
    const d = new Date(y, m - 1 + months, 1)
    setMesActual(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div style={{
      background: 'var(--bg)',
      height: embedded ? '100%' : undefined,
      display: embedded ? 'flex' : undefined,
      flexDirection: embedded ? 'column' : undefined,
      // Un solo scroll (el de acá abajo), no dos anidados: cuando este panel
      // vive dentro de la fila con scroll-snap de OPS (operaciones/page.tsx),
      // un div en bloque con overflowY:auto directo (en vez de flex:1 dentro
      // de una columna) tarda un frame en asentar su altura recortada — se
      // veía un salto/desfase apenas se llegaba deslizando desde otro tab.
      overflow: embedded ? 'hidden' : undefined,
    }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: `${embedded ? 0 : 46}px 16px 14px`, flexShrink: embedded ? 0 : undefined }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!embedded && (
              <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 22 }}>arrow_back</span>
              </button>
            )}
            <h1 style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: 0 }}>Planificación</h1>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              data-coach-target="produccion-sugerencia"
              onClick={() => setShowSugerencia(true)}
              style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>auto_awesome</span>
              Sugerir producción
            </button>
            <button onClick={() => setShowMenuPicker(true)} style={{ background: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: 'var(--navy)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>menu_book</span>
              Cargar menú
            </button>
          </div>
        </div>

        {/* Date selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10 }}>
          <button onClick={() => shiftDate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.6)', fontSize: 20 }}>chevron_left</span>
          </button>
          <label style={{ flex: 1, position: 'relative', cursor: 'pointer' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{fmtDateLabel(new Date(fecha + 'T12:00:00'))}</span>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
            />
          </label>
          <button onClick={() => shiftDate(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.6)', fontSize: 20 }}>chevron_right</span>
          </button>
        </div>

        {/* Filtro por origen — solo tiene sentido si hay algo cargado ese día */}
        {gruposDelDia.length > 0 && (
          <div data-coach-target="plan-filtro-tipo" style={{ display: 'flex', marginTop: 10, background: 'rgba(255,255,255,.12)', borderRadius: 999, padding: 2 }}>
            {(['todo', 'menu', 'evento'] as FiltroTipo[]).map(f => {
              const activo = filtroTipo === f
              const esTodo = f === 'todo'
              const color = esTodo ? '#f59e0b' : TIPO_CFG[f].color
              return (
                <button
                  key={f}
                  // El tour del Coach apuntaba a "plan-sub-menu"/"plan-sub-eventos",
                  // targets de la Planificación vieja que ya no existían.
                  {...(f === 'menu' ? { 'data-coach-target': 'plan-sub-menu' } : f === 'evento' ? { 'data-coach-target': 'plan-sub-eventos' } : {})}
                  onClick={() => setFiltroTipo(f)}
                  style={{
                    flex: '1 1 auto', minWidth: 0, padding: '6px 8px', borderRadius: 999,
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    background: activo ? (esTodo ? color : '#fff') : 'transparent',
                    color: activo ? (esTodo ? '#fff' : color) : (esTodo ? '#fbbf24' : 'rgba(255,255,255,.55)'),
                    transition: 'all .15s', WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>
                    {esTodo ? 'Todo' : TIPO_CFG[f].label}
                  </span>
                  <span style={{
                    fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 99,
                    background: activo ? (esTodo ? 'rgba(255,255,255,.25)' : `${color}1a`) : 'rgba(255,255,255,.12)',
                    color: activo ? (esTodo ? '#fff' : color) : 'rgba(255,255,255,.5)',
                  }}>
                    {conteoTipo[f]}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Content — flex:1+overflowY:auto solo cuando embedded (ver el porqué
          en el comentario del div raíz); en la ruta standalone sigue
          scrolleando la página entera, como siempre. */}
      <div style={embedded ? { flex: 1, overflowY: 'auto', minHeight: 0 } : undefined}>
      {gruposDelDia.length > 0 ? (
        <div style={{ padding: '10px 12px 120px' }}>
          <ResumenDelDia
            tareas={tareasVisibles}
            grupos={gruposVisibles}
            onActivarOtro={() => setShowMenuPicker(true)}
            onIrAProduccion={irAProduccion}
          />
          {gruposVisibles.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, opacity: .5 }}>
                {filtroTipo === 'evento' ? 'celebration' : 'restaurant_menu'}
              </span>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>
                {filtroTipo === 'evento' ? 'Sin eventos este día' : 'Sin menú fijo este día'}
              </div>
              <button
                onClick={() => setFiltroTipo('todo')}
                style={{ marginTop: 6, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'underline', padding: 0 }}
              >
                Ver todo lo cargado
              </button>
            </div>
          ) : gruposVisibles.map(grupo => (
            <MenuActivoView
              key={grupo.key}
              grupo={grupo}
              miembros={miembros}
              onVaciar={() => vaciarGrupo(grupo)}
              onReordenar={reordenarMenuDelDia}
            />
          ))}
        </div>
      ) : (
        /* Sin menú cargado para este día */
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', gap: 10 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-3)' }}>restaurant_menu</span>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', margin: 0, textAlign: 'center' }}>
            Sin menú cargado para este día
          </p>
          {catalogoMenus.length > 0 ? (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, textAlign: 'center' }}>
                Tenés {catalogoMenus.length} {catalogoMenus.length === 1 ? 'menú' : 'menús'} en el catálogo. Activá uno para crear sus tareas en Producción.
              </p>
              <button
                onClick={() => setShowMenuPicker(true)}
                style={{ marginTop: 6, padding: '13px 26px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, var(--navy), #4361a0)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 16px rgba(28,45,74,.35)' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>menu_book</span>
                Activar menú del catálogo
              </button>
            </>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, textAlign: 'center' }}>
              Armá un menú en <b>Carta → Menús</b> y después activalo acá.
            </p>
          )}
          <button
            onClick={irAProduccion}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'underline', padding: 0 }}
          >
            o agregar una tarea suelta en Producción
          </button>
        </div>
      )}
      </div>

      {/* ── E1: sugerencia de producción (motor de reglas sobre ventas históricas) ── */}
      {showSugerencia && typeof document !== 'undefined' && createPortal(
        <SugerenciaProduccionSheet
          tareasExistentes={tareas}
          onConfirm={confirmarSugerencia}
          onClose={() => setShowSugerencia(false)}
        />,
        document.body,
      )}

      {confirmVaciar && (
        <ConfirmSheet
          icon="delete_sweep"
          iconColor="#ef4444"
          title={`¿Vaciar ${confirmVaciar.tipo === 'evento' ? 'el evento' : 'el menú'} "${confirmVaciar.nombre}"?`}
          body={`Se eliminan ${confirmVaciar.tareas.length} tareas de este día.`}
          confirmLabel="Vaciar"
          confirmColor="#ef4444"
          onConfirm={confirmarVaciarGrupo}
          onCancel={() => setConfirmVaciar(null)}
        />
      )}

      {/* ── Selector de menú del catálogo (portal para escapar de overflow/transform/BottomNav) ── */}
      {showMenuPicker && typeof document !== 'undefined' && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowMenuPicker(false); setMultiSelectMode(false); setDiasSeleccionados(new Set()) } }}
        >
          <div style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '18px 16px 12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Cargar menú</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{multiSelectMode && diasSeleccionados.size > 0 ? `En ${diasSeleccionados.size} ${diasSeleccionados.size === 1 ? 'día' : 'días'} seleccionados` : 'Fijo → activalo en el mise · Evento → elegí fecha'}</div>
              </div>
              <button onClick={() => { setShowMenuPicker(false); setMultiSelectMode(false); setDiasSeleccionados(new Set()) }} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-3)' }}>close</span>
              </button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
              {/* El día/rango solo aplica a eventos (activación directa a
                  Producción) — un menú fijo se activa por vigencia en el
                  mise, no por fecha puntual. Sin eventos en el catálogo, este
                  paso no tiene a qué aplicarse. */}
              {hayEventosEnCatalogo && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                    ¿Un día o varios? <span style={{ textTransform: 'none', fontWeight: 500 }}>(para un evento)</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                    <button
                      onClick={() => { setMultiSelectMode(false); setDiasSeleccionados(new Set()) }}
                      style={{
                        flex: 1, padding: '8px 10px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                        border: `1.5px solid ${!multiSelectMode ? 'var(--navy)' : 'var(--border)'}`,
                        background: !multiSelectMode ? 'rgba(28,45,74,.06)' : 'var(--bg)',
                        color: !multiSelectMode ? 'var(--navy)' : 'var(--text-2)',
                        fontSize: 12, fontWeight: 700,
                      }}
                    >
                      {fmtDateLabel(new Date(fecha + 'T12:00:00'))}
                    </button>
                    <button
                      onClick={() => setMultiSelectMode(true)}
                      style={{
                        flex: 1, padding: '8px 10px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                        border: `1.5px solid ${multiSelectMode ? 'var(--navy)' : 'var(--border)'}`,
                        background: multiSelectMode ? 'rgba(28,45,74,.06)' : 'var(--bg)',
                        color: multiSelectMode ? 'var(--navy)' : 'var(--text-2)',
                        fontSize: 12, fontWeight: 700,
                      }}
                    >
                      Varios días
                    </button>
                  </div>

                  {multiSelectMode && (
                    <div style={{ background: 'var(--navy)', borderRadius: 12, padding: '10px 10px 4px', marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <button onClick={() => shiftMes(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.6)', fontSize: 18 }}>chevron_left</span>
                        </button>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.8)', textTransform: 'capitalize' }}>
                          {fmtMesLabel(mesActual)}
                        </span>
                        <button onClick={() => shiftMes(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.6)', fontSize: 18 }}>chevron_right</span>
                        </button>
                      </div>
                      <MesCalendar
                        mes={mesActual}
                        fechaSeleccionada={fecha}
                        fechasMes={fechasMes}
                        multiSelectMode={true}
                        diasSeleccionados={diasSeleccionados}
                        onSelectFecha={() => {}}
                        onToggleDia={(f) => setDiasSeleccionados(prev => {
                          const next = new Set(prev)
                          if (next.has(f)) next.delete(f)
                          else next.add(f)
                          return next
                        })}
                      />
                      <div style={{
                        padding: '8px 0 6px', textAlign: 'center', fontSize: 12, fontWeight: 700,
                        color: diasSeleccionados.size > 0 ? '#22c55e' : 'rgba(255,255,255,.4)',
                      }}>
                        {diasSeleccionados.size > 0
                          ? `${diasSeleccionados.size} ${diasSeleccionados.size === 1 ? 'día seleccionado' : 'días seleccionados'} — elegí un evento abajo`
                          : 'Tocá los días para seleccionarlos'}
                      </div>
                    </div>
                  )}
                </>
              )}

              {catalogoMenus.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-3)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 40, opacity: .5 }}>menu_book</span>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>No hay menús en el catálogo</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>Armá uno en Carta → Menús</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {catalogoMenus.map(menu => {
                    const esEvento = menu.tipo === 'evento'
                    const disabled = cargandoMenu || (multiSelectMode && diasSeleccionados.size === 0)
                    // Estado del mise — mismo criterio que Carta → Menús (lib/ops/menuMise.ts).
                    const { sinVigencia, vigenciaVencida, vigenciaFutura, vigente } = estadoMiseMenu(menu, hoyOperativo())
                    const miseSaving = miseSavingId === menu.id
                    return (
                    <div key={menu.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', opacity: esEvento && multiSelectMode && diasSeleccionados.size === 0 ? .45 : 1 }}>
                      {esEvento ? (
                        // Evento: activa TAREAS del día/rango elegido arriba, directo a
                        // Producción — no pasa por el mise (ver hayEventosEnCatalogo).
                        <button onClick={() => !disabled && activarMenu(menu)} disabled={disabled}
                          style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '12px 14px', cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', opacity: cargandoMenu ? .6 : 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '.04em', background: 'rgba(139,92,246,.14)', color: '#8b5cf6' }}>
                              Evento
                            </span>
                            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{menu.nombre}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{menu.preparaciones.length} prep.</span>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>add_circle</span>
                          </div>
                          {menu.descripcion && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{menu.descripcion}</div>}
                        </button>
                      ) : (
                        <>
                          {/* Fijo: no se activa por fecha — solo por vigencia en el mise
                              (ver bloque de abajo, ahora la única acción de la card). */}
                          <div style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '.04em', background: 'rgba(14,165,233,.14)', color: '#0ea5e9' }}>
                                Fijo
                              </span>
                              <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{menu.nombre}</span>
                              <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{menu.preparaciones.length} prep.</span>
                            </div>
                            {menu.descripcion && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{menu.descripcion}</div>}
                          </div>
                          <div style={{ borderTop: '1px solid var(--border)' }}>
                            {menu.enMise ? (
                              <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                {vigente ? (
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(34,197,94,.13)', color: '#16a34a' }}>
                                    En el mise · hasta {new Date(menu.vigencia_hasta! + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                                  </span>
                                ) : vigenciaFutura ? (
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--surface)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                                    Entra el {new Date(menu.vigencia_desde! + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--surface)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                                    Venció el {new Date(menu.vigencia_hasta! + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                                  </span>
                                )}
                                <button onClick={e => handleSacarMise(e, menu)} disabled={miseSaving}
                                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: miseSaving ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', opacity: miseSaving ? .6 : 1 }}>
                                  Sacar del mise
                                </button>
                              </div>
                            ) : (
                              <button onClick={e => handleActivarEnMise(e, menu)} disabled={miseSaving || sinVigencia || vigenciaVencida}
                                title={sinVigencia ? 'Cargá vigencia desde/hasta en Editar (Carta → Menús)' : vigenciaVencida ? 'La vigencia ya venció' : 'Activar en el mise'}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: (sinVigencia || vigenciaVencida) ? 'none' : 'rgba(245,158,11,.10)', border: 'none', padding: '10px 14px', cursor: (miseSaving || sinVigencia || vigenciaVencida) ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: (sinVigencia || vigenciaVencida) ? 'var(--text-3)' : '#b45309', opacity: miseSaving ? .6 : 1 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>playlist_add_check</span>
                                Activar en el mise
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    )
                  })}
                </div>
              )}

              <button
                onClick={() => { setShowMenuPicker(false); setMultiSelectMode(false); setDiasSeleccionados(new Set()); irAProduccion() }}
                style={{ width: '100%', marginTop: 12, padding: '8px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textDecoration: 'underline' }}
              >
                o agregar una tarea suelta en Producción
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[999] px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: toast.startsWith('Error') ? '#ef4444' : '#22c55e' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MES CALENDAR
// ══════════════════════════════════════════════════════════════
function MesCalendar({
  mes, fechaSeleccionada, fechasMes, multiSelectMode, diasSeleccionados, onSelectFecha, onToggleDia,
}: {
  mes: string
  fechaSeleccionada: string
  fechasMes: Record<string, string[]>
  multiSelectMode: boolean
  diasSeleccionados: Set<string>
  onSelectFecha: (f: string) => void
  onToggleDia: (f: string) => void
}) {
  const [year, month] = mes.split('-').map(Number)
  const firstDow = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const startOffset = firstDow === 0 ? 6 : firstDow - 1
  const today = hoyOperativo()
  const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  const cells: (string | null)[] = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${mes}-${String(d).padStart(2, '0')}`)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 3 }}>
        {DIAS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.4)', padding: '2px 0' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((dayStr, i) => {
          if (!dayStr) return <div key={i} />
          const isToday = dayStr === today
          const isSelected = !multiSelectMode && dayStr === fechaSeleccionada
          const isChecked = multiSelectMode && diasSeleccionados.has(dayStr)
          const tags = fechasMes[dayStr] ?? []
          const hasBase = tags.includes('menu')
          const hasEvent = tags.includes('evento')
          return (
            <button
              key={dayStr}
              onClick={() => multiSelectMode ? onToggleDia(dayStr) : onSelectFecha(dayStr)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '5px 2px',
                background: isChecked ? 'rgba(34,197,94,.25)' : isSelected ? '#fff' : isToday ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.07)',
                border: `1px solid ${isChecked ? '#22c55e' : isToday && !isSelected ? 'rgba(255,255,255,.3)' : 'transparent'}`,
                borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                WebkitTapHighlightColor: 'transparent', transition: 'all .1s',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1, color: isSelected ? 'var(--navy)' : isChecked ? '#22c55e' : 'rgba(255,255,255,.9)' }}>
                {Number(dayStr.split('-')[2])}
              </span>
              <div style={{ display: 'flex', gap: 2, height: 5, alignItems: 'center' }}>
                {hasBase && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#22c55e' }} />}
                {hasEvent && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#f97316' }} />}
              </div>
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 6, justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }} />
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,.4)' }}>Menú</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#f97316' }} />
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,.4)' }}>Evento</span>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MENU ACTIVO VIEW — vista del menú activo del día (Planificación)
// La ejecución (tildar) se hace en el tab Producción.
// ══════════════════════════════════════════════════════════════
const PRIO_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  critica: { label: 'SP', color: '#ef4444', bg: '#fef2f2' },
  alta: { label: 'P', color: '#f97316', bg: '#fff7ed' },
  media: { label: 'REF', color: '#3b82f6', bg: '#eff6ff' },
  baja: { label: 'Check', color: '#64748b', bg: '#f8fafc' },
}

type SeccionGrupo = [string, Tarea[]]

function agruparPorSeccion(tareas: Tarea[]): SeccionGrupo[] {
  const sorted = [...tareas].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  const m = new Map<string, Tarea[]>()
  for (const t of sorted) {
    const sec = (t.seccion ?? '').trim() || 'General'
    const list = m.get(sec) ?? []
    list.push(t)
    m.set(sec, list)
  }
  return [...m.entries()]
}

/** Resumen del día — avance agregado de lo que está visible + acciones. */
function ResumenDelDia({ tareas, grupos, onActivarOtro, onIrAProduccion }: {
  tareas: Tarea[]
  grupos: GrupoMenu[]
  onActivarOtro: () => void
  onIrAProduccion: () => void
}) {
  const listos = tareas.filter(t => t.estado === 'listo').length
  const total = tareas.length
  const pct = total > 0 ? Math.round((listos / total) * 100) : 0
  const nMenus = grupos.filter(g => g.tipo === 'menu').length
  const nEventos = grupos.filter(g => g.tipo === 'evento').length
  const detalle = [
    nMenus > 0 ? `${nMenus} ${nMenus === 1 ? 'menú' : 'menús'}` : null,
    nEventos > 0 ? `${nEventos} ${nEventos === 1 ? 'evento' : 'eventos'}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ margin: '0 2px 12px', padding: '12px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{listos}/{total} listas</div>
          {detalle && <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 1 }}>{detalle} activo{nMenus + nEventos === 1 ? '' : 's'} este día</div>}
        </div>
        <button onClick={onActivarOtro} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 11px', fontSize: 11, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>+ Cargar otro</button>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#22c55e' : '#3b82f6', transition: 'width .3s' }} />
      </div>
      {/* La ejecución (tildar) se hace en Producción */}
      <button onClick={onIrAProduccion} style={{ width: '100%', padding: '11px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, var(--navy), #4361a0)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>task_alt</span>
        Ir a Producción a ejecutar
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
      </button>
    </div>
  )
}

function MenuActivoView({
  grupo, miembros, onVaciar, onReordenar,
}: {
  grupo: GrupoMenu
  miembros: { id: string; nombre: string; apellido: string }[]
  onVaciar: () => void
  onReordenar: (cambios: { id: string; orden: number }[]) => void
}) {
  const tareas = grupo.tareas
  const cfg = TIPO_CFG[grupo.tipo]
  const groupedBase = useMemo(() => agruparPorSeccion(tareas), [tareas])

  // Estado local editable para que el drag se sienta fluido (sin esperar el round-trip
  // a DB en cada micro-movimiento). Se resincroniza con la base solo cuando cambia el
  // SET de ids (menú activado/vaciado) — no en cada cambio de campo (ej. tildar "listo"),
  // para no pisar un drag en curso ni "saltar" el orden recién elegido por el usuario.
  const idsKey = useMemo(() => tareas.map(t => t.id).sort().join(','), [tareas])
  const [grouped, setGrouped] = useState<SeccionGrupo[]>(groupedBase)
  const prevIdsKey = useRef(idsKey)
  useEffect(() => {
    if (prevIdsKey.current !== idsKey) {
      prevIdsKey.current = idsKey
      setGrouped(groupedBase)
    } else {
      setGrouped(prev => prev.map(([sec, items]) =>
        [sec, items.map(it => tareas.find(t => t.id === it.id) ?? it)] as SeccionGrupo
      ))
    }
    // Solo re-ejecutar cuando cambia el set de ids; groupedBase/tareas se leen del closure más reciente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  function commitOrder(next: SeccionGrupo[]) {
    const cambios: { id: string; orden: number }[] = []
    let i = 0
    for (const [, items] of next) {
      for (const t of items) {
        if ((t.orden ?? -1) !== i) cambios.push({ id: t.id, orden: i })
        i++
      }
    }
    if (cambios.length > 0) onReordenar(cambios)
  }

  // ── Auto-scroll en los bordes durante el drag (sección o ítem) ──
  // El contenedor scrolleable de Planificación es un ancestro de este componente
  // (embedded: el propio wrapper con overflowY:auto; standalone: la ventana). Se
  // resuelve una vez al iniciar el drag y se recorre con un loop rAF leyendo la
  // posición del puntero desde un ref — sigue corriendo aunque el puntero deje de
  // moverse, igual que el patrón del board de Stock en Mesa de Trabajo.
  const rootRef = useRef<HTMLDivElement | null>(null)
  const pointerYRef = useRef<number | null>(null)
  const scrollElRef = useRef<HTMLElement | Window | null>(null)
  const rafRef = useRef<number | null>(null)
  const autoScrollActiveRef = useRef(false)
  const EDGE = 70
  const MAX_SPEED = 16

  function findScrollParent(el: HTMLElement | null): HTMLElement | Window {
    let node = el?.parentElement ?? null
    while (node) {
      const style = getComputedStyle(node)
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
        return node
      }
      node = node.parentElement
    }
    return window
  }
  function speedNear(distance: number) {
    const clamped = Math.max(0, Math.min(EDGE, distance))
    return MAX_SPEED * (1 - clamped / EDGE)
  }
  // El loop se reprograma SIEMPRE mientras el drag esté activo — si se corta apenas
  // pointerYRef es null (ej. el primer frame, antes del primer pointermove), el auto-scroll
  // muere para toda la duración del drag y no hay forma de reactivarlo sin soltar y volver a agarrar.
  function autoScrollTick() {
    if (!autoScrollActiveRef.current) { rafRef.current = null; return }
    const y = pointerYRef.current
    const scrollEl = scrollElRef.current
    if (y != null && scrollEl) {
      if (scrollEl === window) {
        const vh = window.innerHeight
        if (y < EDGE) window.scrollBy(0, -speedNear(y))
        else if (y > vh - EDGE) window.scrollBy(0, speedNear(vh - y))
      } else {
        const el = scrollEl as HTMLElement
        const rect = el.getBoundingClientRect()
        if (y < rect.top + EDGE) el.scrollTop -= speedNear(y - rect.top)
        else if (y > rect.bottom - EDGE) el.scrollTop += speedNear(rect.bottom - y)
      }
    }
    rafRef.current = requestAnimationFrame(autoScrollTick)
  }
  function startAutoScroll(initialY: number) {
    pointerYRef.current = initialY
    scrollElRef.current = findScrollParent(rootRef.current)
    autoScrollActiveRef.current = true
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(autoScrollTick)
  }
  function stopAutoScroll() {
    autoScrollActiveRef.current = false
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    pointerYRef.current = null
    scrollElRef.current = null
  }

  // ── Drag de secciones (arrastrar el header reordena el bloque completo) ──
  const secRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [draggingSec, setDraggingSec] = useState<string | null>(null)
  function secDragStart(e: React.PointerEvent, sec: string) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDraggingSec(sec)
    startAutoScroll(e.clientY)
  }
  function secDragMove(e: React.PointerEvent) {
    if (!draggingSec) return
    const y = e.clientY
    pointerYRef.current = y
    setGrouped(prev => {
      for (const [name, el] of Object.entries(secRefs.current)) {
        if (!el || name === draggingSec) continue
        const rect = el.getBoundingClientRect()
        if (y < rect.top || y > rect.bottom) continue
        const from = prev.findIndex(([s]) => s === draggingSec)
        const to = prev.findIndex(([s]) => s === name)
        if (from === -1 || to === -1 || from === to) return prev
        const next = [...prev]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        return next
      }
      return prev
    })
  }
  function secDragEnd() {
    if (draggingSec) commitOrder(grouped)
    setDraggingSec(null)
    stopAutoScroll()
  }

  // ── Drag de ítems dentro de su sección ──
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [draggingItem, setDraggingItem] = useState<{ sec: string; id: string } | null>(null)
  function itemDragStart(e: React.PointerEvent, sec: string, id: string) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDraggingItem({ sec, id })
    startAutoScroll(e.clientY)
  }
  function itemDragMove(e: React.PointerEvent) {
    if (!draggingItem) return
    const y = e.clientY
    pointerYRef.current = y
    setGrouped(prev => {
      const secIdx = prev.findIndex(([s]) => s === draggingItem.sec)
      if (secIdx === -1) return prev
      const items = prev[secIdx][1]
      const fromIdx = items.findIndex(t => t.id === draggingItem.id)
      if (fromIdx === -1) return prev
      for (let i = 0; i < items.length; i++) {
        if (i === fromIdx) continue
        const el = itemRefs.current[items[i].id]
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (y < rect.top || y > rect.bottom) continue
        const nextItems = [...items]
        const [moved] = nextItems.splice(fromIdx, 1)
        nextItems.splice(i, 0, moved)
        const next = [...prev]
        next[secIdx] = [prev[secIdx][0], nextItems]
        return next
      }
      return prev
    })
  }
  function itemDragEnd() {
    if (draggingItem) commitOrder(grouped)
    setDraggingItem(null)
    stopAutoScroll()
  }

  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current) }, [])

  const listos = tareas.filter(t => t.estado === 'listo').length
  const total = tareas.length

  return (
    <div ref={rootRef} style={{
      marginBottom: 14, paddingLeft: 8,
      borderLeft: `3px solid ${cfg.border}`,
    }}>
      {/* Encabezado del menú/evento — de quién son las producciones de abajo */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, margin: '0 2px 8px',
        padding: '9px 12px', borderRadius: 12,
        background: cfg.bg, border: `1px solid ${cfg.border}`,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 99,
          textTransform: 'uppercase', letterSpacing: '.05em', flexShrink: 0,
          background: '#fff', color: cfg.color,
        }}>{cfg.label}</span>
        <span style={{
          flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-1)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{grupo.nombre}</span>
        <span style={{
          fontSize: 11, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0,
          color: listos === total && total > 0 ? '#22c55e' : cfg.color,
        }}>{listos}/{total}</span>
        <button
          onClick={onVaciar}
          title={`Vaciar ${grupo.nombre}`}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 17, color: '#ef4444' }}>delete_outline</span>
        </button>
      </div>

      {/* Secciones del menú — arrastrar el header o cada fila para reordenar */}
      {grouped.map(([sec, items]) => {
        const listosSec = items.filter(t => t.estado === 'listo').length
        const isDraggingThisSec = draggingSec === sec
        return (
          <div key={sec}
            ref={el => { secRefs.current[sec] = el }}
            style={{
              margin: '0 2px 10px', borderRadius: 14, overflow: 'hidden',
              border: isDraggingThisSec ? '1.5px solid var(--accent)' : '1px solid var(--border)',
              background: 'var(--surface)',
              opacity: isDraggingThisSec ? .7 : 1,
              boxShadow: isDraggingThisSec ? '0 4px 14px rgba(0,0,0,.12)' : 'none',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <span
                onPointerDown={e => secDragStart(e, sec)}
                onPointerMove={secDragMove}
                onPointerUp={secDragEnd}
                onPointerCancel={secDragEnd}
                title="Arrastrar para reordenar la sección"
                className="material-symbols-outlined"
                style={{ fontSize: 16, color: 'var(--text-3)', cursor: 'grab', touchAction: 'none', flexShrink: 0, marginLeft: -4 }}>
                drag_indicator
              </span>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{sec}</span>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: listosSec === items.length ? '#22c55e' : 'var(--text-3)' }}>{listosSec}/{items.length}</span>
            </div>
            <div style={{ padding: '4px 12px 8px' }}>
              {items.map(t => {
                const listo = t.estado === 'listo'
                const badge = PRIO_BADGE[t.prioridad ?? 'media'] ?? PRIO_BADGE.media
                const miembro = miembros.find(m => m.id === t.asignado_a)
                const isDraggingThisItem = draggingItem?.id === t.id
                return (
                  <div key={t.id}
                    ref={el => { itemRefs.current[t.id] = el }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, padding: '8px 0', borderBottom: '1px solid var(--border)',
                      opacity: isDraggingThisItem ? .5 : 1,
                      background: isDraggingThisItem ? 'rgba(67,97,160,.06)' : 'transparent',
                    }}>
                    <span
                      onPointerDown={e => itemDragStart(e, sec, t.id)}
                      onPointerMove={itemDragMove}
                      onPointerUp={itemDragEnd}
                      onPointerCancel={itemDragEnd}
                      title="Arrastrar para reordenar"
                      className="material-symbols-outlined"
                      style={{ fontSize: 15, color: 'var(--text-3)', cursor: 'grab', touchAction: 'none', flexShrink: 0 }}>
                      drag_indicator
                    </span>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: listo ? '#22c55e' : 'var(--border)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: listo ? '#15803d' : 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.titulo}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                        {t.plaza && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'rgba(67,97,160,.1)', color: 'var(--accent)', textTransform: 'capitalize' }}>{t.plaza}</span>}
                        {miembro && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#f1f5f9', color: '#475569' }}>{miembro.nombre}</span>}
                        {t.cantidad != null && <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'monospace' }}>{t.cantidad}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 99, background: badge.bg, color: badge.color, flexShrink: 0 }}>{badge.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
