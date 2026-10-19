/**
 * "Quién responde" — la vista de consulta del Organigrama, para todo el equipo.
 *
 * Una tarjeta por área activa, con las tres etapas que se le preguntan a alguien
 * (Definir → "Decide cómo se hace", Preparar → "Lo lleva día a día", Controlar →
 * "Revisa que salga bien") y los puestos del área con sus ocupantes. Ejecutar no
 * se muestra: es de todo el equipo. Cada etapa tiene titulares (todos llevan lo
 * mismo, sin jerarquía: dos jefes de cocina que comparten el turno) y suplentes
 * (cubren si falta un titular; salen de Polivalencia y el admin confirma).
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
  titulares: M[]
  suplentes: M[]
}

export interface TarjetaQuienResponde<M extends MiembroLite, P extends PuestoLite, A extends AreaLite> {
  area: A
  etapas: Record<EtapaConsulta, Etapa<M>>
  puestos: { puesto: P; principales: M[]; tambien: M[] }[]
}

function personas<M extends MiembroLite>(ids: string[], miembros: readonly M[]): M[] {
  return ids.map(id => miembros.find(m => m.id === id)).filter((m): m is M => !!m)
}

function etapaDe<M extends MiembroLite>(titulares: string[], suplentes: string[], miembros: readonly M[]): Etapa<M> {
  return { titulares: personas(titulares, miembros), suplentes: personas(suplentes, miembros) }
}

export function armarTarjetas<M extends MiembroLite, P extends PuestoLite, A extends AreaLite>(opts: {
  areas: readonly A[]
  puestos: readonly P[]
  miembros: readonly M[]
  capaResponsables: (areaKey: string, capa: Capa) => string[]
  capaSuplentes: (areaKey: string, capa: Capa) => string[]
}): TarjetaQuienResponde<M, P, A>[] {
  const etapa = (areaKey: string, e: EtapaConsulta) =>
    etapaDe(opts.capaResponsables(areaKey, CAPA_DE_ETAPA[e]), opts.capaSuplentes(areaKey, CAPA_DE_ETAPA[e]), opts.miembros)
  return opts.areas.filter(a => a.activa).map(area => ({
    area,
    etapas: { decide: etapa(area.key, 'decide'), lleva: etapa(area.key, 'lleva'), revisa: etapa(area.key, 'revisa') },
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
 * A quién mandar a quien ve un hueco que no puede resolver: el primer titular de
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

/** Resumen para el Coach: quién decide / lleva / revisa en cada área activa (todos los titulares) y quién suplanta. */
export function mapaParaCoach<M extends MiembroLite, P extends PuestoLite, A extends AreaLite>(
  tarjetas: readonly TarjetaQuienResponde<M, P, A>[],
): { area: string; decide: string[]; lleva: string[]; revisa: string[]; suplentes: string[] }[] {
  const nombres = (ms: M[]) => ms.map(m => `${m.nombre} ${m.apellido}`.trim())
  return tarjetas.map(t => ({
    area: t.area.nombre,
    decide: nombres(t.etapas.decide.titulares),
    lleva: nombres(t.etapas.lleva.titulares),
    revisa: nombres(t.etapas.revisa.titulares),
    suplentes: [...new Set(nombres([...t.etapas.decide.suplentes, ...t.etapas.lleva.suplentes, ...t.etapas.revisa.suplentes]))],
  }))
}
