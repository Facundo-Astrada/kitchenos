// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { createClient } from '@/lib/supabase/client'
import { createMockSupabaseClient } from '@/lib/test-utils/mockSupabase'
import { useTareas } from './useTareas'
import type { Tarea } from '@/types'

vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))
vi.mock('./useRestauranteId', () => ({ useRestauranteId: () => 'rest-1' }))
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ perfil: { rol: 'admin', miembro_id: 'miembro-1' }, user: { id: 'user-1' } }),
}))

// Cache de SWR nueva por test — sin esto, la key `tareas-rest-1` quedaría
// compartida entre tests del mismo archivo (SWR usa un Map a nivel de módulo
// por defecto) y el segundo test vería datos del primero.
function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(SWRConfig, { value: { provider: () => new Map() } }, children)
}

const TAREA_BASE: Omit<Tarea, 'id' | 'restaurante_id' | 'created_at' | 'completed_at' | 'titulo'> = {
  categoria: 'produccion', modo: 'carta', turno_fecha: '2026-08-20',
  estado: 'pendiente', status: 'pendiente', prioridad: 'media',
  checklist: [], parent_id: null, menu_id: null, checklist_item_id: null,
  descripcion: null, plaza: 'parrilla', seccion: null,
  asignado_a: null, creado_por: null, fecha_limite: null, tiempo_estimado_min: null,
}

describe('useTareas', () => {
  let mock: ReturnType<typeof createMockSupabaseClient>

  beforeEach(() => {
    mock = createMockSupabaseClient()
    vi.mocked(createClient).mockReturnValue(mock.client as unknown as ReturnType<typeof createClient>)
  })

  it('trae la lista de tareas del restaurante', async () => {
    mock.setResponse('tareas', {
      data: [{ id: 't1', titulo: 'Papas Fritas', created_at: '2026-08-20T10:00:00Z', ...TAREA_BASE }],
      error: null,
    })

    const { result } = renderHook(() => useTareas(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.tareas).toHaveLength(1)
    expect(result.current.tareas[0].titulo).toBe('Papas Fritas')
  })

  it('soloEscritura no baja la lista (el Pase/Calendario solo escriben)', async () => {
    mock.setResponse('tareas', { data: [{ id: 't1', titulo: 'X', created_at: '', ...TAREA_BASE }], error: null })

    const { result } = renderHook(() => useTareas({ soloEscritura: true }), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.tareas).toEqual([])
    // Ninguna llamada .select sobre 'tareas' — solo se armó el builder si hizo falta escribir.
    expect(mock.calls.some(c => c.table === 'tareas' && c.method === 'select')).toBe(false)
  })

  it('agregarTarea no duplica: una preparación con la misma clave devuelve la fila existente', async () => {
    mock.setResponse('tareas', {
      data: [{ id: 'existing-1', titulo: 'Papas Fritas', created_at: '2026-08-20T10:00:00Z', ...TAREA_BASE }],
      error: null,
    })

    const { result } = renderHook(() => useTareas(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tareas).toHaveLength(1)

    // Mismo turno_fecha + modo + plaza + título (con distinta capitalización,
    // claveTarea normaliza) — misma "columna del board", debe fusionarse.
    const id = await result.current.agregarTarea({
      titulo: 'papas fritas', ...TAREA_BASE,
    })

    expect(id).toBe('existing-1')
    expect(mock.calls.some(c => c.table === 'tareas' && c.method === 'insert')).toBe(false)
  })

  it('agregarTarea inserta cuando no hay ninguna fila con esa clave', async () => {
    mock.setResponse('tareas', { data: [], error: null })

    const { result } = renderHook(() => useTareas(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tareas).toHaveLength(0)

    // insertarTarea hace .insert(...).select('id').single() — se setea aparte
    // de la lectura de la lista ('tareas:insert' vs 'tareas'), porque
    // insertarTarea dispara mutate() al final y SWR revalida la lista con la
    // MISMA tabla: si compartieran respuesta, la revalidación intentaría
    // leer .map() sobre el objeto {id: ...} y rompería.
    mock.setResponse('tareas:insert', { data: { id: 'nueva-1' }, error: null })

    const id = await result.current.agregarTarea({ titulo: 'Milanesas', ...TAREA_BASE })

    expect(id).toBe('nueva-1')
    expect(mock.calls.some(c => c.table === 'tareas' && c.method === 'insert')).toBe(true)
  })
})
