import { describe, it, expect } from 'vitest'
import {
  fechaEnTz, horaEnTz, hoyOperativo, sumarDias, TZ_DEFAULT,
  turnoActivo, turnoAnterior, encodeTurnoFase, parseTurnoFase, cierreIncompleto,
} from './turnos'
import type { TurnoServicio } from '@/types'

const TURNOS: TurnoServicio[] = [
  { id: 'almuerzo', nombre: 'Almuerzo', desde: '09:00', hasta: '17:00', orden: 1, activo: true },
  { id: 'cena', nombre: 'Cena', desde: '17:00', hasta: '01:30', orden: 2, activo: true },
]

// ART = UTC-3, sin horario de verano — los instantes UTC de abajo son
// equivalentes exactos a la hora de pared indicada en el comentario.
describe('fechaEnTz / horaEnTz', () => {
  it('resuelve la fecha de pared en ART, no en UTC', () => {
    // 29/07 22:00 ART = 30/07 01:00 UTC — toISOString() a secas daría 30/07 (bug viejo)
    const d = new Date('2026-07-30T01:00:00Z')
    expect(fechaEnTz(d, TZ_DEFAULT)).toBe('2026-07-29')
    expect(horaEnTz(d, TZ_DEFAULT)).toBe(22)
  })
})

describe('sumarDias', () => {
  it('suma y resta días sin cruzar de mes/año incorrectamente', () => {
    expect(sumarDias('2026-07-30', -1)).toBe('2026-07-29')
    expect(sumarDias('2026-08-01', -1)).toBe('2026-07-31')
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('hoyOperativo — la jornada rueda a las 05:00 ART, no a medianoche', () => {
  it('20:59 ART → jornada de hoy (29/07)', () => {
    const d = new Date('2026-07-29T23:59:00Z') // 20:59 ART
    expect(hoyOperativo(d)).toBe('2026-07-29')
  })

  it('21:00 ART → sigue siendo la jornada de hoy (29/07), no la de mañana', () => {
    const d = new Date('2026-07-30T00:00:00Z') // 21:00 ART 29/07
    expect(hoyOperativo(d)).toBe('2026-07-29')
  })

  it('00:30 ART → todavía la jornada de ayer (29/07)', () => {
    const d = new Date('2026-07-30T03:30:00Z') // 00:30 ART 30/07
    expect(hoyOperativo(d)).toBe('2026-07-29')
  })

  it('04:59 ART → todavía la jornada de ayer (29/07)', () => {
    const d = new Date('2026-07-30T07:59:00Z') // 04:59 ART 30/07
    expect(hoyOperativo(d)).toBe('2026-07-29')
  })

  it('05:00 ART → arranca la jornada nueva (30/07)', () => {
    const d = new Date('2026-07-30T08:00:00Z') // 05:00 ART 30/07
    expect(hoyOperativo(d)).toBe('2026-07-30')
  })

  it('corte configurable — con corte=0 se comporta como calendario puro', () => {
    const d = new Date('2026-07-30T03:30:00Z') // 00:30 ART 30/07
    expect(hoyOperativo(d, 0)).toBe('2026-07-30')
  })
})

describe('turnoActivo — el último turno que arrancó sigue vigente hasta que arranca el siguiente', () => {
  it('11:00 ART → almuerzo (arrancó a las 09, cena arranca recién a las 17)', () => {
    const d = new Date('2026-07-30T14:00:00Z') // 11:00 ART
    expect(turnoActivo(d, TURNOS)?.id).toBe('almuerzo')
  })

  it('17:00 ART exacto → cena (justo arrancó)', () => {
    const d = new Date('2026-07-30T20:00:00Z') // 17:00 ART
    expect(turnoActivo(d, TURNOS)?.id).toBe('cena')
  })

  it('22:00 ART → cena', () => {
    const d = new Date('2026-07-31T01:00:00Z') // 22:00 ART 30/07
    expect(turnoActivo(d, TURNOS)?.id).toBe('cena')
  })

  it('00:30 ART → sigue siendo cena, aunque "hasta" diga 01:30 (no se usa para atribuir)', () => {
    const d = new Date('2026-07-30T03:30:00Z') // 00:30 ART
    expect(turnoActivo(d, TURNOS)?.id).toBe('cena')
  })

  it('03:00 ART (hueco entre cena y almuerzo) → sigue siendo cena, no queda huérfano', () => {
    const d = new Date('2026-07-30T06:00:00Z') // 03:00 ART
    expect(turnoActivo(d, TURNOS)?.id).toBe('cena')
  })

  it('08:59 ART (justo antes de almuerzo) → todavía cena', () => {
    const d = new Date('2026-07-30T11:59:00Z') // 08:59 ART
    expect(turnoActivo(d, TURNOS)?.id).toBe('cena')
  })

  it('turnos desactivados se ignoran', () => {
    const soloAlmuerzo = [TURNOS[0], { ...TURNOS[1], activo: false }]
    const d = new Date('2026-07-31T01:00:00Z') // 22:00 ART — sería cena, pero está desactivada
    expect(turnoActivo(d, soloAlmuerzo)?.id).toBe('almuerzo')
  })

  it('sin turnos activos → null', () => {
    const d = new Date('2026-07-30T14:00:00Z')
    expect(turnoActivo(d, [])).toBeNull()
  })
})

describe('turnoAnterior', () => {
  it('cena → almuerzo, misma jornada', () => {
    expect(turnoAnterior('2026-07-30', 'cena', TURNOS)).toEqual({ jornada: '2026-07-30', turnoId: 'almuerzo' })
  })

  it('almuerzo (primer turno del día) → cena, retrocede la jornada', () => {
    expect(turnoAnterior('2026-07-30', 'almuerzo', TURNOS)).toEqual({ jornada: '2026-07-29', turnoId: 'cena' })
  })

  it('turnoId inexistente entre los activos → null', () => {
    expect(turnoAnterior('2026-07-30', 'brunch', TURNOS)).toBeNull()
  })
})

describe('encodeTurnoFase / parseTurnoFase', () => {
  it('codifica y decodifica turno+fase', () => {
    expect(encodeTurnoFase('cena', 'apertura')).toBe('cena:apertura')
    expect(parseTurnoFase('cena:apertura')).toEqual({ turnoId: 'cena', fase: 'apertura' })
    expect(parseTurnoFase('almuerzo:cierre')).toEqual({ turnoId: 'almuerzo', fase: 'cierre' })
  })

  it('compat con filas viejas sin turno codificado', () => {
    expect(parseTurnoFase('apertura')).toEqual({ turnoId: null, fase: 'apertura' })
    expect(parseTurnoFase('cierre')).toEqual({ turnoId: null, fase: 'cierre' })
  })
})

describe('cierreIncompleto — ausencia total de cierre, no "algunos ítems pendientes"', () => {
  it('sin ningún registro → incompleto', () => {
    expect(cierreIncompleto([])).toBe(true)
  })

  it('registros pero ninguno completado → incompleto', () => {
    expect(cierreIncompleto([{ completado: false }, { completado: false }])).toBe(true)
  })

  it('al menos un ítem completado → NO es incompleto (aunque falten otros)', () => {
    expect(cierreIncompleto([{ completado: false }, { completado: true }])).toBe(false)
  })

  it('todos completados → NO es incompleto', () => {
    expect(cierreIncompleto([{ completado: true }, { completado: true }])).toBe(false)
  })
})
