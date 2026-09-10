// Nivel de estandarización de cada componente de la carta — sesión
// 2026-09-10 (pizarrón "Plato y componentes / Receta estandarizada N1-N2-N3").
// El nivel se DERIVA de datos ya cargados (ingredientes, peso_total_g,
// gramaje, costo_unitario) — nadie lo tipea a mano. Sube solo a medida que
// se carga el recetario; ninguna columna nueva.
//
// Dos ejes que no se pueden colapsar en uno:
//  - Eje RECETA: ¿tiene cuerpo, peso neto, costos de factura? (propiedad de
//    la receta en sí, se comparte entre todos los platos/menús que la usan)
//  - Eje VÍNCULO: ¿se sabe cuánto de esa receta entra en ESTE plato/menú?
//    (propiedad de plato_recetas o menu_preparaciones — el gramaje)
// Una mayonesa puede ser N3 en sí misma y el plato igual no costear porque
// nadie cargó el gramaje. El nivel del COMPONENTE es el mínimo de los dos.
//
// Sep 2026 (misma sesión): se sumaron los Menús. Estandarización solo leía
// carta_items/plato_recetas — un restaurante que trabaja mucho por menú fijo
// (ej. un comedor) puede tener más recetas colgando de menu_preparaciones que
// de la carta a la carta, y esas quedaban invisibles acá. nivelDeMenu()
// analiza esa segunda fuente con la MISMA escala; analizarCarta() las suma a
// la misma cola/lista cuando se le pasan (parámetro opcional — sin él, el
// comportamiento es idéntico al de antes, lo que usa useRutaImplantacion.ts).

import type { Receta } from '@/types'
import type { CartaItemEnriquecido, PlatoRecetaEnriquecido } from '@/lib/hooks/useCarta'
import type { MenuPreparacion } from '@/lib/hooks/useMenus'
import { pesoTotalRecetaG, costoPorGramoDeReceta, gramajeDesdeCantidadOps } from './peso'
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
 * Aplica el eje vínculo sobre un diagnóstico de receta ya resuelto: sin
 * gramaje conocido, el componente no puede pasar de N1 aunque la receta
 * detrás esté perfecta — no se fabrica un food cost asumiendo "una porción
 * entera del batch". Si la receta ya está tapada en N0/N1 por su propio eje,
 * el gramaje no agrega información — se omite ese faltante para no repetir
 * el mismo bloqueo con otras palabras. Compartido por plato_recetas
 * (nivelDeComponente) y menu_preparaciones (nivelDeMenu).
 */
function conGramajeCap(base: DiagnosticoNivel, gramajeEfectivoG: number | null, faltanteGramaje: string): DiagnosticoNivel {
  if (base.nivel <= 1) return base
  if (gramajeEfectivoG == null) {
    return { nivel: 1, faltantes: [faltanteGramaje, ...base.faltantes], costoPorGramo: base.costoPorGramo, costoVerificado: false }
  }
  return base
}

/** Eje componente de un plato de Carta — ver conGramajeCap. */
export function nivelDeComponente(pr: PlatoRecetaEnriquecido, recetasPorId?: Map<string, Receta>): DiagnosticoNivel {
  return conGramajeCap(nivelDeReceta(pr.receta, recetasPorId), pr.gramaje_efectivo_g, 'gramaje en este plato')
}

export interface ComponenteDiagnostico {
  // Agrupación en la cola de analizarCarta: receta_id cuando el componente
  // resuelve a una (plato_recetas o menu_preparaciones tipo 'receta') —
  // mismo espacio de ids en ambas fuentes, así que una receta usada en un
  // plato Y en un menú se agrupa en UNA sola fila ("destraba 3 platos y 2
  // menús"). Sintética cuando no hay receta_id que compartir (link directo
  // plato=receta, o una preparación de menú sin vincular).
  key: string
  nombre: string
  diag: DiagnosticoNivel
  // Dónde arreglar ESTE componente, cuando es distinto de la entidad que lo
  // contiene — el único caso hoy es un menú que reusa un plato entero
  // (menu_preparaciones tipo 'plato'): el arreglo real es en el plato (su
  // gramaje/procedimiento/costos), no en el menú. undefined = usar la
  // entidad contenedora (el caso normal).
  origen?: { id: string; tipo: 'plato' | 'menu' }
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
        key: pr.receta_id, nombre: pr.receta?.nombre ?? '(receta eliminada)', diag: nivelDeComponente(pr, recetasPorId),
      }))
    : item.receta
      ? [{ key: `directa:${item.id}`, nombre: item.receta.nombre, diag: nivelDeReceta(item.receta, recetasPorId) }]
      : []

  if (componentes.length === 0) {
    return { nivel: 0, faltantes: ['cargar componentes o vincular una receta'], costoPorGramo: null, costoVerificado: false, componentes: [] }
  }

  const peor = componentes.reduce((min, c) => (c.diag.nivel < min.diag.nivel ? c : min))
  return { ...peor.diag, componentes }
}

// Gramaje efectivo de una preparación de menú. menu_preparaciones no tiene
// columna `gramaje` propia (a diferencia de plato_recetas, que la sumó en
// sep 2026) — prioriza `peso_porcion` (tamaño real confirmado en el mise,
// misma idea que checklist_items.peso_porcion) y si no hay, deriva de
// `cantidad`+`unidad` cuando están en peso/volumen (mismo criterio que
// gramajeDesdeCantidadOps ya usa para plato_recetas.cantidad_ops).
function gramajeEfectivoMenuPrep(mp: MenuPreparacion): number | null {
  if (mp.peso_porcion != null) return gramajeDesdeCantidadOps(mp.peso_porcion, mp.peso_porcion_unidad).gramaje
  return gramajeDesdeCantidadOps(mp.cantidad, mp.unidad).gramaje
}

/**
 * Igual que nivelDePlato pero para un Menú: sus "componentes" son las
 * menu_preparaciones. `tipo:'producto'` se excluye (mismo límite declarado
 * que los productos comprados de un plato — no hay receta que estandarizar).
 *
 * `tipo:'plato'` (el menú reusa un plato entero de la carta, ej. "Noche de
 * Asado" arma su menú con platos que también están en la carta a la carta)
 * resuelve al nivel REAL de ese plato — `cartaItemsPorId` (opcional) trae el
 * mapa. Sin él, o si el plato no aparece ahí, cae a "sin receta" (N0) en vez
 * de fabricar un dato — más honesto que ocultarlo, aunque menos preciso que
 * resolverlo. `tipo: null` (preparación nunca vinculada a nada) también cae
 * a N0 — es información real, no ruido.
 */
export function nivelDeMenu(
  menu: { id: string; nombre: string; preparaciones: MenuPreparacion[] },
  recetasPorId?: Map<string, Receta>,
  cartaItemsPorId?: Map<string, CartaItemEnriquecido>,
): DiagnosticoPlato {
  const relevantes = menu.preparaciones.filter(mp => mp.tipo !== 'producto')

  const componentes: ComponenteDiagnostico[] = relevantes.map(mp => {
    if (mp.tipo === 'plato' && mp.ref_id) {
      const plato = cartaItemsPorId?.get(mp.ref_id)
      if (plato) {
        // El plato ya resuelve su propio gramaje/costo por sí solo (es un
        // plato real de la carta) — no se le vuelve a aplicar conGramajeCap,
        // eso ya está hecho dentro de nivelDePlato.
        return { key: `plato:${mp.ref_id}`, nombre: plato.nombre, diag: nivelDePlato(plato, recetasPorId), origen: { id: plato.id, tipo: 'plato' } }
      }
    }
    const receta = mp.tipo === 'receta' && mp.ref_id ? recetasPorId?.get(mp.ref_id) : undefined
    const diag = conGramajeCap(nivelDeReceta(receta, recetasPorId), gramajeEfectivoMenuPrep(mp), 'gramaje en este menú')
    return { key: mp.tipo === 'receta' && mp.ref_id ? mp.ref_id : `menuprep:${mp.id}`, nombre: mp.nombre, diag }
  })

  if (componentes.length === 0) {
    return { nivel: 0, faltantes: ['cargar preparaciones'], costoPorGramo: null, costoVerificado: false, componentes: [] }
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
  // Dónde aparece primero — para saltar directo a arreglarlo. 'plato' abre
  // el detalle de Carta (el gramaje se edita ahí, y desde ahí se abre la
  // receta); 'menu' abre el editor de composición del menú.
  primerId: string
  primerTipo: 'plato' | 'menu'
  faltantes: string[]
}

export interface AnalisisCarta {
  totalPlatos: number
  // 0 cuando analizarCarta se llama sin menús (comportamiento de siempre,
  // el que sigue usando useRutaImplantacion.ts).
  totalMenus: number
  totalComponentes: number
  porNivel: Record<Nivel, number>
  // Cuenta ENTIDADES (platos + menús cuando se pasan) por nivel — el nombre
  // quedó de cuando solo existían platos; no se separó para no romper el
  // único consumidor externo (useRutaImplantacion.ts, que llama sin menús).
  platosPorNivel: Record<Nivel, number>
  // FC calculable = todos sus componentes llegan a N2 (gramaje + costo estimado o mejor)
  platosQueCostean: number
  // Ordenada por impacto: la receta que, si sube, destraba más platos y
  // menús — no alfabético, no por antigüedad.
  cola: ColaItem[]
}

const nivelVacio = (): Record<Nivel, number> => ({ 0: 0, 1: 0, 2: 0, 3: 0 })

/**
 * Agregado de toda la carta (y, si se pasan, los Menús — misma escala,
 * misma cola: una receta que se usa en un plato Y en un menú fijo destraba
 * ambos a la vez). El alcance sigue siendo "lo que se sirve" — no las 500+
 * recetas del recetario completo que en la práctica no importan si nunca se
 * usan. La cola se ordena por cuántos platos+menús distintos destraba cada
 * receta (misma receta en 6 lugares pesa 6x más que una usada en 1).
 */
export function analizarCarta(
  items: CartaItemEnriquecido[],
  recetasPorId?: Map<string, Receta>,
  menus?: { id: string; nombre: string; preparaciones: MenuPreparacion[] }[],
  // Para que un menú que reusa un plato entero (menu_preparaciones tipo
  // 'plato') resuelva al nivel real de ESE plato en vez de a "sin receta".
  // Por defecto se arma de `items` — pero si `items` viene ya filtrado (ej.
  // por categoría/plaza en la vista), un plato filtrado-afuera igual debe
  // resolver bien: el caller puede pasar acá el mapa SIN filtrar.
  cartaItemsPorId?: Map<string, CartaItemEnriquecido>,
): AnalisisCarta {
  const porNivel = nivelVacio()
  const platosPorNivel = nivelVacio()
  let platosQueCostean = 0
  let totalComponentes = 0

  const resolverPlatosPorId = cartaItemsPorId ?? new Map(items.map(i => [i.id, i]))

  const porReceta = new Map<string, { nombre: string; nivel: Nivel; platos: Set<string>; primerId: string; primerTipo: 'plato' | 'menu'; faltantes: Set<string> }>()

  function acumular(diag: DiagnosticoPlato, id: string, nombre: string, tipo: 'plato' | 'menu') {
    platosPorNivel[diag.nivel]++
    if (diag.nivel >= 2) platosQueCostean++

    for (const c of diag.componentes) {
      totalComponentes++
      porNivel[c.diag.nivel]++

      // Normalmente "dónde arreglar" es la entidad que se está recorriendo
      // (el plato, el menú). El único caso distinto: un menú que reusa un
      // plato entero — c.origen apunta al PLATO (ahí vive el arreglo real:
      // su gramaje/procedimiento/costos), no al menú que lo referencia.
      const origenId = c.origen?.id ?? id
      const origenTipo = c.origen?.tipo ?? tipo

      const entry = porReceta.get(c.key) ?? { nombre: c.nombre, nivel: c.diag.nivel, platos: new Set<string>(), primerId: origenId, primerTipo: origenTipo, faltantes: new Set<string>() }
      entry.nivel = Math.min(entry.nivel, c.diag.nivel) as Nivel
      entry.platos.add(nombre)
      for (const f of c.diag.faltantes) entry.faltantes.add(f)
      porReceta.set(c.key, entry)
    }
  }

  for (const item of items) acumular(nivelDePlato(item, recetasPorId), item.id, item.nombre, 'plato')
  for (const menu of menus ?? []) acumular(nivelDeMenu(menu, recetasPorId, resolverPlatosPorId), menu.id, menu.nombre, 'menu')

  const cola: ColaItem[] = [...porReceta.entries()]
    .filter(([, v]) => v.nivel < 3)
    .map(([key, v]) => ({
      key, nombre: v.nombre, nivel: v.nivel,
      platosQueDestraba: v.platos.size,
      platos: [...v.platos],
      primerId: v.primerId,
      primerTipo: v.primerTipo,
      faltantes: [...v.faltantes],
    }))
    .sort((a, b) => b.platosQueDestraba - a.platosQueDestraba || a.nivel - b.nivel || a.nombre.localeCompare(b.nombre, 'es'))

  return { totalPlatos: items.length, totalMenus: (menus ?? []).length, totalComponentes, porNivel, platosPorNivel, platosQueCostean, cola }
}
