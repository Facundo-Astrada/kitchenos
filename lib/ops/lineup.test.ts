import { describe, it, expect } from 'vitest'
import {
  construirTextoLineUp, lineUpTieneContenido, recortarLineUp,
  MAX_ITEMS_POR_BLOQUE, type DatosLineUp,
} from './lineup'

const vacio: DatosLineUp = {
  turnoNombre: 'Cena',
  jornada: '2026-09-07',
  equipo: null,
  ochentaySeis: [],
  pendientes: [],
  notas: [],
  eventos: [],
  faltantes: [],
}

const lleno: DatosLineUp = {
  ...vacio,
  equipo: { presentes: 6, ausentes: ['Nico'] },
  ochentaySeis: ['Mollejas', 'Trucha'],
  pendientes: [
    { plaza: 'Calientes', texto: 'Fondo oscuro', codigo: 'SP' },
    { plaza: 'Fríos', texto: 'Chimichurri rinde 2 servicios', codigo: 'REF' },
  ],
  notas: [{ plaza: 'Parrilla', texto: 'La brasa tarda más con la leña nueva', autor: 'Marcos' }],
  eventos: [{ titulo: 'Mesa 12 celíacos (4p)', hora: '21:00', esHoy: true }],
  menuVigente: 'Menú ejecutivo de la semana',
  faltantes: ['Manteca', 'Panceta'],
  foco: 'Ayer salieron 3 platos sin control de pase',
}

describe('lineUpTieneContenido', () => {
  it('una ficha sin nada no se ofrece — ofrecerla vacía la quema', () => {
    expect(lineUpTieneContenido(vacio)).toBe(false)
  })

  it('alcanza con un solo bloque con algo', () => {
    expect(lineUpTieneContenido({ ...vacio, ochentaySeis: ['Mollejas'] })).toBe(true)
    expect(lineUpTieneContenido({ ...vacio, menuVigente: 'Menú del día' })).toBe(true)
  })

  it('un foco en blanco no cuenta como contenido', () => {
    expect(lineUpTieneContenido({ ...vacio, foco: '   ' })).toBe(false)
  })
})

describe('recortarLineUp', () => {
  it('recorta los bloques largos para que la ficha siga leyéndose en 2 minutos', () => {
    const muchos = Array.from({ length: 30 }, (_, i) => ({
      plaza: 'Fríos', texto: `Pendiente ${i}`, codigo: 'P',
    }))
    const r = recortarLineUp({ ...lleno, pendientes: muchos })
    expect(r.pendientes).toHaveLength(MAX_ITEMS_POR_BLOQUE)
    expect(r.pendientes[0].texto).toBe('Pendiente 0')   // conserva el orden de prioridad
  })

  it('no toca los bloques que ya entran', () => {
    expect(recortarLineUp(lleno).pendientes).toHaveLength(2)
  })
})

describe('construirTextoLineUp', () => {
  const texto = construirTextoLineUp(lleno)

  it('abre con el turno y la fecha en castellano', () => {
    expect(texto.split('\n')[0]).toContain('Line-up Cena')
    expect(texto.split('\n')[0]).toContain('septiembre')
  })

  it('el 86 va antes que los pendientes — es lo que el salón necesita primero', () => {
    expect(texto.indexOf('86')).toBeLessThan(texto.indexOf('Del turno anterior'))
  })

  it('usa los códigos del mise, no los nombres de prioridad de la DB', () => {
    expect(texto).toContain('[SP] Fondo oscuro')
    expect(texto).toContain('[REF] Chimichurri')
    expect(texto).not.toContain('critica')
  })

  it('dice quién falta y quién queda', () => {
    expect(texto).toContain('Somos 6')
    expect(texto).toContain('falta Nico')
  })

  it('marca los eventos que no son de hoy como próximos', () => {
    const t = construirTextoLineUp({
      ...lleno, eventos: [{ titulo: 'Evento privado', hora: null, esHoy: false }],
    })
    expect(t).toContain('Evento privado (próximo)')
  })

  it('omite los bloques vacíos en vez de imprimir encabezados sueltos', () => {
    const t = construirTextoLineUp(vacio)
    expect(t).not.toContain('86')
    expect(t).not.toContain('Bajo mínimo')
    expect(t.split('\n\n')).toHaveLength(1)   // solo el encabezado
  })

  it('el foco cierra la ficha', () => {
    expect(texto.trimEnd().endsWith('Ayer salieron 3 platos sin control de pase')).toBe(true)
  })
})
