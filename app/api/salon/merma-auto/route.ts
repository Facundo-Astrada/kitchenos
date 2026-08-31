import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRestauranteId } from '@/lib/api/tenant'

/**
 * POST /api/salon/merma-auto
 * Body: { cuenta_id: string }
 *
 * Descuenta del stock los ingredientes consumidos en la cuenta:
 * comanda_items → carta_items → plato_recetas → recetas → ingredientes → productos.stock_actual
 */
export async function POST(req: NextRequest) {
  try {
    const tenant = await requireRestauranteId()
    if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
    const restaurante_id = tenant.restauranteId

    const supabase = createAdminClient()

    const { cuenta_id } = await req.json()
    if (!cuenta_id) return NextResponse.json({ error: 'cuenta_id requerido' }, { status: 400 })

    // Verificar que la cuenta pertenece al tenant
    const { data: cuenta } = await supabase
      .from('cuentas')
      .select('id')
      .eq('id', cuenta_id)
      .eq('restaurante_id', restaurante_id)
      .maybeSingle()
    if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })

    // 1. Obtener todos los comanda_items de la cuenta (vía comandas)
    const { data: comandas } = await supabase
      .from('comandas')
      .select('id')
      .eq('cuenta_id', cuenta_id)

    if (!comandas?.length) return NextResponse.json({ ok: true, descuentos: 0 })

    type Row = { id: string }
    type ItemRow = { carta_item_id: string | null; cantidad: number }
    type PlatoRow = { plato_id: string | null; receta_id: string | null; cantidad: number | null }
    type IngRow = { receta_id: string | null; producto_id: string | null; cantidad: number | null }

    const comandaIds = (comandas as Row[]).map(c => c.id)
    const { data: items } = await supabase
      .from('comanda_items')
      .select('carta_item_id, cantidad, nombre')
      .in('comanda_id', comandaIds)
      .neq('estado', 'cancelado')

    if (!items?.length) return NextResponse.json({ ok: true, descuentos: 0 })

    // 2. Por cada carta_item, buscar receta vinculada vía plato_recetas
    const typedItems = items as ItemRow[]
    const cartaItemIds = [...new Set(typedItems.map(i => i.carta_item_id).filter((x): x is string => !!x))]

    const { data: platos } = await supabase
      .from('plato_recetas')
      .select('plato_id, receta_id, cantidad')
      .in('plato_id', cartaItemIds)

    if (!platos?.length) return NextResponse.json({ ok: true, descuentos: 0, info: 'sin recetas vinculadas' })

    // 3. Por cada receta, obtener ingredientes con producto_id
    const typedPlatos = platos as PlatoRow[]
    const recetaIds = [...new Set(typedPlatos.map(p => p.receta_id).filter((x): x is string => !!x))]

    const { data: ingredientes } = await supabase
      .from('ingredientes')
      .select('receta_id, producto_id, cantidad, unidad_costo')
      .in('receta_id', recetaIds)
      .not('producto_id', 'is', null)

    if (!ingredientes?.length) return NextResponse.json({ ok: true, descuentos: 0, info: 'sin ingredientes vinculados' })

    const typedIngs = ingredientes as IngRow[]

    // 4. Calcular cuánto descontar de cada producto
    const descuentosPorProducto: Record<string, number> = {}

    for (const item of typedItems) {
      const platosDeEsteItem = typedPlatos.filter(p => p.plato_id === item.carta_item_id)
      for (const plato of platosDeEsteItem) {
        const ingDeEstaReceta = typedIngs.filter(i => i.receta_id === plato.receta_id)
        for (const ing of ingDeEstaReceta) {
          if (!ing.producto_id) continue
          const cantidadReceta = ing.cantidad ?? 0
          const cantidadPlato  = plato.cantidad ?? 1       // porciones de la receta en el plato
          const cantidadPedida = item.cantidad ?? 1
          const total = cantidadReceta * cantidadPlato * cantidadPedida
          descuentosPorProducto[ing.producto_id] = (descuentosPorProducto[ing.producto_id] ?? 0) + total
        }
      }
    }

    // 5. Obtener stock actual y descontar
    const productoIds = Object.keys(descuentosPorProducto)
    const { data: productos } = await supabase
      .from('productos')
      .select('id, stock_actual, nombre')
      .in('id', productoIds)
      .eq('restaurante_id', restaurante_id)

    const mermaRows: { restaurante_id: string; producto_id: string; cantidad: number; motivo: string; tipo: string }[] = []

    for (const prod of (productos ?? []) as { id: string; stock_actual: number | null; nombre: string }[]) {
      const cantidad = descuentosPorProducto[prod.id] ?? 0
      if (cantidad <= 0) continue

      const nuevo = Math.max(0, (prod.stock_actual ?? 0) - cantidad)
      await supabase.from('productos').update({ stock_actual: nuevo }).eq('id', prod.id)

      mermaRows.push({
        restaurante_id,
        producto_id: prod.id,
        cantidad,
        motivo: `Consumo venta — cuenta ${cuenta_id.slice(0, 8)}`,
        tipo: 'consumo',
      })
    }

    // 6. Insertar registros de merma para trazabilidad
    if (mermaRows.length > 0) {
      await supabase.from('merma').insert(mermaRows)
    }

    return NextResponse.json({ ok: true, descuentos: mermaRows.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
