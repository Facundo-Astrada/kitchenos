/**
 * Señales de salud de producción.
 *
 * Motivo (01/09/2026): el realtime estuvo caído en prod por un `\n` pegado en
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` — pase, sync del mise entre dispositivos,
 * bumps del KDS, Muro y campanita muertos — y **no se detectó por ningún
 * canal**. Falla del lado del browser, con 401 en el handshake del WebSocket:
 * sin error de servidor, sin alerta, sin test. Se descubrió de casualidad.
 *
 * El agujero no era ese bug puntual (ya está arreglado, con `.trim()` de por
 * medio en `lib/supabase/env.ts`): era que no había NINGUNA señal de salud.
 * Hoy la única forma de saber que algo se rompió es que alguien lo note usando
 * la app.
 *
 * Todo lo de este archivo es puro y sin IO a propósito: el `fetch` lo hace la
 * ruta de cron y acá solo se interpreta el resultado. Así las reglas — que son
 * lo que se puede equivocar — se prueban sin red.
 */

/**
 * `roto` corta el turno: algo está caído ahora mismo.
 * `sospechoso` es mina latente: hoy no rompe porque el código se defiende,
 * pero la causa sigue ahí y cualquier camino que no pase por esa defensa la
 * vuelve a pisar. No dispara alerta, se reporta.
 */
export type EstadoChequeo = 'ok' | 'sospechoso' | 'roto'

export interface Chequeo {
  id: string
  titulo: string
  estado: EstadoChequeo
  detalle: string
}

/** Prefijos de las claves nuevas de Supabase (ver CLAUDE.md § Claves). */
const PREFIJO_PUBLICA = 'sb_publishable_'
const PREFIJO_SECRETA = 'sb_secret_'

/**
 * Una clave de Supabase, revisada por los tres modos en que ya falló o puede
 * fallar de forma invisible.
 *
 * @param valor el valor CRUDO de la env var, sin pasar por `envSupabase()` —
 *   el punto de este chequeo es justamente ver la suciedad que ese helper tapa.
 */
export function revisarClave(
  nombre: string,
  valor: string | undefined,
  tipo: 'publica' | 'secreta',
): Chequeo {
  const id = `clave-${tipo}`
  const titulo = `Clave ${nombre}`

  if (!valor) {
    return { id, titulo, estado: 'roto', detalle: `Falta ${nombre}. La app no puede hablar con Supabase.` }
  }

  const limpio = valor.trim()
  const propio = tipo === 'publica' ? PREFIJO_PUBLICA : PREFIJO_SECRETA
  const ajeno = tipo === 'publica' ? PREFIJO_SECRETA : PREFIJO_PUBLICA

  // Claves cruzadas: Supabase bloquea con "Forbidden use of secret API key in
  // browser". Es fatal y silencioso hasta que alguien abre la app.
  if (limpio.startsWith(ajeno)) {
    return {
      id, titulo, estado: 'roto',
      detalle: `${nombre} tiene una clave ${tipo === 'publica' ? 'secreta' : 'pública'} (${ajeno}…). Están cruzadas.`,
    }
  }

  // El bug del 01/09. Hoy `envSupabase()` hace `.trim()` y lo vuelve inofensivo,
  // así que no es alerta — pero la variable sigue sucia en el dashboard y
  // cualquier lectura que no pase por el helper reintroduce el bug.
  if (valor !== limpio) {
    return {
      id, titulo, estado: 'sospechoso',
      detalle: `${nombre} tiene espacios o saltos de línea alrededor. El .trim() de lib/supabase/env.ts la salva, pero limpiala en el dashboard de Vercel: fue la causa del realtime caído del 01/09.`,
    }
  }

  if (!limpio.startsWith(propio)) {
    return {
      id, titulo, estado: 'sospechoso',
      detalle: `${nombre} no arranca con ${propio}. Puede ser una clave vieja (JWT) — funciona, pero no es la esperada.`,
    }
  }

  return { id, titulo, estado: 'ok', detalle: 'Formato correcto y sin espacios.' }
}

/**
 * El handshake del realtime, leído desde un GET común.
 *
 * Verificado contra el proyecto real: pegarle a `/realtime/v1/websocket` sin
 * hacer upgrade a WebSocket devuelve **500** cuando la `apikey` es válida (la
 * auth pasó y falla después, al no haber upgrade) y **401** cuando no lo es.
 * Esa diferencia es todo lo que hace falta: un 401 acá es exactamente lo que
 * el browser recibía el 01/09, y se detecta con un fetch pelado, sin abrir un
 * WebSocket ni depender de la librería de realtime.
 */
export function interpretarRealtime(status: number): Chequeo {
  const id = 'realtime'
  const titulo = 'Handshake del realtime'

  if (status === 401 || status === 403) {
    return {
      id, titulo, estado: 'roto',
      detalle: `El realtime rechaza la clave (HTTP ${status}). Pase, sync del mise, bumps del KDS, Muro y campanita están muertos aunque el resto de la app ande.`,
    }
  }
  return { id, titulo, estado: 'ok', detalle: `La clave es aceptada por el realtime (HTTP ${status}).` }
}

/** La base contesta, y contesta lo que se le pide. */
export function interpretarBase(error: string | null): Chequeo {
  const id = 'base'
  const titulo = 'Base de datos'
  if (error) {
    return { id, titulo, estado: 'roto', detalle: `La base no responde: ${error}` }
  }
  return { id, titulo, estado: 'ok', detalle: 'Responde y devuelve datos.' }
}

export interface Salud {
  ok: boolean
  /** 200 si nada está roto; 503 si algo lo está — ver la ruta de cron. */
  httpStatus: 200 | 503
  resumen: string
  rotos: Chequeo[]
  sospechosos: Chequeo[]
  chequeos: Chequeo[]
}

export function resumirSalud(chequeos: Chequeo[]): Salud {
  const rotos = chequeos.filter(c => c.estado === 'roto')
  const sospechosos = chequeos.filter(c => c.estado === 'sospechoso')

  const resumen = rotos.length > 0
    ? `${rotos.length} ${rotos.length === 1 ? 'señal rota' : 'señales rotas'}: ${rotos.map(c => c.titulo).join(', ')}`
    : sospechosos.length > 0
      ? `Todo en pie, con ${sospechosos.length} ${sospechosos.length === 1 ? 'aviso' : 'avisos'} para revisar sin apuro`
      : 'Todo en pie'

  return {
    ok: rotos.length === 0,
    httpStatus: rotos.length === 0 ? 200 : 503,
    resumen,
    rotos,
    sospechosos,
    chequeos,
  }
}
