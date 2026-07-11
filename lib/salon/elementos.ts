import type { ElementoTipo } from '@/types'

// Config compartida de elementos decorativos del salón — usada por el editor
// (app/(servicio)/salon/config/page.tsx) y por el mapa real (app/(servicio)/salon/page.tsx).
export const ELEMENTO_TIPOS: { id: ElementoTipo; label: string; icon: string; ancho: number; alto: number; color: string }[] = [
  { id: 'barra',    label: 'Barra',    icon: 'countertops',   ancho: 26, alto: 8,  color: '#78716c' },
  { id: 'caja',     label: 'Caja',     icon: 'point_of_sale', ancho: 10, alto: 8,  color: '#78716c' },
  { id: 'parrilla', label: 'Parrilla', icon: 'outdoor_grill', ancho: 14, alto: 10, color: '#78716c' },
  { id: 'planta',   label: 'Planta',   icon: 'potted_plant',  ancho: 6,  alto: 6,  color: '#10b981' },
  { id: 'pared',    label: 'Pared',    icon: 'fence',         ancho: 24, alto: 3,  color: '#444444' },
  { id: 'otro',     label: 'Otro',     icon: 'category',      ancho: 10, alto: 10, color: '#4361a0' },
]

export function elementoCfg(tipo: ElementoTipo) {
  return ELEMENTO_TIPOS.find(t => t.id === tipo) ?? ELEMENTO_TIPOS[ELEMENTO_TIPOS.length - 1]
}
