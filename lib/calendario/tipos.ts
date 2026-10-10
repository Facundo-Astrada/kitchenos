// Tipos de evento del Calendario — sin 'use client' para que el servidor
// (herramientas del Coach) use la misma lista que la pantalla.

export type TipoEvento =
  | 'entrega_proveedor'
  | 'reserva_especial'
  | 'reservas_dia'
  | 'evento_equipo'
  | 'mantenimiento'
  | 'capacitacion'
  | 'visita_bromatologia'
  | 'ausencia'
  | 'otro'

export const TIPO_CONFIG: Record<TipoEvento, { label: string; icon: string; color: string }> = {
  entrega_proveedor:   { label: 'Entrega',           icon: 'local_shipping',    color: '#f97316' },
  reserva_especial:    { label: 'Reserva especial',  icon: 'restaurant',        color: '#8b5cf6' },
  reservas_dia:        { label: 'Reservas',          icon: 'event_seat',       color: '#14b8a6' },
  evento_equipo:       { label: 'Reunión / equipo',  icon: 'groups',            color: '#3b82f6' },
  mantenimiento:       { label: 'Mantenimiento',     icon: 'build',             color: '#ef4444' },
  capacitacion:        { label: 'Capacitación',      icon: 'school',            color: '#10b981' },
  visita_bromatologia: { label: 'Bromatología',      icon: 'verified_user',     color: '#ec4899' },
  ausencia:            { label: 'Vacaciones / franco', icon: 'beach_access',    color: '#0ea5e9' },
  otro:                { label: 'Otro',               icon: 'event',             color: '#6b7280' },
}

export const TODO_EL_DIA = { inicio: '00:00:00', fin: '23:59:00' }

/** Tipos que se pueden cargar a mano (reservas_dia es solo un reflejo). */
export const TIPOS_CARGABLES = (Object.keys(TIPO_CONFIG) as TipoEvento[]).filter(t => t !== 'reservas_dia')
