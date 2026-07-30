'use client'

import { useMemo, useState } from 'react'
import { useCarta, type PlatoRecetaEnriquecido } from '@/lib/hooks/useCarta'
import { useChecklist } from '@/lib/hooks/useChecklist'
import { usePlazasCustom } from '@/lib/hooks/usePlazasCustom'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { createClient } from '@/lib/supabase/client'
import { upsertMiseChecklistItem, sumPlatoRecetaCantidad, shrinkOrPruneMise } from '@/lib/ops/mise'
import { todasLasPlazas, plazaLabel } from '@/lib/constants'
import { EmptyState, FilterChips } from '@/components/ui'
import type { FilterChip } from '@/components/ui'
import type { OpsResult } from '@/components/ops/OpsPanel'
import CartaBoardCard from './CartaBoardCard'

// Board "Carta" de Mesa de Trabajo — cada plato es una columna, cada
// componente (plato_recetas) una tarjeta con su plaza actual. El botón OPS
// de cada tarjeta abre el mismo panel que en Carta/Recetario (plaza→sección→
// recipiente→cantidad) para reasignarlo rápido — ej. mover un tupper de una
// heladera a otra — sin entrar plato por plato. Al guardar, recalcula el
// mise en la plaza de origen (puede vaciarse) y en la de destino, vía los
// helpers de lib/ops/mise.ts. Filtro primario por categoría de carta
// (entradas→bebidas), secundario por plaza.
export default function CartaBoard() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])
  const { items, loading: loadingCarta, categorias, actualizarPlatoRecetaOps, actualizarPlatoRecetaOpsCompleta, eliminarPlatoReceta } = useCarta()
  const { items: checklistItems, loading: loadingChecklist, refetchConfig } = useChecklist()
  const { plazasCustom } = usePlazasCustom()

  const [search, setSearch] = useState('')
  const [categoriaActiva, setCategoriaActiva] = useState('todas')
  const [plazaFiltro, setPlazaFiltro] = useState('todas')
  const [openOpsId, setOpenOpsId] = useState<string | null>(null)
  const [savingOpsId, setSavingOpsId] = useState<string | null>(null)

  // Entradas siempre primero, bebidas siempre al final; el resto respeta el
  // orden de categorías que ya tiene el restaurante en Carta.
  const categoriasOrdenadas = useMemo(() => {
    const sorted = [...categorias].sort((a, b) => a.orden - b.orden)
    const esEntradas = (n: string) => n.trim().toLowerCase() === 'entradas'
    const esBebidas = (n: string) => n.trim().toLowerCase() === 'bebidas'
    return [
      ...sorted.filter(c => esEntradas(c.nombre)),
      ...sorted.filter(c => !esEntradas(c.nombre) && !esBebidas(c.nombre)),
      ...sorted.filter(c => esBebidas(c.nombre)),
    ]
  }, [categorias])

  const categoriaChips: FilterChip<string>[] = useMemo(() => [
    { value: 'todas', label: 'Todas' },
    ...categoriasOrdenadas.map(c => ({ value: c.nombre, label: c.nombre })),
  ], [categoriasOrdenadas])

  const plazas = useMemo(() => todasLasPlazas(plazasCustom), [plazasCustom])

  const platos = useMemo(() => items.filter(i => i.plato_recetas.length > 0), [items])

  const q = search.trim().toLowerCase()
  const platosFiltrados = useMemo(() => platos.filter(p => {
    if (categoriaActiva !== 'todas' && p.categoria !== categoriaActiva) return false
    if (q && !p.nombre.toLowerCase().includes(q)) return false
    return true
  }), [platos, categoriaActiva, q])

  const platosVisibles = useMemo(() => {
    if (plazaFiltro === 'todas') return platosFiltrados
    return platosFiltrados.filter(p => p.plato_recetas.some(pr => pr.plaza === plazaFiltro))
  }, [platosFiltrados, plazaFiltro])

  function componentesVisibles(plato: typeof platos[number]) {
    if (plazaFiltro === 'todas') return plato.plato_recetas
    return plato.plato_recetas.filter(pr => pr.plaza === plazaFiltro)
  }

  const handleGuardarOps = async (pr: PlatoRecetaEnriquecido, result: OpsResult) => {
    setSavingOpsId(pr.id)
    try {
      const oldPlaza = pr.plaza ?? null
      const recetaNombre = pr.receta?.nombre ?? 'Preparación'

      await actualizarPlatoRecetaOpsCompleta(pr.id, {
        plaza: result.plaza, cantidad_ops: result.cantidad, unidad_ops: result.unidad,
      })

      const { total } = await sumPlatoRecetaCantidad(supabase, pr.receta_id, result.plaza)
      await upsertMiseChecklistItem({
        supabase, restauranteId: RESTAURANTE_ID, recetaId: pr.receta_id, nombre: recetaNombre,
        plaza: result.plaza, seccionMiseId: result.seccion, cantidad: total, unidad: result.unidad,
        recipienteNombre: result.recipienteNombre, pesoPorcion: result.pesoPorcion, pesoPorcionUnidad: result.pesoPorcionUnidad,
      })

      if (oldPlaza && oldPlaza !== result.plaza) {
        await shrinkOrPruneMise({ supabase, restauranteId: RESTAURANTE_ID, recetaId: pr.receta_id, plaza: oldPlaza })
      }

      await refetchConfig()
      setOpenOpsId(null)
    } catch (e) {
      console.error('[CartaBoard] error guardando OPS', e)
    } finally {
      setSavingOpsId(null)
    }
  }

  const handleQuitarOps = async (pr: PlatoRecetaEnriquecido) => {
    if (!pr.plaza) return
    setSavingOpsId(pr.id)
    try {
      const oldPlaza = pr.plaza
      await actualizarPlatoRecetaOpsCompleta(pr.id, { plaza: null, cantidad_ops: null, unidad_ops: null })
      await shrinkOrPruneMise({ supabase, restauranteId: RESTAURANTE_ID, recetaId: pr.receta_id, plaza: oldPlaza })
      await refetchConfig()
      setOpenOpsId(null)
    } catch (e) {
      console.error('[CartaBoard] error quitando OPS', e)
    } finally {
      setSavingOpsId(null)
    }
  }

  // Edición rápida del gramaje sin pasar por el panel OPS completo — si el
  // componente ya está en una plaza, recalcula la suma de esa plaza (sube o
  // baja según corresponda; shrinkOrPruneMise también borra el checklist_item
  // si el nuevo total da 0).
  const handleEditarGramaje = async (pr: PlatoRecetaEnriquecido, nuevaCantidad: number) => {
    setSavingOpsId(pr.id)
    try {
      await actualizarPlatoRecetaOps(pr.id, { cantidad_ops: nuevaCantidad, unidad_ops: pr.unidad_ops ?? 'g' })
      if (pr.plaza) {
        await shrinkOrPruneMise({ supabase, restauranteId: RESTAURANTE_ID, recetaId: pr.receta_id, plaza: pr.plaza })
        await refetchConfig()
      }
    } catch (e) {
      console.error('[CartaBoard] error editando gramaje', e)
    } finally {
      setSavingOpsId(null)
    }
  }

  // Edición rápida del "tamaño por porción" cuando el componente ya tiene un
  // recipiente configurado — a diferencia del gramaje directo, este dato vive
  // en checklist_items (compartido por receta+plaza, no por plato_recetas),
  // así que no hay suma que recalcular: es un simple update.
  const handleEditarPesoPorcion = async (pr: PlatoRecetaEnriquecido, nuevoPeso: number) => {
    if (!pr.plaza) return
    setSavingOpsId(pr.id)
    try {
      const { error } = await supabase.from('checklist_items').update({ peso_porcion: nuevoPeso })
        .eq('restaurante_id', RESTAURANTE_ID).eq('receta_id', pr.receta_id).eq('plaza', pr.plaza)
      if (error) throw error
      await refetchConfig()
    } catch (e) {
      console.error('[CartaBoard] error editando tamaño por porción', e)
    } finally {
      setSavingOpsId(null)
    }
  }

  // Elimina el componente del plato (no solo su OPS) — si ya aportaba a una
  // plaza, la recalcula (shrinkOrPruneMise) porque uno de sus aportantes se fue.
  const handleEliminarComponente = async (pr: PlatoRecetaEnriquecido) => {
    if (!confirm(`¿Eliminar "${pr.receta?.nombre ?? 'este componente'}" del plato?`)) return
    setSavingOpsId(pr.id)
    try {
      const oldPlaza = pr.plaza
      await eliminarPlatoReceta(pr.id)
      if (oldPlaza) {
        await shrinkOrPruneMise({ supabase, restauranteId: RESTAURANTE_ID, recetaId: pr.receta_id, plaza: oldPlaza })
        await refetchConfig()
      }
      if (openOpsId === pr.id) setOpenOpsId(null)
    } catch (e) {
      console.error('[CartaBoard] error eliminando componente', e)
    } finally {
      setSavingOpsId(null)
    }
  }

  const loading = loadingCarta || loadingChecklist

  if (loading) {
    return <p style={{ color: 'var(--text-3)', fontSize: 14, padding: 24 }}>Cargando carta…</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Buscador */}
      <div style={{ padding: '0 4px 10px', flexShrink: 0 }}>
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
      </div>

      {platos.length === 0 ? (
        <div style={{ padding: '0 4px 14px', flexShrink: 0 }}>
          <EmptyState
            icon="receipt_long"
            title="Sin platos con composición todavía"
            subtitle="Vinculá recetas a tus platos desde Carta para verlos acá y repartir su producción entre plazas."
          />
        </div>
      ) : (
        <>
          {/* Filtro primario: categoría de carta */}
          <FilterChips chips={categoriaChips} active={categoriaActiva} onChange={setCategoriaActiva} style={{ padding: '0 4px 8px' }} />

          {/* Filtro secundario: plaza */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px 14px', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Plaza:</span>
            <select
              value={plazaFiltro}
              onChange={e => setPlazaFiltro(e.target.value)}
              style={{ fontSize: 12, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-1)', fontFamily: 'inherit', cursor: 'pointer' }}
            >
              <option value="todas">Todas</option>
              {plazas.map(p => (
                <option key={p} value={p}>{plazaLabel(p, plazasCustom)}</option>
              ))}
            </select>
          </div>

          {/* Board horizontal de platos — el wrapper exterior fija la altura
              (flex:1/minHeight:0) para que cada columna pueda scrollear su
              propio contenido en vez de crecer sin límite y tapar todo lo de
              abajo cuando se expande un panel OPS (bug reportado: el panel
              "se acortaba" y no se veían Recipiente/Cantidad/Guardar). */}
          <div style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden', padding: '0 4px 12px' }}>
            <div style={{ display: 'flex', gap: 12, height: '100%' }}>
              {platosVisibles.map(plato => (
                <div
                  key={plato.id}
                  style={{
                    minWidth: 230, maxWidth: 250, flexShrink: 0, display: 'flex', flexDirection: 'column',
                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, height: '100%',
                  }}
                >
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: plato.disponible ? 'var(--accent)' : 'var(--text-3)' }}>restaurant_menu</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {plato.nombre}
                    </span>
                  </div>
                  <div style={{ flex: 1, minHeight: 0, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
                    {componentesVisibles(plato).map(pr => (
                      <CartaBoardCard
                        key={pr.id}
                        pr={pr}
                        checklistItem={pr.plaza ? checklistItems.find(ci => ci.receta_id === pr.receta_id && ci.plaza === pr.plaza) ?? null : null}
                        plazasCustom={plazasCustom}
                        isOpen={openOpsId === pr.id}
                        saving={savingOpsId === pr.id}
                        onToggle={() => setOpenOpsId(prev => prev === pr.id ? null : pr.id)}
                        onGuardar={handleGuardarOps}
                        onQuitar={handleQuitarOps}
                        onEditarGramaje={handleEditarGramaje}
                        onEditarPesoPorcion={handleEditarPesoPorcion}
                        onEliminar={handleEliminarComponente}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
