import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRestauranteId } from '@/lib/api/tenant'
import * as XLSX from 'xlsx'
import { randomUUID } from 'crypto'

export const maxDuration = 60

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function norm(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

function excelDateToISO(serial: unknown): string | null {
  if (typeof serial === 'string') {
    const d = new Date(serial)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    return null
  }
  if (typeof serial !== 'number' || serial <= 0) return null
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000))
  return date.toISOString().slice(0, 10)
}

function parseNum(v: unknown): number {
  if (typeof v === 'number') return v
  const s = String(v ?? '').replace(/\$|\s/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function mapTipoFactura(v: string): string {
  const t = norm(v)
  if (t.includes('factura a') || /\ba\b/.test(t)) return 'A'
  if (t.includes('factura b') || /\bb\b/.test(t)) return 'B'
  if (t.includes('factura c') || /\bc\b/.test(t)) return 'C'
  if (t.includes('remito')) return 'remito'
  if (t.includes('ticket') || t.includes('recibo')) return 'ticket'
  return 'ticket'
}

function mapUnidad(v: string): string {
  const r = norm(v)
  if (r === 'kg' || r.includes('kilo')) return 'kg'
  if (r === 'g' || r === 'gr' || r.includes('gramo')) return 'g'
  if (r === 'l' || r === 'lt' || r.includes('litro')) return 'l'
  if (r === 'ml' || r === 'cc') return 'ml'
  return 'u'
}

function findCol(headers: string[], names: string[]): number {
  const normHeaders = headers.map(norm)
  for (const target of names) {
    const t = norm(target)
    const idx = normHeaders.findIndex(h => h === t || h.includes(t))
    if (idx >= 0) return idx
  }
  return -1
}

// ──────────────────────────────────────────────────────────────────────────
// Detección: Fudo (hojas Gastos + Detalle)
// ──────────────────────────────────────────────────────────────────────────

function isFudoFormat(wb: XLSX.WorkBook): boolean {
  return !!(wb.Sheets['Gastos'] && wb.Sheets['Detalle'])
}

type FacturaPayload = {
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
}

type ItemPayload = {
  factura_id: string
  producto_nombre: string
  cantidad: number
  unidad: string
  precio_unitario: number
  alicuota_iva: number
  subtotal: number
}

function parseFudo(wb: XLSX.WorkBook, restauranteId: string): {
  facturas: FacturaPayload[]
  items: ItemPayload[]
  omitidas: number
} {
  const facturas: FacturaPayload[] = []
  const items: ItemPayload[] = []
  let omitidas = 0

  // ── Gastos ──
  const gastosRaw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Gastos'], { header: 1, defval: '' }) as unknown[][]
  const gHeaderIdx = gastosRaw.findIndex(r => {
    const cells = (r as unknown[]).map(c => norm(c))
    return cells.includes('id') && cells.some(c => c.startsWith('fecha'))
  })
  if (gHeaderIdx < 0) return { facturas, items, omitidas }

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
    })

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

  return { facturas, items, omitidas }
}

// ──────────────────────────────────────────────────────────────────────────
// Mapeo IA para formatos no-Fudo (Maxirest, Bistrosoft, custom)
// ──────────────────────────────────────────────────────────────────────────

type MapeoIA = {
  proveedor_nombre?: string
  fecha_factura?: string
  numero_factura?: string
  tipo_factura?: string
  total?: string
  subtotal?: string
  iva_total?: string
  producto_nombre?: string
  cantidad?: string
  unidad?: string
  precio_unitario?: string
  alicuota_iva?: string
  // Compuesta: archivo con 1 fila por item (no cabecera + items)
  estructura?: 'flat' | 'header_detail'
}

async function inferirMapeo(headers: string[], sampleRows: unknown[][]): Promise<MapeoIA> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return {}

  const sample = sampleRows.slice(0, 8).map((r, i) =>
    `Fila ${i + 1}: ${(r as unknown[]).map(v => String(v ?? '').trim()).join(' | ')}`
  ).join('\n')

  const prompt = `Sos experto en formatos de exportación de POS gastronómicos (Fudo, Maxirest, Bistrosoft, Toast, Square, Lightspeed). Te paso un archivo de FACTURAS DE COMPRA y necesito que mapees sus columnas al schema de KitchenOS.

Headers: ${JSON.stringify(headers)}

Muestra:
${sample}

Campos KitchenOS disponibles:
- proveedor_nombre (texto, nombre del proveedor)
- fecha_factura (fecha)
- numero_factura (texto, número de comprobante)
- tipo_factura (A/B/C/X/remito/ticket)
- total (número, total de la factura)
- subtotal (número, neto sin IVA)
- iva_total (número)
- producto_nombre (texto, descripción del item)
- cantidad (número)
- unidad (kg/g/l/ml/u)
- precio_unitario (número por unidad)
- alicuota_iva (porcentaje, ej: 21)

Además, identificá la ESTRUCTURA:
- "flat": cada fila es un item con datos del proveedor/factura repetidos
- "header_detail": una hoja con facturas y otra con items (no aplica acá, solo hay 1 hoja)

Respondé SOLO un JSON con el mapping de NOMBRE EXACTO de header → campo KitchenOS:

{
  "estructura": "flat" | "header_detail",
  "proveedor_nombre": "<header exacto o null>",
  "fecha_factura": "<header exacto o null>",
  "numero_factura": "<header exacto o null>",
  "tipo_factura": "<header exacto o null>",
  "total": "<header exacto o null>",
  "subtotal": "<header exacto o null>",
  "iva_total": "<header exacto o null>",
  "producto_nombre": "<header exacto o null>",
  "cantidad": "<header exacto o null>",
  "unidad": "<header exacto o null>",
  "precio_unitario": "<header exacto o null>",
  "alicuota_iva": "<header exacto o null>"
}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return {}
    const data = await res.json()
    const text: string = data.content?.[0]?.text ?? '{}'
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return {}
    return JSON.parse(match[0]) as MapeoIA
  } catch {
    return {}
  }
}

function parseGenerico(
  rows: unknown[][],
  headers: string[],
  mapeo: MapeoIA,
  restauranteId: string,
): { facturas: FacturaPayload[]; items: ItemPayload[]; omitidas: number } {
  const facturas: FacturaPayload[] = []
  const items: ItemPayload[] = []
  let omitidas = 0

  const colIdx = (field: keyof MapeoIA): number => {
    const headerName = mapeo[field]
    if (!headerName || typeof headerName !== 'string') return -1
    return headers.findIndex(h => norm(h) === norm(headerName))
  }

  const c = {
    proveedor: colIdx('proveedor_nombre'),
    fecha: colIdx('fecha_factura'),
    numero: colIdx('numero_factura'),
    tipo: colIdx('tipo_factura'),
    total: colIdx('total'),
    subtotal: colIdx('subtotal'),
    iva: colIdx('iva_total'),
    producto: colIdx('producto_nombre'),
    cantidad: colIdx('cantidad'),
    unidad: colIdx('unidad'),
    precioUnit: colIdx('precio_unitario'),
    alicuota: colIdx('alicuota_iva'),
  }

  // Estructura "flat": cada fila puede ser una factura o un item.
  // Agrupamos por (proveedor + numero_factura + fecha) para detectar facturas con múltiples items.
  // Si no hay numero_factura o si cambian por fila, tratamos cada fila como factura única con 1 item.

  type Group = { key: string; rows: unknown[][] }
  const groups = new Map<string, unknown[][]>()

  for (const row of rows) {
    const prov = String(row[c.proveedor] ?? '').trim()
    if (!prov && c.proveedor >= 0) { continue }
    if (c.total < 0 && c.precioUnit < 0) { continue }

    const fecha = excelDateToISO(row[c.fecha])
    const numero = String(row[c.numero] ?? '').trim()
    const key = `${norm(prov)}__${fecha ?? ''}__${numero}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  for (const [, groupRows] of groups) {
    const first = groupRows[0]
    const prov = String(first[c.proveedor] ?? '').trim() || 'Sin proveedor'
    const fecha = excelDateToISO(first[c.fecha])
    const numero = String(first[c.numero] ?? '').trim() || null
    const tipoStr = String(first[c.tipo] ?? '').trim()

    // Total: si tenemos columna total usamos la de la primera fila;
    // si no, sumamos los items (precio_unit * cantidad)
    let total = 0
    if (c.total >= 0) {
      total = parseNum(first[c.total])
    }

    let subtotal = c.subtotal >= 0 ? parseNum(first[c.subtotal]) : 0
    let iva = c.iva >= 0 ? parseNum(first[c.iva]) : 0

    const facturaId = randomUUID()
    const itemRows: ItemPayload[] = []
    let sumaItems = 0

    for (const row of groupRows) {
      const desc = c.producto >= 0 ? String(row[c.producto] ?? '').trim() : ''
      const cant = c.cantidad >= 0 ? parseNum(row[c.cantidad]) : 1
      const precioU = c.precioUnit >= 0 ? parseNum(row[c.precioUnit]) : 0
      const aliq = c.alicuota >= 0 ? parseNum(row[c.alicuota]) : 21
      const unidad = c.unidad >= 0 ? mapUnidad(String(row[c.unidad] ?? '')) : 'u'

      if (!desc && !precioU) continue
      const subItem = (cant || 1) * precioU
      sumaItems += subItem

      itemRows.push({
        factura_id: facturaId,
        producto_nombre: desc || 'Sin descripción',
        cantidad: cant || 1,
        unidad,
        precio_unitario: precioU,
        alicuota_iva: aliq || 21,
        subtotal: subItem,
      })
    }

    if (total <= 0) total = sumaItems
    if (subtotal <= 0) subtotal = total - iva
    if (subtotal <= 0) subtotal = total

    if (total <= 0) { omitidas++; continue }

    facturas.push({
      id: facturaId,
      proveedor_nombre: prov,
      fecha_factura: fecha,
      tipo_factura: mapTipoFactura(tipoStr),
      numero_factura: numero,
      subtotal,
      iva_total: iva,
      total,
      condicion_pago: 'contado',
      status: 'pendiente',
      notas: null,
      restaurante_id: restauranteId,
    })

    items.push(...itemRows)
  }

  return { facturas, items, omitidas }
}

// ──────────────────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const tenant = await requireRestauranteId()
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const { restauranteId } = tenant

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const mode = (formData.get('mode') as string | null) || 'detect'

  if (!file) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buffer, { type: 'array' })
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el archivo. Debe ser XLSX o CSV.' }, { status: 400 })
  }

  // Función helper para inspeccionar cada hoja del archivo
  function inspeccionarHojas(): Array<{ name: string; filas: number; columnas: string[]; rol: string; usada: boolean }> {
    return wb.SheetNames.map(name => {
      const sh = wb.Sheets[name]
      if (!sh) return { name, filas: 0, columnas: [], rol: 'vacía', usada: false }

      const raw = XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, defval: '' }) as unknown[][]
      // Buscar headers
      const hIdx = raw.findIndex(r => {
        const cells = r as unknown[]
        return cells.filter(c => String(c).trim().length > 0).length >= 3
      })
      const cols = hIdx >= 0
        ? (raw[hIdx] as unknown[]).map(c => String(c ?? '').trim()).filter(Boolean).slice(0, 8)
        : []
      const filasData = hIdx >= 0 ? Math.max(0, raw.length - hIdx - 1) : 0

      // Inferir rol según nombre + columnas
      const n = norm(name)
      let rol = 'desconocida'
      let usada = false
      if (n.includes('gasto') || n.includes('compra') || n.includes('factura')) {
        rol = 'facturas (cabecera)'
        usada = true
      } else if (n.includes('detalle') || n.includes('item') || n.includes('producto')) {
        rol = 'items / detalle'
        usada = true
      } else if (n.includes('impuesto') || n.includes('percep')) {
        rol = 'impuestos / IVA'
        usada = true
      } else if (n.includes('pago') || n.includes('cobr')) {
        rol = 'pagos (ignorado)'
        usada = false
      }

      return { name, filas: filasData, columnas: cols, rol, usada }
    })
  }

  // ── Camino 1: Fudo ──────────────────────────────────────────────
  if (isFudoFormat(wb)) {
    const { facturas, items, omitidas } = parseFudo(wb, restauranteId)

    if (mode === 'detect') {
      return NextResponse.json({
        formato: 'fudo',
        hojas_analizadas: inspeccionarHojas(),
        total_facturas: facturas.length,
        total_items: items.length,
        omitidas,
        preview: facturas.slice(0, 5).map(f => ({
          proveedor: f.proveedor_nombre,
          fecha: f.fecha_factura,
          numero: f.numero_factura,
          total: f.total,
          items: items.filter(i => i.factura_id === f.id).length,
        })),
      })
    }

    return await insertBatch(facturas, items, omitidas)
  }

  // ── Camino 2: Genérico con IA ───────────────────────────────────
  // Inspecciono TODAS las hojas y elijo la mejor candidata para facturas
  type SheetCandidate = {
    name: string
    headerIdx: number
    headers: string[]
    dataRows: unknown[][]
    score: number
  }

  const candidates: SheetCandidate[] = []
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    if (!sheet || !sheet['!ref']) continue

    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]
    if (raw.length < 2) continue

    // Buscar la fila de headers
    const hIdx = raw.findIndex(r => {
      const cells = r as unknown[]
      const nonEmpty = cells.filter(c => String(c).trim().length > 0)
      return nonEmpty.length >= 3
    })
    if (hIdx < 0) continue

    const headers = (raw[hIdx] as unknown[]).map(c => String(c ?? '').trim())
    const dataRows = raw.slice(hIdx + 1).filter(r => (r as unknown[]).some(c => String(c).trim().length > 0))
    if (dataRows.length === 0) continue

    // Score: cuántas columnas matchean palabras clave de facturas
    const headerText = headers.map(norm).join(' ')
    let score = dataRows.length * 0.5 // base por cantidad de filas
    const keywords = [
      'proveedor', 'fecha', 'factura', 'importe', 'total', 'iva',
      'tipo', 'comprobante', 'precio', 'cantidad', 'producto',
      'detalle', 'descripcion', 'subtotal', 'monto',
    ]
    for (const kw of keywords) {
      if (headerText.includes(kw)) score += 10
    }
    // Penalizar hojas de pagos/impuestos/etc (no son facturas en sí)
    const sheetNorm = norm(sheetName)
    if (sheetNorm.includes('pago') || sheetNorm.includes('cobr')) score -= 20
    if (sheetNorm.includes('impuesto') || sheetNorm.includes('percep')) score -= 30
    // Bonus si el nombre de la hoja sugiere facturas/gastos/compras
    if (sheetNorm.includes('gasto') || sheetNorm.includes('compra') || sheetNorm.includes('factura') || sheetNorm.includes('proveedor')) score += 30

    candidates.push({ name: sheetName, headerIdx: hIdx, headers, dataRows, score })
  }

  if (candidates.length === 0) {
    return NextResponse.json({ error: 'No se detectaron hojas con datos válidos' }, { status: 400 })
  }

  // Elegir la mejor candidata
  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0]
  const headers = best.headers
  const dataRows = best.dataRows

  const mapeo = await inferirMapeo(headers, dataRows.slice(0, 8))

  if (mode === 'detect') {
    // Construir preview con el mapeo
    const { facturas, items, omitidas } = parseGenerico(dataRows, headers, mapeo, restauranteId)
    return NextResponse.json({
      formato: 'generico',
      hoja_seleccionada: best.name,
      hojas_analizadas: inspeccionarHojas().map(h => ({ ...h, usada: h.name === best.name })),
      mapeo,
      headers,
      sample_rows: dataRows.slice(0, 5),
      total_facturas: facturas.length,
      total_items: items.length,
      omitidas,
      preview: facturas.slice(0, 5).map(f => ({
        proveedor: f.proveedor_nombre,
        fecha: f.fecha_factura,
        numero: f.numero_factura,
        total: f.total,
        items: items.filter(i => i.factura_id === f.id).length,
      })),
    })
  }

  // mode='apply' con mapeo (puede venir editado por el user)
  const mapeoCustom = formData.get('mapeo') as string | null
  const finalMapeo: MapeoIA = mapeoCustom ? JSON.parse(mapeoCustom) : mapeo
  const { facturas, items, omitidas } = parseGenerico(dataRows, headers, finalMapeo, restauranteId)
  return await insertBatch(facturas, items, omitidas)
}

function normNombre(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function insertBatch(
  facturas: FacturaPayload[],
  items: ItemPayload[],
  omitidas: number,
): Promise<NextResponse> {
  if (facturas.length === 0) {
    return NextResponse.json({ error: 'No se detectaron facturas válidas', omitidas }, { status: 400 })
  }

  const admin = createAdminClient()
  const BATCH = 100

  // Filtro de privacidad: excluir facturas cuyo proveedor coincide con un nombre interno (empleado/socio)
  let facturasFinal = facturas
  let itemsFinal = items
  let excluidasPorNombre = 0
  try {
    const restId = facturas[0]?.restaurante_id
    if (restId) {
      const { data: rest } = await admin.from('restaurantes').select('configuracion').eq('id', restId).single()
      const cfg = rest?.configuracion as { nombres_excluidos?: string[] } | null
      const internos = (Array.isArray(cfg?.nombres_excluidos) ? cfg!.nombres_excluidos : []).map(normNombre).filter(Boolean)
      const idsExcluidos = new Set<string>()
      facturasFinal = facturas.filter(f => {
        const prov = normNombre(f.proveedor_nombre)
        // Prefijo "Empleado" (Fudo marca así sueldos/adelantos) o match con nombre interno
        const esEmpleado = prov.startsWith('empleado')
        const match = esEmpleado || internos.some(n => n && (prov.includes(n) || n.includes(prov)))
        if (match) { idsExcluidos.add(f.id); return false }
        return true
      })
      if (idsExcluidos.size > 0) {
        itemsFinal = items.filter(it => !idsExcluidos.has(it.factura_id))
        excluidasPorNombre = idsExcluidos.size
      }
    }
  } catch { /* sin config, seguimos */ }

  if (facturasFinal.length === 0) {
    return NextResponse.json({ importadas: 0, items: 0, omitidas, excluidas_privacidad: excluidasPorNombre })
  }

  for (let i = 0; i < facturasFinal.length; i += BATCH) {
    const { error } = await admin.from('facturas').insert(facturasFinal.slice(i, i + BATCH))
    if (error) return NextResponse.json({ error: `Error insertando facturas: ${error.message}` }, { status: 500 })
  }

  for (let i = 0; i < itemsFinal.length; i += BATCH) {
    const { error } = await admin.from('factura_items').insert(itemsFinal.slice(i, i + BATCH))
    if (error) return NextResponse.json({ error: `Error insertando items: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({
    importadas: facturasFinal.length,
    items: itemsFinal.length,
    omitidas,
    excluidas_privacidad: excluidasPorNombre,
  })
}
