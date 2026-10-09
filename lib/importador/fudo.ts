// Parser del export de Fudo (hojas Gastos / Detalle / Pagos / Impuestos y percepciones)
// y helpers compartidos con el import genérico. Vive en lib/ (no en la route) para
// poder probarlo con un libro sintético: un encabezado mal leído ("Número Fiscal"
// vs "CUIT") se traducía en una columna entera vacía sin que nada avisara.
import * as XLSX from 'xlsx'
import { randomUUID } from 'crypto'

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

export function norm(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

export function excelDateToISO(serial: unknown): string | null {
  if (typeof serial === 'string') {
    const d = new Date(serial)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    return null
  }
  if (typeof serial !== 'number' || serial <= 0) return null
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000))
  return date.toISOString().slice(0, 10)
}

export function parseNum(v: unknown): number {
  if (typeof v === 'number') return v
  const s = String(v ?? '').replace(/\$|\s/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

export function mapTipoFactura(v: string): string {
  const t = norm(v)
  if (t.includes('factura a') || /\ba\b/.test(t)) return 'A'
  if (t.includes('factura b') || /\bb\b/.test(t)) return 'B'
  if (t.includes('factura c') || /\bc\b/.test(t)) return 'C'
  if (t.includes('remito')) return 'remito'
  if (t.includes('ticket') || t.includes('recibo')) return 'ticket'
  return 'ticket'
}

export function mapUnidad(v: string): string {
  const r = norm(v)
  if (r === 'kg' || r.includes('kilo')) return 'kg'
  if (r === 'g' || r === 'gr' || r.includes('gramo')) return 'g'
  if (r === 'l' || r === 'lt' || r.includes('litro')) return 'l'
  if (r === 'ml' || r === 'cc') return 'ml'
  return 'u'
}

export function findCol(headers: string[], names: string[]): number {
  const normHeaders = headers.map(norm)
  for (const target of names) {
    const t = norm(target)
    // Exacto primero: "Caja" no debe caer en "De Caja" (que la contiene).
    const idx = normHeaders.findIndex(h => h === t)
    if (idx >= 0) return idx
    const idx2 = normHeaders.findIndex(h => h.includes(t))
    if (idx2 >= 0) return idx2
  }
  return -1
}

// ──────────────────────────────────────────────────────────────────────────
// Detección: Fudo (hojas Gastos + Detalle)
// ──────────────────────────────────────────────────────────────────────────

export function isFudoFormat(wb: XLSX.WorkBook): boolean {
  return !!(wb.Sheets['Gastos'] && wb.Sheets['Detalle'])
}

export type FacturaPayload = {
  id: string
  proveedor_nombre: string
  fecha_factura: string | null
  tipo_factura: string
  numero_factura: string | null
  subtotal: number
  iva_total: number
  total: number
  condicion_pago: string
  status: string
  notas: string | null
  restaurante_id: string
  categoria_gasto_id?: string | null
  external_id?: string | null
  external_source?: string | null
  fecha_vencimiento?: string | null
  proveedor_cuit?: string | null
  percepcion_iibb?: number
  percepcion_ganancias?: number
  otras_percepciones?: number
  sector?: string | null
  creado_por?: string | null
  /** Categoría en el sistema de origen (Fudo: "Verduras y frutas", "Vino", "Egresos Varios"). */
  categoria_origen?: string | null
  medio_pago_id?: string | null
}

export type PagoPayload = { external_id: string | null; fecha_pago: string | null; importe: number; medio_pago: string | null; caja: string | null }
export type PagosPorFactura = Map<string, PagoPayload[]>

export type ItemPayload = {
  factura_id: string
  producto_nombre: string
  cantidad: number
  unidad: string
  precio_unitario: number
  alicuota_iva: number
  subtotal: number
  producto_id?: string | null
}

export function parseFudo(wb: XLSX.WorkBook, restauranteId: string): {
  facturas: FacturaPayload[]
  items: ItemPayload[]
  omitidas: number
  pagos: PagosPorFactura
} {
  const facturas: FacturaPayload[] = []
  const items: ItemPayload[] = []
  const pagos: PagosPorFactura = new Map()
  let omitidas = 0

  // ── Gastos ──
  const gastosRaw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Gastos'], { header: 1, defval: '' }) as unknown[][]
  const gHeaderIdx = gastosRaw.findIndex(r => {
    const cells = (r as unknown[]).map(c => norm(c))
    return cells.includes('id') && cells.some(c => c.startsWith('fecha'))
  })
  if (gHeaderIdx < 0) return { facturas, items, omitidas, pagos }

  const gHeaders = gastosRaw[gHeaderIdx] as string[]
  const cG = {
    id: findCol(gHeaders, ['Id']),
    fecha: findCol(gHeaders, ['Fecha']),
    proveedor: findCol(gHeaders, ['Proveedor']),
    categoria: findCol(gHeaders, ['Categoría', 'Categoria']),
    comentario: findCol(gHeaders, ['Comentario']),
    estado: findCol(gHeaders, ['Estado del pago', 'EstadoPago', 'Estado']),
    importe: findCol(gHeaders, ['Importe', 'Total']),
    tipo: findCol(gHeaders, ['Tipo de comprobante', 'Tipo']),
    nro: findCol(gHeaders, ['N° de comprobante', 'Nro', 'Numero', 'Número']),
    cancelado: findCol(gHeaders, ['Cancelado']),
    vencimiento: findCol(gHeaders, ['Fecha de vencimiento', 'Vencimiento']),
    cuit: findCol(gHeaders, ['Número Fiscal', 'Numero Fiscal', 'CUIT']),
    sector: findCol(gHeaders, ['Subcategoría', 'Subcategoria']),
    creadoPor: findCol(gHeaders, ['Creado por']),
  }

  // ── Detalle ──
  const detalleRaw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Detalle'], { header: 1, defval: '' }) as unknown[][]
  const dHeaderIdx = detalleRaw.findIndex(r => {
    const cells = (r as unknown[]).map(c => norm(c))
    return cells.some(c => c.includes('gasto')) && cells.some(c => c.includes('descrip') || c.includes('producto'))
  })
  const dStart = dHeaderIdx >= 0 ? dHeaderIdx + 1 : 1
  const dHeaders = dHeaderIdx >= 0
    ? (detalleRaw[dHeaderIdx] as string[])
    : ['Id. Gasto', 'Fecha', 'Cantidad', 'Unidad', 'Descripción', 'Precio', 'Cancelado']
  const cD = {
    idGasto: findCol(dHeaders, ['Id. Gasto', 'IdGasto', 'Id Gasto']),
    cantidad: findCol(dHeaders, ['Cantidad']),
    unidad: findCol(dHeaders, ['Unidad', 'U/M']),
    desc: findCol(dHeaders, ['Descripción', 'Descripcion', 'Producto', 'Detalle']),
    precio: findCol(dHeaders, ['Precio', 'Importe', 'Total']),
    cancelado: findCol(dHeaders, ['Cancelado']),
  }

  const detalleByGastoId = new Map<string, unknown[][]>()
  for (const r of detalleRaw.slice(dStart)) {
    const row = r as unknown[]
    const id = String(row[cD.idGasto] ?? '').trim()
    if (!id) continue
    if (!detalleByGastoId.has(id)) detalleByGastoId.set(id, [])
    detalleByGastoId.get(id)!.push(row)
  }

  // ── Impuestos (opcional) ──
  const impSheet = wb.Sheets['Impuestos y percepciones']
  const impuestosByGastoId = new Map<string, unknown[]>()
  if (impSheet) {
    const impRaw = XLSX.utils.sheet_to_json<unknown[]>(impSheet, { header: 1, defval: '' }) as unknown[][]
    for (const r of impRaw.slice(1)) {
      const row = r as unknown[]
      const id = String(row[0] ?? '').trim()
      if (id) impuestosByGastoId.set(id, row)
    }
  }

  // ── Pagos (opcional): fecha y medio de cada pago, sin los cancelados ──
  const pagosPorGastoId = new Map<string, PagoPayload[]>()
  const pagosSheet = wb.Sheets['Pagos']
  if (pagosSheet) {
    const pRaw = XLSX.utils.sheet_to_json<unknown[]>(pagosSheet, { header: 1, defval: '' }) as unknown[][]
    const pHeaderIdx = pRaw.findIndex(r => (r as unknown[]).some(c => norm(c).includes('medio de pago')))
    if (pHeaderIdx >= 0) {
      const ph = pRaw[pHeaderIdx] as string[]
      const cP = {
        idGasto: findCol(ph, ['Id. Gasto', 'Id Gasto']),
        idPago: findCol(ph, ['Id. Pago', 'Id Pago']),
        fecha: findCol(ph, ['Fecha de pago', 'Fecha']),
        importe: findCol(ph, ['Importe']),
        medio: findCol(ph, ['Medio de pago']),
        caja: findCol(ph, ['Caja']),
        cancelado: findCol(ph, ['Cancelado']),
      }
      for (const r of pRaw.slice(pHeaderIdx + 1)) {
        const row = r as unknown[]
        const gid = String(row[cP.idGasto] ?? '').trim()
        if (!gid || norm(row[cP.cancelado]) === 'si') continue
        const lista = pagosPorGastoId.get(gid) ?? []
        lista.push({
          external_id: String(row[cP.idPago] ?? '').trim() || null,
          fecha_pago: excelDateToISO(row[cP.fecha]),
          importe: parseNum(row[cP.importe]),
          medio_pago: String(row[cP.medio] ?? '').trim() || null,
          caja: cP.caja >= 0 ? (String(row[cP.caja] ?? '').trim() || null) : null,
        })
        pagosPorGastoId.set(gid, lista)
      }
    }
  }

  // ── Build ──
  for (const r of gastosRaw.slice(gHeaderIdx + 1)) {
    const row = r as unknown[]
    if (!row[cG.id]) { omitidas++; continue }
    if (norm(row[cG.cancelado]) === 'si') { omitidas++; continue }

    const gastoId = String(row[cG.id] ?? '').trim()
    const total = parseNum(row[cG.importe])
    if (total <= 0) { omitidas++; continue }

    const imp = impuestosByGastoId.get(gastoId)
    const subtotal = imp ? (parseNum(imp[1]) || total) : total
    const ivaTotal = imp ? parseNum(imp[2]) : 0
    const percIibb = imp ? parseNum(imp[3]) : 0
    const percGanancias = imp ? parseNum(imp[4]) : 0
    const percOtras = imp ? parseNum(imp[5]) : 0

    const facturaId = randomUUID()
    const categoria = String(row[cG.categoria] ?? '').trim()
    const comentario = String(row[cG.comentario] ?? '').trim()
    const notas = [categoria, comentario].filter(Boolean).join(' · ') || null

    const estadoStr = String(row[cG.estado] ?? '').trim()

    facturas.push({
      id: facturaId,
      proveedor_nombre: String(row[cG.proveedor] ?? '').trim() || 'Sin proveedor',
      fecha_factura: excelDateToISO(row[cG.fecha]),
      tipo_factura: mapTipoFactura(String(row[cG.tipo] ?? '')),
      numero_factura: String(row[cG.nro] ?? '').trim() || null,
      subtotal,
      iva_total: ivaTotal,
      total,
      condicion_pago: norm(estadoStr) === 'a pagar' ? 'cuenta_corriente' : 'contado',
      status: norm(estadoStr) === 'pagado' ? 'pagada' : 'pendiente',
      notas,
      restaurante_id: restauranteId,
      external_id: gastoId,
      external_source: 'fudo',
      fecha_vencimiento: cG.vencimiento >= 0 ? excelDateToISO(row[cG.vencimiento]) : null,
      proveedor_cuit: cG.cuit >= 0 ? (String(row[cG.cuit] ?? '').replace(/\D/g, '') || null) : null,
      percepcion_iibb: percIibb,
      percepcion_ganancias: percGanancias,
      otras_percepciones: percOtras,
      sector: cG.sector >= 0 ? (String(row[cG.sector] ?? '').trim() || null) : null,
      creado_por: cG.creadoPor >= 0 ? (String(row[cG.creadoPor] ?? '').trim() || null) : null,
      categoria_origen: categoria || null,
    })
    const susPagos = pagosPorGastoId.get(gastoId)
    if (susPagos?.length) pagos.set(facturaId, susPagos)

    for (const ir of detalleByGastoId.get(gastoId) ?? []) {
      const irow = ir as unknown[]
      if (norm(irow[cD.cancelado]) === 'si') continue
      const desc = String(irow[cD.desc] ?? '').trim()
      if (!desc || norm(desc) === 'iva') continue

      const cantidad = parseNum(irow[cD.cantidad]) || 1
      const precioTotal = parseNum(irow[cD.precio])
      const precioUnitario = cantidad > 0 ? precioTotal / cantidad : precioTotal

      items.push({
        factura_id: facturaId,
        producto_nombre: desc,
        cantidad,
        unidad: mapUnidad(String(irow[cD.unidad] ?? '')),
        precio_unitario: Math.round(precioUnitario * 100) / 100,
        alicuota_iva: 21,
        subtotal: precioTotal,
      })
    }
  }

  return { facturas, items, omitidas, pagos }
}

