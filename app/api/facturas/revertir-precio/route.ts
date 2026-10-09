import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRestauranteId } from '@/lib/api/tenant'

// Deshace un cambio de precio registrado en precio_historial: devuelve el
// precio anterior al producto y a los ingredientes vinculados, y deja la
// reversión asentada como un movimiento más del historial (no borra nada).
export async function POST(req: NextRequest) {
  const tenant = await requireRestauranteId()
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const { restauranteId } = tenant

  const body = await req.json().catch(() => null) as { historial_id?: string } | null
  if (!body?.historial_id) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  const admin = createAdminClient()
  const { data: h } = await admin
    .from('precio_historial')
    .select('id, producto_id, precio_anterior, precio_nuevo')
    .eq('id', body.historial_id)
    .eq('restaurante_id', restauranteId)
    .maybeSingle()
  if (!h) return NextResponse.json({ error: 'Cambio no encontrado' }, { status: 404 })

  const { data: prod } = await admin
    .from('productos')
    .select('id, precio_unitario')
    .eq('id', h.producto_id)
    .eq('restaurante_id', restauranteId)
    .maybeSingle()
  if (!prod) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

  const actual = Number(prod.precio_unitario ?? 0)
  const volver = Number(h.precio_anterior ?? 0)
  if (volver <= 0) return NextResponse.json({ error: 'Ese cambio no tenía un precio anterior al que volver' }, { status: 400 })

  const { error } = await admin.from('productos').update({ precio_unitario: volver }).eq('id', prod.id).eq('restaurante_id', restauranteId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('ingredientes').update({ costo_unitario: volver }).eq('producto_id', prod.id)
  await admin.from('precio_historial').insert({
    producto_id: prod.id,
    precio_anterior: actual,
    precio_nuevo: volver,
    variacion_porcentaje: actual > 0 ? Math.round(((volver - actual) / actual) * 1000) / 10 : 0,
    factura_id: null,
    restaurante_id: restauranteId,
  })

  return NextResponse.json({ ok: true, precio: volver })
}
