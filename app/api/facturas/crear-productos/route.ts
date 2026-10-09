import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRestauranteId } from '@/lib/api/tenant'
import { normalizeForStock } from '@/lib/stock/precios'
import { normalizeNombreProducto } from '@/lib/facturas/matching'
import { normAlias } from '@/lib/facturas/sugerirProducto'

export const maxDuration = 120

// Crea productos de stock a partir de líneas de factura sueltas (ej. todos los
// vinos que nunca se cargaron) y las vincula. Stock inicial 0: son compras
// pasadas, no una recepción de hoy. Precio = el de la compra más reciente.
type Grupo = { nombre: string; unidad: string; precio: number; item_ids: string[] }

export async function POST(req: NextRequest) {
  const tenant = await requireRestauranteId()
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const { restauranteId } = tenant

  const body = await req.json().catch(() => null) as { grupos?: Grupo[]; categoria?: string } | null
  const grupos = (body?.grupos ?? []).filter(g => g?.nombre && Array.isArray(g.item_ids) && g.item_ids.length > 0).slice(0, 300)
  if (grupos.length === 0) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  const categoria = body?.categoria || 'Bebidas'

  const admin = createAdminClient()
  let creados = 0
  let vinculadas = 0
  const errores: string[] = []

  for (let i = 0; i < grupos.length; i += 10) {
    await Promise.all(grupos.slice(i, i + 10).map(async g => {
      const n = normalizeForStock({ cantidad: 1, unidad: g.unidad || 'u', precio_unitario: g.precio || 0 })
      const { data: prod, error } = await admin.from('productos').insert({
        nombre: normalizeNombreProducto(g.nombre),
        unidad: n.unidad_stock,
        stock_actual: 0,
        stock_minimo: 0,
        stock_critico: 0,
        categoria,
        precio_unitario: n.precio_stock,
        activo: true,
        restaurante_id: restauranteId,
      }).select('id').single()
      if (error || !prod) { errores.push(g.nombre); return }
      creados++
      // Solo líneas del propio restaurante.
      const { data: propias } = await admin.from('factura_items')
        .select('id, facturas!inner(restaurante_id)')
        .in('id', g.item_ids.slice(0, 500)).eq('facturas.restaurante_id', restauranteId)
      const ids = ((propias ?? []) as { id: string }[]).map(r => r.id)
      if (ids.length > 0) {
        const { error: e2 } = await admin.from('factura_items').update({ producto_id: prod.id }).in('id', ids)
        if (!e2) vinculadas += ids.length
      }
      await admin.from('producto_alias').upsert(
        { restaurante_id: restauranteId, alias_norm: normAlias(g.nombre), producto_id: prod.id },
        { onConflict: 'restaurante_id,alias_norm' },
      )
    }))
  }

  return NextResponse.json({ creados, vinculadas, errores })
}
