'use client'

// Calendario — Registro Preparación (DESIGN.md §2): se usa para planificar,
// no durante el servicio. Orquesta las vistas de components/calendario/:
// Mes (grilla + panel del día), Semana (7 días desktop / 3 mobile), Agenda
// (lista cronológica). El hook junta eventos propios + reflejos de solo
// lectura de otros módulos (menús, entregas, reservas, pagos, feriados) y
// las capas encienden/apagan cada fuente.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import {
  useCalendario, indexarPorDia,
  type ItemCalendario, type NotaItemCalendario,
} from '@/lib/hooks/useCalendario'
import { useTareas } from '@/lib/hooks/useTareas'
import { useMenus, type MenuConPreparaciones } from '@/lib/hooks/useMenus'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { useAuth } from '@/lib/auth/context'
import { usePlazasCustom } from '@/lib/hooks/usePlazasCustom'
import { SegmentedTabs, HeaderAction, Toast } from '@/components/ui'
import { useReducedMotion, DURATION, EASE_OUT } from '@/lib/ui/motion'
import { createClient } from '@/lib/supabase/client'
import { activarMenuParaFechas, rangoFechas, resumenActivacion } from '@/lib/menus/activarMenu'
import { plazaLabel } from '@/lib/constants'
import type { Plaza } from '@/types'
import {
  MESES, grillaMes, hoy as hoyStr, addDays, lunesDe, diffDays, etiquetaRango, fechaLarga, toDateStr, rango,
} from '@/lib/calendario/fechas'
import { CAPAS_DEFAULT, type CapaId } from '@/lib/calendario/capas'
import { generarIcs, descargarIcs } from '@/lib/calendario/ics'
import { CapasChips } from '@/components/calendario/shared'
import { MesGrid } from '@/components/calendario/MesGrid'
import { SemanaGrid } from '@/components/calendario/SemanaGrid'
import { AgendaLista } from '@/components/calendario/AgendaLista'
import { DiaPanel } from '@/components/calendario/DiaPanel'
import { EventoDetalle, textoRecurrencia } from '@/components/calendario/EventoDetalle'
import { EventoForm, formVacio, formDesdeEvento, payloadDesdeForm, type EventoFormData } from '@/components/calendario/EventoForm'
import { PlanificarEventoModal } from '@/components/calendario/PlanificarEventoModal'

type Vista = 'mes' | 'semana' | 'agenda'
type ToastState = { msg: string; variant?: 'default' | 'error'; action?: { label: string; onClick: () => void } } | null

const LS_VISTA = 'kc_calendario_vista'
const LS_CAPAS = 'kc_calendario_capas'

function leerLS<T>(clave: string, def: T): T {
  if (typeof window === 'undefined') return def
  try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) as T : def } catch { return def }
}
function escribirLS(clave: string, v: unknown) {
  try { localStorage.setItem(clave, JSON.stringify(v)) } catch {}
}

/* Ancho real del área de contenido. "Desktop" no alcanza: con el panel del
   Coach abierto quedan ~780px y la grilla + panel lateral no entran. */
function useAncho(ref: React.RefObject<HTMLDivElement | null>) {
  const [ancho, setAncho] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return ancho
}

export default function CalendarioPage() {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const reducedMotion = useReducedMotion()
  const RESTAURANTE_ID = useRestauranteId()
  const { isAdmin, puedeVer, verCostos } = usePermisos()
  const { user } = useAuth()
  const verPagos = verCostos && (isAdmin || puedeVer('facturas'))

  const hoy = hoyStr()
  const [mes, setMes] = useState(() => Number(hoy.slice(5, 7)))
  const [anio, setAnio] = useState(() => Number(hoy.slice(0, 4)))
  const [sel, setSel] = useState(hoy)
  const [vista, setVista] = useState<Vista>('mes')
  const [capas, setCapas] = useState<CapaId[]>(CAPAS_DEFAULT)
  const [navDir, setNavDir] = useState(1)
  // Preferencias del browser después de montar — leerlas en el estado
  // inicial desalinea el HTML del server con el del cliente (hidratación).
  // Mismo criterio que OPS (kc_ops_pantalla_completa): acá el setState en
  // efecto es lo correcto, no el atajo.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVista(leerLS<Vista>(LS_VISTA, 'mes'))
    setCapas(leerLS<CapaId[]>(LS_CAPAS, CAPAS_DEFAULT))
  }, [])

  const rootRef = useRef<HTMLDivElement>(null)
  const anchoMedido = useAncho(rootRef)
  const ancho = anchoMedido || (isDesktop ? 1200 : 390)
  const panelLateral = ancho >= 1080
  const headerUnaFila = ancho >= 1000
  const gridAncho = panelLateral ? ancho - 400 : ancho - 24
  const mesCompacto = gridAncho / 7 < 92
  const diasPorVista = ancho >= 720 ? 7 : 3

  const [detalle, setDetalle] = useState<ItemCalendario | null>(null)
  const [form, setForm] = useState<{ open: boolean; editandoId: string | null; inicial: EventoFormData; avisadoAt?: string | null }>(
    () => ({ open: false, editandoId: null, inicial: formVacio(hoy) }))
  const [planificar, setPlanificar] = useState(false)
  const [toast, setToast] = useState<ToastState>(null)
  const cerrarToast = useCallback(() => setToast(null), [])

  const {
    items, proveedores, autores, equipo, puestos, notaItems, loading, refreshing, error,
    fetchRango, refetch, crearEvento, actualizarEvento, eliminarEvento,
    agregarNotaItem, eliminarNotaItem, asignarPlazaNotaItem,
  } = useCalendario({ verPagos })
  const { agregarTarea } = useTareas({ soloEscritura: true })
  const { menus: todosLosMenus } = useMenus()
  const catalogoEventos = useMemo(() => todosLosMenus.filter(m => m.tipo === 'evento'), [todosLosMenus])
  const { plazasCustom } = usePlazasCustom()

  /* ── Rango visible: la grilla de 42 días del mes cubre las tres vistas ── */
  const grilla = useMemo(() => grillaMes(mes, anio), [mes, anio])
  const desde = grilla[0], hasta = grilla[41]
  useEffect(() => { if (RESTAURANTE_ID) fetchRango(desde, hasta) }, [desde, hasta, fetchRango, RESTAURANTE_ID, verPagos])

  const primeroMes = toDateStr(anio, mes, 1)
  const ultimoMes = toDateStr(anio, mes, new Date(anio, mes, 0).getDate())
  const esMesActual = hoy >= primeroMes && hoy <= ultimoMes
  const diasSemana = useMemo(() => diasPorVista === 7
    ? Array.from({ length: 7 }, (_, i) => addDays(lunesDe(sel), i))
    : Array.from({ length: 3 }, (_, i) => addDays(sel, i)), [diasPorVista, sel])
  const diasAgenda = useMemo(() => rango(esMesActual ? hoy : primeroMes, ultimoMes), [esMesActual, hoy, primeroMes, ultimoMes])

  const filtrados = useMemo(() => items.filter(it => capas.includes(it.capa)), [items, capas])
  const porDia = useMemo(() => indexarPorDia(filtrados), [filtrados])
  const capasDisponibles = useMemo<CapaId[]>(() =>
    ['eventos', 'menus', 'compras', 'reservas', ...(verPagos ? ['pagos' as const] : []), 'feriados'], [verPagos])
  const conteoCapas = useMemo(() => {
    const c: Partial<Record<CapaId, number>> = {}
    for (const it of items) if (it.diaFin >= primeroMes && it.dia <= ultimoMes) c[it.capa] = (c[it.capa] ?? 0) + 1
    return c
  }, [items, primeroMes, ultimoMes])
  const vacioMes = !loading && filtrados.every(it => it.diaFin < primeroMes || it.dia > ultimoMes || it.capa === 'feriados')

  /* ── Navegación ── */
  const irAMes = useCallback((m: number, y: number, dir: number, dia?: string) => {
    setNavDir(dir); setMes(m); setAnio(y)
    const p = toDateStr(y, m, 1)
    const u = toDateStr(y, m, new Date(y, m, 0).getDate())
    setSel(dia ?? (hoy >= p && hoy <= u ? hoy : p))
  }, [hoy])

  const irAFecha = useCallback((f: string, dir = 0) => {
    const m = Number(f.slice(5, 7)), y = Number(f.slice(0, 4))
    if (m !== mes || y !== anio) { setNavDir(dir || (f > sel ? 1 : -1)); setMes(m); setAnio(y) }
    setSel(f)
  }, [mes, anio, sel])

  const navegar = useCallback((dir: number) => {
    if (vista === 'semana') { setNavDir(dir); irAFecha(addDays(sel, dir * diasPorVista), dir); return }
    let m = mes + dir, y = anio
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    irAMes(m, y, dir)
  }, [vista, sel, diasPorVista, irAFecha, mes, anio, irAMes])

  const irHoy = useCallback(() => irAFecha(hoy), [irAFecha, hoy])

  // Deep link desde un aviso: /calendario?fecha=2026-10-16 abre ese día.
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get('fecha')
    if (f && /^\d{4}-\d{2}-\d{2}$/.test(f)) irAFecha(f)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cambiarVista = useCallback((v: Vista) => { setVista(v); escribirLS(LS_VISTA, v) }, [])
  const toggleCapa = useCallback((id: CapaId) => {
    setCapas(prev => {
      const next = prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
      escribirLS(LS_CAPAS, next)
      return next
    })
  }, [])

  /* ── Crear / editar / mover / eliminar ── */
  const abrirCrear = useCallback((fecha: string, hora?: string) => {
    setSel(fecha)
    setForm({ open: true, editandoId: null, inicial: formVacio(fecha, hora) })
  }, [])

  const editar = (it: ItemCalendario) => {
    setDetalle(null)
    setForm({ open: true, editandoId: it.serieId ?? it.id, inicial: formDesdeEvento(it), avisadoAt: it.avisado_at ?? null })
  }
  const duplicar = (it: ItemCalendario) => {
    setDetalle(null)
    const base = formDesdeEvento(it)
    const largo = diffDays(it.dia, it.diaFin)
    setForm({ open: true, editandoId: null, inicial: { ...base, fecha_inicio: it.dia, fecha_fin: addDays(it.dia, largo), frecuencia: '', repetir_hasta: '', avisar: null } })
  }

  const guardar = async (f: EventoFormData) => {
    const payload = payloadDesdeForm(f)
    // Un evento que ya avisó no vuelve a mandar su destino (el aviso sale una vez).
    const datos = form.avisadoAt ? (({ avisar: _a, ...resto }) => { void _a; return resto })(payload) : payload
    let id = form.editandoId
    if (id) await actualizarEvento(id, datos)
    else id = await crearEvento(payload)
    setForm(s => ({ ...s, open: false }))
    // Aviso al equipo: el server decide (idempotente: solo si lo pidió y no avisó todavía).
    let aviso = ''
    if (payload.avisar && !form.avisadoAt && id) {
      try {
        const r = await fetch('/api/calendario/avisar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventoId: id }),
        }).then(res => res.json()) as { avisados?: number; push?: number; motivo?: string }
        if (r.avisados) aviso = ` · avisado a ${r.avisados}${r.push ? ` (${r.push} al celular)` : ''}`
        else if (r.motivo === 'nadie en ese destino') aviso = ' · no había a quién avisarle'
      } catch { /* el evento ya quedó guardado; el aviso es best-effort */ }
    }
    await refetch()
    const rep = textoRecurrencia(payload)
    setToast({ msg: (form.editandoId ? 'Cambios guardados' : rep ? `Evento creado · ${rep}` : `Evento creado · ${fechaLarga(f.fecha_inicio)}`) + aviso })
    if (!form.editandoId) irAFecha(f.fecha_inicio)
  }

  const eliminar = async (it: ItemCalendario) => {
    setDetalle(null)
    const id = it.serieId ?? it.id
    const copia = payloadDesdeForm(formDesdeEvento(it))
    try {
      await eliminarEvento(id)
      setToast({
        msg: it.recurrente ? 'Serie eliminada' : 'Evento eliminado',
        action: { label: 'Deshacer', onClick: async () => { await crearEvento(copia); refetch() } },
      })
    } catch (e) {
      refetch()
      setToast({ msg: 'No se pudo eliminar: ' + (e instanceof Error ? e.message : ''), variant: 'error' })
    }
  }

  const mover = async (it: ItemCalendario, fecha: string) => {
    const id = it.serieId ?? it.id
    const delta = diffDays(it.dia, fecha)
    const antes = { fecha_inicio: it.fecha_inicio, fecha_fin: it.fecha_fin }
    const despues = { fecha_inicio: fecha, fecha_fin: it.fecha_fin ? addDays(it.fecha_fin, delta) : null }
    try {
      await actualizarEvento(id, despues)
      setSel(fecha)
      setToast({
        msg: `Movido al ${fechaLarga(fecha).toLowerCase()}`,
        action: { label: 'Deshacer', onClick: async () => { await actualizarEvento(id, antes); refetch() } },
      })
    } catch (e) {
      refetch()
      setToast({ msg: 'No se pudo mover: ' + (e instanceof Error ? e.message : ''), variant: 'error' })
    }
  }

  /* ── Planificar evento del catálogo ── */
  const activarEvento = async (menu: MenuConPreparaciones, d: string, h: string) => {
    if (!RESTAURANTE_ID) return
    if (menu.preparaciones.length === 0) { setToast({ msg: 'Ese evento no tiene preparaciones cargadas', variant: 'error' }); return }
    try {
      const res = await activarMenuParaFechas(createClient(), RESTAURANTE_ID, menu, rangoFechas(d, h))
      setPlanificar(false)
      refetch()
      setToast({ msg: res.diasActivados === 0 ? 'Ese evento ya estaba activo en esas fechas'
        : `Evento activado · ${resumenActivacion(res)}${res.diasYaActivos > 0 ? ` (${res.diasYaActivos} ya activos)` : ''}` })
    } catch (e) {
      setToast({ msg: 'Error: ' + (e instanceof Error ? e.message : 'no se pudo activar'), variant: 'error' })
    }
  }

  /* ── Notas → Producción ── */
  const enviarNota = async (item: NotaItemCalendario, plaza: Plaza) => {
    try {
      const tareaId = await agregarTarea({
        titulo: item.texto.slice(0, 120),
        descripcion: `Desde nota del calendario (${item.fecha})`,
        status: 'pendiente', estado: 'pendiente', prioridad: 'media', categoria: 'general',
        modo: 'carta', seccion: 'general', plaza, turno_fecha: item.fecha, fecha_limite: item.fecha,
      })
      await asignarPlazaNotaItem(item.id, item.fecha, plaza, tareaId)
      setToast({ msg: `Enviado a ${plazaLabel(plaza, plazasCustom)}` })
    } catch {
      setToast({ msg: 'No se pudo enviar a Producción', variant: 'error' })
    }
  }

  /* ── Export .ics del mes visible (capas encendidas) ── */
  const exportar = () => {
    const delMes = filtrados.filter(it => it.diaFin >= primeroMes && it.dia <= ultimoMes)
    descargarIcs(generarIcs(delMes, 'KitchenOS'), `kitchenos-${MESES[mes - 1].toLowerCase()}-${anio}.ics`)
    setToast({ msg: `${delMes.length} ítems exportados — abrilo con tu calendario` })
  }

  /* ── Atajos de teclado (desktop) ── */
  const hayModal = !!detalle || form.open || planificar
  useEffect(() => {
    if (!isDesktop) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (hayModal || e.metaKey || e.ctrlKey || e.altKey) return
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return
      const k = e.key.toLowerCase()
      if (e.key === 'ArrowLeft') navegar(-1)
      else if (e.key === 'ArrowRight') navegar(1)
      else if (k === 't') irHoy()
      else if (k === 'm') cambiarVista('mes')
      else if (k === 's') cambiarVista('semana')
      else if (k === 'a') cambiarVista('agenda')
      else if (k === 'n' || k === 'c') abrirCrear(sel)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isDesktop, hayModal, navegar, irHoy, cambiarVista, abrirCrear, sel])

  /* ── Contexto del Coach: ±14 días, no 3 eventos sueltos ── */
  useEffect(() => {
    const ventana = filtrados
      .filter(it => it.diaFin >= addDays(hoy, -1) && it.dia <= addDays(hoy, 14))
      .sort((a, b) => a.dia.localeCompare(b.dia))
      .slice(0, 40)
      .map(it => ({ titulo: it.titulo, desde: it.dia, hasta: it.diaFin !== it.dia ? it.diaFin : undefined, capa: it.capa, hora: it.todoElDia ? undefined : it.hora_inicio.slice(0, 5), detalle: it.meta }))
    try {
      localStorage.setItem('kc_screen_context', JSON.stringify({
        screen: 'calendario',
        vista,
        mesVisible: `${MESES[mes - 1]} ${anio}`,
        diaSeleccionado: sel,
        capasVisibles: capas,
        proximos14Dias: ventana,
        itemsNotaDiaSeleccionado: (notaItems[sel] ?? []).map(it => ({ texto: it.texto, plaza: it.plaza })).slice(0, 20),
        diasConNotaEsteMes: Object.entries(notaItems).filter(([f, l]) => f >= primeroMes && f <= ultimoMes && l.length > 0).length,
      }))
    } catch {}
    return () => { try { localStorage.removeItem('kc_screen_context') } catch {} }
  }, [filtrados, notaItems, sel, vista, capas, mes, anio, hoy, primeroMes, ultimoMes])

  /* ── Render ── */
  const titulo = vista === 'semana'
    ? `${etiquetaRango(diasSemana[0], diasSemana[diasSemana.length - 1])} ${diasSemana[diasSemana.length - 1].slice(0, 4)}`
    : `${MESES[mes - 1]} ${anio}`
  const hoyVisible = vista === 'semana' ? diasSemana.includes(hoy) : esMesActual && sel === hoy

  const tabs = [
    { id: 'mes' as const, label: 'Mes', icon: 'calendar_view_month' },
    { id: 'semana' as const, label: diasPorVista === 7 ? 'Semana' : '3 días', icon: 'view_week' },
    { id: 'agenda' as const, label: 'Agenda', icon: 'view_agenda' },
  ]

  const navBtn = (dir: number) => (
    <button type="button" onClick={() => navegar(dir)} aria-label={dir < 0 ? 'Anterior' : 'Siguiente'} style={{
      width: 36, height: 36, borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{dir < 0 ? 'chevron_left' : 'chevron_right'}</span>
    </button>
  )
  const btnGhost = (label: string, icon: string, onClick: () => void, soloIcono = false) => (
    <button type="button" onClick={onClick} title={label} aria-label={label} style={{
      display: 'flex', alignItems: 'center', gap: 5, height: 36, padding: soloIcono ? '0 9px' : '0 12px', borderRadius: 10,
      border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, fontWeight: 600,
      cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>
      {!soloIcono && label}
    </button>
  )

  const animado = (key: string, children: React.ReactNode, swipe: boolean) => (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      <AnimatePresence mode="popLayout" custom={navDir} initial={false}>
        <motion.div
          key={key}
          custom={navDir}
          variants={{
            enter: (dir: number) => ({ opacity: 0, x: dir * 24 }),
            center: { opacity: 1, x: 0 },
            exit: (dir: number) => ({ opacity: 0, x: dir * -24 }),
          }}
          initial="enter" animate="center" exit="exit"
          transition={{ duration: reducedMotion ? 0 : DURATION.enter, ease: EASE_OUT }}
          drag={swipe ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.35}
          onDragEnd={(_e, info) => {
            if (info.offset.x < -60) navegar(1)
            else if (info.offset.x > 60) navegar(-1)
          }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  )

  const panelDia = (
    <DiaPanel
      fecha={sel}
      items={porDia[sel] ?? []}
      notas={notaItems[sel] ?? []}
      plazasCustom={plazasCustom}
      puedePlanificar={catalogoEventos.length > 0}
      onAbrir={setDetalle}
      onCrear={() => abrirCrear(sel)}
      onPlanificar={() => setPlanificar(true)}
      onAgregarNota={async t => {
        try { await agregarNotaItem(sel, t) } catch { setToast({ msg: 'No se pudo agregar la nota', variant: 'error' }) }
      }}
      onEliminarNota={id => eliminarNotaItem(id, sel)}
      onEnviarNota={enviarNota}
    />
  )

  return (
    <div ref={rootRef} style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      {/* ── Header: una fila si entra, dos si no (mobile o Coach abierto) ── */}
      <div style={{ background: 'var(--navy)', padding: `var(--header-top) 16px ${headerUnaFila ? 14 : 12}px` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {ancho >= 700 && <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: '0 10px 0 0' }}>Calendario</h1>}
          {navBtn(-1)}
          {navBtn(1)}
          <div aria-live="polite" style={{
            color: '#fff', fontSize: ancho >= 700 ? 17 : 18, fontWeight: 700, padding: '0 6px', whiteSpace: 'nowrap',
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums',
          }}>
            {ancho < 700 ? <h1 style={{ all: 'inherit', margin: 0 }}>{titulo}</h1> : titulo}
          </div>
          {!hoyVisible && btnGhost('Hoy', 'today', irHoy, false)}
          <div style={{ flex: 1 }} />
          {headerUnaFila && <SegmentedTabs tabs={tabs} active={vista} onChange={cambiarVista} style={{ width: 330, flexShrink: 0 }} />}
          {ancho >= 700 && btnGhost('Exportar a mi calendario (.ics)', 'ios_share', exportar, true)}
          {ancho >= 700 && catalogoEventos.length > 0 && btnGhost('Planificar evento', 'celebration', () => setPlanificar(true), !headerUnaFila)}
          <HeaderAction label={ancho >= 700 ? 'Nuevo evento' : 'Nuevo'} onClick={() => abrirCrear(sel)} style={{ height: 36 }} />
        </div>
        {!headerUnaFila && (
          <SegmentedTabs tabs={tabs} active={vista} onChange={cambiarVista} style={{ marginTop: 12 }} />
        )}
      </div>

      {/* Barra de recarga fina en vez de reemplazar la grilla por "Cargando..." */}
      <div aria-hidden style={{ height: 2, background: refreshing ? 'var(--accent)' : 'transparent', opacity: refreshing ? 0.6 : 0, transition: 'opacity .2s' }} />

      <div style={{ padding: ancho >= 700 ? '12px 20px 24px' : '10px 12px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <CapasChips activas={capas} onToggle={toggleCapa} disponibles={capasDisponibles} conteo={conteoCapas} />
          </div>
          {ancho < 700 && (
            <button type="button" onClick={exportar} aria-label="Exportar a mi calendario" title="Exportar (.ics)" style={{
              width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>ios_share</span>
            </button>
          )}
        </div>

        {error && (
          <div role="alert" style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--red-bg)', color: 'var(--red-fg)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>
            <span style={{ flex: 1 }}>No se pudo cargar el calendario.</span>
            <button type="button" onClick={() => refetch()} style={{ background: 'none', border: 'none', color: 'inherit', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Reintentar</button>
          </div>
        )}

        {vacioMes && vista !== 'agenda' && (
          <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--accent)' }}>tips_and_updates</span>
            <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.4 }}>
              {MESES[mes - 1]} no tiene nada todavía. El calendario se llena solo con los menús de Carta, las entregas de Compras y las reservas — o agendá reuniones, inventarios y capacitaciones.
            </span>
            <button type="button" onClick={() => abrirCrear(sel)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
              Crear
            </button>
          </div>
        )}

        {loading ? (
          <div aria-busy style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 4 }}>
            {Array.from({ length: 35 }, (_, i) => (
              <div key={i} className="skeleton-pulse" style={{ height: mesCompacto ? 50 : 110, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }} />
            ))}
          </div>
        ) : vista === 'agenda' ? (
          <div style={{ maxWidth: 780, margin: '0 auto' }}>
            <AgendaLista
              dias={diasAgenda}
              porDia={porDia}
              onAbrir={setDetalle}
              onSeleccionar={f => { irAFecha(f); cambiarVista('mes') }}
              onCrear={f => abrirCrear(f)}
              onMesSiguiente={() => navegar(1)}
            />
          </div>
        ) : (
          <div style={panelLateral ? { display: 'flex', gap: 20, alignItems: 'flex-start' } : { display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {vista === 'mes'
                ? animado(`${mes}-${anio}`, (
                  <MesGrid
                    grilla={grilla}
                    mes={mes}
                    porDia={porDia}
                    notaItems={notaItems}
                    seleccionado={sel}
                    compacto={mesCompacto}
                    onSeleccionar={irAFecha}
                    onCrear={f => abrirCrear(f)}
                    onAbrir={setDetalle}
                    onMover={mover}
                  />
                ), !isDesktop)
                : animado(diasSemana[0], (
                  <SemanaGrid
                    dias={diasSemana}
                    porDia={porDia}
                    seleccionado={sel}
                    onSeleccionar={irAFecha}
                    onCrear={abrirCrear}
                    onAbrir={setDetalle}
                  />
                ), false)}
              {isDesktop && (
                <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text-3)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <span><Kbd>←</Kbd> <Kbd>→</Kbd> navegar</span>
                  <span><Kbd>T</Kbd> hoy</span>
                  <span><Kbd>M</Kbd> <Kbd>S</Kbd> <Kbd>A</Kbd> vistas</span>
                  <span><Kbd>N</Kbd> nuevo evento</span>
                  {vista === 'mes' && <span>Doble clic en un día para crear · arrastrá un evento para moverlo</span>}
                </div>
              )}
            </div>
            <div style={panelLateral ? { width: 340, flexShrink: 0, position: 'sticky', top: 12 } : undefined}>
              {panelDia}
            </div>
          </div>
        )}
      </div>

      <EventoDetalle
        item={detalle}
        autorNombre={detalle?.creado_por ? autores[detalle.creado_por] ?? null : null}
        esMio={!!detalle?.creado_por && detalle.creado_por === user?.id}
        onClose={() => setDetalle(null)}
        onEditar={editar}
        onDuplicar={duplicar}
        onEliminar={eliminar}
        onIr={href => { setDetalle(null); router.push(href) }}
      />
      <EventoForm
        open={form.open}
        editando={!!form.editandoId}
        inicial={form.inicial}
        proveedores={proveedores}
        equipo={equipo}
        puestos={puestos}
        yoId={user?.id ?? null}
        avisadoAt={form.avisadoAt ?? null}
        onClose={() => setForm(s => ({ ...s, open: false }))}
        onGuardar={guardar}
      />
      <PlanificarEventoModal
        open={planificar}
        fecha={sel}
        catalogo={catalogoEventos}
        onClose={() => setPlanificar(false)}
        onActivar={activarEvento}
      />

      {toast && <Toast msg={toast.msg} variant={toast.variant} action={toast.action} onDone={cerrarToast} />}
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      display: 'inline-block', minWidth: 18, padding: '0 5px', borderRadius: 5, border: '1px solid var(--border)',
      background: 'var(--surface)', fontSize: 10.5, fontFamily: 'inherit', fontWeight: 700, color: 'var(--text-2)', textAlign: 'center',
    }}>{children}</kbd>
  )
}
