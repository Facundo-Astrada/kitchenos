import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRestauranteId } from '@/lib/api/tenant'
import * as XLSX from 'xlsx'
import { randomUUID } from 'crypto'

export const maxDuration = 60

function excelDateToISO(serial: unknown): string | null {
  if (typeof serial !== 'number' || serial <= 0) return null
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000))
  return date.toISOString().slice(0, 10)
}

function mapTipo(tipo: string): string {
  const t = String(tipo ?? '').trim().toLowerCase()
  if (t === 'factura a') return 'A'
  if (t === 'factura b') return 'B'
  if (t === 'factura c') return 'C'
  if (t === 'recibo') return 'ticket'
  if (t === 'remito') return 'remito'
  return 'ticket'
}

function mapUnidad(u: string): string {
  const r = String(u ?? '').trim().toLowerCase()
  if (r === 'kg') return 'kg'
  if (r === 'l') return 'l'
  return 'u'
}

function mapCondicion(estado: string): string {
  return estado === 'A pagar' ? 'cuenta_corriente' : 'contado'
}

function mapStatus(estado: string): string {
  return estado === 'Pagado' ? 'pagada' : 'pendiente'
}

const BATCH = 100

export async function POST(req: NextRequest) {
  const tenant = await requireRestauranteId()
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const { restauranteId } = tenant

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })

  if (!wb.Sheets['Gastos'] || !wb.Sheets['Detalle']) {
    return NextResponse.json({ error: 'El archivo no parece ser un export de Fudo (faltan hojas Gastos/Detalle)' }, { status: 400 })
  }

  // ── Gastos sheet ──────────────────────────────────────────────────────────
  const gastosRaw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Gastos'], { header: 1, defval: '' }) as unknown[][]
  const gastoHeaderIdx = gastosRaw.findIndex(r => String((r as unknown[])[0]).trim() === 'Id')
  if (gastoHeaderIdx < 0) return NextResponse.json({ error: 'No se encontró la fila de encabezados en Gastos' }, { status: 400 })

  const gastoHeaders = gastosRaw[gastoHeaderIdx] as string[]
  const gCol = (name: string) => gastoHeaders.findIndex(h => String(h).trim().toLowerCase() === name.toLowerCase())
  const G_ID = gCol('Id')
  const G_FECHA = gCol('Fecha')
  const G_PROVEEDOR = gCol('Proveedor')
  const G_CATEGORIA = gCol('Categoría')
  const G_COMENTARIO = gCol('Comentario')
  const G_ESTADO = gCol('EstadoPago')
  const G_IMPORTE = gCol('Importe')
  const G_TIPO = gCol('Tipo')
  const G_NRO = gCol('Nro')
  const G_CANCELADO = gCol('Cancelado')

  const gastos = gastosRaw.slice(gastoHeaderIdx + 1)

  // ── Detalle sheet ─────────────────────────────────────────────────────────
  const detalleRaw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Detalle'], { header: 1, defval: '' }) as unknown[][]
  const detalleHeaderIdx = detalleRaw.findIndex(r => String((r as unknown[])[0]).trim() === 'IdGasto')
  const detalleStart = detalleHeaderIdx >= 0 ? detalleHeaderIdx + 1 : 1
  const detalleHeaders = detalleHeaderIdx >= 0
    ? (detalleRaw[detalleHeaderIdx] as string[])
    : ['IdGasto', 'Fecha', 'Cantidad', 'Unidad', 'Descripción', 'Precio', 'Cancelado']
  const dCol = (name: string) => detalleHeaders.findIndex(h => String(h).trim().toLowerCase() === name.toLowerCase())
  const D_ID_GASTO = dCol('IdGasto')
  const D_CANTIDAD = dCol('Cantidad')
  const D_UNIDAD = dCol('Unidad')
  const D_DESC = Math.max(dCol('Descripción'), dCol('Descripcion'))
  const D_PRECIO = dCol('Precio')
  const D_CANCELADO = dCol('Cancelado')

  const detalleByGastoId = new Map<number, unknown[][]>()
  for (const r of detalleRaw.slice(detalleStart)) {
    const row = r as unknown[]
    const id = row[D_ID_GASTO] as number
    if (!id) continue
    if (!detalleByGastoId.has(id)) detalleByGastoId.set(id, [])
    detalleByGastoId.get(id)!.push(row)
  }

  // ── Impuestos sheet (optional) ────────────────────────────────────────────
  const impuestosRaw = wb.Sheets['Impuestos y percepciones']
    ? (XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Impuestos y percepciones'], { header: 1, defval: '' }) as unknown[][])
    : []
  // cols: 0=IdGasto, 1=NetoS, 2=IVAS, 3=IIBB, 4=Ganancias, 5=Otros, 6=Total
  const impuestosByGastoId = new Map<number, unknown[]>()
  for (const r of impuestosRaw.slice(1)) {
    const row = r as unknown[]
    const id = row[0] as number
    if (id) impuestosByGastoId.set(id, row)
  }

  // ── Build records ─────────────────────────────────────────────────────────
  const facturasToInsert: Record<string, unknown>[] = []
  const itemsToInsert: Record<string, unknown>[] = []
  let omitidas = 0

  for (const r of gastos) {
    const row = r as unknown[]
    if (!row[G_ID]) { omitidas++; continue }
    if (String(row[G_CANCELADO] ?? '').trim() === 'Sí') { omitidas++; continue }

    const gastoId = row[G_ID] as number
    const total = parseFloat(String(row[G_IMPORTE])) || 0
    const imp = impuestosByGastoId.get(gastoId)
    const subtotal = imp ? (parseFloat(String(imp[1])) || total) : total
    const ivaTotal = imp ? (parseFloat(String(imp[2])) || 0) : 0

    const facturaId = randomUUID()
    const categoria = String(row[G_CATEGORIA] ?? '').trim()
    const comentario = String(row[G_COMENTARIO] ?? '').trim()
    const notas = [categoria, comentario].filter(Boolean).join(' · ') || null

    facturasToInsert.push({
      id: facturaId,
      proveedor_nombre: String(row[G_PROVEEDOR] ?? '').trim() || 'Sin proveedor',
      fecha_factura: excelDateToISO(row[G_FECHA]),
      tipo_factura: mapTipo(String(row[G_TIPO] ?? '')),
      numero_factura: String(row[G_NRO] ?? '').trim() || null,
      subtotal,
      iva_total: ivaTotal,
      total,
      condicion_pago: mapCondicion(String(row[G_ESTADO] ?? '')),
      status: mapStatus(String(row[G_ESTADO] ?? '')),
      notas,
      restaurante_id: restauranteId,
    })

    for (const ir of detalleByGastoId.get(gastoId) ?? []) {
      const irow = ir as unknown[]
      if (String(irow[D_CANCELADO] ?? '').trim() === 'Sí') continue
      const desc = String(irow[D_DESC] ?? '').trim()
      if (!desc || desc.toLowerCase() === 'iva') continue

      const cantidad = parseFloat(String(irow[D_CANTIDAD])) || 1
      const precioTotal = parseFloat(String(irow[D_PRECIO])) || 0
      const precioUnitario = cantidad > 0 ? precioTotal / cantidad : precioTotal

      itemsToInsert.push({
        factura_id: facturaId,
        producto_nombre: desc,
        cantidad,
        unidad: mapUnidad(String(irow[D_UNIDAD] ?? '')),
        precio_unitario: Math.round(precioUnitario * 100) / 100,
        alicuota_iva: 21,
        subtotal: precioTotal,
      })
    }
  }

  // ── Batch INSERT ──────────────────────────────────────────────────────────
  const admin = createAdminClient()

  for (let i = 0; i < facturasToInsert.length; i += BATCH) {
    const { error } = await admin.from('facturas').insert(facturasToInsert.slice(i, i + BATCH))
    if (error) return NextResponse.json({ error: `Error insertando facturas: ${error.message}` }, { status: 500 })
  }

  for (let i = 0; i < itemsToInsert.length; i += BATCH) {
    const { error } = await admin.from('factura_items').insert(itemsToInsert.slice(i, i + BATCH))
    if (error) return NextResponse.json({ error: `Error insertando items: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({
    importadas: facturasToInsert.length,
    items: itemsToInsert.length,
    omitidas,
  })
}
