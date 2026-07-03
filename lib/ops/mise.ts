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

  const secCfg = SECCIONES_OPS.find(s => s.id === seccionMiseId)
  const secNombre = secCfg?.label ?? seccionMiseId
  const secIcono = secCfg?.icono ?? 'inventory_2'
  const secOrden = SECCIONES_OPS.findIndex(s => s.id === seccionMiseId)

  // Buscar o crear la sección del checklist para esta plaza
  const { data: secExistente } = await supabase.from('checklist_secciones').select('id')
    .eq('restaurante_id', restauranteId).eq('plaza', plaza).ilike('nombre', secNombre).limit(1)
  let seccionId: string | null = secExistente?.[0]?.id ?? null
  if (!seccionId) {
    const { data: newSec } = await supabase.from('checklist_secciones')
      .insert({ nombre: secNombre, icono: secIcono, plaza, orden: secOrden, restaurante_id: restauranteId })
      .select('id').single()
    seccionId = newSec?.id ?? null
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
