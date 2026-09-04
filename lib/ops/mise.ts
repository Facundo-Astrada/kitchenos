import type { SupabaseClient } from '@supabase/supabase-js'
import type { MisePlaceItem } from '@/types'
import { PLAZAS_FIJAS, PLAZA_LABELS, PLAZA_COLORS } from '@/lib/constants'

// ── Constantes OPS / mise (fuente única) ────────────────────
// Plazas de producción y secciones del mise. Antes vivían en
// ComposicionEditor; se centralizan acá para reusarlas desde el
// recetario (botón OPS) y el helper de upsert sin import circular.
//
// PLAZAS_OPS deriva de PLAZAS_FIJAS/PLAZA_LABELS/PLAZA_COLORS
// (lib/constants.ts) en vez de mantener sus propios label/color en espejo
// (día 10 de plan-consolidado.md §2 — el comentario "mantener en espejo" ya
// había desincronizado una tercera copia en espacios/ItemEditPanel.tsx).
// 'general' va primero (encabeza el selector) y 'menu' al final — no es una
// plaza física, es la plaza de control de un menú (ver menuMise.ts), por eso
// vive fuera de PLAZAS_FIJAS y se agrega acá a mano.
const ORDEN_PLAZAS_OPS = ['general', ...PLAZAS_FIJAS.filter(p => p !== 'general'), 'menu']
export const PLAZAS_OPS = ORDEN_PLAZAS_OPS.map(id => ({
  id, label: PLAZA_LABELS[id], color: PLAZA_COLORS[id],
}))

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
  if (rows.length === 0) return { total: 0, unidad: 'u' }
  // Distintos platos pueden haber cargado esta misma receta+plaza en unidades
  // que no son sumables entre sí (un plato en "pax", otro en "g" porque alguien
  // usó este mismo campo para el gramaje directo — ver plato_recetas.gramaje).
  // Sumarlas igual da un número sin sentido (3g + 30pax = "33"). Se normaliza
  // peso/volumen a gramos (sí son sumables entre sí) y se suma solo la
  // magnitud dominante entre las filas; el resto se descarta con un aviso en
  // vez de ensuciar el total del mise.
  const esPeso = (u: string) => ['g', 'kg', 'ml', 'l'].includes(u)
  const normalizadas = rows.map(r => {
    const u = (r.unidad_ops ?? 'u').toLowerCase().trim()
    const cant = r.cantidad_ops ?? 0
    return esPeso(u) ? { cantidad: u === 'kg' || u === 'l' ? cant * 1000 : cant, unidad: 'g' } : { cantidad: cant, unidad: u }
  })
  const conteoPorUnidad = new Map<string, number>()
  for (const n of normalizadas) conteoPorUnidad.set(n.unidad, (conteoPorUnidad.get(n.unidad) ?? 0) + 1)
  const [unidadDominante] = [...conteoPorUnidad.entries()].sort((a, b) => b[1] - a[1])[0]
  const descartadas = normalizadas.length - (conteoPorUnidad.get(unidadDominante) ?? 0)
  if (descartadas > 0) {
    console.warn(`[mise] sumPlatoRecetaCantidad: ${descartadas} fila(s) con unidad incompatible con '${unidadDominante}' descartada(s) — receta ${recetaId}, plaza ${plaza}`)
  }
  const total = normalizadas.filter(n => n.unidad === unidadDominante).reduce((s, n) => s + n.cantidad, 0)
  return { total, unidad: unidadDominante }
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
