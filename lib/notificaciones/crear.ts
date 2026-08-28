import type { createClient } from '@/lib/supabase/client'

type SupabaseClient = ReturnType<typeof createClient>

/**
 * Crea una notificación in-app para otra persona del mismo restaurante.
 * Reusar desde cualquier hook que sepa "a quién avisar" (ver useEquipo.asignarTurno)
 * en vez de escribir el insert a mano — la policy RLS ya permite que cualquier
 * usuario del restaurante notifique a otro (ver la migración de notificaciones).
 *
 * Best-effort: un fallo acá nunca debe romper el flujo que la dispara (asignar
 * un turno, por ejemplo, tiene que funcionar aunque la notificación falle).
 */
export async function crearNotificacion(
  supabase: SupabaseClient,
  datos: {
    restauranteId: string
    usuarioId: string
    tipo: string
    titulo: string
    cuerpo?: string | null
    link?: string | null
  },
): Promise<void> {
  try {
    await supabase.from('notificaciones').insert({
      restaurante_id: datos.restauranteId,
      usuario_id: datos.usuarioId,
      tipo: datos.tipo,
      titulo: datos.titulo,
      cuerpo: datos.cuerpo ?? null,
      link: datos.link ?? null,
    })
  } catch (e) {
    console.error('[crearNotificacion] Error (no bloqueante):', e)
  }
}
