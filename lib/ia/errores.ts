/**
 * Traduce un fallo de la API de Anthropic a algo que un cocinero pueda leer y
 * accionar.
 *
 * Por qué existe (ago 2026): la cuenta se quedó sin crédito y la API empezó a
 * devolver 400 `invalid_request_error: "Your credit balance is too low"`. En la
 * app eso salía como "no se reconoció la foto", así que el usuario reintentaba
 * con otra foto, y con otra, sin manera de enterarse de que el problema no
 * tenía nada que ver con la imagen. El reporte que llegó fue "no funciona la
 * carga de fotos por IA" — y lo que no funcionaba era la facturación.
 *
 * La regla: el mensaje tiene que decir de quién es el problema y qué hacer.
 * "Sin crédito, avisale al administrador" es accionable. "No se pudo procesar"
 * no lo es.
 */

export interface ErrorIA {
  /** Para mostrar al usuario. Español rioplatense, sin jerga de API. */
  mensaje: string
  /** Clasificación estable, para logs y para decidir si conviene reintentar. */
  tipo: 'sin_credito' | 'sin_configurar' | 'saturado' | 'archivo_invalido' | 'desconocido'
  /** true si reintentar lo mismo en un rato puede funcionar. */
  reintentable: boolean
  /** request_id de Anthropic si vino — sirve para rastrear en su dashboard. */
  requestId?: string
}

const MENSAJES: Record<ErrorIA['tipo'], string> = {
  sin_credito: 'El servicio de IA está sin crédito. Avisale al administrador — no es un problema de la foto ni del archivo.',
  sin_configurar: 'El servicio de IA no está configurado en este servidor. Avisale al administrador.',
  saturado: 'El servicio de IA está saturado en este momento. Probá de nuevo en un minuto.',
  archivo_invalido: 'No se pudo leer el archivo. Revisá que sea una imagen o un PDF y que no supere los 5 MB.',
  desconocido: 'No se pudo procesar con IA en este momento. Probá de nuevo; si sigue fallando, avisale al administrador.',
}

/** Forma de un error de la API de Anthropic, en lo que nos importa. */
interface CuerpoErrorAnthropic {
  error?: { type?: string; message?: string }
  request_id?: string
}

function parsear(cuerpo: string): CuerpoErrorAnthropic | null {
  try {
    return JSON.parse(cuerpo) as CuerpoErrorAnthropic
  } catch {
    return null
  }
}

/**
 * Clasifica la respuesta cruda de la API.
 *
 * `status` y `cuerpo` son los que devuelve el fetch. El texto del mensaje se
 * mira además del status porque el error de saldo llega como 400 genérico —
 * indistinguible por status de "mandaste un PDF corrupto".
 */
export function clasificarErrorIA(status: number, cuerpo: string): ErrorIA {
  const json = parsear(cuerpo)
  const mensajeApi = json?.error?.message ?? ''
  const requestId = json?.request_id
  const lower = mensajeApi.toLowerCase()

  const tipo: ErrorIA['tipo'] =
    lower.includes('credit balance') || lower.includes('billing') ? 'sin_credito'
    : status === 401 || status === 403 ? 'sin_configurar'
    : status === 429 || status === 529 || lower.includes('overloaded') ? 'saturado'
    : status >= 500 ? 'saturado'
    : status === 400 ? 'archivo_invalido'
    : 'desconocido'

  return {
    tipo,
    mensaje: MENSAJES[tipo],
    reintentable: tipo === 'saturado',
    ...(requestId ? { requestId } : {}),
  }
}

/** Falta `ANTHROPIC_API_KEY` — no llegamos ni a llamar a la API. */
export function errorSinApiKey(): ErrorIA {
  return { tipo: 'sin_configurar', mensaje: MENSAJES.sin_configurar, reintentable: false }
}

/**
 * El cuerpo JSON que devuelve una API route cuando la IA falla.
 *
 * `error` es el campo que la UI ya lee en todas las pantallas, así que el
 * mensaje legible viaja ahí y no hace falta tocar cada `catch`. `error_tipo`
 * y `error_request_id` van aparte para quien quiera afinar el manejo.
 */
export function respuestaErrorIA(e: ErrorIA) {
  return {
    error: e.mensaje,
    error_tipo: e.tipo,
    error_reintentable: e.reintentable,
    ...(e.requestId ? { error_request_id: e.requestId } : {}),
  }
}

/** El status HTTP con el que la route responde. 503 para lo que es del servicio. */
export function statusErrorIA(e: ErrorIA): number {
  switch (e.tipo) {
    case 'sin_credito':
    case 'sin_configurar':
      return 503 // no es culpa del request del usuario
    case 'saturado':
      return 503
    case 'archivo_invalido':
      return 400
    default:
      return 502
  }
}
