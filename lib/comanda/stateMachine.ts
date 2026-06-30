import type { EstadoComanda, EstadoComandaItem } from '@/types'

// Transiciones válidas para la comanda completa
const COMANDA_TRANSITIONS: Record<EstadoComanda, EstadoComanda[]> = {
  abierta:   ['enviada', 'cancelada'],
  enviada:   ['en_prep', 'cancelada'],
  en_prep:   ['lista', 'cancelada'],
  lista:     ['cerrada', 'cancelada'],
  cerrada:   [],
  cancelada: [],
}

// Transiciones válidas para cada ítem (eventos KDS)
const ITEM_TRANSITIONS: Record<EstadoComandaItem, EstadoComandaItem[]> = {
  pendiente: ['en_prep'],
  en_prep:   ['listo', 'bumpeado'],
  listo:     ['en_prep'],        // recalled
  bumpeado:  [],
}

export function puedeTranicionarComanda(
  desde: EstadoComanda,
  hacia: EstadoComanda,
): boolean {
  return COMANDA_TRANSITIONS[desde]?.includes(hacia) ?? false
}

export function transicionarComanda(
  estado: EstadoComanda,
  hacia: EstadoComanda,
): EstadoComanda {
  if (!puedeTranicionarComanda(estado, hacia)) {
    throw new Error(`Transición inválida: ${estado} → ${hacia}`)
  }
  return hacia
}

export function puedeTranicionarItem(
  desde: EstadoComandaItem,
  hacia: EstadoComandaItem,
): boolean {
  return ITEM_TRANSITIONS[desde]?.includes(hacia) ?? false
}

export function transicionarItem(
  estado: EstadoComandaItem,
  hacia: EstadoComandaItem,
): EstadoComandaItem {
  if (!puedeTranicionarItem(estado, hacia)) {
    throw new Error(`Transición inválida de ítem: ${estado} → ${hacia}`)
  }
  return hacia
}

/** Devuelve true si todos los ítems de la comanda están en 'listo' o 'bumpeado' */
export function todosListos(items: { estado: EstadoComandaItem }[]): boolean {
  return items.length > 0 && items.every(i => i.estado === 'listo' || i.estado === 'bumpeado')
}
