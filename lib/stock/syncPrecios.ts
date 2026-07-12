import type { createAdminClient } from '@/lib/supabase/admin'
import { normalizeForStock, matchesWholeWord, sinTildes } from './precios'
import { fetchAllRows } from '@/lib/supabase/paginate'

// Sincroniza productos.precio_unitario con el precio de la última factura que los
// matchea. El importador universal inserta facturas+items pero nunca tocaba
// productos ni precio_historial — con el tiempo el precio de stock se desfasaba
// del real (confirmado: 79/152 productos matcheables en Bros con >5% de delta).
// Esta lógica SOLO toca precios — nunca stock_actual ni umbrales.
const DELTA_MINIMO_PCT = 2

type AdminClient = ReturnType<typeof createAdminClient>

export type ProductoRow = { id: string; nombre: string; unidad: string; precio_unitario: number | null }
export type FacturaItemRow = { producto_nombre: string; precio_unitario: number; unidad: string | null; factura_id: string }
export type Desfasado = {
  producto_id: string
  nombre: string
  unidad: string
  precio_actual: number
  precio_nuevo: number
  fecha: string | null
  factura_id: string
  delta_pct: number
}

function matchDesfasados(candidatos: ProductoRow[], items: FacturaItemRow[], facturaFecha: Map<string, string>): Desfasado[] {
  const resultado: Desfasado[] = []
  for (const p of candidatos) {
    const nombreProdSinTildes = sinTildes(p.nombre.toLowerCase())
    if (nombreProdSinTildes.length < 4) continue

    // De todos los ítems que matchean el producto, nos quedamos con el más reciente.
    let mejor: { item: FacturaItemRow; fecha: string } | null = null
    for (const it of items) {
      const itemSinTildes = sinTildes(it.producto_nombre.toLowerCase())
      if (!matchesWholeWord(itemSinTildes, nombreProdSinTildes)) continue
      const fecha = facturaFecha.get(it.factura_id) ?? ''
      if (!mejor || fecha > mejor.fecha) mejor = { item: it, fecha }
    }
    if (!mejor) continue

    const { unidad_stock, precio_stock } = normalizeForStock({
      cantidad: 1,
      unidad: mejor.item.unidad ?? p.unidad,
      precio_unitario: mejor.item.precio_unitario,
    })
    // Familias de unidad distintas (ej. factura en 'u', producto en 'kg') → no adivinar, excluir.
    if (unidad_stock.toLowerCase().trim() !== p.unidad.toLowerCase().trim()) continue

    const precioActual = p.precio_unitario ?? 0
    const deltaPct = precioActual > 0 ? ((precio_stock - precioActual) / precioActual) * 100 : 100
    if (Math.abs(deltaPct) < DELTA_MINIMO_PCT) continue

    resultado.push({
      producto_id: p.id,
      nombre: p.nombre,
      unidad: p.unidad,
      precio_actual: precioActual,
      precio_nuevo: Math.round(precio_stock * 100) / 100,
      fecha: mejor.fecha || null,
      factura_id: mejor.item.factura_id,
      delta_pct: Math.round(deltaPct * 10) / 10,
    })
  }
  resultado.sort((a, b) => Math.abs(b.delta_pct) - Math.abs(a.delta_pct))
  return resultado
}

async function fetchCandidatos(admin: AdminClient, restauranteId: string): Promise<ProductoRow[]> {
  const { data } = await admin
    .from('productos')
    .select('id, nombre, unidad, precio_unitario')
    .eq('restaurante_id', restauranteId)
    .eq('activo', true)
    .eq('es_produccion', false)
    .eq('fuera_de_uso', false)
  return (data ?? []) as ProductoRow[]
}

// Preview completo — recorre TODA la historia de facturas del restaurante. Puede
// tardar varios segundos en restaurantes con miles de facturas (Bros: ~12s con
// 2800). Pensado para uso manual desde /api/stock/sync-precios-facturas, no para
// engancharse a cada import.
export async function calcularDesfasadosCompleto(admin: AdminClient, restauranteId: string): Promise<Desfasado[]> {
  const candidatos = await fetchCandidatos(admin, restauranteId)
  if (candidatos.length === 0) return []

  const facturas = await fetchAllRows<{ id: string; fecha_factura: string | null; created_at: string }>((from, to) =>
    admin.from('facturas').select('id, fecha_factura, created_at').eq('restaurante_id', restauranteId).range(from, to)
  )
  const facturaFecha = new Map<string, string>()
  for (const f of facturas) facturaFecha.set(f.id, f.fecha_factura || String(f.created_at).slice(0, 10))
  const facturaIds = Array.from(facturaFecha.keys())
  if (facturaIds.length === 0) return []

  const items: FacturaItemRow[] = []
  for (let i = 0; i < facturaIds.length; i += 300) {
    const slice = facturaIds.slice(i, i + 300)
    const batch = await fetchAllRows<FacturaItemRow>((from, to) =>
      admin.from('factura_items')
        .select('producto_nombre, precio_unitario, unidad, factura_id')
        .in('factura_id', slice)
        .gt('precio_unitario', 0)
        .range(from, to)
    )
    items.push(...batch)
  }
  return matchDesfasados(candidatos, items, facturaFecha)
}

// Versión acotada — usada por el importador universal justo después de insertar
// facturas+items nuevos. Solo mira ESOS ítems (ya están en memoria, no relee
// factura_items) → rápido sin importar cuántas facturas históricas tenga el
// restaurante.
export async function calcularDesfasadosDeItemsNuevos(
  admin: AdminClient,
  restauranteId: string,
  itemsNuevos: FacturaItemRow[],
  facturaFecha: Map<string, string>,
): Promise<Desfasado[]> {
  const itemsConPrecio = itemsNuevos.filter(it => (it.precio_unitario ?? 0) > 0)
  if (itemsConPrecio.length === 0) return []
  const candidatos = await fetchCandidatos(admin, restauranteId)
  if (candidatos.length === 0) return []
  return matchDesfasados(candidatos, itemsConPrecio, facturaFecha)
}

// Aplica una lista de desfasados: actualiza precio del producto, registra
// precio_historial y propaga a ingredientes vinculados (por producto_id, ya
// scopeado al restaurante).
export async function aplicarDesfasados(
  admin: AdminClient,
  restauranteId: string,
  items: Array<{ producto_id: string; precio_nuevo: number; factura_id?: string | null }>,
): Promise<number> {
  if (items.length === 0) return 0
  const ids = items.map(i => i.producto_id)
  const { data: propios } = await admin
    .from('productos')
    .select('id, precio_unitario')
    .in('id', ids)
    .eq('restaurante_id', restauranteId)
  const propiosMap = new Map((propios ?? []).map(p => [p.id as string, p.precio_unitario as number | null]))

  let actualizados = 0
  for (const it of items) {
    const precioAnterior = propiosMap.get(it.producto_id)
    if (precioAnterior === undefined) continue // no pertenece a este restaurante — se ignora

    const { error: eUpdate } = await admin
      .from('productos')
      .update({ precio_unitario: it.precio_nuevo })
      .eq('id', it.producto_id)
    if (eUpdate) continue

    const ant = precioAnterior ?? 0
    const variacion = ant > 0 ? ((it.precio_nuevo - ant) / ant) * 100 : 0
    await admin.from('precio_historial').insert({
      producto_id: it.producto_id,
      precio_anterior: ant,
      precio_nuevo: it.precio_nuevo,
      variacion_porcentaje: Math.round(variacion * 10) / 10,
      factura_id: it.factura_id ?? null,
      restaurante_id: restauranteId,
    })
    await admin.from('ingredientes').update({ costo_unitario: it.precio_nuevo }).eq('producto_id', it.producto_id)
    actualizados++
  }
  return actualizados
}
