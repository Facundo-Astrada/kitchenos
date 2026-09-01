import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { envSupabase } from './env'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    envSupabase('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    envSupabase('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — se puede ignorar si hay middleware
          }
        },
      },
    }
  )
}
