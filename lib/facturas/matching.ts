import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeForStock, matchesWholeWord, sinTildes, aUnidadDelProducto } from '@/lib/stock/precios'
import { UMBRAL_REVISION_PCT } from '@/lib/stock/syncPrecios'
import { normAlias, sugerenciaSegura } from './sugerirProducto'

// Día 8 del plan consolidado (dominio-kos.md §4.1): la transacción de
// crear_factura_con_items (migración 20260831e) cubre SOLO factura+items.
// Todo lo de acá — matchear/crear productos, actualizar stock y precio,
// dejar historial, auto-registrar proveedor — son efectos sobre OTROS
// agregados (Stock, Proveedores) y corren aparte, en dos pasos alrededor de
// esa rpc: resolverProductosDeItems() ANTES (no depende de que la factura
// exista) y aplicarEfectosDeFactura() DESPUÉS (precio_historial necesita un
// factura_id real — tiene FK). Compartido entre useFacturas.crearFactura
// (alta manual/IA, aplica los dos pasos) y
// /api/importador/facturas-universal (import masivo, que antes reimplementaba
// el matching aparte — ahora usa matchProducto()).

// ── Matching puro ────────────────────────────────────────────────────────
// Match exacto sin tildes primero; si no hay, parcial de palabra completa —
// el nombre del ítem de factura (más descriptivo) CONTIENE el nombre
// canónico del producto. Ej: "Aceite De Oliva Extra Virgen 5l" → "Aceite De
// Oliva". Guard de longitud ≥4 para no matchear nombres base muy cortos.
export function matchProducto<T extends { nombre: string }>(nombreItem: string, productos: T[]): T | null {
  const nombreLowerSinTildes = sinTildes(nombreItem.toLowerCase())
  return (
    productos.find(p => sinTildes(p.nombre.toLowerCase()) === nombreLowerSinTildes) ??
    productos.find(p => {
      const pn = sinTildes(p.nombre.toLowerCase())
      return pn.length >= 4 && matchesWholeWord(nombreLowerSinTildes, pn)
    }) ??
    null
  )
}

// Recorta, colapsa espacios, Title Case — solo se aplica al nombre con el
// que se CREA un producto nuevo (uno existente conserva el suyo).
export function normalizeNombreProducto(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, c => c.toUpperCase())
}

// Categoría inferida por palabras clave — fallback cuando el ítem no trae
// una explícita, solo para productos nuevos.
export function inferCategoria(nombre: string): string {
  const n = nombre.toLowerCase()
  const CARNES = ['lomo', 'entraña', 'vacío', 'bife', 'asado', 'pollo', 'cerdo', 'osobuco', 'molida', 'carne', 'costilla', 'bondiola', 'matambre', 'chorizo', 'morcilla', 'panceta', 'jamón', 'salchicha', 'milanesa', 'pescado', 'salmón', 'merluza', 'atún', 'langostino', 'calamar', 'pulpo', 'cordero']
  const VERDURAS = ['tomate', 'cebolla', 'papa', 'zanahoria', 'lechuga', 'rúcula', 'morrón', 'pimiento', 'ají', 'zapallo', 'zapallito', 'berenjena', 'pepino', 'espinaca', 'brócoli', 'choclo', 'arveja', 'perejil', 'cilantro', 'albahaca', 'ajo', 'jengibre', 'remolacha', 'acelga', 'repollo', 'limón', 'naranja', 'banana', 'manzana', 'pera', 'frutilla', 'fruta', 'verdura', 'palta']
  const LACTEOS = ['leche', 'crema', 'queso', 'manteca', 'yogur', 'ricota', 'muzarela', 'mozzarella', 'parmesano', 'provolone', 'roquefort', 'mascarpone', 'brie', 'cheddar', 'reggianito', 'lácteo']
  const SECOS = ['harina', 'arroz', 'azúcar', 'sal', 'pimienta', 'aceite', 'vinagre', 'fideos', 'polenta', 'pan rallado', 'levadura', 'almidón', 'fécula', 'puré', 'avena', 'lenteja', 'poroto', 'garbanzo', 'mostaza', 'ketchup', 'mayonesa', 'salsa', 'caldo', 'especias', 'orégano', 'pimentón', 'comino', 'nuez moscada', 'canela', 'vainilla', 'cacao', 'chocolate', 'dulce de leche', 'mermelada', 'miel', 'fruto seco', 'almendra', 'nuez', 'maní', 'sésamo']
  const BEBIDAS = ['agua', 'cerveza', 'vino', 'fernet', 'gaseosa', 'soda', 'jugo', 'café', 'té', 'infusión', 'champagne', 'espumante', 'aperol', 'campari', 'vodka', 'gin', 'whisky', 'ron', 'tónica']
  const LIMPIEZA = ['detergente', 'lavandina', 'desinfectante', 'jabón', 'esponja', 'trapo', 'bolsa', 'film', 'aluminio', 'papel', 'servilleta', 'guante', 'limpieza']

  if (CARNES.some(k => n.includes(k))) return 'Carnes'
  if (VERDURAS.some(k => n.includes(k))) return 'Verduras'
  if (LACTEOS.some(k => n.includes(k))) return 'Lácteos'
  if (BEBIDAS.some(k => n.includes(k))) return 'Bebidas'
  if (LIMPIEZA.some(k => n.includes(k))) return 'Limpieza'
  if (SECOS.some(k => n.includes(k))) return 'Secos'
  return 'Otros'
}

// ── Tipos ────────────────────────────────────────────────────────────────
export interface ItemFacturaInput {
  producto_nombre: string
  producto_id?: string | null
  cantidad: number
  unidad: string
  precio_unitario: number
  alicuota_iva: number
  subtotal: number
  precio_anterior?: number | null
  peso_kg?: number
  categoria?: string | null
}

export interface ItemFacturaResuelto extends ItemFacturaInput {
  producto_id: string | null
  precio_anterior: number | null
  stock_actual_previo: number
  es_nuevo: boolean
}

// ── Paso 1: resolver producto_id de cada ítem (antes de crear la factura) ──
// Matchea contra el stock existente; si no hay match crea el producto ahora
// (no depende de un factura_id). Así crear_factura_con_items recibe cada
// ítem con su producto_id ya resuelto y no necesita tocar `productos`.
export async function resolverProductosDeItems(params: {
  supabase: SupabaseClient
  restauranteId: string
  items: ItemFacturaInput[]
}): Promise<{ items: ItemFacturaResuelto[]; productosCreados: number }> {
  const { supabase, restauranteId, items } = params

  const { data: allProductos } = await supabase
    .from('productos')
    .select('id, nombre, precio_unitario, stock_actual, unidad')
    .eq('restaurante_id', restauranteId)
  const productosExistentes = (allProductos ?? []) as {
    id: string; nombre: string; precio_unitario: number; stock_actual: number; unidad: string
  }[]

  // Vínculos aprendidos (Compras → Precios, imports anteriores): misma fuente
  // que usa el import de Fudo, para que una factura cargada a mano o por foto
  // reconozca lo mismo.
  const { data: aliasData } = await supabase.from('producto_alias').select('alias_norm, producto_id').eq('restaurante_id', restauranteId)
  const alias = new Map(((aliasData ?? []) as { alias_norm: string; producto_id: string }[]).map(a => [a.alias_norm, a.producto_id]))
  const aprendidos: Array<{ restaurante_id: string; alias_norm: string; producto_id: string }> = []

  const resueltos: ItemFacturaResuelto[] = []
  let productosCreados = 0

  for (const item of items) {
    const nombreNorm = normalizeNombreProducto(item.producto_nombre)
    let productoId = item.producto_id || null
    let precioAnterior = item.precio_anterior || null

    // Vínculo elegido (o confirmado) por quien cargó la factura: se aprende.
    if (productoId) {
      const k = normAlias(item.producto_nombre)
      if (k && alias.get(k) !== productoId) aprendidos.push({ restaurante_id: restauranteId, alias_norm: k, producto_id: productoId })
    }

    if (!productoId) {
      // alias → variante segura (plurales, ñ, orden) → match parcial clásico.
      const porAlias = alias.get(normAlias(item.producto_nombre))
      const match = (porAlias ? productosExistentes.find(p => p.id === porAlias) : undefined)
        ?? sugerenciaSegura(item.producto_nombre, productosExistentes)
        ?? matchProducto(nombreNorm, productosExistentes)
      if (match) {
        productoId = match.id
        precioAnterior = match.precio_unitario || null
      }
    }

    let stockActualPrevio = 0
    if (productoId) {
      const existente = productosExistentes.find(p => p.id === productoId)
      stockActualPrevio = existente?.stock_actual ?? 0
      precioAnterior = precioAnterior ?? existente?.precio_unitario ?? 0
    }

    let esNuevo = false
    if (!productoId) {
      const { cantidad_stock, unidad_stock, precio_stock } = normalizeForStock(item)
      const { data: newProd, error } = await supabase.from('productos').insert({
        nombre: nombreNorm,
        unidad: unidad_stock,
        stock_actual: cantidad_stock,
        stock_minimo: 0,
        stock_critico: 0,
        categoria: item.categoria || inferCategoria(nombreNorm),
        proveedor_id: null,
        precio_unitario: precio_stock,
        activo: true,
        restaurante_id: restauranteId,
      }).select('id').single()

      if (error) {
        console.error('[matching] error creando producto:', nombreNorm, error.message)
      } else if (newProd) {
        productoId = newProd.id
        esNuevo = true
        productosCreados++
      }
    }

    resueltos.push({
      ...item,
      producto_nombre: nombreNorm,
      producto_id: productoId,
      precio_anterior: precioAnterior,
      stock_actual_previo: stockActualPrevio,
      es_nuevo: esNuevo,
    })
  }

  if (aprendidos.length > 0) {
    const { error } = await supabase.from('producto_alias').upsert(aprendidos, { onConflict: 'restaurante_id,alias_norm' })
    if (error) console.error('[matching] no se pudo guardar el vínculo aprendido:', error.message)
  }

  return { items: resueltos, productosCreados }
}

// ── Paso 2 (después de crear_factura_con_items): efectos idempotentes ──────
// Sumar stock + actualizar precio de los productos ya existentes, dejar
// precio_historial (necesita el factura_id real). El costo de los
// ingredientes lo propaga la base (trigger productos_propaga_costo). Los recién creados en el paso 1 ya nacieron con su stock y
// precio correctos — acá solo les falta el historial. Si esto se corta a
// mitad de camino, la factura+items ya quedaron escritos enteros (los grabó
// la rpc): lo que falta es "faltan estos efectos", no un documento roto.
export async function aplicarEfectosDeFactura(params: {
  supabase: SupabaseClient
  restauranteId: string
  facturaId: string
  proveedorNombre: string
  items: ItemFacturaResuelto[]
}): Promise<{ preciosActualizados: number; sinConvertir: string[]; aRevisar: string[] }> {
  const { supabase, restauranteId, facturaId, proveedorNombre, items } = params

  if (proveedorNombre.trim()) {
    const { data: provExistente } = await supabase
      .from('proveedores')
      .select('id')
      .eq('restaurante_id', restauranteId)
      .ilike('nombre', proveedorNombre.trim())
      .maybeSingle()
    if (!provExistente) {
      await supabase.from('proveedores').insert({
        nombre: proveedorNombre.trim(), restaurante_id: restauranteId, activo: true,
      })
    }
  }

  const itemsConProducto = items.filter(i => i.producto_id)
  if (itemsConProducto.length === 0) return { preciosActualizados: 0, sinConvertir: [], aRevisar: [] }

  // Unidad (y peso por unidad, y envase de compra) con que cada producto YA
  // está en Stock: la factura se convierte a esa unidad, nunca al revés.
  const { data: prodsData } = await supabase
    .from('productos')
    .select('id, unidad, peso_por_unidad_g, unidad_compra, cantidad_por_envase, stock_actual')
    .in('id', itemsConProducto.map(i => i.producto_id as string))
  const prodPorId = new Map(((prodsData ?? []) as { id: string; unidad: string; peso_por_unidad_g: number | null; unidad_compra: string | null; cantidad_por_envase: number | null; stock_actual: number }[]).map(p => [p.id, p]))

  let preciosActualizados = 0
  const sinConvertir: string[] = []
  const aRevisar: string[] = []

  for (const item of itemsConProducto) {
    if (item.es_nuevo) {
      const { precio_stock } = normalizeForStock(item)
      await supabase.from('precio_historial').insert({
        producto_id: item.producto_id,
        precio_anterior: 0,
        precio_nuevo: precio_stock,
        variacion_porcentaje: 0,
        factura_id: facturaId,
        restaurante_id: restauranteId,
      })
      continue
    }

    const prod = prodPorId.get(item.producto_id as string)
    if (!prod) continue
    const conv = aUnidadDelProducto(item, prod)
    // Unidad de la factura no convertible a la del producto (ej. 'u' contra
    // kg sin peso por unidad): no se toca ni stock ni precio de ese producto.
    if (!conv) {
      sinConvertir.push(`${item.producto_nombre} (${item.unidad} → ${prod.unidad})`)
      continue
    }

    const nuevoStock = (prod.stock_actual ?? item.stock_actual_previo) + conv.cantidad
    const precioAnt = item.precio_anterior ?? 0
    const variacion = precioAnt > 0 ? ((conv.precio - precioAnt) / precioAnt) * 100 : 0

    // Salto grande: la mercadería entra igual (stock), pero el precio no se
    // pisa hasta que alguien lo confirma en Compras → Precios — casi siempre
    // es una unidad mal leída o un producto mal vinculado.
    if (precioAnt > 0 && Math.abs(variacion) > UMBRAL_REVISION_PCT) {
      await supabase.from('productos').update({ stock_actual: nuevoStock, activo: true }).eq('id', item.producto_id as string)
      await supabase.from('precio_historial').insert({
        producto_id: item.producto_id,
        precio_anterior: precioAnt,
        precio_nuevo: conv.precio,
        variacion_porcentaje: Math.round(variacion * 10) / 10,
        factura_id: facturaId,
        restaurante_id: restauranteId,
        estado: 'pendiente',
        origen: `${item.producto_nombre} · ${item.cantidad} ${item.unidad}`,
      })
      aRevisar.push(item.producto_nombre)
      continue
    }

    // Sin `unidad`: la del producto no se cambia. El costo de los
    // ingredientes vinculados lo propaga el trigger productos_propaga_costo
    // (por producto_id — antes se hacía por nombre con ilike y sin unidad).
    await supabase.from('productos').update({
      stock_actual: nuevoStock,
      precio_unitario: conv.precio,
      activo: true,
    }).eq('id', item.producto_id as string)

    await supabase.from('precio_historial').insert({
      producto_id: item.producto_id,
      precio_anterior: precioAnt,
      precio_nuevo: conv.precio,
      variacion_porcentaje: Math.round(variacion * 10) / 10,
      factura_id: facturaId,
      restaurante_id: restauranteId,
    })

    preciosActualizados++
  }

  return { preciosActualizados, sinConvertir, aRevisar }
}
