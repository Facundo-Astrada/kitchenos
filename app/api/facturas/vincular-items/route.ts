import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRestauranteId } from '@/lib/api/tenant'
import { aUnidadDelProducto } from '@/lib/stock/precios'
import { aplicarDesfasados } from '@/lib/stock/syncPrecios'

// Vincula ítems de factura sueltos (sin producto_id) a un producto de stock.
//  1. Setea producto_id en esos ítems.
//  2. Guarda el alias (descripción normalizada → producto) para que el próximo
//     import los vincule solo.
//  3. Lleva el precio del ítem MÁS RECIENTE a la unidad del producto y lo aplica
//     (historial + ingredientes). Si no se puede convertir (ej. 'u' contra kg sin
//     peso por unidad) no adivina: vincula y avisa.

function normNombre(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type ItemRow = {
  id: string
  producto_nombre: string
  unidad: string | null
  precio_unitario: number
  factura_id: string
  facturas: { restaurante_id: string; fecha_factura: string | null; created_at: string } | { restaurante_id: string; fecha_factura: string | null; created_at: string }[] | null
}

export async function POST(req: NextRequest) {
  const tenant = await requireRestauranteId()
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const { restauranteId } = tenant

  const body = await req.json().catch(() => null) as { producto_id?: string; item_ids?: string[] } | null
  const productoId = body?.producto_id
  const itemIds = Array.isArray(body?.item_ids) ? body!.item_ids.filter(Boolean) : []
  if (!productoId || itemIds.length === 0) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  const admin = createAdminClient()

  const { data: producto } = await admin
    .from('productos')
    .select('id, nombre, unidad, precio_unitario, peso_por_unidad_g, unidad_compra, cantidad_por_envase')
    .eq('id', productoId)
    .eq('restaurante_id', restauranteId)
    .maybeSingle()
  if (!producto) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

  // Solo ítems del propio restaurante (el join a facturas es la barrera de tenant).
  const items: ItemRow[] = []
  for (let i = 0; i < itemIds.length; i += 200) {
    const { data, error } = await admin
      .from('factura_items')
      .select('id, producto_nombre, unidad, precio_unitario, factura_id, facturas!inner(restaurante_id, fecha_factura, created_at)')
      .in('id', itemIds.slice(i, i + 200))
      .eq('facturas.restaurante_id', restauranteId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    items.push(...((data ?? []) as unknown as ItemRow[]))
  }
  if (items.length === 0) return NextResponse.json({ error: 'No se encontraron esos ítems' }, { status: 404 })

  const ids = items.map(it => it.id)
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await admin.from('factura_items').update({ producto_id: productoId }).in('id', ids.slice(i, i + 200))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const alias = Array.from(new Set(items.map(it => normNombre(it.producto_nombre)).filter(Boolean)))
  if (alias.length > 0) {
    await admin.from('producto_alias').upsert(
      alias.map(a => ({ restaurante_id: restauranteId, alias_norm: a, producto_id: productoId })),
      { onConflict: 'restaurante_id,alias_norm' },
    )
  }

  const fechaDe = (it: ItemRow) => {
    const f = Array.isArray(it.facturas) ? it.facturas[0] : it.facturas
    return f?.fecha_factura || String(f?.created_at ?? '').slice(0, 10)
  }
  const masReciente = items.filter(it => (it.precio_unitario ?? 0) > 0).sort((a, b) => fechaDe(b).localeCompare(fechaDe(a)))[0]

  let precio: { anterior: number; nuevo: number } | null = null
  let sinConvertir = false
  if (masReciente) {
    const conv = aUnidadDelProducto(
      { cantidad: 1, unidad: masReciente.unidad ?? producto.unidad, precio_unitario: masReciente.precio_unitario },
      producto,
    )
    if (!conv) {
      sinConvertir = true
    } else {
      const nuevo = Math.round(conv.precio * 100) / 100
      const anterior = Number(producto.precio_unitario ?? 0)
      if (nuevo > 0 && nuevo !== anterior) {
        await aplicarDesfasados(admin, restauranteId, [{ producto_id: productoId, precio_nuevo: nuevo, factura_id: masReciente.factura_id }])
        precio = { anterior, nuevo }
      }
    }
  }

  return NextResponse.json({ vinculados: ids.length, alias: alias.length, precio, sin_convertir: sinConvertir })
}
