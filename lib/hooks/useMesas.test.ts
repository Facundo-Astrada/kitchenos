// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { createClient } from '@/lib/supabase/client'
import { createMockSupabaseClient } from '@/lib/test-utils/mockSupabase'
import { useMesas } from './useMesas'

vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))
vi.mock('./useRestauranteId', () => ({ useRestauranteId: () => 'rest-1' }))
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ perfil: { rol: 'admin', miembro_id: 'miembro-1' }, user: { id: 'user-1' } }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(SWRConfig, { value: { provider: () => new Map() } }, children)
}

describe('useMesas — abrirCuenta', () => {
  let mock: ReturnType<typeof createMockSupabaseClient>

  beforeEach(() => {
    mock = createMockSupabaseClient()
    mock.setResponse('mesas', { data: [], error: null })
    vi.mocked(createClient).mockReturnValue(mock.client as unknown as ReturnType<typeof createClient>)
  })

  it('reusa la cuenta abierta existente sin insertar', async () => {
    mock.setResponse('cuentas:select', { data: { id: 'existing-1' }, error: null })

    const { result } = renderHook(() => useMesas(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    const id = await result.current.abrirCuenta('mesa-1')

    expect(id).toBe('existing-1')
    expect(mock.calls.some(c => c.table === 'cuentas' && c.method === 'insert')).toBe(false)
  })

  it('crea una cuenta nueva y marca la mesa ocupada cuando no hay ninguna abierta', async () => {
    mock.setResponse('cuentas:select', { data: null, error: null })
    mock.setResponse('cuentas:insert', { data: { id: 'nueva-1' }, error: null })

    const { result } = renderHook(() => useMesas(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    const id = await result.current.abrirCuenta('mesa-1')

    expect(id).toBe('nueva-1')
    expect(mock.calls.some(c => c.table === 'cuentas' && c.method === 'insert')).toBe(true)
    expect(mock.calls.some(c => c.table === 'mesas' && c.method === 'update')).toBe(true)
  })

  it('el candado UNIQUE de la DB (23505) no rompe: usa la cuenta que ganó la carrera en vez de duplicar', async () => {
    // Dos aperturas concurrentes de la misma mesa: el SELECT inicial no ve
    // nada abierta todavía (la otra apertura no terminó), el INSERT choca
    // con el índice único (migración 20260831b), y el re-SELECT posterior
    // encuentra la cuenta que sí se creó.
    mock.setResponse('cuentas:select', [
      { data: null, error: null },
      { data: { id: 'ganadora-1' }, error: null },
    ])
    mock.setResponse('cuentas:insert', {
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "cuentas_mesa_abierta_unica"' },
    })

    const { result } = renderHook(() => useMesas(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    const id = await result.current.abrirCuenta('mesa-1')

    expect(id).toBe('ganadora-1')
  })
})
