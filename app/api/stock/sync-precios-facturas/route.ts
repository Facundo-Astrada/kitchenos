import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRestauranteId } from '@/lib/api/tenant'
import { calcularDesfasadosCompleto, aplicarDesfasados } from '@/lib/stock/syncPrecios'

// Sincroniza productos.precio_unitario con el precio de la última factura que los
// matchea — el importador universal NO actualiza precios (solo el OCR individual y
// el Rebuild destructivo lo hacían), así que con el tiempo el precio de stock se
// desfasa del real. Este endpoint SOLO toca precios — nunca stock_actual ni umbrales.
export async function POST(req: NextRequest) {
  try {
    const tenant = await requireRestauranteId()
    if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
    const { restauranteId } = tenant
    const admin = createAdminClient()

    const body = await req.json().catch(() => ({}))
    const mode = body.mode === 'apply' ? 'apply' : 'preview'

    if (mode === 'preview') {
      const desfasados = await calcularDesfasadosCompleto(admin, restauranteId)
      return NextResponse.json({ desfasados })
    }

    // ── apply ──
    const items = Array.isArray(body.items) ? body.items as Array<{ producto_id: string; precio_nuevo: number; factura_id?: string | null }> : []
    if (items.length === 0) return NextResponse.json({ error: 'Sin items para aplicar' }, { status: 400 })

    const actualizados = await aplicarDesfasados(admin, restauranteId, items)
    return NextResponse.json({ ok: true, actualizados })
  } catch (e) {
    console.error('[sync-precios-facturas] unexpected:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error interno' }, { status: 500 })
  }
}
