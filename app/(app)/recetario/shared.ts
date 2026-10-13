import { parseNumero } from '@/lib/unidades'
import { toGramos } from '@/lib/recetas/peso'
import { FC_ALERT_HIGH, FC_ALERT_OK } from '@/lib/constants'

// Normaliza nombres de categoría con variantes históricas
export function normalizeCategoria(cat: string | null | undefined): string {
  if (!cat) return ''
  const lower = cat.toLowerCase().trim()
  const MAP: Record<string, string> = {
    entrantes: 'Entradas',
    garnishes: 'Guarniciones',
    guarniciones: 'Guarniciones',
    'carnes rojas': 'Carnes',
    otros: 'Otros',
    otras: 'Otros',
    other: 'Otros',
    'bases y salsas': 'Salsas',
    salsa: 'Salsas',
  }
  return MAP[lower] ?? (cat.charAt(0).toUpperCase() + cat.slice(1))
}

export function fcColor(pct: number) {
  if (pct >= FC_ALERT_HIGH) return '#ef4444'
  if (pct >= FC_ALERT_OK) return '#f59e0b'
  return '#4ade80'
}

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
  /** `nota`: aclaración del ingrediente que traía la fuente ("maduras", "tostado"). */
  ingredientes: { nombre: string; cantidad: string; unidad: string; nota?: string | null }[]
  procedimiento: string[]
}

// Forma que espera el formulario de "Nueva receta".
export interface IAResult {
  nombre?: string
  categoria?: string
  porciones?: number
  tiempo_min?: number
  ingredientes: { nombre: string; cantidad: string; unidad: string; nota?: string | null }[]
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

/** Parsea "0,3", "0.3" o "1.500,5" — ver parseNumero en lib/unidades.ts */
export const parseNum = parseNumero

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
