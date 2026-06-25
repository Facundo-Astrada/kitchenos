'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type {
  Factura, FacturaItem, FacturaStatus, TipoFactura,
  CondicionPago, PrecioHistorial,
} from '@/types'
import { useRestauranteId } from './useRestauranteId'

const PAGE_SIZE = 20

// Normalize units to base metric (kg or l) for stock
function normalizeForStock(item: { cantidad: number; unidad: string; precio_unitario: number; peso_kg?: number }): {
  cantidad_stock: number; unidad_stock: string; precio_stock: number
} {
  const u = item.unidad.toLowerCase().trim()
  if (['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(u))
    return { cantidad_stock: item.cantidad, unidad_stock: 'kg', precio_stock: item.precio_unitario }
  if (['g', 'gr', 'gramo', 'gramos'].includes(u))
    return { cantidad_stock: item.cantidad / 1000, unidad_stock: 'kg', precio_stock: item.precio_unitario * 1000 }
  if (['mg'].includes(u))
    return { cantidad_stock: item.cantidad / 1000000, unidad_stock: 'kg', precio_stock: item.precio_unitario * 1000000 }
  if (['l', 'lt', 'lts', 'litro', 'litros'].includes(u))
    return { cantidad_stock: item.cantidad, unidad_stock: 'l', precio_stock: item.precio_unitario }
  if (['ml', 'cc', 'cm3'].includes(u))
    return { cantidad_stock: item.cantidad / 1000, unidad_stock: 'l', precio_stock: item.precio_unitario * 1000 }
  // Non-metric unit with peso_kg equivalence → always normalize to kg
  if (item.peso_kg && item.peso_kg > 0)
    return { cantidad_stock: item.cantidad * item.peso_kg, unidad_stock: 'kg', precio_stock: item.precio_unitario / item.peso_kg }
  // No conversion available — keep as-is
  return { cantidad_stock: item.cantidad, unidad_stock: item.unidad, precio_stock: item.precio_unitario }
}

// Normalize product names: trim, collapse spaces, title case
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, c => c.toUpperCase())
}

// Infer product category from name
function inferCategoria(nombre: string): string {
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

export function useFacturas() {
  const RESTAURANTE_ID = useRestauranteId()
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pageRef = useRef(0)
  const [hasMore, setHasMore] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const supabase = createClient()

  const fetchFacturas = useCallback(async (reset = true, showLoading = true) => {
    if (!RESTAURANTE_ID) { setLoading(false); return }
    if (showLoading) setLoading(true)
    setError(null)

    const currentPage = reset ? 0 : pageRef.current
    const from = currentPage * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    try {
      const { data, error, count } = await supabase.from('facturas').select('*', { count: 'exact' })
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error

      if (reset) {
        setFacturas((data ?? []) as Factura[])
      } else {
        setFacturas(prev => [...prev, ...((data ?? []) as Factura[])])
      }
      if (count != null) setTotalCount(count)
      setHasMore((data?.length ?? 0) === PAGE_SIZE)
      pageRef.current = currentPage + 1
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar facturas'
      console.error('[useFacturas] Error:', msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [RESTAURANTE_ID, supabase])

  const fetchMore = useCallback(() => {
    if (hasMore && !loading) fetchFacturas(false, false)
  }, [hasMore, loading, fetchFacturas])

  const fetchItems = useCallback(async (facturaId: string): Promise<FacturaItem[]> => {
    try {
      const { data, error } = await supabase.from('factura_items').select('*')
        .eq('factura_id', facturaId)
      if (error) throw error
      return (data ?? []) as FacturaItem[]
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar items de factura'
      console.error('[useFacturas] fetchItems Error:', msg)
      throw new Error(msg)
    }
  }, [supabase])

  const crearFactura = useCallback(async (datos: {
    proveedor_nombre: string
    proveedor_cuit?: string | null
    fecha_factura?: string | null
    tipo_factura: TipoFactura
    numero_factura?: string | null
    subtotal: number
    iva_total: number
    total: number
    condicion_pago: CondicionPago
    imagen_url?: string | null
    notas?: string | null
    items: {
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
    }[]
  }) => {
    try {
      if (!RESTAURANTE_ID) throw new Error('Restaurante no cargado todavía — reintentá en un segundo')
      // 0. Fetch all existing products for matching (including stock_actual)
      const { data: allProductos, error: fetchError } = await supabase
        .from('productos')
        .select('id, nombre, precio_unitario, stock_actual, unidad')
        .eq('restaurante_id', RESTAURANTE_ID)

      if (fetchError) throw fetchError
      console.log('[crearFactura] productos en stock:', allProductos?.length ?? 0)

      const productosExistentes = (allProductos ?? []) as {
        id: string; nombre: string; precio_unitario: number; stock_actual: number; unidad: string
      }[]

      // 1. Insert factura
      const { data: factura, error } = await supabase.from('facturas').insert({
        proveedor_nombre: datos.proveedor_nombre,
        proveedor_cuit: datos.proveedor_cuit || null,
        fecha_factura: datos.fecha_factura || null,
        tipo_factura: datos.tipo_factura,
        numero_factura: datos.numero_factura || null,
        subtotal: datos.subtotal,
        iva_total: datos.iva_total,
        total: datos.total,
        condicion_pago: datos.condicion_pago,
        imagen_url: datos.imagen_url || null,
        status: 'confirmada',
        notas: datos.notas || null,
        restaurante_id: RESTAURANTE_ID,
      }).select('id').single()

      if (error || !factura) throw new Error(error?.message || 'Error al crear factura')

      // 1b. Auto-registrar proveedor si no existe
      if (datos.proveedor_nombre?.trim()) {
        const { data: provExistente } = await supabase
          .from('proveedores')
          .select('id')
          .eq('restaurante_id', RESTAURANTE_ID)
          .ilike('nombre', datos.proveedor_nombre.trim())
          .maybeSingle()
        if (!provExistente) {
          await supabase.from('proveedores').insert({
            nombre: datos.proveedor_nombre.trim(),
            restaurante_id: RESTAURANTE_ID,
            activo: true,
          })
        }
      }

      // 2. Process each item: match/create product, then insert item
      let preciosActualizados = 0
      let productosCreados = 0
      const itemsToInsert: Record<string, unknown>[] = []

      for (const item of datos.items) {
        const nombreNorm = normalizeName(item.producto_nombre)
        const nombreLower = nombreNorm.toLowerCase()
        let productoId = item.producto_id || null
        let precioAnterior = item.precio_anterior || null

        // Try to match existing product (case-insensitive exact, then partial)
        if (!productoId) {
          const match =
            productosExistentes.find(p => p.nombre.toLowerCase() === nombreLower) ??
            // Match parcial seguro: el ítem de factura (más descriptivo) CONTIENE el nombre
            // canónico del producto. Ej: "Aceite De Oliva Extra Virgen 5l" → "Aceite De Oliva".
            // Guard de longitud (≥4) para no matchear nombres base muy cortos.
            // (Antes era al revés y "Tomate" pisaba "Extracto De Tomate" — falso positivo.)
            productosExistentes.find(p => {
              const pn = p.nombre.toLowerCase()
              return pn.length >= 4 && nombreLower.includes(pn)
            })
          if (match) {
            productoId = match.id
            precioAnterior = match.precio_unitario || null
            console.log(`[crearFactura] match encontrado: "${item.producto_nombre}" → "${match.nombre}" (id: ${match.id})`)
          }
        }

        if (productoId) {
          // ── Existing product: SUMAR cantidad al stock + actualizar precio ──
          const existente = productosExistentes.find(p => p.id === productoId)
          const stockActual = existente?.stock_actual ?? 0
          const { cantidad_stock, unidad_stock, precio_stock } = normalizeForStock(item)
          const nuevoStock = stockActual + cantidad_stock
          const precioAnt = precioAnterior ?? existente?.precio_unitario ?? 0

          console.log(`[crearFactura] actualizando "${existente?.nombre}": stock ${stockActual} + ${cantidad_stock} ${unidad_stock} = ${nuevoStock}, precio ${precioAnt} → ${precio_stock}`)

          const { error: updateError } = await supabase.from('productos')
            .update({
              stock_actual: nuevoStock,
              unidad: unidad_stock,
              precio_unitario: precio_stock,
              activo: true,
            })
            .eq('id', productoId)

          if (updateError) console.error('[crearFactura] error actualizando producto:', updateError.message)

          // Price history
          const variacion = precioAnt > 0
            ? ((precio_stock - precioAnt) / precioAnt) * 100 : 0

          await supabase.from('precio_historial').insert({
            producto_id: productoId,
            precio_anterior: precioAnt,
            precio_nuevo: precio_stock,
            variacion_porcentaje: Math.round(variacion * 10) / 10,
            factura_id: factura.id,
            restaurante_id: RESTAURANTE_ID,
          })

          // Update ingredientes only in recipes belonging to THIS restaurant
          const { data: recetasData } = await supabase
            .from('recetas')
            .select('id')
            .eq('restaurante_id', RESTAURANTE_ID)
          const recetaIds = (recetasData ?? []).map((r: { id: string }) => r.id)
          if (recetaIds.length > 0) {
            await supabase.from('ingredientes')
              .update({ costo_unitario: item.precio_unitario })
              .ilike('nombre', nombreNorm)
              .in('receta_id', recetaIds)
          }

          preciosActualizados++
        } else {
          // ── New product: CREAR en stock normalizado a kg/l ──
          const { cantidad_stock, unidad_stock, precio_stock } = normalizeForStock(item)
          console.log(`[crearFactura] creando nuevo producto: "${nombreNorm}", cantidad: ${cantidad_stock} ${unidad_stock}, precio: ${precio_stock}`)

          const { data: newProd, error: prodError } = await supabase.from('productos').insert({
            nombre: nombreNorm,
            unidad: unidad_stock,
            stock_actual: cantidad_stock,
            stock_minimo: 0,
            stock_critico: 0,
            categoria: item.categoria || inferCategoria(nombreNorm),
            proveedor_id: null,
            precio_unitario: precio_stock,
            activo: true,
            restaurante_id: RESTAURANTE_ID,
          }).select('id').single()

          if (prodError) {
            console.error('[crearFactura] error creando producto:', nombreNorm, prodError.message, prodError.details)
          } else {
            console.log(`[crearFactura] producto creado OK: "${nombreNorm}" → id ${newProd?.id}`)
          }

          if (newProd) {
            productoId = newProd.id

            // Price history for new product (precio normalizado a kg/l)
            await supabase.from('precio_historial').insert({
              producto_id: newProd.id,
              precio_anterior: 0,
              precio_nuevo: precio_stock,
              variacion_porcentaje: 0,
              factura_id: factura.id,
              restaurante_id: RESTAURANTE_ID,
            })

            productosCreados++
          }
        }

        itemsToInsert.push({
          factura_id: factura.id,
          producto_nombre: nombreNorm,
          producto_id: productoId,
          cantidad: item.cantidad,
          unidad: item.unidad,
          precio_unitario: item.precio_unitario,
          alicuota_iva: item.alicuota_iva,
          subtotal: item.subtotal,
          precio_anterior: precioAnterior,
        })
      }

      // 3. Insert all factura items
      if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase.from('factura_items').insert(itemsToInsert)
        if (itemsError) console.error('[crearFactura] Error insertando items:', itemsError.message)
      }

      await fetchFacturas(true)
      return { facturaId: factura.id, preciosActualizados, productosCreados }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al crear factura'
      console.error('[useFacturas] crearFactura Error:', msg)
      throw new Error(msg)
    }
  }, [fetchFacturas, RESTAURANTE_ID, supabase])

  const actualizarFactura = useCallback(async (
    id: string,
    datos: Partial<Omit<Factura, 'id' | 'restaurante_id'>>,
    items?: { producto_nombre: string; producto_id?: string | null; cantidad: number; unidad: string; precio_unitario: number; alicuota_iva: number; subtotal: number; precio_anterior?: number | null }[]
  ) => {
    try {
      const { error } = await supabase.from('facturas').update(datos).eq('id', id)
      if (error) throw error
      if (items !== undefined) {
        await supabase.from('factura_items').delete().eq('factura_id', id)
        if (items.length > 0) {
          const { error: itemsError } = await supabase.from('factura_items').insert(
            items.map(it => ({
              factura_id: id,
              producto_nombre: it.producto_nombre,
              producto_id: it.producto_id || null,
              cantidad: it.cantidad,
              unidad: it.unidad,
              precio_unitario: it.precio_unitario,
              alicuota_iva: it.alicuota_iva,
              subtotal: it.subtotal,
              precio_anterior: it.precio_anterior || null,
            }))
          )
          if (itemsError) throw itemsError
        }
      }
      await fetchFacturas(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar factura'
      console.error('[useFacturas] actualizarFactura Error:', msg)
      throw new Error(msg)
    }
  }, [fetchFacturas, supabase])

  const actualizarStatus = useCallback(async (id: string, status: FacturaStatus) => {
    try {
      const { error } = await supabase.from('facturas').update({ status }).eq('id', id)
      if (error) throw error
      await fetchFacturas(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar estado de factura'
      console.error('[useFacturas] actualizarStatus Error:', msg)
      throw new Error(msg)
    }
  }, [fetchFacturas, supabase])

  const eliminarFactura = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('facturas').delete().eq('id', id)
      if (error) throw error
      await fetchFacturas(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar factura'
      console.error('[useFacturas] eliminarFactura Error:', msg)
      throw new Error(msg)
    }
  }, [fetchFacturas, supabase])

  // Todas las facturas a crédito todavía no pagadas (sin paginar — para "Cuentas por pagar")
  const fetchPorPagar = useCallback(async (): Promise<Factura[]> => {
    if (!RESTAURANTE_ID) return []
    try {
      const { data, error } = await supabase.from('facturas').select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .in('condicion_pago', ['cuenta_corriente', '30dias', '60dias'])
        .neq('status', 'pagada')
        .order('fecha_factura', { ascending: true })
      if (error) throw error
      return (data ?? []) as Factura[]
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar cuentas por pagar'
      console.error('[useFacturas] fetchPorPagar Error:', msg)
      return []
    }
  }, [RESTAURANTE_ID, supabase])

  // Vincular (o desvincular) una factura con un pedido — reconciliación
  const vincularPedido = useCallback(async (facturaId: string, pedidoId: string | null) => {
    try {
      const { error } = await supabase.from('facturas').update({ pedido_id: pedidoId }).eq('id', facturaId)
      if (error) throw error
      await fetchFacturas(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message
        : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
        : 'Error al vincular pedido'
      console.error('[useFacturas] vincularPedido Error:', msg)
      throw new Error(msg)
    }
  }, [fetchFacturas, supabase])

  const fetchHistorialPrecios = useCallback(async (productoId: string): Promise<PrecioHistorial[]> => {
    try {
      const { data, error } = await supabase.from('precio_historial').select('*')
        .eq('producto_id', productoId)
        .order('fecha', { ascending: true })
        .limit(20)
      if (error) throw error
      return (data ?? []) as PrecioHistorial[]
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar historial de precios'
      console.error('[useFacturas] fetchHistorialPrecios Error:', msg)
      throw new Error(msg)
    }
  }, [supabase])

  useEffect(() => {
    fetchFacturas(true)
    const ch = supabase.channel('facturas-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'facturas' }, () => fetchFacturas(true, false))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchFacturas])

  return {
    facturas, loading, error,
    hasMore, fetchMore, totalCount,
    fetchFacturas, fetchItems, crearFactura,
    actualizarFactura, actualizarStatus, eliminarFactura, fetchHistorialPrecios,
    fetchPorPagar, vincularPedido,
  }
}
