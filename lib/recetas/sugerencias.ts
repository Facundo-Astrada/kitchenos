// Sugerencias del campo "ingrediente" al cargar una receta: productos de Stock
// y recetas (subrecetas), ordenados por relevancia.
//
// Antes cada fila filtraba con `includes` y cortaba en 6 en el orden de la
// base: tipear "papa" en Bros traía "Fecula de papa" primero y dejaba afuera
// "Papa" ($2.210/kg) y todas las recetas. Ahora el que empieza igual va
// primero, los acentos no cuentan y aparecen también las recetas — mismo
// criterio que el alta de ingrediente en OPS (RecetaQuickEditModal).

import { normalizarBusqueda } from '@/lib/texto'

export type SugerenciaIngrediente = {
  tipo: 'producto' | 'subreceta'
  id: string
  nombre: string
  /** Unidad del precio: la del producto, o 'g' para una subreceta (se costea por peso). */
  unidad: string
  costoUnitario: number
  detalle: string
}

type ProductoBuscable = { id: string; nombre: string; unidad: string; precio_unitario: number }
type RecetaBuscable = { id: string; nombre: string; costoPorGramo?: number | null }

export function sugerenciaDeProducto(p: ProductoBuscable): SugerenciaIngrediente {
  const precio = p.precio_unitario || 0
  return {
    tipo: 'producto', id: p.id, nombre: p.nombre, unidad: p.unidad, costoUnitario: precio,
    detalle: precio > 0 ? `$${precio.toLocaleString('es-AR', { maximumFractionDigits: 2 })}/${p.unidad}` : `sin precio · ${p.unidad}`,
  }
}

// Subreceta: siempre por gramaje (ver CargaRapidaIngredientes.tsx). Sin peso
// cargado no hay $/g real — queda en 0 para que se note el hueco.
export function sugerenciaDeReceta(r: RecetaBuscable): SugerenciaIngrediente {
  const cpg = r.costoPorGramo ?? 0
  return {
    tipo: 'subreceta', id: r.id, nombre: r.nombre, unidad: 'g', costoUnitario: cpg,
    detalle: cpg > 0 ? `receta · $${(cpg * 1000).toLocaleString('es-AR', { maximumFractionDigits: 0 })}/kg` : 'receta · falta peso',
  }
}

/**
 * 0 = igual, 1 = empieza con la búsqueda, 2 = alguna palabra empieza con ella,
 * 3 = la contiene, 4 = contiene todas las palabras sueltas. -1 = no coincide.
 */
export function puntajeCoincidencia(nombre: string, query: string): number {
  const n = normalizarBusqueda(nombre)
  const q = normalizarBusqueda(query)
  if (!q) return -1
  if (n === q) return 0
  if (n.startsWith(q)) return 1
  if (n.split(/[\s.,_\-/()]+/).some(w => w.startsWith(q))) return 2
  if (n.includes(q)) return 3
  const tokens = q.split(' ').filter(Boolean)
  if (tokens.length > 1 && tokens.every(t => n.includes(t))) return 4
  return -1
}

export function buscarSugerenciasIngrediente(
  query: string,
  productos: ProductoBuscable[],
  recetas: RecetaBuscable[],
  { limite = 10, excluirRecetaId }: { limite?: number; excluirRecetaId?: string } = {},
): SugerenciaIngrediente[] {
  if (!normalizarBusqueda(query)) return []

  type Candidato = SugerenciaIngrediente & { puntaje: number }
  const candidatos: Candidato[] = []

  // Productos con el mismo nombre (duplicados de carga, ej. dos "Papa") se
  // muestran una vez: el que tiene precio, que es el que costea.
  const porNombre = new Map<string, Candidato>()
  for (const p of productos) {
    const puntaje = puntajeCoincidencia(p.nombre, query)
    if (puntaje < 0) continue
    const precio = p.precio_unitario || 0
    const c: Candidato = { ...sugerenciaDeProducto(p), puntaje }
    const clave = normalizarBusqueda(p.nombre)
    const previo = porNombre.get(clave)
    if (!previo || (previo.costoUnitario <= 0 && precio > 0)) porNombre.set(clave, c)
  }
  candidatos.push(...porNombre.values())

  for (const r of recetas) {
    if (r.id === excluirRecetaId) continue
    const puntaje = puntajeCoincidencia(r.nombre, query)
    if (puntaje < 0) continue
    candidatos.push({ ...sugerenciaDeReceta(r), puntaje })
  }

  candidatos.sort((a, b) =>
    a.puntaje - b.puntaje
    // A igual coincidencia, el insumo antes que la receta y el que tiene precio antes.
    || (a.tipo === b.tipo ? 0 : a.tipo === 'producto' ? -1 : 1)
    || (b.costoUnitario > 0 ? 1 : 0) - (a.costoUnitario > 0 ? 1 : 0)
    || a.nombre.length - b.nombre.length
    || a.nombre.localeCompare(b.nombre, 'es'),
  )

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return candidatos.slice(0, limite).map(({ puntaje, ...s }) => s)
}
