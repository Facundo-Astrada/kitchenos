import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// Propaga el precio de un producto a todos los ingredientes vinculados (producto_id = id)
export async function PATCH(req: NextRequest) {
  try {
    const serverSupabase = await createClient()
    const { data: { user } } = await serverSupabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { producto_id, precio } = await req.json()
    if (!producto_id || precio == null) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

    const admin = createAdminClient()
    const { error } = await admin
      .from('ingredientes')
      .update({ costo_unitario: precio })
      .eq('producto_id', producto_id)

    if (error) {
      console.error('[sync-precio] error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[sync-precio] unexpected:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error interno' }, { status: 500 })
  }
}
