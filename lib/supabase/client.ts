import { createBrowserClient } from '@supabase/ssr'
import { envSupabase } from './env'

export function createClient() {
  return createBrowserClient(
    envSupabase('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    envSupabase('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  )
}
