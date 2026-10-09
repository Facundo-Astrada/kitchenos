import type { createAdminClient } from '@/lib/supabase/admin'
import { aUnidadDelProducto, matchesWholeWord, sinTildes } from './precios'
import { fetchAllRows } from '@/lib/supabase/paginate'

// Sincroniza productos.precio_unitario con el precio de la última factura que los
// matchea. El importador universal inserta facturas+items pero nunca tocaba
// productos ni precio_historial — con el tiempo el precio de stock se desfasaba
// del real (confirmado: 79/152 productos matcheables en Bros con >5% de delta).
// Esta lógica SOLO toca precios — nunca stock_actual ni umbrales.
const DELTA_MINIMO_PCT = 2
// Un salto mayor a esto no se aplica solo: queda "pendiente" en precio_historial
// hasta que alguien lo confirma (pestaña Precios de Compras). Casi siempre es
// una unidad mal leída o un producto mal vinculado, no inflación.
export const UMBRAL_REVISION_PCT = 50

type AdminClient = ReturnType<typeof createAdminClient>

export type ProductoRow = { id: string; nombre: string; unidad: string; precio_unitario: number | null; peso_por_unidad_g?: number | null; unidad_compra?: string | null; cantidad_por_envase?: number | null }
export type FacturaItemRow = { producto_nombre: string; precio_unitario: number; unidad: string | null; factura_id: string; producto_id?: string | null; cantidad?: number }
export type Desfasado = {
  producto_id: string
  nombre: string
  unidad: string
  precio_actual: number
  precio_nuevo: number
  fecha: string | null
  factura_id: string
  delta_pct: number
  /** Línea de factura que produjo el precio, para poder revisarlo. */
  origen: string
}

// soloVinculados: el ítem cuenta solo para SU producto_id (el vínculo que ya
// resolvió el import, alias incluido). Sin eso, el match por nombre de acá iba
// por su cuenta y le asignaba a "Vinagre de alcohol" el precio de otra línea.
function matchDesfasados(candidatos: ProductoRow[], items: FacturaItemRow[], facturaFecha: Map<string, string>, soloVinculados = false): Desfasado[] {
  const resultado: Desfasado[] = []
  for (const p of candidatos) {
    const nombreProdSinTildes = sinTildes(p.nombre.toLowerCase())
    if (!soloVinculados && nombreProdSinTildes.length < 4) continue

    // De todos los ítems que matchean el producto, nos quedamos con el más reciente.
    let mejor: { item: FacturaItemRow; fecha: string } | null = null
    for (const it of items) {
      if (soloVinculados) {
        if (it.producto_id !== p.id) continue
      } else {
        const itemSinTildes = sinTildes(it.producto_nombre.toLowerCase())
        if (!matchesWholeWord(itemSinTildes, nombreProdSinTildes)) continue
      }
      const fecha = facturaFecha.get(it.factura_id) ?? ''
      if (!mejor || fecha > mejor.fecha) mejor = { item: it, fecha }
    }
    if (!mejor) continue

    // Precio de la factura llevado a la unidad del producto (factura en kg,
    // producto en g → $/g). No convertible (ej. 'u' contra kg sin peso por
    // unidad) → no adivinar, excluir.
    const conv = aUnidadDelProducto({
      cantidad: 1,
      unidad: mejor.item.unidad ?? p.unidad,
      precio_unitario: mejor.item.precio_unitario,
    }, p)
    if (!conv) continue
    const precio_stock = conv.precio

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
      origen: `${mejor.item.producto_nombre}${mejor.item.cantidad ? ` · ${mejor.item.cantidad} ${mejor.item.unidad ?? ''}` : ''}`.trim(),
    })
  }
  resultado.sort((a, b) => Math.abs(b.delta_pct) - Math.abs(a.delta_pct))
  return resultado
}

async function fetchCandidatos(admin: AdminClient, restauranteId: string): Promise<ProductoRow[]> {
  const { data } = await admin
    .from('productos')
    .select('id, nombre, unidad, precio_unitario, peso_por_unidad_g, unidad_compra, cantidad_por_envase')
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
  return matchDesfasados(candidatos, itemsConPrecio, facturaFecha, true)
}

// Aplica una lista de desfasados: actualiza precio del producto, registra
// precio_historial y propaga a ingredientes vinculados (por producto_id, ya
// scopeado al restaurante).
export async function aplicarDesfasados(
  admin: AdminClient,
  restauranteId: string,
  items: Array<{ producto_id: string; precio_nuevo: number; factura_id?: string | null; origen?: string | null }>,
): Promise<number> {
  if (items.length === 0) return 0
  const ids = items.map(i => i.producto_id)
  const { data: propios } = await admin
    .from('productos')
    .select('id, precio_unitario')
    .in('id', ids)
    .eq('restaurante_id', restauranteId)
  const propiosMap = new Map((propios ?? []).map(p => [p.id as string, p.precio_unitario as number | null]))

  // De a 10 en paralelo: cada producto son 3 escrituras, y un import grande mueve cientos.
  const aplicar = async (it: (typeof items)[number]): Promise<boolean> => {
    const precioAnterior = propiosMap.get(it.producto_id)
    if (precioAnterior === undefined) return false // no pertenece a este restaurante — se ignora

    const { error: eUpdate } = await admin
      .from('productos')
      .update({ precio_unitario: it.precio_nuevo })
      .eq('id', it.producto_id)
    if (eUpdate) return false

    const ant = precioAnterior ?? 0
    const variacion = ant > 0 ? ((it.precio_nuevo - ant) / ant) * 100 : 0
    await admin.from('precio_historial').insert({
      producto_id: it.producto_id,
      precio_anterior: ant,
      precio_nuevo: it.precio_nuevo,
      variacion_porcentaje: Math.round(variacion * 10) / 10,
      factura_id: it.factura_id ?? null,
      restaurante_id: restauranteId,
      origen: it.origen ?? null,
    })
    await admin.from('ingredientes').update({ costo_unitario: it.precio_nuevo }).eq('producto_id', it.producto_id)
    return true
  }
  let actualizados = 0
  for (let i = 0; i < items.length; i += 10) {
    const r = await Promise.all(items.slice(i, i + 10).map(aplicar))
    actualizados += r.filter(Boolean).length
  }
  return actualizados
}

// Deja asentados cambios que NO se aplican todavía (salto > UMBRAL_REVISION_PCT):
// el producto conserva su precio hasta que alguien confirma en Compras → Precios.
export async function registrarPendientes(admin: AdminClient, restauranteId: string, items: Desfasado[]): Promise<number> {
  if (items.length === 0) return 0
  const { error } = await admin.from('precio_historial').insert(items.map(d => ({
    producto_id: d.producto_id,
    precio_anterior: d.precio_actual,
    precio_nuevo: d.precio_nuevo,
    variacion_porcentaje: d.delta_pct,
    factura_id: d.factura_id,
    restaurante_id: restauranteId,
    origen: d.origen,
    estado: 'pendiente',
  })))
  return error ? 0 : items.length
}
