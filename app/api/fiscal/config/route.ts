import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'

async function getRestauranteId() {
  const serverSupabase = await createServerClient()
  const { data: { user } } = await serverSupabase.auth.getUser()
  if (!user) return null
  const supabase = createAdminClient()
  const { data: ur } = await supabase
    .from('user_restaurantes')
    .select('restaurante_id')
    .eq('user_id', user.id)
    .single()
  return ur?.restaurante_id ?? null
}

/** GET /api/fiscal/config — devuelve config del restaurante (sin cert/key) */
export async function GET() {
  const rid = await getRestauranteId()
  if (!rid) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('fiscal_config')
    .select('id, cuit, razon_social, condicion_iva, punto_venta, ambiente, activo, updated_at')
    .eq('restaurante_id', rid)
    .single()

  return NextResponse.json(data ?? null)
}

/** POST /api/fiscal/config — upsert config (cert/key se envían como texto PEM) */
export async function POST(req: NextRequest) {
  const rid = await getRestauranteId()
  if (!rid) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json() as {
    cuit?:         string
    razon_social?: string
    condicion_iva?: string
    punto_venta?:  number
    cert_pem?:     string
    key_pem?:      string
    ambiente?:     string
    activo?:       boolean
  }

  const supabase = createAdminClient()
  const { data: existing } = await supabase
    .from('fiscal_config')
    .select('id')
    .eq('restaurante_id', rid)
    .single()

  const payload: Record<string, unknown> = {
    restaurante_id: rid,
    updated_at: new Date().toISOString(),
  }
  if (body.cuit         !== undefined) payload.cuit          = body.cuit
  if (body.razon_social !== undefined) payload.razon_social  = body.razon_social
  if (body.condicion_iva !== undefined) payload.condicion_iva = body.condicion_iva
  if (body.punto_venta  !== undefined) payload.punto_venta   = body.punto_venta
  if (body.cert_pem     !== undefined) payload.cert_pem      = body.cert_pem
  if (body.key_pem      !== undefined) payload.key_pem       = body.key_pem
  if (body.ambiente     !== undefined) payload.ambiente       = body.ambiente
  if (body.activo       !== undefined) payload.activo         = body.activo

  let result
  if (existing) {
    result = await supabase
      .from('fiscal_config')
      .update(payload)
      .eq('id', existing.id)
      .select('id, cuit, razon_social, condicion_iva, punto_venta, ambiente, activo')
      .single()
  } else {
    result = await supabase
      .from('fiscal_config')
      .insert(payload)
      .select('id, cuit, razon_social, condicion_iva, punto_venta, ambiente, activo')
      .single()
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 })
  }
  return NextResponse.json(result.data)
}
