'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/context'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { useUserRol, type FlujoOnboarding } from '@/lib/hooks/useUserRol'
import { useOnboardingProgress, markOnboardingDone, type OnboardingStats, type StepState } from '@/lib/hooks/useOnboardingProgress'
import { useTurnosServicio } from '@/lib/hooks/useTurnosServicio'
import StepCard, { type StepGroup } from '@/components/onboarding/StepCard'
import RoleBadge from '@/components/onboarding/RoleBadge'

// ── Datos de impacto (placeholder — fácil de reemplazar) ──────────
const IMPACT_STATS = {
  tiempo_ahorrado: '3 hs/semana',
  food_cost_mejora: '4–8%',
}

// ── Definición declarativa de pasos por flujo ─────────────────────
interface StepDef {
  group: StepGroup
  icon: string
  title: string
  description: (s: OnboardingStats, ctx: StepCtx) => string
  /** Dato de interés (línea con métrica) */
  stat?: (s: OnboardingStats) => string | undefined
  note?: string
  /** Ruta destino (deeplink). Si no hay, no muestra botón "Ir a configurar" */
  deeplink?: string
  goLabel?: string
  /** Cómo se decide si el paso ya está hecho a partir de los datos */
  isDone: (s: OnboardingStats, ctx: StepCtx) => boolean
  /** Marcador especial para el paso 2 del admin (Coach) */
  coachPrefill?: string
  /** Marcador para pasos que dejan elegir plaza inline */
  plazaPicker?: boolean
  /** Marcador para el paso de turnos de servicio (botón "así está bien" con los defaults) */
  turnosPicker?: boolean
}

interface StepCtx {
  restauranteNombre: string
  plazaActual: string | null
}

const PASOS_ADMIN: StepDef[] = [
  {
    group: 'amber', icon: 'verified', title: 'Creá tu cuenta',
    description: (_s, ctx) => `¡Bienvenido a ${ctx.restauranteNombre}! Tu cuenta ya está creada. Vamos a dejar la cocina lista en unos pasos.`,
    isDone: () => true, // siempre done — ya está hecho
  },
  {
    group: 'amber', icon: 'menu_book', title: 'Cargá tu carta',
    description: () => 'Sacale una foto, subí un Excel/CSV o dictale los platos al Coach con nombre y precio.',
    stat: s => `${s.carta} platos en la carta`,
    deeplink: '/carta', goLabel: 'Ir a la carta',
    coachPrefill: 'Quiero cargar mi carta. Te voy a dictar los platos con nombre y precio.',
    isDone: s => s.carta > 0,
  },
  {
    group: 'green', icon: 'receipt_long', title: 'Armá recetas y subrecetas',
    description: () => 'Subí tus fichas técnicas (la IA las lee) o cargalas a mano. Las subrecetas se reutilizan en varios platos.',
    stat: s => `${s.recetas} recetas cargadas`,
    deeplink: '/recetario', goLabel: 'Ir al recetario',
    isDone: s => s.recetas > 0,
  },
  {
    group: 'green', icon: 'grid_view', title: 'Definí las plazas',
    description: () => 'Las plazas (parrilla, fríos, calientes, pase…) organizan el mise en place y las tareas por estación.',
    stat: s => `${s.plazas} plazas activas`,
    deeplink: '/configuracion', goLabel: 'Configurar plazas',
    isDone: s => s.plazas > 0,
  },
  {
    group: 'green', icon: 'schedule', title: 'Definí tus turnos de servicio',
    description: () => 'Almuerzo, cena, o los bloques horarios que uses — el mise se lleva por turno, para que el que entra reciba lo que dejó el anterior.',
    stat: s => s.turnosConfigurados ? 'Turnos configurados' : 'Almuerzo (09-17) y Cena (17-01:30) — podés ajustarlos',
    turnosPicker: true,
    isDone: s => s.turnosConfigurados,
  },
  {
    group: 'green', icon: 'checklist', title: 'Configurá el mise en place ⭐',
    description: () => 'El corazón del servicio: qué prepara cada plaza, en qué cantidad y recipiente.',
    note: "Para cargar cantidades por 'unidad' (und), el producto tiene que estar previamente costeado en el stock con su medida unitaria — la app toma ese dato de ahí.",
    stat: s => `${s.miseConfigurados} items con cantidad cargada`,
    deeplink: '/operaciones?tab=mise', goLabel: 'Configurar mise',
    isDone: s => s.miseConfigurados > 0,
  },
  {
    group: 'blue', icon: 'group_add', title: 'Invitá al equipo',
    description: () => 'Sumá a tu equipo con un link de invitación. Cada uno entra con su rol y plaza.',
    stat: s => `${s.miembros} miembros en el equipo`,
    deeplink: '/turnos', goLabel: 'Invitar equipo',
    isDone: s => s.miembros > 1,
  },
  {
    group: 'blue', icon: 'inventory_2', title: 'Cargá el stock base',
    description: () => 'Importá tu stock desde Excel o desde las facturas. Con precios reales, el food cost se calcula solo.',
    stat: s => `${s.productos} productos · ${s.pctProductosConPrecio}% con precio`,
    deeplink: '/stock', goLabel: 'Ir al stock',
    isDone: s => s.productos > 0,
  },
  {
    group: 'purple', icon: 'fact_check', title: 'Configurá los checklists',
    description: () => 'Activá plantillas de apertura, cierre y limpieza (HACCP) para que nada se pase por alto.',
    stat: s => `${s.rutinas} rutinas activas`,
    deeplink: '/checklist', goLabel: 'Configurar checklists',
    isDone: s => s.rutinas > 0,
  },
]

const PASOS_ENCARGADO: StepDef[] = [
  {
    group: 'amber', icon: 'grid_view', title: 'Tu plaza',
    description: (_s, ctx) => ctx.plazaActual
      ? `Tu plaza asignada es "${ctx.plazaActual}". Confirmala o cambiala abajo.`
      : 'Elegí la plaza desde la que vas a trabajar el turno.',
    plazaPicker: true,
    isDone: (_s, ctx) => !!ctx.plazaActual,
  },
  {
    group: 'green', icon: 'checklist', title: 'Revisá el mise en place',
    description: () => 'Mirá qué tiene que estar preparado en tu plaza antes del servicio y cargá las cantidades hechas.',
    stat: s => `${s.miseConfigurados} items configurados en total`,
    deeplink: '/operaciones?tab=mise', goLabel: 'Ver mise en place',
    isDone: s => s.miseConfigurados > 0,
  },
  {
    group: 'blue', icon: 'inventory_2', title: 'Chequeá el stock crítico',
    description: () => 'Revisá qué productos están bajos o en crítico para pedir a tiempo y no quedarte sin nada.',
    stat: s => `${s.productos} productos en stock`,
    deeplink: '/stock', goLabel: 'Ver stock',
    isDone: s => s.productos > 0,
  },
  {
    group: 'purple', icon: 'swap_horiz', title: 'El pase de turno',
    description: () => 'El pase es donde dejás y leés novedades del turno: 86, faltantes, mensajes para la otra plaza.',
    deeplink: '/pase', goLabel: 'Ir al pase',
    isDone: () => false,
  },
]

const PASOS_COCINERO: StepDef[] = [
  {
    group: 'amber', icon: 'grid_view', title: 'Tu plaza',
    description: (_s, ctx) => ctx.plazaActual
      ? `Vas a trabajar en "${ctx.plazaActual}". Confirmala o cambiala abajo.`
      : 'Elegí tu plaza para ver tus tareas del día.',
    plazaPicker: true,
    isDone: (_s, ctx) => !!ctx.plazaActual,
  },
  {
    group: 'green', icon: 'task_alt', title: 'Tus tareas del día',
    description: () => 'Acá ves todo lo que tenés que producir hoy en tu plaza. Tildá a medida que avanzás.',
    deeplink: '/operaciones', goLabel: 'Ver mis tareas',
    isDone: () => false,
  },
]

function pasosPorFlujo(flujo: FlujoOnboarding): StepDef[] {
  if (flujo === 'admin') return PASOS_ADMIN
  if (flujo === 'encargado') return PASOS_ENCARGADO
  return PASOS_COCINERO
}

export default function OnboardingPage() {
  const router = useRouter()
  const { user } = useAuth()
  const RESTAURANTE_ID = useRestauranteId()
  const [supabase] = useState(() => createClient())

  const { flujo, plazaDefault, loading: rolLoading } = useUserRol()
  const { stats, loading: statsLoading, refresh } = useOnboardingProgress()
  const { turnos: turnosOnboarding, confirmarDefaults: confirmarDefaultsTurnos } = useTurnosServicio()
  const [confirmandoTurnos, setConfirmandoTurnos] = useState(false)

  const [restauranteNombre, setRestauranteNombre] = useState('tu restaurante')
  const [plazaActual, setPlazaActual] = useState<string | null>(plazaDefault)
  const [plazasDisponibles, setPlazasDisponibles] = useState<string[]>([])
  // Overrides manuales de "Ya lo tengo ✓" (no pisan la detección por datos)
  const [manualDone, setManualDone] = useState<Record<number, boolean>>({})

  // Nombre del restaurante + plazas reales (checklist_secciones)
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    let cancelled = false
    ;(async () => {
      const [{ data: rest }, { data: sec }] = await Promise.all([
        supabase.from('restaurantes').select('nombre').eq('id', RESTAURANTE_ID).maybeSingle(),
        supabase.from('checklist_secciones').select('plaza').eq('restaurante_id', RESTAURANTE_ID),
      ])
      if (cancelled) return
      if (rest?.nombre) setRestauranteNombre(rest.nombre)
      const set = new Set<string>()
      for (const r of (sec ?? [])) {
        const p = (r as { plaza?: string | null }).plaza
        if (p) set.add(p)
      }
      setPlazasDisponibles([...set].sort())
    })()
    return () => { cancelled = true }
  }, [RESTAURANTE_ID, supabase])

  useEffect(() => { setPlazaActual(plazaDefault) }, [plazaDefault])

  // Screen context para el Coach (patrón hooks.md: después de los useMemo)
  const pasos = useMemo(() => pasosPorFlujo(flujo), [flujo])
  const ctx: StepCtx = useMemo(
    () => ({ restauranteNombre, plazaActual }),
    [restauranteNombre, plazaActual]
  )

  const progreso = useMemo(() => {
    const map: Record<number, StepState> = {}
    let done = 0
    pasos.forEach((p, i) => {
      const d = manualDone[i] || p.isDone(stats, ctx)
      map[i] = d ? 'done' : 'pending'
      if (d) done++
    })
    return { map, done, total: pasos.length, pct: pasos.length ? Math.round((done / pasos.length) * 100) : 0 }
  }, [pasos, stats, ctx, manualDone])

  useEffect(() => {
    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'onboarding',
      rol: flujo,
      restaurante: restauranteNombre,
      progreso: { hechos: progreso.done, total: progreso.total, pct: progreso.pct },
      pendientes: pasos.filter((_, i) => progreso.map[i] !== 'done').map(p => p.title).slice(0, 5),
    }))
    return () => { localStorage.removeItem('kc_screen_context') }
  }, [flujo, restauranteNombre, progreso, pasos])

  // ── Acciones ────────────────────────────────────────────────
  async function guardarPlaza(plaza: string) {
    setPlazaActual(plaza)
    // Persistir en equipo_miembros del usuario (best-effort, no bloquea)
    if (user?.id && RESTAURANTE_ID) {
      await supabase
        .from('equipo_miembros')
        .update({ plaza_asignada: plaza })
        .eq('restaurante_id', RESTAURANTE_ID)
        .eq('auth_user_id', user.id)
        .then(() => {}, () => {})
    }
  }

  async function confirmarTurnos() {
    setConfirmandoTurnos(true)
    try {
      await confirmarDefaultsTurnos()
      await refresh()
    } finally {
      setConfirmandoTurnos(false)
    }
  }

  function irA(deeplink: string) {
    router.push(deeplink)
  }

  function dictarAlCoach(prompt: string) {
    window.dispatchEvent(new CustomEvent('kc-prefill', { detail: { text: prompt } }))
  }

  function completar() {
    markOnboardingDone(user?.id)
    router.push('/')
  }

  const loading = rolLoading || statsLoading

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 30, color: 'var(--text-3)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header navy */}
      <div style={{ background: 'var(--navy)', padding: '46px 16px 16px', color: '#fff', flexShrink: 0 }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 600 }}>Guía de inicio</div>
              <h1 style={{ margin: '2px 0 0', fontSize: 19, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {restauranteNombre}
              </h1>
            </div>
            <RoleBadge flujo={flujo} />
          </div>

          {/* Barra de progreso */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, opacity: 0.85, marginBottom: 6 }}>
              <span>{progreso.done} de {progreso.total} listos</span>
              <span>{progreso.pct}%</span>
            </div>
            <div style={{ height: 7, borderRadius: 99, background: 'rgba(255,255,255,.18)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, background: '#f59e0b', width: `${progreso.pct}%`, transition: 'width .4s ease' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Contenido scrolleable */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Banner de impacto */}
          <div style={{
            display: 'flex', gap: 10, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '12px 14px',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#16a34a', flexShrink: 0 }}>trending_up</span>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
              Restaurantes que completan el setup ahorran <b style={{ color: 'var(--text-1)' }}>{IMPACT_STATS.tiempo_ahorrado}</b> y
              {' '}mejoran su food cost <b style={{ color: 'var(--text-1)' }}>{IMPACT_STATS.food_cost_mejora}</b>.
            </div>
          </div>

          {pasos.map((p, i) => (
            <StepCard
              key={i}
              index={i + 1}
              total={pasos.length}
              group={p.group}
              icon={p.icon}
              title={p.title}
              description={p.description(stats, ctx)}
              state={progreso.map[i]}
              stat={p.stat?.(stats)}
              note={p.note}
              onGo={p.deeplink ? () => irA(p.deeplink!) : undefined}
              goLabel={p.goLabel}
              onMarkDone={p.isDone(stats, ctx) ? undefined : () => setManualDone(prev => ({ ...prev, [i]: true }))}
            >
              {/* Paso Carta del admin: opciones de carga */}
              {p.coachPrefill && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <CargaChip icon="photo_camera" label="Foto" onClick={() => irA('/carta')} />
                  <CargaChip icon="table_view" label="Excel / CSV" onClick={() => irA('/carta')} />
                  <CargaChip icon="record_voice_over" label="Dictarle al Coach" highlight onClick={() => dictarAlCoach(p.coachPrefill!)} />
                </div>
              )}

              {/* Pasos con selector de plaza (encargado/cocinero) */}
              {p.plazaPicker && (
                <PlazaPicker
                  plazas={plazasDisponibles}
                  actual={plazaActual}
                  onChange={guardarPlaza}
                />
              )}

              {/* Turnos de servicio: los 2 defaults ya vienen cargados — un tap alcanza */}
              {p.turnosPicker && !stats.turnosConfigurados && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {turnosOnboarding.map(t => (
                      <span key={t.id} style={{
                        padding: '4px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
                        background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-1)',
                      }}>
                        {t.nombre} {t.desde}-{t.hasta}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={confirmarTurnos}
                    disabled={confirmandoTurnos}
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: 'var(--navy)', color: '#fff', fontWeight: 700, fontSize: 12.5,
                      fontFamily: 'inherit', opacity: confirmandoTurnos ? 0.6 : 1,
                    }}
                  >
                    {confirmandoTurnos ? 'Guardando...' : 'Así está bien'}
                  </button>
                </div>
              )}
            </StepCard>
          ))}
        </div>
      </div>

      {/* Footer fijo dentro del flujo (NO position fixed — quedaría tras el nav) */}
      <div style={{
        flexShrink: 0, borderTop: '1px solid var(--border)', background: 'var(--surface)',
        padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={completar}
            style={{
              padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-3)', fontWeight: 700, fontSize: 13.5,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Saltar todo
          </button>
          <button
            onClick={completar}
            style={{
              flex: 1, padding: '12px 14px', borderRadius: 10, border: 'none',
              background: 'var(--navy)', color: '#fff', fontWeight: 800, fontSize: 14,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {progreso.done >= progreso.total ? 'Empezar a usar KitchenOS' : 'Continuar al dashboard'}
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
          </button>
        </div>
      </div>

      {/* Refrescar stats al volver de un deeplink (focus) */}
      <RefreshOnFocus onFocus={refresh} />
    </div>
  )
}

// ── Subcomponentes a nivel de módulo ──────────────────────────────
function CargaChip({ icon, label, onClick, highlight }: { icon: string; label: string; onClick: () => void; highlight?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '9px 12px', borderRadius: 10,
        border: `1px solid ${highlight ? 'rgba(249,115,22,.4)' : 'var(--border)'}`,
        background: highlight ? 'rgba(249,115,22,.08)' : 'var(--bg)',
        color: highlight ? '#f97316' : 'var(--text-1)',
        fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 17 }}>{icon}</span>
      {label}
    </button>
  )
}

function PlazaPicker({ plazas, actual, onChange }: { plazas: string[]; actual: string | null; onChange: (p: string) => void }) {
  if (plazas.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
        Todavía no hay plazas configuradas. Pedile al admin que las cargue en Configuración.
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {plazas.map(p => {
        const sel = actual === p
        return (
          <button
            key={p}
            onClick={() => onChange(p)}
            style={{
              padding: '8px 13px', borderRadius: 999,
              border: `1px solid ${sel ? 'var(--navy)' : 'var(--border)'}`,
              background: sel ? 'var(--navy)' : 'var(--bg)',
              color: sel ? '#fff' : 'var(--text-1)',
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              textTransform: 'capitalize',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
          >
            {sel && <span className="material-symbols-outlined" style={{ fontSize: 15 }}>check</span>}
            {p}
          </button>
        )
      })}
    </div>
  )
}

/** Refresca las stats cuando el usuario vuelve a la pestaña (ej: tras un deeplink). */
function RefreshOnFocus({ onFocus }: { onFocus: () => void }) {
  useEffect(() => {
    function handler() { if (document.visibilityState === 'visible') onFocus() }
    document.addEventListener('visibilitychange', handler)
    window.addEventListener('focus', handler)
    return () => {
      document.removeEventListener('visibilitychange', handler)
      window.removeEventListener('focus', handler)
    }
  }, [onFocus])
  return null
}
