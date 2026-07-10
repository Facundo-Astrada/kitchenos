'use client'

import { useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import { canonUnit } from './useRecetas'

const VENTANA_DIAS_DEFAULT = 90
const NOMBRE_MIN_LEN = 4   // guard: no matchear productos con nombre muy corto (mismo criterio que el importador)

export interface PrecioProveedorLatest {
  proveedor: string
  precio: number
  fecha: string   // fecha_factura (YYYY-MM-DD)
}

export interface ComparadorPrecioProducto {
  productoId: string
  producto: string          // productos.nombre (canónico — no el texto crudo de la factura)
  unidad: string             // unidad canónica en la que se compró (puede diferir de productos.unidad)
  proveedores: PrecioProveedorLatest[]   // último precio pagado por proveedor, asc por precio
  mejorPrecio: number
  mejorProveedor: string
  mejorFecha: string
  ultimoPagado: PrecioProveedorLatest
  deltaUltimoPct: number   // % que "lo último pagado" está por encima del mejor precio (0 si coincide)
}

export interface TopSobreprecioItem {
  productoId: string
  producto: string
  unidad: string
  mejorPrecio: number
  mejorProveedor: string
  ahorroPotencial: number   // $ perdido en el período por no comprar siempre al mejor precio
  comprasNoOptimas: number  // cantidad de renglones de factura pagados por encima del mejor precio
}

// minúsculas, sin acentos, espacios colapsados.
export function normalizeNombreProducto(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ')
}

interface FacturaItemJoinRow {
  producto_nombre: string
  unidad: string
  precio_unitario: number
  cantidad: number
  facturas: { proveedor_nombre: string; fecha_factura: string } | null
}

const PAGE_SIZE = 1000   // límite server-side de PostgREST por request

interface GroupEntry {
  proveedor: string
  precio: number
  fecha: string
  cantidad: number
}

export function usePreciosProveedores() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const fetchComparador = useCallback(async (
    ventanaDias: number = VENTANA_DIAS_DEFAULT
  ): Promise<{ comparador: ComparadorPrecioProducto[]; topSobreprecio: TopSobreprecioItem[] }> => {
    const EMPTY = { comparador: [], topSobreprecio: [] }
    if (!RESTAURANTE_ID) return EMPTY

    // El match factura↔producto usa la misma dirección que el importador (.claude/docs/importador.md):
    // el renglón de factura es más descriptivo y CONTIENE al nombre canónico del producto de stock.
    // Esto de paso filtra gastos no-mercadería (sueldos, impuestos, alquiler) que no matchean ningún producto.
    // Sin paginar: PostgREST tope 1000 filas/request — ok mientras ningún restaurante supere los 1000 productos.
    const { data: productos, error: prodErr } = await supabase
      .from('productos')
      .select('id, nombre')
      .eq('restaurante_id', RESTAURANTE_ID)

    if (prodErr || !productos?.length) return EMPTY

    const productosNorm = productos
      .map(p => ({ id: p.id, nombre: p.nombre, norm: normalizeNombreProducto(p.nombre) }))
      .filter(p => p.norm.length >= NOMBRE_MIN_LEN)
      .sort((a, b) => b.norm.length - a.norm.length)   // más específico primero

    function matchProducto(nombreItem: string): { id: string; nombre: string } | null {
      const n = normalizeNombreProducto(nombreItem)
      for (const p of productosNorm) {
        if (n.includes(p.norm)) return { id: p.id, nombre: p.nombre }
      }
      return null
    }

    const desde = new Date(Date.now() - ventanaDias * 86400000).toISOString().slice(0, 10)

    // factura_items no tiene restaurante_id propio (tabla hija) — se filtra vía facturas con
    // embed !inner, que SÍ filtra la tabla principal (a diferencia de un embed sin !inner, ver
    // feedback_postgrest_join). Paginado porque PostgREST devuelve máx. 1000 filas por request
    // y un restaurante activo puede tener miles de renglones de factura en 90 días (Bros: ~3000).
    const items: FacturaItemJoinRow[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('factura_items')
        .select('producto_nombre, unidad, precio_unitario, cantidad, facturas!inner(proveedor_nombre, fecha_factura, restaurante_id)')
        .eq('facturas.restaurante_id', RESTAURANTE_ID)
        .gte('facturas.fecha_factura', desde)
        .range(from, from + PAGE_SIZE - 1) as { data: FacturaItemJoinRow[] | null; error: unknown }
      if (error) return EMPTY
      if (!data?.length) break
      items.push(...data)
      if (data.length < PAGE_SIZE) break
    }

    if (!items.length) return EMPTY

    // Agrupar por producto de stock (matcheado) + unidad canónica de la factura
    const grupos: Record<string, GroupEntry[]> = {}
    const nombreCanonico: Record<string, string> = {}
    for (const it of items) {
      if (!it.precio_unitario || it.precio_unitario <= 0) continue
      if (!it.cantidad || it.cantidad <= 0) continue
      if (!it.facturas) continue
      const match = matchProducto(it.producto_nombre)
      if (!match) continue
      const key = `${match.id}||${canonUnit(it.unidad)}`
      nombreCanonico[match.id] = match.nombre
      if (!grupos[key]) grupos[key] = []
      grupos[key].push({
        proveedor: it.facturas.proveedor_nombre,
        precio: it.precio_unitario,
        fecha: it.facturas.fecha_factura,
        cantidad: it.cantidad,
      })
    }

    const comparador: ComparadorPrecioProducto[] = []
    const topSobreprecio: TopSobreprecioItem[] = []

    for (const key in grupos) {
      const entries = grupos[key]
      const sep = key.lastIndexOf('||')
      const productoId = key.slice(0, sep)
      const unidadCanon = key.slice(sep + 2)
      const proveedoresSet = new Set(entries.map(e => e.proveedor))
      if (proveedoresSet.size < 2) continue   // no hay con qué comparar

      // Último precio por proveedor (el más reciente de cada uno)
      const latestPorProveedor: Record<string, GroupEntry> = {}
      for (const e of entries) {
        const prev = latestPorProveedor[e.proveedor]
        if (!prev || e.fecha > prev.fecha) latestPorProveedor[e.proveedor] = e
      }
      const proveedoresLatest = Object.values(latestPorProveedor).sort((a, b) => a.precio - b.precio)
      const mejor = proveedoresLatest[0]

      // Última compra global (cualquier proveedor) — "lo último pagado"
      const ultimoPagado = entries.reduce((a, b) => (b.fecha > a.fecha ? b : a))
      const deltaUltimoPct = mejor.precio > 0 ? ((ultimoPagado.precio - mejor.precio) / mejor.precio) * 100 : 0
      const nombreProducto = nombreCanonico[productoId]

      comparador.push({
        productoId,
        producto: nombreProducto,
        unidad: unidadCanon,
        proveedores: proveedoresLatest.map(p => ({ proveedor: p.proveedor, precio: p.precio, fecha: p.fecha })),
        mejorPrecio: mejor.precio,
        mejorProveedor: mejor.proveedor,
        mejorFecha: mejor.fecha,
        ultimoPagado: { proveedor: ultimoPagado.proveedor, precio: ultimoPagado.precio, fecha: ultimoPagado.fecha },
        deltaUltimoPct,
      })

      // Ahorro potencial: todas las compras del período pagadas por encima del mejor precio
      let ahorro = 0
      let comprasNoOptimas = 0
      for (const e of entries) {
        if (e.precio > mejor.precio) {
          ahorro += (e.precio - mejor.precio) * e.cantidad
          comprasNoOptimas++
        }
      }
      if (ahorro > 0) {
        topSobreprecio.push({
          productoId,
          producto: nombreProducto,
          unidad: unidadCanon,
          mejorPrecio: mejor.precio,
          mejorProveedor: mejor.proveedor,
          ahorroPotencial: ahorro,
          comprasNoOptimas,
        })
      }
    }

    comparador.sort((a, b) => b.deltaUltimoPct - a.deltaUltimoPct)
    topSobreprecio.sort((a, b) => b.ahorroPotencial - a.ahorroPotencial)

    return { comparador, topSobreprecio: topSobreprecio.slice(0, 10) }
  }, [RESTAURANTE_ID, supabase])

  return { fetchComparador }
}
