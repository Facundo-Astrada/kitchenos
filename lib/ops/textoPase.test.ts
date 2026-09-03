import { describe, it, expect } from 'vitest'
import { construirTextoPase, paseTieneContenido, type DatosPase } from './textoPase'
import type { Tarea, PaseMensaje } from '@/types'

const JORNADA = '2026-09-03'

function tarea(over: Partial<Tarea> = {}): Tarea {
  return {
    id: 't1', titulo: 'cebolla fugazza', status: 'pendiente', prioridad: 'critica',
    restaurante_id: 'r1', created_at: JORNADA, ...over,
  } as Tarea
}

function nota(over: Partial<PaseMensaje> = {}): PaseMensaje {
  return {
    id: 'n1', texto: 'checkear heladera', restaurante_id: 'r1', created_at: JORNADA, ...over,
  } as PaseMensaje
}

function base(over: Partial<DatosPase> = {}): DatosPase {
  return {
    plazaNombre: 'Parrilla', turnoNombre: 'Cena', jornada: JORNADA,
    pendientes: [], hecho: [], notas: [], ...over,
  }
}

describe('construirTextoPase', () => {
  it('arma el encabezado con plaza, turno y fecha', () => {
    const texto = construirTextoPase(base())
    expect(texto).toContain('Pase Parrilla — Cena')
  })

  it('sin turno, el encabezado no lo menciona', () => {
    const texto = construirTextoPase(base({ turnoNombre: null }))
    const encabezado = texto.split('\n\n')[0]
    expect(encabezado.startsWith('Pase Parrilla — ')).toBe(true)
    expect(encabezado).not.toContain('Cena')
  })

  it('lista los pendientes con su código de prioridad, más urgente primero', () => {
    const texto = construirTextoPase(base({
      pendientes: [
        tarea({ id: 't1', titulo: 'coliflor', prioridad: 'media' }),
        tarea({ id: 't2', titulo: 'cebolla fugazza', prioridad: 'critica' }),
        tarea({ id: 't3', titulo: 'queso fugazza', prioridad: 'alta' }),
      ],
    }))
    const lineas = texto.split('\n\n')[1].split('\n')
    expect(lineas).toEqual(['cebolla fugazza SP', 'queso fugazza P', 'coliflor REF'])
  })

  it('lista lo hecho con bullet simple, sin código', () => {
    const texto = construirTextoPase(base({
      hecho: [tarea({ id: 't1', titulo: 'se marchó todo el pollo' })],
    }))
    expect(texto).toContain('Hecho\n· se marchó todo el pollo')
  })

  it('sin pendientes ni hecho, esas secciones no aparecen', () => {
    const texto = construirTextoPase(base())
    expect(texto).not.toContain('Hecho')
  })

  it('sin nada de contenido, avisa "Sin pendientes."', () => {
    const texto = construirTextoPase(base())
    expect(texto).toContain('Sin pendientes.')
  })

  it('las notas van bajo "Ojo", en el orden en que se escribieron (más vieja primero)', () => {
    const texto = construirTextoPase(base({
      notas: [
        nota({ id: 'n1', texto: 'segunda nota' }),
        nota({ id: 'n2', texto: 'primera nota' }),
      ],
    }))
    const lineas = texto.split('\n\n').find(b => b.startsWith('Ojo'))!.split('\n')
    expect(lineas).toEqual(['Ojo', '· primera nota', '· segunda nota'])
  })

  it('agrega el pie con autor y hora cuando están', () => {
    const texto = construirTextoPase(base({ autor: 'Valentino', entregadoAt: `${JORNADA}T01:39:00Z` }))
    const pie = texto.split('\n\n').at(-1)!
    expect(pie.startsWith('— Valentino, ')).toBe(true)
    expect(pie).toMatch(/\d{1,2}:\d{2}/)
  })

  it('sin autor ni hora, no hay pie', () => {
    const texto = construirTextoPase(base())
    const bloques = texto.split('\n\n')
    expect(bloques.at(-1)!.startsWith('—')).toBe(false)
  })

  // El mismo trabajo puede haber entrado dos veces (mise + board, ver
  // dedupeTareas.ts) — el mensaje no debe repetir la preparación.
  it('deduplica tareas con el mismo título, quedándose con la prioridad más alta', () => {
    const texto = construirTextoPase(base({
      pendientes: [
        tarea({ id: 't1', titulo: 'Cebolla Fugazza', prioridad: 'media' }),
        tarea({ id: 't2', titulo: 'cebolla fugazza', prioridad: 'critica' }),
      ],
    }))
    const lineas = texto.split('\n\n')[1].split('\n')
    expect(lineas).toEqual(['cebolla fugazza SP'])
  })

  it('ignora tareas y notas con título/texto vacío', () => {
    const texto = construirTextoPase(base({
      pendientes: [tarea({ id: 't1', titulo: '   ' })],
      notas: [nota({ id: 'n1', texto: '' })],
    }))
    expect(texto).toContain('Sin pendientes.')
  })

  it('limpia espacios repetidos y el punto final', () => {
    const texto = construirTextoPase(base({
      pendientes: [tarea({ id: 't1', titulo: '  cebolla   fugazza.  ' })],
    }))
    expect(texto).toContain('cebolla fugazza SP')
  })
})

describe('paseTieneContenido', () => {
  it('false cuando no hay pendientes, hecho ni notas', () => {
    expect(paseTieneContenido(base())).toBe(false)
  })

  it('true con al menos un pendiente', () => {
    expect(paseTieneContenido(base({ pendientes: [tarea()] }))).toBe(true)
  })

  it('true con al menos una nota', () => {
    expect(paseTieneContenido(base({ notas: [nota()] }))).toBe(true)
  })

  it('false si lo único que hay es texto vacío', () => {
    expect(paseTieneContenido(base({ pendientes: [tarea({ titulo: '' })] }))).toBe(false)
  })
})
