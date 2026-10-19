import { describe, it, expect } from 'vitest'
import {
  armarTarjetas, filtrarTarjetas, titularDeDireccion, moverAlPrimerLugar, mapaParaCoach, normalizarBusqueda,
} from './quienResponde'
import type { Capa } from '@/lib/constants'

const m = (id: string, nombre: string, puesto_id: string | null = null, puestos_extra: string[] = []) =>
  ({ id, nombre, apellido: '', puesto_id, puestos_extra })

const miembros = [
  m('franco', 'Franco', 'dir'),
  m('leon', 'León', 'polivalente', ['compras']),
  m('zoe', 'Zoe', 'compras'),
]

const puestos = [
  { id: 'dir', nombre: 'Dueño / Dirección', area_key: 'direccion', tareas_funciones: ['Fijar el presupuesto'] },
  { id: 'compras', nombre: 'Encargado de compras', area_key: 'compras_almacen', tareas_funciones: ['Pagar a proveedores según vencimiento'] },
  { id: 'polivalente', nombre: 'Cocinero Polivalente', area_key: 'cocina', tareas_funciones: ['Mise en place general'] },
]

const area = (key: string, nombre: string, ejemplos: string, activa = true) =>
  ({ key, nombre, icon: 'x', color: '#000', ejemplos, explicacion: '', activa, responsables: [] as string[] })

const areas = [
  area('direccion', 'Dirección', 'decisiones · presupuesto'),
  area('compras_almacen', 'Compras y almacén', 'proveedores · pagos · depósito'),
  area('cocina', 'Cocina', 'producción · heladera'),
  area('salon', 'Salón', 'mozos · mesas', false),
]

const capas: Record<string, string[]> = {
  'direccion:definir': ['franco'],
  'compras_almacen:definir': ['franco'],
  'compras_almacen:preparar': ['leon', 'zoe'],
  'compras_almacen:controlar': ['leon'],
}
const capaResponsables = (a: string, c: Capa) => capas[`${a}:${c}`] ?? []

const tarjetas = armarTarjetas({ areas, puestos, miembros, capaResponsables })

describe('armarTarjetas', () => {
  it('una tarjeta por área activa, las inactivas no aparecen', () => {
    expect(tarjetas.map(t => t.area.key)).toEqual(['direccion', 'compras_almacen', 'cocina'])
  })

  it('titular = el primero de la lista; el resto son suplentes', () => {
    const compras = tarjetas.find(t => t.area.key === 'compras_almacen')!
    expect(compras.etapas.lleva.titular?.id).toBe('leon')
    expect(compras.etapas.lleva.suplentes.map(s => s.id)).toEqual(['zoe'])
    expect(compras.etapas.decide.titular?.id).toBe('franco')
    expect(compras.etapas.revisa.suplentes).toEqual([])
  })

  it('una etapa sin nadie queda con titular null', () => {
    const cocina = tarjetas.find(t => t.area.key === 'cocina')!
    expect(cocina.etapas.decide.titular).toBeNull()
  })

  it('un id de miembro que ya no existe (desactivado) se ignora', () => {
    const t = armarTarjetas({
      areas, puestos, miembros,
      capaResponsables: (a, c) => (a === 'cocina' && c === 'definir' ? ['fantasma', 'zoe'] : []),
    }).find(x => x.area.key === 'cocina')!
    expect(t.etapas.decide.titular?.id).toBe('zoe')
  })

  it('los puestos del área traen principales y "también"', () => {
    const compras = tarjetas.find(t => t.area.key === 'compras_almacen')!
    expect(compras.puestos).toHaveLength(1)
    expect(compras.puestos[0].principales.map(x => x.id)).toEqual(['zoe'])
    expect(compras.puestos[0].tambien.map(x => x.id)).toEqual(['leon'])
  })
})

describe('filtrarTarjetas', () => {
  it('sin búsqueda devuelve todo', () => {
    expect(filtrarTarjetas(tarjetas, '  ')).toHaveLength(3)
  })

  it('encuentra por palabra de ejemplo: "pagos" → Compras', () => {
    expect(filtrarTarjetas(tarjetas, 'pagos').map(t => t.area.key)).toEqual(['compras_almacen'])
  })

  it('encuentra por nombre del área, sin tildes ni mayúsculas', () => {
    expect(filtrarTarjetas(tarjetas, 'DIRECCION').map(t => t.area.key)).toEqual(['direccion'])
  })

  it('encuentra por tarea de un puesto del área', () => {
    expect(filtrarTarjetas(tarjetas, 'vencimiento').map(t => t.area.key)).toEqual(['compras_almacen'])
  })

  it('todas las palabras tienen que aparecer', () => {
    expect(filtrarTarjetas(tarjetas, 'pagos heladera')).toEqual([])
    expect(filtrarTarjetas(tarjetas, 'heladera producción').map(t => t.area.key)).toEqual(['cocina'])
  })
})

describe('titularDeDireccion', () => {
  it('el primero de Definir en Dirección', () => {
    expect(titularDeDireccion({ miembros, capaResponsables, responsablesArea: [] })?.id).toBe('franco')
  })

  it('si Dirección no cargó etapas, el responsable del área', () => {
    expect(titularDeDireccion({ miembros, capaResponsables: () => [], responsablesArea: ['zoe'] })?.id).toBe('zoe')
  })

  it('nadie cargado → null', () => {
    expect(titularDeDireccion({ miembros, capaResponsables: () => [], responsablesArea: [] })).toBeNull()
  })
})

describe('moverAlPrimerLugar', () => {
  it('pone al elegido primero y mantiene el orden del resto', () => {
    expect(moverAlPrimerLugar(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
  })
  it('si ya es el primero, no cambia nada', () => {
    expect(moverAlPrimerLugar(['a', 'b'], 'a')).toEqual(['a', 'b'])
  })
  it('un id que no está no se agrega', () => {
    expect(moverAlPrimerLugar(['a', 'b'], 'z')).toEqual(['a', 'b'])
  })
})

describe('mapaParaCoach', () => {
  it('area + quién decide / lleva / revisa', () => {
    const compras = mapaParaCoach(tarjetas).find(x => x.area === 'Compras y almacén')
    expect(compras).toEqual({ area: 'Compras y almacén', decide: 'Franco', lleva: 'León', revisa: 'León' })
  })
})

describe('normalizarBusqueda', () => {
  it('saca tildes y mayúsculas', () => {
    expect(normalizarBusqueda(' Calefón ')).toBe('calefon')
  })
})
