import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'

type TenantOk = { ok: true; user: User; restauranteId: string; supabase: SupabaseClient }
type TenantErr = { ok: false; status: 401 | 403; error: string }

export async function requireRestauranteId(): Promise<TenantOk | TenantErr> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'No autorizado' }
  const { data: ur } = await supabase
    .from('user_restaurantes')
    .select('restaurante_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!ur?.restaurante_id) return { ok: false, status: 403, error: 'Sin restaurante asignado' }
  return { ok: true, user, restauranteId: ur.restaurante_id as string, supabase }
}
