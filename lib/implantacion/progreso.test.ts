import { describe, it, expect } from 'vitest'
import { ESTACIONES, HITOS, MIRADORES, estacionesDeHito, type MetricasRuta } from './ruta'
import {
  calcularProgreso, estadoDeEstacion, hitoAtrasado, SIN_CONFIRMACIONES,
} from './progreso'
import { areaDuenaDeModulo } from '@/lib/constants'

const CERO: MetricasRuta = {
  tipoNegocioDefinido: false, facturasTotal: 0, facturasMesActual: 0,
  facturasSemanasSeguidas: 0, recetasConRendimiento: 0, platosConFoodCost: 0,
  areasActivas: 0, areasSinResponsable: 0, puestos: 0, miembros: 0,
  miembrosVinculados: 0, competenciasCargadas: 0, competenciasNivel4: 0,
  cartaItems: 0, cartaSinReceta: 0, cartaSinEstandarizar: 0, margenObjetivoCargado: false,
  proveedores: 0, productos: 0, ingredientesTotal: 0, ingredientesLinkeados: 0, pedidos: 0,
  plazasConMise: 0, turnosConfigurados: false, tareasDespachadas: 0,
  entregasPase: 0, paseDiasSeguidos: 0, registrosHaccp: 0,
  registrosMerma: 0, presupuestoCargado: false, entradasBitacora: 0, mesesConVentas: 0,
  mesas: 0, comandas: 0, clientes: 0, arqueos: 0,
}

describe('ruta — integridad del modelo', () => {
  it('toda estación pertenece a un hito que existe', () => {
    const ids = HITOS.map(h => h.id)
    expect(ESTACIONES.filter(e => !ids.includes(e.hito))).toEqual([])
  })

  it('los 7 hitos tienen al menos una estación', () => {
    expect(HITOS.filter(h => estacionesDeHito(h.id).length === 0)).toEqual([])
  })

  it('los ids de estación no se repiten', () => {
    const ids = ESTACIONES.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('cada módulo de una estación tiene área dueña — si no, no hay a quién avisarle', () => {
    const huerfanas = ESTACIONES.filter(e => !areaDuenaDeModulo(e.modulo)).map(e => e.id)
    expect(huerfanas).toEqual([])
  })

  it('ningún mirador es además una estación: se encienden solos, no se cargan', () => {
    const contradiccion = ESTACIONES.filter(e => MIRADORES.includes(e.modulo)).map(e => e.id)
    // 5.4 "Leer el mes en Reportes" es la excepción consciente: el mirador no se
    // carga, pero MIRARLO sí es una estación de la ruta.
    expect(contradiccion).toEqual(['5.4'])
  })

  it('toda estación declara qué costumbre vieja apaga, salvo la de crear la cuenta', () => {
    const sinApagar = ESTACIONES.filter(e => e.apaga === null).map(e => e.id)
    expect(sinApagar).toEqual(['0.1'])
  })
})

describe('calcularProgreso', () => {
  it('un restaurante recién creado arranca en 0%', () => {
    const p = calcularProgreso(CERO)
    expect(p.pct).toBe(0)
    expect(p.insertadas).toBe(0)
  })

  it('la primera estación sugerida es la 0.1 — el orden es de dependencias', () => {
    expect(calcularProgreso(CERO).siguiente?.id).toBe('0.1')
  })

  it('cargar datos NO mueve el porcentaje: solo la inserción cuenta', () => {
    const cargado: MetricasRuta = { ...CERO, facturasTotal: 40, recetasConRendimiento: 12 }
    const p = calcularProgreso(cargado)
    expect(p.hitos[0].cargadas).toBeGreaterThan(0)
    expect(p.pct).toBe(0)
  })

  it('la inserción sí lo mueve', () => {
    const usado: MetricasRuta = { ...CERO, facturasTotal: 40, facturasSemanasSeguidas: 3 }
    expect(calcularProgreso(usado).pct).toBeGreaterThan(0)
  })

  it('sin salón, el hito 6 no entra al denominador — un techo inalcanzable desmotiva', () => {
    const sin = calcularProgreso(CERO, SIN_CONFIRMACIONES, { incluirSalon: false })
    const con = calcularProgreso(CERO, SIN_CONFIRMACIONES, { incluirSalon: true })
    expect(sin.total).toBeLessThan(con.total)
    expect(sin.hitos.some(h => h.hito === 'salon')).toBe(false)
    expect(con.hitos.some(h => h.hito === 'salon')).toBe(true)
  })

  it('una estación sin predicado se puede confirmar a mano', () => {
    // 5.5 no tiene ni carga ni inserción medibles.
    const e = ESTACIONES.find(x => x.id === '5.5')!
    expect(estadoDeEstacion(e, CERO)).toBe('pendiente')
    expect(estadoDeEstacion(e, CERO, { carga: [], insercion: ['5.5'] })).toBe('insertada')
  })

  it('insertada gana sobre cargada aunque la carga no se detecte', () => {
    const e = ESTACIONES.find(x => x.id === '3.2')!
    const m: MetricasRuta = { ...CERO, facturasMesActual: 0, facturasSemanasSeguidas: 5 }
    expect(estadoDeEstacion(e, m)).toBe('insertada')
  })

  it('un hito con todas sus estaciones insertadas queda completo', () => {
    const m: MetricasRuta = {
      ...CERO, tipoNegocioDefinido: true, facturasTotal: 5, facturasSemanasSeguidas: 3,
    }
    const p = calcularProgreso(m, { carga: [], insercion: ['0.3', '0.4'] })
    expect(p.hitos.find(h => h.hito === 'base')?.estado).toBe('completo')
  })
})

describe('hitoAtrasado', () => {
  const base = calcularProgreso(CERO).hitos[0]   // hito 0, objetivo día 1

  it('no marca atraso si no se sabe el día', () => {
    expect(hitoAtrasado(base, null)).toBe(false)
  })

  it('marca atraso cuando pasó el día objetivo y el hito no está completo', () => {
    expect(hitoAtrasado(base, 5)).toBe(true)
  })

  it('un hito completo nunca está atrasado', () => {
    expect(hitoAtrasado({ ...base, estado: 'completo' }, 400)).toBe(false)
  })

  it('el hito del salón no tiene reloj', () => {
    const p = calcularProgreso(CERO, SIN_CONFIRMACIONES, { incluirSalon: true })
    const salon = p.hitos.find(h => h.hito === 'salon')!
    expect(hitoAtrasado(salon, 999)).toBe(false)
  })
})
