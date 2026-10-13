import { mapRol } from './roles'

/**
 * Quién puede escribir o borrar la nota de una tarea de Producción.
 *
 * - Chef, sous chef y admin: cualquier nota, y agregar donde no hay.
 * - El resto: agregar donde todavía no hay nota, y editar/borrar solo la que
 *   escribió él mismo. Es una nota única por tarea (como la del mise), así que
 *   sin esto un ayudante pisaría lo que dejó el jefe de cocina para el turno
 *   siguiente.
 *
 * `rol` es el de la app o el crudo de la base: pasa por `mapRol` (un endpoint o
 * pantalla nunca compara el rol a mano — ver hooks.md, "usePermisos").
 */
export function puedeEditarNotaTarea(opts: {
  rol: string | null | undefined
  miembroId: string | null | undefined
  nota: string | null | undefined
  notaPorId: string | null | undefined
}): boolean {
  const rol = mapRol(opts.rol ?? '')
  if (rol === 'admin' || rol === 'chef') return true
  if (!opts.nota) return true
  return !!opts.miembroId && opts.notaPorId === opts.miembroId
}
