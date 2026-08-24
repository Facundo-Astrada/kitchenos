import { describe, it, expect } from 'vitest'
import {
  MODULO_HOME_LEGACY,
  resolverModulosEfectivos,
  listaIncluyeModulo,
  puedeVerModulo,
} from './resolver'

describe('resolverModulosEfectivos', () => {
  it('combina los permisos del puesto con los módulos extra del miembro', () => {
    expect(resolverModulosEfectivos({
      permisosApp: ['home', 'operaciones', 'recetario'],
      modulosExtra: ['stock'],
    })).toEqual(['home', 'operaciones', 'recetario', 'stock'])
  })

  it('quita los módulos restringidos, incluso si vienen del puesto', () => {
    expect(resolverModulosEfectivos({
      permisosApp: ['home', 'operaciones', 'reportes'],
      modulosRestringidos: ['reportes'],
    })).toEqual(['home', 'operaciones'])
  })

  it('no duplica un módulo que está en el puesto y en los extra', () => {
    expect(resolverModulosEfectivos({
      permisosApp: ['home', 'stock'],
      modulosExtra: ['stock'],
    })).toEqual(['home', 'stock'])
  })

  // El bug: `puestos.permisos_app` es NOT NULL DEFAULT '{}', y [] es truthy.
  // Tratarlo como lista válida dejaba al usuario con CERO módulos.
  it('devuelve null (no []) cuando el puesto no tiene permisos cargados', () => {
    expect(resolverModulosEfectivos({ permisosApp: [] })).toBeNull()
  })

  it('devuelve null cuando el puesto no existe', () => {
    expect(resolverModulosEfectivos({ permisosApp: null })).toBeNull()
    expect(resolverModulosEfectivos({ permisosApp: undefined })).toBeNull()
  })

  it('un puesto vacío con módulos extra sigue siendo null — el extra no lo configura', () => {
    expect(resolverModulosEfectivos({ permisosApp: [], modulosExtra: ['stock'] })).toBeNull()
  })
})

describe('listaIncluyeModulo — alias legacy inicio/home', () => {
  it("acepta 'inicio' como alias de 'home'", () => {
    expect(listaIncluyeModulo([MODULO_HOME_LEGACY, 'tareas'], 'home')).toBe(true)
  })

  it("'home' sigue matcheando de forma directa", () => {
    expect(listaIncluyeModulo(['home', 'tareas'], 'home')).toBe(true)
  })

  it('el alias NO se aplica a otros módulos', () => {
    expect(listaIncluyeModulo([MODULO_HOME_LEGACY], 'operaciones')).toBe(false)
    expect(listaIncluyeModulo(['stock'], 'recetario')).toBe(false)
  })
})

describe('puedeVerModulo — cascada admin → puesto → rol', () => {
  it('el admin ve todo sin mirar ninguna lista', () => {
    const permisos = { isAdmin: true, modulosEfectivos: [], modulosVisibles: [] }
    expect(puedeVerModulo(permisos, 'home')).toBe(true)
    expect(puedeVerModulo(permisos, 'configuracion')).toBe(true)
  })

  it('con puesto configurado, el puesto gana sobre el fallback por rol', () => {
    expect(puedeVerModulo({
      isAdmin: false,
      modulosEfectivos: ['home', 'operaciones'],
      modulosVisibles: ['home', 'operaciones', 'reportes'],
    }, 'reportes')).toBe(false)
  })

  it('sin puesto, cae al fallback de rol_permisos', () => {
    expect(puedeVerModulo({
      isAdmin: false,
      modulosEfectivos: null,
      modulosVisibles: ['home', 'operaciones'],
    }, 'operaciones')).toBe(true)
  })

  it('sin puesto y sin fila de rol_permisos, no ve nada', () => {
    expect(puedeVerModulo({
      isAdmin: false, modulosEfectivos: null, modulosVisibles: null,
    }, 'home')).toBe(false)
  })
})

// El caso que originó todo esto (PLAN-ACCESO-Y-USO-2026-08 · B1).
// Valentino, cocinero de Bros: invitado, con puesto asignado, sin poder entrar
// al dashboard. Dos defectos apilados que solo se veían combinados.
describe('regresión — cocinero recién invitado entra al dashboard', () => {
  const PUESTO_COCINERO = ['home', 'operaciones', 'recetario', 'stock', 'pase', 'carta']
  // Cómo estaba la fila de rol_permisos de Bros antes de la migración.
  const FALLBACK_ROTO = ['inicio', 'tareas', 'recetario', 'stock', 'checklist', 'pase', 'produccion']

  it('con el vínculo auth_user_id sano, resuelve por el puesto y ve home y OPS', () => {
    const modulosEfectivos = resolverModulosEfectivos({ permisosApp: PUESTO_COCINERO })
    const permisos = { isAdmin: false, modulosEfectivos, modulosVisibles: FALLBACK_ROTO }

    expect(puedeVerModulo(permisos, 'home')).toBe(true)
    expect(puedeVerModulo(permisos, 'operaciones')).toBe(true)
  })

  // Sin el vínculo (auth_user_id NULL) no hay puesto que resolver y se cae al
  // fallback. Antes esto era "Sin acceso a home": el fallback decía 'inicio'.
  it('sin vínculo al puesto, el alias legacy igual lo deja entrar a home', () => {
    const permisos = { isAdmin: false, modulosEfectivos: null, modulosVisibles: FALLBACK_ROTO }
    expect(puedeVerModulo(permisos, 'home')).toBe(true)
  })

  it('el fallback ya migrado incluye operaciones, que antes no estaba en ninguna fila', () => {
    const FALLBACK_MIGRADO = ['home', 'tareas', 'recetario', 'stock', 'checklist', 'pase', 'produccion', 'operaciones']
    const permisos = { isAdmin: false, modulosEfectivos: null, modulosVisibles: FALLBACK_MIGRADO }

    expect(puedeVerModulo(permisos, 'home')).toBe(true)
    expect(puedeVerModulo(permisos, 'operaciones')).toBe(true)
  })

  // El puesto "Dueño / Dirección" de Bros tenía permisos_app = []. Su ocupante
  // era admin y el atajo por rol lo salvaba; cualquier no-admin habría quedado
  // sin un solo módulo visible.
  it('un puesto sin permisos cargados degrada al rol, no deja al usuario en cero', () => {
    const modulosEfectivos = resolverModulosEfectivos({ permisosApp: [] })
    const permisos = {
      isAdmin: false,
      modulosEfectivos,
      modulosVisibles: ['home', 'operaciones', 'recetario'],
    }

    expect(modulosEfectivos).toBeNull()
    expect(puedeVerModulo(permisos, 'home')).toBe(true)
    expect(puedeVerModulo(permisos, 'recetario')).toBe(true)
  })
})
