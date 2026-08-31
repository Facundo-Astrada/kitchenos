import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeForStock, matchesWholeWord, sinTildes } from '@/lib/stock/precios'

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

  const resueltos: ItemFacturaResuelto[] = []
  let productosCreados = 0

  for (const item of items) {
    const nombreNorm = normalizeNombreProducto(item.producto_nombre)
    let productoId = item.producto_id || null
    let precioAnterior = item.precio_anterior || null

    if (!productoId) {
      const match = matchProducto(nombreNorm, productosExistentes)
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

  return { items: resueltos, productosCreados }
}

// ── Paso 2 (después de crear_factura_con_items): efectos idempotentes ──────
// Sumar stock + actualizar precio de los productos ya existentes, dejar
// precio_historial (necesita el factura_id real) y propagar el costo a
// ingredientes. Los recién creados en el paso 1 ya nacieron con su stock y
// precio correctos — acá solo les falta el historial. Si esto se corta a
// mitad de camino, la factura+items ya quedaron escritos enteros (los grabó
// la rpc): lo que falta es "faltan estos efectos", no un documento roto.
export async function aplicarEfectosDeFactura(params: {
  supabase: SupabaseClient
  restauranteId: string
  facturaId: string
  proveedorNombre: string
  items: ItemFacturaResuelto[]
}): Promise<{ preciosActualizados: number }> {
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
  if (itemsConProducto.length === 0) return { preciosActualizados: 0 }

  const { data: recetasData } = await supabase.from('recetas').select('id').eq('restaurante_id', restauranteId)
  const recetaIds = (recetasData ?? []).map((r: { id: string }) => r.id)

  let preciosActualizados = 0

  for (const item of itemsConProducto) {
    const { cantidad_stock, unidad_stock, precio_stock } = normalizeForStock(item)

    if (item.es_nuevo) {
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

    const nuevoStock = item.stock_actual_previo + cantidad_stock
    const precioAnt = item.precio_anterior ?? 0

    await supabase.from('productos').update({
      stock_actual: nuevoStock,
      unidad: unidad_stock,
      precio_unitario: precio_stock,
      activo: true,
    }).eq('id', item.producto_id as string)

    const variacion = precioAnt > 0 ? ((precio_stock - precioAnt) / precioAnt) * 100 : 0
    await supabase.from('precio_historial').insert({
      producto_id: item.producto_id,
      precio_anterior: precioAnt,
      precio_nuevo: precio_stock,
      variacion_porcentaje: Math.round(variacion * 10) / 10,
      factura_id: facturaId,
      restaurante_id: restauranteId,
    })

    // costo_unitario usa precio_stock (normalizado a kg/l), NO
    // item.precio_unitario (que viene en la unidad cruda de la factura, ej.
    // por gramo) — si no, el costo del ingrediente queda hasta 1000x menor.
    if (recetaIds.length > 0) {
      await supabase.from('ingredientes')
        .update({ costo_unitario: precio_stock })
        .ilike('nombre', item.producto_nombre)
        .in('receta_id', recetaIds)
    }

    preciosActualizados++
  }

  return { preciosActualizados }
}
