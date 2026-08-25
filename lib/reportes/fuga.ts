import type { SupabaseClient } from '@supabase/supabase-js'
import {
  matchVentasPorCartaItem, gramajePorUnidad, unitConversionFactor, normalizarNombrePlato,
  type IngredienteLike, type RecetaLike, type PlatoRecetaLike,
} from './consumoTeorico'

export interface FugaProductoRow {
  productoId: string
  productoNombre: string
  unidad: string
  consumoTeorico: number
  consumoReal: number
  mermaDeclarada: number
  diferencia: number
  tolerancia: number
  fuga: boolean
}

export interface FugaPlatoNoCalculable {
  cartaItemId: string
  nombre: string
  cantidadVendida: number
  motivo: 'sin_receta' | 'sin_producto_vinculado'
}

export interface FugaResultado {
  desde: string
  hasta: string
  productos: FugaProductoRow[]
  noCalculables: FugaPlatoNoCalculable[]
}

interface VentaItemRow {
  nombre_plato: string
  cantidad: number
  ventas: { fecha: string } | { fecha: string }[]
}

/**
 * Detección de fuga de inventario (PLAN-4-CAPAS B5): por producto, compara lo
 * que debería haberse consumido según lo vendido (consumo teórico, vía la
 * ficha de cada plato) contra lo que efectivamente entró y salió del stock.
 *
 * Desvío del texto original del plan: la fórmula de la clase es
 * `consumo_real = stock_inicial + compras − stock_final`, pero K-OS no
 * historiza `productos.stock_actual` (no hay snapshot por fecha, solo el
 * valor vivo actual) y esta sesión es "sin migración" — no correspondía sumar
 * una tabla de conteos para resolverlo. Se usa `consumo_real ≈ compras del
 * período`, el mismo criterio que ya usa el CMV existente (`compras/ventas`)
 * para aproximar costo de mercadería vendida sin inventario perpetuo. Es una
 * aproximación asumida, no el número exacto — documentarlo en pantalla.
 *
 * `tolerancia` viene de `productos.merma_esperada_pct` (B2): sin ella, la
 * merma normal de cualquier producto se reportaría como fuga todos los
 * períodos y el informe se desacredita solo.
 *
 * Compras y merma se matchean por `producto_id` cuando está cargado, con
 * fallback a `producto_nombre` normalizado (mismo criterio que ya usan
 * `usePedidos.recibirPedido` y el resto del proyecto para este mismo problema):
 * en producción, `factura_items.producto_id` está casi siempre NULL (el
 * importador de facturas por IA solo carga el nombre; el link es un paso
 * aparte que corre después) y `merma.producto_id` también queda vacío cuando
 * se carga con texto libre. Sin este fallback el informe daría compras/merma
 * en 0 para casi todo, aunque haya facturas y mermas cargadas.
 */
export async function calcularFugaInventario(opts: {
  supabase: SupabaseClient
  restauranteId: string
  desde: string
  hasta: string
}): Promise<FugaResultado> {
  const { supabase, restauranteId, desde, hasta } = opts
  const vacio: FugaResultado = { desde, hasta, productos: [], noCalculables: [] }

  // 1) Ventas del período (mismo join `ventas!inner` que lib/produccion/sugerencia.ts
  //    — sin el !inner, .eq('ventas.restaurante_id', …) no filtra la fila padre).
  const { data: viData, error: viErr } = await supabase
    .from('ventas_items')
    .select('nombre_plato, cantidad, ventas!inner(fecha, restaurante_id)')
    .eq('ventas.restaurante_id', restauranteId)
    .gte('ventas.fecha', desde)
    .lte('ventas.fecha', hasta)
  if (viErr) throw viErr
  const ventasItems = ((viData ?? []) as unknown as VentaItemRow[]).map(r => ({
    nombre_plato: r.nombre_plato, cantidad: Number(r.cantidad) || 0,
  }))
  if (ventasItems.length === 0) return vacio

  // 2) Carta → recetas/plato_recetas → ingredientes, solo de lo efectivamente vendido.
  const { data: ciData, error: ciErr } = await supabase
    .from('carta_items')
    .select('id, nombre, receta_id')
    .eq('restaurante_id', restauranteId)
  if (ciErr) throw ciErr
  const cartaItems = (ciData ?? []) as { id: string; nombre: string; receta_id: string | null }[]

  const vendidoPorCartaItem = matchVentasPorCartaItem(ventasItems, cartaItems)
  const cartaItemsVendidos = cartaItems.filter(ci => (vendidoPorCartaItem.get(ci.id) ?? 0) > 0)
  if (cartaItemsVendidos.length === 0) return vacio

  const cartaItemIds = cartaItemsVendidos.map(ci => ci.id)
  const { data: prData } = await supabase
    .from('plato_recetas')
    .select('plato_id, receta_id, porciones')
    .in('plato_id', cartaItemIds)
  const platoRecetas = (prData ?? []) as PlatoRecetaLike[]

  const recetaIds = [...new Set([
    ...platoRecetas.map(pr => pr.receta_id),
    ...cartaItemsVendidos.map(ci => ci.receta_id).filter((x): x is string => !!x),
  ])]

  const recetasPorId = new Map<string, RecetaLike>()
  const ingredientesPorReceta = new Map<string, IngredienteLike[]>()
  if (recetaIds.length > 0) {
    const { data: recData } = await supabase.from('recetas').select('id, porciones').in('id', recetaIds)
    for (const r of (recData ?? []) as { id: string; porciones: number }[]) recetasPorId.set(r.id, r)

    const { data: ingData } = await supabase
      .from('ingredientes')
      .select('receta_id, producto_id, cantidad, unidad')
      .in('receta_id', recetaIds)
    for (const ing of (ingData ?? []) as IngredienteLike[]) {
      const list = ingredientesPorReceta.get(ing.receta_id) ?? []
      list.push(ing)
      ingredientesPorReceta.set(ing.receta_id, list)
    }
  }

  // 3) Consumo teórico por producto (en la unidad de CADA ingrediente — se
  //    convierte a la unidad del producto en el paso 5, cuando ya la sabemos).
  const teoricoPorProducto = new Map<string, { cantidad: number; unidad: string }[]>()
  const noCalculables: FugaPlatoNoCalculable[] = []

  for (const ci of cartaItemsVendidos) {
    const vendidos = vendidoPorCartaItem.get(ci.id) ?? 0
    const propias = platoRecetas.filter(pr => pr.plato_id === ci.id)

    if (!ci.receta_id && propias.length === 0) {
      noCalculables.push({ cartaItemId: ci.id, nombre: ci.nombre, cantidadVendida: vendidos, motivo: 'sin_receta' })
      continue
    }

    const { contribuciones } = gramajePorUnidad(ci.id, ci.receta_id, propias, recetasPorId, ingredientesPorReceta)
    if (contribuciones.length === 0) {
      noCalculables.push({ cartaItemId: ci.id, nombre: ci.nombre, cantidadVendida: vendidos, motivo: 'sin_producto_vinculado' })
      continue
    }

    for (const c of contribuciones) {
      const list = teoricoPorProducto.get(c.producto_id) ?? []
      list.push({ cantidad: c.cantidad * vendidos, unidad: c.unidad })
      teoricoPorProducto.set(c.producto_id, list)
    }
  }

  const productoIds = [...teoricoPorProducto.keys()]
  if (productoIds.length === 0) return { desde, hasta, productos: [], noCalculables }

  // 4) Productos + compras del período (factura_items) + merma declarada.
  const { data: prodData } = await supabase
    .from('productos')
    .select('id, nombre, unidad, merma_esperada_pct')
    .eq('restaurante_id', restauranteId)
    .in('id', productoIds)
  const productos = (prodData ?? []) as { id: string; nombre: string; unidad: string; merma_esperada_pct: number | null }[]
  const unidadPorProducto = new Map(productos.map(p => [p.id, p.unidad]))

  // Fallback de matching por nombre (ver docstring): solo entre los productos
  // que ya nos importan (los que aportan consumo teórico), no todo el catálogo.
  const productoIdPorNombre = new Map<string, string>()
  for (const p of productos) {
    const key = normalizarNombrePlato(p.nombre)
    if (!productoIdPorNombre.has(key)) productoIdPorNombre.set(key, p.id)
  }
  const resolverProductoId = (productoId: string | null, nombre: string | null): string | null => {
    if (productoId && unidadPorProducto.has(productoId)) return productoId
    if (!nombre) return null
    return productoIdPorNombre.get(normalizarNombrePlato(nombre)) ?? null
  }

  const { data: facturasData } = await supabase
    .from('facturas')
    .select('id')
    .eq('restaurante_id', restauranteId)
    .neq('status', 'observada')
    .gte('fecha_factura', desde)
    .lte('fecha_factura', hasta)
  const facturaIds = (facturasData ?? []).map(f => f.id as string)

  const comprasPorProducto = new Map<string, number>() // ya convertido a la unidad del producto
  if (facturaIds.length > 0) {
    const { data: fiData } = await supabase
      .from('factura_items')
      .select('producto_id, producto_nombre, cantidad, unidad')
      .in('factura_id', facturaIds)
    for (const fi of (fiData ?? []) as { producto_id: string | null; producto_nombre: string | null; cantidad: number; unidad: string | null }[]) {
      const id = resolverProductoId(fi.producto_id, fi.producto_nombre)
      if (!id) continue
      const unidadProducto = unidadPorProducto.get(id) ?? fi.unidad ?? ''
      const factor = unitConversionFactor(fi.unidad ?? unidadProducto, unidadProducto)
      comprasPorProducto.set(id, (comprasPorProducto.get(id) ?? 0) + (Number(fi.cantidad) || 0) * factor)
    }
  }

  const { data: mermaData } = await supabase
    .from('merma')
    .select('producto_id, producto_nombre, cantidad, unidad')
    .eq('restaurante_id', restauranteId)
    .gte('fecha', desde)
    .lte('fecha', hasta)
  const mermaPorProducto = new Map<string, number>()
  for (const m of (mermaData ?? []) as { producto_id: string | null; producto_nombre: string | null; cantidad: number; unidad: string }[]) {
    const id = resolverProductoId(m.producto_id, m.producto_nombre)
    if (!id) continue
    const unidadProducto = unidadPorProducto.get(id) ?? m.unidad
    const factor = unitConversionFactor(m.unidad, unidadProducto)
    mermaPorProducto.set(id, (mermaPorProducto.get(id) ?? 0) + (Number(m.cantidad) || 0) * factor)
  }

  // 5) Diferencia y tolerancia por producto — todo ya en la unidad del producto.
  const productosResult: FugaProductoRow[] = []
  for (const p of productos) {
    const contribs = teoricoPorProducto.get(p.id) ?? []
    const consumoTeorico = contribs.reduce((s, c) => s + c.cantidad * unitConversionFactor(c.unidad, p.unidad), 0)
    if (!(consumoTeorico > 0)) continue

    const consumoReal = comprasPorProducto.get(p.id) ?? 0
    const mermaDeclarada = mermaPorProducto.get(p.id) ?? 0
    const diferencia = consumoReal - consumoTeorico - mermaDeclarada
    const tolerancia = consumoTeorico * ((p.merma_esperada_pct ?? 0) / 100)

    productosResult.push({
      productoId: p.id, productoNombre: p.nombre, unidad: p.unidad,
      consumoTeorico, consumoReal, mermaDeclarada, diferencia, tolerancia,
      fuga: diferencia > tolerancia,
    })
  }
  productosResult.sort((a, b) => (b.diferencia - b.tolerancia) - (a.diferencia - a.tolerancia))

  return { desde, hasta, productos: productosResult, noCalculables }
}
