import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { envSupabase } from '@/lib/supabase/env'
import {
  revisarClave, interpretarRealtime, interpretarBase, resumirSalud, type Chequeo,
} from '@/lib/salud/chequeos'

export const maxDuration = 30
// Nunca cachear: el punto de esta ruta es el estado de AHORA.
export const dynamic = 'force-dynamic'

/**
 * La señal de salud de producción que no existía.
 *
 * El 01/09 el realtime estuvo caído en prod y no se detectó por ningún canal
 * (ver `lib/salud/chequeos.ts` para el detalle). Esta ruta es la respuesta a
 * eso: corre sola por cron y revisa lo que se rompe en silencio.
 *
 * **El canal de alerta es el código HTTP.** Devuelve 503 cuando algo está roto,
 * así la corrida del cron queda marcada como fallida en Vercel en vez de
 * requerir que alguien abra un dashboard — que es justamente el problema que
 * tiene `/admin` (existe, informa, pero hay que acordarse de mirarlo). Un
 * `sospechoso` NO baja el estado: se reporta en el cuerpo y no despierta a
 * nadie de madrugada.
 *
 * Se puede pegar a mano: `curl -H "Authorization: Bearer $CRON_SECRET" \
 *   https://kos-app-one.vercel.app/api/cron/health`
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const chequeos: Chequeo[] = []

  // 1 y 2. Las claves, leídas CRUDAS. El valor sin pasar por `envSupabase()` es
  // el punto: ese helper hace `.trim()` y taparía justo la suciedad que se busca.
  chequeos.push(revisarClave(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'publica',
  ))
  chequeos.push(revisarClave(
    'SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY, 'secreta',
  ))

  // 3. El handshake del realtime, con la clave tal como la usa la app (o sea,
  // ya trimeada): esto mide lo que le pasa al browser de verdad, no la hipótesis.
  try {
    const url = envSupabase('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)
    const key = envSupabase('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const r = await fetch(
      `${url}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`,
      { signal: AbortSignal.timeout(10_000), cache: 'no-store' },
    )
    chequeos.push(interpretarRealtime(r.status))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'desconocido'
    chequeos.push({
      id: 'realtime', titulo: 'Handshake del realtime', estado: 'roto',
      detalle: `No se pudo consultar el realtime: ${msg}`,
    })
  }

  // 4. Que la base conteste. Un count liviano, sin bajar filas.
  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('restaurantes')
      .select('*', { count: 'exact', head: true })
    chequeos.push(interpretarBase(error?.message ?? null))
  } catch (e) {
    chequeos.push(interpretarBase(e instanceof Error ? e.message : 'desconocido'))
  }

  const salud = resumirSalud(chequeos)
  return NextResponse.json(
    { ...salud, medidoEn: new Date().toISOString() },
    { status: salud.httpStatus },
  )
}
