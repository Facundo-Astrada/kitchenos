import type { Notificacion } from '@/types'

/**
 * Cómo se nombra cada tipo de aviso en plural y singular, para agrupar
 * ("3 cambios en recetas" en vez de 3 avisos). Un tipo desconocido no se
 * inventa: se agrupa bajo el título de su primer aviso.
 */
const ETIQUETAS: Record<string, { singular: string; plural: string; icono: string }> = {
  turno_asignado: { singular: 'turno asignado', plural: 'turnos asignados', icono: 'event_available' },
  ruta_recordatorio: { singular: 'recordatorio de la ruta', plural: 'recordatorios de la ruta', icono: 'alt_route' },
  ruta_reconocimiento: { singular: 'avance de la ruta', plural: 'avances de la ruta', icono: 'emoji_events' },
  prueba: { singular: 'prueba', plural: 'pruebas', icono: 'science' },
}

export interface GrupoAvisos {
  tipo: string
  icono: string
  /** "3 turnos asignados" o, si es uno solo, su título. */
  titulo: string
  avisos: Notificacion[]
  /** El más reciente, para ordenar y para el link del grupo de uno. */
  ultimo: Notificacion
}

/** Agrupa por tipo, el grupo con el aviso más reciente primero. */
export function agruparAvisos(avisos: Notificacion[]): GrupoAvisos[] {
  const porTipo = new Map<string, Notificacion[]>()
  for (const n of avisos) {
    const lista = porTipo.get(n.tipo)
    if (lista) lista.push(n)
    else porTipo.set(n.tipo, [n])
  }
  const grupos: GrupoAvisos[] = []
  for (const [tipo, lista] of porTipo) {
    const ordenados = [...lista].sort((a, b) => b.created_at.localeCompare(a.created_at))
    const et = ETIQUETAS[tipo]
    grupos.push({
      tipo,
      icono: et?.icono ?? 'notifications',
      titulo: ordenados.length === 1 || !et ? ordenados[0].titulo : `${ordenados.length} ${et.plural}`,
      avisos: ordenados,
      ultimo: ordenados[0],
    })
  }
  return grupos.sort((a, b) => b.ultimo.created_at.localeCompare(a.ultimo.created_at))
}

/** Texto corto del popup: "2 avisos nuevos" o el título si es uno. */
export function resumenPopup(noLeidas: Notificacion[]): string {
  if (noLeidas.length === 0) return ''
  if (noLeidas.length === 1) return noLeidas[0].titulo
  return `${noLeidas.length} avisos nuevos`
}

/** Tipos presentes, para el filtro de /avisos. */
export function tiposPresentes(avisos: Notificacion[]): { tipo: string; label: string }[] {
  const vistos = new Set(avisos.map(a => a.tipo))
  return [...vistos].map(tipo => ({ tipo, label: ETIQUETAS[tipo] ? capitalizar(ETIQUETAS[tipo].plural) : tipo }))
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
