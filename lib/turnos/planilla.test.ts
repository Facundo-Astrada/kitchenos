import { describe, it, expect } from 'vitest'
import {
  indexarTurnos, horasDeTurno, duracionHoras, horaCompacta, coberturaDia, avisosPlanilla,
  resumenSemanaPersona, firmaSemanaPersona, textoPlanilla, semanaDe, type TurnoPlanilla,
} from './planilla'
import { normalizarTipo, HORARIOS_DEFAULT } from './tipos'

const t = (miembro_id: string, fecha: string, turno_tipo: string, hora_entrada: string | null = null, hora_salida: string | null = null): TurnoPlanilla =>
  ({ miembro_id, fecha, turno_tipo, hora_entrada, hora_salida })

// Semana del lunes 12 al domingo 18 de octubre de 2026.
const SEMANA = semanaDe('2026-10-12')
const ANA = { id: 'ana', nombre: 'Ana' }
const LEO = { id: 'leo', nombre: 'Leo' }

describe('normalizarTipo', () => {
  it('lee los tipos de la grilla y los alias viejos de turno de servicio', () => {
    expect(normalizarTipo('mañana')).toBe('mañana')
    expect(normalizarTipo('almuerzo')).toBe('mañana')
    expect(normalizarTipo('cena')).toBe('noche')
  })
  it('devuelve null para lo que no conoce en vez de inventar un tipo', () => {
    expect(normalizarTipo('guardia')).toBeNull()
    expect(normalizarTipo(null)).toBeNull()
  })
})

describe('horas', () => {
  it('un turno que cruza la medianoche cuenta hacia adelante, no en negativo', () => {
    expect(duracionHoras('20:00', '02:00')).toBe(6)
    expect(duracionHoras('09:00', '17:00')).toBe(8)
  })
  it('usa el horario cargado y, si falta, el habitual del tipo', () => {
    expect(horasDeTurno(t('ana', SEMANA[0], 'mañana', '10:00:00', '15:30:00'))).toBe(5.5)
    expect(horasDeTurno(t('ana', SEMANA[0], 'noche'))).toBe(6)
    expect(horasDeTurno(t('ana', SEMANA[0], 'mañana'), { ...HORARIOS_DEFAULT, mañana: ['08:00', '14:00'] })).toBe(6)
  })
  it('franco y vacaciones no suman horas', () => {
    expect(horasDeTurno(t('ana', SEMANA[0], 'franco'))).toBe(0)
    expect(horasDeTurno(t('ana', SEMANA[0], 'vacaciones'))).toBe(0)
    expect(horasDeTurno(undefined)).toBe(0)
  })
  it('compacta la hora en punto', () => {
    expect(horaCompacta('09:00:00')).toBe('9')
    expect(horaCompacta('13:30')).toBe('13:30')
  })
})

describe('coberturaDia', () => {
  it('cuenta gente por tipo y separa lo que quedó sin asignar', () => {
    const idx = indexarTurnos([t('ana', SEMANA[0], 'mañana'), t('leo', SEMANA[0], 'franco')])
    const c = coberturaDia(SEMANA[0], ['ana', 'leo', 'zoe'], idx)
    expect(c.personas).toBe(1)
    expect(c.horas).toBe(8)
    expect(c.porTipo.mañana).toBe(1)
    expect(c.porTipo.franco).toBe(1)
    expect(c.sinAsignar).toBe(1)
  })
})

describe('avisosPlanilla', () => {
  it('avisa el cierre seguido de apertura (menos de 12 h de descanso)', () => {
    const idx = indexarTurnos([t('ana', SEMANA[0], 'noche'), t('ana', SEMANA[1], 'mañana')])
    const a = avisosPlanilla(SEMANA, [ANA], idx)
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ tipo: 'descanso_corto', fecha: SEMANA[1], miembroId: 'ana' })
    expect(a[0].texto).toContain('7 h')
  })
  it('mide el descanso del lunes contra el domingo de la semana anterior', () => {
    const idx = indexarTurnos([t('ana', '2026-10-11', 'noche'), t('ana', SEMANA[0], 'mañana')])
    expect(avisosPlanilla(SEMANA, [ANA], idx).map(x => x.tipo)).toEqual(['descanso_corto'])
  })
  it('dos mañanas seguidas no son descanso corto', () => {
    const idx = indexarTurnos([t('ana', SEMANA[0], 'mañana'), t('ana', SEMANA[1], 'mañana')])
    expect(avisosPlanilla(SEMANA, [ANA], idx)).toEqual([])
  })
  it('avisa una sola vez la racha de más de 6 días sin franco', () => {
    const idx = indexarTurnos(SEMANA.map(f => t('ana', f, 'mañana', '09:00', '15:00')))
    const a = avisosPlanilla(SEMANA, [ANA], idx)
    expect(a.filter(x => x.tipo === 'sin_franco')).toHaveLength(1)
    expect(a.find(x => x.tipo === 'sin_franco')).toMatchObject({ fecha: SEMANA[6], texto: '7 días seguidos sin franco' })
  })
  it('la racha arrastra los días trabajados de la semana anterior', () => {
    const previos = ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'].map(f => t('ana', f, 'mañana', '09:00', '13:00'))
    const idx = indexarTurnos([...previos, t('ana', SEMANA[0], 'mañana', '09:00', '13:00'), t('ana', SEMANA[1], 'mañana', '09:00', '13:00')])
    const a = avisosPlanilla(SEMANA, [ANA], idx)
    expect(a.find(x => x.tipo === 'sin_franco')).toMatchObject({ fecha: SEMANA[1] })
  })
  it('avisa más de 48 h semanales sobre la semana, no sobre un día', () => {
    const idx = indexarTurnos(SEMANA.slice(0, 6).map(f => t('leo', f, 'mañana', '08:00', '17:00')))
    const a = avisosPlanilla(SEMANA, [LEO], idx)
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ tipo: 'horas_semana', fecha: null })
  })
})

describe('aviso al equipo', () => {
  const idx = indexarTurnos([t('ana', SEMANA[0], 'mañana'), t('ana', SEMANA[2], 'franco'), t('leo', SEMANA[0], 'noche', '21:00', '01:00')])

  it('resume la semana de una persona en una línea', () => {
    expect(resumenSemanaPersona('ana', SEMANA, idx)).toBe('Lun 12 mañana 9–17 · Mié 14 franco')
    expect(resumenSemanaPersona('zoe', SEMANA, idx)).toBe('')
  })
  it('la firma cambia cuando cambia un horario y no cuando nada cambió', () => {
    const antes = firmaSemanaPersona('ana', SEMANA, idx)
    expect(firmaSemanaPersona('ana', SEMANA, indexarTurnos([t('ana', SEMANA[0], 'mañana'), t('ana', SEMANA[2], 'franco')]))).toBe(antes)
    expect(firmaSemanaPersona('ana', SEMANA, indexarTurnos([t('ana', SEMANA[0], 'mañana', '10:00', '17:00'), t('ana', SEMANA[2], 'franco')]))).not.toBe(antes)
  })
  it('el texto para compartir agrupa por día y turno, y aclara solo el horario que se sale del habitual', () => {
    const txt = textoPlanilla(SEMANA, [ANA, LEO], idx)
    expect(txt).toContain('*Turnos 12 – 18 oct*')
    expect(txt).toContain('Mañana 9–17: Ana')
    expect(txt).toContain('Noche 20–2: Leo (21–1)')
    expect(txt).not.toContain('Mar 13')
  })
})
