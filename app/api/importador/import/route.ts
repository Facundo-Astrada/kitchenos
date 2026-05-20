import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type MappedRow = Record<string, unknown>

function normalizarUnidad(u: string): string {
  const raw = String(u || '').trim().toLowerCase()
  if (!raw) return 'unidad'
  if (/^k(ilo?g?(ramo?s?)?|gs?|ilos?)$/.test(raw)) return 'kg'
  if (/^g(r(amo?s?)?|rs?)?$/.test(raw)) return 'g'
  if (/^l(it(ro?s?)?|ts?)?$/.test(raw)) return 'l'
  if (/^(m(ili?li?t(ro?s?)?|ls?)|cc|cm3)$/.test(raw)) return 'ml'
  if (/^(u(n(id(ad(es)?|\.)?)?|d(s|\.)?)?|piez?a?s?|pcs?|pza?s?)$/.test(raw)) return 'unidad'
  if (['kg', 'g', 'l', 'ml', 'unidad'].includes(raw)) return raw
  return 'unidad'
}

// Detecta si un texto es una unidad de medida conocida
function esTextoUnidad(s: string): boolean {
  return /^(kg|kgs?|kilo[s]?|kilogramo[s]?|g|gr|grs?|gramo[s]?|l|lt|lts?|litro[s]?|ml|mls?|mililitro[s]?|cc|cm3|u|un|und|unid|unidades?|pieza[s]?|pcs?|pza[s]?)$/i.test(s.trim())
}

// Extrae la unidad del patrón "Nombre del producto (litros)" → { nombre: "Nombre del producto", unidad: "l" }
function extraerUnidadDeNombre(nombre: string): { nombre: string; unidad: string | null } {
  const match = nombre.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  if (!match) return { nombre, unidad: null }
  const candidato = match[2].trim()
  if (!esTextoUnidad(candidato)) return { nombre, unidad: null }
  return { nombre: match[1].trim(), unidad: normalizarUnidad(candidato) }
}

function parseNum(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  return parseFloat(String(v || '0').replace(',', '.')) || 0
}

function parseActivo(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  const s = String(v ?? '').toLowerCase().trim()
  if (s === 'no' || s === 'false' || s === '0' || s === 'inactivo') return false
  return true
}

export async function POST(req: NextRequest) {
  // Auth check with anon client
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { tipo, restauranteId, rows, importInactivos, importConfig } = await req.json() as {
    tipo: 'stock' | 'proveedores'
    restauranteId: string
    rows: MappedRow[]
    importInactivos?: boolean
    importConfig?: { proveedorNombre?: string }
  }

  const admin = createAdminClient()

  if (tipo === 'stock') {
    return importarStock(admin, restauranteId, rows, importConfig)
  } else {
    return importarProveedores(admin, restauranteId, rows, importInactivos ?? false)
  }
}

async function importarStock(admin: ReturnType<typeof createAdminClient>, restauranteId: string, rows: MappedRow[], importConfig?: { proveedorNombre?: string }) {
  // Fetch existing products
  const { data: existentes } = await admin
    .from('productos')
    .select('id, nombre')
    .eq('restaurante_id', restauranteId)

  const existMap = new Map<string, string>()
  for (const p of existentes ?? []) {
    existMap.set(String(p.nombre).toLowerCase().trim(), p.id as string)
  }

  // Collect categories
  const categoriasSet = new Set<string>()
  const toInsert: Record<string, unknown>[] = []
  const toUpdate: { id: string; data: Record<string, unknown> }[] = []
  let omitidos = 0
  let lastCategoria = 'Sin categoría'
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  for (const row of rows) {
    const nombreRaw = String(row.nombre ?? '').trim()
    if (!nombreRaw) { omitidos++; continue }

    // Filtrar filas de sub-encabezado internas.
    // Patter A: stock_actual tiene texto alfabético → "Bustos beltran | Stock actual | ..."
    // Patrón B: stock_actual vacío pero stock_minimo tiene texto → "Magnum | | Stock Minimo | ..."
    const stockActualRaw = String(row.stock_actual ?? '').trim()
    const stockMinimoRaw = String(row.stock_minimo ?? '').trim()
    const esSubEncabezado =
      (stockActualRaw.length > 0 && /[a-záéíóú]/i.test(stockActualRaw)) ||
      (stockActualRaw.length === 0 && stockMinimoRaw.length > 0 && /[a-záéíóú]/i.test(stockMinimoRaw))
    if (esSubEncabezado) { omitidos++; continue }

    // Forward-fill: si la categoría está vacía, usar la última no vacía
    const catRaw = String(row.categoria ?? '').trim()
    if (catRaw && catRaw !== 'Sin categoría') lastCategoria = catRaw
    const cat = lastCategoria

    // Extraer unidad del patrón "Nombre (litros)" si no hay columna unidad mapeada
    const unidadRaw = String(row.unidad ?? '').trim()
    let nombre = nombreRaw
    let unidadFinal: string
    if (!unidadRaw) {
      const extraido = extraerUnidadDeNombre(nombreRaw)
      nombre = extraido.nombre
      unidadFinal = extraido.unidad ?? 'unidad'
    } else {
      unidadFinal = normalizarUnidad(unidadRaw)
    }

    categoriasSet.add(cat)
    const proveedorId = row.proveedor_id && UUID_REGEX.test(String(row.proveedor_id)) ? String(row.proveedor_id) : null
    const producto = {
      nombre,
      categoria: cat,
      unidad: unidadFinal,
      stock_actual: parseNum(row.stock_actual),
      stock_minimo: parseNum(row.stock_minimo),
      stock_critico: 0,
      precio_unitario: parseNum(row.precio_unitario),
      ...(proveedorId ? { proveedor_id: proveedorId } : {}),
      activo: true,
      restaurante_id: restauranteId,
    }
    const existing = existMap.get(nombre.toLowerCase())
    if (existing) {
      toUpdate.push({ id: existing, data: producto })
    } else {
      toInsert.push(producto)
    }
  }

  // Upsert categorías nuevas
  const { data: catExistentes } = await admin
    .from('categorias_producto')
    .select('nombre')
    .eq('restaurante_id', restauranteId)
  const catExistSet = new Set((catExistentes ?? []).map((c: { nombre: string }) => c.nombre.toLowerCase()))
  const catNuevas = Array.from(categoriasSet).filter(c => !catExistSet.has(c.toLowerCase()))
  if (catNuevas.length > 0) {
    await admin.from('categorias_producto').insert(
      catNuevas.map(c => ({ nombre: c, restaurante_id: restauranteId }))
    )
  }

  // Batch INSERT new — collect returned IDs for undo
  const BATCH = 100
  const insertadosIds: string[] = []
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const { data: inserted, error } = await admin
      .from('productos').insert(toInsert.slice(i, i + BATCH)).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const r of inserted ?? []) insertadosIds.push(r.id as string)
  }

  // Batch UPDATE existing (by id)
  for (const { id, data } of toUpdate) {
    await admin.from('productos').update(data).eq('id', id)
  }

  return NextResponse.json({
    importados: toInsert.length + toUpdate.length,
    insertados: toInsert.length,
    actualizados: toUpdate.length,
    omitidos,
    categorias: catNuevas.length,
    insertadosIds,
  })
}

async function importarProveedores(
  admin: ReturnType<typeof createAdminClient>,
  restauranteId: string,
  rows: MappedRow[],
  importInactivos: boolean
) {
  const { data: existentes } = await admin
    .from('proveedores')
    .select('id, nombre')
    .eq('restaurante_id', restauranteId)

  const existMap = new Map<string, string>()
  for (const p of existentes ?? []) {
    existMap.set(String(p.nombre).toLowerCase().trim(), p.id as string)
  }

  const toInsert: Record<string, unknown>[] = []
  let omitidos = 0
  let inactivosOmitidos = 0

  for (const row of rows) {
    const nombre = String(row.nombre ?? '').trim()
    if (!nombre) { omitidos++; continue }
    const activo = row.activo !== undefined ? parseActivo(row.activo) : true
    if (!activo && !importInactivos) { inactivosOmitidos++; continue }
    if (existMap.has(nombre.toLowerCase())) continue  // ya existe, no sobreescribir
    toInsert.push({
      nombre,
      rubro: String(row.rubro ?? '').trim() || '',
      telefono: String(row.telefono ?? '').trim() || '',
      dias_entrega: [],
      activo,
      restaurante_id: restauranteId,
    })
  }

  const BATCH = 100
  const insertadosIds: string[] = []
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const { data: inserted, error } = await admin
      .from('proveedores').insert(toInsert.slice(i, i + BATCH)).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const r of inserted ?? []) insertadosIds.push(r.id as string)
  }

  return NextResponse.json({
    importados: toInsert.length,
    insertados: toInsert.length,
    actualizados: 0,
    omitidos: omitidos + inactivosOmitidos,
    inactivosOmitidos,
    categorias: 0,
    insertadosIds,
  })
}
