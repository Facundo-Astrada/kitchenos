import type { EstadoReserva, OrigenReserva } from '@/types'

export const ESTADOS_RESERVA: EstadoReserva[] = ['pendiente', 'confirmada', 'sentada', 'no_show', 'cancelada']

export const ESTADO_RESERVA_CONFIG: Record<EstadoReserva, { label: string; icon: string; color: string }> = {
  pendiente: { label: 'Pendiente', icon: 'schedule', color: '#f59e0b' },
  confirmada: { label: 'Confirmada', icon: 'event_available', color: '#4361a0' },
  sentada: { label: 'Sentada', icon: 'check_circle', color: '#22c55e' },
  no_show: { label: 'No vino', icon: 'person_off', color: '#ef4444' },
  cancelada: { label: 'Cancelada', icon: 'cancel', color: '#94a3b8' },
}

export const ORIGENES_RESERVA: OrigenReserva[] = ['telefono', 'whatsapp', 'web', 'walk_in']

export const ORIGEN_RESERVA_CONFIG: Record<OrigenReserva, { label: string; icon: string }> = {
  telefono: { label: 'Teléfono', icon: 'call' },
  whatsapp: { label: 'WhatsApp', icon: 'chat' },
  web: { label: 'Web', icon: 'language' },
  walk_in: { label: 'Walk-in', icon: 'directions_walk' },
}
