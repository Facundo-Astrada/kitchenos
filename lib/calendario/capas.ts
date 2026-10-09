// Capas del Calendario — de dónde viene cada cosa que se pinta. Reemplazan a
// la leyenda colapsable: la referencia de colores y el filtro son el mismo
// control (un dato, un lugar). Solo `eventos` se carga acá; el resto son
// reflejos de solo lectura de otros módulos, con su destino para editarlos.

export type CapaId = 'eventos' | 'menus' | 'compras' | 'reservas' | 'pagos' | 'feriados'

export interface CapaConfig {
  id: CapaId
  label: string
  icon: string
  color: string
  /** Texto del detalle de un reflejo: dónde vive y se edita el dato. */
  origen?: string
}

export const CAPAS: CapaConfig[] = [
  { id: 'eventos',  label: 'Eventos',  icon: 'event',          color: '#3b82f6' },
  { id: 'menus',    label: 'Menús',    icon: 'restaurant_menu', color: '#8b5cf6', origen: 'Carta y Planificación' },
  { id: 'compras',  label: 'Entregas', icon: 'local_shipping', color: '#f97316', origen: 'Compras → Pedidos' },
  { id: 'reservas', label: 'Reservas', icon: 'event_seat',     color: '#14b8a6', origen: 'Reservas' },
  { id: 'pagos',    label: 'Pagos',    icon: 'payments',       color: '#64748b', origen: 'Compras → Facturas' },
  { id: 'feriados', label: 'Feriados', icon: 'flag',           color: '#ef4444', origen: 'Calendario oficial de feriados' },
]

export const CAPA_POR_ID = Object.fromEntries(CAPAS.map(c => [c.id, c])) as Record<CapaId, CapaConfig>

/** Pagos arranca apagada: la plata no es lo primero que busca quien abre el
 *  calendario (mismo criterio que sacó los banners de plata del Dashboard). */
export const CAPAS_DEFAULT: CapaId[] = ['eventos', 'menus', 'compras', 'reservas', 'feriados']
