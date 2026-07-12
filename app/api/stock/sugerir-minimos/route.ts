import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRestauranteId } from '@/lib/api/tenant'
import { fetchAllRows } from '@/lib/supabase/paginate'

// Normaliza una cantidad a la familia de unidad del producto (peso→kg, volumen→l).
// Best-effort: si las familias no coinciden, devuelve la cantidad cruda.
function toStockQty(cantidad: number, unidadItem: string, unidadProd: string): number {
  const u = unidadItem.toLowerCase().trim()
  const p = unidadProd.toLowerCase().trim()
  const pesoProd = ['kg', 'g', 'gr'].includes(p)
  const volProd = ['l', 'lt', 'ml', 'cc'].includes(p)
  // a kg
  if (pesoProd) {
    if (['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(u)) return cantidad
    if (['g', 'gr', 'gramo', 'gramos'].includes(u)) return cantidad / 1000
  }
  // a l
  if (volProd) {
    if (['l', 'lt', 'lts', 'litro', 'litros'].includes(u)) return cantidad
    if (['ml', 'cc', 'cm3'].includes(u)) return cantidad / 1000
  }
  return cantidad
}

export async function POST() {
  const tenant = await requireRestauranteId()
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const { restauranteId } = tenant
  const admin = createAdminClient()

  // Productos candidatos: activos, sin umbral cargado, no producciones, no fuera de uso
  const { data: productos, error: prodErr } = await admin
    .from('productos')
    .select('id, nombre, unidad, stock_minimo, stock_critico, es_produccion, fuera_de_uso')
    .eq('restaurante_id', restauranteId)
    .eq('activo', true)
  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 })

  const candidatos = (productos ?? []).filter(
    p => !p.es_produccion && !p.fuera_de_uso && (p.stock_minimo ?? 0) === 0 && (p.stock_critico ?? 0) === 0
  )
  if (candidatos.length === 0) return NextResponse.json({ sugerencias: [] })

  // Facturas del restaurante (id → fecha) — paginado: PostgREST trunca a 1000
  // filas sin .range(), y un restaurante con mucho volumen (Bros: 2800) perdía
  // las facturas más recientes en un orden no garantizado.
  const facturas = await fetchAllRows<{ id: string; fecha_factura: string | null; created_at: string }>((from, to) =>
    admin.from('facturas').select('id, fecha_factura, created_at').eq('restaurante_id', restauranteId).range(from, to)
  )
  const facturaFecha = new Map<string, string>()
  for (const f of facturas) {
    facturaFecha.set(f.id, f.fecha_factura || String(f.created_at).slice(0, 10))
  }
  const facturaIds = Array.from(facturaFecha.keys())
  if (facturaIds.length === 0) return NextResponse.json({ sugerencias: [] })

  // Items de factura (en lotes de 300 ids, cada lote paginado)
  type FItem = { producto_id: string | null; producto_nombre: string; cantidad: number; unidad: string | null; factura_id: string }
  const items: FItem[] = []
  for (let i = 0; i < facturaIds.length; i += 300) {
    const slice = facturaIds.slice(i, i + 300)
    const batch = await fetchAllRows<FItem>((from, to) =>
      admin.from('factura_items')
        .select('producto_id, producto_nombre, cantidad, unidad, factura_id')
        .in('factura_id', slice)
        .range(from, to)
    )
    items.push(...batch)
  }

  // Agrupar compras por producto (por id, o por nombre normalizado)
  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
  const prodPorNombre = new Map<string, typeof candidatos[number]>()
  for (const p of candidatos) prodPorNombre.set(norm(p.nombre), p)
  const candIds = new Set(candidatos.map(p => p.id))

  // producto_id → { fechas:Set, cantidades:number[] , unidadProd }
  const acc = new Map<string, { fechas: Set<string>; cantidades: number[]; unidadProd: string }>()
  for (const it of items) {
    let prod = it.producto_id && candIds.has(it.producto_id)
      ? candidatos.find(p => p.id === it.producto_id)
      : prodPorNombre.get(norm(it.producto_nombre))
    if (!prod) continue
    const key = prod.id
    const g = acc.get(key) ?? { fechas: new Set<string>(), cantidades: [] as number[], unidadProd: prod.unidad }
    const fecha = facturaFecha.get(it.factura_id) ?? ''
    if (fecha) g.fechas.add(fecha)
    const q = toStockQty(Number(it.cantidad) || 0, it.unidad ?? prod.unidad, prod.unidad)
    if (q > 0) g.cantidades.push(q)
    acc.set(key, g)
  }

  const sugerencias = candidatos.map(p => {
    const g = acc.get(p.id)
    if (!g || g.cantidades.length === 0 || g.fechas.size < 2) return null
    const total = g.cantidades.reduce((s, x) => s + x, 0)
    const promedioPorEntrega = total / g.fechas.size
    if (promedioPorEntrega <= 0) return null
    const round = (n: number) => Math.round(n * 100) / 100
    return {
      id: p.id,
      nombre: p.nombre,
      unidad: p.unidad,
      entregas: g.fechas.size,
      sugerido_minimo: round(promedioPorEntrega),
      sugerido_critico: round(promedioPorEntrega / 2),
    }
  }).filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.entregas - a.entregas)

  return NextResponse.json({ sugerencias })
}
