import { describe, it, expect } from 'vitest'
import { ocurrencias, grillaMes, fechaLarga, etiquetaRango, addDays } from './fechas'
import { segmentosSemana, bloquesDia } from './layout'
import { generarIcs } from './ics'
import { feriadosEnRango } from './feriados'

describe('ocurrencias de un evento recurrente', () => {
  it('semanal: aparece todas las semanas del rango, no solo el día que se creó', () => {
    expect(ocurrencias('2026-09-07', 'semanal', '2026-10-01', '2026-10-31'))
      .toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
  })
  it('no genera nada antes del inicio de la serie', () => {
    expect(ocurrencias('2026-10-20', 'diaria', '2026-10-01', '2026-10-22'))
      .toEqual(['2026-10-20', '2026-10-21', '2026-10-22'])
  })
  it('respeta el fin de la serie', () => {
    expect(ocurrencias('2026-10-01', 'diaria', '2026-10-01', '2026-10-31', '2026-10-03'))
      .toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
  })
  it('quincenal', () => {
    expect(ocurrencias('2026-10-01', 'quincenal', '2026-10-01', '2026-11-05'))
      .toEqual(['2026-10-01', '2026-10-15', '2026-10-29'])
  })
  it('mensual: saltea los meses que no tienen ese día', () => {
    expect(ocurrencias('2026-01-31', 'mensual', '2026-01-01', '2026-05-31'))
      .toEqual(['2026-01-31', '2026-03-31', '2026-05-31'])
  })
  it('mensual: arranca en el mes del rango aunque la serie sea vieja', () => {
    expect(ocurrencias('2025-03-01', 'mensual', '2026-09-28', '2026-11-08'))
      .toEqual(['2026-10-01', '2026-11-01'])
  })
  it('anual', () => {
    expect(ocurrencias('2025-12-31', 'anual', '2026-12-01', '2027-01-10')).toEqual(['2026-12-31'])
  })
})

describe('grilla y etiquetas', () => {
  it('la grilla de octubre 2026 arranca el lunes 28/09 y tiene 42 días', () => {
    const g = grillaMes(10, 2026)
    expect(g).toHaveLength(42)
    expect(g[0]).toBe('2026-09-28')
    expect(g[41]).toBe(addDays('2026-09-28', 41))
  })
  it('fecha larga sin el "De" capitalizado', () => {
    expect(fechaLarga('2026-10-09')).toBe('Viernes 9 de octubre')
  })
  it('rango que cruza de mes', () => {
    expect(etiquetaRango('2026-09-28', '2026-10-04')).toBe('28 sep – 4 oct')
    expect(etiquetaRango('2026-10-05', '2026-10-11')).toBe('5 – 11 oct')
  })
})

describe('layout', () => {
  const semana = Array.from({ length: 7 }, (_, i) => addDays('2026-10-05', i))
  it('un ítem de varios días es una barra con carril propio', () => {
    const segs = segmentosSemana(semana, [
      { id: 'a', dia: '2026-10-01', diaFin: '2026-10-07' },
      { id: 'b', dia: '2026-10-06', diaFin: '2026-10-08' },
      { id: 'c', dia: '2026-10-09', diaFin: '2026-10-18' },
      { id: 'd', dia: '2026-10-06', diaFin: '2026-10-06' }, // un día: no es barra
    ])
    const por = Object.fromEntries(segs.map(s => [s.item.id, s]))
    expect(segs).toHaveLength(3)
    expect(por.a).toMatchObject({ colInicio: 0, colFin: 2, carril: 0, continuaAntes: true })
    expect(por.b).toMatchObject({ colInicio: 1, colFin: 3, carril: 1 })
    expect(por.c).toMatchObject({ colInicio: 4, colFin: 6, carril: 0, continuaDespues: true })
  })
  it('eventos que se pisan se reparten columnas', () => {
    const b = bloquesDia([
      { id: '1', hora_inicio: '09:00:00', hora_fin: '11:00:00' },
      { id: '2', hora_inicio: '10:00:00', hora_fin: '10:30:00' },
      { id: '3', hora_inicio: '12:00:00', hora_fin: '13:00:00' },
      { id: '4', hora_inicio: '23:00:00', hora_fin: '01:00:00' },
    ])
    const por = Object.fromEntries(b.map(x => [x.item.id, x]))
    expect(por['1']).toMatchObject({ col: 0, cols: 2 })
    expect(por['2']).toMatchObject({ col: 1, cols: 2 })
    expect(por['3']).toMatchObject({ col: 0, cols: 1 })
    expect(por['4'].finMin).toBe(24 * 60)
  })
})

describe('ics y feriados', () => {
  it('genera un VEVENT de día completo con fin exclusivo', () => {
    const ics = generarIcs([{ id: 'x', titulo: 'Inventario, mensual', dia: '2026-10-31', diaFin: '2026-10-31', hora_inicio: '00:00:00', hora_fin: '23:59:00', todoElDia: true }])
    expect(ics).toContain('DTSTART;VALUE=DATE:20261031')
    expect(ics).toContain('DTEND;VALUE=DATE:20261101')
    expect(ics).toContain('SUMMARY:Inventario\\, mensual')
  })
  it('octubre 2026 tiene el feriado trasladado del 12', () => {
    expect(feriadosEnRango('2026-10-01', '2026-10-31').map(f => f.fecha)).toEqual(['2026-10-12'])
  })
})
