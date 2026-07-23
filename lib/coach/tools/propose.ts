import type { SupabaseClient } from '@supabase/supabase-js'
import { COACH_TOOL_REGISTRY, COACH_MUTATING_TOOLS } from './registry'
import { puedeEjecutarTool, type PermisosServer } from '@/lib/permisos/server'
import type { PendingAction } from '@/lib/coach/types'

// Antes de proponer, expira (perezosamente, sin cron) cualquier draft pendiente
// de >24h del restaurante — housekeeping mínimo sin infraestructura nueva.
async function expirarDraftsVencidos(supabase: SupabaseClient, restauranteId: string) {
  await supabase.from('coach_acciones')
    .update({ estado: 'expirada' })
    .eq('restaurante_id', restauranteId)
    .eq('estado', 'pendiente')
    .lt('expira_en', new Date().toISOString())
}

export async function proposeAction(
  supabase: SupabaseClient,
  restauranteId: string,
  userId: string,
  screen: string | undefined,
  toolName: string,
  rawInput: Record<string, unknown>,
  permisos: PermisosServer,
): Promise<{ toolResultText: string; pendingAction: PendingAction | null }> {
  const entry = COACH_TOOL_REGISTRY[toolName]
  if (!entry) {
    return { toolResultText: `Error: herramienta desconocida "${toolName}".`, pendingAction: null }
  }
  if (!puedeEjecutarTool(permisos, toolName)) {
    return { toolResultText: 'Error: no tenés permiso para esta acción en KitchenOS. No se propuso nada.', pendingAction: null }
  }

  await expirarDraftsVencidos(supabase, restauranteId)

  // Validación laxa acá: el objetivo es armar la tarjeta aunque el modelo haya mandado
  // datos incompletos — el usuario los corrige antes de confirmar. La validación ESTRICTA
  // (schema.parse) ocurre recién en /api/coach/confirm, justo antes de escribir.
  const { data: draft, error } = await supabase.from('coach_acciones').insert({
    restaurante_id: restauranteId,
    tool_name: toolName,
    screen: screen ?? null,
    input_propuesto: rawInput,
    creado_por: userId,
  }).select('id').single()

  if (error || !draft) {
    return { toolResultText: `Error al preparar la acción: ${error?.message ?? 'desconocido'}`, pendingAction: null }
  }

  const warnings = entry.warnings ? await entry.warnings(rawInput, { supabase, restauranteId }) : []
  const campos = entry.campos(rawInput).map(c => ({ ...c, valor: rawInput[c.key] }))

  const pendingAction: PendingAction = {
    draft_id: draft.id as string,
    tool_name: toolName,
    titulo: entry.tituloHumano,
    resumen: entry.resumen(rawInput),
    campos,
    warnings,
  }

  return {
    toolResultText: 'Acción propuesta y pendiente de confirmación del usuario (todavía NO se ejecutó). '
      + 'El usuario va a ver una tarjeta editable en el chat para revisarla y confirmar o cancelar. '
      + 'No repitas la propuesta ni digas que ya se hizo. Cerrá con una frase breve invitando a revisar la tarjeta.',
    pendingAction,
  }
}

export { COACH_MUTATING_TOOLS }
