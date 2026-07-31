'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ItemOps } from './ItemOps'
import { QuickAdd } from './QuickAdd'
import type { CrearTareaSheetConfirmData } from './CrearTareaSheet'
import { usePlazasCustom } from '@/lib/hooks/usePlazasCustom'
import { plazaColor, plazaIcon, plazaLabel, todasLasPlazas } from '@/lib/constants'
import type { OpsEstado, OpsModo, Plaza, Tarea, TareaPrioridad } from '@/types'

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
}

function capitalizar(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function ProduccionBoard({
  tareas, subtareasByParent, onAddItem, onEstadoChange, onAddSubtarea,
  onPrioridadChange, onCrearTareaDesdeItem, recetas, otros, restauranteId,
}: ProduccionBoardProps) {
  const { plazasCustom } = usePlazasCustom()

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
    const keysPlaza = [
      ...ordenPlazas.filter(p => porPlaza.has(p)),
      ...[...porPlaza.keys()].filter(k => k !== SIN_PLAZA && !ordenPlazas.includes(k)),
      ...plazasExtra.filter(p => !porPlaza.has(p)),
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
    if (columnasCarta.length > 0) {
      out.push({ id: 'carta', titulo: 'Carta', icono: 'menu_book', color: '#3b82f6', columnas: columnasCarta })
    }
    const colMenu = columnasPorPaso(porModo('menu'), 'menu')
    if (colMenu.length > 0) {
      out.push({ id: 'menu', titulo: 'Menú', icono: 'restaurant', color: '#8b5cf6', columnas: colMenu })
    }
    const colEvento = columnasPorPaso(porModo('evento'), 'evento')
    if (colEvento.length > 0) {
      out.push({ id: 'evento', titulo: 'Evento', icono: 'celebration', color: '#f97316', columnas: colEvento })
    }
    return out
  }, [tareas, plazasCustom, plazasExtra])

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

  if (foco && columnaFoco) {
    return (
      <div>
        <button
          onClick={() => setFoco(null)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
            padding: '6px 12px', borderRadius: 99, cursor: 'pointer',
            background: 'var(--surface)', border: '1px solid var(--border)',
            color: 'var(--text-2)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
          Ver todo el turno
        </button>
        <ColumnaOps
          columna={columnaFoco}
          subtareasByParent={subtareasByParent}
          onAddItem={onAddItem}
          onEstadoChange={onEstadoChange}
          onAddSubtarea={onAddSubtarea}
          onPrioridadChange={onPrioridadChange}
          onCrearTareaDesdeItem={onCrearTareaDesdeItem}
          recetas={recetas}
          enfocada
          onFocus={() => setFoco(null)}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {bandas.map(banda => {
        const cerrada = bandasCerradas.includes(banda.id)
        const items = banda.columnas.flatMap(c => c.items)
        const listos = items.filter(i => i.estado === 'listo').length
        const sp = items.filter(i => (i.prioridad ?? 'baja') === 'critica' && i.estado !== 'listo').length
        return (
          <section key={banda.id}>
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
            {!cerrada && (
              <>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: 10, alignItems: 'start',
                }}>
                  {banda.columnas.map(col => (
                    <ColumnaOps
                      key={col.id}
                      columna={col}
                      subtareasByParent={subtareasByParent}
                      onAddItem={onAddItem}
                      onEstadoChange={onEstadoChange}
                      onAddSubtarea={onAddSubtarea}
                      onPrioridadChange={onPrioridadChange}
                      onCrearTareaDesdeItem={onCrearTareaDesdeItem}
                      recetas={recetas}
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
  onPrioridadChange, onCrearTareaDesdeItem, recetas, onFocus, enfocada,
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
}) {
  const [cerrada, setCerrada] = useState(false)
  const { items, color, destino } = columna

  const listos = items.filter(i => i.estado === 'listo').length
  const total = items.length
  const pct = total > 0 ? listos / total : 0
  const sp = items.filter(i => (i.prioridad ?? 'baja') === 'critica' && i.estado !== 'listo').length

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
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, overflow: 'hidden', marginBottom: 2,
    }}>
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
          <ItemsPorPrioridad
            items={items}
            subtareasByParent={subtareasByParent}
            onEstadoChange={onEstadoChange}
            onAddSubtarea={onAddSubtarea}
            onPrioridadChange={onPrioridadChange}
            onCrearTareaDesdeItem={onCrearTareaDesdeItem}
            modo={destino.modo}
          />
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
  items, subtareasByParent, onEstadoChange, onAddSubtarea, onPrioridadChange, onCrearTareaDesdeItem, modo,
}: {
  items: Tarea[]
  subtareasByParent: Record<string, Tarea[]>
  onEstadoChange: (id: string, estado: OpsEstado) => void
  onAddSubtarea: (parentId: string, titulo: string) => Promise<void>
  onPrioridadChange: (id: string, prioridad: TareaPrioridad) => void
  onCrearTareaDesdeItem: (item: Tarea, data: CrearTareaSheetConfirmData) => Promise<void>
  modo: OpsModo
}) {
  const [verSecundarias, setVerSecundarias] = useState(false)

  const grupos = useMemo(() => PRIO_ORDEN.map(prio => ({
    prio,
    items: items.filter(i => (i.prioridad ?? 'baja') === prio),
  })), [items])

  const principales = grupos.filter(g => PRIO_PRINCIPALES.includes(g.prio) && g.items.length > 0)
  const secundarias = grupos.filter(g => !PRIO_PRINCIPALES.includes(g.prio) && g.items.length > 0)
  const nSecundarias = secundarias.reduce((s, g) => s + g.items.length, 0)

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
            />
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return <div style={{ padding: '8px 2px', fontSize: 12, color: 'var(--text-3)' }}>Sin preparaciones aún</div>
  }

  return (
    <>
      {principales.map(g => renderGrupo(g.prio, g.items))}
      {nSecundarias > 0 && (
        verSecundarias ? (
          <>
            {secundarias.map(g => renderGrupo(g.prio, g.items))}
            <button onClick={() => setVerSecundarias(false)} style={verMasStyle}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>expand_less</span>
              Ocultar refuerzos y checks
            </button>
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
