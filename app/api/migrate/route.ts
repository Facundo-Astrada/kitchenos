import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'public' } }
  )

  // Try to insert and read the status column to see if it exists
  // If it doesn't exist, we need to add it manually via the dashboard
  const { data, error } = await supabase
    .from('recetas')
    .select('id, status')
    .limit(1)

  if (error && error.code === '42703') {
    // Column doesn't exist — cannot ALTER TABLE via PostgREST
    return NextResponse.json({
      success: false,
      message: 'Column "status" does not exist. Please run this SQL in the Supabase Dashboard SQL Editor:',
      sql: "ALTER TABLE recetas ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';",
    }, { status: 400 })
  }

  return NextResponse.json({
    success: true,
    message: 'Column "status" already exists',
    sample: data,
  })
}
