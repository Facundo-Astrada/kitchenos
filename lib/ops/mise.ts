import type { SupabaseClient } from '@supabase/supabase-js'
import type { MisePlaceItem } from '@/types'

// ── Constantes OPS / mise (fuente única) ────────────────────
// Plazas de producción y secciones del mise. Antes vivían en
// ComposicionEditor; se centralizan acá para reusarlas desde el
// recetario (botón OPS) y el helper de upsert sin import circular.
export const PLAZAS_OPS = [
  // Mismo azul que PLAZA_COLORS.general en lib/constants.ts — mantener en espejo.
  { id: 'general',    label: 'General',     color: '#2563eb' },
  { id: 'parrilla',   label: 'Parrilla',    color: '#ef4444' },
  { id: 'frios',      label: 'Fríos',       color: '#0ea5e9' },
  { id: 'calientes',  label: 'Calientes',   color: '#f97316' },
  { id: 'pase',       label: 'Pase',        color: '#8b5cf6' },
  { id: 'pasteleria', label: 'Pastelería',  color: '#ec4899' },
  { id: 'panaderia',  label: 'Panadería',   color: '#84cc16' },
  // Mismo ámbar que PLAZA_COLORS.menu — plaza de control de un menú
  // activado en el mise (ver menuMise.ts), NO una plaza física de cocina.
  { id: 'menu',       label: 'Menú',        color: '#f59e0b' },
]

// Escala de prioridad del mise (checklist_items.prioridad: sp/p/ref/chk) vs. la
// escala de tareas/composición (critica/alta/media/baja, ver CompPrioridad en
// ComposicionEditor y TareaPrioridad). MISE_PRIO_TO_TAREA (ProductoMiseCard.tsx)
// tiene el sentido inverso — ambos mapas deben mantenerse en espejo.
export const TAREA_PRIO_TO_MISE: Record<string, string> = {
  critica: 'sp', alta: 'p', media: 'ref', baja: 'chk',
}

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

// ── Visibilidad de un ítem de menú/evento en el mise (PLAN-MENUS-MISE) ──
// El mise fijo (menu_id null) siempre es visible. Un ítem de menú solo se
// muestra si hoy cae dentro de la vigencia del menú — sin vigencia cargada
// (o sin activar todavía) no se muestra. `hoy` es la jornada operativa
// (hoyOperativo()/turno vigente), NO new Date() crudo.
export function menuItemVisible(
  item: Pick<MisePlaceItem, 'menu_id' | 'menus'>, hoy: string
): boolean {
  if (!item.menu_id) return true
  const v = item.menus
  if (!v?.vigencia_desde || !v.vigencia_hasta) return false
  return hoy >= v.vigencia_desde && hoy <= v.vigencia_hasta
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

// Busca una checklist_seccion por nombre dentro de una plaza, o la crea si
// no existe. `orden` nuevo = cantidad de secciones raíz que ya tiene esa
// plaza (mismo criterio que OpsPanel.handleCrearSeccion).
async function resolverSeccionPorNombre(
  supabase: SupabaseClient, restauranteId: string, plaza: string, nombre: string, icono: string
): Promise<{ seccionId: string | null; secNombre: string }> {
  const { data: secExistente } = await supabase.from('checklist_secciones').select('id')
    .eq('restaurante_id', restauranteId).eq('plaza', plaza).ilike('nombre', nombre).limit(1)
  let seccionId = secExistente?.[0]?.id ?? null
  if (!seccionId) {
    const { count } = await supabase.from('checklist_secciones').select('id', { count: 'exact', head: true })
      .eq('restaurante_id', restauranteId).eq('plaza', plaza).is('parent_id', null)
    const { data: newSec } = await supabase.from('checklist_secciones')
      .insert({ nombre, icono, plaza, orden: count ?? 0, restaurante_id: restauranteId })
      .select('id').single()
    seccionId = newSec?.id ?? null
  }
  return { seccionId, secNombre: nombre }
}

// ── Resolver seccionMiseId (legacy de SECCIONES_OPS o UUID real de
// checklist_secciones) a un seccion_id + nombre concretos, buscando o
// creando la fila si hace falta. Compartido por upsertMiseChecklistItem
// (rama plato) y sincronizarMiseDeMenu (rama menú/evento) — NO duplicar.
export async function resolverSeccionMise(
  supabase: SupabaseClient, restauranteId: string, plaza: string, seccionMiseId: string
): Promise<{ seccionId: string | null; secNombre: string }> {
  const secCfg = SECCIONES_OPS.find(s => s.id === seccionMiseId)
  if (secCfg) {
    // Legacy: buscar/crear por label (comportamiento histórico, compat)
    return resolverSeccionPorNombre(supabase, restauranteId, plaza, secCfg.label, secCfg.icono)
  }
  // UUID real de checklist_secciones — usarlo directo SOLO si es de esta
  // plaza. Si no (ej. menus.plaza_control mandó el ítem a una plaza distinta
  // de la que tenía elegida al configurar OPS), resolver por nombre bajo la
  // plaza nueva — dejar el checklist_item con un seccion_id de otra plaza lo
  // vuelve invisible: el mise agrupa filtrando checklist_secciones por la
  // plaza que se está mirando, y esa sección no aparecería en esa lista.
  const { data: secRow } = await supabase.from('checklist_secciones').select('nombre, plaza').eq('id', seccionMiseId).single()
  if (!secRow) return { seccionId: seccionMiseId, secNombre: seccionMiseId }
  if (secRow.plaza === plaza) return { seccionId: seccionMiseId, secNombre: secRow.nombre }
  return resolverSeccionPorNombre(supabase, restauranteId, plaza, secRow.nombre, 'inventory_2')
}

// ── Capacidad de un recipiente → porciones ──────────────────────────────
// Convierte "cuánto entra en el recipiente" + "cuánto pesa una porción" a
// cantidad de porciones, pasando ambos a gramos. `null` si alguna de las dos
// unidades no es convertible a peso (u/pax/porc/ml/l no tienen conversión
// fija a g acá) o si el peso por porción es 0 — el caller decide el fallback
// (mostrar el valor crudo en vez de la conversión). Estaba escrito dos veces
// en DetailView (el cálculo real al guardar y el preview mientras se tipea)
// con el riesgo de que una copia se actualizara y la otra no.
export function porcionesDesdeCapacidad(
  capacidad: number, capUnidad: string, pesoPorcion: number, pesoPorcionUnidad: string
): number | null {
  const toG = (v: number, u: string) => u === 'kg' ? v * 1000 : u === 'g' ? v : null
  const capG = toG(capacidad, capUnidad)
  const porG = toG(pesoPorcion, pesoPorcionUnidad)
  return capG !== null && porG !== null && porG > 0 ? Math.round(capG / porG) : null
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
  prioridad?: string
}): Promise<void> {
  const {
    supabase, restauranteId, recetaId, nombre, plaza, seccionMiseId,
    cantidad, unidad, recipienteCantidad = 1, pesoPorcion = null, pesoPorcionUnidad = null,
    prioridad = 'sp',
  } = params
  const recipienteNombre = encodeRecipienteNombre(params.recipienteNombre ?? null, recipienteCantidad)

  const { seccionId, secNombre } = await resolverSeccionMise(supabase, restauranteId, plaza, seccionMiseId)

  const recipCapacidad = recipienteNombre ? cantidad : null

  // Upsert del checklist_item keyed por (restaurante, receta, plaza)
  const { data: existente } = await supabase.from('checklist_items').select('id')
    .eq('restaurante_id', restauranteId).eq('receta_id', recetaId).eq('plaza', plaza).limit(1)

  const payload = {
    cantidad, unidad, seccion_id: seccionId, seccion: secNombre, prioridad,
    recipiente_nombre: recipienteNombre, recipiente_capacidad: recipCapacidad,
    peso_porcion: pesoPorcion, peso_porcion_unidad: pesoPorcionUnidad,
  }

  if (existente?.[0]) {
    await supabase.from('checklist_items').update(payload).eq('id', existente[0].id)
  } else {
    await supabase.from('checklist_items').insert({
      nombre, plaza, receta_id: recetaId, orden: 0,
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
