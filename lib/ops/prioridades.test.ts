import { describe, it, expect } from 'vitest'
import { PRIORIDADES, metaTarea, metaMise, miseATarea, tareaAMise, ordenPrioridad, esPrincipal } from './prioridades'

describe('catálogo de prioridades', () => {
  it('cada prioridad de tarea y de mise tiene su par, sin repetidos', () => {
    expect(new Set(PRIORIDADES.map(p => p.tarea)).size).toBe(PRIORIDADES.length)
    expect(new Set(PRIORIDADES.map(p => p.mise)).size).toBe(PRIORIDADES.length)
    for (const p of PRIORIDADES) {
      expect(miseATarea(p.mise)).toBe(p.tarea)
      expect(tareaAMise(p.tarea)).toBe(p.mise)
    }
  })

  it('conserva el mapeo histórico sp/p/ref/chk ↔ critica/alta/media/baja', () => {
    expect(tareaAMise('critica')).toBe('sp')
    expect(tareaAMise('alta')).toBe('p')
    expect(tareaAMise('media')).toBe('ref')
    expect(tareaAMise('baja')).toBe('chk')
    expect(miseATarea('sp')).toBe('critica')
    expect(miseATarea('chk')).toBe('baja')
  })

  it('ordena SP · P · CARGAR · DESCONGELAR · REF · Check', () => {
    const orden = [...PRIORIDADES].sort((a, b) => ordenPrioridad(a.tarea) - ordenPrioridad(b.tarea)).map(p => p.sigla)
    expect(orden).toEqual(['SP', 'P', 'CARGAR', 'DESC.', 'REF', 'Check'])
  })

  it('CARGAR y DESCONGELAR quedan a la vista; REF y Check plegados', () => {
    expect(esPrincipal('cargar')).toBe(true)
    expect(esPrincipal('descongelar')).toBe(true)
    expect(esPrincipal('media')).toBe(false)
    expect(esPrincipal(null)).toBe(false)
  })

  it('valores desconocidos no rompen', () => {
    expect(metaTarea('lo-que-sea').tarea).toBe('baja')
    expect(metaMise('lo-que-sea').mise).toBe('ref')
    expect(miseATarea('lo-que-sea')).toBe('alta')
  })
})
