import type { SupabaseClient } from '@supabase/supabase-js'
import type { PrepInput } from '@/lib/hooks/useMenus'
import { resolverSeccionMise, encodeRecipienteNombre, TAREA_PRIO_TO_MISE } from './mise'
import { hoyOperativo, sumarDias } from './turnos'

// ════════════════════════════════════════════════════════════
// MENÚ ↔ MISE — activa las preparaciones de un menú/evento como
// checklist_items propios (keyed por menu_id, NO por receta_id), para que
// aparezcan en la apertura/cierre del mise con su prioridad SP/P/REF/OK
// mientras el menú esté vigente (menus.vigencia_desde/hasta).
// Ver PLAN-MENUS-MISE-2026-08.md — D3, D4, D5.
// ════════════════════════════════════════════════════════════

export interface SincronizarMiseResultado {
  creados: number
  sinOps: number
}

/**
 * Upsert idempotente de checklist_items para un menú, keyed por
 * (restaurante_id, menu_id, plaza, nombre). Prune: borra los que ya no
 * están entre las preparaciones candidatas (plaza+seccion_mise cargados).
 * Correr de nuevo tras editar el menú para mantener el mise sincronizado.
 */
export async function sincronizarMiseDeMenu(params: {
  supabase: SupabaseClient
  restauranteId: string
  // Acepta tanto un MenuConPreparaciones (MenuPreparacion[] es superset
  // estructural de PrepInput[]) como el `preps: PrepInput[]` recién armado
  // al guardar el editor — no hace falta adaptar nada en los callers.
  menu: { id: string; preparaciones: PrepInput[] }
}): Promise<SincronizarMiseResultado> {
  const { supabase, restauranteId, menu } = params
  const candidatas = menu.preparaciones.filter(p => p.plaza && p.seccion_mise)
  const sinOps = menu.preparaciones.length - candidatas.length

  const { data: existentesData } = await supabase.from('checklist_items')
    .select('id, nombre, plaza')
    .eq('restaurante_id', restauranteId).eq('menu_id', menu.id)
  const existentes = (existentesData ?? []) as { id: string; nombre: string; plaza: string }[]
  const existenteIdPorClave = new Map(existentes.map(e => [`${e.plaza}::${e.nombre}`, e.id]))
  const claveVivas = new Set<string>()

  for (const p of candidatas) {
    const clave = `${p.plaza}::${p.nombre}`
    claveVivas.add(clave)
    const { seccionId, secNombre } = await resolverSeccionMise(supabase, restauranteId, p.plaza!, p.seccion_mise!)
    // menu_preparaciones no tiene recipiente_cantidad (solo la rama plato) —
    // se asume 1 recipiente; si hiciera falta más, se codifica con el mismo
    // sufijo " ×N" que ya usa encodeRecipienteNombre/parseRecipienteNombre.
    const recipienteNombre = encodeRecipienteNombre(p.recipiente_nombre ?? null, 1)
    const cantidad = p.cantidad_ops ?? p.cantidad ?? 1
    const recipCapacidad = recipienteNombre ? cantidad : null
    const payload = {
      cantidad, unidad: p.unidad_ops ?? 'u', seccion_id: seccionId, seccion: secNombre,
      prioridad: TAREA_PRIO_TO_MISE[p.prioridad] ?? 'ref',
      recipiente_nombre: recipienteNombre, recipiente_capacidad: recipCapacidad,
      peso_porcion: p.peso_porcion ?? null, peso_porcion_unidad: p.peso_porcion_unidad ?? null,
      receta_id: p.tipo === 'receta' ? p.ref_id : null,
    }
    const existenteId = existenteIdPorClave.get(clave)
    if (existenteId) {
      await supabase.from('checklist_items').update(payload).eq('id', existenteId)
    } else {
      await supabase.from('checklist_items').insert({
        nombre: p.nombre, plaza: p.plaza, menu_id: menu.id, orden: 0,
        restaurante_id: restauranteId, ...payload,
      })
    }
  }

  const idsABorrar = existentes.filter(e => !claveVivas.has(`${e.plaza}::${e.nombre}`)).map(e => e.id)
  if (idsABorrar.length > 0) {
    await supabase.from('checklist_items').delete().in('id', idsABorrar)
  }

  return { creados: candidatas.length, sinOps }
}

/**
 * Saca un menú del mise SIN borrar sus checklist_items — pone
 * vigencia_hasta = ayer, así deja de ser visible en la apertura/cierre pero
 * los checklist_registros ya generados (historial) no se pierden. Borrar
 * de verdad las filas solo pasa al eliminar el menú entero (FK CASCADE).
 */
export async function desactivarMiseDeMenu(supabase: SupabaseClient, menuId: string): Promise<void> {
  const ayer = sumarDias(hoyOperativo(), -1)
  await supabase.from('menus').update({ vigencia_hasta: ayer }).eq('id', menuId)
}
