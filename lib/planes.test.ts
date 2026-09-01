import { describe, it, expect } from 'vitest'
import { PLAN_MODULOS, PLAN_LABEL, PLAN_PRECIO_ARS, type Plan } from './planes'
import { MODULO_CONFIG, type ModuloId } from './constants'

// Gotcha #16 de .claude/docs/hooks.md: un Record<Enum, Config> copiado a mano
// puede desincronizarse en silencio (un ModuloId nuevo que no entra a ningun
// plan, o un typo que TS no detecta porque el array es de strings sueltos).
// Este test compara contra el tipo real, no contra otra copia de la lista.
const TODOS_LOS_MODULO_ID = Object.keys(MODULO_CONFIG) as ModuloId[]

describe('PLAN_MODULOS', () => {
  it('todo ModuloId real esta en al menos un plan de venta (base/cocina/control)', () => {
    const cubiertos = new Set(PLAN_MODULOS.control) // control es superset de base+cocina
    const faltantes = TODOS_LOS_MODULO_ID.filter(m => !cubiertos.has(m))
    expect(faltantes).toEqual([])
  })

  it('Cocina incluye todo lo de Base (acumulativo)', () => {
    for (const m of PLAN_MODULOS.base) {
      expect(PLAN_MODULOS.cocina).toContain(m)
    }
  })

  it('Control incluye todo lo de Cocina (acumulativo)', () => {
    for (const m of PLAN_MODULOS.cocina) {
      expect(PLAN_MODULOS.control).toContain(m)
    }
  })

  it('ningun plan tiene un modulo duplicado', () => {
    for (const plan of Object.keys(PLAN_MODULOS) as Plan[]) {
      const modulos = PLAN_MODULOS[plan]
      expect(new Set(modulos).size).toBe(modulos.length)
    }
  })

  it('los modulos explicitos de la decision 006 estan en el plan que dice la decision', () => {
    // Base: "Recetario+costeo, Compras+import, Stock, Carta, Merma, Proveedores"
    for (const m of ['recetario', 'stock', 'carta', 'merma', 'proveedores', 'facturas'] as ModuloId[]) {
      expect(PLAN_MODULOS.base).toContain(m)
    }
    // Cocina agrega: "OPS, Mise, Pase, Producción, KDS, Muro, Turnos"
    for (const m of ['operaciones', 'checklist', 'pase', 'produccion', 'kds', 'muro', 'turnos'] as ModuloId[]) {
      expect(PLAN_MODULOS.cocina).toContain(m)
      expect(PLAN_MODULOS.base).not.toContain(m)
    }
    // Control agrega: "Coach, HACCP, Presupuesto/CMV, Reportes, Bitácora"
    for (const m of ['coach', 'haccp', 'presupuesto', 'reportes', 'bitacora'] as ModuloId[]) {
      expect(PLAN_MODULOS.control).toContain(m)
      expect(PLAN_MODULOS.cocina).not.toContain(m)
    }
  })

  it('cada plan tiene label y precio', () => {
    for (const plan of Object.keys(PLAN_MODULOS) as Plan[]) {
      expect(PLAN_LABEL[plan]).toBeTruthy()
      expect(PLAN_PRECIO_ARS[plan]).toBeGreaterThan(0)
    }
  })
})
