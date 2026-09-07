import { describe, it, expect } from 'vitest'
import { MODULO_CONFIG, type ModuloId } from '@/lib/constants'
import {
  responsableDeModulo, modulosDeMiembro, areasEspectadoras,
  CAPA_POR_MODULO, type CoberturaRow,
} from './responsable'

const TODOS = Object.keys(MODULO_CONFIG) as ModuloId[]

const cobertura: CoberturaRow[] = [
  { area_key: 'compras_almacen', capa: 'preparar', responsables: ['marcos'] },
  { area_key: 'direccion', capa: 'definir', responsables: ['facu', 'socia'] },
  { area_key: 'direccion', capa: 'controlar', responsables: ['facu'] },
  { area_key: 'cocina', capa: 'preparar', responsables: [] },
]

describe('CAPA_POR_MODULO', () => {
  it('cubre todos los módulos, sin sobrar ninguno', () => {
    expect(Object.keys(CAPA_POR_MODULO).sort()).toEqual([...TODOS].sort())
  })
})

describe('responsableDeModulo', () => {
  it('resuelve el módulo a su área dueña y devuelve una sola persona', () => {
    const r = responsableDeModulo('facturas', cobertura)!
    expect(r.areaKey).toBe('compras_almacen')
    expect(r.miembroId).toBe('marcos')
    expect(r.copia).toEqual([])
  })

  it('con varios responsables toma el primero y deja el resto en copia', () => {
    const r = responsableDeModulo('presupuesto', cobertura)!
    expect(r.miembroId).toBe('facu')
    expect(r.copia).toEqual(['socia'])
  })

  it('acepta una capa explícita que pisa el default del módulo', () => {
    expect(responsableDeModulo('presupuesto', cobertura)!.capa).toBe('definir')
    const alCierre = responsableDeModulo('presupuesto', cobertura, 'controlar')!
    expect(alCierre.capa).toBe('controlar')
    expect(alCierre.miembroId).toBe('facu')
  })

  it('una capa sin responsable es un hueco explícito, no un crash', () => {
    const r = responsableDeModulo('checklist', cobertura)!
    expect(r.miembroId).toBeNull()
    expect(r.motivo).toBe('sin-responsable-en-capa')
  })

  it('"ejecutar" sin responsable no es un hueco: lo hace el equipo del turno', () => {
    const r = responsableDeModulo('produccion', cobertura)!
    expect(r.miembroId).toBeNull()
    expect(r.motivo).toBe('ejecuta-el-equipo')
  })

  it('ningún módulo devuelve null — eso sería un módulo huérfano', () => {
    const huerfanos = TODOS.filter(m => responsableDeModulo(m, cobertura) === null)
    expect(huerfanos).toEqual([])
  })

  it('un módulo usado por dos áreas responde siempre por la dueña', () => {
    // `facturas` la usa Administración, pero responde Compras y almacén.
    expect(responsableDeModulo('facturas', cobertura)!.areaKey).toBe('compras_almacen')
    expect(areasEspectadoras('facturas')).toContain('Administración')
  })
})

describe('modulosDeMiembro', () => {
  it('devuelve los módulos por los que responde esa persona', () => {
    expect(modulosDeMiembro('marcos', cobertura).sort())
      .toEqual(['facturas', 'pedidos', 'proveedores', 'stock'])
  })

  it('el segundo responsable de un área también aparece', () => {
    expect(modulosDeMiembro('socia', cobertura)).toContain('presupuesto')
  })

  it('alguien sin cobertura no responde por nada', () => {
    expect(modulosDeMiembro('nadie', cobertura)).toEqual([])
  })
})
