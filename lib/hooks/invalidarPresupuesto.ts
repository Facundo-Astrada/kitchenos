'use client'

import { mutate } from 'swr'

// usePresupuestoCMV cachea con SWR bajo `presupuesto-cmv|{restauranteId}|{mes}`
// y no se revalida solo — sin esto, cargar una factura o una venta en otra
// pantalla no se refleja en Presupuesto hasta salir y volver a entrar (y
// esperar el dedupingInterval). Se llama tras cualquier escritura que afecte
// el CMV: alta/edición/baja de factura, alta/baja de venta, recategorización.
export function invalidarPresupuesto() {
  mutate(key => typeof key === 'string' && key.startsWith('presupuesto-cmv|'), undefined, { revalidate: true })
}
