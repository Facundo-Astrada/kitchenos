import { describe, it, expect } from 'vitest'
import { mapRol } from './roles'

describe('mapRol', () => {
  it('admin/owner/compras → admin', () => {
    expect(mapRol('admin')).toBe('admin')
    expect(mapRol('owner')).toBe('admin')
    expect(mapRol('compras')).toBe('admin')
  })

  it('sous_chef/chef → chef', () => {
    expect(mapRol('sous_chef')).toBe('chef')
    expect(mapRol('chef')).toBe('chef')
  })

  it('cocinero con plaza conocida → esa plaza', () => {
    expect(mapRol('cocinero', 'parrilla')).toBe('parrilla')
    expect(mapRol('staff', 'pasteleria')).toBe('pasteleria')
  })

  it('cocinero/staff toman solo la primera plaza si hay varias separadas por coma', () => {
    expect(mapRol('cocinero', 'frios,calientes')).toBe('frios')
  })

  it('cocinero sin plaza o con plaza desconocida → fallback linea', () => {
    expect(mapRol('cocinero', null)).toBe('linea')
    expect(mapRol('cocinero', 'plaza-inexistente')).toBe('linea')
  })

  it('staff sin plaza o con plaza desconocida → fallback ayudante', () => {
    expect(mapRol('staff', null)).toBe('ayudante')
    expect(mapRol('staff', 'plaza-inexistente')).toBe('ayudante')
  })

  it('bachero → ayudante', () => {
    expect(mapRol('bachero')).toBe('ayudante')
  })

  it('rol vacío o desconocido → fallback ayudante', () => {
    expect(mapRol('')).toBe('ayudante')
  })
})
