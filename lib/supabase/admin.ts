import { createClient } from '@supabase/supabase-js'
import { envSupabase } from './env'

/**
 * Cliente con service_role — solo usar en Server Components, API Routes y scripts.
 * NUNCA exponer al cliente/browser.
 */
export function createAdminClient() {
  return createClient(
    envSupabase('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    envSupabase('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY),
    { auth: { persistSession: false } }
  )
}
