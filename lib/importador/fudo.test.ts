import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseFudo, isFudoFormat } from './fudo'

// Libro con la estructura REAL de un export de Fudo (encabezados verificados contra
// gastos-43905-*.xlsx de Bros): Gastos con 2 filas de "Desde/Hasta" arriba, fechas
// como serial de Excel, CUIT bajo "Número Fiscal", sector bajo "Subcategoría".
function libroFudo() {
  const wb = XLSX.utils.book_new()
  const gastos = [
    ['Desde', 46181], ['Hasta', 46266], [],
    ['Id', 'Fecha', 'Fecha de vencimiento', 'Proveedor', 'Categoría', 'Subcategoría', 'Comentario', 'Estado del pago', 'Importe', 'Número Fiscal', 'Tipo de comprobante', 'N° de comprobante', 'Creado por', 'Cancelado'],
    [20390, 46303, 46313, 'Carrefour', 'Almacen', '', '', 'Pagado', 27181.36, '30-68731034-9', 'Factura A', '1871', 'Camila Ecenarro', 'No'],
    [20391, 46302, '', 'Ferrero', 'Almacen', '', 'Incluye 1 y 2', 'A pagar', 56900, '', 'Ticket', '', 'Camila Ecenarro', 'No'],
    [20392, 46302, '', 'Cancelado SA', 'Almacen', '', '', 'Pagado', 1000, '', 'Ticket', '', 'X', 'Sí'],
    [20393, 46302, '', 'Empleado - Alguien', 'Mano de Obra', 'Salon', '', 'Pagado', 500000, '', '', '', 'X', 'No'],
  ]
  const detalle = [
    ['Id. Gasto', 'Fecha', 'Cantidad', 'Unidad', 'Descripción', 'Precio', 'Cancelado'],
    [20390, 46303, 3, 'unid.', 'SALCHICHAS PALADINI FLOW PACK X 6 UNI', 7785.12, 'No'],
    [20390, 46303, 3, 'unid.', 'PAN PARA PANCHO ARTESANO BIMBO BOLSA X 6', 13289.26, 'No'],
    [20391, 46302, 1, '', 'Ferrero Rocher', 56900, 'No'],
  ]
  const pagos = [
    ['Id. Gasto', 'Id. Pago', 'Fecha de pago', 'Importe', 'Medio de pago', 'De Caja', 'Caja', 'Cancelado'],
    [20390, 66302, 46303, 27181.36, 'Transferencia bbva', 'No', '', 'No'],
    [20390, 66303, 46303, 100, 'Efectivo', 'Sí', 'General', 'Sí'],
  ]
  const impuestos = [
    ['Id. Gasto', 'Importe neto $', 'IVA $', 'Ingresos Brutos $', 'Ganancias $', 'Otros impuestos $', 'Importe total $'],
    [20390, 21273.38, 4438.64, 845.45, 0, 760.97, 27181.36],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(gastos), 'Gastos')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detalle), 'Detalle')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pagos), 'Pagos')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(impuestos), 'Impuestos y percepciones')
  return wb
}

describe('parseFudo', () => {
  const wb = libroFudo()
  const r = parseFudo(wb, 'rest-1')

  it('reconoce el formato', () => {
    expect(isFudoFormat(wb)).toBe(true)
  })

  it('omite canceladas pero deja pasar al empleado (el filtro de privacidad es del insert)', () => {
    expect(r.facturas.map(f => f.external_id)).toEqual(['20390', '20391', '20393'])
    expect(r.omitidas).toBe(1)
  })

  it('lee ID, comprobante, CUIT, vencimiento y creador', () => {
    const f = r.facturas[0]
    expect(f.external_source).toBe('fudo')
    expect(f.proveedor_nombre).toBe('Carrefour')
    expect(f.tipo_factura).toBe('A')
    expect(f.numero_factura).toBe('1871')
    expect(f.proveedor_cuit).toBe('30687310349')
    expect(f.fecha_vencimiento).toBe('2026-10-18')
    expect(f.fecha_factura).toBe('2026-10-08')
    expect(f.creado_por).toBe('Camila Ecenarro')
    expect(f.status).toBe('pagada')
  })

  it('"A pagar" queda pendiente y a cuenta corriente', () => {
    const f = r.facturas[1]
    expect(f.status).toBe('pendiente')
    expect(f.condicion_pago).toBe('cuenta_corriente')
    expect(f.fecha_vencimiento).toBeNull()
  })

  it('lee las percepciones de la hoja de impuestos', () => {
    const f = r.facturas[0]
    expect(f.subtotal).toBeCloseTo(21273.38)
    expect(f.iva_total).toBeCloseTo(4438.64)
    expect(f.percepcion_iibb).toBeCloseTo(845.45)
    expect(f.percepcion_ganancias).toBe(0)
    expect(f.otras_percepciones).toBeCloseTo(760.97)
  })

  it('lee los pagos y descarta los cancelados', () => {
    const pagos = r.pagos.get(r.facturas[0].id)
    expect(pagos).toHaveLength(1)
    expect(pagos![0]).toMatchObject({ external_id: '66302', fecha_pago: '2026-10-08', importe: 27181.36, medio_pago: 'Transferencia bbva', caja: null })
    expect(r.pagos.has(r.facturas[1].id)).toBe(false)
  })

  it('arma los ítems con precio unitario = precio de línea / cantidad', () => {
    const items = r.items.filter(i => i.factura_id === r.facturas[0].id)
    expect(items).toHaveLength(2)
    expect(items[0].cantidad).toBe(3)
    expect(items[0].precio_unitario).toBeCloseTo(2595.04)
    expect(items[0].subtotal).toBeCloseTo(7785.12)
  })
})
