import { describe, it, expect } from 'vitest'
import {
  textoRecordatorio, textoReconocimiento, puedeRecordar, puedeReconocer,
  debeSugerirReasignar, CADENCIA_RECORDATORIO_MS, CADENCIA_RECONOCIMIENTO_MS,
} from './avisos'
import { ESTACIONES } from './ruta'

const AHORA = new Date('2026-09-07T20:00:00Z')
const haceHoras = (h: number) => new Date(AHORA.getTime() - h * 3600_000).toISOString()

describe('cadencias — la asimetría es el punto', () => {
  it('el recordatorio es diario', () => {
    expect(CADENCIA_RECORDATORIO_MS).toBe(24 * 3600_000)
  })

  it('el reconocimiento es semanal, no diario', () => {
    expect(CADENCIA_RECONOCIMIENTO_MS).toBe(7 * CADENCIA_RECORDATORIO_MS)
  })

  it('sin aviso previo, se puede avisar', () => {
    expect(puedeRecordar(null, AHORA)).toBe(true)
    expect(puedeReconocer(undefined, AHORA)).toBe(true)
  })

  it('no manda dos recordatorios el mismo día', () => {
    expect(puedeRecordar(haceHoras(3), AHORA)).toBe(false)
    expect(puedeRecordar(haceHoras(25), AHORA)).toBe(true)
  })

  it('un reconocimiento diario está prohibido — erosiona la confianza', () => {
    expect(puedeReconocer(haceHoras(25), AHORA)).toBe(false)
    expect(puedeReconocer(haceHoras(24 * 7 + 1), AHORA)).toBe(true)
  })
})

describe('textoRecordatorio — consecuencia, no tarea', () => {
  it('nombra la consecuencia de la estación más importante de la ruta', () => {
    const e = ESTACIONES.find(x => x.id === '3.2')!
    const t = textoRecordatorio(e, '/facturas')
    expect(t.cuerpo).toContain('CMV')
    expect(t.cuerpo).not.toMatch(/complet[áa] |carg[áa] /i)   // nada de imperativos de tarea
  })

  it('una estación sin consecuencia escrita igual habla de consecuencia', () => {
    const e = ESTACIONES.find(x => x.id === '6.1')!
    expect(textoRecordatorio(e, '/salon').cuerpo).toContain('Mientras esto no esté')
  })

  it('lleva al lugar donde se resuelve', () => {
    const e = ESTACIONES.find(x => x.id === '0.2')!
    expect(textoRecordatorio(e, '/facturas').link).toBe('/facturas')
  })

  it('ninguna consecuencia escrita culpa a una persona', () => {
    for (const e of ESTACIONES) {
      const cuerpo = textoRecordatorio(e, '/').cuerpo
      expect(cuerpo, `${e.id}: el aviso no debe hablar en segunda persona acusatoria`)
        .not.toMatch(/no hiciste|te olvidaste|deberías haber/i)
    }
  })
})

describe('textoReconocimiento — del equipo, sin nombres', () => {
  it('no dice nada si no hubo nada que reconocer', () => {
    expect(textoReconocimiento(0, 34)).toBeNull()
  })

  it('habla en plural del equipo y nunca de una persona', () => {
    const t = textoReconocimiento(3, 42)!
    expect(t.titulo).toContain('el equipo')
    expect(t.cuerpo).toContain('42%')
  })

  it('concuerda en singular', () => {
    expect(textoReconocimiento(1, 10)!.titulo).toContain('una función')
  })

  it('reconoce lo que se sostuvo, no quién hizo más', () => {
    const t = textoReconocimiento(2, 20)!
    expect(t.cuerpo).toContain('Nadie tuvo que pedirlo')
  })
})

describe('debeSugerirReasignar', () => {
  it('a la tercera ignorada, el problema es la asignación y no la insistencia', () => {
    expect(debeSugerirReasignar(2)).toBe(false)
    expect(debeSugerirReasignar(3)).toBe(true)
  })
})
