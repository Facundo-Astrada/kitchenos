// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { createClient } from '@/lib/supabase/client'
import { createMockSupabaseClient } from '@/lib/test-utils/mockSupabase'
import { usePermisos } from './usePermisos'

vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))
vi.mock('./useRestauranteId', () => ({ useRestauranteId: () => 'rest-1' }))
vi.mock('./useRestauranteConfig', () => ({
  useRestauranteConfig: () => ({ configuracion: {}, loading: false, mutate: vi.fn(), restauranteId: 'rest-1' }),
}))

let mockPerfil: { rol: string } = { rol: 'admin' }
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ perfil: mockPerfil, user: { id: 'user-1' } }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(SWRConfig, { value: { provider: () => new Map() } }, children)
}

const ROL_PERMISO_COCINERO = {
  id: 'rp-1', restaurante_id: 'rest-1', rol: 'cocinero',
  modulos_visibles: ['home', 'operaciones'],
  puede_editar_stock: false, puede_editar_equipo: false, puede_editar_recetas: false, puede_editar_carta: false,
  puede_eliminar: false, puede_ver_costos: false,
}

describe('usePermisos', () => {
  let mock: ReturnType<typeof createMockSupabaseClient>

  beforeEach(() => {
    mock = createMockSupabaseClient()
    vi.mocked(createClient).mockReturnValue(mock.client as unknown as ReturnType<typeof createClient>)
    mockPerfil = { rol: 'admin' }
  })

  it('admin ve todo sin mirar rol_permisos ni puesto', async () => {
    mockPerfil = { rol: 'admin' }
    mock.setResponse('rol_permisos', { data: [], error: null })

    const { result } = renderHook(() => usePermisos(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isAdmin).toBe(true)
    expect(result.current.puedeVer('cualquier-modulo-inventado')).toBe(true)
    expect(result.current.verCostos).toBe(true)
    expect(result.current.puedeEditar('stock')).toBe(true)
  })

  it('cocinero con puesto: los módulos salen de puestos.permisos_app, no del rol', async () => {
    mockPerfil = { rol: 'parrilla' } // mapea a dbRol 'cocinero', ver usePermisos.ts
    mock.setResponse('rol_permisos', { data: [ROL_PERMISO_COCINERO], error: null })
    mock.setResponse('equipo_miembros', {
      data: { puesto_id: 'puesto-1', modulos_extra: [], modulos_restringidos: [], ver_costos: null },
      error: null,
    })
    mock.setResponse('puestos', { data: [{ id: 'puesto-1', permisos_app: ['stock', 'recetario'], ver_costos: true }], error: null })

    const { result } = renderHook(() => usePermisos(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isAdmin).toBe(false)
    expect(result.current.puedeVer('stock')).toBe(true)
    expect(result.current.puedeVer('operaciones')).toBe(false) // está en rol_permisos pero NO en el puesto — el puesto manda
    expect(result.current.verCostos).toBe(true) // puestos.ver_costos, no puede_ver_costos del rol (que es false)
  })

// León en Bros: cocinero (no ve costos) que además hace las compras.
  it('con puestos extra: une los módulos y ver_costos sale de cualquiera de los puestos', async () => {
    mockPerfil = { rol: 'parrilla' }
    mock.setResponse('rol_permisos', { data: [ROL_PERMISO_COCINERO], error: null })
    mock.setResponse('equipo_miembros', {
      data: { puesto_id: 'puesto-1', puestos_extra: ['puesto-2', 'puesto-fantasma'], modulos_extra: [], modulos_restringidos: ['merma'], ver_costos: null },
      error: null,
    })
    mock.setResponse('puestos', {
      data: [
        { id: 'puesto-1', permisos_app: ['home', 'operaciones'], ver_costos: false },
        { id: 'puesto-2', permisos_app: ['pedidos', 'proveedores', 'facturas', 'merma'], ver_costos: true },
      ],
      error: null,
    })

    const { result } = renderHook(() => usePermisos(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.puedeVer('operaciones')).toBe(true)
    expect(result.current.puedeVer('pedidos')).toBe(true)
    expect(result.current.puedeVer('facturas')).toBe(true)
    expect(result.current.puedeVer('merma')).toBe(false) // modulos_restringidos le gana a todo
    expect(result.current.verCostos).toBe(true)
  })

  it('sin puesto asignado: cae al fallback de rol_permisos.modulos_visibles', async () => {
    mockPerfil = { rol: 'parrilla' }
    mock.setResponse('rol_permisos', { data: [ROL_PERMISO_COCINERO], error: null })
    mock.setResponse('equipo_miembros', {
      data: { puesto_id: null, modulos_extra: [], modulos_restringidos: [], ver_costos: null },
      error: null,
    })

    const { result } = renderHook(() => usePermisos(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.puedeVer('operaciones')).toBe(true) // viene de ROL_PERMISO_COCINERO.modulos_visibles
    expect(result.current.puedeVer('stock')).toBe(false)
    expect(result.current.verCostos).toBe(false) // puede_ver_costos del rol
  })
})
