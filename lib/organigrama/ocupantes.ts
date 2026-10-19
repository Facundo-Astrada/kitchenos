/**
 * Quién ocupa un puesto, contando a los que lo cubren además de su puesto
 * principal (`equipo_miembros.puestos_extra`). Reemplaza la comparación
 * `m.puesto_id === p.id` repetida por el organigrama.
 */

interface MiembroConPuestos {
  puesto_id: string | null
  puestos_extra?: string[] | null
}

/** Ids de los puestos de una persona: el principal primero, después los extra, sin repetir. */
export function puestosDeMiembro(m: MiembroConPuestos): string[] {
  const ids = [m.puesto_id, ...(m.puestos_extra ?? [])].filter((id): id is string => !!id)
  return [...new Set(ids)]
}

/**
 * `principales`: lo tienen como puesto principal. `tambien`: lo cubren como extra
 * (quien lo tiene de las dos formas cuenta solo como principal).
 */
export function ocupantesDePuesto<M extends MiembroConPuestos>(
  puestoId: string, miembros: readonly M[],
): { principales: M[]; tambien: M[] } {
  const principales = miembros.filter(m => m.puesto_id === puestoId)
  const tambien = miembros.filter(m => m.puesto_id !== puestoId && (m.puestos_extra ?? []).includes(puestoId))
  return { principales, tambien }
}

/** Un puesto no está vacante si alguien lo ocupa, como principal o como extra. */
export function puestoEstaCubierto(puestoId: string, miembros: readonly MiembroConPuestos[]): boolean {
  return miembros.some(m => puestosDeMiembro(m).includes(puestoId))
}
