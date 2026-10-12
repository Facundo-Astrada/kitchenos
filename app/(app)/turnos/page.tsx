'use client'

// Turnos — Registro Preparación (DESIGN.md §2): se arma la semana sentado, no
// durante el servicio. Orquesta components/turnos/: la grilla persona × día
// (lista por día en el celular), el panel del día y la pestaña Fichajes.
// Junta tres fuentes: la planilla (useTurnos), el equipo (useEquipo) y el
// Calendario (useCalendario) — la banda "Agenda" y las notas del día son las
// del Calendario, de solo lectura acá salvo las notas.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import { useEquipo } from '@/lib/hooks/useEquipo'
import { useTurnos, useHorariosTurno, type CambioTurno, type DatosTurno } from '@/lib/hooks/useTurnos'
import { useCalendario, indexarPorDia, type ItemCalendario } from '@/lib/hooks/useCalendario'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { usePlazasCustom } from '@/lib/hooks/usePlazasCustom'
import { useAuth } from '@/lib/auth/context'
import { createClient } from '@/lib/supabase/client'
import { crearNotificacion } from '@/lib/notificaciones/crear'
import { SegmentedTabs, HeaderAction, Toast, EmptyState } from '@/components/ui'
import { useReducedMotion, DURATION, EASE_OUT, tap } from '@/lib/ui/motion'
import { hoy as hoyStr, addDays, lunesDe, etiquetaRango, DIAS_CORTO, dowLunes, parse } from '@/lib/calendario/fechas'
import { CAPAS_DEFAULT, type CapaId } from '@/lib/calendario/capas'
import { CapasChips } from '@/components/calendario/shared'
import {
  semanaDe, indexarTurnos, claveTurno, coberturaDia, avisosPlanilla, horasPersona, horarioDe, rangoCompacto,
  resumenSemanaPersona, firmaSemanaPersona, textoPlanilla, fmtHoras, type CoberturaDia,
} from '@/lib/turnos/planilla'
import { TURNO_CONFIG, TURNO_TIPOS, esTrabajo, normalizarTipo, type HorariosTurno, type TurnoTipo } from '@/lib/turnos/tipos'
import { PlanillaGrid } from '@/components/turnos/PlanillaGrid'
import { PlanillaMobile } from '@/components/turnos/PlanillaMobile'
import { DiaTurnosPanel } from '@/components/turnos/DiaTurnosPanel'
import { TurnoEditor, type CeldaEditando } from '@/components/turnos/TurnoEditor'
import { AvisarModal, HorasMesModal, HorariosModal, type DestinoAvisoTurnos } from '@/components/turnos/Modales'
import { FichajesTab } from '@/components/turnos/FichajesTab'
import { Kbd, type PersonaPlanilla, type Pincel } from '@/components/turnos/shared'

type Tab = 'turnos' | 'fichajes'
type ToastState = { msg: string; variant?: 'default' | 'error'; action?: { label: string; onClick: () => void } } | null
/** Por semana (lunes) → por persona → la huella de lo último que se le avisó. */
type Avisado = Record<string, Record<string, string>>

const LS_CAPAS = 'kc_turnos_capas'
const LS_AVISADO = 'kc_turnos_avisado'
const CAPAS_AGENDA: CapaId[] = ['eventos', 'menus', 'compras', 'reservas', 'feriados']
const SIN_TURNOS = 'sin-turnos'

function leerLS<T>(clave: string, def: T): T {
  if (typeof window === 'undefined') return def
  try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) as T : def } catch { return def }
}
function escribirLS(clave: string, v: unknown) {
  try { localStorage.setItem(clave, JSON.stringify(v)) } catch {}
}

/* Ancho real del área de contenido — con la sidebar y el panel del Coach
   abiertos, "desktop" no dice cuánto lugar hay (ui.md § Columnas por ancho). */
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

export default function TurnosPage() {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const reducedMotion = useReducedMotion()
  const RESTAURANTE_ID = useRestauranteId()
  const { user } = useAuth()
  const { isAdmin, verCostos } = usePermisos()
  const { miembros, puestos, loading: loadingEquipo } = useEquipo()
  const { turnos, loading: loadingTurnos, refreshing, error, fetchRango, refetch, aplicar, fetchSuelto } = useTurnos()
  const { horarios, guardarHorarios } = useHorariosTurno()
  const {
    items, notaItems, refreshing: refreshingCal, fetchRango: fetchAgenda, agregarNotaItem, eliminarNotaItem,
  } = useCalendario()
  const { plazasCustom } = usePlazasCustom()
  const supabase = useMemo(() => createClient(), [])

  const hoy = hoyStr()
  const [lunes, setLunes] = useState(() => lunesDe(hoy))
  const [sel, setSel] = useState(hoy)
  const [navDir, setNavDir] = useState(1)
  const [tab, setTab] = useState<Tab>('turnos')
  const [pincel, setPincel] = useState<Pincel>(null)
  const [capas, setCapas] = useState<CapaId[]>(CAPAS_DEFAULT)
  const [avisado, setAvisado] = useState<Avisado>({})
  const [editando, setEditando] = useState<CeldaEditando | null>(null)
  const [modal, setModal] = useState<'avisar' | 'horas' | 'horarios' | null>(null)
  const [toast, setToast] = useState<ToastState>(null)
  const cerrarToast = useCallback(() => setToast(null), [])
  // Preferencias del browser después de montar (mismo criterio que Calendario:
  // leerlas en el estado inicial desalinea el HTML del server con el cliente).
  useEffect(() => {
    setCapas(leerLS<CapaId[]>(LS_CAPAS, CAPAS_DEFAULT).filter(c => CAPAS_AGENDA.includes(c)))
    setAvisado(leerLS<Avisado>(LS_AVISADO, {}))
  }, [])

  const rootRef = useRef<HTMLDivElement>(null)
  const anchoMedido = useAncho(rootRef)
  const ancho = anchoMedido || (isDesktop ? 1200 : 390)
  const headerUnaFila = ancho >= 1000
  const conGrilla = ancho >= 720
  const panelLateral = ancho >= 1150
  const anchoPanel = ancho >= 1320 ? 340 : 310
  const grillaCompacta = (panelLateral ? ancho - anchoPanel - 60 : ancho - 40) < 900

  /* ── Rango: la semana visible + la anterior (el descanso del lunes y la
     racha de días seguidos se miden contra lo que pasó antes) ── */
  const semana = useMemo(() => semanaDe(lunes), [lunes])
  const domingo = semana[6]
  useEffect(() => { if (RESTAURANTE_ID) fetchRango(addDays(lunes, -7), domingo) }, [RESTAURANTE_ID, lunes, domingo, fetchRango])
  useEffect(() => { if (RESTAURANTE_ID) fetchAgenda(lunes, domingo) }, [RESTAURANTE_ID, lunes, domingo, fetchAgenda])

  /* ── Datos derivados ── */
  const personas = useMemo<PersonaPlanilla[]>(() => {
    const puestoDe = new Map(puestos.map(p => [p.id, p.nombre]))
    const lista = miembros.map(m => ({
      id: m.id,
      nombre: `${m.nombre} ${m.apellido ?? ''}`.trim(),
      puesto: m.puesto_id ? puestoDe.get(m.puesto_id) ?? null : null,
      authUserId: m.auth_user_id,
      esYo: !!user?.id && m.auth_user_id === user.id,
      costoHora: verCostos ? m.costo_hora : null,
    }))
    // Quien no arma la planilla viene a ver la suya: su fila va primera.
    return isAdmin ? lista : [...lista].sort((a, b) => Number(b.esYo) - Number(a.esYo))
  }, [miembros, puestos, user?.id, verCostos, isAdmin])
  const miembroIds = useMemo(() => personas.map(p => p.id), [personas])

  const idx = useMemo(() => indexarTurnos(turnos), [turnos])
  const idxRef = useRef(idx)
  idxRef.current = idx

  const cobertura = useMemo(() => {
    const c: Record<string, CoberturaDia> = {}
    for (const f of semana) c[f] = coberturaDia(f, miembroIds, idx, horarios)
    return c
  }, [semana, miembroIds, idx, horarios])
  const avisos = useMemo(() => (isAdmin ? avisosPlanilla(semana, personas, idx, horarios) : []), [isAdmin, semana, personas, idx, horarios])

  const horasSemana = semana.reduce((s, f) => s + cobertura[f].horas, 0)
  const sinAsignar = semana.reduce((s, f) => s + cobertura[f].sinAsignar, 0)
  const turnosSemana = personas.length * 7 - sinAsignar
  const semanaAnterior = useMemo(() => semanaDe(addDays(lunes, -7)), [lunes])
  const horasAnterior = useMemo(
    () => miembroIds.reduce((s, id) => s + horasPersona(id, semanaAnterior, idx, horarios), 0),
    [miembroIds, semanaAnterior, idx, horarios])
  const hayAnterior = useMemo(
    () => miembroIds.some(id => semanaAnterior.some(f => idx[claveTurno(id, f)])), [miembroIds, semanaAnterior, idx])
  const costo = useMemo(() => {
    let total = 0, sinDato = 0
    for (const p of personas) {
      const h = horasPersona(p.id, semana, idx, horarios)
      if (h === 0) continue
      if (p.costoHora == null) sinDato++
      else total += h * p.costoHora
    }
    return { total, sinDato }
  }, [personas, semana, idx, horarios])
  const yo = personas.find(p => p.esYo)
  // Quién quedó sin nada cargado en la semana (ni franco): el olvido típico al armarla.
  const sinTurnos = useMemo(
    () => personas.filter(p => !semana.some(f => idx[claveTurno(p.id, f)])).map(p => p.nombre.split(' ')[0]),
    [personas, semana, idx])

  /* ── Agenda (reflejo del Calendario) ── */
  const filtrados = useMemo(() => items.filter(it => capas.includes(it.capa)), [items, capas])
  const porDia = useMemo(() => indexarPorDia(filtrados), [filtrados])
  const conteoCapas = useMemo(() => {
    const c: Partial<Record<CapaId, number>> = {}
    for (const it of items) if (it.diaFin >= lunes && it.dia <= domingo) c[it.capa] = (c[it.capa] ?? 0) + 1
    return c
  }, [items, lunes, domingo])
  const conNota = useMemo(() => {
    const c: Record<string, number> = {}
    for (const f of semana) c[f] = notaItems[f]?.length ?? 0
    return c
  }, [semana, notaItems])

  /* ── Navegación ── */
  const navegar = useCallback((dir: number) => {
    setNavDir(dir)
    setLunes(l => addDays(l, dir * 7))
    setSel(s => addDays(s, dir * 7))
  }, [])
  const irAFecha = useCallback((f: string) => {
    const l = lunesDe(f)
    if (l !== lunes) { setNavDir(l > lunes ? 1 : -1); setLunes(l) }
    setSel(f)
  }, [lunes])
  const irHoy = useCallback(() => irAFecha(hoy), [irAFecha, hoy])

  // Deep link desde un aviso: /turnos?fecha=2026-10-12 abre esa semana.
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get('fecha')
    if (f && /^\d{4}-\d{2}-\d{2}$/.test(f)) irAFecha(f)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleCapa = useCallback((id: CapaId) => {
    setCapas(prev => {
      const next = prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
      escribirLS(LS_CAPAS, next)
      return next
    })
  }, [])

  /* ── Cambios sobre la planilla: optimistas, con deshacer ── */
  const pilaRef = useRef<{ gesto: number | null; cambios: CambioTurno[] }[]>([])
  const [hayDeshacer, setHayDeshacer] = useState(false)

  const ejecutar = useCallback(async (cambios: CambioTurno[], gesto: number | null = null): Promise<boolean> => {
    if (cambios.length === 0) return false
    try {
      const inverso = await aplicar(cambios)
      const pila = pilaRef.current
      const tope = pila[pila.length - 1]
      // Las celdas de un mismo arrastre se deshacen juntas.
      if (gesto != null && tope && tope.gesto === gesto) tope.cambios = [...inverso, ...tope.cambios]
      else { pila.push({ gesto, cambios: inverso }); if (pila.length > 50) pila.shift() }
      setHayDeshacer(true)
      return true
    } catch (e) {
      setToast({ msg: 'No se pudo guardar: ' + (e instanceof Error ? e.message : ''), variant: 'error' })
      return false
    }
  }, [aplicar])

  const deshacer = useCallback(async () => {
    const ultimo = pilaRef.current.pop()
    setHayDeshacer(pilaRef.current.length > 0)
    if (!ultimo) return
    try { await aplicar(ultimo.cambios) } catch (e) {
      setToast({ msg: 'No se pudo deshacer: ' + (e instanceof Error ? e.message : ''), variant: 'error' })
    }
  }, [aplicar])
  const accionDeshacer = useMemo(() => ({ label: 'Deshacer', onClick: () => { deshacer() } }), [deshacer])

  // Pincel: el primer clic del gesto decide si se pinta o se despinta (tocar
  // una celda que ya tiene ese turno la vacía), y el resto del arrastre sigue
  // ese modo — nunca pisa el horario a mano de una celda del mismo tipo.
  const modoGestoRef = useRef<{ gesto: number; modo: 'pintar' | 'quitar' } | null>(null)
  const pintar = useCallback((p: PersonaPlanilla, fecha: string, gesto: number) => {
    if (!pincel) return
    const actual = idxRef.current[claveTurno(p.id, fecha)]
    const base = { miembro_id: p.id, fecha }
    if (pincel === 'borrar') {
      if (actual) { tap(); ejecutar([{ ...base, turno: null }], gesto) }
      return
    }
    const tipoActual = normalizarTipo(actual?.turno_tipo)
    if (modoGestoRef.current?.gesto !== gesto) modoGestoRef.current = { gesto, modo: tipoActual === pincel ? 'quitar' : 'pintar' }
    if (modoGestoRef.current.modo === 'quitar') {
      if (tipoActual === pincel) { tap(); ejecutar([{ ...base, turno: null }], gesto) }
      return
    }
    if (tipoActual === pincel) return
    const def = esTrabajo(pincel) ? horarios[pincel as keyof HorariosTurno] : null
    tap()
    ejecutar([{ ...base, turno: { turno_tipo: pincel, hora_entrada: def?.[0] ?? null, hora_salida: def?.[1] ?? null, notas: null } }], gesto)
  }, [pincel, horarios, ejecutar])

  const abrirEditor = useCallback((persona: PersonaPlanilla, fecha: string) => {
    setSel(fecha)
    setEditando({ persona, fecha, turno: idxRef.current[claveTurno(persona.id, fecha)] })
  }, [])

  const guardarEditor = async (datos: DatosTurno, fechas: string[]) => {
    if (!editando) return
    const { persona, fecha } = editando
    setEditando(null)
    // La nota es del turno que se abrió, no de todos los días repetidos.
    const ok = await ejecutar(fechas.map(f => ({ miembro_id: persona.id, fecha: f, turno: f === fecha ? datos : { ...datos, notas: null } })))
    if (ok && fechas.length > 1) setToast({ msg: `Turno cargado en ${fechas.length} días`, action: accionDeshacer })
  }

  const quitarEditor = async () => {
    if (!editando) return
    const { persona, fecha } = editando
    setEditando(null)
    if (await ejecutar([{ miembro_id: persona.id, fecha, turno: null }])) setToast({ msg: 'Turno quitado', action: accionDeshacer })
  }

  // Rellena la semana visible con la anterior, corrida 7 días. Pisa lo que
  // coincida (es "rellenar", no un merge) y se puede deshacer entero: por eso
  // no pregunta antes (DESIGN.md §7, undo > confirmación).
  const copiarSemana = async () => {
    const cambios: CambioTurno[] = []
    for (const id of miembroIds) for (const f of semanaAnterior) {
      const t = idx[claveTurno(id, f)]
      const tipo = normalizarTipo(t?.turno_tipo)
      if (t && tipo) cambios.push({ miembro_id: id, fecha: addDays(f, 7), turno: { turno_tipo: tipo, hora_entrada: t.hora_entrada, hora_salida: t.hora_salida, notas: null } })
    }
    if (cambios.length === 0) { setToast({ msg: 'La semana anterior no tiene turnos cargados' }); return }
    if (await ejecutar(cambios)) setToast({ msg: `${cambios.length} turnos copiados de la semana anterior`, action: accionDeshacer })
  }

  /* ── Avisar al equipo: un aviso por persona con su semana, solo a quien le
     cambió algo desde el último aviso (la huella se guarda en este browser) ── */
  const etiqueta = etiquetaRango(lunes, domingo)
  const firmas = useMemo(
    () => Object.fromEntries(personas.map(p => [p.id, firmaSemanaPersona(p.id, semana, idx, horarios)])),
    [personas, semana, idx, horarios])
  const aviso = useMemo(() => {
    const yaAvisado = avisado[lunes] ?? {}
    const destinos: DestinoAvisoTurnos[] = []
    const sinUsuario: string[] = []
    let sinCambios = 0
    for (const p of personas) {
      const resumen = resumenSemanaPersona(p.id, semana, idx, horarios)
      const antes = yaAvisado[p.id]
      // Sin turnos: solo interesa si antes se le había avisado alguno.
      if (!resumen && (!antes || antes === SIN_TURNOS)) continue
      if (p.esYo) continue
      if (!p.authUserId) { if (resumen) sinUsuario.push(p.nombre.split(' ')[0]); continue }
      if (antes === (resumen ? firmas[p.id] : SIN_TURNOS)) { sinCambios++; continue }
      destinos.push({ persona: p, resumen: resumen || 'Se quitaron tus turnos de esta semana.' })
    }
    return { destinos, sinUsuario, sinCambios }
  }, [avisado, lunes, personas, semana, idx, horarios, firmas])

  const confirmarAviso = async () => {
    if (!RESTAURANTE_ID) return
    const { destinos } = aviso
    await Promise.all(destinos.map(d => crearNotificacion(supabase, {
      restauranteId: RESTAURANTE_ID,
      usuarioId: d.persona.authUserId!,
      tipo: 'turno_asignado',
      titulo: `Tus turnos del ${etiqueta}`,
      cuerpo: d.resumen,
      link: `/turnos?fecha=${lunes}`,
    })))
    const limite = addDays(hoy, -35)
    const next: Avisado = Object.fromEntries(Object.entries(avisado).filter(([l]) => l >= limite))
    next[lunes] = { ...(avisado[lunes] ?? {}) }
    for (const d of destinos) {
      next[lunes][d.persona.id] = resumenSemanaPersona(d.persona.id, semana, idx, horarios) ? firmas[d.persona.id] : SIN_TURNOS
    }
    setAvisado(next)
    escribirLS(LS_AVISADO, next)
    setModal(null)
    setToast({ msg: `Semana avisada a ${destinos.length} ${destinos.length === 1 ? 'persona' : 'personas'}` })
  }

  const compartir = async () => {
    const texto = textoPlanilla(semana, personas, idx, horarios)
    try {
      await navigator.clipboard.writeText(texto)
      setToast({ msg: 'Planilla copiada — pegala en el grupo del equipo' })
    } catch {
      setToast({ msg: 'No se pudo copiar la planilla', variant: 'error' })
    }
  }

  /* ── Atajos de teclado (desktop) ── */
  const hayModal = !!editando || !!modal
  useEffect(() => {
    if (!isDesktop || tab !== 'turnos') return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (hayModal) return
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return
      const k = e.key.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && k === 'z') { if (isAdmin) deshacer() }
      else if (e.metaKey || e.ctrlKey || e.altKey) return
      else if (e.key === 'ArrowLeft') navegar(-1)
      else if (e.key === 'ArrowRight') navegar(1)
      else if (k === 't') irHoy()
      else if (e.key === 'Escape') setPincel(null)
      else if (isAdmin && k >= '1' && k <= '5') setPincel(p => (p === TURNO_TIPOS[Number(k) - 1] ? null : TURNO_TIPOS[Number(k) - 1]))
      else if (isAdmin && (k === '6' || e.key === 'Backspace')) setPincel(p => (p === 'borrar' ? null : 'borrar'))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isDesktop, tab, hayModal, isAdmin, navegar, irHoy, deshacer])

  /* ── Contexto del Coach: la semana que se está armando ── */
  useEffect(() => {
    try {
      localStorage.setItem('kc_screen_context', JSON.stringify({
        screen: 'turnos',
        tab,
        semana: { desde: lunes, hasta: domingo },
        diaSeleccionado: sel,
        totalMiembros: personas.length,
        horasPlanificadas: Math.round(horasSemana),
        celdasSinAsignar: sinAsignar,
        coberturaPorDia: semana.map(f => ({
          dia: f, personas: cobertura[f].personas, horas: Math.round(cobertura[f].horas),
          manana: cobertura[f].porTipo.mañana, tarde: cobertura[f].porTipo.tarde, noche: cobertura[f].porTipo.noche,
        })),
        paraRevisar: avisos.slice(0, 12).map(a => ({ quien: a.nombre, dia: a.fecha, aviso: a.texto })),
        agendaSemana: filtrados.filter(it => it.diaFin >= lunes && it.dia <= domingo).slice(0, 25)
          .map(it => ({ titulo: it.titulo, desde: it.dia, hasta: it.diaFin !== it.dia ? it.diaFin : undefined, capa: it.capa, detalle: it.meta })),
        notasDiaSeleccionado: (notaItems[sel] ?? []).map(n => n.texto).slice(0, 15),
        horariosHabituales: horarios,
      }))
    } catch {}
    return () => { try { localStorage.removeItem('kc_screen_context') } catch {} }
  }, [tab, lunes, domingo, sel, personas.length, horasSemana, sinAsignar, semana, cobertura, avisos, filtrados, notaItems, horarios])

  /* ── Render ── */
  const loading = loadingEquipo || loadingTurnos
  const titulo = `${etiqueta} ${domingo.slice(0, 4)}`
  const hoyVisible = semana.includes(hoy)
  const tabs = [
    { id: 'turnos' as const, label: 'Turnos', icon: 'calendar_view_week' },
    { id: 'fichajes' as const, label: 'Fichajes', icon: 'fingerprint' },
  ]

  const navBtn = (dir: number) => (
    <button type="button" onClick={() => navegar(dir)} aria-label={dir < 0 ? 'Semana anterior' : 'Semana siguiente'} style={{
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
  // Siempre en su lugar (apagado si no hay nada que deshacer): que aparezca y
  // desaparezca correría los pinceles bajo el dedo.
  const btnDeshacer = (
    <button type="button" onClick={() => { deshacer() }} disabled={!hayDeshacer} title="Deshacer el último cambio" aria-label="Deshacer el último cambio" style={{
      width: 34, height: 34, borderRadius: 99, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)',
      cursor: hayDeshacer ? 'pointer' : 'default', opacity: hayDeshacer ? 1 : 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>undo</span>
    </button>
  )

  const enTurnos = tab === 'turnos'
  const herramientas: [string, string, () => void][] = [
    ['Copiar la planilla como texto', 'ios_share', compartir],
    ['Horas del mes', 'functions', () => setModal('horas')],
    ...(isAdmin ? [['Horarios habituales', 'tune', () => setModal('horarios')] as [string, string, () => void]] : []),
  ]

  const kpis: { label: string; valor: string; sub?: string; atencion?: boolean }[] = isAdmin ? [
    {
      label: 'Horas de la semana', valor: fmtHoras(horasSemana),
      sub: horasAnterior > 0 ? `${horasSemana >= horasAnterior ? '+' : '−'}${fmtHoras(Math.abs(horasSemana - horasAnterior))} vs. semana anterior` : `${turnosSemana} turnos cargados`,
    },
    ...(verCostos && costo.total > 0 ? [{
      label: 'Costo estimado', valor: '$' + Math.round(costo.total).toLocaleString('es-AR'),
      sub: costo.sinDato > 0 ? `${costo.sinDato} sin costo por hora cargado` : 'Horas × costo por hora',
    }] : []),
    {
      label: 'Equipo con turnos', valor: `${personas.length - sinTurnos.length} de ${personas.length}`,
      sub: sinTurnos.length === 0 ? 'Todos tienen algo cargado'
        : `Falta${sinTurnos.length > 1 ? 'n' : ''}: ${sinTurnos.slice(0, 3).join(', ')}${sinTurnos.length > 3 ? ` y ${sinTurnos.length - 3} más` : ''}`,
    },
    ...(avisos.length > 0 ? [{ label: 'Para revisar', valor: String(avisos.length), sub: 'Descansos cortos, rachas, horas', atencion: true }] : []),
  ] : yo ? (() => {
    const proximo = semana.filter(f => f >= hoy || !hoyVisible).find(f => horarioDe(idx[claveTurno(yo.id, f)], horarios))
    const h = proximo ? horarioDe(idx[claveTurno(yo.id, proximo)], horarios) : null
    return [
      {
        label: hoyVisible ? 'Tu próximo turno' : 'Tu primer turno',
        valor: proximo && h ? `${DIAS_CORTO[dowLunes(proximo)]} ${parse(proximo).getDate()}` : '—',
        sub: h ? `${TURNO_CONFIG[h.tipo].fullLabel} ${rangoCompacto(h.entrada, h.salida)}` : 'Sin turnos cargados esta semana',
      },
      { label: 'Tus horas esta semana', valor: fmtHoras(horasPersona(yo.id, semana, idx, horarios)) },
    ]
  })() : []

  const pinceles: { id: Exclude<Pincel, null>; label: string; icon: string; color: string; horas?: string }[] = [
    ...TURNO_TIPOS.map(tp => {
      const def = esTrabajo(tp) ? horarios[tp as keyof HorariosTurno] : null
      return { id: tp as TurnoTipo, label: TURNO_CONFIG[tp].fullLabel, icon: TURNO_CONFIG[tp].icon, color: TURNO_CONFIG[tp].color, horas: def ? rangoCompacto(def[0], def[1]) : undefined }
    }),
    ...(isAdmin ? [{ id: 'borrar' as const, label: 'Borrar', icon: 'ink_eraser', color: '#64748b' }] : []),
  ]

  const planilla = conGrilla ? (
    <PlanillaGrid
      semana={semana} personas={personas} idx={idx} horarios={horarios} cobertura={cobertura} avisos={avisos}
      porDia={porDia} conNota={conNota} seleccionado={sel} pincel={pincel} editable={isAdmin} compacta={grillaCompacta}
      onSeleccionar={setSel} onAbrir={abrirEditor} onPintar={pintar}
    />
  ) : (
    <PlanillaMobile
      semana={semana} personas={personas} idx={idx} horarios={horarios} cobertura={cobertura} avisos={avisos}
      porDia={porDia} conNota={conNota} seleccionado={sel} pincel={pincel} editable={isAdmin}
      onSeleccionar={setSel} onAbrir={abrirEditor} onPintar={pintar}
    />
  )

  return (
    <div ref={rootRef} style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      {/* ── Header: una fila si entra, dos si no (mobile o Coach abierto) ── */}
      <div style={{ background: 'var(--navy)', padding: `var(--header-top) 16px ${headerUnaFila ? 14 : 12}px` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36 }}>
          {(ancho >= 700 || !enTurnos) && <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: '0 10px 0 0' }}>Turnos</h1>}
          {enTurnos && (
            <>
              {navBtn(-1)}
              {navBtn(1)}
              <div aria-live="polite" style={{
                color: '#fff', fontSize: ancho >= 700 ? 17 : 18, fontWeight: 700, padding: '0 6px', whiteSpace: 'nowrap',
                minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums',
              }}>
                {ancho < 700 ? <h1 style={{ all: 'inherit', margin: 0 }}>{titulo}</h1> : titulo}
              </div>
              {!hoyVisible && btnGhost('Hoy', 'today', irHoy)}
            </>
          )}
          <div style={{ flex: 1 }} />
          {headerUnaFila && <SegmentedTabs tabs={tabs} active={tab} onChange={setTab} style={{ width: 250, flexShrink: 0 }} />}
          {enTurnos && ancho >= 700 && herramientas.map(([label, icon, fn]) => <span key={label} style={{ display: 'flex' }}>{btnGhost(label, icon, fn, true)}</span>)}
          {enTurnos && isAdmin && ancho >= 700 && btnGhost('Copiar semana anterior', 'content_copy', copiarSemana, ancho < 1180)}
          {enTurnos && isAdmin && personas.length > 0 && (
            <HeaderAction
              label={(ancho >= 860 ? 'Avisar al equipo' : 'Avisar') + (aviso.destinos.length ? ` · ${aviso.destinos.length}` : '')}
              icon="campaign" onClick={() => setModal('avisar')} style={{ height: 36 }}
            />
          )}
        </div>
        {!headerUnaFila && <SegmentedTabs tabs={tabs} active={tab} onChange={setTab} style={{ marginTop: 12 }} />}
      </div>

      {/* Barra de recarga fina en vez de reemplazar la grilla por "Cargando..." */}
      <div aria-hidden style={{ height: 2, background: 'var(--accent)', opacity: enTurnos && (refreshing || refreshingCal) ? 0.6 : 0, transition: 'opacity .2s' }} />

      <div style={{ padding: ancho >= 700 ? '12px 20px 24px' : '10px 12px 24px' }}>
        {!enTurnos ? (
          <FichajesTab miembros={miembros} isAdmin={isAdmin} dosColumnas={ancho >= 900}
            onToast={(msg, err) => setToast({ msg, variant: err ? 'error' : 'default' })} />
        ) : loading ? (
          <div aria-busy style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="skeleton-pulse" style={{ height: 64, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: 6 }} />
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="skeleton-pulse" style={{ height: 54, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }} />
            ))}
          </div>
        ) : personas.length === 0 ? (
          <EmptyState
            icon="groups" title="Todavía no hay equipo cargado"
            subtitle="Sumá a las personas en Organigrama y volvé para armar sus turnos."
            cta={isAdmin ? { label: 'Ir a Organigrama', onClick: () => router.push('/organigrama') } : undefined}
          />
        ) : (
          <>
            {error && (
              <div role="alert" style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--red-bg)', color: 'var(--red-fg)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>
                <span style={{ flex: 1 }}>No se pudieron cargar los turnos.</span>
                <button type="button" onClick={() => refetch()} style={{ background: 'none', border: 'none', color: 'inherit', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Reintentar</button>
              </div>
            )}

            {/* ── KPIs de la semana ── */}
            {kpis.length > 0 && (
              <div className="hide-scrollbar" style={{ display: 'flex', gap: 10, marginBottom: 12, overflowX: 'auto' }}>
                {kpis.map(k => (
                  <div key={k.label} style={{
                    flex: '1 1 0', minWidth: conGrilla ? 150 : 138, maxWidth: 270, padding: conGrilla ? '11px 14px' : '9px 12px', borderRadius: 12,
                    background: k.atencion ? 'var(--amber-bg)' : 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-1)',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: k.atencion ? 'var(--amber-fg)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>{k.label}</div>
                    <div style={{ fontSize: conGrilla ? 25 : 20, fontWeight: 700, color: k.atencion ? 'var(--amber-fg)' : 'var(--text-1)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.25, whiteSpace: 'nowrap' }}>{k.valor}</div>
                    {k.sub && <div style={{ fontSize: 11.5, color: k.atencion ? 'var(--amber-fg)' : 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.sub}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* ── Pincel (o leyenda, para quien no edita) + capas de la agenda ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px 16px', marginBottom: 10, flexWrap: 'wrap' }}>
              <div className="hide-scrollbar" role={isAdmin ? 'toolbar' : undefined} aria-label={isAdmin ? 'Pincel de turnos' : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: conGrilla ? 'wrap' : 'nowrap', overflowX: conGrilla ? 'visible' : 'auto', padding: '3px 3px 4px', margin: '-3px -3px -2px', maxWidth: '100%' }}>
                {isAdmin && !conGrilla && btnDeshacer}
                {isAdmin && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', flexShrink: 0, marginRight: 2 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 17 }}>brush</span>Pintar
                  </span>
                )}
                {pinceles.map(p => {
                  const on = pincel === p.id
                  const contenido = (
                    <>
                      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16, color: p.color }}>{p.icon}</span>
                      {p.label}
                      {p.horas && <span style={{ fontWeight: 500, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{p.horas}</span>}
                    </>
                  )
                  const base: React.CSSProperties = {
                    display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '6px 12px 6px 9px', borderRadius: 99,
                    fontSize: 12.5, fontWeight: on ? 700 : 600, color: 'var(--text-1)', whiteSpace: 'nowrap',
                    border: `1px solid ${on ? p.color : 'var(--border)'}`, background: on ? p.color + '22' : 'var(--surface)',
                    boxShadow: on ? `0 0 0 2px ${p.color}40` : 'none',
                  }
                  return isAdmin
                    ? <button key={p.id} type="button" aria-pressed={on} className="turno-pincel" onClick={() => setPincel(on ? null : p.id)} style={{ ...base, cursor: 'pointer', fontFamily: 'inherit' }}>{contenido}</button>
                    : <span key={p.id} style={{ ...base, border: 'none', background: 'transparent', padding: '6px 8px 6px 0' }}>{contenido}</span>
                })}
                {isAdmin && conGrilla && btnDeshacer}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, marginLeft: conGrilla ? 'auto' : 0, maxWidth: '100%' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <CapasChips activas={capas} onToggle={toggleCapa} disponibles={CAPAS_AGENDA} conteo={conteoCapas} />
                </div>
              </div>
            </div>

            {isAdmin && pincel && (
              <div style={{ marginBottom: 10, fontSize: 12.5, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>info</span>
                {pincel === 'borrar'
                  ? 'Tocá un turno para borrarlo.'
                  : `Tocá un casillero para cargar ${TURNO_CONFIG[pincel].fullLabel.toLowerCase()}${conGrilla && isDesktop ? ' (o arrastrá para cargar varios)' : ''}. Tocar de nuevo lo quita.`}
                <button type="button" onClick={() => setPincel(null)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: 'var(--accent)' }}>Soltar pincel</button>
              </div>
            )}

            {isAdmin && turnosSemana === 0 && !pincel && (
              <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--accent)' }}>tips_and_updates</span>
                <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.4 }}>
                  Esta semana todavía no tiene turnos. Elegí un turno en «Pintar» y tocá los casilleros{hayAnterior ? ', o arrancá de la semana anterior.' : '.'}
                </span>
                {hayAnterior && (
                  <button type="button" onClick={copiarSemana} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                    Copiar semana anterior
                  </button>
                )}
              </div>
            )}

            <div style={panelLateral ? { display: 'flex', gap: 20, alignItems: 'flex-start' } : { display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ flex: 1, minWidth: 0, width: panelLateral ? undefined : '100%' }}>
                <div style={{ position: 'relative', overflow: 'hidden', margin: -4, padding: 4 }}>
                  <AnimatePresence mode="popLayout" custom={navDir} initial={false}>
                    <motion.div
                      key={lunes}
                      custom={navDir}
                      variants={{
                        enter: (dir: number) => ({ opacity: 0, x: dir * 24 }),
                        center: { opacity: 1, x: 0 },
                        exit: (dir: number) => ({ opacity: 0, x: dir * -24 }),
                      }}
                      initial="enter" animate="center" exit="exit"
                      transition={{ duration: reducedMotion ? 0 : DURATION.enter, ease: EASE_OUT }}
                    >
                      {planilla}
                    </motion.div>
                  </AnimatePresence>
                </div>
                {ancho < 700 && (
                  // En el celular no hay tooltip que explique un ícono suelto: van con su texto.
                  <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {[...(isAdmin ? [['Copiar semana anterior', 'content_copy', copiarSemana] as [string, string, () => void]] : []), ...herramientas].map(([label, icon, fn]) => (
                      <button key={label} type="button" onClick={fn} style={{
                        display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)',
                        background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>{icon}</span>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {isDesktop && conGrilla && (
                  <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text-3)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <span><Kbd>←</Kbd> <Kbd>→</Kbd> semana</span>
                    <span><Kbd>T</Kbd> hoy</span>
                    {isAdmin && <span><Kbd>1</Kbd>–<Kbd>5</Kbd> pincel · <Kbd>6</Kbd> borrar · <Kbd>Esc</Kbd> soltar</span>}
                    {isAdmin && <span><Kbd>Ctrl</Kbd> <Kbd>Z</Kbd> deshacer</span>}
                    <span>Tocá un día para ver su agenda y sus notas</span>
                  </div>
                )}
              </div>
              <div className="hide-scrollbar" style={panelLateral
                ? { width: anchoPanel, flexShrink: 0, position: 'sticky', top: 12, maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto' }
                : undefined}>
                <motion.div key={sel} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? 0 : DURATION.base, ease: EASE_OUT }}>
                  <DiaTurnosPanel
                    fecha={sel} personas={personas} idx={idx} horarios={horarios} cobertura={cobertura[sel]}
                    items={porDia[sel] ?? []} notas={notaItems[sel] ?? []} avisos={avisos} plazasCustom={plazasCustom} puedeAnotar={isAdmin}
                    onAbrirEvento={(it: ItemCalendario) => router.push(`/calendario?fecha=${it.dia < sel ? sel : it.dia}`)}
                    onIrCalendario={() => router.push(`/calendario?fecha=${sel}`)}
                    onAgregarNota={async t => {
                      try { await agregarNotaItem(sel, t) } catch { setToast({ msg: 'No se pudo agregar la nota', variant: 'error' }) }
                    }}
                    onEliminarNota={id => eliminarNotaItem(id, sel)}
                    onSeleccionar={setSel}
                  />
                </motion.div>
              </div>
            </div>
          </>
        )}
      </div>

      <TurnoEditor celda={editando} semana={semana} horarios={horarios} onClose={() => setEditando(null)} onGuardar={guardarEditor} onQuitar={quitarEditor} />
      <AvisarModal open={modal === 'avisar'} etiqueta={etiqueta} destinos={aviso.destinos} sinUsuario={aviso.sinUsuario} sinCambios={aviso.sinCambios}
        onClose={() => setModal(null)} onConfirmar={confirmarAviso} />
      <HorasMesModal open={modal === 'horas'} mes={Number(sel.slice(5, 7))} anio={Number(sel.slice(0, 4))} personas={personas} horarios={horarios}
        verCostos={verCostos} cargar={fetchSuelto} onClose={() => setModal(null)} />
      <HorariosModal open={modal === 'horarios'} horarios={horarios} onClose={() => setModal(null)}
        onGuardar={async h => {
          try { await guardarHorarios(h); setModal(null); setToast({ msg: 'Horarios habituales guardados' }) }
          catch { setToast({ msg: 'No se pudieron guardar los horarios', variant: 'error' }) }
        }} />

      {toast && <Toast msg={toast.msg} variant={toast.variant} action={toast.action} onDone={cerrarToast} />}
    </div>
  )
}
