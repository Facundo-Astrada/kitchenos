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
  pesoPorcion?: number | null
  pesoPorcionUnidad?: string | null
}): Promise<void> {
  const {
    supabase, restauranteId, recetaId, nombre, plaza, seccionMiseId,
    cantidad, unidad, recipienteNombre = null, pesoPorcion = null, pesoPorcionUnidad = null,
  } = params

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

// ── Recalcular el mise de una receta en una plaza a partir de plato_recetas ──
// Usado por el board "Carta" de Mesa de Trabajo: al arrastrar un componente a
// otra plaza hay que recalcular DOS plazas (de donde salió y a donde entró),
// porque checklist_items.cantidad es la SUMA de todas las contribuciones de
// esa receta en esa plaza (misma regla que handleGuardarOPS en carta/page.tsx
// — no hay una fuente única todavía, ver PENDIENTES). Si la suma da 0 (ya no
// queda nadie aportando ahí), borra el checklist_item en vez de dejarlo en 0
// fantasma.
export async function recomputePlatoRecetaMise(params: {
  supabase: SupabaseClient
  restauranteId: string
  recetaId: string
  recetaNombre: string
  plaza: string
  seccionNombre: string
  seccionIcono?: string
}): Promise<void> {
  const { supabase, restauranteId, recetaId, recetaNombre, plaza, seccionNombre, seccionIcono = 'inventory_2' } = params

  const { data: contribuciones } = await supabase.from('plato_recetas')
    .select('cantidad_ops, unidad_ops')
    .eq('receta_id', recetaId).eq('plaza', plaza).not('cantidad_ops', 'is', null)

  const total = (contribuciones ?? []).reduce((s: number, r: { cantidad_ops: number | null }) => s + (r.cantidad_ops ?? 0), 0)

  if (total <= 0) {
    await supabase.from('checklist_items').delete()
      .eq('restaurante_id', restauranteId).eq('receta_id', recetaId).eq('plaza', plaza)
    return
  }

  const unidad = (contribuciones?.[0] as { unidad_ops: string | null } | undefined)?.unidad_ops ?? 'u'
  const nombreSeccion = seccionNombre.trim() || 'General'

  const { data: secExistente } = await supabase.from('checklist_secciones').select('id')
    .eq('restaurante_id', restauranteId).eq('plaza', plaza).is('parent_id', null).ilike('nombre', nombreSeccion).limit(1)
  let seccionId: string | null = secExistente?.[0]?.id ?? null
  if (!seccionId) {
    const { count } = await supabase.from('checklist_secciones').select('id', { count: 'exact', head: true })
      .eq('restaurante_id', restauranteId).eq('plaza', plaza).is('parent_id', null)
    const { data: newSec } = await supabase.from('checklist_secciones')
      .insert({ nombre: nombreSeccion, icono: seccionIcono, plaza, orden: count ?? 0, restaurante_id: restauranteId })
      .select('id').single()
    seccionId = newSec?.id ?? null
  }

  const { data: existente } = await supabase.from('checklist_items').select('id')
    .eq('restaurante_id', restauranteId).eq('receta_id', recetaId).eq('plaza', plaza).limit(1)

  const payload = { cantidad: total, unidad, seccion_id: seccionId, seccion: nombreSeccion }
  if (existente?.[0]) {
    await supabase.from('checklist_items').update(payload).eq('id', existente[0].id)
  } else {
    await supabase.from('checklist_items').insert({
      nombre: recetaNombre, plaza, receta_id: recetaId, prioridad: 'sp', orden: 0,
      restaurante_id: restauranteId, ...payload,
    })
  }
}
