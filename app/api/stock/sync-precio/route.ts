import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRestauranteId } from '@/lib/api/tenant'

// Propaga el precio de un producto a todos los ingredientes vinculados (producto_id = id)
export async function PATCH(req: NextRequest) {
  try {
    const tenant = await requireRestauranteId()
    if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
    const { restauranteId } = tenant

    const { producto_id, precio } = await req.json()
    if (!producto_id || precio == null) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

    const admin = createAdminClient()

    // Verificar que el producto pertenece al tenant
    const { data: prod } = await admin
      .from('productos')
      .select('id')
      .eq('id', producto_id)
      .eq('restaurante_id', restauranteId)
      .maybeSingle()
    if (!prod) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

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
