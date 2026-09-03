'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ItemOps, type Densidad } from './ItemOps'
import { QuickAdd } from './QuickAdd'
import { NotasPlaza } from './NotasPlaza'
import { CopiarPaseBoton } from './CopiarPaseBoton'
import type { CrearTareaSheetConfirmData } from './CrearTareaSheet'
import { usePlazasCustom } from '@/lib/hooks/usePlazasCustom'
import { useNotasPlaza } from '@/lib/hooks/useNotasPlaza'
import { useCierresTurno } from '@/lib/hooks/useCierresTurno'
import { useTurnosServicio } from '@/lib/hooks/useTurnosServicio'
import { useTareas } from '@/lib/hooks/useTareas'
import { useAuth } from '@/lib/auth/context'
import { plazaColor, plazaIcon, plazaLabel, todasLasPlazas } from '@/lib/constants'
import { hoyOperativo, resolverTurnoDePlaza } from '@/lib/ops/turnos'
import type { OpsEstado, OpsModo, PaseMensaje, Plaza, Tarea, TareaPrioridad } from '@/types'

// ── Board de OPS Producción, vista "Todo" ────────────────────────────────────
//
// Organiza el turno completo en bandas apiladas, cada una con su propio eje:
//   · CARTA  → una columna por PLAZA (quién lo ejecuta: parrilla, fríos, …)
//   · MENÚ   → una columna por PASO del menú (en qué orden sale)
//   · EVENTO → igual que menú, pero separado (no se mezcla con el servicio normal)
//   · OTROS  → Pedidos y Limpieza, que no son producción y no tienen plaza
//
// Dentro de cada columna la prioridad ya no es una columna propia: los ítems se
// ordenan por prioridad, con una franja de color y un rótulo cuando cambia el
// bloque, y REF + Check quedan plegados detrás de un "+N" para que SP y P no
// compitan por atención. La prioridad se sigue editando tocando el chip del ítem.

const SIN_PLAZA = '__sin_plaza__'

const PRIO_META: Record<TareaPrioridad, { label: string; color: string }> = {
  critica: { label: 'SP',    color: '#ef4444' },
  alta:    { label: 'P',     color: '#f97316' },
  media:   { label: 'REF',   color: '#3b82f6' },
  baja:    { label: 'Check', color: '#64748b' },
}
const PRIO_ORDEN: TareaPrioridad[] = ['critica', 'alta', 'media', 'baja']
// Las dos primeras siempre visibles; las otras dos, plegadas por defecto.
const PRIO_PRINCIPALES: TareaPrioridad[] = ['critica', 'alta']

// Pasos canónicos de un menú/evento. Las tareas viejas traen la sección con
// mayúsculas mezcladas ('Apetizer' vs 'proteina'), así que la key se normaliza
// a minúsculas antes de agrupar — si no, 'Apetizer' abría una columna aparte.
const PASOS_MENU: { id: string; label: string; color: string }[] = [
  { id: 'apetizer', label: 'Apetizer', color: '#0ea5e9' },
  { id: 'entrada',  label: 'Entrada',  color: '#8b5cf6' },
  { id: 'proteina', label: 'Proteína', color: '#ef4444' },
  { id: 'pasta',    label: 'Pasta',    color: '#f97316' },
  { id: 'veggie',   label: 'Veggie',   color: '#22c55e' },
  { id: 'postre',   label: 'Postre',   color: '#ec4899' },
]

export interface NuevaTareaBoard {
  titulo: string
  recetaId?: string
  modo: OpsModo
  plaza: string | null
  seccion: string | null
  prioridad: TareaPrioridad
}

interface ColumnaBoard {
  id: string
  label: string
  icono: string
  color: string
  items: Tarea[]
  /** Qué tarea crear cuando se usa el QuickAdd de esta columna. */
  destino: { modo: OpsModo; plaza: string | null; seccion: string | null }
  /**
   * La plaza real que representa la columna, cuando la representa. Solo las
   * columnas de Carta son plazas: las de Menú/Evento son pasos del menú, y ahí
   * una "nota de plaza" no significaría nada. Null también en "Sin plaza".
   */
  plazaKey?: string | null
}

interface BandaBoard {
  id: string
  titulo: string
  icono: string
  color: string
  columnas: ColumnaBoard[]
}

interface ProduccionBoardProps {
  /** Tareas top-level ya filtradas por día + carryover (todos los modos). */
  tareas: Tarea[]
  subtareasByParent: Record<string, Tarea[]>
  onAddItem: (nueva: NuevaTareaBoard) => Promise<void>
  onEstadoChange: (id: string, estado: OpsEstado) => void
  onAddSubtarea: (parentId: string, titulo: string) => Promise<void>
  onPrioridadChange: (id: string, prioridad: TareaPrioridad) => void
  onCrearTareaDesdeItem: (item: Tarea, data: CrearTareaSheetConfirmData) => Promise<void>
  recetas: { id: string; nombre: string }[]
  /** Recuadros de Pedidos y Limpieza — los arma la pantalla, van en la banda "Otros". */
  otros?: ReactNode
  restauranteId: string
  /**
   * 'todo': una banda por origen (Carta / Menú / Evento), cada una con su
   * encabezado plegable, y solo las que tienen algo cargado.
   * 'carta': solo el servicio normal. Sin encabezado de banda (lo dice el toggle
   * del header) y con las columnas de plaza siempre presentes, incluso en un día
   * vacío — el QuickAdd de la columna es la única forma de cargar producción.
   */
  vista?: 'todo' | 'carta'
  /** Densidad de fila de ItemOps — cómoda (default) o compacta. Ver ItemOps.tsx. */
  densidad?: Densidad
}

function capitalizar(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function ProduccionBoard({
  tareas, subtareasByParent, onAddItem, onEstadoChange, onAddSubtarea,
  onPrioridadChange, onCrearTareaDesdeItem, recetas, otros, restauranteId,
  vista = 'todo', densidad,
}: ProduccionBoardProps) {
  const mostrarBandas = vista === 'todo'
  const { plazasCustom } = usePlazasCustom()
  // Un solo hook para todo el board (una query + una suscripción realtime),
  // no uno por columna: con 6 plazas serían 6 canales abiertos para leer la
  // misma tabla.
  const { notasDe, agregar: agregarNota, eliminar: eliminarNota } = useNotasPlaza()

  // ── Corte del pase de turno, por plaza ──────────────────────────────────
  // Lo que se terminó ANTES de que la plaza entregara es trabajo del turno que
  // se fue: se pliega para que el que entra abra en lo que le toca, no en 40
  // filas verdes. Lo que se tilde DESPUÉS de la entrega queda a la vista (el
  // que sale casi siempre se queda un rato más), y a las 05:00 se va todo solo
  // con el rollover de la jornada.
  //
  // Se compara por timestamp y NO por turno a propósito: entregar la plaza es
  // justamente lo que hace avanzar su turno vigente, así que preguntar "¿ya
  // entregó el turno actual?" se responde que no en el instante siguiente a la
  // entrega y el plegado se apagaría solo. La hora de corte no tiene ese
  // problema, y además sirve igual con uno, dos o cinco turnos por día.
  const { cierres, entregados } = useCierresTurno()
  // "Copiar pase" en foco (ver más abajo) necesita el turno vigente de la
  // plaza + la lista completa de tareas (no solo la del día — un pase_turno
  // despachado ahora puede caer en la jornada de mañana).
  const { turnosActivos } = useTurnosServicio()
  const { tareas: tareasCompletas } = useTareas()
  const { perfil } = useAuth()
  const cortePorPlaza = useMemo(() => {
    const hoy = hoyOperativo()
    const m = new Map<string, string>()
    for (const c of cierres) {
      if (c.jornada !== hoy) continue
      const prev = m.get(c.plaza)
      if (!prev || c.cerrado_at > prev) m.set(c.plaza, c.cerrado_at)
    }
    return m
  }, [cierres])

  // Bandas plegadas — persistido por restaurante (un turno sin evento cierra
  // esa banda una vez y no la vuelve a ver).
  const [bandasCerradas, setBandasCerradas] = useState<string[]>([])
  useEffect(() => {
    if (!restauranteId) return
    try {
      const raw = localStorage.getItem(`ops_bandas_cerradas_${restauranteId}`)
      setBandasCerradas(raw ? JSON.parse(raw) : [])
    } catch { setBandasCerradas([]) }
  }, [restauranteId])

  const toggleBanda = useCallback((id: string) => {
    setBandasCerradas(prev => {
      const next = prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
      try { localStorage.setItem(`ops_bandas_cerradas_${restauranteId}`, JSON.stringify(next)) } catch {}
      return next
    })
  }, [restauranteId])

  // Foco: un cocinero toca el nombre de su plaza y ve solo esa columna a pantalla
  // completa. No se persiste a propósito — es una vista de momento, no un ajuste.
  const [foco, setFoco] = useState<{ banda: string; columna: string } | null>(null)

  // Plazas agregadas a mano para poder cargar algo en una plaza que hoy no tiene
  // ninguna tarea (si no, no habría QuickAdd donde escribirlo).
  const [plazasExtra, setPlazasExtra] = useState<string[]>([])
  const [eligiendoPlaza, setEligiendoPlaza] = useState(false)

  const bandas = useMemo<BandaBoard[]>(() => {
    const porModo = (m: OpsModo) => tareas.filter(t => (t.modo ?? 'carta') === m)

    // ── Carta → columnas por plaza ──
    const cartaItems = porModo('carta')
    const porPlaza = new Map<string, Tarea[]>()
    for (const t of cartaItems) {
      const key = (t.plaza ?? '').trim() || SIN_PLAZA
      const arr = porPlaza.get(key)
      if (arr) arr.push(t)
      else porPlaza.set(key, [t])
    }
    const ordenPlazas = todasLasPlazas(plazasCustom).map(String)
    // En "Todo" solo se listan las plazas que hoy tienen algo (más las que el
    // usuario haya agregado a mano): el board es un resumen del turno y las
    // columnas vacías serían ruido. En la vista Carta, en cambio, están todas
    // siempre — es el tablero donde se carga el trabajo, y la plaza que hoy no
    // tiene nada es justamente la que necesita un lugar donde escribirlo.
    const keysPlaza = [
      ...ordenPlazas.filter(p => vista === 'carta' || porPlaza.has(p) || plazasExtra.includes(p)),
      ...[...porPlaza.keys()].filter(k => k !== SIN_PLAZA && !ordenPlazas.includes(k)),
      ...plazasExtra.filter(p => !ordenPlazas.includes(p) && !porPlaza.has(p)),
    ]
    if (porPlaza.has(SIN_PLAZA)) keysPlaza.push(SIN_PLAZA)

    const columnasCarta: ColumnaBoard[] = keysPlaza.map(key => {
      const esSinPlaza = key === SIN_PLAZA
      return {
        id: key,
        label: esSinPlaza ? 'Sin plaza' : plazaLabel(key as Plaza, plazasCustom),
        icono: esSinPlaza ? 'help_outline' : plazaIcon(key as Plaza, plazasCustom),
        color: esSinPlaza ? '#94a3b8' : plazaColor(key as Plaza, plazasCustom),
        items: porPlaza.get(key) ?? [],
        destino: { modo: 'carta' as OpsModo, plaza: esSinPlaza ? null : key, seccion: 'general' },
        plazaKey: esSinPlaza ? null : key,
      }
    })

    // ── Menú / Evento → columnas por paso ──
    const columnasPorPaso = (items: Tarea[], modo: OpsModo): ColumnaBoard[] => {
      const porPaso = new Map<string, { label: string; items: Tarea[] }>()
      for (const t of items) {
        const bruto = (t.seccion ?? '').trim()
        const key = (bruto || 'general').toLowerCase()
        const canon = PASOS_MENU.find(p => p.id === key)
        const entrada = porPaso.get(key)
        if (entrada) entrada.items.push(t)
        else porPaso.set(key, { label: canon?.label ?? capitalizar(bruto || 'General'), items: [t] })
      }
      const ordenados = [
        ...PASOS_MENU.filter(p => porPaso.has(p.id)).map(p => p.id),
        ...[...porPaso.keys()].filter(k => !PASOS_MENU.some(p => p.id === k)).sort(),
      ]
      return ordenados.map(key => {
        const canon = PASOS_MENU.find(p => p.id === key)
        return {
          id: key,
          label: porPaso.get(key)!.label,
          icono: 'restaurant_menu',
          color: canon?.color ?? '#64748b',
          items: porPaso.get(key)!.items,
          destino: { modo, plaza: null, seccion: key },
        }
      })
    }

    const out: BandaBoard[] = []
    // En la vista Carta la banda va aunque esté vacía: es toda la pantalla, y
    // sin columnas no habría dónde escribir la primera tarea del día.
    if (columnasCarta.length > 0 || vista === 'carta') {
      out.push({ id: 'carta', titulo: 'Carta', icono: 'menu_book', color: '#3b82f6', columnas: columnasCarta })
    }
    if (vista === 'carta') return out
    const colMenu = columnasPorPaso(porModo('menu'), 'menu')
    if (colMenu.length > 0) {
      // Mismo ámbar que PLAZA_COLORS.menu (lib/constants.ts) — mantener en espejo.
      out.push({ id: 'menu', titulo: 'Menú', icono: 'restaurant', color: '#b45309', columnas: colMenu })
    }
    const colEvento = columnasPorPaso(porModo('evento'), 'evento')
    if (colEvento.length > 0) {
      out.push({ id: 'evento', titulo: 'Evento', icono: 'celebration', color: '#f97316', columnas: colEvento })
    }
    return out
  }, [tareas, plazasCustom, plazasExtra, vista])

  const plazasDisponibles = useMemo(() => {
    const usadas = new Set(bandas.find(b => b.id === 'carta')?.columnas.map(c => c.id) ?? [])
    return todasLasPlazas(plazasCustom).map(String).filter(p => !usadas.has(p))
  }, [bandas, plazasCustom])

  // ── Vista de foco: una sola columna, a pantalla completa ──
  const columnaFoco = foco
    ? bandas.find(b => b.id === foco.banda)?.columnas.find(c => c.id === foco.columna) ?? null
    : null

  // Si la columna enfocada desapareció (se vaciaron o movieron sus tareas),
  // volver solo al board en vez de quedar en una pantalla vacía.
  useEffect(() => {
    if (foco && !columnaFoco) setFoco(null)
  }, [foco, columnaFoco])

  // Solo las columnas de Carta son una plaza real (plazaKey) — un paso de
  // Menú/Evento no tiene pase de turno propio.
  const focoTurno = useMemo(() => (
    columnaFoco?.plazaKey
      ? resolverTurnoDePlaza({ turnos: turnosActivos, entregados, plaza: columnaFoco.plazaKey })
      : null
  ), [columnaFoco, turnosActivos, entregados])

  if (foco && columnaFoco) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <button
            onClick={() => setFoco(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 99, cursor: 'pointer',
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text-2)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
            Ver todo el turno
          </button>
          {columnaFoco.plazaKey && focoTurno && (
            <CopiarPaseBoton
              plaza={columnaFoco.plazaKey} fecha={focoTurno.fecha} jornadaProxima={focoTurno.jornadaProxima}
              tareas={tareasCompletas} plazasCustom={plazasCustom} turnoNombre={focoTurno.turnoNombre}
              notasHoy={notasDe(columnaFoco.plazaKey).filter(n => n.turno_fecha === focoTurno.fecha)}
              autor={[perfil?.nombre, perfil?.apellido].filter(Boolean).join(' ').trim() || null}
              entregadoAt={null}
            />
          )}
        </div>
        <ColumnaOps
          columna={columnaFoco}
          subtareasByParent={subtareasByParent}
          onAddItem={onAddItem}
          onEstadoChange={onEstadoChange}
          onAddSubtarea={onAddSubtarea}
          onPrioridadChange={onPrioridadChange}
          onCrearTareaDesdeItem={onCrearTareaDesdeItem}
          recetas={recetas}
          densidad={densidad}
          notasDe={notasDe}
          onAgregarNota={agregarNota}
          onEliminarNota={eliminarNota}
          corte={columnaFoco.plazaKey ? cortePorPlaza.get(columnaFoco.plazaKey) ?? null : null}
          enfocada
          onFocus={() => setFoco(null)}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {bandas.map(banda => {
        // Con una sola banda (modo Carta) el encabezado repetiría lo que ya dice
        // el toggle del header, y peor: dejaría plegar la única banda de la
        // pantalla — se veía una pantalla vacía sin motivo aparente.
        const cerrada = mostrarBandas && bandasCerradas.includes(banda.id)
        const items = banda.columnas.flatMap(c => c.items)
        const listos = items.filter(i => i.estado === 'listo').length
        const sp = items.filter(i => (i.prioridad ?? 'baja') === 'critica' && i.estado !== 'listo').length
        return (
          <section key={banda.id}>
            {mostrarBandas && (
              <BandaHeader
                titulo={banda.titulo}
                icono={banda.icono}
                color={banda.color}
                listos={listos}
                total={items.length}
                sp={sp}
                cerrada={cerrada}
                onToggle={() => toggleBanda(banda.id)}
              />
            )}
            {!cerrada && (
              <>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: 10, alignItems: 'start',
                }}>
                  {banda.columnas.map((col, idx) => (
                    <ColumnaOps
                      key={col.id}
                      columna={col}
                      // Ancla del tour del Coach: la primera plaza de Carta es
                      // la que se señala al explicar cómo está organizado el board.
                      coachTarget={banda.id === 'carta' && idx === 0 ? 'prod-columna-plaza' : undefined}
                      subtareasByParent={subtareasByParent}
                      onAddItem={onAddItem}
                      onEstadoChange={onEstadoChange}
                      onAddSubtarea={onAddSubtarea}
                      onPrioridadChange={onPrioridadChange}
                      onCrearTareaDesdeItem={onCrearTareaDesdeItem}
                      recetas={recetas}
                      densidad={densidad}
                      notasDe={notasDe}
                      onAgregarNota={agregarNota}
                      onEliminarNota={eliminarNota}
                      corte={col.plazaKey ? cortePorPlaza.get(col.plazaKey) ?? null : null}
                      onFocus={() => setFoco({ banda: banda.id, columna: col.id })}
                    />
                  ))}
                </div>

                {banda.id === 'carta' && plazasDisponibles.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {!eligiendoPlaza ? (
                      <button onClick={() => setEligiendoPlaza(true)} style={chipStyle(false)}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
                        Plaza
                      </button>
                    ) : (
                      <>
                        {plazasDisponibles.map(p => (
                          <button
                            key={p}
                            onClick={() => { setPlazasExtra(prev => [...prev, p]); setEligiendoPlaza(false) }}
                            style={chipStyle(true, plazaColor(p as Plaza, plazasCustom))}
                          >
                            {plazaLabel(p as Plaza, plazasCustom)}
                          </button>
                        ))}
                        <button onClick={() => setEligiendoPlaza(false)} style={chipStyle(false)}>Cancelar</button>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        )
      })}

      {otros && (
        <section>
          <BandaHeader
            titulo="Otros"
            icono="inbox"
            color="#0ea5e9"
            cerrada={bandasCerradas.includes('otros')}
            onToggle={() => toggleBanda('otros')}
          />
          {!bandasCerradas.includes('otros') && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 10, alignItems: 'start',
            }}>
              {otros}
            </div>
          )}
        </section>
      )}

      {bandas.length === 0 && !otros && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
          No hay producción cargada para hoy.
        </div>
      )}
    </div>
  )
}

function chipStyle(activo: boolean, color?: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '5px 11px', borderRadius: 99, cursor: 'pointer',
    fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
    background: activo && color ? `${color}1f` : 'var(--surface)',
    border: `1px solid ${activo && color ? `${color}55` : 'var(--border)'}`,
    color: activo && color ? color : 'var(--text-2)',
  }
}

// ── Header de banda ──────────────────────────────────────────────────────────
function BandaHeader({
  titulo, icono, color, listos, total, sp, cerrada, onToggle,
}: {
  titulo: string
  icono: string
  color: string
  listos?: number
  total?: number
  sp?: number
  cerrada: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        padding: '4px 2px 8px', background: 'none', border: 'none',
        cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 16, color, flexShrink: 0 }}>{icono}</span>
      <span style={{
        fontSize: 12, fontWeight: 800, color: 'var(--text-1)',
        textTransform: 'uppercase', letterSpacing: '.08em',
      }}>
        {titulo}
      </span>
      {total != null && total > 0 && (
        <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: 'var(--text-3)', fontWeight: 700 }}>
          {listos}/{total}
        </span>
      )}
      {sp != null && sp > 0 && (
        <span style={{
          fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 5,
          background: 'rgba(239,68,68,.14)', color: '#ef4444',
        }}>
          {sp} SP
        </span>
      )}
      <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span className="material-symbols-outlined" style={{
        fontSize: 18, color: 'var(--text-3)',
        transform: cerrada ? 'rotate(-90deg)' : 'none', transition: 'transform .15s',
      }}>
        expand_more
      </span>
    </button>
  )
}

// ── Columna (una plaza, o un paso del menú) ─────────────────────────────────
function ColumnaOps({
  columna, subtareasByParent, onAddItem, onEstadoChange, onAddSubtarea,
  onPrioridadChange, onCrearTareaDesdeItem, recetas, onFocus, enfocada, coachTarget, densidad,
  notasDe, onAgregarNota, onEliminarNota, corte,
}: {
  columna: ColumnaBoard
  subtareasByParent: Record<string, Tarea[]>
  onAddItem: (nueva: NuevaTareaBoard) => Promise<void>
  onEstadoChange: (id: string, estado: OpsEstado) => void
  onAddSubtarea: (parentId: string, titulo: string) => Promise<void>
  onPrioridadChange: (id: string, prioridad: TareaPrioridad) => void
  onCrearTareaDesdeItem: (item: Tarea, data: CrearTareaSheetConfirmData) => Promise<void>
  recetas: { id: string; nombre: string }[]
  onFocus: () => void
  enfocada?: boolean
  coachTarget?: string
  densidad?: Densidad
  notasDe: (plaza: string) => PaseMensaje[]
  onAgregarNota: (args: { plaza: string; texto: string; importante?: boolean }) => Promise<void>
  onEliminarNota: (id: string) => Promise<void>
  /** Hora de la última entrega de esta plaza hoy — corte del plegado. */
  corte?: string | null
}) {
  const [cerrada, setCerrada] = useState(false)
  const [verEntregadas, setVerEntregadas] = useState(false)
  const { items, color, destino, plazaKey } = columna

  // El contador del header cuenta la JORNADA entera, plegado incluido: el
  // plegado es qué filas se dibujan, no cuánto se hizo. Si también se achicara,
  // el header mentiría sobre el día.
  const listos = items.filter(i => i.estado === 'listo').length
  const total = items.length
  const pct = total > 0 ? listos / total : 0
  const sp = items.filter(i => (i.prioridad ?? 'baja') === 'critica' && i.estado !== 'listo').length
  const notas = plazaKey ? notasDe(plazaKey) : []

  const { activos, entregadas } = useMemo(() => {
    if (!corte) return { activos: items, entregadas: [] as Tarea[] }
    const a: Tarea[] = [], e: Tarea[] = []
    for (const t of items) {
      // Sin completed_at no se pliega: es la dirección segura del error (se ve
      // de más, no de menos). Solo lo tienen las filas anteriores a que se
      // empezara a estampar.
      if (t.estado === 'listo' && t.completed_at && t.completed_at < corte) e.push(t)
      else a.push(t)
    }
    return { activos: a, entregadas: e }
  }, [items, corte])

  const handleAdd = useCallback(async (titulo: string, recetaId?: string) => {
    await onAddItem({
      titulo,
      recetaId,
      modo: destino.modo,
      plaza: destino.plaza,
      seccion: destino.seccion,
      // Lo que se escribe a mano en una columna es trabajo a producir: entra
      // como P y se re-prioriza tocando el chip del ítem.
      prioridad: 'alta',
    })
  }, [onAddItem, destino])

  return (
    <div
      {...(coachTarget ? { 'data-coach-target': coachTarget } : {})}
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, overflow: 'hidden', marginBottom: 2,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: '9px 12px', gap: 8 }}>
        <button
          onClick={onFocus}
          title={enfocada ? 'Volver al turno completo' : `Ver solo ${columna.label}`}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontFamily: 'inherit', textAlign: 'left', touchAction: 'manipulation',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16, color, flexShrink: 0 }}>
            {columna.icono}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 700, color: 'var(--text-1)',
            textTransform: 'uppercase', letterSpacing: '.06em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {columna.label}
          </span>
        </button>

        {/* Con la columna plegada las notas no se ven — el contador es lo que
            avisa que hay algo escrito para esta plaza. */}
        {notas.length > 0 && (
          <span
            title={notas.length === 1 ? '1 nota de plaza' : `${notas.length} notas de plaza`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0,
              fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 5,
              background: 'rgba(245,158,11,.14)', color: '#d97706',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>sticky_note_2</span>
            {notas.length}
          </span>
        )}
        {sp > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 5, flexShrink: 0,
            background: 'rgba(239,68,68,.14)', color: '#ef4444',
          }}>
            {sp} SP
          </span>
        )}
        <span style={{
          fontSize: 11, fontFamily: "'DM Mono', monospace", flexShrink: 0, fontWeight: 700,
          color: pct === 1 && total > 0 ? '#22c55e' : 'var(--text-3)',
        }}>
          {listos}/{total}
        </span>
        <button
          onClick={() => setCerrada(v => !v)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexShrink: 0, touchAction: 'manipulation' }}
        >
          <span className="material-symbols-outlined" style={{
            fontSize: 18, color: 'var(--text-3)',
            transform: cerrada ? 'rotate(-90deg)' : 'none', transition: 'transform .15s',
          }}>
            expand_more
          </span>
        </button>
      </div>

      <div style={{ height: 2, background: 'var(--border)' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: color, transition: 'width .3s' }} />
      </div>

      {!cerrada && (
        <div style={{ padding: '6px 10px 10px' }}>
          {/* Arriba de las tareas a propósito: es lo que hay que leer antes de
              empezar a trabajar la plaza, no un pie de página. */}
          {plazaKey && (
            <NotasPlaza
              notas={notas}
              onAgregar={(texto, importante) => onAgregarNota({ plaza: plazaKey, texto, importante })}
              onEliminar={onEliminarNota}
            />
          )}
          <ItemsPorPrioridad
            items={activos}
            subtareasByParent={subtareasByParent}
            onEstadoChange={onEstadoChange}
            onAddSubtarea={onAddSubtarea}
            onPrioridadChange={onPrioridadChange}
            onCrearTareaDesdeItem={onCrearTareaDesdeItem}
            modo={destino.modo}
            densidad={densidad}
            // Con todo entregado la columna no está vacía, está terminada —
            // "Sin preparaciones aún" diría lo contrario de lo que pasó.
            silenciarVacio={entregadas.length > 0}
          />

          {/* ── Lo terminado antes del pase ──
              La hora explica por qué está escondido: sin ella parece que las
              tareas se perdieron. */}
          {entregadas.length > 0 && (
            <>
              <button onClick={() => setVerEntregadas(v => !v)} style={verMasStyle}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  {verEntregadas ? 'expand_less' : 'expand_more'}
                </span>
                {verEntregadas
                  ? 'Ocultar lo entregado'
                  : `${entregadas.length} ${entregadas.length === 1 ? 'lista' : 'listas'} antes de las ${new Date(corte!).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}
              </button>
              {verEntregadas && entregadas.map(item => (
                <div key={item.id} style={{ borderLeft: '3px solid var(--border)', borderRadius: 6, paddingLeft: 2 }}>
                  <ItemOps
                    item={item}
                    subtareas={subtareasByParent[item.id] ?? []}
                    onEstadoChange={onEstadoChange}
                    onAddSubtarea={onAddSubtarea}
                    onPrioridadChange={onPrioridadChange}
                    onCrearTareaDesdeItem={onCrearTareaDesdeItem}
                    modo={destino.modo}
                    showSeccionChip={false}
                    showPrioChip
                    densidad={densidad}
                  />
                </div>
              ))}
            </>
          )}

          <div style={{ marginTop: 4 }}>
            <QuickAdd onSave={handleAdd} recetas={recetas} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Ítems ordenados por prioridad, con REF/Check plegados ───────────────────
function ItemsPorPrioridad({
  items, subtareasByParent, onEstadoChange, onAddSubtarea, onPrioridadChange, onCrearTareaDesdeItem, modo, densidad,
  silenciarVacio,
}: {
  items: Tarea[]
  subtareasByParent: Record<string, Tarea[]>
  onEstadoChange: (id: string, estado: OpsEstado) => void
  onAddSubtarea: (parentId: string, titulo: string) => Promise<void>
  onPrioridadChange: (id: string, prioridad: TareaPrioridad) => void
  onCrearTareaDesdeItem: (item: Tarea, data: CrearTareaSheetConfirmData) => Promise<void>
  modo: OpsModo
  densidad?: Densidad
  /** No mostrar el vacío: la columna está plegada, no sin trabajo. */
  silenciarVacio?: boolean
}) {
  const [verSecundarias, setVerSecundarias] = useState(false)

  const grupos = useMemo(() => PRIO_ORDEN.map(prio => ({
    prio,
    items: items.filter(i => (i.prioridad ?? 'baja') === prio),
  })), [items])

  const principales = grupos.filter(g => PRIO_PRINCIPALES.includes(g.prio) && g.items.length > 0)
  const secundarias = grupos.filter(g => !PRIO_PRINCIPALES.includes(g.prio) && g.items.length > 0)
  const nSecundarias = secundarias.reduce((s, g) => s + g.items.length, 0)

  // El plegado existe para que REF/Check no le compitan la atención a SP/P.
  // Sin nada en SP/P no hay a qué no competirle, y como 'baja' es además el
  // fallback de prioridad (i.prioridad ?? 'baja'), una columna cargada entera
  // desde Carta/Menú sin prioridad explícita se renderizaba aparentemente
  // vacía: solo el "+N refuerzos y checks". Si no hay principales, se abren.
  const expandido = verSecundarias || principales.length === 0

  const renderGrupo = (prio: TareaPrioridad, grupoItems: Tarea[]) => {
    const meta = PRIO_META[prio]
    return (
      <div key={prio} style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 2px 3px' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
          <span style={{
            fontSize: 9, fontWeight: 800, color: meta.color,
            textTransform: 'uppercase', letterSpacing: '.08em',
          }}>
            {meta.label}
          </span>
        </div>
        {grupoItems.map(item => (
          <div key={item.id} style={{ borderLeft: `3px solid ${meta.color}`, borderRadius: 6, paddingLeft: 2 }}>
            <ItemOps
              item={item}
              subtareas={subtareasByParent[item.id] ?? []}
              onEstadoChange={onEstadoChange}
              onAddSubtarea={onAddSubtarea}
              onPrioridadChange={onPrioridadChange}
              onCrearTareaDesdeItem={onCrearTareaDesdeItem}
              modo={modo}
              // La columna ya es la plaza (o el paso): el chip de sección sería
              // repetir el encabezado. El de prioridad, en cambio, es necesario
              // acá — es cómo se re-prioriza ahora que no hay columna por prioridad.
              showSeccionChip={false}
              showPrioChip
              densidad={densidad}
            />
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    if (silenciarVacio) return null
    return <div style={{ padding: '8px 2px', fontSize: 12, color: 'var(--text-3)' }}>Sin preparaciones aún</div>
  }

  return (
    <>
      {principales.map(g => renderGrupo(g.prio, g.items))}
      {nSecundarias > 0 && (
        expandido ? (
          <>
            {secundarias.map(g => renderGrupo(g.prio, g.items))}
            {/* Sin principales el plegado no aporta nada: ocultar dejaría la
                columna vacía, así que no se ofrece. */}
            {principales.length > 0 && (
              <button onClick={() => setVerSecundarias(false)} style={verMasStyle}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>expand_less</span>
                Ocultar refuerzos y checks
              </button>
            )}
          </>
        ) : (
          <button onClick={() => setVerSecundarias(true)} style={verMasStyle}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>expand_more</span>
            +{nSecundarias} {nSecundarias === 1 ? 'refuerzo / check' : 'refuerzos y checks'}
          </button>
        )
      )}
    </>
  )
}

const verMasStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, width: '100%',
  padding: '5px 4px', marginTop: 2, borderRadius: 8,
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-3)', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
  touchAction: 'manipulation',
}
