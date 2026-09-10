// Nivel de estandarización de cada componente de la carta — sesión
// 2026-09-10 (pizarrón "Plato y componentes / Receta estandarizada N1-N2-N3").
// El nivel se DERIVA de datos ya cargados (ingredientes, peso_total_g,
// gramaje, costo_unitario) — nadie lo tipea a mano. Sube solo a medida que
// se carga el recetario; ninguna columna nueva.
//
// Dos ejes que no se pueden colapsar en uno:
//  - Eje RECETA: ¿tiene cuerpo, peso neto, costos de factura? (propiedad de
//    la receta en sí, se comparte entre todos los platos que la usan)
//  - Eje VÍNCULO: ¿se sabe cuánto de esa receta entra en ESTE plato?
//    (propiedad de plato_recetas — el gramaje)
// Una mayonesa puede ser N3 en sí misma y el plato igual no costear porque
// nadie cargó el gramaje. El nivel del COMPONENTE es el mínimo de los dos.

import type { Receta } from '@/types'
import type { CartaItemEnriquecido, PlatoRecetaEnriquecido } from '@/lib/hooks/useCarta'
import { pesoTotalRecetaG, costoPorGramoDeReceta } from './peso'
import { calcFoodCost } from '@/lib/hooks/useRecetas'

export type Nivel = 0 | 1 | 2 | 3

export interface DiagnosticoNivel {
  nivel: Nivel
  // Nombrados y accionables — lo que hay que cargar para subir, no un % abstracto.
  faltantes: string[]
  costoPorGramo: number | null
  // false = pesoTotalRecetaG cayó al fallback (suma de ingredientes crudos):
  // el costo/g existe pero es una ESTIMACIÓN, no lo pesado real al terminar.
  costoVerificado: boolean
}

// "Cuerpo de receta útil": tiene ingredientes Y procedimiento. Sin esto no
// hay nada que costear más allá del nombre — mismo criterio que
// `faltaEstandarizar` en recetario/page.tsx (status draft también tapa acá).
function tieneCuerpo(r: Receta): boolean {
  if (r.status === 'draft') return false
  const ings = r.ingredientes ?? []
  return ings.length > 0 && !!(r.procedimiento && r.procedimiento.trim() !== '')
}

/**
 * Eje receta: el techo que la receta permite por sí sola, independiente de
 * en qué plato se use. N3 exige que TODOS los ingredientes vengan de un
 * producto de stock con costo cargado (factura real, no un número tipeado
 * de memoria) — ver decisión de sesión 2026-09-10.
 *
 * `recetasPorId` (opcional) resuelve ingredientes tipo "subreceta": esos NO
 * tienen producto_id propio (no son de stock, son otra receta) — sin el
 * mapa, contarían siempre como "sin costo" aunque la subreceta esté
 * perfecta. Con el mapa se recursa a su propio nivel. Solo 7 filas así en
 * toda la base (sep 2026) — bajo volumen, pero sin esto el resultado es
 * incorrecto, no solo impreciso. `visitados` corta un ciclo de subrecetas
 * (dato corrupto) sin recursión infinita.
 */
export function nivelDeReceta(
  r: Receta | undefined,
  recetasPorId?: Map<string, Receta>,
  visitados?: Set<string>,
): DiagnosticoNivel {
  if (!r) return { nivel: 0, faltantes: ['vincular una receta'], costoPorGramo: null, costoVerificado: false }
  if (visitados?.has(r.id)) {
    return { nivel: 1, faltantes: ['ciclo de subrecetas — revisar la carga'], costoPorGramo: null, costoVerificado: false }
  }

  if (!tieneCuerpo(r)) {
    const faltantes: string[] = []
    if (r.status === 'draft') faltantes.push('publicar la receta (sigue en borrador)')
    if ((r.ingredientes ?? []).length === 0) faltantes.push('cargar ingredientes')
    if (!r.procedimiento || r.procedimiento.trim() === '') faltantes.push('cargar procedimiento')
    return { nivel: 1, faltantes, costoPorGramo: null, costoVerificado: false }
  }

  const ings = r.ingredientes ?? []
  const faltantes: string[] = []

  const pesoG = pesoTotalRecetaG(r)
  const costoVerificado = r.peso_total_g != null && r.peso_total_g > 0
  if (pesoG == null) faltantes.push('peso neto')
  else if (!costoVerificado) faltantes.push('pesar el resultado final (hoy se estima por el crudo)')

  const sinCosto = ings.filter(i => {
    if (i.producto_id && (i.costo_unitario ?? 0) > 0) return false
    if (i.subreceta_id && recetasPorId) {
      const sub = recetasPorId.get(i.subreceta_id)
      const propios = new Set(visitados).add(r.id)
      return nivelDeReceta(sub, recetasPorId, propios).nivel < 3
    }
    return true
  })
  if (sinCosto.length > 0) {
    faltantes.push(sinCosto.length === 1
      ? `costo de 1 ingrediente (${sinCosto[0].nombre})`
      : `costo de ${sinCosto.length} ingredientes`)
  }

  const costoTotal = calcFoodCost(ings, 1, 0).costo_total
  const costoPorGramo = costoPorGramoDeReceta(r, costoTotal)

  // N3 = peso pesado (no estimado) + todos los ingredientes con costo real.
  if (costoVerificado && sinCosto.length === 0) return { nivel: 3, faltantes: [], costoPorGramo, costoVerificado }
  return { nivel: 2, faltantes, costoPorGramo, costoVerificado }
}

/**
 * Eje componente: nivelDeReceta acotado por si se sabe cuánto entra en ESTE
 * plato. Sin gramaje conocido el componente no puede pasar de N1 aunque la
 * receta detrás esté perfecta — el food cost del plato no se puede fabricar
 * asumiendo "una porción entera del batch" (mismo criterio que
 * tieneComponentesSinEstandarizar en useCarta.ts).
 *
 * Si la receta ya está tapada en N0/N1 por su propio eje, el gramaje no
 * agrega información — se omite ese faltante para no repetir el mismo
 * bloqueo con otras palabras.
 */
export function nivelDeComponente(pr: PlatoRecetaEnriquecido, recetasPorId?: Map<string, Receta>): DiagnosticoNivel {
  const base = nivelDeReceta(pr.receta, recetasPorId)
  if (base.nivel <= 1) return base

  if (pr.gramaje_efectivo_g == null) {
    return { nivel: 1, faltantes: ['gramaje en este plato', ...base.faltantes], costoPorGramo: base.costoPorGramo, costoVerificado: false }
  }
  return base
}

export interface ComponenteDiagnostico {
  pr: PlatoRecetaEnriquecido | null
  nombre: string
  diag: DiagnosticoNivel
}

export interface DiagnosticoPlato extends DiagnosticoNivel {
  componentes: ComponenteDiagnostico[]
}

/**
 * Nivel del plato = el mínimo de sus componentes (un plato vale lo que vale
 * su componente más flojo). Sin componentes ni receta_id directa → N0: ni
 * siquiera existe la línea. Con receta_id directa y sin plato_recetas, el
 * plato ES esa receta — se trata como un único componente (sin eje de
 * gramaje: el food cost de ese caso ya usa porciones, no un gramaje
 * cargado, ver useCarta.ts).
 */
export function nivelDePlato(item: CartaItemEnriquecido, recetasPorId?: Map<string, Receta>): DiagnosticoPlato {
  const componentes: ComponenteDiagnostico[] = item.plato_recetas.length > 0
    ? item.plato_recetas.map(pr => ({
        pr, nombre: pr.receta?.nombre ?? '(receta eliminada)', diag: nivelDeComponente(pr, recetasPorId),
      }))
    : item.receta
      ? [{ pr: null, nombre: item.receta.nombre, diag: nivelDeReceta(item.receta, recetasPorId) }]
      : []

  if (componentes.length === 0) {
    return { nivel: 0, faltantes: ['cargar componentes o vincular una receta'], costoPorGramo: null, costoVerificado: false, componentes: [] }
  }

  const peor = componentes.reduce((min, c) => (c.diag.nivel < min.diag.nivel ? c : min))
  return { ...peor.diag, componentes }
}

export interface ColaItem {
  key: string
  nombre: string
  nivel: Nivel
  platosQueDestraba: number
  platos: string[]
  // Primer carta_item.id donde aparece — para saltar directo a arreglarlo
  // (el gramaje se edita en Carta; desde ahí también se abre la receta).
  primerPlatoId: string
  faltantes: string[]
}

export interface AnalisisCarta {
  totalPlatos: number
  totalComponentes: number
  porNivel: Record<Nivel, number>
  platosPorNivel: Record<Nivel, number>
  // FC calculable = todos sus componentes llegan a N2 (gramaje + costo estimado o mejor)
  platosQueCostean: number
  // Ordenada por impacto: la receta que, si sube, destraba más platos —
  // no alfabético, no por antigüedad. Solo entran componentes de receta
  // (pr !== null); una receta directa de un solo plato también cuenta.
  cola: ColaItem[]
}

const nivelVacio = (): Record<Nivel, number> => ({ 0: 0, 1: 0, 2: 0, 3: 0 })

/**
 * Agregado de toda la carta. El alcance es "lo que llega a un plato" — no
 * las 500+ recetas del recetario completo, que en la práctica no importan
 * si nunca se usan. La cola se ordena por cuántos platos distintos destraba
 * cada receta (misma receta en 6 platos pesa 6x más que una usada en 1).
 */
export function analizarCarta(items: CartaItemEnriquecido[], recetasPorId?: Map<string, Receta>): AnalisisCarta {
  const porNivel = nivelVacio()
  const platosPorNivel = nivelVacio()
  let platosQueCostean = 0
  let totalComponentes = 0

  // key = receta_id (componente vía plato_recetas) o carta_item.id (receta
  // directa) — agrupa el mismo componente cuando aparece en varios platos.
  const porReceta = new Map<string, { nombre: string; nivel: Nivel; platos: Set<string>; primerPlatoId: string; faltantes: Set<string> }>()

  for (const item of items) {
    const diag = nivelDePlato(item, recetasPorId)
    platosPorNivel[diag.nivel]++
    if (diag.nivel >= 2) platosQueCostean++

    for (const c of diag.componentes) {
      totalComponentes++
      porNivel[c.diag.nivel]++

      const key = c.pr?.receta_id ?? `directa:${item.id}`
      const entry = porReceta.get(key) ?? { nombre: c.nombre, nivel: c.diag.nivel, platos: new Set<string>(), primerPlatoId: item.id, faltantes: new Set<string>() }
      entry.nivel = Math.min(entry.nivel, c.diag.nivel) as Nivel
      entry.platos.add(item.nombre)
      for (const f of c.diag.faltantes) entry.faltantes.add(f)
      porReceta.set(key, entry)
    }
  }

  const cola: ColaItem[] = [...porReceta.entries()]
    .filter(([, v]) => v.nivel < 3)
    .map(([key, v]) => ({
      key, nombre: v.nombre, nivel: v.nivel,
      platosQueDestraba: v.platos.size,
      platos: [...v.platos],
      primerPlatoId: v.primerPlatoId,
      faltantes: [...v.faltantes],
    }))
    .sort((a, b) => b.platosQueDestraba - a.platosQueDestraba || a.nivel - b.nivel || a.nombre.localeCompare(b.nombre, 'es'))

  return { totalPlatos: items.length, totalComponentes, porNivel, platosPorNivel, platosQueCostean, cola }
}
