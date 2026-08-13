'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { useChecklist } from '@/lib/hooks/useChecklist'
import { useRecetasLite } from '@/lib/hooks/useRecetasLite'
import { useTareas } from '@/lib/hooks/useTareas'
import { createClient } from '@/lib/supabase/client'
import { ProductoMiseCard, PLAZA_TO_SECCION, MISE_PRIO_TO_TAREA } from '@/components/mise/ProductoMiseCard'
import type { PlatoPlaza, CrearTareaParams } from '@/components/mise/ProductoMiseCard'
import { MiseGuiaSheet } from '@/components/mise/MiseGuiaSheet'
import type { MiseGuiaFoco } from '@/components/mise/MiseGuiaSheet'
import { MiseTourOverlay } from '@/components/mise/MiseTourOverlay'
import { useProduccionRegistros } from '@/lib/hooks/useProduccionRegistros'
import { useHaccp } from '@/lib/hooks/useHaccp'
import { useFichaje } from '@/lib/hooks/useFichaje'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { usePlazasCustom } from '@/lib/hooks/usePlazasCustom'
import { useTurnosServicio } from '@/lib/hooks/useTurnosServicio'
import { useCierresTurno } from '@/lib/hooks/useCierresTurno'
import { useNotasPlaza } from '@/lib/hooks/useNotasPlaza'
import { NotasPlaza } from '@/components/ops/NotasPlaza'
import { todasLasPlazas, plazaLabel, plazaIcon } from '@/lib/constants'
import { hoyOperativo, sumarDias, turnoVigente, turnoAnterior, turnoSiguiente, encodeTurnoFase, cierreIncompleto, fechaEnTz } from '@/lib/ops/turnos'
import PhotoPicker from '@/components/ui/PhotoPicker'
import SectionEditor from '@/components/checklist/SectionEditor'
import type { Plaza, MisePlaceItem, MisePrioridad, ChecklistSeccionConfig, RutinaFrecuencia, ChecklistRutina, ChecklistRutinaRegistro, RutinaCondicion } from '@/types'

// ── Constants ──
const PLAZAS: Plaza[] = ['parrilla', 'frios', 'calientes', 'pase', 'pasteleria', 'panaderia', 'general']
const PLAZA_LABELS: Record<Plaza, string> = {
  parrilla: 'Parrilla', frios: 'Fríos', calientes: 'Calientes',
  pase: 'Pase', pasteleria: 'Pastelería', panaderia: 'Panadería',
  general: 'General',
}
const UNIDADES = ['u', 'kg', 'g', 'l', 'ml', 'pax', 'porc', 'bandeja', 'gastro', 'tupper']

const PRIO_CYCLE: MisePrioridad[] = ['sp', 'p', 'ref', 'chk']
const PRIO_CFG: Record<string, { label: string; color: string; bg: string }> = {
  sp:  { label: 'SP',  color: '#ef4444', bg: 'rgba(239,68,68,.13)' },
  p:   { label: 'P',   color: '#f97316', bg: 'rgba(249,115,22,.13)' },
  ref: { label: 'REF', color: '#3b82f6', bg: 'rgba(59,130,246,.13)' },
  chk: { label: 'OK',  color: '#22c55e', bg: 'rgba(34,197,94,.13)' },
}
const FREQ_LABELS: Record<RutinaFrecuencia, string> = {
  diaria: 'Diaria', semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual',
}
type Tab = 'apertura' | 'cierre' | 'rutina'
// Referencia estable para las tarjetas sin plazas asociadas (ver memo de ProductoMiseCard).
const SIN_PLAZAS: PlatoPlaza[] = []
function fmtFecha(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}
function getSeccionColor(nombre: string): string {
  const n = nombre.toLowerCase()
  if (n.includes('heladera')) return '#378ADD'
  if (n.includes('seco') || n.includes('tupper')) return '#EF9F27'
  if (n.includes('congel')) return '#1D9E75'
  if (n.includes('estaci')) return '#7F77DD'
  return '#94a3b8'
}
function daysAgo(isoStr: string | null) {
  if (!isoStr) return null
  const d = Math.floor((Date.now() - new Date(isoStr).getTime()) / 86400000)
  if (d === 0) return 'Hoy'
  if (d === 1) return 'Ayer'
  return `Hace ${d} días`
}
function nextPrio(current: string): MisePrioridad {
  const idx = PRIO_CYCLE.indexOf(current as MisePrioridad)
  return PRIO_CYCLE[(idx + 1) % PRIO_CYCLE.length]
}

// En Modo Control el badge solo recorre las prioridades de producción: el tilde
// verde ya dice "esto está", así que un 'chk' verde al lado del check se leería
// como un segundo tilde. Si el ítem venía en 'chk', el primer tap cae en SP.
const PRIO_CYCLE_CONTROL: MisePrioridad[] = ['sp', 'p', 'ref']
function nextPrioControl(current: string): MisePrioridad {
  const idx = PRIO_CYCLE_CONTROL.indexOf(current as MisePrioridad)
  return PRIO_CYCLE_CONTROL[(idx + 1) % PRIO_CYCLE_CONTROL.length]
}

const btnReset: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'inherit',
}

// ══════════════════════════════════════════════════════════════
export default function ChecklistPage({ embedded }: { embedded?: boolean } = {}) {
  const router = useRouter()
  const { perfil: authPerfil } = useAuth()
  const {
    secciones, items, registros, rutinas, rutinaRegistros, loading,
    fetchAll, fetchRegistros,
    agregarSeccion, actualizarSeccion, eliminarSeccion, reordenarSecciones,
    agregarItem, actualizarItem, eliminarItem, upsertRegistro,
    agregarRutina, actualizarRutina, eliminarRutina, toggleRutina,
    registrarAuditoriaRutina, guardarAuditoriaPasada,
  } = useChecklist()
  const { recetas } = useRecetasLite()
  const { tareas, agregarTarea, cambiarEstado: cambiarEstadoTarea } = useTareas()
  const { rendimientoMap } = useProduccionRegistros()
  // Solo se usa para crear el vencimiento desde la etiqueta — sin descargar HACCP.
  const { crearVencimiento } = useHaccp({ soloEscritura: true })
  const { fichajeAbierto, marcarSalida } = useFichaje()
  const { turnosActivos } = useTurnosServicio()
  const { entregados, entregaDe, entregarPlaza } = useCierresTurno()
  const { notasDe, agregar: agregarNota, eliminar: eliminarNota } = useNotasPlaza()

  // Build receta info map (id → { porciones, pesoPorcion, vidaUtilDias }) for MiseCard display
  const recetaInfoMap = useMemo(() => {
    const m: Record<string, { porciones?: number | null; pesoPorcion?: number | null; vidaUtilDias?: number | null }> = {}
    for (const r of recetas) {
      const ings = r.ingredientes ?? []
      const porciones = r.porciones ?? null
      let pesoPorcion: number | null = null
      if (porciones && porciones > 0 && ings.length > 0) {
        const UNIDADES_G: Record<string, number> = { g: 1, kg: 1000, ml: 1, lt: 1000, l: 1000 }
        const totalG = ings.reduce((s, i) => {
          const factor = UNIDADES_G[i.unidad ?? ''] ?? 0
          return s + (parseFloat(String(i.cantidad)) || 0) * factor
        }, 0)
        if (totalG > 0) pesoPorcion = Math.round(totalG / porciones)
      }
      m[r.id] = { porciones, pesoPorcion, vidaUtilDias: r.vida_util_dias ?? null }
    }
    return m
  }, [recetas])

  // Nombre real del restaurante para la etiqueta impresa (evita el placeholder "KitchenOS")
  const RESTAURANTE_ID = useRestauranteId()
  const [restauranteNombre, setRestauranteNombre] = useState('')
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const supabase = createClient()
    supabase.from('restaurantes').select('nombre').eq('id', RESTAURANTE_ID).maybeSingle()
      .then(({ data }) => setRestauranteNombre(data?.nombre ?? ''))
  }, [RESTAURANTE_ID])

  // ── plato_plazas map (receta_id → PlatoPlaza[]) ──────────────
  const [platoPlazoMap, setPlatoPlazoMap] = useState<Record<string, PlatoPlaza[]>>({})

  useEffect(() => {
    const supabase = createClient()
    supabase.from('plato_plazas').select('*').then(({ data }) => {
      if (!data) return
      const map: Record<string, PlatoPlaza[]> = {}
      for (const pp of data as PlatoPlaza[]) {
        if (!map[pp.plato_id]) map[pp.plato_id] = []
        map[pp.plato_id].push(pp)
      }
      setPlatoPlazoMap(map)
    })
  }, [])

  const { plazasCustom } = usePlazasCustom()

  // Plazas asignadas al usuario (equipo_miembros.plaza_asignada, coma-separadas)
  const userPlazas: Plaza[] = useMemo(() => {
    if (!authPerfil?.plaza_asignada) return []
    return authPerfil.plaza_asignada
      .split(',')
      .map((p: string) => p.trim())
      .filter((p: string) => (PLAZAS as readonly string[]).includes(p)) as Plaza[]
  }, [authPerfil])

  // Plazas a mostrar en el selector: si tiene ≥2 asignadas, solo esas + general
  // (las custom son de producción/mise, no roles de staff — no aplican acá)
  const plazasForSelector: Plaza[] = useMemo(() => {
    if (userPlazas.length < 2) return todasLasPlazas(plazasCustom)
    return userPlazas.includes('general') ? userPlazas : [...userPlazas, 'general']
  }, [userPlazas, plazasCustom])

  const autoPlaza: Plaza | null = (() => {
    if (userPlazas.length === 1) return userPlazas[0]
    if (userPlazas.length > 1) return null  // mostrar selector
    return (PLAZAS as readonly string[]).includes(authPerfil?.rol ?? '') ? (authPerfil!.rol as Plaza) : null
  })()
  const [plaza, setPlaza] = useState<Plaza | null>(autoPlaza)

  // Auto-select cuando auth carga después del mount (authPerfil null al inicio)
  useEffect(() => {
    if (plaza !== null) return
    if (!authPerfil) return
    if (userPlazas.length === 1) { setPlaza(userPlazas[0]); return }
    if (userPlazas.length > 1) return  // mostrar selector con sus plazas
    if ((PLAZAS as readonly string[]).includes(authPerfil.rol)) {
      setPlaza(authPerfil.rol as Plaza)
    }
  }, [authPerfil, plaza, userPlazas])
  const [tab, setTab] = useState<Tab>('apertura')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [showAddSheet, setShowAddSheet] = useState<string | null>(null)
  const [showSectionEditor, setShowSectionEditor] = useState(false)
  const [showAddRutina, setShowAddRutina] = useState(false)
  const [editRutina, setEditRutina] = useState<ChecklistRutina | null>(null)
  // Guía de uso del mise ("?" del header). `foco` abre directo en una sección.
  const [guia, setGuia] = useState<{ foco: MiseGuiaFoco } | null>(null)
  // Recorrido guiado — la misma guía señalada sobre la pantalla real.
  const [tourOn, setTourOn] = useState(false)
  const [fotoAuditoriaPend, setFotoAuditoriaPend] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<string | null>(null)
  const [pendientesApertura, setPendientesApertura] = useState<MisePlaceItem[]>([])
  const [regCierreAnteriorMap, setRegCierreAnteriorMap] = useState<Record<string, number | null>>({})
  // Arrastre del turno anterior (Fase 3) — items que el turno previo dejó sin
  // cerrar (lista granular, normal que pase) y si el cierre anterior no se
  // hizo EN ABSOLUTO (señal gruesa para el banner "recibís sin cierre").
  const [pendientesTurnoAnterior, setPendientesTurnoAnterior] = useState<MisePlaceItem[]>([])
  const [cierreAnteriorIncompleto, setCierreAnteriorIncompleto] = useState(false)
  const [modoControl, setModoControl] = useState(false)
  const [cerrandoTurno, setCerrandoTurno] = useState(false)
  const [entregando, setEntregando] = useState(false)

  useEffect(() => {
    setModoControl(localStorage.getItem('checklist_modo_control') === 'true')
  }, [])

  function toggleModoControl() {
    setModoControl(prev => {
      const next = !prev
      localStorage.setItem('checklist_modo_control', String(next))
      return next
    })
  }

  // ── Dónde está parada esta plaza: el par (jornada, turno) ───────────────
  // Lo decide la entrega, no el reloj. Si la plaza ya entregó el turno, la
  // pantalla pasa al siguiente en ese mismo instante — sean las 01:20 o las
  // 16:00 (ver lib/ops/turnos.ts: turnoVigente). El horario configurado solo
  // manda cuando nadie entregó, que es la red de contención para la plaza que
  // se va sin cerrar.
  //
  // `turnoManual` es el override del usuario (chips del header): mientras no
  // toque un chip, la pantalla SIGUE al resolutor, y por eso el pase hecho
  // desde otro dispositivo se ve acá al momento (realtime de useCierresTurno).
  // Antes se auto-seleccionaba una sola vez y quedaba congelado.
  const [turnoManual, setTurnoManual] = useState<string | null>(null)
  const vigente = useMemo(
    () => turnoVigente({ turnos: turnosActivos, entregados, plaza }),
    [turnosActivos, entregados, plaza],
  )
  const turnoServicioId = turnoManual ?? vigente?.turnoId ?? null
  // La jornada acompaña al turno: entregar la cena del 5 a la 01:20 deja la
  // pantalla en el almuerzo del 6, no en el del 5 (que ya pasó).
  const fecha = vigente?.jornada ?? hoyOperativo()

  const fase: 'apertura' | 'cierre' = tab === 'rutina' ? 'apertura' : tab
  // checklist_registros.turno codifica turno+fase ('cena:apertura'); si el
  // turno de servicio todavía no resolvió, degrada a la fase pelada (compat).
  const turno = turnoServicioId ? encodeTurnoFase(turnoServicioId, fase) : fase

  // Cuando plaza está seleccionada carga su turno; cuando muestra el grid carga apertura para mostrar progreso
  useEffect(() => { fetchAll(fecha, plaza ? turno : 'apertura') }, [plaza, tab, fecha, fetchAll, turno])

  // Fetch del cierre del turno anterior — se usa para tres cosas a la vez:
  // (1) stock de referencia por ítem (regCierreAnteriorMap, read-only en apertura),
  // (2) qué ítems de plaza el turno anterior dejó sin cerrar (pendientesTurnoAnterior),
  // (3) si el cierre anterior NO se hizo en absoluto (cierreAnteriorIncompleto) —
  // el pase de turno no se cumplió, se deduce de la ausencia de registros, no
  // se persiste ningún flag. "Anterior" ya no es simplemente "ayer": es el
  // turno de servicio previo en la secuencia (puede ser el mismo día, ej.
  // cena→almuerzo, o el día anterior si este es el primer turno del día). Se
  // busca también el 'cierre' pelado (compat con filas de antes de turnos de servicio).
  useEffect(() => {
    if (!plaza || items.length === 0) return
    const supabase = createClient()
    const plazaItemIds = items.filter(i => i.plaza === plaza || (plaza !== 'general' && i.plaza === 'general')).map(i => i.id)
    if (plazaItemIds.length === 0) return
    const anterior = turnoServicioId ? turnoAnterior(fecha, turnoServicioId, turnosActivos) : null
    const jornadaBuscada = anterior?.jornada ?? sumarDias(fecha, -1)
    const turnosBuscados = anterior?.turnoId ? [encodeTurnoFase(anterior.turnoId, 'cierre'), 'cierre'] : ['cierre']
    supabase
      .from('checklist_registros')
      .select('checklist_item_id, cantidad_actual, completado')
      .eq('fecha', jornadaBuscada)
      .in('turno', turnosBuscados)
      .in('checklist_item_id', plazaItemIds)
      .then(({ data }) => {
        const regs = (data ?? []) as { checklist_item_id: string; cantidad_actual: number | null; completado: boolean }[]
        const map: Record<string, number | null> = {}
        const completadosSet = new Set<string>()
        for (const r of regs) {
          map[r.checklist_item_id] = r.cantidad_actual ?? null
          if (r.completado) completadosSet.add(r.checklist_item_id)
        }
        setRegCierreAnteriorMap(map)
        const registradosIds = new Set(regs.map(r => r.checklist_item_id))
        setPendientesTurnoAnterior(items.filter(i =>
          i.plaza === plaza && (!registradosIds.has(i.id) || !completadosSet.has(i.id))
        ))
        setCierreAnteriorIncompleto(cierreIncompleto(regs))
      })
  }, [plaza, items, fecha, turnoServicioId, turnosActivos]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar pendientes de apertura al entrar al tab cierre
  useEffect(() => {
    if (tab !== 'cierre' || !plaza) { setPendientesApertura([]); return }
    const supabase = createClient()
    async function loadPendientes() {
      // Traer los item_ids de la plaza
      const plazaItemIds = items.filter(i => i.plaza === plaza || (plaza !== 'general' && i.plaza === 'general')).map(i => i.id)
      if (plazaItemIds.length === 0) { setPendientesApertura([]); return }
      // Traer registros de apertura del día para esos items (mismo turno de servicio)
      const turnoApertura = turnoServicioId ? encodeTurnoFase(turnoServicioId, 'apertura') : 'apertura'
      const { data: regs } = await supabase
        .from('checklist_registros')
        .select('checklist_item_id, completado')
        .eq('fecha', fecha)
        .eq('turno', turnoApertura)
        .in('checklist_item_id', plazaItemIds)
      const completadosSet = new Set<string>()
      for (const r of (regs ?? []) as { checklist_item_id: string; completado: boolean }[]) {
        if (r.completado) completadosSet.add(r.checklist_item_id)
      }
      // Los pendientes son: items que tienen registro con completado=false, o que directamente no tienen registro
      const registradosIds = new Set((regs ?? []).map((r: { checklist_item_id: string }) => r.checklist_item_id))
      const pendientes = items.filter(i =>
        i.plaza === plaza && (!registradosIds.has(i.id) || !completadosSet.has(i.id))
      )
      setPendientesApertura(pendientes)
    }
    loadPendientes()
  }, [tab, plaza, fecha, items, turnoServicioId]) // eslint-disable-line react-hooks/exhaustive-deps

  const plazaSecciones = useMemo(() =>
    secciones
      .filter(s => s.plaza === plaza || (plaza !== 'general' && s.plaza === 'general'))
      .sort((a, b) => {
        // General siempre primero
        if (a.plaza === 'general' && b.plaza !== 'general') return -1
        if (b.plaza === 'general' && a.plaza !== 'general') return 1
        return (a.orden ?? 0) - (b.orden ?? 0)
      }),
    [secciones, plaza])

  // Sub-secciones (jul 2026): plazaSecciones sigue plano (raíces + hijas); acá
  // se separan para renderizar cada raíz como card y sus hijas anidadas adentro.
  const rootSecciones = useMemo(() => plazaSecciones.filter(s => !s.parent_id), [plazaSecciones])
  const childSeccionesByParent = useMemo(() => {
    const m: Record<string, ChecklistSeccionConfig[]> = {}
    for (const s of plazaSecciones) {
      if (!s.parent_id) continue
      ;(m[s.parent_id] ??= []).push(s)
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    return m
  }, [plazaSecciones])

  const plazaItems = useMemo(() =>
    items.filter(i => i.plaza === plaza || (plaza !== 'general' && i.plaza === 'general')),
    [items, plaza])

  const grouped = useMemo(() => {
    const map: Record<string, MisePlaceItem[]> = {}
    plazaSecciones.forEach(s => { map[s.id] = [] })
    plazaItems.forEach(i => { const sid = i.seccion_id ?? ''; if (map[sid]) map[sid].push(i) })
    // Posición fija por `orden` — NO por prioridad/estado, para que un item no
    // "salte" de lugar al cambiar su badge o tildarlo (ver drag-to-reorder abajo).
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    return map
  }, [plazaItems, plazaSecciones])

  const regMap = useMemo(() => {
    const m: Record<string, { completado: boolean; cantidad_actual: number | null }> = {}
    registros.forEach(r => { m[r.checklist_item_id] = { completado: r.completado, cantidad_actual: r.cantidad_actual ?? null } })
    return m
  }, [registros])

  const plazaRutinas = useMemo(() =>
    rutinas.filter(r => r.plaza === plaza || (plaza !== 'general' && r.plaza === 'general')),
    [rutinas, plaza])
  // Rutinas que aplican HOY: semanales solo su día, mensuales solo su fecha,
  // diarias (o sin día) siempre. Las de Limpieza sincronizadas desde HACCP traen
  // dias_semana / dia_mes; las cargadas a mano sin día se muestran todos los días.
  const plazaRutinasHoy = useMemo(() => {
    const d = new Date(fecha + 'T12:00:00')
    const dow = d.getDay()
    const hoyIso = dow === 0 ? 7 : dow   // ISO 1=Lun..7=Dom
    const hoyDiaMes = d.getDate()
    return plazaRutinas.filter(r => {
      if (r.dias_semana && r.dias_semana.length) return r.dias_semana.includes(hoyIso)
      if (r.dia_mes != null) return hoyDiaMes === r.dia_mes
      return true
    })
  }, [plazaRutinas, fecha])
  const rutinaRegSet = useMemo(() => {
    const s = new Set<string>()
    rutinaRegistros.forEach(r => { if (r.completado) s.add(r.rutina_id) })
    return s
  }, [rutinaRegistros])

  // ── Auditoría (M4): rutinas con puntaje configurado son ítems de auditoría ──
  const rutinaRegMap = useMemo(() => {
    const m: Record<string, typeof rutinaRegistros[number]> = {}
    rutinaRegistros.forEach(r => { m[r.rutina_id] = r })
    return m
  }, [rutinaRegistros])
  // Ítems de auditoría de HOY que además cumplen su condicional (si tienen una)
  const rutinasAuditoriaVisibles = useMemo(() => plazaRutinasHoy.filter(r => {
    if (r.puntaje == null) return false
    if (!r.condicion) return true
    return rutinaRegMap[r.condicion.dependeDeId]?.estado === r.condicion.mostrarSiEstado
  }), [plazaRutinasHoy, rutinaRegMap])
  const visibleAuditIds = useMemo(() => new Set(rutinasAuditoriaVisibles.map(r => r.id)), [rutinasAuditoriaVisibles])
  // Ítems de auditoría disponibles como "depende de" (excluye al que se está editando)
  const rutinasAuditoriaDisponibles = useMemo(() =>
    plazaRutinas.filter(r => r.puntaje != null),
    [plazaRutinas])
  const auditoriaResumen = useMemo(() => {
    let obtenido = 0, posible = 0, evaluados = 0, fallidos = 0
    for (const r of rutinasAuditoriaVisibles) {
      const p = r.puntaje ?? 0
      posible += p
      const reg = rutinaRegMap[r.id]
      if (reg?.estado === 'ok') { obtenido += p; evaluados++ }
      else if (reg?.estado === 'fallo') { evaluados++; fallidos++ }
    }
    const total = rutinasAuditoriaVisibles.length
    return {
      obtenido, posible, evaluados, fallidos, total,
      score: posible > 0 ? Math.round((obtenido / posible) * 100) : null,
      completa: total > 0 && evaluados === total,
    }
  }, [rutinasAuditoriaVisibles, rutinaRegMap])

  // Guarda el snapshot de la pasada cuando se terminan de evaluar todos los ítems aplicables del día
  const auditoriaGuardadaRef = useRef<string>('')
  useEffect(() => {
    if (!plaza || tab !== 'rutina' || !auditoriaResumen.completa) return
    const key = `${plaza}-${fecha}-${auditoriaResumen.obtenido}-${auditoriaResumen.fallidos}`
    if (auditoriaGuardadaRef.current === key) return
    auditoriaGuardadaRef.current = key
    guardarAuditoriaPasada({
      plaza, fecha,
      puntaje_obtenido: auditoriaResumen.obtenido,
      puntaje_posible: auditoriaResumen.posible,
      score: auditoriaResumen.score ?? 0,
      items_evaluados: auditoriaResumen.evaluados,
      items_fallidos: auditoriaResumen.fallidos,
      usuario_id: authPerfil?.miembro_id ?? null,
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plaza, tab, fecha, auditoriaResumen.completa, auditoriaResumen.obtenido, auditoriaResumen.posible, auditoriaResumen.evaluados, auditoriaResumen.fallidos, auditoriaResumen.score, authPerfil?.miembro_id])

  const handleAuditoriaEstado = useCallback(async (rut: ChecklistRutina, estado: 'ok' | 'fallo') => {
    const fotoUrl = fotoAuditoriaPend[rut.id] ?? null
    await registrarAuditoriaRutina(rut.id, fecha, estado, fotoUrl)
    if (estado === 'fallo') {
      const titulo = `Auditoría: ${rut.nombre}`
      const yaExiste = tareas.some(t => t.turno_fecha === fecha && t.titulo === titulo && t.estado !== 'listo')
      if (!yaExiste) {
        await agregarTarea({
          titulo,
          descripcion: 'Ítem de auditoría marcado como falla — revisar y resolver.',
          status: 'pendiente',
          prioridad: 'alta',
          categoria: 'rutina',
          plaza: rut.plaza,
          receta_id: null,
          seccion: 'general',
          modo: 'carta',
          turno_fecha: fecha,
          estado: 'pendiente',
          cantidad: null,
          asignado_a: null, creado_por: authPerfil?.miembro_id ?? null,
          fecha_limite: null, tiempo_estimado_min: null, checklist: [],
        })
        setToast(`Tarea creada: revisar "${rut.nombre}"`)
      }
    }
  }, [fotoAuditoriaPend, fecha, registrarAuditoriaRutina, tareas, agregarTarea, authPerfil])

  // Set of checklist_item_ids that already have a pending/in-progress tarea today
  // `fecha` y no hoyOperativo(): si el pase ya adelantó la jornada (cena
  // entregada 01:20 → almuerzo del día siguiente), las tareas que corresponden
  // son las de esa jornada, no las de la que todavía marca el reloj.
  // Va antes del contador de abajo porque es parte de él.
  const tareasHoySet = useMemo(() => {
    const s = new Set<string>()
    for (const t of tareas) {
      if (t.turno_fecha === fecha && t.estado !== 'listo' && t.checklist_item_id) {
        s.add(t.checklist_item_id)
      }
    }
    return s
  }, [tareas, fecha])

  // ── Qué mide el contador de la apertura: ítems REVISADOS ────────────────
  // Un ítem está revisado cuando se contó y quedó resuelto (`completado`) o
  // cuando se despachó su producción: en los dos casos el cocinero ya lo miró
  // y decidió qué hacer. Dejarlo sin contar hasta que salga del horno hacía que
  // la apertura no pudiera cerrarse nunca, cuando la apertura mide la vuelta a
  // la plaza, no la cocina terminada.
  //
  // Solo en apertura. En el cierre el tilde mide cuánto QUEDÓ, y tener una
  // tarea abierta no dice nada sobre eso (además el botón de producir ni se
  // renderiza en cierre).
  const total = plazaItems.length
  const enProduccion = useMemo(() => (
    tab !== 'apertura' ? 0
      : plazaItems.filter(i => !regMap[i.id]?.completado && tareasHoySet.has(i.id)).length
  ), [tab, plazaItems, regMap, tareasHoySet])
  const done = plazaItems.filter(i => regMap[i.id]?.completado).length + enProduccion
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  // ── Auto-avance de la vuelta ────────────────────────────────────────────
  // El cocinero recorre la plaza de arriba abajo contando. Al terminar un ítem
  // (Enter en el campo, o despachar producción) el foco salta al campo del
  // siguiente y la tarjeta se trae a la vista, así el recorrido entero se corre
  // sin bajar el teclado ni buscar dónde tocar.
  //
  // El orden replica el del render: por sección raíz, sus ítems, después sus
  // sub-secciones. Las secciones colapsadas quedan afuera — saltar a un campo
  // que no está en pantalla sería teletransportar al usuario a la nada.
  const ordenVisible = useMemo(() => {
    const out: MisePlaceItem[] = []
    for (const sec of rootSecciones) {
      if (collapsed[sec.id]) continue
      out.push(...(grouped[sec.id] ?? []))
      for (const child of (childSeccionesByParent[sec.id] ?? [])) {
        if (collapsed[child.id]) continue
        out.push(...(grouped[child.id] ?? []))
      }
    }
    return out
  }, [rootSecciones, childSeccionesByParent, grouped, collapsed])

  const [autoFocusItemId, setAutoFocusItemId] = useState<string | null>(null)
  // Por ref y no por deps: `regMap` cambia en cada tilde, y si handleAvanzar
  // cambiara de identidad con él, las 41 tarjetas memoizadas se re-renderizarían
  // en cada toque — justo lo que el memo de ProductoMiseCard existe para evitar.
  const ordenVisibleRef = useRef(ordenVisible)
  useEffect(() => { ordenVisibleRef.current = ordenVisible }, [ordenVisible])
  const regMapRef = useRef(regMap)
  useEffect(() => { regMapRef.current = regMap }, [regMap])

  const handleAvanzar = useCallback((desdeItemId: string) => {
    const orden = ordenVisibleRef.current
    const idx = orden.findIndex(i => i.id === desdeItemId)
    if (idx === -1) return
    // Los ya tildados no tienen campo (la tarjeta se colapsa), así que se saltean.
    for (let k = idx + 1; k < orden.length; k++) {
      if (regMapRef.current[orden[k].id]?.completado) continue
      setAutoFocusItemId(orden[k].id)
      return
    }
    setAutoFocusItemId(null)   // era el último con campo: no hay a dónde ir
  }, [])

  // Progreso por plaza para el grid selector — mismo criterio que el contador
  // de arriba, si no la grilla y la plaza abierta dirían números distintos.
  const gridProgress = useMemo(() => {
    const totals: Record<string, number> = {}
    const completos: Record<string, number> = {}
    items.forEach(i => { totals[i.plaza] = (totals[i.plaza] ?? 0) + 1 })
    const yaContados = new Set<string>()
    registros.forEach(r => {
      if (r.completado) {
        const item = items.find(it => it.id === r.checklist_item_id)
        if (item) {
          completos[item.plaza] = (completos[item.plaza] ?? 0) + 1
          yaContados.add(r.checklist_item_id)
        }
      }
    })
    items.forEach(i => {
      if (!yaContados.has(i.id) && tareasHoySet.has(i.id)) {
        completos[i.plaza] = (completos[i.plaza] ?? 0) + 1
      }
    })
    return todasLasPlazas(plazasCustom).reduce((acc, p) => {
      acc[p] = { total: totals[p] ?? 0, done: completos[p] ?? 0 }
      return acc
    }, {} as Record<string, { total: number; done: number }>)
  }, [items, registros, plazasCustom, tareasHoySet])

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 2500); return () => clearTimeout(t) }
  }, [toast])

  // ── Aviso al completar el 100% de la apertura ───────────────────────────
  // Antes era un toast de 2,5s. Dos razones para que sea una barra persistente
  // como la del cierre: el toast se va solo justo cuando el cocinero levanta la
  // vista de la última bandeja, y además renderiza en la misma posición que la
  // barra (z-300 sobre z-299), así que en el cierre se tapaban entre sí.
  // Este no pide ninguna acción, así que se puede cerrar con la X — si no,
  // quedaría tapando ítems durante todo el servicio.
  const [avisoAperturaOculto, setAvisoAperturaOculto] = useState<string | null>(null)
  const avisoAperturaKey = plaza && turnoServicioId ? `${plaza}-${fecha}-${turnoServicioId}` : null
  const mostrarAvisoApertura =
    tab === 'apertura' && !!avisoAperturaKey && total > 0 && done === total &&
    avisoAperturaOculto !== avisoAperturaKey

  // ── Entrega de la plaza — el pase de turno como acto explícito ──────────
  // Cerrar la plaza y marcar la salida propia son dos cosas distintas: el
  // segundo cocinero que se queda media hora más no tiene por qué retrasar el
  // pase, y el que ficha salida sin haber contado nada no entregó nada.
  const entregaActual = plaza && turnoServicioId ? entregaDe(fecha, turnoServicioId, plaza) : undefined
  const proximoTurno = useMemo(() => {
    if (!turnoServicioId) return null
    const sig = turnoSiguiente(fecha, turnoServicioId, turnosActivos)
    if (!sig) return null
    return turnosActivos.find(t => t.id === sig.turnoId) ?? null
  }, [fecha, turnoServicioId, turnosActivos])

  async function handleEntregarPlaza() {
    if (!plaza || !turnoServicioId || entregando) return
    const nombreProximo = proximoTurno?.nombre ?? 'el turno siguiente'
    if (!confirm(`¿Entregar ${plazaLabel(plaza, plazasCustom)}? El turno de la plaza pasa a ${nombreProximo} para todos.`)) return
    setEntregando(true)
    try {
      // Quedarse parado en el turno recién entregado: para el resto de la
      // cocina el resolutor ya apunta al siguiente, pero al que entregó no se
      // le puede vaciar la pantalla en la cara.
      setTurnoManual(turnoServicioId)
      await entregarPlaza({
        jornada: fecha, turnoId: turnoServicioId, plaza,
        cerradoPor: authPerfil?.miembro_id ?? null,
        itemsTotal: total, itemsCompletados: done,
      })
      setToast(`Plaza entregada — el turno pasa a ${nombreProximo}`)
    } catch (e: unknown) {
      setToast('Error al entregar: ' + (e instanceof Error ? e.message : 'desconocido'))
    } finally {
      setEntregando(false)
    }
  }

  async function handleCerrarTurno() {
    if (!fichajeAbierto || cerrandoTurno) return
    if (!confirm('¿Cerrar tu turno? Se registra tu hora de salida.')) return
    setCerrandoTurno(true)
    try {
      await marcarSalida(fichajeAbierto)
      localStorage.removeItem('kitchenos_turno')
      setToast('Turno cerrado — ¡buen trabajo hoy!')
    } catch (e: unknown) {
      setToast('Error al cerrar turno: ' + (e instanceof Error ? e.message : 'desconocido'))
    } finally {
      setCerrandoTurno(false)
    }
  }

  // ── Drag-to-move between sections + reorder dentro de la sección ─────
  // Posición fija por defecto (sort por `orden`, no por prioridad/estado —
  // ver `grouped` arriba); este gesto es la única forma de cambiarla.
  const [dragging, setDragging] = useState<{ item: MisePlaceItem; y: number; overSecId: string | null; overItemId: string | null; insertAfter: boolean } | null>(null)
  const draggingRef = useRef<typeof dragging>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const secElRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const itemElRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const actualizarItemRef = useRef(actualizarItem)
  const groupedRef = useRef(grouped)
  useEffect(() => { draggingRef.current = dragging }, [dragging])
  useEffect(() => { actualizarItemRef.current = actualizarItem }, [actualizarItem])
  useEffect(() => { groupedRef.current = grouped }, [grouped])

  useEffect(() => {
    if (!dragging) return
    // Mutable current-Y so the RAF loop always reads the latest value
    const currentY = { value: dragging.y }
    let rafId: number

    // Continuous scroll loop — runs every frame while dragging
    const scrollLoop = () => {
      const sc = scrollContainerRef.current
      if (sc) {
        const r = sc.getBoundingClientRect()
        const ZONE = 90  // px from edge that triggers auto-scroll
        const y = currentY.value
        if (y < r.top + ZONE && y > r.top) {
          const intensity = 1 - (y - r.top) / ZONE
          sc.scrollTop -= 3 + intensity * 10
        } else if (y > r.bottom - ZONE && y < r.bottom) {
          const intensity = 1 - (r.bottom - y) / ZONE
          sc.scrollTop += 3 + intensity * 10
        }
      }
      rafId = requestAnimationFrame(scrollLoop)
    }
    rafId = requestAnimationFrame(scrollLoop)

    const onMove = (e: TouchEvent) => {
      e.preventDefault()
      const t = e.touches[0]
      currentY.value = t.clientY
      let overSecId: string | null = null
      secElRefs.current.forEach((el, secId) => {
        const r = el.getBoundingClientRect()
        if (t.clientY >= r.top && t.clientY <= r.bottom) overSecId = secId
      })
      // Ítem más cercano dentro de la sección sobrevolada — define dónde se
      // inserta al soltar (antes/después según qué mitad del ítem se tocó).
      let overItemId: string | null = null
      let insertAfter = false
      if (overSecId) {
        const draggedId = draggingRef.current?.item.id
        const secItemIds = new Set((groupedRef.current[overSecId] ?? []).map(i => i.id))
        let closestDist = Infinity
        itemElRefs.current.forEach((el, itemId) => {
          if (itemId === draggedId || !secItemIds.has(itemId)) return
          const r = el.getBoundingClientRect()
          const mid = r.top + r.height / 2
          const dist = Math.abs(t.clientY - mid)
          if (dist < closestDist) { closestDist = dist; overItemId = itemId; insertAfter = t.clientY > mid }
        })
      }
      setDragging(prev => prev ? { ...prev, y: t.clientY, overSecId, overItemId, insertAfter } : null)
    }
    const onEnd = () => {
      cancelAnimationFrame(rafId)
      const d = draggingRef.current
      if (d?.overSecId) {
        const overSecId = d.overSecId
        const targetItems = (groupedRef.current[overSecId] ?? []).filter(i => i.id !== d.item.id)
        let insertIdx = targetItems.length
        if (d.overItemId) {
          const idx = targetItems.findIndex(i => i.id === d.overItemId)
          if (idx !== -1) insertIdx = d.insertAfter ? idx + 1 : idx
        }
        targetItems.splice(insertIdx, 0, d.item)
        targetItems.forEach((it, idx) => {
          const needsSecUpdate = it.id === d.item.id && it.seccion_id !== overSecId
          if ((it.orden ?? 0) !== idx || needsSecUpdate) {
            actualizarItemRef.current(it.id, { orden: idx, ...(needsSecUpdate ? { seccion_id: overSecId } : {}) })
          }
        })
      }
      setDragging(null)
    }
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    return () => {
      cancelAnimationFrame(rafId)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
  }, [!!dragging]) // eslint-disable-line react-hooks/exhaustive-deps

  const startLongPress = useCallback((item: MisePlaceItem, y: number) => {
    longPressTimer.current = setTimeout(() => {
      navigator.vibrate?.(30)
      setDragging({ item, y, overSecId: item.seccion_id ?? null, overItemId: null, insertAfter: false })
    }, 400)
  }, [])

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }, [])

  // Alias de la jornada resuelta (ver `fecha` arriba) para todo lo que compara
  // contra "hoy": tareas del día, creación de tareas. Sigue al pase, no al
  // reloj — si no, entregada la cena a la 01:20 el mise pasaría al almuerzo del
  // 6 mientras las tareas seguirían buscándose en la jornada del 5.
  // Nombre propio porque handleMiseUpsert recibe un parámetro `fecha` que lo
  // taparía.
  const today = fecha

  // Wrapper de upsertRegistro: al cambiar completado, sincroniza la tarea de producción matching
  const handleMiseUpsert = useCallback(async (
    itemId: string, fecha: string, turno: string,
    d: { completado?: boolean; cantidad_actual?: number | null }
  ) => {
    // usuario_id: quién hizo la última acción sobre este registro — alimenta
    // el reporte de auditoría "pase de turno incumplido" (Reportes → Auditoría).
    // Vínculo por FK (checklist_item_id), no por título. Refleja el tilde del mise
    // en la(s) tarea(s) de producción originadas por este item.
    // No se encadena con await al upsert: las dos escrituras son independientes y
    // ambas son optimistas, así que salen juntas en vez de una después de la otra.
    const matchingTareas = d.completado === undefined
      ? []
      : tareas.filter(t => t.turno_fecha === today && t.checklist_item_id === itemId)
    await Promise.all([
      upsertRegistro(itemId, fecha, turno, { ...d, usuario_id: authPerfil?.miembro_id ?? null }),
      ...matchingTareas.map(mt => cambiarEstadoTarea(mt.id, d.completado ? 'listo' : 'pendiente')),
    ])
  }, [upsertRegistro, tareas, cambiarEstadoTarea, today, authPerfil])

  const handleCrearTarea = useCallback(async (params: CrearTareaParams) => {
    let turnoFecha = today
    if (params.dia === 'manana') {
      turnoFecha = sumarDias(today, 1)
    }
    const categoria = params.dia === 'manana' ? 'pase_turno' : 'produccion'
    const descripcion = params.nota ?? (params.cantidad != null ? `Preparar ${params.cantidad}` : null)
    await agregarTarea({
      titulo: params.titulo,
      descripcion,
      status: 'pendiente',
      prioridad: params.prioridad,
      categoria,
      plaza: params.plaza,
      receta_id: params.receta_id,
      seccion: params.seccion,
      modo: 'carta',
      turno_fecha: turnoFecha,
      estado: 'pendiente',
      cantidad: params.cantidad,
      checklist_item_id: params.checklist_item_id,
      asignado_a: null, creado_por: authPerfil?.miembro_id ?? null,
      fecha_limite: null, tiempo_estimado_min: null, checklist: [],
    })
    // Sub-tasks for each extra plaza
    if (params.plazas.length > 1) {
      for (const pp of params.plazas.slice(1)) {
        await agregarTarea({
          titulo: `[${pp.plaza}] ${params.titulo}`,
          descripcion: pp.instruccion ?? null,
          status: 'pendiente',
          prioridad: 'baja',
          categoria,
          plaza: pp.plaza,
          receta_id: params.receta_id,
          seccion: params.seccion,
          modo: 'carta',
          turno_fecha: turnoFecha,
          estado: 'pendiente',
          cantidad: null,
          checklist_item_id: params.checklist_item_id,
          asignado_a: null, creado_por: authPerfil?.miembro_id ?? null,
          fecha_limite: null, tiempo_estimado_min: null, checklist: [],
        })
      }
    }
  }, [agregarTarea, authPerfil, today])

  // Handlers estables para la tarjeta memoizada. actualizarItem/eliminarItem
  // vienen del hook sin memoizar (una referencia nueva por render): pasarlos
  // directo re-renderizaba las 40+ tarjetas del mise en cada cambio de estado.
  // actualizarItemRef ya existe más arriba (lo usa el drag & drop).
  const eliminarItemRef = useRef(eliminarItem)
  eliminarItemRef.current = eliminarItem

  const handlePrioChange = useCallback(async (i: MisePlaceItem, prio: MisePrioridad) => {
    // Solo cambia la prioridad. La creación de tarea es explícita (panel de
    // producción de la card / AddItemSheet), no un efecto del ciclo del badge
    // — evita tareas fantasma por un tap de más.
    await actualizarItemRef.current(i.id, { prioridad: prio })
  }, [])

  const handleDeleteItem = useCallback(async (id: string) => {
    await eliminarItemRef.current(id)
  }, [])

  // ── Modo Control: producir de un tap ────────────────────────────────────
  // El control es un recorrido de ojo: se mira la heladera y se decide en el
  // acto "esto está" (tilde) o "esto hay que producirlo" (prioridad + envío).
  // Por eso la tarea sale sin cantidad: en el control nadie pesa nada, y pedir
  // un número acá obligaría a abrir un sheet y romper el recorrido. La cantidad
  // la pone después quien produce, o se saca del estándar del ítem.
  const handleCrearTareaControl = useCallback(async (item: MisePlaceItem) => {
    const plazasItem = item.receta_id ? (platoPlazoMap[item.receta_id] ?? SIN_PLAZAS) : SIN_PLAZAS
    const primaryPlaza = plazasItem.length > 0 ? plazasItem[0].plaza : item.plaza
    await handleCrearTarea({
      titulo: item.nombre,
      seccion: PLAZA_TO_SECCION[primaryPlaza] ?? 'general',
      prioridad: MISE_PRIO_TO_TAREA[item.prioridad] ?? 'alta',
      dia: 'hoy',
      nota: null,
      cantidad: null,
      receta_id: item.receta_id ?? null,
      plaza: primaryPlaza,
      plazas: plazasItem,
      checklist_item_id: item.id,
    })
    setToast(`A producción: ${item.nombre}`)
  }, [handleCrearTarea, platoPlazoMap])

  const handleCrearVencimientoDesdeMise = useCallback(async (params: { producto_nombre: string; fecha_vencimiento: string; fecha_apertura: string }) => {
    await crearVencimiento({
      producto_nombre: params.producto_nombre,
      fecha_vencimiento: params.fecha_vencimiento,
      fecha_apertura: params.fecha_apertura,
      lote: null,
      ubicacion: null,
      status: 'vigente',
      usuario_id: null,
      producto_id: null,
    })
  }, [crearVencimiento])

  // ── Plaza selector ──
  if (!plaza) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ background: 'var(--navy)', padding: `${embedded ? 0 : 46}px 16px 20px`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!embedded && (
              <button onClick={() => router.back()} style={btnReset}>
                <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.7)', fontSize: 22 }}>arrow_back</span>
              </button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Checklist de Plaza</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 2 }}>Seleccioná tu plaza</div>
            </div>
            <button
              onClick={() => setGuia({ foco: null })}
              title="Cómo funciona el Mise"
              style={{ ...btnReset, background: 'rgba(255,255,255,.1)', borderRadius: 8, padding: 6 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'rgba(255,255,255,.7)' }}>help</span>
            </button>
          </div>
        </div>
        {guia && <MiseGuiaSheet foco={guia.foco} onClose={() => setGuia(null)} />}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {plazasForSelector.map(p => {
              const gp = gridProgress[p]
              const gpPct = gp.total > 0 ? Math.round((gp.done / gp.total) * 100) : 0
              const isCompleto = gp.total > 0 && gp.done === gp.total
              return (
                <button key={p} onClick={() => setPlaza(p)} style={{
                  background: 'var(--surface)', border: `1px solid ${isCompleto ? '#22c55e' : 'var(--border)'}`,
                  borderRadius: 16, padding: '18px 14px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 32, color: isCompleto ? '#22c55e' : '#4361a0' }}>{plazaIcon(p, plazasCustom)}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{plazaLabel(p, plazasCustom)}</span>
                  {gp.total > 0 ? (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 10, color: isCompleto ? '#22c55e' : 'var(--text-3)', fontWeight: 600 }}>
                        {gp.done}/{gp.total} completados
                      </span>
                      <div style={{ height: 3, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${gpPct}%`, background: isCompleto ? '#22c55e' : '#4361a0', borderRadius: 99, transition: 'width .3s' }} />
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Sin ítems</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── Main checklist view ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: `${embedded ? 0 : 46}px 16px 0`, flexShrink: 0 }}>
        {/* Fila 1: volver + plaza + turno (inline, solo si hay >1) + acciones.
            La fecha NO se muestra salvo que la jornada operativa (corte 05:00,
            ver hoyOperativo) no coincida con el día calendario real — ej. cerrando
            a la 1am la jornada sigue siendo "ayer" y ahí sí vale la pena avisar. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10 }}>
          <button onClick={() => setPlaza(null)} style={btnReset}>
            <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.7)', fontSize: 22 }}>arrow_back</span>
          </button>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>{plazaLabel(plaza, plazasCustom)}</span>
            {fecha !== fechaEnTz(new Date()) && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: '#facc15',
                background: 'rgba(250,204,21,.15)', borderRadius: 999, padding: '2px 8px',
              }}>
                {fmtFecha(fecha)}
              </span>
            )}
            {tab !== 'rutina' && turnosActivos.length > 1 && (
              <div data-coach-target="mise-turno" style={{ display: 'flex', gap: 4 }}>
                {turnosActivos.map(t => {
                  const activo = (turnoServicioId ?? turnosActivos[0].id) === t.id
                  return (
                    <button key={t.id} onClick={() => setTurnoManual(t.id)} style={{
                      ...btnReset,
                      padding: '3px 10px', borderRadius: 999,
                      fontSize: 11, fontWeight: 700,
                      background: activo ? '#fff' : 'rgba(255,255,255,.12)',
                      color: activo ? 'var(--navy)' : 'rgba(255,255,255,.6)',
                      transition: 'all .15s',
                    }}>
                      {t.nombre}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {/* Guía de uso — siempre a mano, sin pasar por el Coach */}
          <button
            onClick={() => setGuia({ foco: null })}
            title="Cómo funciona el Mise"
            style={{ ...btnReset, background: 'rgba(255,255,255,.1)', borderRadius: 8, padding: 6, marginRight: 4 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'rgba(255,255,255,.7)' }}>help</span>
          </button>
          <button
            data-coach-target="mise-modo-control"
            onClick={toggleModoControl}
            title={modoControl ? 'Modo Control activo — tap para volver a OPS' : 'Activar Modo Control'}
            style={{
              ...btnReset,
              background: modoControl ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.1)',
              borderRadius: 8, padding: 6, marginRight: 4,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: modoControl ? 'var(--navy)' : 'rgba(255,255,255,.7)' }}>
              fact_check
            </span>
          </button>
          <button data-coach-target="mise-secciones-cfg" onClick={() => setShowSectionEditor(true)} style={{ ...btnReset, background: 'rgba(255,255,255,.1)', borderRadius: 8, padding: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'rgba(255,255,255,.7)' }}>settings</span>
          </button>
        </div>

        {/* Fila 2: tabs + progreso, misma fila — libera la fila propia que tenía la barra */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10 }}>
          <div data-coach-target="mise-fases" style={{ display: 'inline-flex', flexShrink: 0, background: 'rgba(255,255,255,.12)', borderRadius: 999, padding: 2, gap: 0 }}>
            {(['apertura', 'cierre', 'rutina'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)} {...(t === 'rutina' ? { 'data-coach-target': 'mise-tab-rutina' } : {})} style={{
                padding: '5px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.07em',
                fontFamily: 'inherit',
                background: tab === t ? '#fff' : 'transparent',
                color: tab === t ? 'var(--navy)' : 'rgba(255,255,255,.55)',
                transition: 'all .15s',
                WebkitTapHighlightColor: 'transparent',
              }}>
                {t === 'apertura' ? 'Apertura' : t === 'cierre' ? 'Cierre' : 'Rutina'}
              </button>
            ))}
          </div>
          {tab !== 'rutina' && (
            <div data-coach-target="mise-progreso" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,.15)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: '#22c55e', borderRadius: 99, transition: 'width .3s' }} />
              </div>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>{done}/{total}</span>
            </div>
          )}
        </div>

        {/* Switcher de plazas — solo si el usuario tiene ≥2 asignadas */}
        {userPlazas.length > 1 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
            {plazasForSelector.map(p => (
              <button
                key={p}
                onClick={() => setPlaza(p)}
                style={{
                  padding: '5px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                  background: plaza === p ? '#fff' : 'rgba(255,255,255,0.15)',
                  color: plaza === p ? 'var(--navy)' : 'rgba(255,255,255,0.65)',
                  fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                  flexShrink: 0, fontFamily: 'inherit',
                }}
              >
                {PLAZA_LABELS[p]}
              </button>
            ))}
          </div>
        )}

        {/* Modo control banner */}
        {modoControl && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
            background: 'rgba(255,255,255,.12)', borderRadius: 8, padding: '5px 10px',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'rgba(255,255,255,.7)' }}>fact_check</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.7)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
              Modo Control — tildá lo que está, o mandalo a producir
            </span>
          </div>
        )}

      </div>

      {/* Body */}
      <div ref={scrollContainerRef} style={{ flex: 1, overflow: 'auto', padding: '10px 12px', paddingBottom: 120 }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>Cargando...</div>
        )}

        {/* ── Notas de la plaza ── Lo primero de la pantalla: es el contexto que
            dejó el turno anterior ("chequeá el orden, el servicio fue pesado",
            "ingresó pescado") y hay que leerlo antes de empezar a tildar. Vive
            en pase_mensajes, así que lo que se escribe acá también se lee en el
            Pase y en la columna de esta plaza en Producción. */}
        {!loading && plaza && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '8px 10px', marginBottom: 10,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 800, color: 'var(--text-3)',
              textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6,
            }}>
              Notas de {plazaLabel(plaza, plazasCustom)}
            </div>
            <NotasPlaza
              notas={notasDe(plaza)}
              onAgregar={(texto, importante) => agregarNota({ plaza, texto, importante })}
              onEliminar={eliminarNota}
            />
          </div>
        )}

        {/* ── Arrastre del turno anterior (solo en apertura) — nunca bloquea,
            solo avisa. No le pide al que entra que reconstruya el cierre
            de quien se fue: solo que cuente lo que va a mirar igual.

            Sin cierre registrado, NINGÚN ítem tiene registro previo, así que
            "pendientes" es la plaza entera — listarlos sería duplicar la lista
            que está justo abajo. En ese caso va solo el aviso de una línea.
            El detalle se muestra únicamente cuando sí hubo cierre y quedaron
            algunos colgados: ahí los nombres son información nueva. ── */}
        {!loading && tab === 'apertura' && pendientesTurnoAnterior.length > 0 && (
          <div style={{
            background: cierreAnteriorIncompleto ? 'rgba(239, 68, 68, 0.12)' : 'rgba(250, 204, 21, 0.15)',
            borderLeft: `3px solid ${cierreAnteriorIncompleto ? '#ef4444' : '#facc15'}`,
            borderRadius: 12,
            marginBottom: 10,
            overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: cierreAnteriorIncompleto ? '#dc2626' : '#ca8a04', flexShrink: 0 }}>
                {cierreAnteriorIncompleto ? 'report' : 'warning'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: cierreAnteriorIncompleto ? '#7f1d1d' : '#78350f', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  {cierreAnteriorIncompleto ? 'Recibís sin cierre del turno anterior' : 'Pendiente del turno anterior'}
                </div>
                {cierreAnteriorIncompleto && (
                  <div style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.4, marginTop: 3 }}>
                    Nadie registró el cierre. Contá lo que veas al arrancar.{' '}
                    <button
                      onClick={() => setGuia({ foco: 'primera-vez' })}
                      style={{
                        ...btnReset, display: 'inline', padding: 0, fontSize: 12, fontWeight: 700,
                        color: '#7f1d1d', textDecoration: 'underline',
                      }}
                    >
                      ¿Cómo lo cargo?
                    </button>
                  </div>
                )}
              </div>
              {!cierreAnteriorIncompleto && (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', flexShrink: 0 }}>
                  {pendientesTurnoAnterior.length} sin cerrar
                </span>
              )}
            </div>
            {!cierreAnteriorIncompleto && (
              <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {pendientesTurnoAnterior.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ca8a04', flexShrink: 0 }}>radio_button_unchecked</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#78350f' }}>{item.nombre}</span>
                      {item.cantidad > 0 && (
                        <span style={{ marginLeft: 6, fontSize: 11, color: '#92400e' }}>
                          {item.cantidad} {item.unidad}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Pendientes del turno (solo en cierre) ── */}
        {!loading && tab === 'cierre' && pendientesApertura.length > 0 && (
          <div style={{
            background: 'rgba(250, 204, 21, 0.15)',
            borderLeft: '3px solid #facc15',
            borderRadius: 12,
            marginBottom: 10,
            overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 14px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ca8a04', flexShrink: 0 }}>warning</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#78350f', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Pendiente del turno
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#92400e' }}>
                {pendientesApertura.length} sin completar
              </span>
            </div>
            <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {pendientesApertura.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid rgba(250,204,21,0.2)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ca8a04', flexShrink: 0 }}>radio_button_unchecked</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#78350f' }}>{item.nombre}</span>
                    {item.cantidad > 0 && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: '#92400e' }}>
                        {item.cantidad} {item.unidad}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── APERTURA / CIERRE ── */}
        {!loading && tab !== 'rutina' && (() => {
          // Sin secciones todavía (plaza nueva, sin nada creado a mano) — bienvenida
          // explicando qué es el mise y cómo armar la primera sección, en vez de
          // auto-poblar secciones fijas que nadie pidió.
          if (plazaSecciones.length === 0) {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--accent)' }}>checklist</span>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0, textAlign: 'center' }}>
                  Armá el mise en place de {plazaLabel(plaza, plazasCustom)}
                </p>
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0, textAlign: 'center', maxWidth: 300, lineHeight: 1.5 }}>
                  El mise es la checklist de apertura y cierre de tu plaza: stock que hay que dejar
                  preparado, cuánto y dónde. Creá una sección (ej. &quot;Heladera&quot;, &quot;Secos&quot;, &quot;Estación&quot;)
                  y después agregá los ítems que tu equipo va a tildar cada turno.
                </p>
                <button
                  onClick={() => setShowSectionEditor(true)}
                  style={{
                    marginTop: 6, padding: '11px 22px', borderRadius: 12, border: 'none',
                    background: 'linear-gradient(135deg, var(--navy), #4361a0)', color: '#fff',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                  Crear mi primera sección
                </button>
              </div>
            )
          }
          const allSectionsEmpty = plazaSecciones.every(sec => (grouped[sec.id] ?? []).length === 0)
          if (allSectionsEmpty && plazaSecciones.length > 0) {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 16px', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 44, color: 'var(--text-3)' }}>playlist_add_check</span>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', margin: 0, textAlign: 'center' }}>El mise está vacío</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, textAlign: 'center', maxWidth: 240 }}>
                  Activá un menú en Planificación o agregá preparaciones desde Carta → OPS.
                </p>
              </div>
            )
          }
          // Fila de un ítem del mise — usada tanto para los ítems propios de la
          // sección raíz como para los de cada sub-sección. Invocada como
          // función (no <Componente/>) para no perder foco/estado por remount.
          function renderSecItems(itemsList: MisePlaceItem[]) {
            return itemsList.map(item => {
              const isInsertBefore = dragging?.overItemId === item.id && !dragging.insertAfter && dragging.item.id !== item.id
              const isInsertAfter = dragging?.overItemId === item.id && dragging.insertAfter && dragging.item.id !== item.id
              return (
              <div
                key={item.id}
                ref={el => { if (el) itemElRefs.current.set(item.id, el); else itemElRefs.current.delete(item.id) }}
                onTouchStart={modoControl ? undefined : e => startLongPress(item, e.touches[0].clientY)}
                onTouchMove={modoControl ? undefined : cancelLongPress}
                onTouchEnd={modoControl ? undefined : cancelLongPress}
                style={{
                  opacity: dragging?.item.id === item.id ? 0.35 : 1,
                  transition: 'opacity .15s',
                  touchAction: dragging ? 'none' : 'auto',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  borderTop: isInsertBefore ? '2px solid var(--accent)' : '2px solid transparent',
                  borderBottom: isInsertAfter ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                {modoControl ? (() => {
                  // Tres decisiones por ítem, sin salir de la fila: está (tilde),
                  // con qué urgencia hay que producirlo (badge que cicla) y
                  // mandalo a Producción (+). El tilde ocupa toda el área del
                  // nombre porque es la acción que se repite; los otros dos son
                  // botones chicos al borde para no comerse el ancho.
                  const tildado = regMap[item.id]?.completado ?? false
                  const enviada = tareasHoySet.has(item.id)
                  const prioCfg = PRIO_CFG[item.prioridad] ?? PRIO_CFG.ref
                  return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <button
                      onClick={() => handleMiseUpsert(item.id, fecha, turno, { completado: !tildado })}
                      style={{
                        flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 4px', background: 'none', border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit', textAlign: 'left',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{
                        fontSize: 22, flexShrink: 0,
                        color: tildado ? '#22c55e' : 'var(--border)',
                        transition: 'color .15s',
                      }}>
                        {tildado ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                      <span style={{
                        flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-1)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        textDecoration: tildado ? 'line-through' : 'none',
                        opacity: tildado ? 0.55 : 1,
                      }}>
                        {item.nombre}
                      </span>
                      {item.cantidad > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
                          {item.cantidad} {item.unidad}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => handlePrioChange(item, nextPrioControl(item.prioridad))}
                      title={`Prioridad ${prioCfg.label} — tap para cambiar`}
                      style={{
                        ...btnReset, width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                        background: prioCfg.bg, border: `1.5px solid ${prioCfg.color}`,
                        fontSize: 10, fontWeight: 800, color: prioCfg.color, transition: 'all .15s',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      {prioCfg.label}
                    </button>
                    <button
                      onClick={() => { if (!enviada) handleCrearTareaControl(item) }}
                      disabled={enviada}
                      title={enviada ? 'Ya está en Producción' : `Mandar a Producción con prioridad ${prioCfg.label}`}
                      style={{
                        ...btnReset, width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                        marginRight: 2,
                        background: enviada ? 'rgba(34,197,94,.13)' : prioCfg.bg,
                        border: `1.5px solid ${enviada ? '#22c55e' : prioCfg.color}`,
                        color: enviada ? '#22c55e' : prioCfg.color,
                        cursor: enviada ? 'default' : 'pointer', transition: 'all .15s',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                        {enviada ? 'assignment_turned_in' : 'add'}
                      </span>
                    </button>
                  </div>
                  )
                })() : (
                  <ProductoMiseCard
                    item={item}
                    reg={regMap[item.id]}
                    fecha={fecha}
                    turno={turno}
                    recetaInfo={item.receta_id ? recetaInfoMap[item.receta_id] : undefined}
                    // SIN_PLAZAS constante: un `[]` literal acá sería una prop
                    // nueva en cada render y anularía el memo de la tarjeta.
                    platoPlazo={item.receta_id ? (platoPlazoMap[item.receta_id] ?? SIN_PLAZAS) : SIN_PLAZAS}
                    hasTareaPendiente={tareasHoySet.has(item.id)}
                    autoFocus={autoFocusItemId === item.id}
                    onAvanzar={handleAvanzar}
                    rendimientoPromedio={item.receta_id ? rendimientoMap[item.receta_id] : null}
                    regCierreAnterior={regCierreAnteriorMap[item.id] ?? null}
                    restauranteNombre={restauranteNombre}
                    onUpsert={handleMiseUpsert}
                    onCrearTarea={handleCrearTarea}
                    onCrearVencimiento={handleCrearVencimientoDesdeMise}
                    onPrioChange={handlePrioChange}
                    onDelete={handleDeleteItem}
                  />
                )}
              </div>
              )
            })
          }

          return rootSecciones.map(sec => {
          const secItems = grouped[sec.id] ?? []
          const children = childSeccionesByParent[sec.id] ?? []
          const allItemsInCard = [...secItems, ...children.flatMap(c => grouped[c.id] ?? [])]
          const secDone = allItemsInCard.filter(i => regMap[i.id]?.completado).length
          const isCollapsed = collapsed[sec.id] ?? false
          const secColor = getSeccionColor(sec.nombre)
          const secPct = allItemsInCard.length > 0 ? secDone / allItemsInCard.length : 0

          const isDragTarget = dragging !== null && dragging.overSecId === sec.id && dragging.item.seccion_id !== sec.id
          return (
            <div
              key={sec.id}
              ref={el => { if (el) secElRefs.current.set(sec.id, el as HTMLDivElement); else secElRefs.current.delete(sec.id) }}
              style={{
                background: 'var(--surface)',
                border: isDragTarget ? '2px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: 14, overflow: 'hidden', marginBottom: 8,
                transition: 'border-color .1s',
              }}
            >
              {/* Section header */}
              <button
                onClick={() => setCollapsed(prev => ({ ...prev, [sec.id]: !prev[sec.id] }))}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: secColor, flexShrink: 0 }} />
                <span style={{ flex: 1, textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  {sec.nombre}
                </span>
                <span style={{
                  fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 700,
                  color: secDone === allItemsInCard.length && allItemsInCard.length > 0 ? '#22c55e' : 'var(--text-3)',
                }}>{secDone}/{allItemsInCard.length}</span>
                <span className="material-symbols-outlined" style={{
                  fontSize: 18, color: 'var(--text-3)',
                  transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s',
                }}>expand_more</span>
              </button>

              {/* Progress bar */}
              <div style={{ height: 2, background: 'var(--border)' }}>
                <div style={{ width: `${secPct * 100}%`, height: '100%', background: secColor, transition: 'width .3s' }} />
              </div>

              {!isCollapsed && (
                <div style={{ padding: '6px 10px 10px' }}>
                  {secItems.length === 0 && children.length === 0 && (
                    <div style={{ padding: '8px 2px', fontSize: 12, color: 'var(--text-3)' }}>
                      Sin items en esta sección
                    </div>
                  )}
                  <div className="mise-items-grid">{renderSecItems(secItems)}</div>
                  <button
                    data-coach-target="mise-fab-add"
                    onClick={() => setShowAddSheet(sec.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '8px 4px',
                      background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginTop: 4,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>add</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Agregar</span>
                  </button>

                  {/* Sub-secciones (jul 2026) — anidadas dentro de la card de la raíz */}
                  {children.map(child => {
                    const childItems = grouped[child.id] ?? []
                    const childDone = childItems.filter(i => regMap[i.id]?.completado).length
                    const childCollapsed = collapsed[child.id] ?? false
                    const childColor = getSeccionColor(child.nombre)
                    const childIsDragTarget = dragging !== null && dragging.overSecId === child.id && dragging.item.seccion_id !== child.id
                    return (
                      <div
                        key={child.id}
                        ref={el => { if (el) secElRefs.current.set(child.id, el as HTMLDivElement); else secElRefs.current.delete(child.id) }}
                        style={{
                          marginTop: 10, marginLeft: 10, paddingLeft: 10,
                          borderLeft: `2px solid ${childIsDragTarget ? 'var(--accent)' : 'var(--border)'}`,
                        }}
                      >
                        <button
                          onClick={() => setCollapsed(prev => ({ ...prev, [child.id]: !prev[child.id] }))}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                            padding: '4px 0', background: 'none', border: 'none', cursor: 'pointer',
                            WebkitTapHighlightColor: 'transparent',
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: childColor, flexShrink: 0 }} />
                          <span style={{ flex: 1, textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                            {child.nombre}
                          </span>
                          <span style={{
                            fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 700,
                            color: childDone === childItems.length && childItems.length > 0 ? '#22c55e' : 'var(--text-3)',
                          }}>{childDone}/{childItems.length}</span>
                          <span className="material-symbols-outlined" style={{
                            fontSize: 16, color: 'var(--text-3)',
                            transform: childCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s',
                          }}>expand_more</span>
                        </button>
                        {!childCollapsed && (
                          <div style={{ padding: '2px 0 6px' }}>
                            {childItems.length === 0 && (
                              <div style={{ padding: '6px 2px', fontSize: 11, color: 'var(--text-3)' }}>Sin items</div>
                            )}
                            <div className="mise-items-grid">{renderSecItems(childItems)}</div>
                            <button
                              onClick={() => setShowAddSheet(child.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 4px',
                                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginTop: 2,
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--accent)' }}>add</span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>Agregar</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })
        })()}

        {/* ── RUTINA ── */}
        {!loading && tab === 'rutina' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {auditoriaResumen.total > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 4,
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
              }}>
                <span className="material-symbols-outlined" style={{
                  fontSize: 20,
                  color: auditoriaResumen.score == null ? 'var(--text-3)' : auditoriaResumen.score >= 90 ? '#22c55e' : auditoriaResumen.score >= 70 ? '#f97316' : '#ef4444',
                }}>fact_check</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>
                    Auditoría de hoy — {auditoriaResumen.evaluados}/{auditoriaResumen.total} evaluados
                  </div>
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', marginTop: 4 }}>
                    <div style={{
                      width: `${auditoriaResumen.total > 0 ? (auditoriaResumen.evaluados / auditoriaResumen.total) * 100 : 0}%`,
                      height: '100%', borderRadius: 99, transition: 'width .3s',
                      background: auditoriaResumen.score == null ? 'var(--text-3)' : auditoriaResumen.score >= 90 ? '#22c55e' : auditoriaResumen.score >= 70 ? '#f97316' : '#ef4444',
                    }} />
                  </div>
                </div>
                {auditoriaResumen.score != null && (
                  <span style={{
                    fontSize: 15, fontWeight: 800, fontFamily: "'DM Mono', monospace",
                    color: auditoriaResumen.score >= 90 ? '#22c55e' : auditoriaResumen.score >= 70 ? '#f97316' : '#ef4444',
                  }}>{auditoriaResumen.score}%</span>
                )}
              </div>
            )}
            {plazaRutinasHoy.length === 0 && (
              <div style={{ padding: '40px 12px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
                {plazaRutinas.length === 0 ? 'Sin tareas de rutina configuradas' : 'Sin rutinas para hoy'}
              </div>
            )}
            {plazaRutinasHoy
              .filter(r => r.puntaje == null || visibleAuditIds.has(r.id))
              .map(rut => rut.puntaje != null ? (
                <AuditoriaRutinaRow
                  key={rut.id}
                  rut={rut}
                  reg={rutinaRegMap[rut.id]}
                  fotoPendiente={fotoAuditoriaPend[rut.id] ?? null}
                  fecha={fecha}
                  onFotoUploaded={url => setFotoAuditoriaPend(prev => ({ ...prev, [rut.id]: url }))}
                  onEstado={estado => handleAuditoriaEstado(rut, estado)}
                  onUndo={() => toggleRutina(rut.id, fecha, false)}
                  onEdit={() => setEditRutina(rut)}
                  onDelete={() => eliminarRutina(rut.id)}
                />
              ) : (() => {
                const done = rutinaRegSet.has(rut.id)
                const lastDone = daysAgo(rut.ultima_vez ?? null)
                return (
                  <div key={rut.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px',
                    background: done ? 'rgba(34,197,94,.04)' : 'var(--surface)',
                    border: `1px solid ${done ? 'rgba(34,197,94,.22)' : 'var(--border)'}`,
                    borderRadius: 14, opacity: done ? 0.7 : 1, transition: 'all .2s',
                  }}>
                    <button onClick={() => toggleRutina(rut.id, fecha, !done)} style={{ ...btnReset, flexShrink: 0 }}>
                      <span className="material-symbols-outlined" style={{
                        fontSize: 24, color: done ? '#22c55e' : 'var(--border)', transition: 'color .15s',
                      }}>{done ? 'check_circle' : 'radio_button_unchecked'}</span>
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', textDecoration: done ? 'line-through' : 'none' }}>
                        {rut.nombre}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
                        {FREQ_LABELS[rut.frecuencia as RutinaFrecuencia]}{lastDone ? ` · Últ: ${lastDone}` : ' · Nunca hecha'}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                      background: rut.frecuencia === 'diaria' ? 'rgba(239,68,68,.1)' : rut.frecuencia === 'semanal' ? 'rgba(59,130,246,.1)' : 'rgba(148,163,184,.1)',
                      color: rut.frecuencia === 'diaria' ? '#ef4444' : rut.frecuencia === 'semanal' ? '#3b82f6' : '#94a3b8',
                    }}>{FREQ_LABELS[rut.frecuencia as RutinaFrecuencia].toUpperCase()}</span>
                    <button onClick={() => setEditRutina(rut)} style={{ ...btnReset, flexShrink: 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--text-3)', opacity: 0.5 }}>tune</span>
                    </button>
                    <button onClick={() => eliminarRutina(rut.id)} style={{ ...btnReset, flexShrink: 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)', opacity: 0.35 }}>close</span>
                    </button>
                  </div>
                )
              })())}
            <button onClick={() => setShowAddRutina(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 4px',
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginTop: 4,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>add</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Agregar rutina</span>
            </button>
          </div>
        )}
      </div>

      {/* Drag ghost */}
      {dragging && (
        <div style={{
          position: 'fixed',
          top: dragging.y - 28,
          left: 16, right: 16,
          zIndex: 500,
          pointerEvents: 'none',
          background: 'var(--navy)',
          borderRadius: 12,
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 12px 32px rgba(0,0,0,.4)',
          transform: 'scale(1.03)',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'rgba(255,255,255,.5)' }}>drag_indicator</span>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#fff' }}>{dragging.item.nombre}</span>
          {dragging.overSecId && dragging.overSecId !== dragging.item.seccion_id && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', fontWeight: 600 }}>
              → {plazaSecciones.find(s => s.id === dragging.overSecId)?.nombre}
            </span>
          )}
        </div>
      )}

      {/* Sheets */}
      {guia && (
        <MiseGuiaSheet
          foco={guia.foco}
          onClose={() => setGuia(null)}
          onVerEnPantalla={() => {
            // El recorrido apunta a controles que viven dentro de la lista:
            // se abren todas las secciones para que existan en el DOM, y el
            // Modo Control se apaga porque esconde la mitad de los controles.
            setCollapsed({})
            setModoControl(false)
            try { localStorage.setItem('checklist_modo_control', 'false') } catch { /* ignore */ }
            setGuia(null)
            setTimeout(() => setTourOn(true), 240)
          }}
        />
      )}
      {tourOn && (
        <MiseTourOverlay
          faseActual={tab}
          onSetFase={f => setTab(f)}
          onFinish={() => setTourOn(false)}
        />
      )}
      {showAddSheet && (
        <AddItemSheet
          seccionId={showAddSheet}
          seccionNombre={plazaSecciones.find(s => s.id === showAddSheet)?.nombre ?? ''}
          plaza={plaza}
          recetas={recetas.map(r => ({ ...r, porciones: r.porciones ?? undefined }))}
          onSave={async d => {
            const nuevoItemId = await agregarItem(d)
            if (d.prioridad === 'sp' || d.prioridad === 'p') {
              const plazoPlazas = d.receta_id ? (platoPlazoMap[d.receta_id] ?? []) : []
              const primaryPlaza = plazoPlazas.length > 0 ? plazoPlazas[0].plaza : d.plaza
              await handleCrearTarea({
                titulo: d.nombre,
                seccion: PLAZA_TO_SECCION[primaryPlaza] ?? 'general',
                prioridad: MISE_PRIO_TO_TAREA[d.prioridad] ?? 'alta',
                dia: 'hoy',
                nota: null,
                cantidad: d.cantidad > 0 ? d.cantidad : null,
                receta_id: d.receta_id ?? null,
                plaza: primaryPlaza,
                plazas: plazoPlazas,
                checklist_item_id: nuevoItemId ?? null,
              })
              setToast(`Agregado a checklist y tareas: ${d.nombre}`)
            } else {
              setToast(`Agregado: ${d.nombre}`)
            }
            setShowAddSheet(null)
          }}
          onClose={() => setShowAddSheet(null)}
        />
      )}
      {showSectionEditor && (
        <SectionEditor
          secciones={plazaSecciones} items={plazaItems} plaza={plaza}
          onAdd={agregarSeccion} onUpdate={actualizarSeccion}
          onDelete={eliminarSeccion} onReorder={reordenarSecciones}
          onClose={() => setShowSectionEditor(false)}
        />
      )}
      {showAddRutina && (
        <AddRutinaSheet
          plaza={plaza}
          rutinasAuditoria={rutinasAuditoriaDisponibles}
          onSave={async d => { await agregarRutina(d); setShowAddRutina(false) }}
          onClose={() => setShowAddRutina(false)}
        />
      )}
      {editRutina && (
        <AddRutinaSheet
          plaza={plaza}
          editing={editRutina}
          rutinasAuditoria={rutinasAuditoriaDisponibles.filter(r => r.id !== editRutina.id)}
          onSave={async d => { await actualizarRutina(editRutina.id, { nombre: d.nombre, frecuencia: d.frecuencia, puntaje: d.puntaje, requiere_foto: d.requiere_foto, condicion: d.condicion }); setEditRutina(null) }}
          onClose={() => setEditRutina(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 'var(--toast-bottom)', left: 16, right: 16, zIndex: 300,
          background: '#22c55e', color: '#fff', borderRadius: 12,
          padding: '12px 16px', fontSize: 13, fontWeight: 600, textAlign: 'center',
          boxShadow: '0 8px 24px rgba(34,197,94,.3)',
        }}>{toast}</div>
      )}

      {/* Aviso persistente — apertura 100% completa. Solo informa (el trabajo
          que sigue es producir, no tocar el mise), así que se puede cerrar. */}
      {mostrarAvisoApertura && (
        <div style={{
          position: 'fixed', bottom: 'var(--toast-bottom)', left: 16, right: 16, zIndex: 299,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
          padding: '10px 10px 10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,.18)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#22c55e', flexShrink: 0 }}>check_circle</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>¡Terminaste la apertura!</div>
            {/* Con producción despachada el aviso lo dice: la vuelta está
                hecha, la cocina no. Decir solo "terminaste" con 12 cosas en el
                horno sería mentir. */}
            <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
              {total} {total === 1 ? 'ítem revisado' : 'ítems revisados'}
              {enProduccion > 0
                ? ` — ${enProduccion} en producción`
                : ' — a producir tranquilo'}
            </div>
          </div>
          <button
            onClick={() => setAvisoAperturaOculto(avisoAperturaKey)}
            title="Cerrar aviso"
            style={{ ...btnReset, flexShrink: 0, padding: 8, color: 'var(--text-3)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>
      )}

      {/* Barra persistente — cierre 100% completo.
          Ya no está condicionada al fichaje: entregar la plaza es del turno, no
          de la persona, y el que no fichó entrada igual tiene que poder pasar
          el turno. El botón de salida (fichaje) queda detrás de la entrega. */}
      {tab === 'cierre' && plaza && total > 0 && done === total && (
        <div style={{
          position: 'fixed', bottom: 'var(--toast-bottom)', left: 16, right: 16, zIndex: 299,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
          padding: '10px 10px 10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,.18)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#22c55e', flexShrink: 0 }}>
            {entregaActual ? 'published_with_changes' : 'task_alt'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>
              {entregaActual ? 'Plaza entregada' : 'Cierre completo'}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
              {entregaActual
                ? `${new Date(entregaActual.cerrado_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}${proximoTurno ? ` · la plaza pasó a ${proximoTurno.nombre}` : ''}`
                : proximoTurno ? `Entregala para pasar a ${proximoTurno.nombre}` : 'Entregala para pasar el turno'}
            </div>
          </div>
          {/* Entregar primero; una vez entregada, la barra ofrece la salida
              personal (solo si hay fichaje abierto que cerrar). */}
          {!entregaActual ? (
            <button
              onClick={handleEntregarPlaza}
              disabled={entregando}
              data-coach-target="mise-entregar"
              style={{
                flexShrink: 0, padding: '10px 14px', borderRadius: 10, border: 'none',
                background: '#22c55e', color: '#fff', fontSize: 12.5, fontWeight: 700,
                cursor: entregando ? 'default' : 'pointer', fontFamily: 'inherit',
                opacity: entregando ? 0.6 : 1,
                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>outbox</span>
              {entregando ? 'Entregando…' : 'Entregar plaza'}
            </button>
          ) : fichajeAbierto ? (
            <button
              onClick={handleCerrarTurno}
              disabled={cerrandoTurno}
              style={{
                flexShrink: 0, padding: '10px 14px', borderRadius: 10, border: 'none',
                background: '#ef4444', color: '#fff', fontSize: 12.5, fontWeight: 700,
                cursor: cerrandoTurno ? 'default' : 'pointer', fontFamily: 'inherit',
                opacity: cerrandoTurno ? 0.6 : 1,
                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>stop_circle</span>
              {cerrandoTurno ? 'Cerrando…' : 'Marcar salida'}
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Add Item Sheet — simplified
// ══════════════════════════════════════════════════════════════
function AddItemSheet({ seccionId, seccionNombre, plaza, recetas, onSave, onClose }: {
  seccionId: string; seccionNombre: string; plaza: Plaza
  recetas: { id: string; nombre: string; porciones?: number }[]
  onSave: (d: { plaza: Plaza; seccion_id: string; nombre: string; cantidad: number; unidad: string; prioridad: MisePrioridad; ubicacion?: string; receta_id?: string }) => Promise<void>
  onClose: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [unidad, setUnidad] = useState('u')
  const [prioridad, setPrioridad] = useState<MisePrioridad>('p')
  const [recetaId, setRecetaId] = useState<string | null>(null)
  const [showSug, setShowSug] = useState(false)
  const [saving, setSaving] = useState(false)

  const sugs = useMemo(() => {
    if (!nombre || nombre.length < 2) return []
    const q = nombre.toLowerCase()
    return recetas.filter(r => r.nombre.toLowerCase().includes(q)).slice(0, 5)
  }, [nombre, recetas])

  const selectReceta = (r: typeof recetas[0]) => {
    setNombre(r.nombre); setRecetaId(r.id); setShowSug(false)
    if (r.porciones) setCantidad(String(r.porciones))
    setPrioridad('p')
  }

  const handleSave = async () => {
    if (!nombre.trim()) return
    setSaving(true)
    try {
      await onSave({ plaza, seccion_id: seccionId, nombre: nombre.trim(), cantidad: parseFloat(cantidad) || 0, unidad, prioridad, receta_id: recetaId || undefined })
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border)' }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 16 }}>
            Agregar a {seccionNombre}
          </div>

          {/* Name with recipe suggestions */}
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <label style={lbl}>Nombre</label>
            {recetaId ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, background: 'rgba(67,97,160,.07)', border: '1px solid rgba(67,97,160,.2)', borderRadius: 10, padding: '8px 12px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#4361a0' }}>restaurant_menu</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{nombre}</span>
                <button onClick={() => { setRecetaId(null); setNombre('') }} style={btnReset}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>close</span>
                </button>
              </div>
            ) : (
              <>
                <input
                  value={nombre}
                  onChange={e => { setNombre(e.target.value); setShowSug(true) }}
                  onFocus={() => setShowSug(true)}
                  placeholder="Ej: Salsa criolla, Lechuga..."
                  style={{ ...inp, marginTop: 6 }}
                  autoFocus
                />
                {showSug && sugs.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, marginTop: 2, boxShadow: '0 8px 24px rgba(0,0,0,.12)', maxHeight: 180, overflow: 'auto' }}>
                    {sugs.map(r => (
                      <button key={r.id} onClick={() => selectReceta(r)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#4361a0' }}>restaurant_menu</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{r.nombre}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Priority */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Prioridad</label>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {(['sp', 'p', 'ref', 'chk'] as MisePrioridad[]).map(pr => {
                const cfg = PRIO_CFG[pr]
                return (
                  <button key={pr} onClick={() => setPrioridad(pr)} style={{
                    flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 12, fontWeight: 800,
                    background: prioridad === pr ? cfg.bg : 'var(--bg)',
                    color: prioridad === pr ? cfg.color : 'var(--text-3)',
                    outline: prioridad === pr ? `2px solid ${cfg.color}50` : 'none',
                    transition: 'all .15s',
                  }}>{cfg.label}</button>
                )
              })}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 5 }}>
              {prioridad === 'sp' ? 'Súper prioridad — urgente, irá a tareas' : prioridad === 'p' ? 'Prioridad — irá a tareas' : prioridad === 'ref' ? 'Refuerzo — controlar' : 'OK — sin acción requerida'}
            </div>
          </div>

          {/* Quantity + unit */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Cantidad estándar</label>
              <input type="number" value={cantidad} onChange={e => setCantidad(e.target.value)} placeholder="0" style={{ ...inp, marginTop: 6, fontFamily: "'DM Mono', monospace" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Unidad</label>
              <select value={unidad} onChange={e => setUnidad(e.target.value)} style={{ ...inp, marginTop: 6 }}>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 16px', paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={handleSave}
            disabled={!nombre.trim() || saving}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
              background: nombre.trim() ? 'linear-gradient(135deg, var(--navy), #4361a0)' : 'var(--border)',
              color: nombre.trim() ? '#fff' : 'var(--text-3)',
              fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
              cursor: nombre.trim() ? 'pointer' : 'default',
              opacity: saving ? 0.6 : 1, transition: 'all .15s',
            }}
          >
            {saving ? 'Guardando...' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Auditoría — fila de rutina con puntaje (M4, jul 2026)
// ══════════════════════════════════════════════════════════════
function AuditoriaRutinaRow({ rut, reg, fotoPendiente, fecha, onFotoUploaded, onEstado, onUndo, onEdit, onDelete }: {
  rut: ChecklistRutina
  reg: ChecklistRutinaRegistro | undefined
  fotoPendiente: string | null
  fecha: string
  onFotoUploaded: (url: string) => void
  onEstado: (estado: 'ok' | 'fallo') => Promise<void>
  onUndo: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [saving, setSaving] = useState<'ok' | 'fallo' | null>(null)
  const respondido = reg?.estado === 'ok' || reg?.estado === 'fallo'
  const fotoLista = fotoPendiente ?? reg?.foto_url ?? null
  const puedeResponder = !rut.requiere_foto || !!fotoLista

  async function handleClick(estado: 'ok' | 'fallo') {
    if (!puedeResponder || saving) return
    setSaving(estado)
    try { await onEstado(estado) } finally { setSaving(null) }
  }

  return (
    <div style={{
      padding: '11px 12px',
      background: reg?.estado === 'fallo' ? 'rgba(239,68,68,.05)' : reg?.estado === 'ok' ? 'rgba(34,197,94,.04)' : 'var(--surface)',
      border: `1px solid ${reg?.estado === 'fallo' ? 'rgba(239,68,68,.25)' : reg?.estado === 'ok' ? 'rgba(34,197,94,.22)' : 'var(--border)'}`,
      borderRadius: 14, transition: 'all .2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#8b5cf6', flexShrink: 0, marginTop: 1 }}>verified</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{rut.nombre}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
            <span>{FREQ_LABELS[rut.frecuencia as RutinaFrecuencia]} · {rut.puntaje} pts</span>
            {rut.requiere_foto && <span className="material-symbols-outlined" style={{ fontSize: 12 }}>photo_camera</span>}
          </div>
        </div>
        <button onClick={onEdit} style={{ ...btnReset, flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--text-3)', opacity: 0.5 }}>tune</span>
        </button>
        <button onClick={onDelete} style={{ ...btnReset, flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)', opacity: 0.35 }}>close</span>
        </button>
      </div>

      {respondido ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, paddingLeft: 30 }}>
          <span style={{
            fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 6, textTransform: 'uppercase',
            background: reg?.estado === 'ok' ? 'rgba(34,197,94,.13)' : 'rgba(239,68,68,.13)',
            color: reg?.estado === 'ok' ? '#22c55e' : '#ef4444',
          }}>{reg?.estado === 'ok' ? 'OK' : 'Falla'}</span>
          {reg?.foto_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={reg.foto_url} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} />
          )}
          <button onClick={onUndo} style={{ ...btnReset, marginLeft: 'auto' }}>
            <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>Deshacer</span>
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, paddingLeft: 30 }}>
          {rut.requiere_foto && (
            <PhotoPicker
              currentUrl={fotoLista}
              path={`checklists/${rut.id}-${fecha}`}
              onUploaded={onFotoUploaded}
              size={40}
            />
          )}
          <div style={{ display: 'flex', gap: 6, flex: 1 }}>
            <button
              onClick={() => handleClick('ok')}
              disabled={!puedeResponder || saving !== null}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: puedeResponder ? 'pointer' : 'default',
                fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                background: 'rgba(34,197,94,.13)', color: '#22c55e', opacity: puedeResponder ? 1 : 0.4,
              }}
            >{saving === 'ok' ? '...' : 'OK'}</button>
            <button
              onClick={() => handleClick('fallo')}
              disabled={!puedeResponder || saving !== null}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: puedeResponder ? 'pointer' : 'default',
                fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                background: 'rgba(239,68,68,.13)', color: '#ef4444', opacity: puedeResponder ? 1 : 0.4,
              }}
            >{saving === 'fallo' ? '...' : 'Falla'}</button>
          </div>
          {rut.requiere_foto && !fotoLista && (
            <span style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>Foto obligatoria</span>
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Add / Edit Rutina Sheet
// ══════════════════════════════════════════════════════════════
function AddRutinaSheet({ plaza, editing, rutinasAuditoria, onSave, onClose }: {
  plaza: Plaza
  editing?: ChecklistRutina
  rutinasAuditoria: ChecklistRutina[]
  onSave: (d: {
    nombre: string; plaza: Plaza; frecuencia: RutinaFrecuencia
    puntaje?: number | null; requiere_foto?: boolean; condicion?: RutinaCondicion | null
  }) => Promise<void>
  onClose: () => void
}) {
  const [nombre, setNombre] = useState(editing?.nombre ?? '')
  const [frecuencia, setFrecuencia] = useState<RutinaFrecuencia>((editing?.frecuencia as RutinaFrecuencia) ?? 'semanal')
  const [esAuditoria, setEsAuditoria] = useState(editing?.puntaje != null)
  const [puntaje, setPuntaje] = useState(editing?.puntaje != null ? String(editing.puntaje) : '10')
  const [requiereFoto, setRequiereFoto] = useState(editing?.requiere_foto ?? false)
  const [dependeDeId, setDependeDeId] = useState(editing?.condicion?.dependeDeId ?? '')
  const [mostrarSi, setMostrarSi] = useState<'ok' | 'fallo'>(editing?.condicion?.mostrarSiEstado ?? 'fallo')
  const [saving, setSaving] = useState(false)

  // Rutinas sincronizadas desde HACCP (dias_semana/dia_mes) no deben perder su nombre/frecuencia acá
  const bloqueado = editing != null && (editing.dias_semana != null || editing.dia_mes != null)

  const handleSave = async () => {
    if (!nombre.trim()) return
    setSaving(true)
    try {
      await onSave({
        nombre: nombre.trim(), plaza, frecuencia,
        puntaje: esAuditoria ? (parseFloat(puntaje) || 0) : null,
        requiere_foto: esAuditoria ? requiereFoto : false,
        condicion: esAuditoria && dependeDeId ? { dependeDeId, mostrarSiEstado: mostrarSi } : null,
      })
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border)' }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 14 }}>
            {editing ? 'Editar tarea de rutina' : 'Agregar tarea de rutina'}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Nombre</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Limpieza de campana..." style={{ ...inp, marginTop: 6, opacity: bloqueado ? 0.6 : 1 }} disabled={bloqueado} autoFocus={!editing} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Frecuencia</label>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {(['diaria', 'semanal', 'quincenal', 'mensual'] as RutinaFrecuencia[]).map(f => (
                <button key={f} onClick={() => !bloqueado && setFrecuencia(f)} disabled={bloqueado} style={{
                  flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: bloqueado ? 'default' : 'pointer',
                  fontFamily: 'inherit', fontSize: 10, fontWeight: 700, opacity: bloqueado ? 0.6 : 1,
                  background: frecuencia === f ? 'var(--navy)' : 'var(--bg)',
                  color: frecuencia === f ? '#fff' : 'var(--text-3)', transition: 'all .15s',
                }}>{FREQ_LABELS[f]}</button>
              ))}
            </div>
            {bloqueado && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 5 }}>Sincronizada desde HACCP → Limpieza — el nombre y la frecuencia se editan ahí.</div>}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 14 }}>
            <button onClick={() => setEsAuditoria(v => !v)} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginBottom: esAuditoria ? 12 : 0,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: esAuditoria ? '#8b5cf6' : 'var(--text-3)' }}>
                {esAuditoria ? 'toggle_on' : 'toggle_off'}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Ítem de auditoría (con puntaje)</span>
            </button>

            {esAuditoria && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={lbl}>Puntaje</label>
                  <input type="number" value={puntaje} onChange={e => setPuntaje(e.target.value)} style={{ ...inp, marginTop: 6, fontFamily: "'DM Mono', monospace" }} />
                </div>
                <button onClick={() => setRequiereFoto(v => !v)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: requiereFoto ? '#8b5cf6' : 'var(--text-3)' }}>
                    {requiereFoto ? 'check_box' : 'check_box_outline_blank'}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Requiere foto obligatoria</span>
                </button>
                {rutinasAuditoria.length > 0 && (
                  <div>
                    <label style={lbl}>Mostrar solo si (opcional)</label>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <select value={dependeDeId} onChange={e => setDependeDeId(e.target.value)} style={{ ...inp, flex: 2 }}>
                        <option value="">Siempre visible</option>
                        {rutinasAuditoria.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                      </select>
                      {dependeDeId && (
                        <select value={mostrarSi} onChange={e => setMostrarSi(e.target.value as 'ok' | 'fallo')} style={{ ...inp, flex: 1 }}>
                          <option value="fallo">= Falla</option>
                          <option value="ok">= OK</option>
                        </select>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={{ padding: '12px 16px', paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={handleSave}
            disabled={!nombre.trim() || saving}
            style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: nombre.trim() ? 'linear-gradient(135deg, var(--navy), #4361a0)' : 'var(--border)', color: nombre.trim() ? '#fff' : 'var(--text-3)', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: nombre.trim() ? 'pointer' : 'default', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Style constants ──
const inp: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', width: '100%', boxSizing: 'border-box' }
const lbl: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em' }

// suppress unused import warnings — these are used implicitly via string refs
void nextPrio
