// Orden físico de un sector de stock: estante por estante (por `orden`), dentro
// de cada estante grupo por grupo (por `orden`, los sueltos al final) y dentro
// de cada grupo por `productos.orden_sector`. Es el mismo orden que dibuja el
// board de Mesa de trabajo → Stock y el que camina Stockear en el celular, así
// el que cuenta recorre la estantería una sola vez.

export interface ProductoUbicado {
  id: string
  nombre: string
  estante_id?: string | null
  stock_grupo_id?: string | null
  orden_sector?: number | null
}

export interface EstanteOrden { id: string; orden: number }
export interface GrupoOrden { id: string; estante_id: string | null; orden: number }

const porOrden = (a: { orden: number }, b: { orden: number }) => a.orden - b.orden

function porPosicion(a: ProductoUbicado, b: ProductoUbicado) {
  return (a.orden_sector ?? 0) - (b.orden_sector ?? 0) || a.nombre.localeCompare(b.nombre, 'es')
}

export interface Bloque<P, G> {
  grupo: G | null   // null = sueltos del estante
  productos: P[]
}

/** Parte los productos de UN estante (o de lo suelto del sector) en bloques:
 * un bloque por grupo (aunque esté vacío, para poder soltar adentro) y al
 * final los sueltos. Un producto cuyo grupo no es de este estante cuenta como
 * suelto — no se pierde de vista. */
export function bloquesDeEstante<P extends ProductoUbicado, G extends GrupoOrden>(productos: P[], grupos: G[]): Bloque<P, G>[] {
  const ordenados = [...grupos].sort(porOrden)
  const ids = new Set(ordenados.map(g => g.id))
  const bloques: Bloque<P, G>[] = ordenados.map(g => ({
    grupo: g,
    productos: productos.filter(p => p.stock_grupo_id === g.id).sort(porPosicion),
  }))
  bloques.push({ grupo: null, productos: productos.filter(p => !p.stock_grupo_id || !ids.has(p.stock_grupo_id)).sort(porPosicion) })
  return bloques
}

/** Ordena los productos de un sector en el orden de recorrido. "Sin estante"
 * va al final, para no cortar el recorrido ya organizado. */
export function ordenarRecorrido<P extends ProductoUbicado>(productos: P[], estantes: EstanteOrden[], grupos: GrupoOrden[]): P[] {
  const estanteIdx = new Map([...estantes].sort(porOrden).map((e, i) => [e.id, i]))
  const sinEstante = estanteIdx.size
  const grupoPorId = new Map(grupos.map(g => [g.id, g]))
  const idxEstante = (p: P) => (p.estante_id != null ? estanteIdx.get(p.estante_id) : undefined) ?? sinEstante
  // Grupo válido solo si es del mismo estante que el producto; si no, suelto.
  const idxGrupo = (p: P) => {
    const g = p.stock_grupo_id ? grupoPorId.get(p.stock_grupo_id) : undefined
    return g && (g.estante_id ?? null) === (p.estante_id ?? null) ? g.orden : Number.MAX_SAFE_INTEGER
  }
  return [...productos].sort((a, b) =>
    idxEstante(a) - idxEstante(b) || idxGrupo(a) - idxGrupo(b) || porPosicion(a, b))
}
