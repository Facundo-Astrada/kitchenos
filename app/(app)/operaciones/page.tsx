'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import ChecklistPage from '@/app/(app)/checklist/ClientView'
import PantallaCompleta from '@/components/ops/PantallaCompleta'
import TareasPage from '@/app/(app)/tareas/ClientView'
import { ProduccionView } from '@/app/(app)/produccion/page'
import { RutinaTurnoView } from '@/components/rutina/RutinaTurnoView'
import { useTareas } from '@/lib/hooks/useTareas'
import { useReservas } from '@/lib/hooks/useReservas'
import { cubiertosVivos } from '@/lib/reservas/helpers'
import { hoyOperativo, fechaEnTz } from '@/lib/ops/turnos'
import { fusionarDuplicados } from '@/lib/ops/dedupeTareas'
import { onOpsChromeCompact } from '@/lib/ops/chromeBus'

type Tab = 'produccion' | 'mise' | 'planificacion' | 'turno'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'produccion',    label: 'Producción',   icon: 'task_alt' },
  { id: 'mise',          label: 'Mise',         icon: 'playlist_add_check' },
  { id: 'planificacion', label: 'Planificación', icon: 'factory' },
  { id: 'turno',         label: 'Turno',        icon: 'schedule' },
]

const TAB_IDS = TABS.map(t => t.id)
function esTab(v: string | null): v is Tab {
  return v != null && (TAB_IDS as string[]).includes(v)
}

// ══════════════════════════════════════════════════════════════
// OPERACIONES PAGE (tab container principal)
// ══════════════════════════════════════════════════════════════
export default function OperacionesPage() {
  const [tab, setTab] = useState<Tab>('produccion')
  // useTareas es SWR (cacheado) — comparte cache con el tab Producción, costo ~0.
  const { tareas } = useTareas()

  // Tareas de hoy sin completar → badge en el tab Producción (ver el efecto sin cambiar de tab)
  // Cuenta FILAS del board, no inserts: la misma preparación puede tener
  // varias tareas del día (mise + pase de turno + lote de un menú) y el badge
  // decía 40 donde el cocinero veía 28. Ver lib/ops/dedupeTareas.ts.
  const pendientesProduccion = useMemo(() => {
    const hoy = hoyOperativo()
    const delDia = tareas.filter(t => t.turno_fecha === hoy && !t.parent_id)
    return fusionarDuplicados(delDia).filas.filter(t => t.estado !== 'listo').length
  }, [tareas])

  // Cubiertos reservados de hoy (PLAN-4-CAPAS B9) — el número que informa
  // cuánto producir. Se oculta entero si no hay reservas cargadas: la mayoría
  // de las cuentas no toma reservas y no debe ver un "0" sin sentido acá.
  const hoyReservas = useMemo(() => fechaEnTz(new Date()), [])
  const { reservas } = useReservas(hoyReservas, hoyReservas)
  const cubiertosReservados = useMemo(() => cubiertosVivos(reservas), [reservas])
  // Lazy-mount: cada tab se monta recién en su primera visita (o cuando pasa
  // a ser vecino inmediato del tab activo, ver el efecto de abajo) y de ahí en
  // más se mantiene montado — el slot en la fila de scroll-snap sigue
  // ocupando su lugar, pero vacío. Evita disparar los ~10 hooks de los 3
  // sub-módulos en paralelo al entrar a OPS.
  const [mounted, setMounted] = useState<Set<Tab>>(() => new Set<Tab>(['produccion']))

  // Tab inicial desde la URL (?tab=) — permite deep-link y redirects desde las rutas viejas
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (esTab(t)) setTab(t)
  }, [])

  // Marcar el tab activo COMO el vecino inmediato como montados (se quedan
  // montados para preservar estado) — el vecino se precarga para que la fila
  // de scroll-snap ya tenga contenido real cuando el dedo lo arrastra a la
  // vista, no un panel en blanco.
  useEffect(() => {
    const idx = TAB_IDS.indexOf(tab)
    const vecinos = [tab, TAB_IDS[idx - 1], TAB_IDS[idx + 1]].filter(Boolean) as Tab[]
    setMounted(prev => {
      if (vecinos.every(t => prev.has(t))) return prev
      return new Set([...prev, ...vecinos])
    })
  }, [tab])

  // Write screen context for KitchenCoach — OPS es el dueño del contexto
  // (los hijos embebidos no escriben). Insights de producción para que el
  // Coach responda "¿qué me conviene producir hoy?" con datos reales.
  useEffect(() => {
    try {
      const hoy = hoyOperativo()
      const delDia = fusionarDuplicados(tareas.filter(t => t.turno_fecha === hoy && !t.parent_id)).filas
      const total = delDia.length
      const listos = delDia.filter(t => t.estado === 'listo').length
      const topCriticas = tareas
        .filter(t => t.prioridad === 'critica' && t.estado !== 'listo')
        .map(t => t.titulo).slice(0, 5)
      localStorage.setItem('kc_screen_context', JSON.stringify({
        screen: 'operaciones',
        tab,
        produccionTotal: total,
        produccionListos: listos,
        produccionPendientes: total - listos,
        avance: total > 0 ? Math.round((listos / total) * 100) : 0,
        topCriticas,
      }))
    } catch { /* ignore */ }
    return () => localStorage.removeItem('kc_screen_context')
  }, [tab, tareas])

  // El mise avisa cuándo plegar. Solo él lo emite, y al desmontarse o cambiar
  // de plaza/fase manda `false`, así que los otros paneles nunca se quedan sin
  // su navegación. El cambio de tab lo restaura por las dudas.
  const [chromeCompacto, setChromeCompacto] = useState(false)
  useEffect(() => onOpsChromeCompact(setChromeCompacto), [])
  useEffect(() => { setChromeCompacto(false) }, [tab])

  // Listen for kc-set-tab event from the coach tour (y desde Planificación → Producción)
  useEffect(() => {
    function handleSetTab(e: Event) {
      const { tab: newTab } = (e as CustomEvent<{ tab: Tab }>).detail
      if (esTab(newTab)) setTab(newTab)
    }
    window.addEventListener('kc-set-tab', handleSetTab)
    return () => window.removeEventListener('kc-set-tab', handleSetTab)
  }, [])

  // Modo pantalla completa del board de Produccion (PLAN-ACCESO-Y-USO B7.2).
  // Se persiste porque la tablet colgada en la cocina se recarga sola cada
  // tanto y no puede pedir que alguien vuelva a entrar al modo cada vez.
  const [pantallaCompleta, setPantallaCompleta] = useState(false)
  useEffect(() => {
    // Leerlo en el inicializador de useState (como hace DesktopShell con el
    // dock) daria un HTML de servidor distinto al primer render del cliente.
    // Acá el setState en efecto es lo correcto, no el atajo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (localStorage.getItem('kc_ops_pantalla_completa') === '1') setPantallaCompleta(true)
  }, [])
  const togglePantallaCompleta = useCallback((valor: boolean) => {
    setPantallaCompleta(valor)
    localStorage.setItem('kc_ops_pantalla_completa', valor ? '1' : '0')
  }, [])

  // El recorrido de la primera visita a OPS lo dispara useTourAutomatico desde
  // el layout (PLAN-ACCESO-Y-USO B4.2). Antes habia acá un disparador propio
  // con `kc_ops_welcomed` en localStorage — volvia a aparecer en cada
  // dispositivo y era uno de los dos unicos tours que arrancaban solos.

  // Swipe horizontal entre tabs (PLAN-SUPERFICIE S4.3, refinado ago2026) —
  // una fila con las 4 pantallas y scroll-snap NATIVO, no un cálculo manual
  // de gestos. Antes era todo a mano por pointerup (dx/dy/dt) y Planificación
  // tenía su propio overflow:auto horizontal que se lo comía: el dedo
  // arrastraba el contenido pero el pointerup nunca cambiaba de tab (el bug
  // que reportó Facu). El navegador resuelve solo el gesto diagonal —
  // predominantemente vertical cae al scroll interno del panel (long-press
  // de reordenar del mise incluido), predominantemente horizontal cae acá —
  // y de paso la pantalla siguiente aparece en vivo mientras se arrastra el
  // dedo en vez de recién cambiar al soltar.
  const scrollRef = useRef<HTMLDivElement>(null)
  const tabRef = useRef<Tab>(tab)
  useEffect(() => { tabRef.current = tab }, [tab])
  const scrollDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didInitScroll = useRef(false)

  // tab → scroll: cambios programáticos (click en una pill, evento
  // kc-set-tab, ?tab= inicial) mueven el contenedor. Si ya está ahí (típico:
  // el cambio vino de este mismo scroll, ver handleScroll) no hace nada —
  // evita pelear con el gesto en curso del usuario.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const idx = TAB_IDS.indexOf(tab)
    const target = idx * el.clientWidth
    if (Math.abs(el.scrollLeft - target) < 2) { didInitScroll.current = true; return }
    el.scrollTo({ left: target, behavior: didInitScroll.current ? 'smooth' : 'auto' })
    didInitScroll.current = true
  }, [tab])

  // scroll → tab: al asentarse el scroll (nativo, con snap) se calcula qué
  // pantalla quedó alineada y se sincroniza el estado. Debounced: onScroll
  // dispara decenas de veces por segundo durante el momentum.
  function handleScroll() {
    const el = scrollRef.current
    if (!el || el.clientWidth === 0) return
    if (scrollDebounce.current) clearTimeout(scrollDebounce.current)
    scrollDebounce.current = setTimeout(() => {
      const idx = Math.round(el.scrollLeft / el.clientWidth)
      const next = TAB_IDS[Math.min(TAB_IDS.length - 1, Math.max(0, idx))]
      if (next !== tabRef.current) setTab(next)
    }, 90)
  }

  // El contenedor cambia de ancho sin que la ventana cambie de tamaño (barra
  // lateral plegable en desktop, PLAN-ACCESO-Y-USO B7) — un 'resize' de
  // window no lo detecta.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      el.scrollTo({ left: TAB_IDS.indexOf(tabRef.current) * el.clientWidth, behavior: 'auto' })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const slotStyle: React.CSSProperties = {
    flex: '0 0 100%', minWidth: 0, height: '100%',
    overflow: 'hidden', display: 'flex', flexDirection: 'column',
    scrollSnapAlign: 'start',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab header — se pliega mientras se recorre la lista del mise (ver
          lib/ops/chromeBus): en una tablet estas franjas fijas se comían un
          tercio de la pantalla, que son ocho ítems que no se ven. Vuelve entero
          al primer scroll hacia arriba. */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 0', flexShrink: 0 }}>
        {cubiertosReservados > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'rgba(255,255,255,.7)' }}>event_seat</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.85)' }}>
              {cubiertosReservados} cubiertos reservados hoy
            </span>
          </div>
        )}
        <div style={{
          display: 'flex', gap: 6,
          maxHeight: chromeCompacto ? 0 : 44, paddingBottom: chromeCompacto ? 0 : 10,
          opacity: chromeCompacto ? 0 : 1, overflow: 'hidden',
          transition: 'max-height .18s ease, opacity .14s ease, padding .18s ease',
        }}>
          {TABS.map(t => (
            <button
              key={t.id}
              data-coach-target={`ops-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1, minWidth: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                padding: '8px 4px', borderRadius: 99, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                background: tab === t.id ? '#fff' : 'rgba(255,255,255,.12)',
                color: tab === t.id ? 'var(--navy)' : 'rgba(255,255,255,.65)',
                transition: 'all .15s',
                WebkitTapHighlightColor: 'transparent',
                position: 'relative',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14, flexShrink: 0 }}>{t.icon}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
              {t.id === 'produccion' && pendientesProduccion > 0 && (
                <span style={{
                  minWidth: 16, height: 16, padding: '0 4px', borderRadius: 99,
                  background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 800,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {pendientesProduccion}
                </span>
              )}
            </button>
          ))}
          {/* Pantalla completa — solo en Produccion, que es el board que se
              sigue mientras se cocina (PLAN-ACCESO-Y-USO B7.2). Va acá y no en
              un menu: en una tablet de cocina tiene que estar a un dedo.
              Contraste más alto que las pills (fondo/borde/ícono más claros):
              se reportó que quedaba medio invisible mezclado con la fila. */}
          {tab === 'produccion' && (
            <button
              onClick={() => togglePantallaCompleta(true)}
              title="Ver el tablero a pantalla completa"
              aria-label="Ver el tablero a pantalla completa"
              style={{
                flexShrink: 0, width: 38,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 99, border: '1px solid rgba(255,255,255,.3)', cursor: 'pointer',
                background: 'rgba(255,255,255,.18)', color: '#fff',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>open_in_full</span>
            </button>
          )}
        </div>
      </div>

      {/* El CTA de Control de Carta (PLAN-4-CAPAS B7) vive ahora en el bloque
          "Ahora" del Dashboard (PLAN-SUPERFICIE S1) — antes vivía acá suelto,
          compitiendo con el mismo botón que aparece primero al abrir la app. */}

      {/* Modo pantalla completa de Producción — overlay fixed, fuera de la
          fila con scroll-snap: si viviera adentro, un ancestro con scroll
          nativo puede darle su propio containing block a los descendientes
          fixed en algunos motores, y le rompería el inset:0. */}
      {pantallaCompleta && tab === 'produccion' && mounted.has('produccion') && (
        <PantallaCompleta titulo="Produccion" onSalir={() => togglePantallaCompleta(false)}>
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <TareasPage embedded />
          </div>
        </PantallaCompleta>
      )}

      {/* Tab panels — fila horizontal con scroll-snap nativo (ver el bloque de
          arriba). Cada panel se monta en su primera visita, y también el
          vecino inmediato del tab activo (para que ya esté listo al llegar
          arrastrando el dedo) — de ahí en más se mantiene montado. */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="ops-swipe-track"
        style={{
          flex: 1, minHeight: 0, display: 'flex',
          overflowX: 'auto', overflowY: 'hidden',
          scrollSnapType: 'x mandatory', overscrollBehaviorX: 'contain',
        }}
      >
        <div style={slotStyle}>
          {mounted.has('produccion') && <TareasPage embedded />}
        </div>
        <div style={slotStyle}>
          {mounted.has('mise') && <ChecklistPage embedded />}
        </div>
        <div style={slotStyle}>
          {mounted.has('planificacion') && <ProduccionView embedded />}
        </div>
        <div style={slotStyle}>
          {mounted.has('turno') && <RutinaTurnoView embedded />}
        </div>
      </div>
    </div>
  )
}
