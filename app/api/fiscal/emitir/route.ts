import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { WsfeDirecto, ProveedorFiscalStub } from '@/lib/fiscal'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      cuenta_id:  string
      total:      number
      subtotal:   number
      propina?:   number
    }

    // Verificar sesión y obtener restaurante_id
    const serverSupabase = await createServerClient()
    const { data: { user } } = await serverSupabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const supabase = createAdminClient()

    const { data: ur } = await supabase
      .from('user_restaurantes')
      .select('restaurante_id')
      .eq('user_id', user.id)
      .single()

    if (!ur?.restaurante_id) {
      return NextResponse.json({ error: 'Restaurante no encontrado' }, { status: 400 })
    }

    const restauranteId = ur.restaurante_id

    // Verificar si hay config fiscal activa
    const { data: config } = await supabase
      .from('fiscal_config')
      .select('activo, condicion_iva, cuit, punto_venta')
      .eq('restaurante_id', restauranteId)
      .single()

    if (!config?.activo) {
      // No hay fiscal configurado → pendiente sin emitir
      await supabase.from('comprobantes').insert({
        restaurante_id:       restauranteId,
        cuenta_id:            body.cuenta_id,
        tipo:                 'C',
        punto_venta:          1,
        numero:               0,
        estado:               'pendiente',
        receptor_cuit:        '',
        receptor_condicion_iva: 'CF',
        subtotal:             body.subtotal,
        iva:                  0,
        total:                body.total,
      })
      return NextResponse.json({ estado: 'pendiente', error: 'Fiscal no configurado' })
    }

    // Determinar tipo de comprobante según condición IVA del emisor
    const tipo = config.condicion_iva === 'ri' ? 'B' : 'C'

    const proveedor = new WsfeDirecto(restauranteId)

    const result = await proveedor.emitir({
      comprobante: {
        restaurante_id:       restauranteId,
        cuenta_id:            body.cuenta_id,
        tipo,
        punto_venta:          config.punto_venta,
        estado:               'pendiente',
        receptor_cuit:        '',
        receptor_condicion_iva: 'CF',
        subtotal:             body.subtotal,
        iva:                  0,
        total:                body.total,
      },
      items: [],
    })

    // Persistir comprobante en DB
    const { data: comp, error: compError } = await supabase
      .from('comprobantes')
      .insert({
        restaurante_id:       restauranteId,
        cuenta_id:            body.cuenta_id,
        tipo,
        punto_venta:          config.punto_venta,
        numero:               result.numero ?? 0,
        estado:               result.estado,
        receptor_cuit:        '',
        receptor_condicion_iva: 'CF',
        subtotal:             body.subtotal,
        iva:                  result.estado === 'emitido'
          ? parseFloat((body.total - body.subtotal).toFixed(2))
          : 0,
        total:                body.total,
        cae:                  result.cae ?? null,
        cae_vencimiento:      result.cae_vencimiento
          ? `${result.cae_vencimiento.slice(0,4)}-${result.cae_vencimiento.slice(4,6)}-${result.cae_vencimiento.slice(6,8)}`
          : null,
        qr_data:              result.qr_data ?? null,
        arca_raw:             result.arca_raw ?? null,
        error_msg:            result.error ?? null,
        emitido_at:           result.estado === 'emitido' ? new Date().toISOString() : null,
      })
      .select('id')
      .single()

    if (compError) console.error('[fiscal/emitir] Error al guardar comprobante:', compError)

    return NextResponse.json({
      ...result,
      comprobante_id: comp?.id,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    console.error('[fiscal/emitir]', msg)
    return NextResponse.json({ estado: 'rechazado', error: msg }, { status: 500 })
  }
}
