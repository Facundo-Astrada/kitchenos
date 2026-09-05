'use client'

import { useState, useRef, useEffect, memo } from 'react'
import { RecetaDrawer } from './RecetaDrawer'
import { ProduccionSheetConectada } from './ProduccionSheetConectada'
import { CrearTareaSheet, type CrearTareaSheetConfirmData } from './CrearTareaSheet'
import { QuickAdd } from './QuickAdd'
import { PrioridadPicker, type PrioOpcion } from './PrioridadPicker'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { createClient } from '@/lib/supabase/client'
import { hoyOperativo } from '@/lib/ops/turnos'
import type { Tarea, OpsEstado, OpsModo, TareaPrioridad } from '@/types'

export function nextEstado(e: OpsEstado): OpsEstado {
  if (e === 'duda') return 'pendiente'
  const cycle: OpsEstado[] = ['pendiente', 'en_curso', 'listo']
  return cycle[(cycle.indexOf(e) + 1) % cycle.length]
}

// Densidad de la fila — "cómoda" (default, sin cambios) o "compacta": una
// sola línea con tilde + nombre + cantidad, todo lo demás (chips, badges,
// botones secundarios) se ve tocando la fila para expandirla. Ver MURO-PLAN.md
// F2 — es la fila que después reusa el muro (F3), por eso vive acá y no en
// cada pantalla que la usa.
export type Densidad = 'comoda' | 'compacta'

const ESTADO_STYLE: Record<OpsEstado, { bg: string; border: string; icon?: string; text?: string }> = {
  pendiente: { bg: 'transparent',  border: 'var(--border)' },
  en_curso:  { bg: '#3b82f6',      border: '#3b82f6',      icon: 'more_horiz' },
  listo:     { bg: '#22c55e',      border: '#22c55e',      icon: 'check' },
  duda:      { bg: '#f59e0b',      border: '#f59e0b',      icon: 'help', text: '#fff' },
}

interface StockAlert { nombre: string; stock_actual: number; stock_minimo: number; unidad: string }

// Mapa de seccion id → label para el chip de plaza
const SECCION_LABELS: Record<string, string> = {
  apetizer: 'Apetizer', entrada: 'Entrada', proteina: 'Proteína',
  pasta: 'Pasta', veggie: 'Veggie', postre: 'Postre',
  caliente: 'Cocina Caliente', fria: 'Cocina Fría',
  pasteleria: 'Pastelería', salon: 'Salón',
}

// Chip de prioridad para modo menú (agrupado por sección) — mantener apretado
// abre el picker vertical (PrioridadPicker), un tap solo lo deja abierto.
const PRIO_CHIP: Record<string, { label: string; color: string; bg: string }> = {
  critica: { label: 'SP',  color: '#ef4444', bg: 'rgba(239,68,68,.13)' },
  alta:    { label: 'P',   color: '#f97316', bg: 'rgba(249,115,22,.13)' },
  media:   { label: 'REF', color: '#3b82f6', bg: 'rgba(59,130,246,.13)' },
  baja:    { label: 'Baja',color: '#64748b', bg: 'rgba(100,116,139,.1)' },
}
const PRIO_OPCIONES: PrioOpcion<TareaPrioridad>[] = (['critica', 'alta', 'media', 'baja'] as TareaPrioridad[])
  .map(v => ({ value: v, ...PRIO_CHIP[v] }))

interface ItemOpsProps {
  item: Tarea
  subtareas: Tarea[]
  onEstadoChange: (id: string, estado: OpsEstado) => void
  onAddSubtarea: (parentId: string, titulo: string) => Promise<void>
  onPrioridadChange?: (id: string, prioridad: TareaPrioridad) => void
  onCrearTareaDesdeItem?: (item: Tarea, data: CrearTareaSheetConfirmData) => Promise<void>
  depth?: number
  modo?: OpsModo
  showSeccionChip?: boolean
  showPrioChip?: boolean
  densidad?: Densidad
}

function ItemOpsBase({ item, subtareas, onEstadoChange, onAddSubtarea, onPrioridadChange, onCrearTareaDesdeItem, depth = 0, showSeccionChip, showPrioChip, densidad = 'comoda' }: ItemOpsProps) {
  const [expanded, setExpanded] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [prodSheetOpen, setProdSheetOpen] = useState(false)
  const [crearTareaSheetOpen, setCrearTareaSheetOpen] = useState(false)

  // Stock alerts (lazy, loaded once on first expand)
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([])
  const [stockLoaded, setStockLoaded] = useState(false)

  const RESTAURANTE_ID = useRestauranteId()

  // Lazy load de alertas de stock on first expand (solo top-level con receta_id)
  useEffect(() => {
    if (!expanded || depth !== 0 || stockLoaded) return
    setStockLoaded(true)
    if (!item.receta_id || !RESTAURANTE_ID) return

    const sb = createClient()
    Promise.all([
      sb.from('ingredientes').select('nombre').eq('receta_id', item.receta_id),
      sb.from('productos').select('nombre, stock_actual, stock_minimo, unidad').eq('restaurante_id', RESTAURANTE_ID),
    ]).then(([{ data: ings }, { data: prods }]) => {
      if (!ings || !prods) return
      const ingNames = ings.map(i => (i.nombre ?? '').toLowerCase())
      const alerts = prods.filter(p => {
        const pn = (p.nombre ?? '').toLowerCase()
        return ingNames.some(n => n.includes(pn) || pn.includes(n)) &&
          (p.stock_actual ?? 0) < (p.stock_minimo ?? 0)
      })
      setStockAlerts(alerts as StockAlert[])
    })
  }, [expanded, depth, stockLoaded, item.receta_id, RESTAURANTE_ID])

  const estado: OpsEstado = (item.estado as OpsEstado) ?? 'pendiente'
  const st = ESTADO_STYLE[estado]
  const isDuda = estado === 'duda'
  const isListo = estado === 'listo'

  // Pop del tilde al llegar a "listo" (S5) — .tilde-pop en globals.css.
  // Compara contra el estado anterior para no disparar en cada re-render
  // (ej. el board reordena por prioridad) ni al montar ya completado.
  const [justCompleted, setJustCompleted] = useState(false)
  const prevEstadoRef = useRef(estado)
  useEffect(() => {
    const prev = prevEstadoRef.current
    prevEstadoRef.current = estado
    if (prev !== 'listo' && estado === 'listo') {
      setJustCompleted(true)
      const t = setTimeout(() => setJustCompleted(false), 300)
      return () => clearTimeout(t)
    }
  }, [estado])
  // hoyOperativo() (no new Date().toISOString()): esta última usa fecha UTC,
  // que a la noche en Argentina (UTC-3) ya cae en el día siguiente — el badge
  // marcaba "turno ant." en tareas de HOY apenas pasada la medianoche UTC.
  const esDeTurnoAnterior = !!item.turno_fecha && item.turno_fecha < hoyOperativo()

  // Compacta solo aplica al ítem de primer nivel: las subtareas (depth>0) ya
  // renderizan sin chips ni botones secundarios hoy, así que ya son "compactas"
  // por diseño — no hay nada que esconder ahí.
  const compacta = densidad === 'compacta' && depth === 0
  // En compacta colapsada se esconde todo lo que no sea tilde+nombre+cantidad;
  // al expandir (mismo tap que abre subtareas) reaparece igual que en cómoda.
  const mostrarDetalle = !compacta || expanded
  const nameSpanStyle: React.CSSProperties = {
    fontSize: depth > 0 ? 12 : 13,
    fontWeight: depth > 0 ? 500 : 600,
    color: isListo ? 'var(--text-3)' : 'var(--text-1)',
    textDecoration: isListo ? 'line-through' : 'none',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  }

  function handleNameClick() {
    if (depth === 0) setExpanded((v) => !v)
  }

  function handleCheckboxClick(e: React.MouseEvent) {
    e.stopPropagation()
    const next = nextEstado(estado)
    onEstadoChange(item.id, next)
    // Show production sheet when completing a recipe task
    if (next === 'listo' && depth === 0 && item.receta_id) {
      setProdSheetOpen(true)
    }
  }

  async function handleCrearTareaConfirm(data: CrearTareaSheetConfirmData) {
    if (!onCrearTareaDesdeItem) return
    await onCrearTareaDesdeItem(item, data)
    setCrearTareaSheetOpen(false)
  }

  return (
    <div style={{
      marginLeft: depth * 16,
      background: isDuda ? 'rgba(245,158,11,.07)' : 'transparent',
      borderLeft: isDuda ? '3px solid #f59e0b' : depth > 0 ? '2px solid var(--border)' : 'none',
      borderRadius: depth > 0 ? 8 : 10,
      marginBottom: compacta && !expanded ? 1 : 3,
      paddingLeft: depth > 0 ? 2 : 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: depth > 0 ? '6px 10px' : compacta && !expanded ? '5px 10px' : '8px 10px',
      }}>

        {/* Checkbox — cycles estado */}
        <button
          onClick={handleCheckboxClick}
          className={justCompleted ? 'tilde-pop' : undefined}
          style={{
            flexShrink: 0, width: depth > 0 ? 20 : 24, height: depth > 0 ? 20 : 24,
            borderRadius: '50%', background: st.bg, border: `2px solid ${st.border}`,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all .15s', padding: 0,
            // Sin esto, algunos navegadores móviles esperan ~300ms tras el tap
            // (por si viene un doble-tap de zoom) antes de disparar el onClick.
            touchAction: 'manipulation',
          }}
        >
          {st.icon && (
            <span className="material-symbols-outlined" style={{ fontSize: depth > 0 ? 12 : 14, color: '#fff' }}>
              {st.icon}
            </span>
          )}
        </button>

        {/* Name — tap expande/colapsa. El estado 'duda' (círculo ámbar con '?')
            ya no se crea desde acá: era un long-press de 600ms sin cancelar
            en onTouchMove, así que scrollear la lista tocando el nombre de un
            ítem lo disparaba por error. Si un ítem ya está en 'duda' (lo puede
            fijar El Muro) se sigue viendo y se destilda tocando el check. */}
        <div
          style={{ flex: 1, minWidth: 0, cursor: 'pointer', userSelect: 'none' }}
          onClick={handleNameClick}
        >
          {compacta && !expanded ? (
            // Compacta colapsada: tilde + nombre + cantidad, lado a lado, una
            // sola línea. Todo lo demás (badges, chips, botones) aparece al
            // tocar la fila — no se pierde, se esconde.
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={{ ...nameSpanStyle, display: 'block', flex: 1, minWidth: 0 }}>
                {item.titulo}
              </span>
              {item.cantidad != null && (
                <span style={{
                  flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '1px 6px',
                  borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)',
                  color: 'var(--text-3)', fontFamily: "'DM Mono', monospace",
                }}>
                  ×{item.cantidad}
                </span>
              )}
            </div>
          ) : (
            <>
              <span style={{ ...nameSpanStyle, display: 'block' }}>
                {item.titulo}
              </span>
              {depth === 0 && mostrarDetalle && esDeTurnoAnterior && (
                <span style={{
                  display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '1px 5px',
                  borderRadius: 4, marginTop: 1, background: 'rgba(245,158,11,.15)', color: '#d97706',
                }}>
                  turno ant.
                </span>
              )}
              {depth === 0 && mostrarDetalle && item.categoria === 'pase_turno' && (
                <span
                  title={item.descripcion ?? 'Pase de turno'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, padding: '1px 5px',
                    borderRadius: 4, marginTop: 1, background: 'rgba(139,92,246,.14)', color: '#8b5cf6',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 10 }}>event_upcoming</span>
                  pase de turno
                </span>
              )}
              {showSeccionChip && depth === 0 && mostrarDetalle && item.seccion && SECCION_LABELS[item.seccion] && (
                <span style={{
                  display: 'inline-block', fontSize: 9, fontWeight: 600, padding: '1px 6px',
                  borderRadius: 4, marginTop: 2, marginLeft: esDeTurnoAnterior ? 4 : 0,
                  background: 'rgba(67,97,160,.1)', color: 'var(--accent)',
                }}>
                  {SECCION_LABELS[item.seccion]}
                </span>
              )}
              {showPrioChip && depth === 0 && mostrarDetalle && (() => {
                const chip = PRIO_CHIP[item.prioridad ?? 'baja']
                if (!chip) return null
                if (!onPrioridadChange) {
                  return (
                    <span style={{
                      display: 'inline-block', fontSize: 10, fontWeight: 800, padding: '3px 8px',
                      borderRadius: 6, marginTop: 3, marginLeft: 3,
                      background: chip.bg, color: chip.color,
                    }}>
                      {chip.label}
                    </span>
                  )
                }
                return (
                  <PrioridadPicker
                    variant="chip"
                    value={(item.prioridad as TareaPrioridad) ?? 'baja'}
                    display={chip}
                    opciones={PRIO_OPCIONES}
                    onChange={(v) => onPrioridadChange(item.id, v)}
                    title="Mantené apretado para elegir la prioridad"
                  />
                )
              })()}
              {item.cantidad != null && (
                <span
                  title={`Cantidad a producir: ${item.cantidad}`}
                  style={{
                    display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 7px',
                    borderRadius: 6, marginTop: 3, marginLeft: 3,
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    color: 'var(--text-3)', fontFamily: "'DM Mono', monospace",
                  }}
                >
                  ×{item.cantidad}
                </span>
              )}
            </>
          )}
        </div>

        {/* Recipe icon */}
        {depth === 0 && item.receta_id && mostrarDetalle && (
          <button
            onClick={(e) => { e.stopPropagation(); setDrawerOpen(true) }}
            style={{ flexShrink: 0, padding: 4, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>
              menu_book
            </span>
          </button>
        )}

        {/* Crear tarea desde este componente — hoy o para el próximo turno */}
        {depth === 0 && item.receta_id && onCrearTareaDesdeItem && mostrarDetalle && (
          <button
            onClick={(e) => { e.stopPropagation(); setCrearTareaSheetOpen(true) }}
            title="Crear tarea (hoy o mañana)"
            style={{ flexShrink: 0, padding: 4, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>
              add_task
            </span>
          </button>
        )}

        {/* Expand — only top-level. En compacta se esconde: tocar el nombre
            (handleNameClick) ya expande/colapsa, y el botón solo comía ancho
            que la fila de una línea no tiene para regalar. */}
        {depth === 0 && !compacta && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
            style={{ flexShrink: 0, padding: 4, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <span className="material-symbols-outlined" style={{
              fontSize: 16, color: 'var(--text-3)',
              transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s',
            }}>
              expand_more
            </span>
          </button>
        )}
      </div>

      {/* Subtareas + add sub */}
      {expanded && depth === 0 && (
        <div style={{ padding: '0 10px 8px' }}>
          {/* Feature 1 — Stock alerts */}
          {stockAlerts.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              {stockAlerts.map((a, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                  background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)',
                  borderRadius: 8, marginBottom: 3,
                }}>
                  <span style={{ fontSize: 12, color: '#ef4444' }}>●</span>
                  <span style={{ flex: 1, fontSize: 11, color: '#991b1b', fontWeight: 600 }}>
                    {a.nombre}: {a.stock_actual} {a.unidad} (mín {a.stock_minimo})
                  </span>
                  <button
                    onClick={() => onAddSubtarea(item.id, `Reponer ${a.nombre}`)}
                    style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                      background: '#ef4444', border: 'none', color: '#fff', cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    + Producir
                  </button>
                </div>
              ))}
            </div>
          )}
          {subtareas.map((sub) => (
            <ItemOps
              key={sub.id}
              item={sub}
              subtareas={[]}
              onEstadoChange={onEstadoChange}
              onAddSubtarea={onAddSubtarea}
              depth={1}
            />
          ))}
          <div style={{ paddingLeft: 28 }}>
            <QuickAdd
              placeholder="Agregar sub-preparación..."
              onSave={(t) => onAddSubtarea(item.id, t)}
            />
          </div>
        </div>
      )}

      {drawerOpen && item.receta_id && (
        <RecetaDrawer
          recetaId={item.receta_id}
          recetaNombre={item.titulo}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {prodSheetOpen && item.receta_id && (
        <ProduccionSheetConectada
          tareaId={item.id}
          recetaId={item.receta_id}
          recetaNombre={item.titulo}
          cantidadPlanificada={item.cantidad ?? null}
          onClose={() => setProdSheetOpen(false)}
        />
      )}

      {crearTareaSheetOpen && (
        <CrearTareaSheet
          nombreComponente={item.titulo}
          cantidadSugerida={item.cantidad ?? null}
          defaultPrioridad={(item.prioridad as TareaPrioridad) || 'alta'}
          defaultDia="manana"
          onConfirm={handleCrearTareaConfirm}
          onDismiss={() => setCrearTareaSheetOpen(false)}
        />
      )}
    </div>
  )
}

// Memoizado a propósito: en OPS se renderizan 40-70 ítems a la vez y cada
// tilde produce una nueva referencia del array de tareas (optimistic de SWR).
// Sin memo, tocar UN checkbox re-renderiza los 70 ítems — es la mitad de la
// demora que se percibía al tildar en servicio. Para que el memo sirva, los
// callbacks que bajan desde la pantalla tienen que ser estables (useCallback):
// ver handleEstadoChange / handleAddSubtarea en tareas/ClientView.tsx.
export const ItemOps = memo(ItemOpsBase)
