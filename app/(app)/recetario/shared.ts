// Tipos y helpers de importación IA compartidos entre recetario/page.tsx y
// recetario/IAResultScreens.tsx. Viven acá (y no en cualquiera de esos dos
// archivos) para que ninguno dependa del otro — page.tsx importa las
// pantallas de IAResultScreens.tsx, así que si estos helpers vivieran ahí
// habría un import circular.

// Forma cruda de lo que devuelve /api/recetas/import.
export interface IAApiResult {
  nombre_sugerido?: string
  categoria_sugerida?: string
  porciones?: number
  /**
   * Rendimiento de la receta ("Yield: 900g"). No tiene columna en `recetas`:
   * se extrae para que el modelo no lo meta en `porciones` —el PDF de 900g
   * venía entrando como "900 porciones"— y se muestra en la revisión.
   */
  rinde?: number | null
  rinde_unidad?: string | null
  tiempo_minutos?: number
  ingredientes: { nombre: string; cantidad: string; unidad: string }[]
  procedimiento: string[]
}

// Forma que espera el formulario de "Nueva receta".
export interface IAResult {
  nombre?: string
  categoria?: string
  porciones?: number
  tiempo_min?: number
  ingredientes: { nombre: string; cantidad: string; unidad: string }[]
  pasos: string[]
}

export function apiToForm(data: IAApiResult): IAResult {
  return {
    nombre: data.nombre_sugerido,
    categoria: data.categoria_sugerida,
    porciones: data.porciones,
    tiempo_min: data.tiempo_minutos,
    ingredientes: data.ingredientes || [],
    pasos: data.procedimiento || [],
  }
}

/** Parsea "0,3" o "0.3" → 0.3 */
export function parseNum(s: string | number | null | undefined): number {
  if (s === null || s === undefined) return 0
  if (typeof s === 'number') return isNaN(s) ? 0 : s
  return parseFloat(String(s).replace(',', '.')) || 0
}

function toGramos(cantidad: number, unidad: string): number {
  const u = (unidad || '').toLowerCase().trim()
  if (u === 'kg') return cantidad * 1000
  if (u === 'g') return cantidad
  if (u === 'l' || u === 'lt' || u === 'lts' || u === 'l') return cantidad * 1000
  if (u === 'ml') return cantidad
  return 0
}

export function calcPesoPorcion(ingredientes: { cantidad: number | string; unidad: string }[], porciones: number): number | null {
  if (!porciones || porciones <= 0) return null
  const totalG = ingredientes.reduce((s, i) => s + toGramos(parseNum(i.cantidad), i.unidad), 0)
  if (totalG <= 0) return null
  return Math.round(totalG / porciones)
}

export function formatPeso(gramos: number): string {
  if (gramos >= 1000) return `${(gramos / 1000).toFixed(gramos % 1000 === 0 ? 0 : 1)}kg/u`
  return `${gramos}g/u`
}
