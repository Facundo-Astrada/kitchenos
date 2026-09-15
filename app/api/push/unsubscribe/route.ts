import { NextRequest, NextResponse } from 'next/server'
import { requireRestauranteId } from '@/lib/api/tenant'

// POST /api/push/unsubscribe
// Body: { endpoint }
export async function POST(req: NextRequest) {
  try {
    const tenant = await requireRestauranteId()
    if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
    const { supabase, user } = tenant

    const { endpoint } = await req.json()
    if (!endpoint) return NextResponse.json({ error: 'endpoint es requerido' }, { status: 400 })

    const { error } = await supabase
      .from('push_subscripciones')
      .delete()
      .eq('endpoint', endpoint)
      .eq('usuario_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
