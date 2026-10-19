// A quién le llega el aviso de un evento — puro, sin dependencias de servidor:
// lo usan el formulario (para mostrar "le llega a N personas") y
// lib/calendario/avisar.ts (para mandarlo).

export type DestinoAviso =
  | { modo: 'todos' }
  | { modo: 'puestos'; ids: string[] }
  | { modo: 'personas'; ids: string[] }

import { puestosDeMiembro } from '@/lib/organigrama/ocupantes'

export interface MiembroAviso {
  auth_user_id: string; nombre: string; puesto_id: string | null
  /** Puestos que además del principal cubre: el aviso dirigido a ese puesto también le llega. */
  puestos_extra?: string[]
}

/** A quién le llega: los miembros con usuario que caen en el destino, menos el autor. */
export function destinatarios(destino: DestinoAviso, equipo: MiembroAviso[], autorId: string | null): string[] {
  const ids = destino.modo === 'todos' ? equipo
    : destino.modo === 'puestos' ? equipo.filter(m => puestosDeMiembro(m).some(id => destino.ids.includes(id)))
    : equipo.filter(m => destino.ids.includes(m.auth_user_id))
  return [...new Set(ids.map(m => m.auth_user_id))].filter(id => id !== autorId)
}

