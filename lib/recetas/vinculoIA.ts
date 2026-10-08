// Vínculo por IA de ingredientes que el nombre exacto no resolvió.
//
// El vínculo exacto (vinculo.ts) deja afuera lo obvio para una persona:
// "Leche" contra "Leche entera", "Salsa worcestershire" contra "Salsa
// inglesa", "Aceite de girasol" contra "Aceite natura". Acá se le pasa al
// modelo el catálogo del restaurante con referencias cortas (P12, R5) y para
// cada ingrediente devuelve hasta 3 candidatos y si la elección es segura.
// Seguro → se vincula solo; dudoso → el cocinero elige entre las opciones.
//
// Puro (sin fetch ni Supabase): lo usa /api/recetas/vincular-ia y se testea.

export type RefVinculo = { tipo: 'producto' | 'subreceta'; id: string }

export type ResultadoVinculoIA = {
  /** Índice del ingrediente en el pedido. */
  i: number
  /** Candidatos, el más probable primero. Vacío = nada del catálogo sirve. */
  opciones: RefVinculo[]
  segura: boolean
}

type ProductoCatalogo = { id: string; nombre: string; unidad: string }
type RecetaCatalogo = { id: string; nombre: string }

/** Catálogo en texto ("P0 | Leche entera | l") + tabla para traducir las refs a ids. */
export function armarCatalogo(productos: ProductoCatalogo[], recetas: RecetaCatalogo[]) {
  const refs = new Map<string, RefVinculo>()
  const lineas: string[] = ['INSUMOS DE STOCK (ref | nombre | unidad de compra):']
  productos.forEach((p, idx) => {
    const ref = `P${idx}`
    refs.set(ref, { tipo: 'producto', id: p.id })
    lineas.push(`${ref} | ${p.nombre} | ${p.unidad}`)
  })
  lineas.push('', 'RECETAS PROPIAS (preparaciones que se pueden usar como ingrediente):')
  recetas.forEach((r, idx) => {
    const ref = `R${idx}`
    refs.set(ref, { tipo: 'subreceta', id: r.id })
    lineas.push(`${ref} | ${r.nombre}`)
  })
  return { texto: lineas.join('\n'), refs }
}

export const ESQUEMA_VINCULO_IA = {
  type: 'object',
  properties: {
    resultados: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          i: { type: 'integer' },
          opciones: { type: 'array', items: { type: 'string' } },
          segura: { type: 'boolean' },
        },
        required: ['i', 'opciones', 'segura'],
        additionalProperties: false,
      },
    },
  },
  required: ['resultados'],
  additionalProperties: false,
} as const

export const SISTEMA_VINCULO_IA = `Sos el jefe de compras de una cocina profesional argentina. Te paso el catálogo de insumos del restaurante y una lista de ingredientes de una receta. Para cada ingrediente, decí qué insumo del catálogo es EL MISMO producto.

Reglas:
- Mismo producto aunque cambie el nombre: sinónimos, marcas, idioma, singular/plural, detalle de presentación ("Salsa worcestershire" = "Salsa inglesa"; "Aceite de girasol" = "Aceite Natura" porque Natura es aceite de girasol; "Sal" = "Sal fina").
- Nunca vincules a un producto distinto que solo comparte una palabra: "Dulce de leche" NO es leche, "Envase de aceite" NO es aceite, "Ajo en polvo" NO es ajo fresco salvo que la receta lo diga.
- Si el ingrediente es una preparación (ej. "Ajo asado", "Masa de pizza") y hay una RECETA propia que es eso, usá su ref R.
- "segura": true solo si hay UNA opción claramente correcta. Si hay varias plausibles y depende de la cocina (ej. "Leche" con "Leche entera" y "Leche en polvo"), "segura": false y listá hasta 3, la más probable primero.
- Si nada del catálogo es ese producto, opciones vacías.
- Usá solo refs que existan en el catálogo. Devolvé un resultado por cada ingrediente, con su índice "i".`

/** Texto del mensaje de usuario con los ingredientes numerados. */
export function armarPedido(ingredientes: { nombre: string; unidad?: string }[]): string {
  return 'INGREDIENTES DE LA RECETA:\n' + ingredientes
    .map((ing, i) => `${i} | ${ing.nombre}${ing.unidad ? ` (${ing.unidad})` : ''}`)
    .join('\n')
}

/**
 * Traduce la respuesta del modelo a ids, descartando lo que no se puede
 * creer: refs inventadas, índices fuera de rango, repetidos. Una "segura" sin
 * opciones válidas no es segura.
 */
export function interpretarRespuesta(
  crudo: unknown,
  refs: Map<string, RefVinculo>,
  cantidadIngredientes: number,
): ResultadoVinculoIA[] {
  const lista = (crudo as { resultados?: unknown })?.resultados
  if (!Array.isArray(lista)) return []
  const vistos = new Set<number>()
  const out: ResultadoVinculoIA[] = []
  for (const item of lista) {
    const { i, opciones, segura } = (item ?? {}) as { i?: unknown; opciones?: unknown; segura?: unknown }
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= cantidadIngredientes || vistos.has(i)) continue
    vistos.add(i)
    const ops: RefVinculo[] = []
    for (const ref of Array.isArray(opciones) ? opciones : []) {
      const r = typeof ref === 'string' ? refs.get(ref.trim().toUpperCase()) : undefined
      if (r && !ops.some(o => o.id === r.id)) ops.push(r)
      if (ops.length === 3) break
    }
    out.push({ i, opciones: ops, segura: segura === true && ops.length > 0 })
  }
  return out
}
