/**
 * Punto único de llamada a la API de Anthropic. Antes cada una de las 12
 * rutas que usan IA tenía su propio `fetch('https://api.anthropic.com/v1/messages', ...)`
 * copiado y pegado — con `errores.ts` ya resolviendo la clasificación pero
 * cada route reimplementando el fetch, y el campo `reintentable` de `ErrorIA`
 * sin ningún consumidor (un 429/529 transitorio fallaba directo, sin reintentar).
 *
 * `pedirAClaude` centraliza eso: arma el body, clasifica el error con
 * `clasificarErrorIA`, reintenta automáticamente solo lo que la clasificación
 * marca como `reintentable` (saturado), y loguea tokens de entrada/salida en
 * una línea por llamada — antes no había ningún registro de consumo.
 *
 * No cubre streaming ni loops agénticos de tool-use (Kitchen Coach en
 * `/api/coach` los usa) — ahí la forma de la llamada es demasiado distinta
 * como para forzarla a esta firma sin arriesgar ese flujo. Coach usa
 * `clasificarErrorIA` directo para sus propios mensajes de error.
 */

import { clasificarErrorIA, errorSinApiKey, type ErrorIA } from './errores'
import { registrarUsoIA } from './costos'

export interface AnthropicSystemBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | Array<Record<string, unknown>>
}

export interface PedirAClaudeParams {
  /** Prefijo de log, típicamente la ruta que llama (ej: '/api/facturas'). */
  tag: string
  model: string
  maxTokens: number
  messages: AnthropicMessage[]
  system?: string | AnthropicSystemBlock[]
  temperature?: number
  tools?: unknown[]
  /** Headers extra a mergear. */
  headers?: Record<string, string>
  /**
   * Esquema JSON que la respuesta DEBE cumplir (`output_config.format`). Con
   * esto el modelo no puede devolver prosa, ni envolver el JSON en backticks,
   * ni inventar un valor fuera de un `enum` — la validación la hace la API
   * antes de responder, no un `JSON.parse` optimista de este lado.
   *
   * Reemplaza el patrón de pedir "SIEMPRE respondé ÚNICAMENTE con JSON" en el
   * system prompt y después pelar ```json con regex. No lleva beta header y
   * anda en todos los modelos vigentes.
   */
  formatoJson?: Record<string, unknown>
  /** Reintentos ante error `reintentable` (saturado). Default 1. */
  maxReintentos?: number
  /**
   * Tenant al que se le imputa el consumo en `ia_uso`. Opcional para no romper
   * a los llamadores que todavía no lo pasan, pero sin esto la llamada queda
   * sin imputar y no cuenta para el tope del plan.
   */
  restauranteId?: string | null
  usuarioId?: string | null
}

export interface PedirAClaudeOk {
  ok: true
  /** Primer bloque de texto de la respuesta — vacío si el modelo solo devolvió tool_use. */
  texto: string
  contenido: Array<Record<string, unknown>>
  paroPor: string
  tokensEntrada: number
  tokensSalida: number
}

export interface PedirAClaudeError {
  ok: false
  error: ErrorIA
}

const ESPERA_BASE_MS = 1000

function esperar(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function pedirAClaude(params: PedirAClaudeParams): Promise<PedirAClaudeOk | PedirAClaudeError> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: errorSinApiKey() }

  const maxReintentos = params.maxReintentos ?? 1

  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.maxTokens,
    messages: params.messages,
  }
  if (params.system !== undefined) body.system = params.system
  // `temperature` fue removido en Sonnet 5 / Opus 5 (400 si se manda). Sigue
  // siendo válido en 4.6 y anteriores, así que se pasa solo si el llamador lo
  // pide — pero no es la palanca para forzar formato: para eso está formatoJson.
  if (params.temperature !== undefined) body.temperature = params.temperature
  if (params.tools !== undefined) body.tools = params.tools
  if (params.formatoJson !== undefined) {
    body.output_config = { format: { type: 'json_schema', schema: params.formatoJson } }
  }

  let ultimoError: ErrorIA = clasificarErrorIA(0, '')

  for (let intento = 0; intento <= maxReintentos; intento++) {
    if (intento > 0) await esperar(ESPERA_BASE_MS * intento)

    let response: Response
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          ...params.headers,
        },
        body: JSON.stringify(body),
      })
    } catch (e) {
      ultimoError = clasificarErrorIA(0, '')
      console.error(`[ia:${params.tag}] fetch falló: ${e instanceof Error ? e.message : e}`)
      if (!ultimoError.reintentable || intento === maxReintentos) return { ok: false, error: ultimoError }
      continue
    }

    if (!response.ok) {
      const cuerpo = await response.text()
      ultimoError = clasificarErrorIA(response.status, cuerpo)
      console.error(`[ia:${params.tag}] ${ultimoError.tipo}${ultimoError.requestId ? ' ' + ultimoError.requestId : ''}`)
      if (!ultimoError.reintentable || intento === maxReintentos) return { ok: false, error: ultimoError }
      continue
    }

    const data = await response.json()
    const contenido = (data.content ?? []) as Array<Record<string, unknown>>
    const texto = (contenido.find(b => b.type === 'text')?.text as string | undefined) ?? ''
    const uso = (data.usage ?? {}) as {
      input_tokens?: number
      output_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
    }
    console.log(`[ia:${params.tag}] modelo=${params.model} tokens_in=${uso.input_tokens ?? 0} tokens_out=${uso.output_tokens ?? 0}`)

    registrarUsoIA({
      tag: params.tag,
      modelo: params.model,
      restauranteId: params.restauranteId,
      usuarioId: params.usuarioId,
      tokensEntrada: uso.input_tokens ?? 0,
      tokensSalida: uso.output_tokens ?? 0,
      tokensCacheLectura: uso.cache_read_input_tokens ?? 0,
      tokensCacheEscritura: uso.cache_creation_input_tokens ?? 0,
    })

    return {
      ok: true,
      texto,
      contenido,
      paroPor: (data.stop_reason as string | undefined) ?? '',
      tokensEntrada: uso.input_tokens ?? 0,
      tokensSalida: uso.output_tokens ?? 0,
    }
  }

  return { ok: false, error: ultimoError }
}
