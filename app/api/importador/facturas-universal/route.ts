import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRestauranteId } from '@/lib/api/tenant'
import * as XLSX from 'xlsx'
import { randomUUID } from 'crypto'
import { calcularDesfasadosDeItemsNuevos, aplicarDesfasados, registrarPendientes, UMBRAL_REVISION_PCT } from '@/lib/stock/syncPrecios'
import { sugerenciaSegura } from '@/lib/facturas/sugerirProducto'
import { pedirAClaude } from '@/lib/ia/claude'
import { fetchAllRows } from '@/lib/supabase/paginate'
import {
  norm, excelDateToISO, parseNum, mapTipoFactura, mapUnidad, isFudoFormat, parseFudo,
  type FacturaPayload, type ItemPayload, type PagoPayload, type PagosPorFactura,
} from '@/lib/importador/fudo'

// Un export grande de Fudo (miles de facturas + pagos + ítems) no entra en 60s.
export const maxDuration = 300

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

async function inferirMapeo(headers: string[], sampleRows: unknown[][], restauranteId: string): Promise<MapeoIA> {
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

  // Degrada a "sin enriquecer" a propósito (el import sigue con lo que
  // parseó solo) — el motivo queda en el log de pedirAClaude, si no una caída
  // de la IA se ve igual que una factura que no tenía nada que sumar.
  const resultado = await pedirAClaude({
    tag: 'importador/facturas-universal',
    model: 'claude-sonnet-4-6',
    maxTokens: 800,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
    restauranteId,
  })
  if (!resultado.ok) return {}

  try {
    const match = resultado.texto.match(/\{[\s\S]*\}/)
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

  // Si el usuario ya vio el detect y corrigió la hoja auto-elegida, esta
  // llega tanto en el detect re-disparado como en el apply final — sin esto,
  // apply recalculaba el score desde cero e ignoraba la corrección.
  const hojaForzada = (formData.get('hoja') as string | null) || null

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
        rol = 'pagos (fecha y medio)'
        usada = true
      }

      return { name, filas: filasData, columnas: cols, rol, usada }
    })
  }

  // ── Camino 1: Fudo ──────────────────────────────────────────────
  if (isFudoFormat(wb)) {
    const { facturas, items, omitidas, pagos } = parseFudo(wb, restauranteId)

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

    return await insertBatch(facturas, items, omitidas, pagos)
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

  // Elegir la mejor candidata — o la que el usuario forzó manualmente
  candidates.sort((a, b) => b.score - a.score)
  const best = hojaForzada ? candidates.find(c => c.name === hojaForzada) : candidates[0]
  if (!best) {
    return NextResponse.json({
      error: hojaForzada
        ? `La hoja "${hojaForzada}" no tiene columnas ni filas de datos reconocibles.`
        : 'No se detectaron hojas con datos válidos',
    }, { status: 400 })
  }
  const headers = best.headers
  const dataRows = best.dataRows

  const mapeo = await inferirMapeo(headers, dataRows.slice(0, 8), restauranteId)

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

type CambioPrecio = { producto: string; unidad: string; precio_anterior: number; precio_nuevo: number; delta_pct: number; pendiente?: boolean; origen?: string }
type SinVincular = { nombre: string; veces: number; gasto: number; ultimo_precio: number; unidad: string }

async function insertBatch(
  facturas: FacturaPayload[],
  items: ItemPayload[],
  omitidas: number,
  pagos: PagosPorFactura = new Map(),
): Promise<NextResponse> {
  if (facturas.length === 0) {
    return NextResponse.json({ error: 'No se detectaron facturas válidas', omitidas }, { status: 400 })
  }

  const admin = createAdminClient()
  const BATCH = 100
  const restId = facturas[0].restaurante_id

  // Filtro de privacidad: excluir facturas cuyo proveedor coincide con un nombre interno (empleado/socio)
  let facturasFinal = facturas
  let itemsFinal = items
  let excluidasPorNombre = 0
  // Equivalencias "categoría de Fudo" → categoría de gasto (Compras → Cat. de Gastos).
  let categoriaPorOrigen = new Map<string, string>()
  try {
    const { data: rest } = await admin.from('restaurantes').select('configuracion').eq('id', restId).single()
    const cfg = rest?.configuracion as { nombres_excluidos?: string[]; categorias_origen?: Record<string, string> } | null
    categoriaPorOrigen = new Map(Object.entries(cfg?.categorias_origen ?? {}))
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
  } catch { /* sin config, seguimos */ }

  if (facturasFinal.length === 0) {
    return NextResponse.json({ importadas: 0, items: 0, omitidas, excluidas_privacidad: excluidasPorNombre })
  }

  // Categoría por defecto del proveedor (asignada antes, individual o por
  // lote en Categorías de Gasto) — sin esto, cada import nuevo entraba
  // sin categorizar aunque el proveedor ya se hubiera categorizado una vez.
  try {
    const { data: provsData } = await admin.from('proveedores')
      .select('nombre, categoria_gasto_id')
      .eq('restaurante_id', restId)
      .not('categoria_gasto_id', 'is', null)
    const categoriaPorProveedor = new Map(
      ((provsData ?? []) as { nombre: string; categoria_gasto_id: string }[])
        .map(p => [normNombre(p.nombre), p.categoria_gasto_id])
    )
    for (const f of facturasFinal) {
      if (f.categoria_gasto_id) continue
      const cat = categoriaPorProveedor.get(normNombre(f.proveedor_nombre))
        ?? (f.categoria_origen ? categoriaPorOrigen.get(normNombre(f.categoria_origen)) : undefined)
      if (cat) f.categoria_gasto_id = cat
    }
  } catch (e) {
    console.error('[facturas-universal] lookup de categoría por proveedor falló (no bloqueante):', e)
  }

  // Medio de pago: el del último pago de Fudo ("Transferencia bbva") se enlaza
  // con medios_pago por nombre, si existe uno igual.
  try {
    const { data: mediosData } = await admin.from('medios_pago').select('id, nombre').eq('restaurante_id', restId).eq('activo', true)
    const medioPorNombre = new Map(((mediosData ?? []) as { id: string; nombre: string }[]).map(m => [normNombre(m.nombre), m.id]))
    for (const f of facturasFinal) {
      const ps = pagos.get(f.id)
      const ultimo = ps?.[ps.length - 1]?.medio_pago
      if (ultimo) f.medio_pago_id = medioPorNombre.get(normNombre(ultimo)) ?? null
    }
  } catch (e) {
    console.error('[facturas-universal] enlace de medio de pago falló (no bloqueante):', e)
  }

  // Dedupe: una factura que ya está cargada (mismo external_id, o —para las
  // anteriores a external_id— mismo proveedor+fecha+total+nro) se ACTUALIZA
  // (estado de pago, vencimiento, percepciones, pagos) en vez de insertarse
  // otra vez.
  let actualizadas = 0
  let sinCambios = 0
  const fechaDeExistentes = new Map<string, string>()
  const pagosAReemplazar: Array<{ facturaId: string; pagos: PagoPayload[] }> = []
  try {
    type Existente = { id: string; categoria_gasto_id: string | null; external_id: string | null; proveedor_nombre: string; fecha_factura: string | null; total: number; numero_factura: string | null; status: string; fecha_vencimiento: string | null; sector: string | null; percepcion_iibb: number | null }
    const existentes: Existente[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from('facturas')
        .select('id, categoria_gasto_id, external_id, proveedor_nombre, fecha_factura, total, numero_factura, status, fecha_vencimiento, sector, percepcion_iibb')
        .eq('restaurante_id', restId).range(from, from + 999)
      if (error) throw error
      existentes.push(...((data ?? []) as Existente[]))
      if (!data || data.length < 1000) break
    }
    const clave = (f: { proveedor_nombre: string; fecha_factura: string | null; total: number; numero_factura: string | null }) =>
      `${normNombre(f.proveedor_nombre)}|${f.fecha_factura ?? ''}|${Math.round(Number(f.total))}|${f.numero_factura ?? ''}`
    const porExterno = new Map(existentes.filter(e => e.external_id).map(e => [e.external_id as string, e]))
    const porClave = new Map<string, Existente>()
    for (const e of existentes) if (!e.external_id) porClave.set(clave(e), e)

    const nuevas: FacturaPayload[] = []
    const idsYaExistentes = new Map<string, string>() // id nuevo (del archivo) -> id existente en la base
    const updatesPend: Array<{ id: string; cambios: Record<string, unknown> }> = []
    for (const f of facturasFinal) {
      const ex = (f.external_id && porExterno.get(f.external_id)) || porClave.get(clave(f))
      if (!ex) { nuevas.push(f); continue }
      idsYaExistentes.set(f.id, ex.id)
      fechaDeExistentes.set(ex.id, ex.fecha_factura ?? '')
      porClave.delete(clave(ex))
      const ps = pagos.get(f.id)
      if (ps?.length) pagosAReemplazar.push({ facturaId: ex.id, pagos: ps })
      const cambios: Record<string, unknown> = {}
      if (f.external_id && !ex.external_id) { cambios.external_id = f.external_id; cambios.external_source = f.external_source }
      if (f.status !== ex.status) { cambios.status = f.status; cambios.condicion_pago = f.condicion_pago }
      if (f.fecha_vencimiento && f.fecha_vencimiento !== ex.fecha_vencimiento) cambios.fecha_vencimiento = f.fecha_vencimiento
      if (f.proveedor_cuit) cambios.proveedor_cuit = f.proveedor_cuit
      if (f.sector && f.sector !== ex.sector) cambios.sector = f.sector
      if ((f.percepcion_iibb ?? 0) !== Number(ex.percepcion_iibb ?? 0)) {
        cambios.percepcion_iibb = f.percepcion_iibb
        cambios.percepcion_ganancias = f.percepcion_ganancias
        cambios.otras_percepciones = f.otras_percepciones
      }
      if (f.creado_por) cambios.creado_por = f.creado_por
      if (f.categoria_origen) cambios.categoria_origen = f.categoria_origen
      if (!ex.categoria_gasto_id && f.categoria_gasto_id) cambios.categoria_gasto_id = f.categoria_gasto_id
      if (f.medio_pago_id) cambios.medio_pago_id = f.medio_pago_id
      if (Object.keys(cambios).length === 0) { sinCambios++; continue }
      updatesPend.push({ id: ex.id, cambios })
    }
    // Updates de a 25 en paralelo: de a uno, miles de facturas no entran en el límite de la función.
    for (let i = 0; i < updatesPend.length; i += 25) {
      const res = await Promise.all(updatesPend.slice(i, i + 25).map(u =>
        admin.from('facturas').update(u.cambios).eq('id', u.id).eq('restaurante_id', restId)))
      actualizadas += res.filter(r => !r.error).length
    }
    facturasFinal = nuevas

    // Reparación: una factura que ya existe pero quedó SIN ítems (import anterior cortado
    // a mitad) recupera los del archivo. Sin esto, re-importar nunca los completaría.
    const conItemsEnArchivo = new Set(itemsFinal.map(it => it.factura_id))
    const candidatas = Array.from(idsYaExistentes.entries()).filter(([nuevoId]) => conItemsEnArchivo.has(nuevoId))
    const sinItems = new Map<string, string>()
    if (candidatas.length > 0) {
      const tienen = new Set<string>()
      const exIds = candidatas.map(([, ex]) => ex)
      for (let i = 0; i < exIds.length; i += 150) {
        const lote = exIds.slice(i, i + 150)
        const filas = await fetchAllRows<{ factura_id: string }>((from, to) =>
          admin.from('factura_items').select('factura_id').in('factura_id', lote).range(from, to))
        for (const r of filas) tienen.add(r.factura_id)
      }
      for (const [nuevoId, exId] of candidatas) if (!tienen.has(exId)) sinItems.set(nuevoId, exId)
    }
    const repuestos = itemsFinal.filter(it => sinItems.has(it.factura_id)).map(it => ({ ...it, factura_id: sinItems.get(it.factura_id)! }))
    itemsFinal = [...itemsFinal.filter(it => !idsYaExistentes.has(it.factura_id)), ...repuestos]
  } catch (e) {
    console.error('[facturas-universal] dedupe falló, se aborta el import para no duplicar:', e)
    return NextResponse.json({ error: 'No se pudo comprobar qué facturas ya estaban cargadas. No se importó nada para no duplicar.' }, { status: 500 })
  }

  for (let i = 0; i < facturasFinal.length; i += BATCH) {
    const { error } = await admin.from('facturas').insert(facturasFinal.slice(i, i + BATCH))
    if (error) return NextResponse.json({ error: `Error insertando facturas: ${error.message}` }, { status: 500 })
  }

  // Resolver producto_id contra lo que ya existe en stock — mismo criterio de
  // matching que useFacturas.crearFactura (lib/facturas/matching.ts), más los
  // vínculos que el usuario ya confirmó a mano (producto_alias). Un import
  // masivo/histórico NO crea productos por cada ítem sin match (eso sí lo hace
  // el alta manual de una factura).
  const sinVincularMap = new Map<string, SinVincular>()
  if (itemsFinal.length > 0) {
    const { data: productosData } = await admin.from('productos').select('id, nombre').eq('restaurante_id', restId).eq('activo', true).eq('es_produccion', false)
    const productos = (productosData ?? []) as { id: string; nombre: string }[]
    const { data: aliasData } = await admin.from('producto_alias').select('alias_norm, producto_id').eq('restaurante_id', restId)
    const alias = new Map(((aliasData ?? []) as { alias_norm: string; producto_id: string }[]).map(a => [a.alias_norm, a.producto_id]))
    for (const item of itemsFinal) {
      item.producto_id = alias.get(normNombre(item.producto_nombre))
        ?? (productos.length > 0 ? sugerenciaSegura(item.producto_nombre, productos)?.id : null)
        ?? null
      if (!item.producto_id && item.precio_unitario > 0) {
        const k = normNombre(item.producto_nombre)
        const prev = sinVincularMap.get(k)
        sinVincularMap.set(k, {
          nombre: prev?.nombre ?? item.producto_nombre,
          veces: (prev?.veces ?? 0) + 1,
          gasto: (prev?.gasto ?? 0) + (item.subtotal || 0),
          ultimo_precio: item.precio_unitario,
          unidad: item.unidad,
        })
      }
    }
  }

  // Fecha de la compra más reciente ya cargada de cada producto, ANTES de insertar
  // estos ítems: un export amplio puede traer facturas viejas que todavía no
  // estaban, y no deben pisar un precio que viene de una compra posterior.
  const ultimaCompra = new Map<string, string>()
  try {
    const pids = Array.from(new Set(itemsFinal.map(i => i.producto_id).filter((x): x is string => !!x)))
    for (let i = 0; i < pids.length; i += 100) {
      const filas = await fetchAllRows<{ producto_id: string; facturas: { fecha_factura: string | null } | { fecha_factura: string | null }[] }>((from, to) =>
        admin.from('factura_items').select('producto_id, facturas!inner(fecha_factura)').in('producto_id', pids.slice(i, i + 100)).range(from, to) as unknown as PromiseLike<{ data: { producto_id: string; facturas: { fecha_factura: string | null } | { fecha_factura: string | null }[] }[] | null; error: { message: string } | null }>
      )
      for (const r of filas) {
        const f = Array.isArray(r.facturas) ? r.facturas[0] : r.facturas
        const fecha = f?.fecha_factura ?? ''
        if (fecha > (ultimaCompra.get(r.producto_id) ?? '')) ultimaCompra.set(r.producto_id, fecha)
      }
    }
  } catch (e) {
    console.error('[facturas-universal] última compra por producto falló (no bloqueante):', e)
  }

  for (let i = 0; i < itemsFinal.length; i += BATCH) {
    const { error } = await admin.from('factura_items').insert(itemsFinal.slice(i, i + BATCH))
    if (error) return NextResponse.json({ error: `Error insertando items: ${error.message}` }, { status: 500 })
  }

  // Pagos: de las facturas nuevas se insertan; de las que ya existían se
  // reemplazan por los del archivo (Fudo es la fuente: un pago editado o
  // cancelado allá se refleja acá).
  try {
    const filas: Array<Record<string, unknown>> = []
    for (const f of facturasFinal) {
      for (const pg of pagos.get(f.id) ?? []) filas.push({ ...pg, factura_id: f.id, restaurante_id: restId })
    }
    if (pagosAReemplazar.length > 0) {
      const ids = pagosAReemplazar.map(x => x.facturaId)
      for (let i = 0; i < ids.length; i += 200) {
        await admin.from('factura_pagos').delete().eq('restaurante_id', restId).in('factura_id', ids.slice(i, i + 200))
      }
      for (const x of pagosAReemplazar) for (const pg of x.pagos) filas.push({ ...pg, factura_id: x.facturaId, restaurante_id: restId })
    }
    for (let i = 0; i < filas.length; i += BATCH) {
      const { error } = await admin.from('factura_pagos').insert(filas.slice(i, i + BATCH))
      if (error) console.error('[facturas-universal] insert de pagos falló (no bloqueante):', error.message)
    }
  } catch (e) {
    console.error('[facturas-universal] pagos falló (no bloqueante):', e)
  }

  // Sync de precios best-effort — solo sobre los ítems recién insertados (no relee
  // la historia completa de facturas, así que es rápido sin importar el volumen del
  // restaurante). Un fallo acá nunca debe romper la respuesta del import.
  const cambiosPrecio: CambioPrecio[] = []
  try {
    const facturaFecha = new Map<string, string>()
    const hoy = new Date().toISOString().slice(0, 10)
    for (const f of facturasFinal) facturaFecha.set(f.id, f.fecha_factura || hoy)
    for (const [exId, fecha] of fechaDeExistentes) facturaFecha.set(exId, fecha)
    const desfasados = (await calcularDesfasadosDeItemsNuevos(admin, restId, itemsFinal, facturaFecha))
      .filter(d => !!d.fecha && d.fecha >= (ultimaCompra.get(d.producto_id) ?? ''))
    const aRevisar = desfasados.filter(d => d.precio_actual > 0 && Math.abs(d.delta_pct) > UMBRAL_REVISION_PCT)
    const aAplicar = desfasados.filter(d => !aRevisar.includes(d))
    if (aAplicar.length > 0) {
      await aplicarDesfasados(admin, restId, aAplicar.map(d => ({ producto_id: d.producto_id, precio_nuevo: d.precio_nuevo, factura_id: d.factura_id, origen: d.origen })))
    }
    await registrarPendientes(admin, restId, aRevisar)
    for (const d of aRevisar) cambiosPrecio.push({ producto: d.nombre, unidad: d.unidad, precio_anterior: d.precio_actual, precio_nuevo: d.precio_nuevo, delta_pct: d.delta_pct, pendiente: true, origen: d.origen })
    for (const d of aAplicar) cambiosPrecio.push({ producto: d.nombre, unidad: d.unidad, precio_anterior: d.precio_actual, precio_nuevo: d.precio_nuevo, delta_pct: d.delta_pct, origen: d.origen })
  } catch (e) {
    console.error('[facturas-universal] sync de precios post-import falló (no bloqueante):', e)
  }

  return NextResponse.json({
    importadas: facturasFinal.length,
    actualizadas,
    sin_cambios: sinCambios,
    items: itemsFinal.length,
    omitidas,
    excluidas_privacidad: excluidasPorNombre,
    cambios_precio: cambiosPrecio.slice(0, 50),
    total_cambios_precio: cambiosPrecio.length,
    sin_vincular: Array.from(sinVincularMap.values()).sort((a, b) => b.gasto - a.gasto).slice(0, 30),
    total_sin_vincular: sinVincularMap.size,
  })
}
