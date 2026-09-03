/**
 * Precios de Anthropic y registro de consumo en `ia_uso`.
 *
 * Por qué acá y no en Postgres: los precios de la API cambian, y conviene que
 * vivan en un solo archivo versionado que se lee en el diff, no en un default
 * de columna que nadie vuelve a mirar.
 *
 * El registro es deliberadamente a prueba de fallos: si el insert falla, se
 * loguea y se sigue. Un problema de contabilidad nunca puede tumbar un import
 * de facturas o una respuesta del Coach.
 */

import { createAdminClient } from '@/lib/supabase/admin'

/** USD por millón de tokens. Verificado 01/09/2026. */
interface PrecioModelo {
  entrada: number
  salida: number
}

const PRECIOS: Record<string, PrecioModelo> = {
  // Sonnet 5 es más barato que el 4.6 al que reemplaza. Ojo con el orden de
  // las claves: `precioDe` matchea por prefijo, y 'claude-sonnet-4-6' no es
  // prefijo de 'claude-sonnet-5', así que no se pisan.
  'claude-sonnet-5': { entrada: 2, salida: 10 },
  'claude-sonnet-4-6': { entrada: 3, salida: 15 },
  'claude-haiku-4-5': { entrada: 1, salida: 5 },
}

/** Fallback si aparece un modelo sin precio cargado: se cobra como el más caro que usamos. */
const PRECIO_DESCONOCIDO: PrecioModelo = { entrada: 3, salida: 15 }

/**
 * Multiplicadores de prompt caching sobre el precio de entrada.
 * Leer de cache cuesta ~0,1x; escribir en cache cuesta ~1,25x.
 */
const MULT_CACHE_LECTURA = 0.1
const MULT_CACHE_ESCRITURA = 1.25

function precioDe(modelo: string): PrecioModelo {
  // Los IDs pueden venir con sufijo de fecha ('claude-haiku-4-5-20251001').
  const exacto = PRECIOS[modelo]
  if (exacto) return exacto
  const base = Object.keys(PRECIOS).find(k => modelo.startsWith(k))
  return base ? PRECIOS[base] : PRECIO_DESCONOCIDO
}

export interface ConsumoIA {
  tokensEntrada: number
  tokensSalida: number
  tokensCacheLectura?: number
  tokensCacheEscritura?: number
}

/** Costo en USD de una llamada. Exportada aparte para poder testearla sin DB. */
export function calcularCostoUsd(modelo: string, consumo: ConsumoIA): number {
  const p = precioDe(modelo)
  const porMillon = (tokens: number, precio: number) => (tokens / 1_000_000) * precio

  return (
    porMillon(consumo.tokensEntrada, p.entrada) +
    porMillon(consumo.tokensSalida, p.salida) +
    porMillon(consumo.tokensCacheLectura ?? 0, p.entrada * MULT_CACHE_LECTURA) +
    porMillon(consumo.tokensCacheEscritura ?? 0, p.entrada * MULT_CACHE_ESCRITURA)
  )
}

export interface RegistroUsoIA extends ConsumoIA {
  tag: string
  modelo: string
  restauranteId?: string | null
  usuarioId?: string | null
  ok?: boolean
}

/**
 * Asienta una llamada en `ia_uso`. No se espera (`void`) y nunca lanza:
 * el consumo es contabilidad, no parte del flujo del usuario.
 */
export function registrarUsoIA(registro: RegistroUsoIA): void {
  // El try/catch envuelve TODO, no solo el insert: `createAdminClient()` lanza
  // sincrónicamente si falta `SUPABASE_SERVICE_ROLE_KEY`, y sin esto esa excepción
  // se propaga al flujo del usuario (lo agarró `costos.test.ts`).
  try {
    const costoUsd = calcularCostoUsd(registro.modelo, registro)

    void createAdminClient()
      .from('ia_uso')
      .insert({
        restaurante_id: registro.restauranteId ?? null,
        usuario_id: registro.usuarioId ?? null,
        tag: registro.tag,
        modelo: registro.modelo,
        tokens_entrada: registro.tokensEntrada,
        tokens_salida: registro.tokensSalida,
        tokens_cache_lectura: registro.tokensCacheLectura ?? 0,
        tokens_cache_escritura: registro.tokensCacheEscritura ?? 0,
        costo_usd: costoUsd,
        ok: registro.ok ?? true,
      })
      .then(({ error }) => {
        if (error) console.error(`[ia_uso:${registro.tag}] no se pudo asentar: ${error.message}`)
      })
  } catch (e) {
    console.error(`[ia_uso:${registro.tag}] no se pudo asentar: ${e instanceof Error ? e.message : e}`)
  }
}
