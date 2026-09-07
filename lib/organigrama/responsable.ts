/**
 * Quién responde por cada módulo de K-OS.
 *
 * `puestos.permisos_app` responde "quién **puede** entrar". Esto responde
 * "quién **debe** ocuparse", que es otra pregunta y hasta sep 2026 no existía
 * en el código. La ruta de implantación la necesita para saber a quién avisarle
 * (ver `PLAN-IMPLANTACION-2026-09.md` § 4, hueco 4).
 *
 * No hay tabla nueva: se compone de dos cosas que ya existen —
 * `AREA_CATALOGO` (módulo → área dueña) y `area_capas` (área × capa →
 * responsables, la vista Cobertura de Organigrama).
 *
 * Nombrar un grupo en vez de una persona produce difusión de responsabilidad de
 * forma predecible, así que `responsableDeModulo()` devuelve **una** persona.
 * Cuando Cobertura tiene varios responsables cargados para esa (área, capa)
 * —socios, co-chefs— se toma el primero como destinatario y el resto queda en
 * `copia`: alguien tiene que ser el que responde, los demás se enteran.
 */
import {
  areaDuenaDeModulo, areasQueUsanModulo,
  type ModuloId, type AreaKey, type Capa,
} from '@/lib/constants'

/** Fila mínima de `area_capas` que necesita este módulo (subconjunto de `AreaCapaRow`). */
export interface CoberturaRow {
  area_key: string
  capa: Capa
  responsables: string[]
}

export interface ResponsableDeModulo {
  /** Id del miembro que responde. `null` = hueco de cobertura real. */
  miembroId: string | null
  /** Los demás responsables de esa (área, capa): se enteran, no responden. */
  copia: string[]
  areaKey: AreaKey
  areaNombre: string
  capa: Capa
  /**
   * Por qué no hay responsable, cuando `miembroId` es null. Sirve para que la UI
   * diga algo útil en vez de "sin asignar".
   */
  motivo?: 'sin-area-duena' | 'sin-responsable-en-capa' | 'ejecuta-el-equipo'
}

/**
 * La capa por defecto de cada módulo: en cuál de las 4 (Definir / Preparar /
 * Ejecutar / Controlar) cae el trabajo principal de ese módulo.
 *
 * Es un default, no una verdad: una misma estación de la ruta puede pedir otra
 * capa explícitamente (cargar el presupuesto es Definir; leerlo a fin de mes es
 * Controlar). Por eso `responsableDeModulo()` acepta una capa opcional.
 */
export const CAPA_POR_MODULO: Record<ModuloId, Capa> = {
  home: 'controlar',
  operaciones: 'ejecutar',
  tareas: 'ejecutar',
  recetario: 'definir',
  carta: 'definir',
  stock: 'preparar',
  pedidos: 'preparar',
  proveedores: 'preparar',
  facturas: 'preparar',
  merma: 'controlar',
  haccp: 'controlar',
  bitacora: 'controlar',
  reportes: 'controlar',
  ventas: 'controlar',
  presupuesto: 'definir',
  calendario: 'preparar',
  turnos: 'definir',
  equipo: 'preparar',
  organigrama: 'definir',
  configuracion: 'definir',
  checklist: 'preparar',
  produccion: 'ejecutar',
  pase: 'controlar',
  espacios: 'preparar',
  muro: 'ejecutar',
  salon: 'ejecutar',
  kds: 'ejecutar',
  clientes: 'preparar',
  reservas: 'preparar',
  coach: 'preparar',
}

/**
 * Resuelve quién responde por un módulo.
 *
 * `capa` sobreescribe el default de `CAPA_POR_MODULO` — usalo cuando la estación
 * de la ruta sabe mejor que el módulo (ej: presupuesto en Controlar al cierre).
 */
export function responsableDeModulo(
  modulo: ModuloId,
  cobertura: CoberturaRow[],
  capa?: Capa,
): ResponsableDeModulo | null {
  const area = areaDuenaDeModulo(modulo)
  if (!area) return null   // módulo huérfano: lo agarra el test de constants

  const capaEfectiva = capa ?? CAPA_POR_MODULO[modulo]
  const fila = cobertura.find(r => r.area_key === area.key && r.capa === capaEfectiva)
  const responsables = fila?.responsables ?? []

  if (responsables.length === 0) {
    return {
      miembroId: null,
      copia: [],
      areaKey: area.key,
      areaNombre: area.nombre,
      capa: capaEfectiva,
      // 'ejecutar' sin responsable no es un hueco: se ejecuta en equipo durante
      // el servicio. Misma regla que usa la vista Cobertura para no alertar.
      motivo: capaEfectiva === 'ejecutar' ? 'ejecuta-el-equipo' : 'sin-responsable-en-capa',
    }
  }

  return {
    miembroId: responsables[0],
    copia: responsables.slice(1),
    areaKey: area.key,
    areaNombre: area.nombre,
    capa: capaEfectiva,
  }
}

/**
 * Los módulos por los que responde una persona, según la cobertura cargada.
 * Es la vuelta inversa: sirve para la ficha del miembro y para no mandarle a
 * alguien un aviso de algo que no es suyo.
 */
export function modulosDeMiembro(miembroId: string, cobertura: CoberturaRow[]): ModuloId[] {
  const suyas = cobertura.filter(r => r.responsables.includes(miembroId))
  const out = new Set<ModuloId>()
  for (const row of suyas) {
    for (const m of Object.keys(CAPA_POR_MODULO) as ModuloId[]) {
      const area = areaDuenaDeModulo(m)
      if (area?.key === row.area_key && CAPA_POR_MODULO[m] === row.capa) out.add(m)
    }
  }
  return [...out]
}

/** Áreas que ven el módulo sin responder por él. Para explicarlo en la UI. */
export function areasEspectadoras(modulo: ModuloId): string[] {
  return areasQueUsanModulo(modulo).map(a => a.nombre)
}
