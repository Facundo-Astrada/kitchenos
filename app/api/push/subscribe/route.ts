import { NextRequest, NextResponse } from 'next/server'
import { requireRestauranteId } from '@/lib/api/tenant'

// POST /api/push/subscribe
// Body: { endpoint, keys: { p256dh, auth } } — el resultado de
// pushManager.subscribe() en el browser. Upsert por endpoint: resuscribirse
// en el mismo dispositivo actualiza la fila en vez de duplicarla.
export async function POST(req: NextRequest) {
  try {
    const tenant = await requireRestauranteId()
    if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
    const { restauranteId, user, supabase } = tenant

    const { endpoint, keys } = await req.json()
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'endpoint y keys son requeridos' }, { status: 400 })
    }

    const { error } = await supabase.from('push_subscripciones').upsert(
      {
        restaurante_id: restauranteId,
        usuario_id: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: req.headers.get('user-agent') ?? null,
      },
      { onConflict: 'endpoint' },
    )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
