import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRestauranteId } from '@/lib/api/tenant'
import { enviarPush } from '@/lib/push/enviar'

// POST /api/notificaciones/push
// Body: { usuarioId, tipo, titulo, cuerpo?, link? }
// Llamado desde crearNotificacion() (lib/notificaciones/crear.ts) — fire-and-forget,
// nunca el punto de entrada directo. restauranteId sale siempre de la sesión,
// nunca del body (mismo criterio que /api/coach).
export async function POST(req: NextRequest) {
  try {
    const tenant = await requireRestauranteId()
    if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })

    const { usuarioId, tipo, titulo, cuerpo, link } = await req.json()
    if (!usuarioId || !tipo || !titulo) {
      return NextResponse.json({ error: 'usuarioId, tipo y titulo son requeridos' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { enviados } = await enviarPush(admin, tenant.restauranteId, usuarioId, {
      tipo, titulo, cuerpo: cuerpo ?? null, link: link ?? null,
    })

    return NextResponse.json({ ok: true, enviados })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
