import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

// Cron nocturno (Q2 — carta pública/demo del roadmap de competencia): resetea
// el restaurante demo clonando fresco desde El Rescoldo real. Ver
// supabase/migrations/20260706_demo_reset_function.sql (reset_demo_restaurante()).
// Vercel llama a esta ruta con `Authorization: Bearer $CRON_SECRET` (ver vercel.json).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('reset_demo_restaurante')
    if (error) {
      const msg = error.message ?? 'error desconocido'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
    return NextResponse.json({ ok: true, result: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message) : 'desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
