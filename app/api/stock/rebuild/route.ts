import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRestauranteId } from '@/lib/api/tenant'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const tenant = await requireRestauranteId()
    if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
    const restaurante_id = tenant.restauranteId

    const { confirm } = await req.json() as {
      restaurante_id?: string
      confirm: boolean
    }
    if (!confirm) return NextResponse.json({ error: 'Falta confirmación' }, { status: 400 })

    const admin = createAdminClient()

    // 0. Verificar que haya facturas — sino no tiene sentido borrar
    const { count: facturasCount } = await admin
      .from('facturas')
      .select('*', { count: 'exact', head: true })
      .eq('restaurante_id', restaurante_id)

    if (!facturasCount || facturasCount === 0) {
      return NextResponse.json({
        error: 'No hay facturas cargadas. Cargá facturas antes de hacer rebuild.',
      }, { status: 400 })
    }

    // 1. Contar lo que vamos a borrar (para reporte)
    const { count: productosAntes } = await admin
      .from('productos')
      .select('*', { count: 'exact', head: true })
      .eq('restaurante_id', restaurante_id)

    // 2. Borrar productos del restaurante (FK ingredientes.producto_id es ON DELETE SET NULL,
    //    así que los ingredientes mantienen su costo_unitario pero pierden el link)
    const { error: deleteError } = await admin
      .from('productos')
      .delete()
      .eq('restaurante_id', restaurante_id)

    if (deleteError) {
      console.error('[stock/rebuild] error borrando productos:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // 3. Crear productos desde facturas
    const baseUrl = new URL(req.url).origin
    const crearRes = await fetch(`${baseUrl}/api/importador/productos-desde-facturas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: req.headers.get('cookie') ?? '',
      },
      body: JSON.stringify({ restaurante_id, mode: 'apply' }),
    })

    const crearData = await crearRes.json()
    if (!crearRes.ok) {
      return NextResponse.json({
        error: 'Error creando productos desde facturas',
        detalle: crearData,
      }, { status: 500 })
    }

    // 4. Auto-link ingredientes con productos recién creados
    let vinculados = 0
    try {
      const matchesRes = await fetch(`${baseUrl}/api/recetas/auto-link-ingredientes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: req.headers.get('cookie') ?? '',
        },
        body: JSON.stringify({ restaurante_id }),
      })

      if (matchesRes.ok) {
        const { matches } = await matchesRes.json()
        if (matches?.length > 0) {
          const links = matches
            .filter((m: { confianza: string }) => m.confianza === 'exacto' || m.confianza === 'parcial')
            .map((m: { ingrediente_ids: string[]; producto_id: string }) => ({
              ingrediente_ids: m.ingrediente_ids,
              producto_id: m.producto_id,
            }))

          if (links.length > 0) {
            const aplicarRes = await fetch(`${baseUrl}/api/recetas/auto-link-ingredientes`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                cookie: req.headers.get('cookie') ?? '',
              },
              body: JSON.stringify({ links }),
            })
            if (aplicarRes.ok) {
              const aplicarData = await aplicarRes.json()
              vinculados = aplicarData.vinculados ?? 0
            }
          }
        }
      }
    } catch (e) {
      console.error('[stock/rebuild] auto-link error (no fatal):', e)
    }

    return NextResponse.json({
      productos_borrados: productosAntes ?? 0,
      productos_creados: crearData.insertados ?? 0,
      proveedores_creados: crearData.proveedores_creados ?? 0,
      ingredientes_vinculados: vinculados,
    })
  } catch (e) {
    console.error('[stock/rebuild] error:', e)
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'Error interno',
    }, { status: 500 })
  }
}
