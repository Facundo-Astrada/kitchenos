import { vi } from 'vitest'

// Mock genérico y mínimo del cliente Supabase — para tests de hooks (Testing
// Library + renderHook). No reimplementa filtros de PostgREST: cada test
// setea con setResponse() qué debe devolver una tabla o RPC, y el builder
// encadena cualquier método (.eq, .order, .in, ...) sin validar argumentos.
// El filtrado real ya lo prueban los tests de funciones puras (lib/ops,
// lib/reportes, lib/permisos/resolver.test.ts) — acá solo interesa que el
// hook llame a Supabase con la forma esperada y reaccione bien a la
// respuesta, no reimplementar la base de datos.
//
// Uso estándar en un test de hook:
//   vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))
//   ...
//   const mock = createMockSupabaseClient()
//   vi.mocked(createClient).mockReturnValue(mock.client as any)
//   mock.setResponse('tareas', { data: [...], error: null })
//
// Si la misma tabla recibe un .select() de lista Y un .insert()/.update() con
// forma distinta en el mismo test (típico: SWR revalida la lista después de
// un mutate()), setear la respuesta por operación con 'tabla:metodo'
// (ej. 'tareas:insert') — gana sobre la respuesta genérica de la tabla.

export interface MockResponse {
  data: unknown
  error: unknown
  count?: number | null
}

export interface MockCall {
  table: string
  method: string
  args: unknown[]
}

const CHAIN_METHODS = [
  'select', 'insert', 'update', 'upsert', 'delete',
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'or', 'not', 'ilike', 'like',
  'order', 'limit', 'range',
] as const

export function createMockSupabaseClient() {
  const responses = new Map<string, MockResponse>()
  const calls: MockCall[] = []

  function setResponse(tableOrRpc: string, response: Partial<MockResponse>) {
    responses.set(tableOrRpc, { data: null, error: null, ...response })
  }

  function resolved(key: string): MockResponse {
    return responses.get(key) ?? { data: null, error: null }
  }

  const WRITE_METHODS = new Set(['insert', 'update', 'upsert', 'delete'])

  function makeBuilder(table: string) {
    // any: el builder de supabase-js encadena decenas de métodos con overloads
    // distintos — tipar esto entero no aporta nada a un mock de test.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {}
    // Primer método de escritura de la cadena (insert/update/upsert/delete) —
    // determina la key 'tabla:metodo' a resolver. select/filtros no cuentan:
    // una lectura siempre resuelve por 'tabla' o 'tabla:select'.
    let writeMethod: string | null = null
    for (const m of CHAIN_METHODS) {
      builder[m] = vi.fn((...args: unknown[]) => {
        if (WRITE_METHODS.has(m) && writeMethod === null) writeMethod = m
        calls.push({ table, method: m, args })
        return builder
      })
    }
    builder.single = vi.fn(() => { calls.push({ table, method: 'single', args: [] }); return builder })
    builder.maybeSingle = vi.fn(() => { calls.push({ table, method: 'maybeSingle', args: [] }); return builder })
    // Thenable — mismo patrón que el query builder real de supabase-js:
    // `await supabase.from(x).select().eq(...)` funciona porque el builder
    // ES la promesa, no algo que la devuelve al final de la cadena.
    builder.then = (onFulfilled?: (v: MockResponse) => unknown, onRejected?: (e: unknown) => unknown) => {
      const specific = writeMethod ? `${table}:${writeMethod}` : `${table}:select`
      const res = responses.has(specific) ? responses.get(specific)! : resolved(table)
      return Promise.resolve(res).then(onFulfilled, onRejected)
    }
    return builder
  }

  function makeChannelStub() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub: any = {}
    stub.on = vi.fn(() => stub)
    stub.subscribe = vi.fn(() => stub)
    return stub
  }

  const client = {
    from: vi.fn((table: string) => makeBuilder(table)),
    channel: vi.fn(() => makeChannelStub()),
    removeChannel: vi.fn(),
    rpc: vi.fn((fn: string, args?: unknown) => {
      calls.push({ table: fn, method: 'rpc', args: [args] })
      return Promise.resolve(resolved(fn))
    }),
  }

  return { client, setResponse, calls }
}
