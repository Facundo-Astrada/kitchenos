// Empareja los ítems de una lista de precios de proveedor con el Stock —
// lógica pura que vivía inline en facturas/page.tsx.
//
// Match: el mismo de las facturas (matchProducto: exacto, o el nombre del
// producto como palabras completas dentro del ítem). Antes era "contiene" en
// los dos sentidos y una lista con "Salsa de soja" pisaba el precio de "Sal".
// Precio: llevado a la unidad del producto en Stock (lista en $/g contra
// producto en kg → $/kg); precioConvertido null = no convertible, ese
// producto no se actualiza (auditoría 08/10/2026).
import { matchProducto } from './matching'
import { aUnidadDelProducto } from '@/lib/stock/precios'

type ItemLista = { producto_nombre: string; unidad?: string | null; precio_unitario: number }
type ProductoStock = { id: string; nombre: string; unidad: string; precio_unitario: number; peso_por_unidad_g?: number | null }

export function emparejarListaConStock<I extends ItemLista, P extends ProductoStock>(items: I[], productos: P[]) {
  return items.map(item => {
    const match = matchProducto(item.producto_nombre, productos)
    if (!match) {
      return { ...item, precioConvertido: item.precio_unitario as number | null, matchedProduct: null, status: 'nuevo' as const, priceDiff: null }
    }
    const precioConvertido = item.unidad
      ? aUnidadDelProducto({ cantidad: 1, unidad: item.unidad, precio_unitario: item.precio_unitario }, match)?.precio ?? null
      : item.precio_unitario
    const priceDiff = match.precio_unitario > 0 && precioConvertido != null
      ? ((precioConvertido - match.precio_unitario) / match.precio_unitario) * 100
      : null
    const status = priceDiff !== null && Math.abs(priceDiff) < 1 ? 'sin_cambio' as const : 'actualiza' as const
    return { ...item, precioConvertido, matchedProduct: match as P | null, status, priceDiff }
  })
}
