'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { useProduccion, type PlatoConComponentes } from '@/lib/hooks/useProduccion'
import { useEquipo } from '@/lib/hooks/useEquipo'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { useTareas } from '@/lib/hooks/useTareas'
import { useMenus, type MenuConPreparaciones } from '@/lib/hooks/useMenus'
import { createClient } from '@/lib/supabase/client'
import type { StatusProduccion, CategoriaPlato, PlatoComponente, Tarea } from '@/types'
import { CATEGORIAS_PLATO } from '@/types'
import MermaBottomSheet from '@/components/merma/MermaBottomSheet'
import { useMerma } from '@/lib/hooks/useMerma'

// ── Helpers ─────────────────────────────────────────────────
function fmtDate(d: Date) {
  return d.toISOString().split('T')[0]
}
function fmtDateLabel(d: Date) {
  const hoy = fmtDate(new Date())
  const target = fmtDate(d)
  if (target === hoy) return 'Hoy'
  const manana = new Date(); manana.setDate(manana.getDate() + 1)
  if (target === fmtDate(manana)) return 'Mañana'
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
}
function fmtMesLabel(mes: string) {
  const [y, m] = mes.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

const STATUS_COLORS: Record<StatusProduccion, { bg: string; text: string; border: string }> = {
  pendiente: { bg: 'var(--surface)', text: 'var(--text-1)', border: 'var(--border)' },
  en_proceso: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  listo: { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
}


type View = 'planilla' | 'crear' | 'editar' | 'ingredientes' | 'duplicar'

export default function ProduccionPage({ embedded }: { embedded?: boolean } = {}) {
  const router = useRouter()
  const { perfil: authPerfil } = useAuth()
  const RESTAURANTE_ID = useRestauranteId()
  const {
    platos, produccion, loading, error,
    fetchProduccion, initProduccion, updateStatus,
    fetchFechasMes,
    crearPlato, actualizarPlato, eliminarPlato,
    duplicarMenu, fetchIngredientesConsolidados, setProduccion,
  } = useProduccion()
  const { miembros } = useEquipo()

  const { registrarMerma } = useMerma()
  const { agregarTarea, tareas, cambiarEstado, eliminarTarea } = useTareas()
  const { menus: catalogoMenus } = useMenus()
  const [showMenuPicker, setShowMenuPicker] = useState(false)
  const [cargandoMenu, setCargandoMenu] = useState(false)
  const puedeDelegar = authPerfil?.rol === 'admin' || authPerfil?.rol === 'chef'
  const [fecha, setFecha] = useState(() => fmtDate(new Date()))
  const [view, setView] = useState<View>('planilla')
  const [editingPlato, setEditingPlato] = useState<PlatoConComponentes | null>(null)
  const [toast, setToast] = useState('')
  const [mermaOpen, setMermaOpen] = useState(false)
  const [mermaPrefill, setMermaPrefill] = useState<{ producto_nombre?: string } | undefined>()
  const [miseItems, setMiseItems] = useState<{ nombre: string; plaza: string }[]>([])

  // ── Calendar state ──────────────────────────────────────────
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [fechasMes, setFechasMes] = useState<Record<string, string[]>>({})
  const [mesActual, setMesActual] = useState(() => fmtDate(new Date()).slice(0, 7))
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [diasSeleccionados, setDiasSeleccionados] = useState<Set<string>>(new Set())
  const [menuTagModal, setMenuTagModal] = useState(false)
  const [menuTagInput, setMenuTagInput] = useState('')
  const [activatingMulti, setActivatingMulti] = useState(false)
  const [activeMenuTag, setActiveMenuTag] = useState('')

  // Sync mesActual when fecha changes month
  useEffect(() => {
    const m = fecha.slice(0, 7)
    if (m !== mesActual) setMesActual(m)
  }, [fecha, mesActual])

  // Load fechas del mes
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    fetchFechasMes(mesActual).then(setFechasMes)
  }, [RESTAURANTE_ID, mesActual, fetchFechasMes])

  // ── Load produccion when fecha or platos change ───────────
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    fetchProduccion(fecha)
  }, [fecha, RESTAURANTE_ID, fetchProduccion])

  // Reset tag filter when date changes
  useEffect(() => { setActiveMenuTag('') }, [fecha])

  // Load mise items for stock indicators
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const supabase = createClient()
    supabase.from('checklist_items').select('nombre, plaza').eq('restaurante_id', RESTAURANTE_ID)
      .then(({ data }) => setMiseItems((data ?? []).map((i: { nombre: string; plaza: string }) => ({ nombre: i.nombre.toLowerCase().trim(), plaza: i.plaza }))))
  }, [RESTAURANTE_ID])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  function openMerma(nombre: string) {
    setMermaPrefill({ producto_nombre: nombre })
    setMermaOpen(true)
  }

  // ── Activar un menú del catálogo → crea las tareas en Producción/Menú (no toca Mise) ──
  async function activarMenu(menu: MenuConPreparaciones) {
    if (!RESTAURANTE_ID || menu.preparaciones.length === 0) { setShowMenuPicker(false); return }
    setCargandoMenu(true)
    try {
      const supabase = createClient()
      // Dedupe: si el menú ya está activo para esta fecha, no duplicar
      const { data: existing } = await supabase.from('tareas').select('id')
        .eq('restaurante_id', RESTAURANTE_ID).eq('menu_id', menu.id).eq('turno_fecha', fecha).limit(1)
      if (existing && existing.length > 0) {
        setShowMenuPicker(false)
        showToast('Ese menú ya está activo para este día')
        return
      }
      const rows = menu.preparaciones.map((p, i) => ({
        titulo: p.nombre,
        descripcion: menu.nombre,
        status: 'pendiente',
        estado: 'pendiente',
        prioridad: p.prioridad,
        categoria: 'produccion',
        modo: 'menu',                      // se ve en Producción → Menú
        seccion: p.paso || 'general',      // sección del menú (NOT NULL en tareas)
        plaza: p.plaza,
        asignado_a: p.usuario_asignado,
        receta_id: p.tipo === 'receta' ? p.ref_id : null,
        cantidad: p.cantidad,
        turno_fecha: fecha,
        menu_id: menu.id,
        orden: i,
        restaurante_id: RESTAURANTE_ID,
      }))
      const { error } = await supabase.from('tareas').insert(rows)
      if (error) throw error
      setShowMenuPicker(false)
      showToast(`Menú activado · ${rows.length} ${rows.length === 1 ? 'tarea' : 'tareas'} en Producción`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message
        : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
        : 'desconocido'
      showToast('Error: ' + msg)
    } finally {
      setCargandoMenu(false)
    }
  }

  // ── Tareas del menú activo para la fecha seleccionada (Planificación) ──
  const menuTareasDelDia = useMemo(
    () => tareas.filter(t => t.menu_id && t.turno_fecha === fecha && !t.parent_id),
    [tareas, fecha],
  )

  async function vaciarMenuDelDia() {
    const ids = menuTareasDelDia.map(t => t.id)
    if (ids.length === 0) return
    if (!confirm(`¿Vaciar el menú del día? Se eliminan ${ids.length} tareas.`)) return
    try { for (const id of ids) await eliminarTarea(id); showToast('Menú del día vaciado') }
    catch (e: unknown) { showToast('Error: ' + (e instanceof Error ? e.message : 'desconocido')) }
  }

  // ── Menu tags present in today's produccion ────────────────
  const menuTagsHoy = useMemo(() => {
    const tags = [...new Set(produccion.map(p => p.menu_tag ?? ''))]
    return tags.sort((a, b) => a === '' ? -1 : b === '' ? 1 : a.localeCompare(b))
  }, [produccion])

  const produccionFiltrada = useMemo(() => {
    if (menuTagsHoy.length <= 1) return produccion
    return produccion.filter(p => (p.menu_tag ?? '') === activeMenuTag)
  }, [produccion, menuTagsHoy, activeMenuTag])

  // ── Platos activados para esta fecha específica ──────────
  // Si hay producción activa: solo los platos con registros para hoy.
  // Si no hay producción aún (ej: creando el primer plato): muestra todos como preview.
  const platosActivos = useMemo(() => {
    if (produccion.length === 0) return platos
    const idsEnProduccion = new Set(
      produccion.map(p => p.plato_compuesto_id).filter(Boolean) as string[]
    )
    return platos.filter(p => idsEnProduccion.has(p.id))
  }, [platos, produccion])

  // ── Group platos by categoria ─────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, PlatoConComponentes[]>()
    for (const p of platosActivos) {
      const list = map.get(p.categoria) ?? []
      list.push(p)
      map.set(p.categoria, list)
    }
    const sorted: [string, PlatoConComponentes[]][] = []
    for (const cat of CATEGORIAS_PLATO) {
      if (map.has(cat)) sorted.push([cat, map.get(cat)!])
    }
    return sorted
  }, [platosActivos])

  // ── Produccion status map (filtered by active tag) ──────────
  const statusMap = useMemo(() => {
    const m = new Map<string, { id: string; status: StatusProduccion }>()
    for (const p of produccionFiltrada) {
      if (p.componente_id) m.set(p.componente_id, { id: p.id, status: p.status as StatusProduccion })
    }
    return m
  }, [produccionFiltrada])

  // ── Count shared components ───────────────────────────────
  const componentNameCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of platosActivos) {
      for (const c of p.componentes) {
        const key = c.nombre.toLowerCase().trim()
        m.set(key, (m.get(key) ?? 0) + 1)
      }
    }
    return m
  }, [platosActivos])

  // ── Summary stats ─────────────────────────────────────────
  const stats = useMemo(() => {
    const totalComps = platosActivos.reduce((s, p) => s + p.componentes.length, 0)
    let listos = 0, pendientes = 0, enProceso = 0
    for (const p of platosActivos) {
      for (const c of p.componentes) {
        const st = statusMap.get(c.id)?.status ?? 'pendiente'
        if (st === 'listo') listos++
        else if (st === 'en_proceso') enProceso++
        else pendientes++
      }
    }
    return { platos: platosActivos.length, totalComps, listos, pendientes, enProceso }
  }, [platosActivos, statusMap])

  // ── Cycle status ──────────────────────────────────────────
  async function cycleStatus(compId: string) {
    const entry = statusMap.get(compId)
    if (!entry) {
      // Need to init produccion first
      await initProduccion(fecha)
      return
    }
    const next: StatusProduccion =
      entry.status === 'pendiente' ? 'en_proceso'
        : entry.status === 'en_proceso' ? 'listo'
          : 'pendiente'
    try {
      await updateStatus(entry.id, next)
      // Optimistic update
      setProduccion(prev => prev.map(p =>
        p.id === entry.id ? { ...p, status: next } : p
      ))
    } catch (e: any) {
      showToast('Error: ' + e.message)
    }
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

  async function handleActivarDias() {
    setActivatingMulti(true)
    try {
      const tag = menuTagInput.trim() || null
      for (const d of diasSeleccionados) {
        await initProduccion(d, tag)
      }
      const n = diasSeleccionados.size
      const refreshed = await fetchFechasMes(mesActual)
      setFechasMes(refreshed)
      setDiasSeleccionados(new Set())
      setMultiSelectMode(false)
      setMenuTagModal(false)
      setMenuTagInput('')
      showToast(`${n} ${n === 1 ? 'día activado' : 'días activados'}`)
    } catch (e: unknown) {
      showToast('Error: ' + (e instanceof Error ? e.message : 'desconocido'))
    } finally {
      setActivatingMulti(false)
    }
  }

  if (loading) {
    return (
      <div style={{ background: 'var(--bg)', height: embedded ? '100%' : undefined, overflowY: embedded ? 'auto' : undefined }}>
        <div style={{ background: 'var(--navy)', padding: `${embedded ? 0 : 46}px 16px 14px` }}>
          <h1 className="text-lg font-bold text-white">Producción</h1>
        </div>
        <div className="flex items-center justify-center py-16">
          <span className="material-symbols-outlined animate-spin" style={{ fontSize: 28, color: 'var(--text-3)' }}>progress_activity</span>
        </div>
        <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}.animate-spin{animation:spin 1s linear infinite}`}</style>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg)', height: embedded ? '100%' : undefined, overflowY: embedded ? 'auto' : undefined }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: `${embedded ? 0 : 46}px 16px 14px` }}>
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
            {!multiSelectMode ? (
              <button
                onClick={() => setMultiSelectMode(true)}
                style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>event</span>
                Días
              </button>
            ) : (
              <button
                onClick={() => { setMultiSelectMode(false); setDiasSeleccionados(new Set()) }}
                style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
              >
                Cancelar
              </button>
            )}
            <button onClick={() => setShowMenuPicker(true)} style={{ background: '#fff', border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, color: 'var(--navy)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>menu_book</span>
              Activar menú
            </button>
            <button onClick={() => setView('crear')} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
              + Plato
            </button>
          </div>
        </div>

        {/* Date selector — only in normal mode */}
        {!multiSelectMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <button onClick={() => shiftDate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.6)', fontSize: 20 }}>chevron_left</span>
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', flex: 1 }}>{fmtDateLabel(new Date(fecha + 'T12:00:00'))}</span>
            <button onClick={() => shiftDate(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.6)', fontSize: 20 }}>chevron_right</span>
            </button>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              style={{ background: 'rgba(255,255,255,.1)', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11 }}
            />
          </div>
        )}

        {/* Monthly calendar — collapsible */}
        {platos.length > 0 && (
          <>
            <button
              onClick={() => setCalendarOpen(v => !v)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', marginTop: 10,
                background: 'rgba(255,255,255,.08)', borderRadius: 8,
                border: 'none', cursor: 'pointer', padding: '6px 10px',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.75)', textTransform: 'capitalize' }}>
                {fmtMesLabel(mesActual)} · {fmtDateLabel(new Date(fecha + 'T12:00:00'))}
              </span>
              <span className="material-symbols-outlined" style={{
                fontSize: 18, color: 'rgba(255,255,255,.55)',
                transform: calendarOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform .2s',
              }}>
                expand_more
              </span>
            </button>

            {calendarOpen && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
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
                  multiSelectMode={multiSelectMode}
                  diasSeleccionados={diasSeleccionados}
                  onSelectFecha={(f) => { setFecha(f); setView('planilla'); setCalendarOpen(false) }}
                  onToggleDia={(f) => setDiasSeleccionados(prev => {
                    const next = new Set(prev)
                    if (next.has(f)) next.delete(f)
                    else next.add(f)
                    return next
                  })}
                />
                {multiSelectMode && diasSeleccionados.size > 0 && (
                  <button
                    onClick={() => setMenuTagModal(true)}
                    style={{ width: '100%', marginTop: 10, padding: '10px', borderRadius: 10, border: 'none', background: '#22c55e', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Activar {diasSeleccionados.size} {diasSeleccionados.size === 1 ? 'día' : 'días'}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Menu tag filter */}
      {menuTagsHoy.length > 1 && view === 'planilla' && (
        <div style={{ padding: '8px 12px 0', display: 'flex', gap: 6, overflowX: 'auto' }}>
          {menuTagsHoy.map(tag => (
            <button
              key={tag}
              onClick={() => setActiveMenuTag(tag)}
              style={{
                flexShrink: 0, padding: '4px 12px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
                background: activeMenuTag === tag ? 'var(--navy)' : 'var(--surface)',
                color: activeMenuTag === tag ? '#fff' : 'var(--text-2)',
                border: `1px solid ${activeMenuTag === tag ? 'var(--navy)' : 'var(--border)'}`,
                fontSize: 11, fontWeight: 700,
              }}
            >
              {tag === '' ? 'Base' : tag}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div>
        {/* Vista del menú activo del día (Planificación) */}
        {view === 'planilla' && menuTareasDelDia.length > 0 && (
          <MenuActivoView tareas={menuTareasDelDia} miembros={miembros} onToggle={(id, listo) => cambiarEstado(id, listo ? 'listo' : 'pendiente')} onVaciar={vaciarMenuDelDia} onActivarOtro={() => setShowMenuPicker(true)} />
        )}

        {/* Planilla / estado vacío — solo si NO hay menú activo del día */}
        {(view === 'planilla' || view === 'crear' || view === 'editar') && !(view === 'planilla' && menuTareasDelDia.length > 0) && (
          produccion.length === 0 && view === 'planilla' ? (
            /* Sin producción para este día — ofrecer cargar un menú del catálogo */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-3)' }}>restaurant_menu</span>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', margin: 0, textAlign: 'center' }}>
                Sin menú cargado para este día
              </p>
              {catalogoMenus.length > 0 ? (
                <>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, textAlign: 'center' }}>
                    Tenés {catalogoMenus.length} {catalogoMenus.length === 1 ? 'menú' : 'menús'} en el catálogo. Activá uno para crear sus tareas en Producción → Menú.
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
            </div>
          ) : (
            <PlanillaView
              grouped={grouped}
              statusMap={statusMap}
              produccion={produccion}
              miembros={miembros}
              puedeDelegar={puedeDelegar}
              stats={stats}
              componentNameCount={componentNameCount}
              cycleStatus={cycleStatus}
              miseItems={miseItems}
              onEdit={(p) => { setEditingPlato(p); setView('editar') }}
              onCrear={(cat) => { setView('crear'); setEditingPlato({ id: '', nombre: '', categoria: cat, activo: true, restaurante_id: '', orden: 0, componentes: [], created_at: '' } as unknown as PlatoConComponentes) }}
              onIngredientes={() => setView('ingredientes')}
              onDuplicar={() => setView('duplicar')}
              openMerma={openMerma}
              router={router}
              restauranteId={RESTAURANTE_ID}
              fecha={fecha}
            />
          )
        )}
        {view === 'ingredientes' && (
          <IngredientesConsolidados
            platos={platos}
            statusMap={statusMap}
            fetchIngredientes={fetchIngredientesConsolidados}
            onClose={() => setView('planilla')}
          />
        )}
        {view === 'duplicar' && (
          <DuplicarView
            fecha={fecha}
            onDuplicar={async (toFecha) => {
              const n = await duplicarMenu(fecha, toFecha)
              showToast(`${n ?? 0} items copiados`)
              setView('planilla')
            }}
            onCancel={() => setView('planilla')}
          />
        )}
      </div>

      {/* ── PlatoForm como bottom sheet (sin overlay: planilla queda visible arriba) ── */}
      {(view === 'crear' || view === 'editar') && (
        <>
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
            background: 'var(--surface)', borderRadius: '20px 20px 0 0',
            maxHeight: '72dvh', overflowY: 'auto',
            maxWidth: 520, margin: '0 auto',
            boxShadow: '0 -4px 32px rgba(0,0,0,.18)',
            borderTop: '1px solid var(--border)',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '12px auto 0' }} />
            <PlatoForm
              plato={view === 'editar' ? editingPlato : null}
              categoriaInicial={view === 'crear' && editingPlato?.categoria ? editingPlato.categoria : undefined}
              restauranteId={RESTAURANTE_ID}
              onSave={async (data, comps) => {
                try {
                  if (view === 'editar' && editingPlato) {
                    await actualizarPlato(editingPlato.id, data, comps)
                  } else {
                    await crearPlato({ ...data, componentes: comps })
                    await agregarTarea({
                      titulo: data.nombre,
                      descripcion: comps.length > 0
                        ? `Preparar: ${comps.map((c: { nombre: string }) => c.nombre).join(', ')}`
                        : null,
                      status: 'pendiente',
                      prioridad: data.prioridad,
                      categoria: 'produccion',
                      plaza: null,
                      receta_id: null,
                    })
                  }
                  showToast('Guardado')
                  setEditingPlato(null)
                  setView('planilla')
                } catch (e: any) { showToast('Error: ' + e.message) }
              }}
              onDelete={view === 'editar' && editingPlato?.id ? async () => {
                try {
                  await eliminarPlato(editingPlato!.id)
                  showToast('Eliminado')
                  setEditingPlato(null)
                  setView('planilla')
                } catch (e: any) { showToast('Error: ' + e.message) }
              } : undefined}
              onCancel={() => { setEditingPlato(null); setView('planilla') }}
            />
          </div>
        </>
      )}

      <MermaBottomSheet
        open={mermaOpen}
        onClose={() => setMermaOpen(false)}
        onRegistrar={async (data) => {
          await registrarMerma(data)
          setMermaOpen(false)
          showToast('Merma registrada')
        }}
        prefill={mermaPrefill}
      />

      {/* ── Fase 2: selector de menú del catálogo (portal para escapar de overflow/transform/BottomNav) ── */}
      {showMenuPicker && typeof document !== 'undefined' && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowMenuPicker(false) }}
        >
          <div style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '18px 16px 12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Activar menú</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Crea las tareas en Producción → Menú</div>
              </div>
              <button onClick={() => setShowMenuPicker(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-3)' }}>close</span>
              </button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
              {catalogoMenus.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-3)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 40, opacity: .5 }}>menu_book</span>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>No hay menús en el catálogo</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>Armá uno en Carta → Menús</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {catalogoMenus.map(menu => (
                    <button key={menu.id} onClick={() => !cargandoMenu && activarMenu(menu)} disabled={cargandoMenu}
                      style={{ textAlign: 'left', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', cursor: cargandoMenu ? 'default' : 'pointer', fontFamily: 'inherit', opacity: cargandoMenu ? .6 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '.04em', background: menu.tipo === 'evento' ? '#ede9fe' : '#e0f2fe', color: menu.tipo === 'evento' ? '#6d28d9' : '#075985' }}>
                          {menu.tipo === 'evento' ? 'Evento' : 'Fijo'}
                        </span>
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{menu.nombre}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{menu.preparaciones.length} prep.</span>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>add_circle</span>
                      </div>
                      {menu.descripcion && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{menu.descripcion}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Menu tag modal */}
      {menuTagModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) setMenuTagModal(false) }}
        >
          <div style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '20px 16px 36px', width: '100%', maxWidth: 480 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>
              Activar {diasSeleccionados.size} {diasSeleccionados.size === 1 ? 'día' : 'días'}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 12px' }}>
              Nombre del menú (opcional). Ej: "Menú ejecutivo semana 22", "Evento boda".
            </p>
            <input
              autoFocus
              value={menuTagInput}
              onChange={e => setMenuTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleActivarDias() }}
              placeholder="Menú ejecutivo semana 22"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                onClick={() => setMenuTagInput('Menú ejecutivo')}
                style={{ padding: '4px 10px', borderRadius: 99, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Menu ejecutivo
              </button>
              <button
                onClick={() => setMenuTagInput('Evento')}
                style={{ padding: '4px 10px', borderRadius: 99, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Evento
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => setMenuTagModal(false)}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, fontWeight: 600, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleActivarDias}
                disabled={activatingMulti}
                style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none', background: 'var(--navy)', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: activatingMulti ? 0.6 : 1 }}
              >
                {activatingMulti ? 'Activando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[999] px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: toast.startsWith('Error') ? '#ef4444' : '#22c55e' }}>
          {toast}
        </div>
      )}

      {error && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[999] px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-500">
          {error}
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}.animate-spin{animation:spin 1s linear infinite}`}</style>
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
  const today = fmtDate(new Date())
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
          const hasBase = tags.length > 0
          const hasEvent = tags.some(t => t !== '')
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
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,.4)' }}>Activo</span>
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
// RUTINAS DEL DÍA — sección colapsable para ProduccionPage
// ══════════════════════════════════════════════════════════════
function RutinasDia({ restauranteId, fecha }: { restauranteId: string; fecha: string }) {
  const [rutinas, setRutinas] = useState<{ id: string; nombre: string; plaza: string; dias_semana: number[] | null }[]>([])
  const [registros, setRegistros] = useState<Set<string>>(new Set())
  const [loadingRutinas, setLoadingRutinas] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [supabase] = useState(() => createClient())

  useEffect(() => {
    if (!restauranteId) return
    async function load() {
      setLoadingRutinas(true)
      const { data: rutData } = await supabase
        .from('checklist_rutina')
        .select('id, nombre, plaza, dias_semana')
        .eq('restaurante_id', restauranteId)
        .order('orden', { ascending: true })
      const { data: regData } = await supabase
        .from('checklist_rutina_registros')
        .select('rutina_id, completado')
        .eq('fecha', fecha)
        .in('rutina_id', (rutData ?? []).map((r: { id: string }) => r.id).length > 0
          ? (rutData ?? []).map((r: { id: string }) => r.id)
          : ['00000000-0000-0000-0000-000000000000'])
      const completados = new Set<string>()
      for (const r of (regData ?? []) as { rutina_id: string; completado: boolean }[]) {
        if (r.completado) completados.add(r.rutina_id)
      }
      setRutinas((rutData ?? []) as { id: string; nombre: string; plaza: string; dias_semana: number[] | null }[])
      setRegistros(completados)
      setLoadingRutinas(false)
    }
    load()
  }, [restauranteId, fecha, supabase])

  // Filtrar las que aplican hoy
  const hoyIso = (() => {
    const d = new Date(fecha + 'T12:00:00')
    // getDay() → 0=domingo, ajustar a ISO: 1=lunes..7=domingo
    const dow = d.getDay()
    return dow === 0 ? 7 : dow
  })()

  const rutinasHoy = rutinas.filter(r =>
    r.dias_semana === null || r.dias_semana.includes(hoyIso)
  )

  if (loadingRutinas) return null
  if (rutinasHoy.length === 0) return null

  const completadas = rutinasHoy.filter(r => registros.has(r.id)).length
  const total = rutinasHoy.length

  async function handleToggle(rutinaId: string, currentDone: boolean) {
    const nuevoEstado = !currentDone
    if (nuevoEstado) {
      await supabase.from('checklist_rutina_registros').upsert(
        { rutina_id: rutinaId, fecha, completado: true },
        { onConflict: 'rutina_id,fecha' }
      )
      await supabase.from('checklist_rutina').update({ ultima_vez: new Date().toISOString() }).eq('id', rutinaId)
      setRegistros(prev => new Set([...prev, rutinaId]))
    } else {
      await supabase.from('checklist_rutina_registros').delete()
        .eq('rutina_id', rutinaId).eq('fecha', fecha)
      setRegistros(prev => { const s = new Set(prev); s.delete(rutinaId); return s })
    }
  }

  return (
    <div style={{ margin: '0 12px 16px', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface)' }}>
      {/* Header colapsable */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: 'none', border: 'none',
          cursor: 'pointer', fontFamily: 'inherit',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: completadas === total ? '#22c55e' : 'var(--accent)', flexShrink: 0 }}>checklist</span>
        <span style={{ flex: 1, textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Rutinas del día
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, fontFamily: "'DM Mono', monospace",
          color: completadas === total ? '#22c55e' : 'var(--text-3)',
        }}>{completadas}/{total}</span>
        <span className="material-symbols-outlined" style={{
          fontSize: 18, color: 'var(--text-3)', transition: 'transform .15s',
          transform: collapsed ? 'rotate(-90deg)' : 'none',
        }}>expand_more</span>
      </button>

      {/* Barra de progreso */}
      <div style={{ height: 2, background: 'var(--border)' }}>
        <div style={{ width: `${total > 0 ? (completadas / total) * 100 : 0}%`, height: '100%', background: '#22c55e', transition: 'width .3s' }} />
      </div>

      {!collapsed && (
        <div style={{ padding: '4px 10px 10px' }}>
          {rutinasHoy.map(r => {
            const done = registros.has(r.id)
            return (
              <div
                key={r.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 4px',
                  borderBottom: '1px solid var(--border)',
                  opacity: done ? 0.65 : 1,
                  transition: 'opacity .2s',
                }}
              >
                <button
                  onClick={() => handleToggle(r.id, done)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center' }}
                >
                  <span className="material-symbols-outlined" style={{
                    fontSize: 22, color: done ? '#22c55e' : 'var(--border)', transition: 'color .15s',
                  }}>{done ? 'check_circle' : 'radio_button_unchecked'}</span>
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', textDecoration: done ? 'line-through' : 'none' }}>
                    {r.nombre}
                  </span>
                  {r.plaza && (
                    <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-3)', fontWeight: 500 }}>
                      {r.plaza}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// PLANILLA VIEW
// ══════════════════════════════════════════════════════════════
const CAT_COLORS: Record<string, string> = {
  'Tapa': '#0ea5e9', 'Appetizer': '#0ea5e9',
  'Entrada': '#8b5cf6',
  'Principal': '#ef4444', 'Proteína': '#ef4444',
  'Pasta': '#f97316',
  'Guarnición': '#22c55e',
  'Postre': '#ec4899',
}

function PlanillaView({
  grouped, statusMap, produccion, miembros, puedeDelegar, stats, componentNameCount, cycleStatus, miseItems, onEdit, onCrear, onIngredientes, onDuplicar, openMerma, router, restauranteId, fecha,
}: {
  grouped: [string, PlatoConComponentes[]][]
  statusMap: Map<string, { id: string; status: StatusProduccion }>
  produccion: { id: string; componente_id?: string | null; usuario_asignado?: string | null }[]
  miembros: { id: string; nombre: string; apellido: string }[]
  puedeDelegar: boolean
  stats: { platos: number; totalComps: number; listos: number; pendientes: number; enProceso: number }
  componentNameCount: Map<string, number>
  cycleStatus: (compId: string) => void
  miseItems: { nombre: string; plaza: string }[]
  onEdit: (p: PlatoConComponentes) => void
  onCrear: (categoria: string) => void
  onIngredientes: () => void
  onDuplicar: () => void
  openMerma: (nombre: string) => void
  router: ReturnType<typeof useRouter>
  restauranteId: string
  fecha: string
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggleCollapse = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  // Build assignment map: componente_id -> member name
  const assignMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of produccion) {
      if (p.componente_id && p.usuario_asignado) {
        const member = miembros.find(mb => mb.id === p.usuario_asignado)
        if (member) m.set(p.componente_id, `${member.nombre} ${member.apellido?.[0] ?? ''}`.trim())
      }
    }
    return m
  }, [produccion, miembros])
  if (grouped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6">
        <span className="material-symbols-outlined" style={{ fontSize: 56, color: 'var(--text-3)' }}>restaurant_menu</span>
        <p className="text-sm font-semibold mt-3" style={{ color: 'var(--text-2)' }}>Sin platos cargados</p>
        <p className="text-xs mt-1 text-center" style={{ color: 'var(--text-3)' }}>
          Agrega platos compuestos con sus componentes para planificar la produccion del dia
        </p>
      </div>
    )
  }

  const pct = stats.totalComps > 0 ? Math.round((stats.listos / stats.totalComps) * 100) : 0

  return (
    <div style={{ padding: '10px 0 120px' }}>
      {/* Summary card */}
      <div style={{ margin: '0 12px 8px', padding: '10px 12px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
          <span>{stats.platos} platos · {stats.totalComps} componentes</span>
          <span>{stats.listos} listos · {stats.enProceso} en proceso · {stats.pendientes} pendientes</span>
        </div>
        <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#3b82f6' }} />
        </div>
        <div className="flex gap-2 mt-2">
          <button onClick={onIngredientes} className="flex-1 text-[10px] font-bold py-1 rounded-lg cursor-pointer"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--navy)' }}>
            Ver ingredientes
          </button>
          <button onClick={onDuplicar} className="flex-1 text-[10px] font-bold py-1 rounded-lg cursor-pointer"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--navy)' }}>
            Copiar a otro dia
          </button>
        </div>
      </div>

      {/* Planilla */}
      {/* Rutinas del día */}
      {restauranteId && <RutinasDia restauranteId={restauranteId} fecha={fecha} />}

      {grouped.map(([cat, platosInCat]) => {
        const totalCompsInCat = platosInCat.reduce((s, p) => s + p.componentes.length, 0)
        const listosInCat = platosInCat.reduce((s, p) => s + p.componentes.filter(c => statusMap.get(c.id)?.status === 'listo').length, 0)
        const isCollapsed = collapsed[cat] ?? false
        const catColor = CAT_COLORS[cat] ?? '#94a3b8'
        const catPct = totalCompsInCat > 0 ? listosInCat / totalCompsInCat : 0
        return (
        <div key={cat} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', margin: '0 12px 8px' }}>
          {/* Category header — SeccionOps style */}
          <button onClick={() => toggleCollapse(cat)} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', background: 'none', border: 'none',
            cursor: 'pointer', fontFamily: 'inherit',
            WebkitTapHighlightColor: 'transparent',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: catColor, flexShrink: 0 }} />
            <span style={{ flex: 1, textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{cat}</span>
            <span style={{
              fontSize: 11, fontWeight: 700, fontFamily: "'DM Mono', monospace",
              color: listosInCat === totalCompsInCat && totalCompsInCat > 0 ? '#22c55e' : 'var(--text-3)',
            }}>{listosInCat}/{totalCompsInCat}</span>
            <span className="material-symbols-outlined" style={{
              fontSize: 18, color: 'var(--text-3)', transition: 'transform .15s',
              transform: isCollapsed ? 'rotate(-90deg)' : 'none',
            }}>expand_more</span>
          </button>

          {/* Progress bar */}
          <div style={{ height: 2, background: 'var(--border)' }}>
            <div style={{ width: `${catPct * 100}%`, height: '100%', background: catColor, transition: 'width .3s' }} />
          </div>

          {!isCollapsed && <div style={{ padding: '4px 8px 8px' }}>
            {platosInCat.map((plato) => (
            <div key={plato.id} style={{ marginBottom: 6, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
              {/* Plato header */}
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--surface)', cursor: 'pointer' }}
                onClick={() => onEdit(plato)}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{plato.nombre}</span>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>edit</span>
              </div>

              {/* Componentes */}
              {plato.componentes.map(comp => {
                const entry = statusMap.get(comp.id)
                const status: StatusProduccion = entry?.status ?? 'pendiente'
                const colors = STATUS_COLORS[status]
                const nameKey = comp.nombre.toLowerCase().trim()
                const shared = (componentNameCount.get(nameKey) ?? 1) > 1
                const compPlaza = (comp as any).plaza as string | null
                const miseMatch = miseItems.find(m => m.nombre === nameKey)

                return (
                  <div
                    key={comp.id}
                    className="flex items-center gap-2 px-3 py-2 transition-colors"
                    style={{ background: colors.bg, borderTop: `1px solid ${colors.border}` }}
                  >
                    {/* Status toggle */}
                    <button
                      onClick={() => cycleStatus(comp.id)}
                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center border-none cursor-pointer"
                      style={{
                        background: status === 'listo' ? '#22c55e' : status === 'en_proceso' ? '#3b82f6' : 'var(--border)',
                      }}
                    >
                      {status === 'listo' && <span className="material-symbols-outlined text-white" style={{ fontSize: 16 }}>check</span>}
                      {status === 'en_proceso' && <span className="material-symbols-outlined text-white" style={{ fontSize: 14 }}>more_horiz</span>}
                    </button>

                    {/* Priority indicator */}
                    <span className="text-[9px] font-bold flex-shrink-0" style={{
                      color: comp.orden === 0 ? '#ef4444' : comp.orden === 1 ? '#f59e0b' : 'var(--text-3)',
                    }}>
                      {comp.orden === 0 ? 'P1' : comp.orden === 1 ? 'P2' : `P${comp.orden + 1}`}
                    </span>

                    {/* Component info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span
                          className="text-xs font-semibold truncate"
                          style={{ color: status === 'listo' ? '#15803d' : 'var(--text-1)', opacity: status === 'listo' ? 0.7 : 1 }}
                        >
                          {comp.nombre}
                        </span>
                        {shared && (
                          <span className="text-[9px] font-bold px-1 rounded"
                            style={{ background: '#fef3c7', color: '#92400e' }}>
                            x{componentNameCount.get(nameKey)}
                          </span>
                        )}
                        {/* Plaza badge */}
                        {compPlaza && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99,
                            background: 'rgba(67,97,160,.1)', color: 'var(--accent)', textTransform: 'capitalize', flexShrink: 0,
                          }}>
                            {compPlaza}
                          </span>
                        )}
                        {/* Mise indicator */}
                        {miseMatch ? (
                          <span title={`En mise · ${miseMatch.plaza}`} style={{
                            width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0, display: 'inline-block',
                          }} />
                        ) : (
                          <span title="No está en mise" style={{
                            width: 7, height: 7, borderRadius: '50%', background: 'var(--border)', flexShrink: 0, display: 'inline-block',
                          }} />
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {comp.notas_produccion && (
                          <span className="text-[10px] truncate" style={{ color: 'var(--text-3)' }}>
                            {comp.notas_produccion}
                          </span>
                        )}
                        {assignMap.get(comp.id) && (
                          <span className="text-[9px] font-bold px-[5px] py-[1px] rounded-[4px] flex-shrink-0"
                            style={{ background: 'rgba(67,97,160,.1)', color: '#4361a0' }}>
                            {assignMap.get(comp.id)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Recipe link */}
                    {comp.receta_id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/recetario/${comp.receta_id}`) }}
                        className="flex-shrink-0 bg-transparent border-none cursor-pointer p-0"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#4361a0' }}>menu_book</span>
                      </button>
                    )}

                    {/* Merma button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); openMerma(comp.nombre) }}
                      className="flex-shrink-0 bg-transparent border-none cursor-pointer p-0"
                      title="Registrar merma"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>delete_sweep</span>
                    </button>
                  </div>
                )
              })}

              {plato.componentes.length === 0 && (
                <div style={{ padding: '10px 12px', fontSize: 12, fontStyle: 'italic', color: 'var(--text-3)' }}>
                  Sin componentes — toca para agregar
                </div>
              )}
            </div>
          ))}
            {/* Botón + para agregar plato a esta sección */}
            <button
              onClick={() => onCrear(cat)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 4px',
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginTop: 4,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>add</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Agregar a {cat}</span>
            </button>
          </div>}
        </div>
      )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// PLATO FORM (crear / editar)
// ══════════════════════════════════════════════════════════════
interface CompForm { nombre: string; receta_id: string | null; notas_produccion: string; plaza: string; orden: number }

const PLAZAS = ['parrilla', 'fríos', 'calientes', 'pase', 'pastelería', 'otro']

function PlatoForm({
  plato, restauranteId, categoriaInicial, onSave, onDelete, onCancel,
}: {
  plato: PlatoConComponentes | null
  restauranteId: string
  categoriaInicial?: string
  onSave: (data: { nombre: string; categoria: CategoriaPlato; descripcion?: string; prioridad: 'critica' | 'alta' | 'media' | 'baja' }, comps: CompForm[]) => void
  onDelete?: () => void
  onCancel: () => void
}) {
  const [nombre, setNombre] = useState(plato?.nombre ?? '')
  const [categoria, setCategoria] = useState<CategoriaPlato>((plato?.categoria as CategoriaPlato) ?? (categoriaInicial as CategoriaPlato) ?? 'Principal')
  const [descripcion, setDescripcion] = useState(plato?.descripcion ?? '')
  const [prioridad, setPrioridad] = useState<'critica' | 'alta' | 'media' | 'baja'>('media')
  const [comps, setComps] = useState<CompForm[]>(
    plato?.componentes.map((c, i) => ({
      nombre: c.nombre,
      receta_id: c.receta_id ?? null,
      notas_produccion: c.notas_produccion ?? '',
      plaza: (c as any).plaza ?? '',
      orden: i,
    })) ?? [{ nombre: '', receta_id: null, notas_produccion: '', plaza: '', orden: 0 }]
  )
  const [plazaPickerIdx, setPlazaPickerIdx] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [recetas, setRecetas] = useState<{ id: string; nombre: string }[]>([])
  const [supabase] = useState(() => createClient())
  const [recetaSearch, setRecetaSearch] = useState('')
  const [showRecetas, setShowRecetas] = useState(false)
  const [editingNotasIdx, setEditingNotasIdx] = useState<number | null>(null)

  // Load recetas for autocomplete
  useEffect(() => {
    if (!restauranteId) return
    supabase
      .from('recetas')
      .select('id, nombre')
      .eq('restaurante_id', restauranteId)
      .eq('activa', true)
      .order('nombre')
      .then(({ data }) => setRecetas(data ?? []))
  }, [restauranteId, supabase])

  function addCompManual() {
    setComps([...comps, { nombre: '', receta_id: null, notas_produccion: '', plaza: '', orden: comps.length }])
    setEditingNotasIdx(comps.length)
  }

  function updateComp(idx: number, field: keyof CompForm, value: string | null) {
    setComps(comps.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }

  function removeComp(idx: number) {
    setComps(comps.filter((_, i) => i !== idx))
    setEditingNotasIdx(null)
  }

  // Agregar receta directamente como componente desde el search
  function addRecetaAsComp(receta: { id: string; nombre: string }) {
    // Evitar duplicados
    if (comps.some(c => c.receta_id === receta.id)) {
      setRecetaSearch('')
      setShowRecetas(false)
      return
    }
    // Si hay un componente vacío al final, reemplazarlo
    const lastEmpty = comps.length > 0 && !comps[comps.length - 1].nombre.trim() && !comps[comps.length - 1].receta_id
    if (lastEmpty) {
      setComps(comps.map((c, i) =>
        i === comps.length - 1 ? { ...c, nombre: receta.nombre, receta_id: receta.id } : c
      ))
    } else {
      setComps([...comps, { nombre: receta.nombre, receta_id: receta.id, notas_produccion: '', plaza: '', orden: comps.length }])
    }
    setRecetaSearch('')
    setShowRecetas(false)
  }

  // Recetas filtradas para el search (excluye ya agregadas)
  const recetasFiltradas = recetas
    .filter(r => !comps.some(c => c.receta_id === r.id))
    .filter(r => !recetaSearch.trim() || r.nombre.toLowerCase().includes(recetaSearch.toLowerCase()))
    .slice(0, 10)

  async function handleSave() {
    if (!nombre.trim()) return
    const validComps = comps.filter(c => c.nombre.trim())
    setSaving(true)
    await onSave({ nombre, categoria, descripcion: descripcion || undefined, prioridad }, validComps)
    setSaving(false)
  }

  const fieldStyle = { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold" style={{ color: 'var(--navy)' }}>
          {plato ? 'Editar plato' : 'Nuevo plato'}
        </h2>
        <button onClick={onCancel} className="bg-transparent border-none cursor-pointer">
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-3)' }}>close</span>
        </button>
      </div>

      {/* Nombre */}
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Nombre del plato</label>
        <input
          value={nombre} onChange={e => setNombre(e.target.value)}
          placeholder="Ej: Ensaladilla rusa"
          className="w-full mt-1 rounded-lg px-3 py-2 text-sm" style={fieldStyle}
        />
      </div>

      {/* Categoria */}
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Categoria</label>
        <div className="flex flex-wrap gap-1 mt-1">
          {CATEGORIAS_PLATO.map(c => (
            <button
              key={c} onClick={() => setCategoria(c)}
              className="px-2 py-1 rounded-full text-[10px] font-semibold cursor-pointer"
              style={{
                background: categoria === c ? 'var(--navy)' : 'var(--surface)',
                color: categoria === c ? '#fff' : 'var(--text-2)',
                border: `1px solid ${categoria === c ? 'var(--navy)' : 'var(--border)'}`,
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Descripcion */}
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Descripción (opcional)</label>
        <input
          value={descripcion} onChange={e => setDescripcion(e.target.value)}
          placeholder="Breve descripción"
          className="w-full mt-1 rounded-lg px-3 py-2 text-sm" style={fieldStyle}
        />
      </div>

      {/* Prioridad — solo al crear, usando el mismo sistema que en Producción */}
      {!plato && (
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Prioridad en Producción</label>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {([
              { id: 'critica' as const, label: 'SP',    sublabel: 'Super Prior.',  color: '#ef4444', bg: '#fef2f2' },
              { id: 'alta'   as const, label: 'P',     sublabel: 'Prioridad',     color: '#f97316', bg: '#fff7ed' },
              { id: 'media'  as const, label: 'REF',   sublabel: 'Refuerzo',      color: '#3b82f6', bg: '#eff6ff' },
              { id: 'baja'   as const, label: 'Check', sublabel: 'Check',         color: '#64748b', bg: '#f8fafc' },
            ]).map(p => (
              <button
                key={p.id}
                onClick={() => setPrioridad(p.id)}
                style={{
                  flex: 1, padding: '7px 4px', borderRadius: 8,
                  border: `1.5px solid ${prioridad === p.id ? p.color : 'var(--border)'}`,
                  background: prioridad === p.id ? p.bg : 'var(--surface)',
                  color: prioridad === p.id ? p.color : 'var(--text-3)',
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 800 }}>{p.label}</span>
                <span style={{ fontSize: 8, fontWeight: 500, opacity: .8 }}>{p.sublabel}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Componentes */}
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
          Componentes ({comps.filter(c => c.nombre.trim() || c.receta_id).length})
        </label>

        {/* Lista compacta de componentes ya agregados */}
        {comps.filter(c => c.nombre.trim() || c.receta_id).length > 0 && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, overflow: 'hidden', marginTop: 8, marginBottom: 8,
          }}>
            {comps.map((comp, idx) => {
              const isEmpty = !comp.nombre.trim() && !comp.receta_id
              if (isEmpty && editingNotasIdx !== idx) return null
              const isLinked = !!comp.receta_id
              const isEditing = editingNotasIdx === idx
              return (
                <div key={idx} style={{
                  borderBottom: idx < comps.length - 1 ? '1px solid var(--border)' : 'none',
                  background: isEditing ? 'var(--bg)' : 'transparent',
                }}>
                  {/* Fila principal */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
                    <span className="material-symbols-outlined" style={{
                      fontSize: 16, color: isLinked ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0,
                    }}>
                      {isLinked ? 'menu_book' : 'edit_note'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isEditing || !isLinked ? (
                        <input
                          value={comp.nombre}
                          onChange={e => updateComp(idx, 'nombre', e.target.value)}
                          placeholder="Nombre del componente"
                          autoFocus={isEditing && isEmpty}
                          style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', outline: 'none', padding: 0 }}
                        />
                      ) : (
                        <div style={{
                          fontSize: 13, fontWeight: 600, color: 'var(--text-1)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {comp.nombre}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                        {comp.notas_produccion && !isEditing && (
                          <span style={{ fontSize: 10, color: 'var(--text-3)', fontStyle: 'italic' }}>
                            {comp.notas_produccion}
                          </span>
                        )}
                        {comp.plaza && !isEditing && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99,
                            background: 'rgba(67,97,160,.1)', color: 'var(--accent)', textTransform: 'capitalize',
                          }}>
                            {comp.plaza}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setEditingNotasIdx(isEditing ? null : idx)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-3)' }}
                      title={isEditing ? 'Cerrar' : 'Notas y plaza'}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        {isEditing ? 'expand_less' : 'tune'}
                      </span>
                    </button>
                    <button
                      onClick={() => removeComp(idx)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                    </button>
                  </div>

                  {/* Expandible: notas + plaza */}
                  {isEditing && (
                    <div style={{ padding: '0 12px 10px 36px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input
                        value={comp.notas_produccion}
                        onChange={e => updateComp(idx, 'notas_produccion', e.target.value)}
                        placeholder="Notas de producción (ej: Asar y desmenuzar)"
                        style={{
                          width: '100%', padding: '6px 10px', borderRadius: 8,
                          border: '1px solid var(--border)', background: 'var(--bg)',
                          fontSize: 12, color: 'var(--text-1)',
                        }}
                      />
                      {/* Plaza selector */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Mise:</span>
                        {PLAZAS.map(pz => (
                          <button
                            key={pz}
                            onClick={() => updateComp(idx, 'plaza', comp.plaza === pz ? '' : pz)}
                            style={{
                              padding: '3px 8px', borderRadius: 99, border: `1px solid ${comp.plaza === pz ? 'var(--accent)' : 'var(--border)'}`,
                              background: comp.plaza === pz ? 'rgba(67,97,160,.12)' : 'var(--surface)',
                              color: comp.plaza === pz ? 'var(--accent)' : 'var(--text-3)',
                              fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                            }}
                          >
                            {pz}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Search autocomplete de recetas */}
        <div style={{ position: 'relative' }}>
          <input
            value={recetaSearch}
            onChange={e => { setRecetaSearch(e.target.value); setShowRecetas(true) }}
            onFocus={() => setShowRecetas(true)}
            onBlur={() => setTimeout(() => setShowRecetas(false), 150)}
            placeholder="Buscar y agregar receta..."
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface)',
              fontSize: 13, color: 'var(--text-1)',
            }}
          />
          {showRecetas && recetasFiltradas.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, marginTop: 4, maxHeight: 240, overflowY: 'auto',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}>
              {recetasFiltradas.map(r => (
                <button
                  key={r.id}
                  onMouseDown={e => { e.preventDefault(); addRecetaAsComp(r) }}
                  style={{
                    display: 'block', width: '100%', padding: '10px 12px',
                    textAlign: 'left', border: 'none', background: 'none',
                    fontSize: 13, color: 'var(--text-1)', cursor: 'pointer',
                    borderBottom: '1px solid var(--border)', fontFamily: 'inherit',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{r.nombre}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Agregar componente manual (sin receta) */}
        <button onClick={addCompManual} className="mt-2 w-full rounded-lg py-2 text-xs font-semibold cursor-pointer"
          style={{ border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-2)' }}>
          + Componente sin receta
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-2">
        {onDelete && (
          <button onClick={onDelete} className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}>
            Eliminar
          </button>
        )}
        <button onClick={onCancel} className="flex-1 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
          style={{ background: 'var(--surface)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
          Cancelar
        </button>
        <button onClick={handleSave} disabled={saving || !nombre.trim()}
          className="flex-1 px-4 py-2 rounded-lg text-xs font-semibold text-white cursor-pointer"
          style={{ background: 'var(--navy)', opacity: saving || !nombre.trim() ? 0.5 : 1 }}>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// INGREDIENTES CONSOLIDADOS
// ══════════════════════════════════════════════════════════════
function IngredientesConsolidados({
  platos, statusMap, fetchIngredientes, onClose,
}: {
  platos: PlatoConComponentes[]
  statusMap: Map<string, { id: string; status: StatusProduccion }>
  fetchIngredientes: (ids: string[]) => Promise<{ receta_id: string; nombre: string; cantidad: number; unidad: string }[]>
  onClose: () => void
}) {
  const [ingredients, setIngredients] = useState<{
    nombre: string; total: number; unidad: string; sources: string[]
  }[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // Collect all receta_ids from componentes
      const recetaMap = new Map<string, string>() // receta_id → plato.componente name
      for (const p of platos) {
        for (const c of p.componentes) {
          if (c.receta_id) {
            recetaMap.set(c.receta_id, c.nombre)
          }
        }
      }

      const recetaIds = [...recetaMap.keys()]
      if (recetaIds.length === 0) { setLoading(false); return }

      const data = await fetchIngredientes(recetaIds)

      // Consolidate by ingredient name + unidad
      const consolidated = new Map<string, { nombre: string; total: number; unidad: string; sources: string[] }>()
      for (const ing of data) {
        const key = `${ing.nombre.toLowerCase().trim()}|${ing.unidad}`
        const existing = consolidated.get(key)
        const source = recetaMap.get(ing.receta_id) ?? 'receta'
        if (existing) {
          existing.total += ing.cantidad
          if (!existing.sources.includes(source)) existing.sources.push(source)
        } else {
          consolidated.set(key, {
            nombre: ing.nombre,
            total: ing.cantidad,
            unidad: ing.unidad,
            sources: [source],
          })
        }
      }

      setIngredients([...consolidated.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setLoading(false)
    }
    load()
  }, [platos, fetchIngredientes])

  function toggleCheck(name: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold" style={{ color: 'var(--navy)' }}>Ingredientes consolidados</h2>
        <button onClick={onClose} className="bg-transparent border-none cursor-pointer">
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-3)' }}>close</span>
        </button>
      </div>
      <p className="text-[10px] mb-3" style={{ color: 'var(--text-3)' }}>
        Suma de ingredientes de todas las recetas vinculadas
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <span className="material-symbols-outlined animate-spin" style={{ fontSize: 24, color: 'var(--text-3)' }}>progress_activity</span>
        </div>
      ) : ingredients.length === 0 ? (
        <p className="text-xs py-8 text-center" style={{ color: 'var(--text-3)' }}>
          No hay recetas vinculadas a los componentes
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {ingredients.map(ing => (
            <div
              key={`${ing.nombre}|${ing.unidad}`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer"
              style={{
                background: checked.has(ing.nombre) ? '#dcfce7' : 'var(--surface)',
                border: `1px solid ${checked.has(ing.nombre) ? '#86efac' : 'var(--border)'}`,
                opacity: checked.has(ing.nombre) ? 0.6 : 1,
              }}
              onClick={() => toggleCheck(ing.nombre)}
            >
              <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                style={{ background: checked.has(ing.nombre) ? '#22c55e' : 'var(--border)' }}>
                {checked.has(ing.nombre) && (
                  <span className="material-symbols-outlined text-white" style={{ fontSize: 14 }}>check</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
                  {ing.nombre}: {ing.total % 1 === 0 ? ing.total : ing.total.toFixed(2)} {ing.unidad}
                </span>
                <span className="text-[9px] ml-1" style={{ color: 'var(--text-3)' }}>
                  ({ing.sources.join(' + ')})
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// DUPLICAR VIEW
// ══════════════════════════════════════════════════════════════
function DuplicarView({
  fecha, onDuplicar, onCancel,
}: {
  fecha: string
  onDuplicar: (toFecha: string) => void
  onCancel: () => void
}) {
  const [targetFecha, setTargetFecha] = useState(() => {
    const d = new Date(fecha + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    return fmtDate(d)
  })

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold" style={{ color: 'var(--navy)' }}>Copiar menu</h2>
        <button onClick={onCancel} className="bg-transparent border-none cursor-pointer">
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-3)' }}>close</span>
        </button>
      </div>

      <p className="text-xs" style={{ color: 'var(--text-2)' }}>
        Copia la produccion de <strong>{fecha}</strong> a otra fecha. Los estados se resetean a pendiente.
      </p>

      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Fecha destino</label>
        <input
          type="date"
          value={targetFecha}
          onChange={e => setTargetFecha(e.target.value)}
          className="w-full mt-1 rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
        />
      </div>

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
          style={{ background: 'var(--surface)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
          Cancelar
        </button>
        <button onClick={() => onDuplicar(targetFecha)}
          className="flex-1 px-4 py-2 rounded-lg text-xs font-semibold text-white cursor-pointer"
          style={{ background: 'var(--navy)' }}>
          Copiar
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MENU ACTIVO VIEW — vista estilo Mise del menú activo del día (Planificación)
// ══════════════════════════════════════════════════════════════
const PRIO_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  critica: { label: 'SP', color: '#ef4444', bg: '#fef2f2' },
  alta: { label: 'P', color: '#f97316', bg: '#fff7ed' },
  media: { label: 'REF', color: '#3b82f6', bg: '#eff6ff' },
  baja: { label: 'Check', color: '#64748b', bg: '#f8fafc' },
}

function MenuActivoView({
  tareas, miembros, onToggle, onVaciar, onActivarOtro,
}: {
  tareas: Tarea[]
  miembros: { id: string; nombre: string; apellido: string }[]
  onToggle: (id: string, listo: boolean) => void
  onVaciar: () => void
  onActivarOtro: () => void
}) {
  const grouped = useMemo(() => {
    const m = new Map<string, Tarea[]>()
    for (const t of tareas) {
      const sec = (t.seccion ?? '').trim() || 'General'
      const list = m.get(sec) ?? []
      list.push(t)
      m.set(sec, list)
    }
    return [...m.entries()]
  }, [tareas])

  const listos = tareas.filter(t => t.estado === 'listo').length
  const total = tareas.length
  const pct = total > 0 ? Math.round((listos / total) * 100) : 0

  return (
    <div style={{ padding: '10px 12px 120px' }}>
      {/* Resumen + acciones */}
      <div style={{ margin: '0 2px 10px', padding: '10px 12px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>Menú activo · {listos}/{total} listas</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onActivarOtro} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit' }}>+ Otro</button>
            <button onClick={onVaciar} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>Vaciar</button>
          </div>
        </div>
        <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#22c55e' : '#3b82f6', transition: 'width .3s' }} />
        </div>
      </div>

      {/* Secciones del menú */}
      {grouped.map(([sec, items]) => {
        const listosSec = items.filter(t => t.estado === 'listo').length
        return (
          <div key={sec} style={{ margin: '0 2px 10px', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{sec}</span>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: listosSec === items.length ? '#22c55e' : 'var(--text-3)' }}>{listosSec}/{items.length}</span>
            </div>
            <div style={{ padding: '6px 8px 8px' }}>
              {items.map(t => {
                const listo = t.estado === 'listo'
                const badge = PRIO_BADGE[t.prioridad ?? 'media'] ?? PRIO_BADGE.media
                const miembro = miembros.find(m => m.id === t.asignado_a)
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    <button onClick={() => onToggle(t.id, !listo)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, display: 'flex' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 24, color: listo ? '#22c55e' : 'var(--border)' }}>{listo ? 'check_circle' : 'radio_button_unchecked'}</span>
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: listo ? '#15803d' : 'var(--text-1)', textDecoration: listo ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.titulo}</div>
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
