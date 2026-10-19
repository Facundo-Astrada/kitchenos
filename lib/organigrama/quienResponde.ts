/**
 * "Quién responde" — la vista de consulta del Organigrama, para todo el equipo.
 *
 * Una tarjeta por área activa, con las tres etapas que se le preguntan a alguien
 * (Definir → "Decide cómo se hace", Preparar → "Lo lleva día a día", Controlar →
 * "Revisa que salga bien") y los puestos del área con sus ocupantes. Ejecutar no
 * se muestra: es de todo el equipo. El primero de cada lista es el titular
 * (misma regla que `responsableDeModulo`); el resto son suplentes.
 *
 * Todo sale de datos que la pantalla ya carga: `areas`, `area_capas`, `puestos`
 * y `equipo_miembros`. Sin query nueva.
 */
import { ocupantesDePuesto } from '@/lib/organigrama/ocupantes'
import type { Capa } from '@/lib/constants'

export type EtapaConsulta = 'decide' | 'lleva' | 'revisa'

/** Capa de cobertura que responde a cada pregunta. */
export const CAPA_DE_ETAPA: Record<EtapaConsulta, Capa> = {
  decide: 'definir',
  lleva: 'preparar',
  revisa: 'controlar',
}

export const ETAPAS_CONSULTA: { key: EtapaConsulta; label: string }[] = [
  { key: 'decide', label: 'Decide cómo se hace' },
  { key: 'lleva', label: 'Lo lleva día a día' },
  { key: 'revisa', label: 'Revisa que salga bien' },
]

interface MiembroLite { id: string; nombre: string; apellido: string; puesto_id: string | null; puestos_extra?: string[] | null }
interface PuestoLite { id: string; nombre: string; area_key: string | null; tareas_funciones: string[] }
interface AreaLite {
  key: string; nombre: string; icon: string; color: string; ejemplos?: string; explicacion: string
  activa: boolean; responsables: string[]
}

export interface Etapa<M> {
  titular: M | null
  suplentes: M[]
}

export interface TarjetaQuienResponde<M extends MiembroLite, P extends PuestoLite, A extends AreaLite> {
  area: A
  etapas: Record<EtapaConsulta, Etapa<M>>
  puestos: { puesto: P; principales: M[]; tambien: M[] }[]
}

function etapaDe<M extends MiembroLite>(ids: string[], miembros: readonly M[]): Etapa<M> {
  const personas = ids.map(id => miembros.find(m => m.id === id)).filter((m): m is M => !!m)
  return { titular: personas[0] ?? null, suplentes: personas.slice(1) }
}

export function armarTarjetas<M extends MiembroLite, P extends PuestoLite, A extends AreaLite>(opts: {
  areas: readonly A[]
  puestos: readonly P[]
  miembros: readonly M[]
  capaResponsables: (areaKey: string, capa: Capa) => string[]
}): TarjetaQuienResponde<M, P, A>[] {
  return opts.areas.filter(a => a.activa).map(area => ({
    area,
    etapas: {
      decide: etapaDe(opts.capaResponsables(area.key, CAPA_DE_ETAPA.decide), opts.miembros),
      lleva: etapaDe(opts.capaResponsables(area.key, CAPA_DE_ETAPA.lleva), opts.miembros),
      revisa: etapaDe(opts.capaResponsables(area.key, CAPA_DE_ETAPA.revisa), opts.miembros),
    },
    puestos: opts.puestos.filter(p => p.area_key === area.key).map(puesto => ({
      puesto, ...ocupantesDePuesto(puesto.id, opts.miembros),
    })),
  }))
}

/** Minúsculas y sin tildes, para que "calefon" encuentre "Calefón". */
export function normalizarBusqueda(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

/**
 * Filtra por nombre del área, sus `ejemplos` y las tareas de sus puestos. Cada
 * palabra de la búsqueda tiene que aparecer en algún lado de la tarjeta.
 */
export function filtrarTarjetas<T extends TarjetaQuienResponde<MiembroLite, PuestoLite, AreaLite>>(
  tarjetas: readonly T[], busqueda: string,
): T[] {
  const palabras = normalizarBusqueda(busqueda).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return [...tarjetas]
  return tarjetas.filter(t => {
    const pajar = normalizarBusqueda([
      t.area.nombre, t.area.ejemplos ?? '',
      ...t.puestos.flatMap(p => [p.puesto.nombre, ...p.puesto.tareas_funciones]),
    ].join(' | '))
    return palabras.every(p => pajar.includes(p))
  })
}

/**
 * A quién mandar a quien ve un hueco que no puede resolver: el titular de
 * Dirección (quien decide), o el responsable del área si Dirección no cargó etapas.
 */
export function titularDeDireccion<M extends MiembroLite>(opts: {
  miembros: readonly M[]
  capaResponsables: (areaKey: string, capa: Capa) => string[]
  responsablesArea: string[]
}): M | null {
  const id = opts.capaResponsables('direccion', 'definir')[0] ?? opts.responsablesArea[0]
  return opts.miembros.find(m => m.id === id) ?? null
}

/** La lista con `id` en el primer lugar (el titular), sin tocar el orden del resto. */
export function moverAlPrimerLugar(ids: readonly string[], id: string): string[] {
  if (!ids.includes(id)) return [...ids]
  return [id, ...ids.filter(x => x !== id)]
}

/** Resumen para el Coach: quién decide / lleva / revisa en cada área activa, con nombre de pila y apellido. */
export function mapaParaCoach<M extends MiembroLite, P extends PuestoLite, A extends AreaLite>(
  tarjetas: readonly TarjetaQuienResponde<M, P, A>[],
): { area: string; decide: string | null; lleva: string | null; revisa: string | null }[] {
  const nombre = (e: Etapa<M>) => e.titular ? `${e.titular.nombre} ${e.titular.apellido}`.trim() : null
  return tarjetas.map(t => ({
    area: t.area.nombre,
    decide: nombre(t.etapas.decide),
    lleva: nombre(t.etapas.lleva),
    revisa: nombre(t.etapas.revisa),
  }))
}
