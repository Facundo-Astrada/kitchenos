'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useCarta, type PlatoRecetaEnriquecido } from '@/lib/hooks/useCarta'
import { useChecklist } from '@/lib/hooks/useChecklist'
import { usePlazasCustom } from '@/lib/hooks/usePlazasCustom'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { createClient } from '@/lib/supabase/client'
import { recomputePlatoRecetaMise } from '@/lib/ops/mise'
import { todasLasPlazas, plazaLabel, plazaIcon, plazaColor } from '@/lib/constants'
import { EmptyState } from '@/components/ui'
import CartaBoardCard from './CartaBoardCard'

// Board "Carta" de Mesa de Trabajo — cada plato es una columna, cada
// componente (plato_recetas) una tarjeta con su plaza actual. Arrastrar una
// tarjeta sobre un chip de plaza la reasigna: actualiza plato_recetas.plaza
// y recalcula el mise en origen (puede vaciarse) y destino (suma), vía
// recomputePlatoRecetaMise (lib/ops/mise.ts) — no crea tablas ni columnas
// nuevas, todo el dato ya existía.
export default function CartaBoard() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])
  const { items, loading: loadingCarta, actualizarPlatoRecetaPlaza } = useCarta()
  const { items: checklistItems, loading: loadingChecklist, refetchConfig } = useChecklist()
  const { plazasCustom } = usePlazasCustom()

  const [search, setSearch] = useState('')
  const [draggingPr, setDraggingPr] = useState<PlatoRecetaEnriquecido | null>(null)
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null)
  const [overPlaza, setOverPlaza] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const dropZonesRef = useRef<Map<string, HTMLElement>>(new Map())

  const registerPlazaZone = useCallback((key: string, el: HTMLElement | null) => {
    if (el) dropZonesRef.current.set(key, el)
    else dropZonesRef.current.delete(key)
  }, [])

  const platos = useMemo(() => items.filter(i => i.plato_recetas.length > 0), [items])

  const q = search.trim().toLowerCase()
  const platosVisibles = useMemo(
    () => (q ? platos.filter(p => p.nombre.toLowerCase().includes(q)) : platos),
    [platos, q]
  )

  const onDragStart = useCallback((pr: PlatoRecetaEnriquecido) => {
    setDraggingPr(pr)
  }, [])

  const onDragMove = useCallback((x: number, y: number) => {
    setGhostPos({ x, y })
    let found: string | null = null
    for (const [key, el] of dropZonesRef.current.entries()) {
      const rect = el.getBoundingClientRect()
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) { found = key; break }
    }
    setOverPlaza(found)
  }, [])

  const onDragEnd = useCallback(async () => {
    const pr = draggingPr
    const destino = overPlaza
    setDraggingPr(null); setGhostPos(null); setOverPlaza(null)
    if (!pr || !destino || !pr.receta_id || pr.plaza === destino || moving) return
    setMoving(true)
    try {
      const origen = pr.plaza ?? null
      const seccionActual = checklistItems.find(ci => ci.receta_id === pr.receta_id && ci.plaza === origen)?.seccion
      const nombreSeccion = seccionActual || 'General'
      const recetaNombre = pr.receta?.nombre ?? 'Preparación'

      await actualizarPlatoRecetaPlaza(pr.id, destino)

      if (origen) {
        await recomputePlatoRecetaMise({
          supabase, restauranteId: RESTAURANTE_ID, recetaId: pr.receta_id,
          recetaNombre, plaza: origen, seccionNombre: nombreSeccion,
        })
      }
      await recomputePlatoRecetaMise({
        supabase, restauranteId: RESTAURANTE_ID, recetaId: pr.receta_id,
        recetaNombre, plaza: destino, seccionNombre: nombreSeccion,
      })

      await refetchConfig()
    } catch (e) {
      console.error('[CartaBoard] error moviendo componente', e)
    } finally {
      setMoving(false)
    }
  }, [draggingPr, overPlaza, moving, checklistItems, actualizarPlatoRecetaPlaza, supabase, RESTAURANTE_ID, refetchConfig])

  const plazas = useMemo(() => todasLasPlazas(plazasCustom), [plazasCustom])
  const loading = loadingCarta || loadingChecklist

  if (loading) {
    return <p style={{ color: 'var(--text-3)', fontSize: 14, padding: 24 }}>Cargando carta…</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Buscador */}
      <div style={{ padding: '0 4px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', maxWidth: 360 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>search</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar plato…"
            style={{ border: 'none', outline: 'none', background: 'none', flex: 1, fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
            </button>
          )}
        </div>
        {q && (
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '6px 2px 0' }}>
            {platosVisibles.length} resultado{platosVisibles.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {platos.length === 0 ? (
        <div style={{ padding: '0 4px 14px', flexShrink: 0 }}>
          <EmptyState
            icon="receipt_long"
            title="Sin platos con composición todavía"
            subtitle="Vinculá recetas a tus platos desde Carta para verlos acá y repartir su producción entre plazas arrastrando."
          />
        </div>
      ) : (
        <>
          {/* Barra de plazas — zona de drop */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 4px 14px', flexShrink: 0 }}>
            {plazas.map(p => {
              const color = plazaColor(p, plazasCustom)
              const isOver = overPlaza === p
              return (
                <div
                  key={p}
                  ref={el => registerPlazaZone(p, el)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999,
                    border: `1.5px solid ${isOver ? color : 'var(--border)'}`,
                    background: isOver ? `${color}22` : 'var(--surface)',
                    transition: 'all .1s',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color }}>{plazaIcon(p, plazasCustom)}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{plazaLabel(p, plazasCustom)}</span>
                </div>
              )
            })}
          </div>

          {/* Board horizontal de platos */}
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', flex: 1, minHeight: 0, padding: '0 4px 12px' }}>
            {platosVisibles.map(plato => (
              <div
                key={plato.id}
                style={{
                  minWidth: 220, maxWidth: 240, flexShrink: 0, display: 'flex', flexDirection: 'column',
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, maxHeight: '100%',
                }}
              >
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: plato.disponible ? 'var(--accent)' : 'var(--text-3)' }}>restaurant_menu</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {plato.nombre}
                  </span>
                </div>
                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
                  {plato.plato_recetas.map(pr => (
                    <CartaBoardCard
                      key={pr.id}
                      pr={pr}
                      plazasCustom={plazasCustom}
                      isDragging={draggingPr?.id === pr.id}
                      disabled={moving}
                      onDragStart={onDragStart}
                      onDragMove={onDragMove}
                      onDragEnd={onDragEnd}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Ghost drag */}
      {draggingPr && ghostPos && (
        <div style={{
          position: 'fixed', left: ghostPos.x + 12, top: ghostPos.y - 16, zIndex: 999, pointerEvents: 'none',
          background: 'var(--surface)', border: '2px solid var(--accent)', borderRadius: 10, padding: '6px 12px',
          fontSize: 13, fontWeight: 600, color: 'var(--text-1)', boxShadow: '0 8px 24px rgba(0,0,0,.18)',
          maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 6 }}>drag_indicator</span>
          {draggingPr.receta?.nombre ?? 'Preparación'}
          {overPlaza && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 8 }}>↓ mover acá</span>}
        </div>
      )}

      {moving && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'var(--navy)',
          color: '#fff', padding: '8px 16px', borderRadius: 999, fontSize: 12, fontWeight: 600, zIndex: 999,
        }}>
          Actualizando mise…
        </div>
      )}
    </div>
  )
}
