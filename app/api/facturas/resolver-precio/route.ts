import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRestauranteId } from '@/lib/api/tenant'
import { normAlias } from '@/lib/facturas/sugerirProducto'

// Resuelve un cambio de precio que quedó "pendiente" (salto grande en un import):
//  - aplicar:     el producto toma el precio nuevo (historial pasa a 'aplicado').
//  - descartar:   el producto conserva su precio; el cambio queda 'descartado'.
//  - desvincular: además de descartar, la línea de factura NO era ese producto
//                 ("Jugo de pomelo" ≠ Pomelo): se le saca el vínculo y se borra
//                 el alias, para que el próximo import no repita el error.
export async function POST(req: NextRequest) {
  const tenant = await requireRestauranteId()
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const { restauranteId } = tenant

  const body = await req.json().catch(() => null) as { historial_id?: string; accion?: string } | null
  const accion = body?.accion
  if (!body?.historial_id || !['aplicar', 'descartar', 'desvincular'].includes(accion ?? '')) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: h } = await admin
    .from('precio_historial')
    .select('id, producto_id, precio_nuevo, factura_id, estado')
    .eq('id', body.historial_id)
    .eq('restaurante_id', restauranteId)
    .maybeSingle()
  if (!h) return NextResponse.json({ error: 'Cambio no encontrado' }, { status: 404 })
  if (h.estado !== 'pendiente') return NextResponse.json({ error: 'Ese cambio ya se resolvió' }, { status: 409 })

  if (accion === 'aplicar') {
    const { data: prod } = await admin.from('productos').select('precio_unitario')
      .eq('id', h.producto_id).eq('restaurante_id', restauranteId).maybeSingle()
    if (!prod) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    const anterior = Number(prod.precio_unitario ?? 0)
    const nuevo = Number(h.precio_nuevo)
    const { error } = await admin.from('productos').update({ precio_unitario: nuevo }).eq('id', h.producto_id).eq('restaurante_id', restauranteId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await admin.from('ingredientes').update({ costo_unitario: nuevo }).eq('producto_id', h.producto_id)
    await admin.from('precio_historial').update({
      estado: 'aplicado',
      precio_anterior: anterior,
      variacion_porcentaje: anterior > 0 ? Math.round(((nuevo - anterior) / anterior) * 1000) / 10 : 0,
      fecha: new Date().toISOString(),
    }).eq('id', h.id)
    return NextResponse.json({ ok: true, precio: nuevo })
  }

  await admin.from('precio_historial').update({ estado: 'descartado' }).eq('id', h.id)

  if (accion === 'desvincular' && h.factura_id) {
    const { data: lineas } = await admin.from('factura_items')
      .select('id, producto_nombre, facturas!inner(restaurante_id)')
      .eq('factura_id', h.factura_id).eq('producto_id', h.producto_id)
      .eq('facturas.restaurante_id', restauranteId)
    const filas = (lineas ?? []) as unknown as { id: string; producto_nombre: string }[]
    if (filas.length > 0) {
      // Todas las líneas con esa misma descripción, no solo la de esta factura.
      const nombres = Array.from(new Set(filas.map(f => f.producto_nombre)))
      await admin.from('factura_items').update({ producto_id: null })
        .eq('producto_id', h.producto_id).in('producto_nombre', nombres)
      await admin.from('producto_alias').delete()
        .eq('restaurante_id', restauranteId).eq('producto_id', h.producto_id)
        .in('alias_norm', nombres.map(normAlias))
    }
  }
  return NextResponse.json({ ok: true })
}
