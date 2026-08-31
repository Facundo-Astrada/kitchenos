import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { pedirAClaude } from './claude'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

const PARAMS = {
  tag: 'test',
  model: 'claude-haiku-4-5-20251001',
  maxTokens: 100,
  messages: [{ role: 'user' as const, content: 'hola' }],
}

describe('pedirAClaude', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY
  const originalFetch = global.fetch

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
  })

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('sin API key devuelve error sin_configurar sin llamar a fetch', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await pedirAClaude(PARAMS)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.tipo).toBe('sin_configurar')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('éxito devuelve texto y tokens de la respuesta', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, {
      content: [{ type: 'text', text: 'hola humano' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    })) as unknown as typeof fetch

    const result = await pedirAClaude(PARAMS)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.texto).toBe('hola humano')
      expect(result.tokensEntrada).toBe(10)
      expect(result.tokensSalida).toBe(5)
      expect(result.paroPor).toBe('end_turn')
    }
  })

  it('error no reintentable (401) devuelve sin reintentar', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: { type: 'authentication_error' } }))
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await pedirAClaude(PARAMS)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.tipo).toBe('sin_configurar')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('529 (saturado) reintenta y devuelve éxito si el segundo intento funciona', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(529, { error: { type: 'overloaded_error' } }))
      .mockResolvedValueOnce(jsonResponse(200, {
        content: [{ type: 'text', text: 'ok tras reintento' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }))
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await pedirAClaude({ ...PARAMS, maxReintentos: 1 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.texto).toBe('ok tras reintento')
  }, 10_000)

  it('529 persistente agota los reintentos y devuelve error saturado', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(529, { error: { type: 'overloaded_error' } })))
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await pedirAClaude({ ...PARAMS, maxReintentos: 1 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.tipo).toBe('saturado')
      expect(result.error.reintentable).toBe(true)
    }
  }, 10_000)

  it('falla de red se clasifica igual que un error de API y no rompe', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch

    const result = await pedirAClaude({ ...PARAMS, maxReintentos: 0 })

    expect(result.ok).toBe(false)
  })
})
