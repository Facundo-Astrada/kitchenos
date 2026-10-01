import { describe, it, expect } from 'vitest'
import { agruparAvisos, resumenPopup, tiposPresentes } from './agrupar'
import type { Notificacion } from '@/types'

const n = (id: string, tipo: string, titulo: string, created_at: string): Notificacion => ({
  id, restaurante_id: 'r', usuario_id: 'u', tipo, titulo, cuerpo: null, link: null, leida: false, created_at,
})

describe('agruparAvisos', () => {
  it('agrupa por tipo y nombra el grupo con la cantidad', () => {
    const g = agruparAvisos([
      n('1', 'turno_asignado', 'Turno noche asignado', '2026-10-01T10:00:00Z'),
      n('2', 'turno_asignado', 'Turno mañana asignado', '2026-10-01T11:00:00Z'),
      n('3', 'turno_asignado', 'Turno tarde asignado', '2026-10-01T12:00:00Z'),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].titulo).toBe('3 turnos asignados')
    expect(g[0].ultimo.id).toBe('3')
  })

  it('un grupo de uno conserva su título', () => {
    const g = agruparAvisos([n('1', 'turno_asignado', 'Turno noche asignado', '2026-10-01T10:00:00Z')])
    expect(g[0].titulo).toBe('Turno noche asignado')
  })

  it('un tipo desconocido no se renombra', () => {
    const g = agruparAvisos([
      n('1', 'algo_nuevo', 'Primero', '2026-10-01T10:00:00Z'),
      n('2', 'algo_nuevo', 'Segundo', '2026-10-01T11:00:00Z'),
    ])
    expect(g[0].titulo).toBe('Segundo')
  })

  it('ordena los grupos por el aviso más reciente', () => {
    const g = agruparAvisos([
      n('1', 'turno_asignado', 'a', '2026-10-01T10:00:00Z'),
      n('2', 'ruta_recordatorio', 'b', '2026-10-01T12:00:00Z'),
    ])
    expect(g.map(x => x.tipo)).toEqual(['ruta_recordatorio', 'turno_asignado'])
  })
})

describe('resumenPopup', () => {
  it('vacío, uno y varios', () => {
    expect(resumenPopup([])).toBe('')
    expect(resumenPopup([n('1', 'x', 'Hola', '2026-10-01T10:00:00Z')])).toBe('Hola')
    expect(resumenPopup([n('1', 'x', 'a', '2026-10-01T10:00:00Z'), n('2', 'x', 'b', '2026-10-01T10:00:00Z')])).toBe('2 avisos nuevos')
  })
})

describe('tiposPresentes', () => {
  it('lista cada tipo una vez', () => {
    const t = tiposPresentes([n('1', 'turno_asignado', 'a', 'x'), n('2', 'turno_asignado', 'b', 'x'), n('3', 'otro', 'c', 'x')])
    expect(t).toEqual([{ tipo: 'turno_asignado', label: 'Turnos asignados' }, { tipo: 'otro', label: 'otro' }])
  })
})
