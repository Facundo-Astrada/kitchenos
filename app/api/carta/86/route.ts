import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/carta/86
// Body: { carta_item_id: string, disponible: boolean }
// Called from KDS when a cook marks an item as 86'd (out), or from salon to restore
export async function POST(req: NextRequest) {
  try {
    const { carta_item_id, disponible } = await req.json()
    if (!carta_item_id) return NextResponse.json({ error: 'carta_item_id requerido' }, { status: 400 })

    const supabase = createAdminClient()
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
