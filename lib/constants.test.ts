import { describe, it, expect } from 'vitest'
import {
  AREA_CATALOGO, MODULO_CONFIG, areaDuenaDeModulo, areasQueUsanModulo,
  type ModuloId,
} from './constants'

const TODOS = Object.keys(MODULO_CONFIG) as ModuloId[]

/**
 * El invariante que sostiene toda la ruta de implantación
 * (`PLAN-IMPLANTACION-2026-09.md`): cada módulo tiene **exactamente un** área
 * dueña, porque un aviso que sale a dos personas no lo atiende ninguna y uno
 * que no sale a nadie es un módulo huérfano.
 *
 * Sep 2026: `presupuesto`, `organigrama`, `tareas` y `turnos` estaban huérfanos
 * y `facturas`, `reportes`, `recetario`, `clientes` y `configuracion` estaban
 * duplicados. Este test existe para que no vuelva a pasar en silencio al agregar
 * un `ModuloId`.
 */
describe('AREA_CATALOGO — dueño único por módulo', () => {
  it('todo módulo de MODULO_CONFIG tiene un área dueña', () => {
    const huerfanos = TODOS.filter(m => !areaDuenaDeModulo(m))
    expect(huerfanos, `módulos sin área dueña: ${huerfanos.join(', ')}`).toEqual([])
  })

  it('ningún módulo es propio de más de un área', () => {
    const duplicados = TODOS.filter(
      m => AREA_CATALOGO.filter(a => a.modulos.includes(m)).length > 1,
    )
    expect(duplicados, `módulos con dos dueños: ${duplicados.join(', ')}`).toEqual([])
  })

  it('un área no puede usar un módulo que además posee', () => {
    const solapados = AREA_CATALOGO.flatMap(a =>
      (a.modulosUsa ?? []).filter(m => a.modulos.includes(m)).map(m => `${a.key}:${m}`),
    )
    expect(solapados).toEqual([])
  })

  it('todo módulo listado como usado existe y tiene dueño en otra área', () => {
    for (const area of AREA_CATALOGO) {
      for (const m of area.modulosUsa ?? []) {
        expect(TODOS, `${area.key} usa un módulo inexistente: ${m}`).toContain(m)
        const duena = areaDuenaDeModulo(m)
        expect(duena, `${m} lo usa ${area.key} pero no tiene dueño`).toBeDefined()
        expect(duena!.key).not.toBe(area.key)
      }
    }
  })

  it('areasQueUsanModulo no devuelve al área dueña', () => {
    for (const m of TODOS) {
      const duena = areaDuenaDeModulo(m)
      expect(areasQueUsanModulo(m).map(a => a.key)).not.toContain(duena?.key)
    }
  })

  it('las áreas sin módulo propio son solo las que no tienen función en la app', () => {
    // Administración es el caso deliberado: en un restaurante chico no existe y
    // Dirección la cubre, así que usa módulos pero no posee ninguno.
    const sinPropios = AREA_CATALOGO.filter(a => a.modulos.length === 0).map(a => a.key)
    expect(sinPropios.sort()).toEqual(['administracion', 'infraestructura', 'marketing'])
  })
})
