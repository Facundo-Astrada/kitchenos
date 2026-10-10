import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRestauranteId } from '@/lib/api/tenant'
import { avisarEvento } from '@/lib/calendario/avisar'

// POST /api/calendario/avisar  Body: { eventoId }
// Lo llama la pantalla después de guardar un evento con "Avisar al equipo".
// Idempotente: avisarEvento() solo manda si el evento pidió aviso y todavía no
// se avisó (avisado_at). El restaurante y el autor salen de la sesión, nunca
// del body; el evento se lee con la RLS del autor (un privado ajeno no existe).
export async function POST(req: NextRequest) {
  const tenant = await requireRestauranteId()
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })

  const { eventoId } = await req.json().catch(() => ({}))
  if (!eventoId || typeof eventoId !== 'string') {
    return NextResponse.json({ error: 'eventoId requerido' }, { status: 400 })
  }

  const res = await avisarEvento(tenant.supabase, createAdminClient(), tenant.restauranteId, tenant.user.id, eventoId)
  return NextResponse.json(res)
}
