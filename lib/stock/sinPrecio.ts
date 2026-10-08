// Productos sin precio que pesan en el food cost — filtro "Sin precio" de
// Stock. Un ingrediente vinculado a un producto sin precio queda costeado en
// $0 (el trigger ingredientes_costo_desde_producto no tiene qué copiar), así
// que el orden es por cuántas recetas lo usan: cargar primero el precio de
// "Sal" (en 138 líneas de Bros) que el de algo que no usa ninguna receta.

type ProductoPrecio = { id: string; nombre: string; precio_unitario: number | null; activo?: boolean | null; fuera_de_uso?: boolean | null; es_produccion?: boolean | null }

// Fuera de uso no hace ruido; producción interna se costea desde su receta, no
// desde precio_unitario.
export function esSinPrecio(p: ProductoPrecio): boolean {
  return p.activo !== false && !p.fuera_de_uso && !p.es_produccion && !((p.precio_unitario ?? 0) > 0)
}

// producto_id → cantidad de recetas distintas que lo usan como ingrediente.
export function usoEnRecetas(recetas: { id: string; ingredientes?: { producto_id?: string | null }[] | null }[]): Map<string, number> {
  const uso = new Map<string, number>()
  for (const r of recetas) {
    const ids = new Set((r.ingredientes ?? []).map(i => i.producto_id).filter((id): id is string => !!id))
    for (const id of ids) uso.set(id, (uso.get(id) ?? 0) + 1)
  }
  return uso
}

// Más usado primero; a igual uso, alfabético.
export function ordenarPorUso<P extends { id: string; nombre: string }>(productos: P[], uso: Map<string, number>): P[] {
  return [...productos].sort((a, b) => (uso.get(b.id) ?? 0) - (uso.get(a.id) ?? 0) || a.nombre.localeCompare(b.nombre, 'es'))
}
