import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

let vapidConfigurado = false

function asegurarVapid(): void {
  if (vapidConfigurado) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) {
    throw new Error('Faltan NEXT_PUBLIC_VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT')
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigurado = true
}

interface PushPayload {
  tipo: string
  titulo: string
  cuerpo?: string | null
  link?: string | null
}

/**
 * Manda un push a todos los dispositivos suscriptos de un usuario (admin
 * client: el llamador nunca es el destinatario, mismo motivo que el insert de
 * `notificaciones`). Best-effort — nunca tira: un fallo de push no puede
 * romper el flujo que lo dispara. Suscripción vencida (404/410) se borra sola.
 */
export async function enviarPush(
  supabaseAdmin: SupabaseClient,
  restauranteId: string,
  usuarioId: string,
  payload: PushPayload,
): Promise<{ enviados: number }> {
  try {
    asegurarVapid()
  } catch (e) {
    console.error('[enviarPush] VAPID no configurado:', e)
    return { enviados: 0 }
  }

  const { data: subs, error } = await supabaseAdmin
    .from('push_subscripciones')
    .select('id, endpoint, p256dh, auth')
    .eq('restaurante_id', restauranteId)
    .eq('usuario_id', usuarioId)

  if (error) {
    console.error('[enviarPush] Error leyendo suscripciones:', error)
    return { enviados: 0 }
  }
  if (!subs || subs.length === 0) return { enviados: 0 }

  const body = JSON.stringify(payload)
  let enviados = 0

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
        body,
      )
      enviados++
    } catch (e: unknown) {
      const statusCode = (e as { statusCode?: number })?.statusCode
      if (statusCode === 404 || statusCode === 410) {
        await supabaseAdmin.from('push_subscripciones').delete().eq('id', s.id as string)
      } else {
        console.error('[enviarPush] Error enviando a', s.endpoint, e)
      }
    }
  }))

  return { enviados }
}
