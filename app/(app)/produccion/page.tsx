'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { useProduccion, type PlatoConComponentes } from '@/lib/hooks/useProduccion'
import { useEquipo } from '@/lib/hooks/useEquipo'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { useTareas } from '@/lib/hooks/useTareas'
import { createClient } from '@/lib/supabase/client'
import type { StatusProduccion, CategoriaPlato, PlatoComponente } from '@/types'
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
    crearPlato, actualizarPlato, eliminarPlato,
    duplicarMenu, fetchIngredientesConsolidados, setProduccion,
  } = useProduccion()
  const { miembros } = useEquipo()

  const { registrarMerma } = useMerma()
  const { agregarTarea } = useTareas()
  const puedeDelegar = authPerfil?.rol === 'admin' || authPerfil?.rol === 'chef'
  const [fecha, setFecha] = useState(() => fmtDate(new Date()))
  const [view, setView] = useState<View>('planilla')
  const [editingPlato, setEditingPlato] = useState<PlatoConComponentes | null>(null)
  const [toast, setToast] = useState('')
  const [mermaOpen, setMermaOpen] = useState(false)
  const [mermaPrefill, setMermaPrefill] = useState<{ producto_nombre?: string } | undefined>()
  const [activatingDay, setActivatingDay] = useState(false)

  // Días activos de la semana actual (tienen registros en produccion_diaria)
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const supabase = createClient()
    // Calcular lunes y domingo de la semana actual
    const d = new Date(fecha + 'T12:00:00')
    const dow = d.getDay()
    const monday = new Date(d); monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
    supabase
      .from('produccion_diaria')
      .select('fecha')
      .eq('restaurante_id', RESTAURANTE_ID)
      .gte('fecha', fmtDate(monday))
      .lte('fecha', fmtDate(sunday))
      .then(({ data }) => {
        const dates = new Set((data ?? []).map((r: { fecha: string }) => r.fecha))
        setActiveDates(dates)
      })
  }, [RESTAURANTE_ID, fecha])

  // ── Load produccion when fecha or platos change ───────────
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    fetchProduccion(fecha)
  }, [fecha, RESTAURANTE_ID, fetchProduccion])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  function openMerma(nombre: string) {
    setMermaPrefill({ producto_nombre: nombre })
    setMermaOpen(true)
  }

  // ── Group platos by categoria ─────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, PlatoConComponentes[]>()
    for (const p of platos) {
      const list = map.get(p.categoria) ?? []
      list.push(p)
      map.set(p.categoria, list)
    }
    // Sort by CATEGORIAS_PLATO order
    const sorted: [string, PlatoConComponentes[]][] = []
    for (const cat of CATEGORIAS_PLATO) {
      if (map.has(cat)) sorted.push([cat, map.get(cat)!])
    }
    return sorted
  }, [platos])

  // ── Produccion status map ─────────────────────────────────
  const statusMap = useMemo(() => {
    const m = new Map<string, { id: string; status: StatusProduccion }>()
    for (const p of produccion) {
      if (p.componente_id) m.set(p.componente_id, { id: p.id, status: p.status as StatusProduccion })
    }
    return m
  }, [produccion])

  // ── Count shared components ───────────────────────────────
  const componentNameCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of platos) {
      for (const c of p.componentes) {
        const key = c.nombre.toLowerCase().trim()
        m.set(key, (m.get(key) ?? 0) + 1)
      }
    }
    return m
  }, [platos])

  // ── Summary stats ─────────────────────────────────────────
  const stats = useMemo(() => {
    const totalComps = platos.reduce((s, p) => s + p.componentes.length, 0)
    let listos = 0, pendientes = 0, enProceso = 0
    for (const p of platos) {
      for (const c of p.componentes) {
        const st = statusMap.get(c.id)?.status ?? 'pendiente'
        if (st === 'listo') listos++
        else if (st === 'en_proceso') enProceso++
        else pendientes++
      }
    }
    return { platos: platos.length, totalComps, listos, pendientes, enProceso }
  }, [platos, statusMap])

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
          <button onClick={() => setView('crear')} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
            + Plato
          </button>
        </div>

        {/* Date selector */}
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

        {/* Días de la semana — toca para activar/desactivar menú */}
        {platos.length > 0 && (() => {
          const d = new Date(fecha + 'T12:00:00')
          const dow = d.getDay()
          const monday = new Date(d); monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
          const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
          return (
            <div style={{ display: 'flex', gap: 4, marginTop: 10, justifyContent: 'center' }}>
              {DIAS.map((dia, i) => {
                const dayDate = new Date(monday); dayDate.setDate(monday.getDate() + i)
                const dayStr = fmtDate(dayDate)
                const isActive = activeDates.has(dayStr)
                const isSelected = dayStr === fecha
                return (
                  <button
                    key={dayStr}
                    onClick={async () => {
                      setFecha(dayStr)
                      if (!isActive) {
                        setActivatingDay(true)
                        try { await initProduccion(dayStr); setActiveDates(prev => new Set([...prev, dayStr])) }
                        finally { setActivatingDay(false) }
                      }
                    }}
                    style={{
                      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      background: isSelected ? '#fff' : 'rgba(255,255,255,.1)',
                      border: 'none', borderRadius: 8, padding: '5px 2px', cursor: 'pointer',
                      transition: 'all .15s',
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 700, color: isSelected ? 'var(--navy)' : 'rgba(255,255,255,.7)' }}>{dia}</span>
                    <span style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: isActive ? '#22c55e' : 'rgba(255,255,255,.2)',
                    }} />
                  </button>
                )
              })}
            </div>
          )
        })()}
      </div>

      {/* Content */}
      <div>
        {view === 'planilla' && (
          produccion.length === 0 && platos.length > 0 ? (
            /* Sin producción para este día — mostrar CTA para activar */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', gap: 12 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-3)' }}>calendar_today</span>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', margin: 0, textAlign: 'center' }}>
                Sin menú para este día
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, textAlign: 'center' }}>
                Tocá el día en el calendario de arriba para activar el menú, o usá el botón de abajo.
              </p>
              <button
                onClick={async () => { setActivatingDay(true); try { await initProduccion(fecha); setActiveDates(prev => new Set([...prev, fecha])) } finally { setActivatingDay(false) } }}
                disabled={activatingDay}
                style={{ marginTop: 8, padding: '12px 24px', borderRadius: 12, border: 'none', background: 'var(--navy)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: activatingDay ? 0.6 : 1 }}
              >
                {activatingDay ? 'Activando...' : 'Activar menú para este día'}
              </button>
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
              onEdit={(p) => { setEditingPlato(p); setView('editar') }}
              onCrear={(cat) => { setView('crear'); setEditingPlato({ id: '', nombre: '', categoria: cat, activo: true, restaurante_id: '', orden: 0, componentes: [], created_at: '' } as unknown as PlatoConComponentes) }}
              onIngredientes={() => setView('ingredientes')}
              onDuplicar={() => setView('duplicar')}
              openMerma={openMerma}
              router={router}
            />
          )
        )}
        {(view === 'crear' || view === 'editar') && (
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
                    prioridad: 'media',
                    categoria: 'produccion',
                    plaza: null,
                    receta_id: null,
                  })
                }
                showToast('Guardado')
                setView('planilla')
              } catch (e: any) { showToast('Error: ' + e.message) }
            }}
            onDelete={view === 'editar' && editingPlato?.id ? async () => {
              try {
                await eliminarPlato(editingPlato!.id)
                showToast('Eliminado')
                setView('planilla')
              } catch (e: any) { showToast('Error: ' + e.message) }
            } : undefined}
            onCancel={() => { setEditingPlato(null); setView('planilla') }}
          />
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
  grouped, statusMap, produccion, miembros, puedeDelegar, stats, componentNameCount, cycleStatus, onEdit, onCrear, onIngredientes, onDuplicar, openMerma, router,
}: {
  grouped: [string, PlatoConComponentes[]][]
  statusMap: Map<string, { id: string; status: StatusProduccion }>
  produccion: { id: string; componente_id?: string | null; usuario_asignado?: string | null }[]
  miembros: { id: string; nombre: string; apellido: string }[]
  puedeDelegar: boolean
  stats: { platos: number; totalComps: number; listos: number; pendientes: number; enProceso: number }
  componentNameCount: Map<string, number>
  cycleStatus: (compId: string) => void
  onEdit: (p: PlatoConComponentes) => void
  onCrear: (categoria: string) => void
  onIngredientes: () => void
  onDuplicar: () => void
  openMerma: (nombre: string) => void
  router: ReturnType<typeof useRouter>
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
                      <div className="flex items-center gap-1">
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
                      </div>
                      <div className="flex items-center gap-2">
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
interface CompForm { nombre: string; receta_id: string | null; notas_produccion: string; orden: number }

function PlatoForm({
  plato, restauranteId, categoriaInicial, onSave, onDelete, onCancel,
}: {
  plato: PlatoConComponentes | null
  restauranteId: string
  categoriaInicial?: string
  onSave: (data: { nombre: string; categoria: CategoriaPlato; descripcion?: string }, comps: CompForm[]) => void
  onDelete?: () => void
  onCancel: () => void
}) {
  const [nombre, setNombre] = useState(plato?.nombre ?? '')
  const [categoria, setCategoria] = useState<CategoriaPlato>((plato?.categoria as CategoriaPlato) ?? (categoriaInicial as CategoriaPlato) ?? 'Principal')
  const [descripcion, setDescripcion] = useState(plato?.descripcion ?? '')
  const [comps, setComps] = useState<CompForm[]>(
    plato?.componentes.map((c, i) => ({
      nombre: c.nombre,
      receta_id: c.receta_id ?? null,
      notas_produccion: c.notas_produccion ?? '',
      orden: i,
    })) ?? [{ nombre: '', receta_id: null, notas_produccion: '', orden: 0 }]
  )
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
    setComps([...comps, { nombre: '', receta_id: null, notas_produccion: '', orden: comps.length }])
    setEditingNotasIdx(comps.length) // abrir el form para editar inmediatamente
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
      setComps([...comps, { nombre: receta.nombre, receta_id: receta.id, notas_produccion: '', orden: comps.length }])
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
    await onSave({ nombre, categoria, descripcion: descripcion || undefined }, validComps)
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
                      {comp.notas_produccion && !isEditing && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, fontStyle: 'italic' }}>
                          {comp.notas_produccion}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setEditingNotasIdx(isEditing ? null : idx)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-3)' }}
                      title={isEditing ? 'Cerrar' : 'Agregar notas'}
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

                  {/* Expandible: notas de producción */}
                  {isEditing && (
                    <div style={{ padding: '0 12px 10px 36px' }}>
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
