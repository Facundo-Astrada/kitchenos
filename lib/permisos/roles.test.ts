import { describe, it, expect } from 'vitest'
import { mapRol, esRolValido } from './roles'
import { MODULOS_POR_ROL } from '@/lib/constants'

describe('esRolValido', () => {
  it('acepta los roles que la app sabe dibujar', () => {
    expect(esRolValido('parrilla')).toBe(true)
    expect(esRolValido('ayudante')).toBe(true)
  })
  it('rechaza roles de la base que no son Rol de la app', () => {
    expect(esRolValido('cocinero')).toBe(false)
    expect(esRolValido('sous_chef')).toBe(false)
    expect(esRolValido('')).toBe(false)
  })
})

describe('mapRol', () => {
  it('traduce los roles de dirección', () => {
    expect(mapRol('admin')).toBe('admin')
    expect(mapRol('owner')).toBe('admin')
    expect(mapRol('compras')).toBe('admin')
    expect(mapRol('sous_chef')).toBe('chef')
  })

  it('resuelve cocinero con la plaza asignada', () => {
    expect(mapRol('cocinero', 'parrilla')).toBe('parrilla')
    expect(mapRol('cocinero', 'pasteleria')).toBe('pasteleria')
  })

  it('cocinero sin plaza cae a linea, no a un rol inexistente', () => {
    expect(mapRol('cocinero')).toBe('linea')
    expect(mapRol('cocinero', null)).toBe('linea')
  })

  it('toma la primera plaza cuando hay varias', () => {
    expect(mapRol('cocinero', 'frios, calientes')).toBe('frios')
  })

  it('staff sin plaza cae a ayudante', () => {
    expect(mapRol('staff')).toBe('ayudante')
    expect(mapRol('staff', 'pase')).toBe('pase')
  })

  // El agujero real: `equipo_miembros.rol` es TEXT libre. Antes, un rol
  // desconocido se casteaba a Rol y llegaba hasta MODULOS_POR_ROL[rol] como
  // undefined -> TypeError en el .includes() de SidebarNav.
  it('un rol desconocido cae al más restrictivo en vez de pasar crudo', () => {
    expect(mapRol('encargado_de_salon')).toBe('ayudante')
    expect(mapRol('')).toBe('ayudante')
    expect(mapRol('COCINERO')).toBe('ayudante')
  })

  it('un rol de plaza que ya es Rol válido pasa derecho', () => {
    expect(mapRol('parrilla')).toBe('parrilla')
    expect(mapRol('panaderia')).toBe('panaderia')
  })

  // La garantía que importa: pase lo que pase, el resultado siempre tiene
  // entrada en MODULOS_POR_ROL. Eso es lo que evita el crash.
  it('todo lo que devuelve mapRol tiene módulos definidos', () => {
    const crudos = [
      'admin', 'owner', 'compras', 'sous_chef', 'chef', 'cocinero', 'staff',
      'bachero', 'pasteleria', 'frios', 'pase', 'calientes', 'linea', 'ayudante',
      'inventado', '', 'null',
    ]
    for (const r of crudos) {
      expect(MODULOS_POR_ROL[mapRol(r)], `rol crudo "${r}"`).toBeDefined()
      expect(Array.isArray(MODULOS_POR_ROL[mapRol(r)])).toBe(true)
    }
  })

  it('todos los roles cargados hoy en la base mapean a algo dibujable', () => {
    // Censo real de equipo_miembros/user_restaurantes/rol_permisos (11/09/2026).
    const enLaBase = ['cocinero', 'admin', 'chef', 'ayudante', 'sous_chef',
      'pasteleria', 'compras', 'frios', 'pase', 'calientes', 'bachero',
      'staff', 'linea', 'owner']
    for (const r of enLaBase) {
      expect(MODULOS_POR_ROL[mapRol(r)]?.length, `rol "${r}"`).toBeGreaterThan(0)
    }
  })
})
