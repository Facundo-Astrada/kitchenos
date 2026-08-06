import type { SupabaseClient } from '@supabase/supabase-js'

// ── Constantes OPS / mise (fuente única) ────────────────────
// Plazas de producción y secciones del mise. Antes vivían en
// ComposicionEditor; se centralizan acá para reusarlas desde el
// recetario (botón OPS) y el helper de upsert sin import circular.
export const PLAZAS_OPS = [
  { id: 'general',    label: 'General',     color: '#6b7280' },
  { id: 'parrilla',   label: 'Parrilla',    color: '#ef4444' },
  { id: 'frios',      label: 'Fríos',       color: '#0ea5e9' },
  { id: 'calientes',  label: 'Calientes',   color: '#f97316' },
  { id: 'pase',       label: 'Pase',        color: '#8b5cf6' },
  { id: 'pasteleria', label: 'Pastelería',  color: '#ec4899' },
  { id: 'panaderia',  label: 'Panadería',   color: '#84cc16' },
]

export const SECCIONES_OPS = [
  { id: 'heladera',   label: 'Heladera',        icono: 'kitchen' },
  { id: 'secos',      label: 'Secos / Tuppers', icono: 'inventory_2' },
  { id: 'congelados', label: 'Congelados',      icono: 'severe_cold' },
  { id: 'estacion',   label: 'Estación',        icono: 'countertops' },
]

// ── Stock objetivo y déficit de un ítem del mise ────────────────────────
// La misma fórmula se estaba escribiendo en tres lugares de ProductoMiseCard
// (el déficit que pinta el botón, el auto-tilde del campo "hay ahora" y el
// tilde manual). Una sola definición: si divergen, la pantalla dice "falta
// producir 2" y al tildar guarda otra cosa.

interface ItemStockInfo {
  cantidad: number
  recipiente_nombre?: string | null
  recipiente_capacidad?: number | null
  demanda_viva?: number | null
}

export function tieneRecipienteMise(item: ItemStockInfo): boolean {
  return !!(item.recipiente_nombre && item.recipiente_capacidad != null)
}

/**
 * Cuánto tiene que HABER para que no falte producir nada.
 * Con recipiente: lo que entra en el recipiente más lo ya pedido desde el salón
 * (`demanda_viva`), para que después de servir esa demanda el recipiente siga
 * completo. Sin recipiente: la cantidad del mise.
 */
export function targetStockMise(item: ItemStockInfo): number {
  if (tieneRecipienteMise(item)) return (item.recipiente_capacidad ?? 0) + (item.demanda_viva ?? 0)
  return item.cantidad
}

/**
 * Cuánto falta producir. `null` = no aplica: sin recipiente no hay noción de
 * déficit (no hay contra qué comparar), y sin stock contado tampoco — por eso
 * un ítem que nadie contó no muestra botón de producir.
 */
export function deficitMise(item: ItemStockInfo, stock: number | null): number | null {
  if (!tieneRecipienteMise(item) || stock === null) return null
  return Math.max(0, targetStockMise(item) - stock)
}

// ── "Cuántos recipientes iguales" sin columna nueva (DDL de Supabase caído,
// ver hooks.md #13) — se codifica como sufijo " ×N" en recipiente_nombre,
// que además es perfectamente legible como texto humano en cualquier
// pantalla que ya muestre ese campo sin parsearlo (Mise, RecetaOpsSheet).
const RECIPIENTE_CANTIDAD_RE = / ×(\d+)$/

export function encodeRecipienteNombre(nombre: string | null, cantidad: number): string | null {
  if (!nombre) return null
  const base = nombre.replace(RECIPIENTE_CANTIDAD_RE, '')
  return cantidad > 1 ? `${base} ×${cantidad}` : base
}

export function parseRecipienteNombre(raw: string | null | undefined): { nombre: string | null; cantidad: number } {
  if (!raw) return { nombre: null, cantidad: 1 }
  const m = raw.match(RECIPIENTE_CANTIDAD_RE)
  if (!m) return { nombre: raw, cantidad: 1 }
  return { nombre: raw.replace(RECIPIENTE_CANTIDAD_RE, ''), cantidad: parseInt(m[1], 10) || 1 }
}

// ── Upsert de un ítem del mise keyed por (restaurante, receta, plaza) ──
// Extraído de handleComposicionSave (carta/page.tsx). Busca o crea la
// checklist_seccion de la plaza y hace upsert del checklist_item, incluyendo
// recipiente/peso por porción. Idempotente por (restaurante_id, receta_id, plaza).
export async function upsertMiseChecklistItem(params: {
  supabase: SupabaseClient
  restauranteId: string
  recetaId: string
  nombre: string
  plaza: string
  seccionMiseId: string
  cantidad: number
  unidad: string
  recipienteNombre?: string | null
  recipienteCantidad?: number
  pesoPorcion?: number | null
  pesoPorcionUnidad?: string | null
}): Promise<void> {
  const {
    supabase, restauranteId, recetaId, nombre, plaza, seccionMiseId,
    cantidad, unidad, recipienteCantidad = 1, pesoPorcion = null, pesoPorcionUnidad = null,
  } = params
  const recipienteNombre = encodeRecipienteNombre(params.recipienteNombre ?? null, recipienteCantidad)

  // seccionMiseId puede ser un id legacy de SECCIONES_OPS (4 fijas) o un UUID
  // real de checklist_secciones (Sesión 2, B2 — secciones editables por plaza).
  const secCfg = SECCIONES_OPS.find(s => s.id === seccionMiseId)
  let seccionId: string | null
  let secNombre: string
  if (secCfg) {
    // Legacy: buscar/crear por label (comportamiento histórico, compat)
    secNombre = secCfg.label
    const secIcono = secCfg.icono
    const secOrden = SECCIONES_OPS.findIndex(s => s.id === seccionMiseId)
    const { data: secExistente } = await supabase.from('checklist_secciones').select('id')
      .eq('restaurante_id', restauranteId).eq('plaza', plaza).ilike('nombre', secNombre).limit(1)
    seccionId = secExistente?.[0]?.id ?? null
    if (!seccionId) {
      const { data: newSec } = await supabase.from('checklist_secciones')
        .insert({ nombre: secNombre, icono: secIcono, plaza, orden: secOrden, restaurante_id: restauranteId })
        .select('id').single()
      seccionId = newSec?.id ?? null
    }
  } else {
    // UUID real de checklist_secciones — usarlo directo, sin buscar/crear
    seccionId = seccionMiseId
    const { data: secRow } = await supabase.from('checklist_secciones').select('nombre').eq('id', seccionMiseId).single()
    secNombre = secRow?.nombre ?? seccionMiseId
  }

  const recipCapacidad = recipienteNombre ? cantidad : null

  // Upsert del checklist_item keyed por (restaurante, receta, plaza)
  const { data: existente } = await supabase.from('checklist_items').select('id')
    .eq('restaurante_id', restauranteId).eq('receta_id', recetaId).eq('plaza', plaza).limit(1)

  const payload = {
    cantidad, unidad, seccion_id: seccionId, seccion: secNombre,
    recipiente_nombre: recipienteNombre, recipiente_capacidad: recipCapacidad,
    peso_porcion: pesoPorcion, peso_porcion_unidad: pesoPorcionUnidad,
  }

  if (existente?.[0]) {
    await supabase.from('checklist_items').update(payload).eq('id', existente[0].id)
  } else {
    await supabase.from('checklist_items').insert({
      nombre, plaza, receta_id: recetaId, prioridad: 'sp', orden: 0,
      restaurante_id: restauranteId, ...payload,
    })
  }
}

// ── Suma de contribuciones de una receta en una plaza (plato_recetas) ──
// Varios platos pueden compartir la misma receta/preparación — el mise no
// guarda "por plato", guarda UN checklist_item por (receta, plaza) con la
// suma de todo lo que aporta esa plaza. Usado por el board "Carta".
export async function sumPlatoRecetaCantidad(
  supabase: SupabaseClient, recetaId: string, plaza: string
): Promise<{ total: number; unidad: string }> {
  const { data } = await supabase.from('plato_recetas')
    .select('cantidad_ops, unidad_ops')
    .eq('receta_id', recetaId).eq('plaza', plaza).not('cantidad_ops', 'is', null)
  const rows = (data ?? []) as { cantidad_ops: number | null; unidad_ops: string | null }[]
  const total = rows.reduce((s, r) => s + (r.cantidad_ops ?? 0), 0)
  return { total, unidad: rows[0]?.unidad_ops ?? 'u' }
}

// ── Achicar o borrar el checklist_item de una plaza que un componente dejó ──
// Usado por el board "Carta" al mover un componente a OTRA plaza: la plaza de
// origen puede seguir teniendo otros aportantes (recalcula cantidad) o quedar
// en 0 (se borra el ítem en vez de dejarlo "fantasma" con una cantidad vieja).
// A propósito NO toca seccion/recipiente — esos son del ítem que queda, no
// tienen por qué cambiar porque uno de sus aportantes se fue.
export async function shrinkOrPruneMise(params: {
  supabase: SupabaseClient
  restauranteId: string
  recetaId: string
  plaza: string
}): Promise<void> {
  const { supabase, restauranteId, recetaId, plaza } = params
  const { total } = await sumPlatoRecetaCantidad(supabase, recetaId, plaza)
  if (total <= 0) {
    await supabase.from('checklist_items').delete()
      .eq('restaurante_id', restauranteId).eq('receta_id', recetaId).eq('plaza', plaza)
  } else {
    await supabase.from('checklist_items').update({ cantidad: total })
      .eq('restaurante_id', restauranteId).eq('receta_id', recetaId).eq('plaza', plaza)
  }
}
