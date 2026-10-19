/**
 * Suplentes sugeridos para un área, desde Polivalencia.
 *
 * Cubrir a un titular es poder hacer el trabajo solo, y eso ya se mide en la
 * matriz de competencias: nivel autónomo o referente en una plaza. Para un área
 * con plazas (Cocina) la sugerencia es "quien es autónomo en alguna plaza de
 * los puestos del área". Un área sin plazas (Compras, Salón…) no tiene nada
 * que medir, así que no sugiere: los suplentes ahí se eligen a mano.
 * Sugiere, no decide: el admin confirma.
 */

interface MiembroLite { id: string }
interface PuestoLite { area_key: string | null; plaza_default: string | null }

/** Plazas de OPS que dependen de un área: las `plaza_default` de sus puestos. */
export function plazasDelArea(areaKey: string, puestos: readonly PuestoLite[]): string[] {
  const plazas = puestos
    .filter(p => p.area_key === areaKey && p.plaza_default)
    .map(p => p.plaza_default as string)
  return [...new Set(plazas)]
}

/**
 * Ids sugeridos como suplentes: autónomos en alguna plaza del área, sin los que
 * ya son titulares ni los que ya están confirmados como suplentes.
 * `plazasQueCubre(id)` es la lectura de Polivalencia (`useCompetencias`).
 */
export function sugeridosParaArea(opts: {
  areaKey: string
  puestos: readonly PuestoLite[]
  miembros: readonly MiembroLite[]
  plazasQueCubre: (miembroId: string) => string[]
  excluir?: readonly string[]
}): string[] {
  const plazas = new Set(plazasDelArea(opts.areaKey, opts.puestos))
  if (plazas.size === 0) return []
  const fuera = new Set(opts.excluir ?? [])
  return opts.miembros
    .filter(m => !fuera.has(m.id) && opts.plazasQueCubre(m.id).some(p => plazas.has(p)))
    .map(m => m.id)
}
