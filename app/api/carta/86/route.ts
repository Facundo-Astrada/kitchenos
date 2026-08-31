import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRestauranteId } from '@/lib/api/tenant'

// POST /api/carta/86
// Body: { carta_item_id: string, disponible: boolean }
// Called from KDS when a cook marks an item as 86'd (out), or from salon to restore
export async function POST(req: NextRequest) {
  try {
    const tenant = await requireRestauranteId()
    if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
    const { restauranteId } = tenant

    const { carta_item_id, disponible } = await req.json()
    if (!carta_item_id) return NextResponse.json({ error: 'carta_item_id requerido' }, { status: 400 })

    const supabase = createAdminClient()

    // Verificar que el ítem pertenece al tenant
    const { data: item } = await supabase
      .from('carta_items')
      .select('id')
      .eq('id', carta_item_id)
      .eq('restaurante_id', restauranteId)
      .maybeSingle()
    if (!item) return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 })

    const { error } = await supabase
      .from('carta_items')
      .update({ disponible: disponible ?? false })
      .eq('id', carta_item_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, carta_item_id, disponible: disponible ?? false })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
