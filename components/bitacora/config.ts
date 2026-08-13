import type { BitacoraTipo } from '@/types'

export const BITACORA_TIPO_CONFIG: Record<BitacoraTipo, { label: string; icon: string; color: string }> = {
  reunion: { label: 'Reunión', icon: 'groups', color: '#4361a0' },
  nota: { label: 'Nota', icon: 'sticky_note_2', color: '#f59e0b' },
  lista: { label: 'Lista', icon: 'checklist', color: '#10b981' },
  idea: { label: 'Idea', icon: 'lightbulb', color: '#8b5cf6' },
}

export const BITACORA_TIPOS: BitacoraTipo[] = ['reunion', 'nota', 'lista', 'idea']

// Cuánto crece `orden` entre dos líneas consecutivas — deja lugar de sobra
// para insertar (Enter en medio del documento) sin renumerar todo el tiempo.
export const BITACORA_ORDEN_STEP = 1000
