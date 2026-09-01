// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { createClient } from '@/lib/supabase/client'
import { createMockSupabaseClient } from '@/lib/test-utils/mockSupabase'
import { usePlan } from './usePlan'

vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))
vi.mock('./useRestauranteId', () => ({ useRestauranteId: () => 'rest-1' }))

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(SWRConfig, { value: { provider: () => new Map() } }, children)
}

describe('usePlan', () => {
  let mock: ReturnType<typeof createMockSupabaseClient>

  beforeEach(() => {
    mock = createMockSupabaseClient()
    vi.mocked(createClient).mockReturnValue(mock.client as unknown as ReturnType<typeof createClient>)
  })

  it('sin plan asignado (null), no bloquea nada — es el estado de todas las cuentas hoy', async () => {
    mock.setResponse('restaurantes', { data: { plan: null }, error: null })

    const { result } = renderHook(() => usePlan(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.plan).toBeNull()
    expect(result.current.puedeUsar('coach')).toBe(true)
    expect(result.current.puedeUsar('haccp')).toBe(true)
    expect(result.current.puedeUsar('cualquier-cosa-inventada' as never)).toBe(true)
  })

  it('plan Base no incluye modulos de Cocina ni de Control', async () => {
    mock.setResponse('restaurantes', { data: { plan: 'base' }, error: null })

    const { result } = renderHook(() => usePlan(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.puedeUsar('recetario')).toBe(true)
    expect(result.current.puedeUsar('operaciones')).toBe(false)
    expect(result.current.puedeUsar('coach')).toBe(false)
  })

  it('plan Cocina incluye Base pero no Control', async () => {
    mock.setResponse('restaurantes', { data: { plan: 'cocina' }, error: null })

    const { result } = renderHook(() => usePlan(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.puedeUsar('recetario')).toBe(true)
    expect(result.current.puedeUsar('operaciones')).toBe(true)
    expect(result.current.puedeUsar('coach')).toBe(false)
  })

  it('plan Control incluye todo', async () => {
    mock.setResponse('restaurantes', { data: { plan: 'control' }, error: null })

    const { result } = renderHook(() => usePlan(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.puedeUsar('recetario')).toBe(true)
    expect(result.current.puedeUsar('operaciones')).toBe(true)
    expect(result.current.puedeUsar('coach')).toBe(true)
  })
})
