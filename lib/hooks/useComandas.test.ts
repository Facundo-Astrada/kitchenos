// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { createClient } from '@/lib/supabase/client'
import { createMockSupabaseClient } from '@/lib/test-utils/mockSupabase'
import { useComandas } from './useComandas'
import type { Comanda } from '@/types'

vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))
vi.mock('./useRestauranteId', () => ({ useRestauranteId: () => 'rest-1' }))

const encolarBump = vi.fn()
vi.mock('@/lib/offline/bumpQueue', () => ({
  encolarBump: (...args: unknown[]) => encolarBump(...args),
  leerCola: vi.fn().mockResolvedValue([]),
  quitarDeCola: vi.fn(),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(SWRConfig, { value: { provider: () => new Map() } }, children)
}

function comandaConDosItems(estadoItem1: 'en_prep' | 'listo' | 'bumpeado'): Comanda {
  return {
    id: 'comanda-1',
    restaurante_id: 'rest-1',
    origen: 'salon',
    estado: 'en_prep',
    created_at: '2026-08-31T00:00:00Z',
    items: [
      { id: 'item-1', comanda_id: 'comanda-1', cantidad: 1, estado: estadoItem1, created_at: '2026-08-31T00:00:00Z' },
      { id: 'item-2', comanda_id: 'comanda-1', cantidad: 1, estado: 'bumpeado', created_at: '2026-08-31T00:00:00Z' },
    ],
  }
}

describe('useComandas — bump', () => {
  let mock: ReturnType<typeof createMockSupabaseClient>

  beforeEach(() => {
    mock = createMockSupabaseClient()
    encolarBump.mockClear()
    vi.mocked(createClient).mockReturnValue(mock.client as unknown as ReturnType<typeof createClient>)
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })

  it('online: bumpea el ítem pero no decide el estado de la comanda — eso lo hace el trigger de DB (Día 3)', async () => {
    mock.setResponse('comandas', { data: [comandaConDosItems('en_prep')], error: null })
    mock.setResponse('comanda_items:update', { data: null, error: null })
    mock.setResponse('eventos_cocina:insert', { data: null, error: null })

    const { result } = renderHook(() => useComandas(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await result.current.bumpearItem('item-1')

    expect(mock.calls.some(c => c.table === 'comanda_items' && c.method === 'update')).toBe(true)
    expect(mock.calls.some(c => c.table === 'eventos_cocina' && c.method === 'insert')).toBe(true)
    // Aunque este era el último ítem por bumpear, el cliente ya no calcula
    // "todosListos" ni escribe comandas.estado='lista' — el trigger
    // `trg_comanda_items_bump_actualiza_comanda` lo hace en la misma
    // transacción del UPDATE de comanda_items.
    expect(mock.calls.some(c => c.table === 'comandas' && c.method === 'update')).toBe(false)
  })

  it('online: bumpearComanda hace un solo UPDATE .in() de los ítems bumpeables, sin tocar comandas', async () => {
    mock.setResponse('comandas', { data: [comandaConDosItems('en_prep')], error: null })
    mock.setResponse('comanda_items:update', { data: null, error: null })
    mock.setResponse('eventos_cocina:insert', { data: null, error: null })

    const { result } = renderHook(() => useComandas(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await result.current.bumpearComanda('comanda-1')

    const updateCall = mock.calls.find(c => c.table === 'comanda_items' && c.method === 'in')
    expect(updateCall?.args[1]).toEqual(['item-1'])
    expect(mock.calls.some(c => c.table === 'comandas' && c.method === 'update')).toBe(false)
  })

  it('offline: si el UPDATE falla y no hay red, marca localmente "lista" y encola el bump para reenviar al reconectar', async () => {
    mock.setResponse('comandas', { data: [comandaConDosItems('en_prep')], error: null })
    mock.setResponse('comanda_items:update', { data: null, error: { message: 'network error' } })

    const { result } = renderHook(() => useComandas(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })

    await result.current.bumpearItem('item-1')

    expect(encolarBump).toHaveBeenCalledWith({ tipo: 'item', targetId: 'item-1' })
    await waitFor(() => {
      const comanda = result.current.comandas.find(c => c.id === 'comanda-1')
      expect(comanda?.estado).toBe('lista')
    })
  })

  it('offline: si todavía queda un ítem sin bumpear, el cálculo local NO adelanta la comanda a lista', async () => {
    const comandaDosPendientes: Comanda = {
      ...comandaConDosItems('en_prep'),
      items: [
        { id: 'item-1', comanda_id: 'comanda-1', cantidad: 1, estado: 'en_prep', created_at: '2026-08-31T00:00:00Z' },
        { id: 'item-2', comanda_id: 'comanda-1', cantidad: 1, estado: 'en_prep', created_at: '2026-08-31T00:00:00Z' },
      ],
    }
    mock.setResponse('comandas', { data: [comandaDosPendientes], error: null })
    mock.setResponse('comanda_items:update', { data: null, error: { message: 'network error' } })

    const { result } = renderHook(() => useComandas(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })

    await result.current.bumpearItem('item-1')

    const comanda = result.current.comandas.find(c => c.id === 'comanda-1')
    expect(comanda?.estado).toBe('en_prep')
  })
})
