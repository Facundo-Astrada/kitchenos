import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase/paginate'
import { aplicarFiltros, type FiltrosFacturas } from '@/lib/hooks/useFacturas'
import type { Factura, FacturaItem } from '@/types'
import type { HojaExcel } from '@/lib/exportar'

// Todo lo que cumple el filtro actual de Compras (no solo las 20 de la página
// cargada), con sus líneas de mercadería. Pagina contra la base.
export async function hojasDeFacturas(
  supabase: SupabaseClient,
  restauranteId: string,
  filtros: FiltrosFacturas,
): Promise<{ hojas: HojaExcel[]; total: number }> {
  const facturas = await fetchAllRows<Factura>((from, to) =>
    aplicarFiltros(supabase.from('facturas').select('*').eq('restaurante_id', restauranteId), filtros)
      .order('fecha_factura', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, to)
  )

  const porId = new Map(facturas.map(f => [f.id, f]))
  const ids = facturas.map(f => f.id)
  const items: FacturaItem[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const lote = ids.slice(i, i + 150)
    items.push(...await fetchAllRows<FacturaItem>((from, to) =>
      supabase.from('factura_items').select('*').in('factura_id', lote).range(from, to)
    ))
  }

  const filasFacturas = facturas.map(f => ({
    'ID Fudo': f.external_id ?? '',
    'Proveedor': f.proveedor_nombre,
    'CUIT': f.proveedor_cuit ?? '',
    'Fecha': f.fecha_factura,
    'Vencimiento': f.fecha_vencimiento ?? '',
    'Tipo': f.tipo_factura ?? '',
    'N° Factura': f.numero_factura ?? '',
    'Estado': f.status ?? '',
    'Condición pago': f.condicion_pago ?? '',
    'Sector': f.sector ?? '',
    'Neto': f.subtotal ?? 0,
    'IVA': f.iva_total ?? 0,
    'IIBB': f.percepcion_iibb ?? 0,
    'Ganancias': f.percepcion_ganancias ?? 0,
    'Otras percepciones': f.otras_percepciones ?? 0,
    'Total': f.total,
    'Notas': f.notas ?? '',
  }))

  const filasItems = items.map(i => {
    const f = porId.get(i.factura_id)
    return {
      'ID Fudo': f?.external_id ?? '',
      'Proveedor': f?.proveedor_nombre ?? '',
      'Fecha': f?.fecha_factura ?? '',
      'N° Factura': f?.numero_factura ?? '',
      'Producto': i.producto_nombre,
      'Cantidad': i.cantidad,
      'Unidad': i.unidad ?? '',
      'Precio unitario': i.precio_unitario,
      'IVA %': i.alicuota_iva ?? 0,
      'Subtotal': i.subtotal ?? i.cantidad * i.precio_unitario,
      'Vinculado a stock': i.producto_id ? 'Sí' : 'No',
    }
  })

  return { hojas: [{ nombre: 'Facturas', filas: filasFacturas }, { nombre: 'Líneas', filas: filasItems }], total: facturas.length }
}
