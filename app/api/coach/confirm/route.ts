import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRestauranteId } from '@/lib/coach/restaurante'
import { getPermisosServer, puedeEjecutarTool } from '@/lib/permisos/server'
import { COACH_TOOL_REGISTRY } from '@/lib/coach/tools/registry'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const restauranteId = await getRestauranteId(supabase, user.id)
  if (!restauranteId) return NextResponse.json({ error: 'No pude identificar tu restaurante' }, { status: 400 })

  const body = await req.json()
  const draftId = String(body?.draft_id ?? '')
  const action = body?.action === 'cancel' ? 'cancel' : body?.action === 'confirm' ? 'confirm' : null
  const payload = (body?.payload && typeof body.payload === 'object') ? body.payload as Record<string, unknown> : {}

  if (!draftId || !action) return NextResponse.json({ error: 'Faltan draft_id o action' }, { status: 400 })

  const { data: draft } = await supabase.from('coach_acciones')
    .select('*').eq('id', draftId).eq('restaurante_id', restauranteId).maybeSingle()
  if (!draft) return NextResponse.json({ error: 'Acción no encontrada' }, { status: 404 })
  if (draft.estado !== 'pendiente') {
    return NextResponse.json({ error: `Esta acción ya está en estado "${draft.estado}"` }, { status: 409 })
  }

  if (action === 'cancel') {
    await supabase.from('coach_acciones').update({
      estado: 'cancelada', resuelto_por: user.id, resuelto_en: new Date().toISOString(),
    }).eq('id', draftId)
    return NextResponse.json({ ok: true, message: 'Acción cancelada.' })
  }

  // action === 'confirm' — re-chequeo de permiso: nunca confiar en que si llegó hasta acá ya está todo bien.
  const permisos = await getPermisosServer(supabase, user.id, restauranteId)
  if (!puedeEjecutarTool(permisos, draft.tool_name)) {
    return NextResponse.json({ error: 'No tenés permiso para confirmar esta acción' }, { status: 403 })
  }

  const entry = COACH_TOOL_REGISTRY[draft.tool_name]
  if (!entry) return NextResponse.json({ error: 'Herramienta desconocida' }, { status: 400 })

  const parsed = entry.schema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 })
  }

  const result = await entry.execute(supabase, restauranteId, parsed.data)

  await supabase.from('coach_acciones').update({
    estado: result.ok ? 'confirmada' : 'error',
    input_confirmado: parsed.data,
    resultado_texto: result.ok ? result.message : null,
    resultado_error: result.ok ? null : result.message,
    resuelto_por: user.id,
    resuelto_en: new Date().toISOString(),
  }).eq('id', draftId)

  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 500 })
  return NextResponse.json({ ok: true, message: result.message, tool_name: draft.tool_name, draft_id: draftId })
}
