import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRestauranteId } from '@/lib/api/tenant'

/**
 * POST /api/salon/prep-list-update
 * Body: { items: [{ carta_item_id: string, cantidad: number }] }
 *
 * Cuando una comanda se envía desde el salón, incrementa la demanda en vivo
 * para cada checklist_item que corresponda a la receta del plato.
 *
 * Requiere columna: checklist_items.demanda_viva INTEGER DEFAULT 0
 * Si la columna no existe, falla silenciosamente (no bloquea el flujo de salón).
 */
export async function POST(req: NextRequest) {
  try {
    const tenant = await requireRestauranteId()
    if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
    const { restauranteId } = tenant

    const supabase = createAdminClient()

    const { items } = await req.json() as { items: { carta_item_id: string; cantidad: number }[] }
    if (!items?.length) return NextResponse.json({ ok: true, actualizado: 0 })

    const cartaItemIds = items.map(i => i.carta_item_id).filter(Boolean)
    if (!cartaItemIds.length) return NextResponse.json({ ok: true, actualizado: 0 })

    // carta_items → receta_id (solo ítems del tenant)
    const { data: cartaItems } = await supabase
      .from('carta_items')
      .select('id, receta_id')
      .in('id', cartaItemIds)
      .eq('restaurante_id', restauranteId)
      .not('receta_id', 'is', null)

    if (!cartaItems?.length) return NextResponse.json({ ok: true, actualizado: 0 })

    // Calcular demanda por receta_id
    const demandaPorReceta: Record<string, number> = {}
    for (const ci of cartaItems) {
      const pedido = items.find(i => i.carta_item_id === ci.id)
      if (ci.receta_id && pedido) {
        demandaPorReceta[ci.receta_id] = (demandaPorReceta[ci.receta_id] ?? 0) + pedido.cantidad
      }
    }

    // Buscar checklist_items con esas recetas (hoy)
    const hoy = new Date().toISOString().slice(0, 10)
    const recetaIds = Object.keys(demandaPorReceta)

    // Intentar incrementar demanda_viva. Si la columna no existe, el error se captura
    let actualizados = 0
    for (const recetaId of recetaIds) {
      const incremento = demandaPorReceta[recetaId]
      const { data: checklistItems } = await supabase
        .from('checklist_items')
        .select('id, demanda_viva')
        .eq('receta_id', recetaId)
        .eq('restaurante_id', restauranteId)
        // Intentamos filtrar por fecha pero el checklist_items puede no tener fecha
        .limit(10)

      for (const ci of checklistItems ?? []) {
        const actual = (ci.demanda_viva ?? 0)
        const { error } = await supabase
          .from('checklist_items')
          .update({ demanda_viva: actual + incremento })
          .eq('id', ci.id)

        if (!error) actualizados++
      }
    }

    return NextResponse.json({ ok: true, actualizado: actualizados })
  } catch {
    // No bloquear el flujo del salón — falla silenciosamente
    return NextResponse.json({ ok: true, actualizado: 0 })
  }
}
