'use client'

import { useState, useRef, useEffect } from 'react'
import { RecetaDrawer } from './RecetaDrawer'
import { ProduccionSheet } from './ProduccionSheet'
import { QuickAdd } from './QuickAdd'
import { useProduccionRegistros } from '@/lib/hooks/useProduccionRegistros'
import { useProduccionSugerida } from '@/lib/hooks/useProduccionSugerida'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { useAuth } from '@/lib/auth/context'
import { createClient } from '@/lib/supabase/client'
import type { Tarea, OpsEstado, OpsModo } from '@/types'

export function nextEstado(e: OpsEstado): OpsEstado {
  if (e === 'duda') return 'pendiente'
  const cycle: OpsEstado[] = ['pendiente', 'en_curso', 'listo']
  return cycle[(cycle.indexOf(e) + 1) % cycle.length]
}

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

interface ItemOpsProps {
  item: Tarea
  subtareas: Tarea[]
  onEstadoChange: (id: string, estado: OpsEstado) => void
  onAddSubtarea: (parentId: string, titulo: string) => Promise<void>
  depth?: number
  modo?: OpsModo
  showSeccionChip?: boolean
}

export function ItemOps({ item, subtareas, onEstadoChange, onAddSubtarea, depth = 0, modo, showSeccionChip }: ItemOpsProps) {
  const [expanded, setExpanded] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [prodSheetOpen, setProdSheetOpen] = useState(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdFired = useRef(false)

  // Stock alerts (lazy, loaded once on first expand)
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([])
  const [stockLoaded, setStockLoaded] = useState(false)

  // Sugerencia de producción (lazy, loaded once on first expand, solo carta + admin/chef)
  const [sugerencia, setSugerencia] = useState<{ ventas_prom: number; sugerido: number } | null>(null)

  const { registrar } = useProduccionRegistros()
  const { getSugerencia } = useProduccionSugerida()
  const { user, perfil } = useAuth()
  const RESTAURANTE_ID = useRestauranteId()

  // Lazy load on first expand (solo top-level con receta_id)
  useEffect(() => {
    if (!expanded || depth !== 0 || stockLoaded) return
    setStockLoaded(true)

    const sb = createClient()
    const cantidadActual = item.cantidad ?? 0

    const fetches: Promise<void>[] = []

    // Feature 1 — stock alerts
    if (item.receta_id && RESTAURANTE_ID) {
      fetches.push(
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
      )
    }

    // Feature 2 — sugerencia por ventas (solo carta, admin/chef)
    const modoActual = modo ?? (typeof window !== 'undefined' ? (localStorage.getItem('ops_modo') as OpsModo) ?? 'carta' : 'carta')
    if (item.receta_id && modoActual === 'carta') {
      fetches.push(
        getSugerencia(cantidadActual).then(s => {
          if (s) setSugerencia({ ventas_prom: s.ventas_prom, sugerido: s.sugerido })
        })
      )
    }

    Promise.all(fetches)
  }, [expanded, depth, stockLoaded, item.receta_id, item.cantidad, RESTAURANTE_ID, modo, getSugerencia])

  const estado: OpsEstado = (item.estado as OpsEstado) ?? 'pendiente'
  const st = ESTADO_STYLE[estado]
  const isDuda = estado === 'duda'
  const isListo = estado === 'listo'

  function startHold() {
    holdFired.current = false
    holdTimer.current = setTimeout(() => {
      holdFired.current = true
      onEstadoChange(item.id, 'duda')
    }, 600)
  }
  function clearHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current)
  }
  function handleNameClick() {
    if (holdFired.current) { holdFired.current = false; return }
    if (depth === 0) setExpanded((v) => !v)
  }
  function handleTouchEnd(e: React.TouchEvent) {
    clearHold()
    if (holdFired.current) { e.preventDefault(); holdFired.current = false }
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

  async function handleProduccionConfirm(multiplicadorReal: number) {
    if (!item.receta_id) return
    await registrar({
      receta_id: item.receta_id,
      tarea_id: item.id,
      fecha: new Date().toISOString().split('T')[0],
      cantidad_planificada: item.cantidad ?? null,
      multiplicador_real: multiplicadorReal,
      usuario_id: user?.id ?? null,
      usuario_nombre: perfil ? `${perfil.nombre} ${perfil.apellido}`.trim() : null,
    })
    setProdSheetOpen(false)
  }

  function handleProduccionDismiss() {
    // Omitir → no registrar nada (el registro es informativo, el estado ya cambió)
    setProdSheetOpen(false)
  }

  return (
    <div style={{
      marginLeft: depth * 16,
      background: isDuda ? 'rgba(245,158,11,.07)' : 'transparent',
      borderLeft: isDuda ? '3px solid #f59e0b' : depth > 0 ? '2px solid var(--border)' : 'none',
      borderRadius: depth > 0 ? 8 : 10,
      marginBottom: 3,
      paddingLeft: depth > 0 ? 2 : 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: depth > 0 ? '6px 10px' : '8px 10px' }}>

        {/* Checkbox — cycles estado */}
        <button
          onClick={handleCheckboxClick}
          style={{
            flexShrink: 0, width: depth > 0 ? 20 : 24, height: depth > 0 ? 20 : 24,
            borderRadius: '50%', background: st.bg, border: `2px solid ${st.border}`,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all .15s', padding: 0,
          }}
        >
          {st.icon && (
            <span className="material-symbols-outlined" style={{ fontSize: depth > 0 ? 12 : 14, color: '#fff' }}>
              {st.icon}
            </span>
          )}
        </button>

        {/* Name — long press → duda */}
        <div
          style={{ flex: 1, minWidth: 0, cursor: 'pointer', userSelect: 'none' }}
          onClick={handleNameClick}
          onMouseDown={startHold}
          onMouseUp={clearHold}
          onMouseLeave={clearHold}
          onTouchStart={startHold}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={clearHold}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span style={{
            fontSize: depth > 0 ? 12 : 13,
            fontWeight: depth > 0 ? 500 : 600,
            color: isListo ? 'var(--text-3)' : 'var(--text-1)',
            textDecoration: isListo ? 'line-through' : 'none',
            display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.titulo}
          </span>
          {depth === 0 && item.turno_fecha && item.turno_fecha < new Date().toISOString().split('T')[0] && (
            <span style={{
              display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '1px 5px',
              borderRadius: 4, marginTop: 1, background: 'rgba(245,158,11,.15)', color: '#d97706',
            }}>
              turno ant.
            </span>
          )}
          {showSeccionChip && depth === 0 && item.seccion && SECCION_LABELS[item.seccion] && (
            <span style={{
              display: 'inline-block', fontSize: 9, fontWeight: 600, padding: '1px 6px',
              borderRadius: 4, marginTop: 2, marginLeft: item.turno_fecha && item.turno_fecha < new Date().toISOString().split('T')[0] ? 4 : 0,
              background: 'rgba(67,97,160,.1)', color: 'var(--accent)',
            }}>
              {SECCION_LABELS[item.seccion]}
            </span>
          )}
          {item.cantidad != null && (
            <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>
              {item.cantidad} ×
            </span>
          )}
          {sugerencia && depth === 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-3)', display: 'block', marginTop: 1 }}>
              Prom: {sugerencia.ventas_prom} pax · Sugerido: {sugerencia.sugerido}
            </span>
          )}
        </div>

        {/* Recipe icon */}
        {depth === 0 && item.receta_id && (
          <button
            onClick={(e) => { e.stopPropagation(); setDrawerOpen(true) }}
            style={{ flexShrink: 0, padding: 4, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>
              menu_book
            </span>
          </button>
        )}

        {/* Expand — only top-level */}
        {depth === 0 && (
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
        <ProduccionSheet
          recetaNombre={item.titulo}
          cantidadPlanificada={item.cantidad ?? null}
          recetaId={item.receta_id}
          onConfirm={handleProduccionConfirm}
          onDismiss={handleProduccionDismiss}
        />
      )}
    </div>
  )
}
