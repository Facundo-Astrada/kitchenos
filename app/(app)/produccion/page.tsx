'use client'

import { useState, useEffect, useMemo } from 'react'
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
  const { menus: catalogoMenus } = useMenus()
  const { miembros } = useEquipo()

  const [showMenuPicker, setShowMenuPicker] = useState(false)
  useSheetOpenWhen(showMenuPicker)
  const [showSugerencia, setShowSugerencia] = useState(false)
  useSheetOpenWhen(showSugerencia)
  const [cargandoMenu, setCargandoMenu] = useState(false)
  const [fecha, setFecha] = useState(() => fmtDate(new Date()))
  const [toast, setToast] = useState('')

  // ── Calendar state ──────────────────────────────────────────
  const [fechasMes, setFechasMes] = useState<Record<string, string[]>>({})
  const [mesActual, setMesActual] = useState(() => fmtDate(new Date()).slice(0, 7))
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
    supabase.from('tareas').select('turno_fecha')
      .eq('restaurante_id', RESTAURANTE_ID)
      .not('menu_id', 'is', null)
      .gte('turno_fecha', from).lte('turno_fecha', to)
      .then(({ data }) => {
        const map: Record<string, string[]> = {}
        for (const r of (data ?? []) as { turno_fecha: string | null }[]) {
          if (r.turno_fecha) map[r.turno_fecha] = ['']
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
      const modoDestino = menu.tipo === 'evento' ? 'evento' : 'menu'
      let totalTareas = 0, diasActivados = 0, diasYaActivos = 0
      for (const f of fechas) {
        // Dedupe por preparación: si ya existe una tarea para ESTE día, no se recrea.
        // Si la del día anterior quedó sin completar (carryover), la de hoy se crea igual
        // y la de ayer se borra (con sus subtareas por ON DELETE CASCADE).
        const prev = new Date(f + 'T12:00:00'); prev.setDate(prev.getDate() - 1)
        const prevDay = fmtDate(prev)
        const { data: previas } = await supabase.from('tareas')
          .select('id, titulo, turno_fecha, estado')
          .eq('restaurante_id', RESTAURANTE_ID).eq('menu_id', menu.id)
          .gte('turno_fecha', prevDay).lte('turno_fecha', f)
        const existentesHoy = new Set<string>()
        const idsAyerABorrar: string[] = []
        for (const t of previas ?? []) {
          if (t.turno_fecha === f) existentesHoy.add(t.titulo.trim().toLowerCase())
          else if (t.turno_fecha === prevDay && t.estado !== 'listo') idsAyerABorrar.push(t.id)
        }
        if (idsAyerABorrar.length > 0) {
          await supabase.from('tareas').delete().in('id', idsAyerABorrar)
        }
        const preparacionesNuevas = menu.preparaciones
          .map((p, i) => ({ p, orden: i }))
          .filter(({ p }) => !existentesHoy.has(p.nombre.trim().toLowerCase()))
        if (preparacionesNuevas.length === 0) { diasYaActivos++; continue }
        const rows = preparacionesNuevas.map(({ p, orden: i }) => ({
          titulo: p.nombre,
          descripcion: menu.nombre,
          status: 'pendiente',
          estado: 'pendiente',
          prioridad: p.prioridad,
          categoria: 'produccion',
          modo: modoDestino,
          seccion: p.paso || 'general',
          plaza: p.plaza,
          asignado_a: p.usuario_asignado,
          receta_id: p.tipo === 'receta' ? p.ref_id : null,
          cantidad: p.cantidad,
          turno_fecha: f,
          menu_id: menu.id,
          orden: i,
          restaurante_id: RESTAURANTE_ID,
        }))
        const { error } = await supabase.from('tareas').insert(rows)
        if (error) throw error
        totalTareas += rows.length
        diasActivados++
      }
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

  // ── E1: convertir la sugerencia de producción (motor de reglas) en tareas de OPS ──
  async function confirmarSugerencia(
    items: { recetaId: string; nombre: string; plaza: string; cantidad: number; unidad: string }[],
    fechaSugerida: string,
    diaLabel: string,
  ) {
    if (!RESTAURANTE_ID || items.length === 0) { setShowSugerencia(false); return }
    try {
      const supabase = createClient()
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
      }))
      const { error } = await supabase.from('tareas').insert(rows)
      if (error) throw error
      refetchTareas()
      setShowSugerencia(false)
      showToast(`${rows.length} ${rows.length === 1 ? 'tarea creada' : 'tareas creadas'} para ${diaLabel}`)
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

  async function vaciarMenuDelDia() {
    const ids = menuTareasDelDia.map(t => t.id)
    if (ids.length === 0) return
    if (!confirm(`¿Vaciar el menú del día? Se eliminan ${ids.length} tareas.`)) return
    try { for (const id of ids) await eliminarTarea(id); showToast('Menú del día vaciado') }
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
      </div>

      {/* Content */}
      {menuTareasDelDia.length > 0 ? (
        <MenuActivoView
          tareas={menuTareasDelDia}
          miembros={miembros}
          onVaciar={vaciarMenuDelDia}
          onActivarOtro={() => setShowMenuPicker(true)}
          onIrAProduccion={irAProduccion}
        />
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

      {/* ── E1: sugerencia de producción (motor de reglas sobre ventas históricas) ── */}
      {showSugerencia && typeof document !== 'undefined' && createPortal(
        <SugerenciaProduccionSheet
          tareasExistentes={tareas}
          onConfirm={confirmarSugerencia}
          onClose={() => setShowSugerencia(false)}
        />,
        document.body,
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
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{multiSelectMode && diasSeleccionados.size > 0 ? `En ${diasSeleccionados.size} ${diasSeleccionados.size === 1 ? 'día' : 'días'} seleccionados` : 'Crea las tareas en Producción'}</div>
              </div>
              <button onClick={() => { setShowMenuPicker(false); setMultiSelectMode(false); setDiasSeleccionados(new Set()) }} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-3)' }}>close</span>
              </button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
              {/* Paso opcional: ¿un día o varios? */}
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                ¿Un día o varios?
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
                      ? `${diasSeleccionados.size} ${diasSeleccionados.size === 1 ? 'día seleccionado' : 'días seleccionados'} — elegí un menú abajo`
                      : 'Tocá los días para seleccionarlos'}
                  </div>
                </div>
              )}

              {catalogoMenus.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-3)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 40, opacity: .5 }}>menu_book</span>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>No hay menús en el catálogo</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>Armá uno en Carta → Menús</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: multiSelectMode && diasSeleccionados.size === 0 ? .45 : 1 }}>
                  {catalogoMenus.map(menu => {
                    const disabled = cargandoMenu || (multiSelectMode && diasSeleccionados.size === 0)
                    return (
                    <button key={menu.id} onClick={() => !disabled && activarMenu(menu)} disabled={disabled}
                      style={{ textAlign: 'left', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', opacity: cargandoMenu ? .6 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '.04em', background: menu.tipo === 'evento' ? 'rgba(139,92,246,.14)' : 'rgba(14,165,233,.14)', color: menu.tipo === 'evento' ? '#8b5cf6' : '#0ea5e9' }}>
                          {menu.tipo === 'evento' ? 'Evento' : 'Fijo'}
                        </span>
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{menu.nombre}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{menu.preparaciones.length} prep.</span>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>add_circle</span>
                      </div>
                      {menu.descripcion && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{menu.descripcion}</div>}
                    </button>
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
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,.4)' }}>Con menú</span>
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

function MenuActivoView({
  tareas, miembros, onVaciar, onActivarOtro, onIrAProduccion,
}: {
  tareas: Tarea[]
  miembros: { id: string; nombre: string; apellido: string }[]
  onVaciar: () => void
  onActivarOtro: () => void
  onIrAProduccion: () => void
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
      <div style={{ margin: '0 2px 10px', padding: '12px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Menú activo · {listos}/{total} listas</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onActivarOtro} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit' }}>+ Otro</button>
            <button onClick={onVaciar} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>Vaciar</button>
          </div>
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

      {/* Secciones del menú — resumen read-only (la ejecución es en Producción) */}
      {grouped.map(([sec, items]) => {
        const listosSec = items.filter(t => t.estado === 'listo').length
        return (
          <div key={sec} style={{ margin: '0 2px 10px', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{sec}</span>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: listosSec === items.length ? '#22c55e' : 'var(--text-3)' }}>{listosSec}/{items.length}</span>
            </div>
            <div style={{ padding: '4px 12px 8px' }}>
              {items.map(t => {
                const listo = t.estado === 'listo'
                const badge = PRIO_BADGE[t.prioridad ?? 'media'] ?? PRIO_BADGE.media
                const miembro = miembros.find(m => m.id === t.asignado_a)
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
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
