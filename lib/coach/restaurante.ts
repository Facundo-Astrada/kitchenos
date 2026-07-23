import type { SupabaseClient } from '@supabase/supabase-js'

// restaurante_id de la sesión — nunca del body del request. Compartido entre
// app/api/coach/route.ts y app/api/coach/confirm/route.ts.
export async function getRestauranteId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase.from('user_restaurantes')
    .select('restaurante_id').eq('user_id', userId).maybeSingle()
  return (data?.restaurante_id as string | undefined) ?? null
}
